/**
 * Axes at runtime (plan E3.1/E3.2 integration, ADR-008): one {@link Scale} per cartesian axis,
 * autorange from trace extremes, and the `DataTransform` that maps linear coordinates to a
 * subplot's viewport pixels. Scale implementations, autorange padding and ticks come from core's
 * scales contract (`createScale`, `autorange`); this module only wires them up.
 */
import {
  autorange,
  axisCategories,
  createScale,
  type AxisExtremes,
  type BreakMap,
  type CategoryOrder,
  type AxisType,
  type ExtremePoint,
  type FullAxis,
  type Scale,
  valueCategoryOrder,
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

/** The category lists of one axis (see {@link axisCategoryLists}). */
export interface AxisCategoryLists {
  categories?: readonly string[];
  multicategories?: readonly (readonly [string, string])[];
  /**
   * Value-based orders only: the categories in trace order (first appearance), which the runtime
   * sorts once calc has run. `categories` then holds the order to calc with first.
   */
  traceOrder?: readonly string[];
}

/**
 * The category lists of one axis from the data of its traces, through core's `axisCategories` (plan
 * E3.6): first-appearance order, then `categoryorder` / `categoryarray`; multicategory axes get
 * `[group, item]` pairs from two-row columns. Non-categorical types give `{}`.
 *
 * Value-based orders (`total descending`, …) need calc results, so they are sorted later by the
 * runtime (see `sortCategoriesByValue` in core). Until then the list is `previous` — the order the
 * axis ended with last time — when it holds exactly the same categories, so an update that doesn't
 * change the order keeps the scale (and skips the second calc); otherwise trace order.
 */
export function axisCategoryLists(
  full: Partial<Pick<FullAxis, 'categoryorder' | 'categoryarray'>>,
  type: AxisType,
  columns: Iterable<unknown>,
  previous?: readonly string[],
): AxisCategoryLists {
  if (!isCategorical(type)) return {};
  const order = full.categoryorder as CategoryOrder | undefined;
  const lists = axisCategories(
    {
      type,
      categoryorder: order,
      categoryarray: full.categoryarray as ArrayLike<unknown> | undefined,
    },
    columns,
  );
  const traceOrder = lists.categories;
  if (type !== 'category' || !traceOrder || !valueCategoryOrder(order)) return lists;
  const seed = previous && samePermutation(previous, traceOrder) ? previous : traceOrder;
  return { categories: seed, traceOrder };
}

/** Whether `a` and `b` hold the same distinct strings (in any order). */
function samePermutation(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  if (set.size !== a.length) return false;
  for (const c of b) if (!set.has(c)) return false;
  return true;
}

function sameList(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    // Multicategory pairs.
    if (!Array.isArray(x) || !Array.isArray(y) || x[0] !== y[0] || x[1] !== y[1]) return false;
  }
  return true;
}

/** A scale and the inputs it was built from, so it can be reused across updates. */
export interface ScaleState {
  readonly type: AxisType;
  readonly categories: readonly string[] | undefined;
  readonly multicategories?: readonly (readonly [string, string])[] | undefined;
  /** Range breaks (E3.8): the scale's linear space is compressed by them. */
  readonly breaks?: BreakMap | undefined;
  readonly scale: Scale;
}

/**
 * Reuse `prev` when the type, categories and range breaks are unchanged (so range and length
 * carry over and traces keep their linear coordinates), otherwise build a new scale. A new scale
 * means every trace on the axis must re-run calc.
 */
export function syncScale(
  prev: ScaleState | undefined,
  type: AxisType,
  categories: readonly string[] | undefined,
  multicategories?: readonly (readonly [string, string])[],
  breaks?: BreakMap,
): ScaleState {
  if (
    prev &&
    prev.type === type &&
    sameList(prev.categories, categories) &&
    sameList(prev.multicategories, multicategories) &&
    prev.breaks?.key === breaks?.key
  ) {
    return prev;
  }
  // A scale whose linear space changes (breaks on or off) must not keep the old linear range.
  const keepRange = prev !== undefined && prev.breaks?.key === breaks?.key;
  const scale = createScale({
    type,
    ...(prev ? { length: prev.scale.length } : {}),
    ...(keepRange ? { range: prev.scale.range } : {}),
    ...(categories ? { categories } : {}),
    ...(multicategories ? { multicategories } : {}),
    ...(breaks ? { breaks } : {}),
  });
  return { type, categories, multicategories, breaks, scale };
}

/**
 * The range to report in `fullLayout` for a linear range: linear coordinates, except on axes with
 * range breaks, whose compressed linear space means nothing outside the chart — there it is the
 * raw value (ms on date axes), still valid as a range value (`r2l` compresses it again).
 */
export function reportedRange(scale: Scale, r0: number, r1: number): [number, number] {
  const b = scale.breaks;
  return b ? [b.toRaw(r0), b.toRaw(r1)] : [r0, r1];
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
