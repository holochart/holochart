/**
 * Axis range breaks (plan E3.8): Plotly's `rangebreaks` (`set_convert.js` `maskBreaks` /
 * `locateBreaks`, the `rangebreaks` item defaults) as a **compressed linear space**.
 *
 * Every scale stays affine from linear space to pixels (the GPU draws traces from linear
 * coordinates with one affine transform per subplot). An axis with range breaks gets a linear
 * space with the breaks cut out:
 *
 * ```
 * l = raw − (total length of the breaks between the anchor, raw 0, and raw)
 * ```
 *
 * where `raw` is ms since the epoch (UTC) on date axes and the number itself on linear axes. So
 * `toLinear(0) === 0` (the anchor), a break collapses to a single linear point, and everything
 * built on linear space (traces, hover, zoom, autorange) works unchanged. Only `date` and `linear`
 * axes support breaks, and `pattern` breaks only date axes.
 *
 * The mapping is analytic, not a scan over the visible breaks: pattern breaks (`day of week`,
 * `hour`) all repeat within one UTC week, so their removal is `weeks × removedPerWeek + removal
 * within the week`; finite breaks (`bounds` without a pattern, `values` + `dvalue`) are then cut
 * out of that space as sorted gaps with prefix sums (binary search). Both directions are exact
 * for integer ms, allocation-free, and O(log n) in the number of finite breaks.
 */
import { ONEDAY, ONEHOUR, ONEWEEK } from './date-math.ts';
import { cleanNumber, createScale, dateToMs } from './scale.ts';
import type { AxisType, Scale } from './types.ts';

/** One `rangebreaks` item as given in the layout (anything; see {@link normalizeRangeBreak}). */
export interface RangeBreakInput {
  enabled?: unknown;
  /** `false` for a template-linked item without its template item: ignored. */
  visible?: unknown;
  bounds?: unknown;
  pattern?: unknown;
  values?: unknown;
  dvalue?: unknown;
}

/** A valid, enabled range break (Plotly's item defaults applied). */
export type NormalizedRangeBreak =
  /** Repeats every week (`day of week`, bounds 0–6 with Sunday = 0) or day (`hour`, 0–24). */
  | { kind: 'pattern'; pattern: 'day of week' | 'hour'; bounds: readonly [number, number] }
  /** A single span `[min, max)` of raw values (`bounds` without a pattern). */
  | { kind: 'span'; min: number; max: number }
  /** `[v, v + dvalue)` for each raw value `v` (`values` without `bounds`). */
  | { kind: 'values'; values: readonly number[]; dvalue: number };

/** Options of {@link createBreakMap} and {@link normalizeRangeBreak}. */
export interface BreakMapOptions {
  /**
   * Data value → raw number (ms on date axes). Default: `dateToMs` on date axes, `cleanNumber` on
   * linear axes.
   */
  toRaw?: (v: unknown) => number;
  /**
   * The axis' fixed range in raw units (when not autoranged): a single-span break enclosing all
   * of it is disabled, as in Plotly (otherwise nothing would be left to show).
   */
  fixedRange?: readonly [number, number];
}

/**
 * The compressed linear space of an axis with range breaks (see the module docs). Raw values are
 * ms since the epoch (UTC) on date axes and plain numbers on linear axes.
 */
export interface BreakMap {
  /** Identity of the mapping: equal keys ⇒ same mapping (the runtime reuses scales by it). */
  readonly key: string;
  /** Any enabled 'day of week' break (Plotly `_hasDayOfWeekBreaks`). */
  readonly hasDayOfWeek: boolean;
  /**
   * raw → linear (compressed); a raw value inside a break gives the break's linear point.
   * Monotone non-decreasing; `toLinear(0) === 0` (the anchor); exact for integer |raw| up to
   * ±1e14. Non-finite values pass through.
   */
  toLinear(raw: number): number;
  /**
   * linear → raw, outside breaks: a break's linear point maps to the break END (where Plotly moves
   * ticks), or with `atStart` to the break START (the last raw value before it: what the upper
   * end of a range shows). `toLinear(toRaw(l)) === l` (to float precision). Non-finite values
   * pass through.
   */
  toRaw(l: number, atStart?: boolean): number;
  /** Is raw inside a break (`min ≤ raw < max`)? */
  inBreak(raw: number): boolean;
  /**
   * Plotly's `moveOutsideBreak`: `raw` itself when it is not in a break, else the end of the
   * (merged) break containing it. Exact.
   */
  moveOutside(raw: number): number;
  /**
   * Merged, sorted breaks overlapping [lo, hi] in raw space, clipped to it (Plotly
   * `locateBreaks`). Allocates; O(weeks in the interval) with pattern breaks, which are only
   * enumerated between finite bounds.
   */
  breaksIn(lo: number, hi: number): { min: number; max: number }[];
}

const DAY_NAMES: Readonly<Record<string, number>> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Plotly's `dvalue` default: one day. */
export const RANGEBREAK_DVALUE = ONEDAY;

/** 1969-12-28T00:00Z, the Sunday starting the week of the epoch (a Thursday). */
const EPOCH_SUNDAY = -4 * ONEDAY;
const W = ONEWEEK;

/** English day name (first three letters, any case) → 0 (Sunday) … 6, else undefined. */
function dayIndex(v: unknown): number | undefined {
  return typeof v === 'string' ? DAY_NAMES[v.slice(0, 3).toLowerCase()] : undefined;
}

/** Plotly's `isNumeric` (fast-isnumeric): a finite number or a non-blank numeric string. */
function numeric(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function defaultConverter(type: AxisType): (v: unknown) => number {
  return type === 'date' ? dateToMs : cleanNumber;
}

/**
 * Apply Plotly's `rangebreaks` item defaults to one item, or `undefined` when it is disabled or
 * invalid:
 *
 * - `enabled: false` → disabled;
 * - with `bounds` (≥ 2 items): `pattern` defaults to `'day of week'` when either bound is an
 *   English day name, else `''`. `day of week` bounds must be integers in [0, 7) (names convert,
 *   `sun` = 0), `hour` bounds numbers in [0, 24]; without a pattern the bounds are data values
 *   (converted with `toRaw`, then sorted). A span enclosing all of `fixedRange` is disabled;
 * - without `bounds`: non-empty `values`, each hiding `[v, v + dvalue)` (`dvalue` default one
 *   day); unconvertible values are skipped.
 *
 * Pattern breaks only apply to date axes (they are dropped on other types), and only date and
 * linear axes have breaks at all.
 */
export function normalizeRangeBreak(
  input: RangeBreakInput,
  type: AxisType,
  options: BreakMapOptions = {},
): NormalizedRangeBreak | undefined {
  if (type !== 'date' && type !== 'linear') return undefined;
  if (typeof input !== 'object' || input === null || input.enabled === false) return undefined;
  // A template-linked item whose template break is missing (`visible: false`) is ignored.
  if (input.visible === false) return undefined;
  const toRaw = options.toRaw ?? defaultConverter(type);
  const bounds = input.bounds;
  if (Array.isArray(bounds) && bounds.length >= 2) {
    const b: unknown[] = [bounds[0], bounds[1]];
    let dflt: 'day of week' | '' = '';
    if (bounds.length === 2 && (dayIndex(b[0]) !== undefined || dayIndex(b[1]) !== undefined)) {
      dflt = 'day of week';
    }
    const p = input.pattern;
    const pattern = p === 'day of week' || p === 'hour' || p === '' ? p : dflt;
    if (pattern === 'day of week') {
      const out: number[] = [];
      for (const v of b) {
        const n = dayIndex(v) ?? numeric(v);
        if (n === undefined || !Number.isInteger(n) || n < 0 || n >= 7) return undefined;
        out.push(n);
      }
      if (type !== 'date') return undefined;
      return { kind: 'pattern', pattern, bounds: [out[0] as number, out[1] as number] };
    }
    if (pattern === 'hour') {
      const out: number[] = [];
      for (const v of b) {
        const n = numeric(v);
        if (n === undefined || n < 0 || n > 24) return undefined;
        out.push(n);
      }
      if (type !== 'date') return undefined;
      return { kind: 'pattern', pattern, bounds: [out[0] as number, out[1] as number] };
    }
    const r0 = toRaw(b[0]);
    const r1 = toRaw(b[1]);
    if (!Number.isFinite(r0) || !Number.isFinite(r1)) return undefined;
    const min = Math.min(r0, r1);
    const max = Math.max(r0, r1);
    const fr = options.fixedRange;
    if (fr !== undefined) {
      const lo = Math.min(fr[0], fr[1]);
      const hi = Math.max(fr[0], fr[1]);
      if (min < lo && max > hi) return undefined;
    }
    return { kind: 'span', min, max };
  }
  const vals = input.values;
  const isList = Array.isArray(vals) || (ArrayBuffer.isView(vals) && !(vals instanceof DataView));
  if (!isList || (vals as ArrayLike<unknown>).length === 0) return undefined;
  const list = vals as ArrayLike<unknown>;
  const values: number[] = [];
  for (let i = 0; i < list.length; i++) {
    const v = toRaw(list[i]);
    if (Number.isFinite(v)) values.push(v);
  }
  values.sort((x, y) => x - y);
  const dv = input.dvalue;
  const dvalue = typeof dv === 'number' && Number.isFinite(dv) && dv >= 0 ? dv : RANGEBREAK_DVALUE;
  return { kind: 'values', values, dvalue };
}

/**
 * Pattern intervals `[start, start + len)` (start relative to the circle's origin) as sorted,
 * merged intervals of `[0, W]`, with the origin moved by `shift` (wrapping ones are split).
 */
function mergeCircle(
  intervals: readonly (readonly [number, number])[],
  shift: number,
): [number, number][] {
  const parts: [number, number][] = [];
  for (const [start, len] of intervals) {
    const s = (((start - shift) % W) + W) % W;
    const e = s + len;
    if (e > W) {
      parts.push([s, W], [0, e - W]);
    } else parts.push([s, e]);
  }
  return mergeSorted(parts);
}

/** Sort `[min, max)` intervals and merge overlapping or touching ones (zero-length dropped). */
function mergeSorted(parts: [number, number][]): [number, number][] {
  parts.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [s, e] of parts) {
    if (!(e > s)) continue;
    const last = out[out.length - 1];
    if (last !== undefined && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Index of the last element of `sorted` that is ≤ v (-1 if none). */
function lastAtOrBelow(sorted: Float64Array, v: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((sorted[mid] as number) <= v) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Build the compressed linear space of an axis from its `rangebreaks` (see {@link BreakMap}), or
 * `undefined` when no break is enabled, the axis is neither `date` nor `linear`, or the breaks
 * would hide everything (e.g. all seven days).
 *
 * @example
 * ```ts
 * // Weekends and nights (17:00–09:00) hidden on a date axis.
 * const breaks = createBreakMap(
 *   [{ bounds: ['sat', 'mon'] }, { bounds: [17, 9], pattern: 'hour' }],
 *   'date',
 * );
 * const scale = createScale({ type: 'date', breaks, range: [...], length: 800 });
 * ```
 */
export function createBreakMap(
  breaks: readonly RangeBreakInput[] | undefined,
  type: AxisType,
  options: BreakMapOptions = {},
): BreakMap | undefined {
  if ((type !== 'date' && type !== 'linear') || !Array.isArray(breaks)) return undefined;
  const circle: [number, number][] = [];
  const spans: [number, number][] = [];
  let hasDayOfWeek = false;
  let enabled = false;
  for (const input of breaks) {
    const b = normalizeRangeBreak(input, type, options);
    if (b === undefined) continue;
    enabled = true;
    if (b.kind === 'pattern') {
      const [b0, b1] = b.bounds;
      if (b.pattern === 'day of week') {
        hasDayOfWeek = true;
        // Plotly's `locateBreaks`: [6, 1] wraps (Sat 00:00 → Mon 00:00); equal bounds hide nothing.
        const len = ((b1 < b0 ? 7 : 0) + (b1 - b0)) * ONEDAY;
        if (len > 0) circle.push([b0 * ONEDAY, len]);
      } else {
        const len = ((b1 < b0 ? 24 : 0) + (b1 - b0)) * ONEHOUR;
        if (len > 0) for (let d = 0; d < 7; d++) circle.push([d * ONEDAY + b0 * ONEHOUR, len]);
      }
    } else if (b.kind === 'span') {
      spans.push([b.min, b.max]);
    } else {
      for (const v of b.values) spans.push([v, v + b.dvalue]);
    }
  }
  if (!enabled) return undefined;

  // --- Periodic part: g(raw) = raw − (P(raw) − P(0)), P = cumulative pattern removal. ---------
  // Move the week origin to a break end, so no merged break straddles it: every interval then
  // starts after 0 and the last one ends at W at most.
  let merged = mergeCircle(circle, 0);
  let removed = 0;
  for (const [s, e] of merged) removed += e - s;
  if (removed >= W) return undefined;
  let shift = 0;
  const lastIv = merged[merged.length - 1];
  const firstIv = merged[0];
  if (lastIv !== undefined && firstIv !== undefined) {
    shift = lastIv[1] < W ? lastIv[1] : firstIv[0] === 0 ? firstIv[1] : 0;
    merged = mergeCircle(circle, shift);
  }
  const origin = EPOCH_SUNDAY + shift;
  const np = merged.length;
  const ps = new Float64Array(np);
  const pe = new Float64Array(np);
  const pc = new Float64Array(np);
  let acc = 0;
  for (let i = 0; i < np; i++) {
    const [s, e] = merged[i] as [number, number];
    ps[i] = s;
    pe[i] = e;
    pc[i] = acc;
    acc += e - s;
  }
  const R = acc;
  const K = W - R;

  /** Periodic removal from the origin week's start to `raw` (unanchored P). */
  const periodicRemoval = (raw: number): number => {
    const x = raw - origin;
    let k = Math.floor(x / W);
    let t = x - k * W;
    if (t < 0) {
      k--;
      t += W;
    } else if (t >= W) {
      k++;
      t -= W;
    }
    let rem = 0;
    for (let i = 0; i < np; i++) {
      const s = ps[i] as number;
      if (t < s) break;
      rem = (pc[i] as number) + Math.min(t, pe[i] as number) - s;
    }
    return k * R + rem;
  };
  const P0 = np === 0 ? 0 : periodicRemoval(0);
  const gOf = (raw: number): number => (np === 0 ? raw : raw - periodicRemoval(raw) + P0);
  const gInv = (c: number, atStart: boolean): number => {
    if (np === 0) return c;
    const y = c - P0 - origin;
    let k = Math.floor(y / K);
    let u = y - k * K;
    if (u < 0) {
      k--;
      u += K;
    } else if (u >= K) {
      k++;
      u -= K;
    }
    // The week's start is the end of the previous week's last break (which ends at W).
    if (atStart && u === 0) {
      k--;
      u = K;
    }
    let t = u;
    for (let i = 0; i < np; i++) {
      const q = (ps[i] as number) - (pc[i] as number);
      if (atStart ? u <= q : u < q) break;
      t = u + (pc[i] as number) + ((pe[i] as number) - (ps[i] as number));
    }
    return origin + k * W + t;
  };

  // --- Finite part: sorted raw spans; the same spans as gaps of g-space. ---------------------
  const rawSpans = mergeSorted(spans);
  const nf = rawSpans.length;
  const fa = new Float64Array(nf);
  const fb = new Float64Array(nf);
  rawSpans.forEach(([a, b], i) => {
    fa[i] = a;
    fb[i] = b;
  });
  // Each span removes (b − a) − (P(b) − P(a)) beyond the pattern breaks it overlaps.
  const gaps = mergeSorted(rawSpans.map(([a, b]): [number, number] => [gOf(a), gOf(b)]));
  const ng = gaps.length;
  const ga = new Float64Array(ng);
  const gl = new Float64Array(ng);
  const gp = new Float64Array(ng);
  /** Linear position of each gap (unanchored): strictly increasing. */
  const gk = new Float64Array(ng);
  acc = 0;
  for (let j = 0; j < ng; j++) {
    const [a, b] = gaps[j] as [number, number];
    ga[j] = a;
    gl[j] = b - a;
    gp[j] = acc;
    gk[j] = a - acc;
    acc += b - a;
  }
  const finiteRemoval = (c: number): number => {
    const j = lastAtOrBelow(ga, c);
    return j < 0 ? 0 : (gp[j] as number) + Math.min(c - (ga[j] as number), gl[j] as number);
  };
  const F0 = ng === 0 ? 0 : finiteRemoval(0);
  const hOf = (c: number): number => (ng === 0 ? c : c - finiteRemoval(c) + F0);
  const hInv = (l: number, atStart: boolean): number => {
    if (ng === 0) return l;
    const y = l - F0;
    let j = lastAtOrBelow(gk, y);
    // At a gap's own point, stay before it.
    if (atStart && j >= 0 && gk[j] === y) j--;
    return j < 0 ? y : y + (gp[j] as number) + (gl[j] as number);
  };

  /** End of the pattern or finite break containing raw (one hop), or NaN. */
  const breakEnd = (raw: number): number => {
    if (np > 0) {
      const x = raw - origin;
      let k = Math.floor(x / W);
      let t = x - k * W;
      if (t < 0) {
        k--;
        t += W;
      } else if (t >= W) {
        k++;
        t -= W;
      }
      for (let i = 0; i < np; i++) {
        if (t < (ps[i] as number)) break;
        if (t < (pe[i] as number)) return origin + k * W + (pe[i] as number);
      }
    }
    const j = lastAtOrBelow(fa, raw);
    if (j >= 0 && raw < (fb[j] as number)) return fb[j] as number;
    return NaN;
  };

  const inBreak = (raw: number): boolean => Number.isFinite(raw) && !Number.isNaN(breakEnd(raw));

  const fmt = (a: Float64Array, b: Float64Array): string => {
    const out: string[] = [];
    for (let i = 0; i < a.length; i++) out.push(`${a[i]}-${b[i]}`);
    return out.join(',');
  };
  const key = `${type};dow=${hasDayOfWeek ? 1 : 0};o=${origin};p=${fmt(ps, pe)};f=${fmt(fa, fb)}`;

  return {
    key,
    hasDayOfWeek,
    toLinear: (raw) => (Number.isFinite(raw) ? hOf(gOf(raw)) : raw),
    toRaw: (l, atStart = false) => (Number.isFinite(l) ? gInv(hInv(l, atStart), atStart) : l),
    inBreak,
    moveOutside(raw) {
      if (!Number.isFinite(raw)) return raw;
      let x = raw;
      // Each hop leaves one merged interval; pattern and finite breaks may chain.
      for (let n = 0; n <= np + nf; n++) {
        const e = breakEnd(x);
        if (Number.isNaN(e)) return x;
        x = e;
      }
      return x;
    },
    breaksIn(lo, hi) {
      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);
      if (Number.isNaN(a) || Number.isNaN(b)) return [];
      const parts: [number, number][] = [];
      if (np > 0 && Number.isFinite(a) && Number.isFinite(b)) {
        const k1 = Math.floor((b - origin) / W);
        for (let k = Math.floor((a - origin) / W) - 1; k <= k1; k++) {
          const base = origin + k * W;
          for (let i = 0; i < np; i++) {
            parts.push([base + (ps[i] as number), base + (pe[i] as number)]);
          }
        }
      }
      for (let j = 0; j < nf; j++) parts.push([fa[j] as number, fb[j] as number]);
      const clipped: [number, number][] = [];
      for (const [s, e] of mergeSorted(parts)) {
        const cs = Math.max(s, a);
        const ce = Math.min(e, b);
        if (ce > cs) clipped.push([cs, ce]);
      }
      return clipped.map(([min, max]) => ({ min, max }));
    },
  };
}

/**
 * The scale of the same type, without breaks, spanning the raw values `scale` shows (same
 * length): range `[toRaw(r0), toRaw(r1)]`, except that an upper end sitting on a break's linear
 * point maps to the break's start rather than its end (the range shows what comes before the
 * break, not the break). Ticks and labels are computed on it (Plotly works in raw space). `scale`
 * itself when it has no breaks.
 */
export function rawScale(scale: Scale): Scale {
  const breaks = scale.breaks;
  if (breaks === undefined) return scale;
  return createScale({
    type: scale.type,
    range: rawRange(breaks, scale.range),
    length: scale.length,
  });
}

/**
 * A linear range in raw values: the lower end maps to the end of a break it sits on, the upper
 * end to its start (see {@link rawScale}). Keeps the direction.
 */
export function rawRange(breaks: BreakMap, range: readonly [number, number]): [number, number] {
  const [r0, r1] = range;
  const rev = r1 < r0;
  return [breaks.toRaw(r0, rev), breaks.toRaw(r1, !rev)];
}
