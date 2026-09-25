/**
 * Constraint ranges of `parcoords` axes (plan E10.10), after plotly.js' `parcoords/axisbrush.js`:
 * normalizing `constraintrange` input (one `[lo, hi]` or several), merging overlapping ranges,
 * snapping range ends to the ticks of ordinal axes (`tickvals`), and the stored form (a bare pair
 * for one range, an array of pairs otherwise). Pure; used by defaults, the brush and the view.
 */
import { isArrayLike } from '@mk7s/holochart-core';

/** A closed interval `[lo, hi]` in data units, `lo ≤ hi`. */
export type Range = readonly [number, number];

/** Plotly's `snapRatio` (overshoot past a tick, as a share of the gap) and `snapClose`. */
const SNAP_RATIO = 0.25;
const SNAP_CLOSE = 0.01;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** `constraintrange` input → sorted pairs (invalid entries dropped). */
export function parseRanges(value: unknown): Range[] {
  if (!isArrayLike(value) || value.length === 0) return [];
  const list = isArrayLike(value[0]) ? Array.from(value) : [value];
  const out: Range[] = [];
  for (const r of list) {
    if (!isArrayLike(r) || r.length < 2) continue;
    const a = r[0];
    const b = r[1];
    if (finite(a) && finite(b)) out.push(a <= b ? [a, b] : [b, a]);
  }
  return out;
}

/** Sort by start and merge ranges that overlap or touch (closed intervals, Plotly). */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const out: [number, number][] = [];
  for (const [lo, hi] of sorted) {
    const last = out[out.length - 1];
    if (last && lo <= last[1]) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

/** Whether `v` lies in one of `ranges`. */
export function inRanges(v: number, ranges: readonly Range[]): boolean {
  for (const [lo, hi] of ranges) if (v >= lo && v <= hi) return true;
  return false;
}

/**
 * Plotly's `ordinalScaleSnap`: move a range end onto the ordinal ticks `ticks` (ascending). A low
 * end (`high = false`) goes up to the next tick, or down to a tick it passed by less than 1 % of
 * the gap, then overshoots by a quarter of the gap below it (none at the first tick), so the range
 * visibly covers its ticks; a high end is the mirror image. Ends inside `staying` ranges are kept.
 */
export function snapToTicks(
  high: boolean,
  ticks: readonly number[],
  v: number,
  staying: readonly Range[] = [],
): number {
  if (ticks.length === 0 || inRanges(v, staying)) return v;
  const dir = high ? -1 : 1;
  let first = 0;
  let last = ticks.length - 1;
  if (high) [first, last] = [last, first];
  let here = ticks[first]!;
  let prev = here;
  const over = (t: number, adjacent: number): number =>
    t * (1 - SNAP_RATIO) + adjacent * SNAP_RATIO;
  for (let i = first; dir * i < dir * last; i += dir) {
    const next = ticks[i + dir]!;
    if (dir * v < dir * (here * (1 - SNAP_CLOSE) + next * SNAP_CLOSE)) return over(here, prev);
    if (dir * v < dir * next || i + dir === last) return over(next, here);
    prev = here;
    here = next;
  }
  return here;
}

/**
 * Plotly's `cleanRanges`: sorted pairs; the first only without `multiselect`, else merged; on
 * ordinal axes both ends snapped to the ticks, empty ranges dropped.
 */
export function cleanRanges(
  value: unknown,
  multiselect: boolean,
  tickvals?: readonly number[],
): Range[] {
  let ranges = parseRanges(value);
  if (!multiselect) ranges = ranges.slice(0, 1);
  else ranges = mergeRanges(ranges);
  if (tickvals && tickvals.length > 0) {
    const ticks = [...tickvals].sort((a, b) => a - b);
    ranges = ranges
      .map((r): Range => [snapToTicks(false, ticks, r[0]), snapToTicks(true, ticks, r[1])])
      .filter((r) => r[1] > r[0]);
    if (multiselect) ranges = mergeRanges(ranges);
  }
  return ranges;
}

/** The stored `constraintrange`: `undefined`, one bare `[lo, hi]`, or `[[lo, hi], …]`. */
export function storedRanges(ranges: readonly Range[]): number[] | number[][] | undefined {
  if (ranges.length === 0) return undefined;
  if (ranges.length === 1) return [ranges[0]![0], ranges[0]![1]];
  return ranges.map((r) => [r[0], r[1]]);
}

/** Finite numbers of a `tickvals` array. */
export function numericTicks(tickvals: unknown): number[] | undefined {
  if (!isArrayLike(tickvals)) return undefined;
  const out: number[] = [];
  for (let i = 0; i < tickvals.length; i++) {
    const v = tickvals[i];
    if (finite(v)) out.push(v);
  }
  return out.length > 0 ? out : undefined;
}
