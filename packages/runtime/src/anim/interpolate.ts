/**
 * Interpolating attribute values between two chart states (plan E7.3).
 *
 * - numbers move linearly (eased progress may overshoot [0, 1] with `elastic` / `back`);
 * - CSS colors are mixed in OKLab (render's `mixColors`), alpha linearly;
 * - per-point arrays are interpolated point by point, matched by `ids` when both states have them,
 *   else by index. Points only the new state has *enter*: they appear at their new position and
 *   fade in (`opacity`) and grow (`size`) from 0; points only the old state has *exit*: they stay
 *   where they were, appended after the new points, fading out and shrinking to 0;
 * - anything else (strings, dates, categories, mismatched types) cannot interpolate and snaps.
 */
import {
  forEachAttr,
  getIn,
  getNodeAtPath,
  isPlainObject,
  toRGBA,
  type FullTrace,
  type ObjectNode,
  type RGBA,
} from '@mk7s/holochart-core';
import { mixColors } from '@mk7s/holochart-render';

/** A value at eased progress `e` (0: the old state, 1: the new one). */
export type Tween = (e: number) => unknown;

/** How entering and exiting points start and end for an attribute. */
export type PointKind = 'fade' | 'grow' | 'value';

/** Which old point each drawn point comes from, and which new point it goes to. */
export interface PointMatch {
  /** Drawn points: the new state's points, then the exiting ones. */
  readonly length: number;
  /** Old index per drawn point (`-1`: entering). */
  readonly from: Int32Array;
  /** New index per drawn point (`-1`: exiting). */
  readonly to: Int32Array;
  /** Whether any point enters or exits. */
  readonly changed: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** A plain or typed array (not a `DataView`). */
export function isArrayLike(v: unknown): v is ArrayLike<unknown> {
  return Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView));
}

function colorOf(v: unknown): RGBA | null {
  return typeof v === 'string' ? toRGBA(v) : null;
}

function formatColor(c: readonly number[]): string {
  const ch = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 255);
  const alpha = Math.round(Math.min(1, Math.max(0, c[3] ?? 1)) * 1000) / 1000;
  return `rgba(${ch(c[0] ?? 0)}, ${ch(c[1] ?? 0)}, ${ch(c[2] ?? 0)}, ${alpha})`;
}

/** Mix two colors in OKLab at `e` (clamped: colors don't overshoot). */
function mix(a: RGBA, b: RGBA, e: number, out: [number, number, number, number]): string {
  return formatColor(mixColors(a, b, Math.min(1, Math.max(0, e)), 'oklab', out));
}

/** Keep opacities in [0, 1] and sizes / widths ≥ 0 when an easing overshoots. */
function limit(kind: PointKind, v: number): number {
  if (kind === 'fade') return v < 0 ? 0 : v > 1 ? 1 : v;
  return kind === 'grow' && v < 0 ? 0 : v;
}

/** How entering / exiting points of `path` start and end. */
export function pointKind(path: string): PointKind {
  if (/(?:^|\.)opacity$/.test(path)) return 'fade';
  if (/(?:^|\.)(?:size|width)$/.test(path)) return 'grow';
  return 'value';
}

/**
 * A single value between `a` and `b`: numbers linearly, colors in OKLab; `undefined` when they
 * cannot interpolate (or are equal).
 */
export function interpolator(a: unknown, b: unknown, kind: PointKind = 'value'): Tween | undefined {
  if (Object.is(a, b)) return undefined;
  if (isNumber(a) && isNumber(b)) return (e) => limit(kind, lerp(a, b, e));
  const ca = colorOf(a);
  const cb = colorOf(b);
  if (ca && cb) {
    const out: [number, number, number, number] = [0, 0, 0, 0];
    return (e) => mix(ca, cb, e, out);
  }
  return undefined;
}

/**
 * Match the old and new points: by `ids` when both states have them (first occurrence wins), else
 * by index. New points without a match enter; old points without one exit (appended), unless
 * `exits` is false (lines and fills join every point: an exiting point would bend them).
 */
export function matchPoints(
  fromCount: number,
  toCount: number,
  fromIds?: ArrayLike<unknown>,
  toIds?: ArrayLike<unknown>,
  exits = true,
): PointMatch {
  const from: number[] = [];
  const to: number[] = [];
  const used = new Uint8Array(fromCount);
  if (fromIds && toIds) {
    const index = new Map<string, number>();
    for (let j = 0; j < fromCount && j < fromIds.length; j++) {
      const key = String(fromIds[j]);
      if (!index.has(key)) index.set(key, j);
    }
    for (let k = 0; k < toCount; k++) {
      const j = k < toIds.length ? index.get(String(toIds[k])) : undefined;
      if (j !== undefined && !used[j]) {
        used[j] = 1;
        from.push(j);
      } else from.push(-1);
      to.push(k);
    }
  } else {
    for (let k = 0; k < toCount; k++) {
      from.push(k < fromCount ? k : -1);
      to.push(k);
      if (k < fromCount) used[k] = 1;
    }
  }
  let changed = from.includes(-1);
  for (let j = 0; j < fromCount && exits; j++) {
    if (used[j]) continue;
    from.push(j);
    to.push(-1);
    changed = true;
  }
  return {
    length: from.length,
    from: Int32Array.from(from),
    to: Int32Array.from(to),
    changed,
  };
}

function at(v: unknown, i: number): unknown {
  return isArrayLike(v) ? v[i] : v;
}

/**
 * Per-point values between `a` (old state) and `b` (new state), scalars or arrays, for the drawn
 * points of `match`. Returns a tween whose value is a new array on every call, or a constant
 * array (`constant: true`) when nothing can interpolate (the new values, with the exiting points'
 * old values appended).
 */
export function pointTween(
  a: unknown,
  b: unknown,
  match: PointMatch,
  kind: PointKind,
): { tween: Tween; constant: boolean } {
  const n = match.length;
  const start: unknown[] = new Array(n);
  const end: unknown[] = new Array(n);
  let numeric = true;
  let colors = true;
  let moving = false;
  for (let k = 0; k < n; k++) {
    const j = match.from[k] as number;
    const i = match.to[k] as number;
    const bv = i >= 0 ? at(b, i) : undefined;
    const av = j >= 0 ? at(a, j) : undefined;
    // Entering points start where they will be (faded out, at size 0); exiting ones end where
    // they were.
    const s = j >= 0 ? av : kind === 'value' ? bv : 0;
    const t = i >= 0 ? bv : kind === 'value' ? av : 0;
    start[k] = s;
    end[k] = t;
    if (Object.is(s, t)) {
      if (!isNumber(t) && t !== undefined && t !== null) numeric = false;
      if (colorOf(t) === null) colors = false;
      continue;
    }
    moving = true;
    // A missing end (a gap) snaps: to the new value, or to the gap.
    if (!(isNumber(s) || s == null) || !(isNumber(t) || t == null)) numeric = false;
    if (colorOf(s) === null || colorOf(t) === null) colors = false;
  }
  if (moving && numeric) {
    const s = Float64Array.from(start, (v) => (isNumber(v) ? v : NaN));
    const t = Float64Array.from(end, (v) => (isNumber(v) ? v : NaN));
    return {
      tween: (e) => {
        const out = new Float64Array(n);
        for (let k = 0; k < n; k++) {
          const p = s[k] as number;
          const q = t[k] as number;
          out[k] = Number.isNaN(p) ? q : limit(kind, lerp(p, q, e));
        }
        return out;
      },
      constant: false,
    };
  }
  if (moving && colors) {
    const s = start.map((v) => colorOf(v) as RGBA);
    const t = end.map((v) => colorOf(v) as RGBA);
    const tmp: [number, number, number, number] = [0, 0, 0, 0];
    return {
      tween: (e) => {
        const out: string[] = new Array(n);
        for (let k = 0; k < n; k++) out[k] = mix(s[k] as RGBA, t[k] as RGBA, e, tmp);
        return out;
      },
      constant: false,
    };
  }
  // Snaps (strings, dates, categories): the new values, exiting points keeping their old ones.
  return { tween: () => end, constant: true };
}

const ANIMATABLE = new WeakMap<object, readonly string[]>();

/**
 * The attribute paths of a trace type that transitions interpolate: its module's `animatable`
 * list plus the attributes flagged `animatable` in its full schema (`schema`: the registry's
 * trace schema, common attributes such as `opacity` included). Cached per schema.
 */
export function animatablePaths(
  trace: FullTrace,
  schema: ObjectNode | undefined,
): readonly string[] {
  const module = trace._module as { readonly animatable?: readonly string[] } | undefined;
  if (!module || !schema) return [];
  let paths = ANIMATABLE.get(schema);
  if (!paths) {
    const set = new Set(module.animatable ?? []);
    forEachAttr(schema, (path, spec) => {
      if (spec.animatable === true && path.every((p) => typeof p === 'string')) {
        set.add(path.join('.'));
      }
    });
    paths = [...set];
    ANIMATABLE.set(schema, paths);
  }
  return paths;
}

/** Whether a trace attribute holds per-point values (`data_array` or `arrayOk`). */
export function perPoint(schema: ObjectNode, path: string): boolean {
  const node = getNodeAtPath(schema, path) as { valType?: unknown; arrayOk?: unknown } | undefined;
  return node?.valType === 'data_array' || node?.arrayOk === true;
}

/** Whether two values are equal for a transition (same value, or arrays with equal items). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isArrayLike(a) || !isArrayLike(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/**
 * Paths of the per-point arrays (length `count`) in an input trace, nested containers included
 * (keys starting with `_` skipped): what must grow by the exiting points.
 */
export function pointArrayPaths(input: unknown, count: number, prefix = '', out: string[] = []) {
  if (!isPlainObject(input)) return out;
  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith('_')) continue;
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (isArrayLike(value)) {
      if (value.length === count) out.push(path);
    } else if (isPlainObject(value)) pointArrayPaths(value, count, path, out);
  }
  return out;
}

/** The point count of a defaulted trace (`_length`, else its longest `x` / `y` / `ids`). */
export function pointCount(trace: FullTrace): number {
  const length = trace['_length'];
  if (typeof length === 'number') return length;
  let n = 0;
  for (const key of ['x', 'y', 'ids']) {
    const v = getIn(trace, key);
    if (isArrayLike(v)) n = Math.max(n, v.length);
  }
  return n;
}
