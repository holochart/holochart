/**
 * Axes at runtime (plan E3.1/E3.2 integration, ADR-008): one {@link Scale} per cartesian axis,
 * autorange from trace extremes, and the `DataTransform` that maps linear coordinates to a
 * subplot's viewport pixels. Scale implementations, autorange padding and ticks come from core's
 * scales contract (`createScale`, `autorange`); this module only wires them up.
 */
import {
  autorange,
  createScale,
  type AxisExtremes,
  type AxisType,
  type ExtremePoint,
  type FullAxis,
  type Scale,
} from '@mk7s/holochart-core';
import type { DataTransform } from '@mk7s/holochart-render';

const AXIS_TYPES: ReadonlySet<string> = new Set([
  'linear',
  'log',
  'date',
  'category',
  'multicategory',
]);

/** The axis type in use: `'-'` (not yet detected, e.g. no data) behaves as `'linear'`. */
export function axisTypeOf(full: Pick<FullAxis, 'type'>): AxisType {
  return AXIS_TYPES.has(full.type) ? (full.type as AxisType) : 'linear';
}

/** Whether an axis type maps data through a category list. */
export function isCategorical(type: AxisType): boolean {
  return type === 'category' || type === 'multicategory';
}

function categoryKey(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (Array.isArray(v)) return v.map(String).join('/');
  return String(v);
}

/**
 * Append the categories of `values` to `out`, in order of first appearance (Plotly's default
 * `categoryorder: 'trace'`). `seen` makes repeated calls across traces linear overall.
 */
export function collectCategories(
  values: unknown,
  out: string[],
  seen: Set<string> = new Set(out),
): string[] {
  if (values === null || typeof values !== 'object' || !('length' in values)) return out;
  const arr = values as ArrayLike<unknown>;
  for (let i = 0; i < arr.length; i++) {
    const key = categoryKey(arr[i]);
    if (key === undefined || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function sameList(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A scale and the inputs it was built from, so it can be reused across updates. */
export interface ScaleState {
  readonly type: AxisType;
  readonly categories: readonly string[] | undefined;
  readonly scale: Scale;
}

/**
 * Reuse `prev` when the type and categories are unchanged (so range and length carry over and
 * traces keep their linear coordinates), otherwise build a new scale. A new scale means every
 * trace on the axis must re-run calc.
 */
export function syncScale(
  prev: ScaleState | undefined,
  type: AxisType,
  categories: readonly string[] | undefined,
): ScaleState {
  if (prev && prev.type === type && sameList(prev.categories, categories)) return prev;
  const scale = createScale({
    type,
    ...(prev ? { range: prev.scale.range, length: prev.scale.length } : {}),
    ...(categories ? { categories } : {}),
  });
  return { type, categories, scale };
}

/**
 * The range an axis shows, in linear coordinates. Core's `autorange` owns the rules (plan E3.2):
 * a valid fixed `range` when `autorange` is false, otherwise the tightest padded range over the
 * traces' extremes, with `rangemode`, reversed and partial autorange applied.
 */
export function resolveAxisRange(
  full: FullAxis,
  scale: Scale,
  extremes: readonly AxisExtremes[],
): [number, number] {
  return autorange(extremes, scale, full);
}

/**
 * The transform from linear coordinates to a 2D subplot viewport's world px (origin at the
 * viewport's bottom-left, ADR-008). Each axis' scale is affine in linear space (`p = l·m + b`, with
 * `p` measured from `range[0]`), so a zoom or pan is only a new transform: no buffer uploads.
 */
export function dataTransform(x: Scale, y: Scale): DataTransform {
  const ax = x.affine();
  const ay = y.affine();
  return { scaleX: ax.m, offsetX: ax.b, scaleY: ay.m, offsetY: ay.b, scaleZ: 1, offsetZ: 0 };
}

/** Whether two transforms are equal (skip redundant uniform writes). */
export function sameTransform(a: DataTransform, b: DataTransform): boolean {
  return (
    a.scaleX === b.scaleX &&
    a.scaleY === b.scaleY &&
    a.offsetX === b.offsetX &&
    a.offsetY === b.offsetY
  );
}

function padAt(pad: number | ArrayLike<number>, i: number): number {
  if (typeof pad === 'number') return pad;
  const v = pad[i];
  return v !== undefined && Number.isFinite(v) ? v : 0;
}

/**
 * Reduce one side of the candidate extremes to the points that can decide the autorange: a point
 * is dropped when another one is at least as far out *and* needs at least as much padding.
 */
function addCandidate(
  list: ExtremePoint[],
  l: number,
  padPx: number,
  isMin: boolean,
  extrapad: boolean,
): void {
  const further = (a: number, b: number): boolean => (isMin ? a <= b : a >= b);
  for (const p of list) if (further(p.l, l) && p.padPx >= padPx) return;
  let w = 0;
  for (const p of list) if (!(further(l, p.l) && padPx >= p.padPx)) list[w++] = p;
  list.length = w;
  list.push(extrapad ? { l, padPx, extrapad } : { l, padPx });
}

/**
 * Autorange extremes of *linear* coordinates (plan E3.2), for traces whose calc already linearized
 * their data: the minimum and maximum with the px padding each needs (e.g. marker radius). With
 * per-point padding only non-dominated points are kept, which stays small in practice, so autorange
 * cost does not grow with the data. Non-finite values are skipped. (Core's scales also provide a
 * data-space `findExtremes(scale, values, opts)` with Plotly's full option set.)
 *
 * @param values - Linear coordinates.
 * @param padPx - Padding for every point, or one value per point.
 * @param options.padded - Also leave Plotly's 5%-of-length padding (markers, text).
 */
export function linearExtremes(
  values: ArrayLike<number>,
  padPx: number | ArrayLike<number> = 0,
  options: { padded?: boolean } = {},
): AxisExtremes {
  const extrapad = options.padded === true;
  const min: ExtremePoint[] = [];
  const max: ExtremePoint[] = [];
  if (typeof padPx === 'number') {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      if (v < lo && v > -Infinity) lo = v;
      if (v > hi && v < Infinity) hi = v;
    }
    if (lo <= hi) {
      min.push(extrapad ? { l: lo, padPx, extrapad } : { l: lo, padPx });
      max.push(extrapad ? { l: hi, padPx, extrapad } : { l: hi, padPx });
    }
    return { min, max };
  }
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    const p = padAt(padPx, i);
    addCandidate(min, v, p, true, extrapad);
    addCandidate(max, v, p, false, extrapad);
  }
  return { min, max };
}
