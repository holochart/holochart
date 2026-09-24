/**
 * Contour levels and color domains (Plotly `contour/set_contours.js`, `contour/make_color_map.js`).
 * Pure.
 *
 * - {@link contourLevels} resolves `contours.start/end/size` — automatic (`autocontour`, from the
 *   z range and `ncontours`) or user-supplied (swapped when reversed, `size` filled in) — and lists
 *   the levels `start, start + size, …, end` exactly (each level is `start + k·size`, cleaned of
 *   float noise, never accumulated).
 * - {@link contourColorRange} is the z interval the colorscale spans for each `contours.coloring`,
 *   and {@link bandValue} the z value whose color fills the band above a level.
 */
import { autoTicks, expandRange } from '@mk7s/holochart-core';

/** Plotly draws at most this many contour levels (`empty_pathinfo.js`). */
export const MAX_CONTOUR_LEVELS = 1000;

/** Inputs of {@link contourLevels}. */
export interface ContourLevelsOptions {
  /** Data (or `zmin`/`zmax` attribute) range; only used by `autocontour`. */
  zmin: number;
  zmax: number;
  autocontour: boolean;
  /** `contours.start/end/size`; used when `autocontour` is false. */
  start?: number | undefined;
  end?: number | undefined;
  size?: number | undefined;
  /** Maximum number of levels for automatic steps (Plotly default 15; 0 means 15). */
  ncontours?: number | undefined;
}

/** Resolved contour levels. */
export interface ContourLevels {
  start: number;
  end: number;
  size: number;
  /** `start + k·size` for k = 0… up to `end` (inclusive, with a 1e-6·size tolerance). */
  levels: number[];
}

/** Digits after the decimal point in the shortest representation of `x`. */
function decimals(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const s = String(Math.abs(x));
  const e = s.indexOf('e');
  const mant = e < 0 ? s : s.slice(0, e);
  const exp = e < 0 ? 0 : Number(s.slice(e + 1));
  const dot = mant.indexOf('.');
  return Math.max(0, (dot < 0 ? 0 : mant.length - dot - 1) - exp);
}

function roundTo(v: number, digits: number): number {
  return digits > 100 || digits < 0 || !Number.isFinite(v) ? v : Number(v.toFixed(digits));
}

/**
 * Plotly's `Axes.tickFirst` on a linear dummy axis with `tick0` 0: the first multiple of `dtick`
 * at or past the start of `range` (widened by 0.01%), walking in the range's direction.
 */
function firstTick(range: readonly [number, number], dtick: number): number {
  const rev = range[1] < range[0];
  const r0 = expandRange(range)[0];
  const v = (rev ? Math.floor(r0 / dtick) : Math.ceil(r0 / dtick)) * dtick;
  return roundTo(v, decimals(dtick));
}

/** Plotly's `autoContours`: the nice (1/2/5×10ⁿ) step for about `ncontours` levels. */
function autoSize(lo: number, hi: number, ncontours: number | undefined): number {
  const dtick = autoTicks('linear', (hi - lo) / (ncontours || 15)).dtick;
  return typeof dtick === 'number' && dtick > 0 && Number.isFinite(dtick) ? dtick : 1;
}

/**
 * `start + k·size` rounded to about 12 significant digits of `size`, so levels like
 * 0.30000000000000004 come out as 0.3. Level 0 is `start` unchanged.
 */
function levelAt(start: number, size: number, k: number): number {
  if (k === 0) return start;
  const digits = 11 - Math.floor(Math.log10(Math.abs(size)));
  return roundTo(start + k * size, digits);
}

/** The levels from `start` to `end` in steps of `size` (at most {@link MAX_CONTOUR_LEVELS}). */
export function levelList(start: number, end: number, size: number): number[] {
  if (!Number.isFinite(start)) return [];
  if (!(size > 0) || !Number.isFinite(size) || !(end > start)) return [start];
  const n = Math.min(Math.floor((end - start) / size + 1e-6) + 1, MAX_CONTOUR_LEVELS);
  const out = new Array<number>(n);
  for (let k = 0; k < n; k++) out[k] = levelAt(start, size, k);
  return out;
}

/** Automatic levels (Plotly `setContours` with `autocontour`). */
function autoLevels(zmin: number, zmax: number, ncontours: number | undefined): ContourLevels {
  let lo = zmin;
  let hi = zmax;
  if (!Number.isFinite(lo) && !Number.isFinite(hi)) lo = hi = 0;
  else if (!Number.isFinite(lo)) lo = hi;
  else if (!Number.isFinite(hi)) hi = lo;
  if (lo > hi) [lo, hi] = [hi, lo];
  // A flat field gives a rough step of 0, which autoTicks turns into 1 (as in Plotly).
  const size = autoSize(lo, hi, ncontours);
  let start = firstTick([lo, hi], size);
  let end = firstTick([hi, lo], size);
  if (start === lo) start += size;
  if (end === hi) end -= size;
  // Small ncontours with both ends on ticks: keep one level midway between the crossed values.
  if (start > end) start = end = (start + end) / 2;
  return { start, end, size, levels: levelList(start, end, size) };
}

/**
 * Plotly's `setContours`: resolve `start`, `end` and `size` and list the levels. Degenerate input
 * (flat or non-finite z, missing manual `start`/`end`) never throws: it falls back to automatic
 * levels, which give a single level for flat data.
 */
export function contourLevels(opts: ContourLevelsOptions): ContourLevels {
  const { start: s0, end: e0 } = opts;
  if (
    opts.autocontour ||
    s0 === undefined ||
    e0 === undefined ||
    !Number.isFinite(s0) ||
    !Number.isFinite(e0)
  ) {
    return autoLevels(opts.zmin, opts.zmax, opts.ncontours);
  }
  const start = Math.min(s0, e0);
  const end = Math.max(s0, e0);
  let size = opts.size;
  if (size === undefined || !(size > 0) || !Number.isFinite(size)) {
    size = start === end ? 1 : autoSize(start, end, opts.ncontours);
  }
  return { start, end, size, levels: levelList(start, end, size) };
}

/** `contours.coloring`. `'none'` colors nothing; treat it like `'lines'` for a range. */
export type ContourColoring = 'fill' | 'heatmap' | 'lines' | 'none';

/**
 * The z interval the colorscale spans (Plotly `make_color_map.js`): colorscale position p maps to
 * `lo + p·(hi − lo)`.
 *
 * - `'fill'`: `[start − size/2, last + size/2]` — each band is colored at its middle.
 * - `'lines'` / `'none'`: `[start, last]` — each line is colored at its level.
 * - `'heatmap'`: `[zmin, zmax]` (the trace's color range).
 *
 * `last` is the last drawn level. A single-level `'lines'` range is widened by ±0.5 so it never
 * collapses to a point.
 */
export function contourColorRange(
  coloring: ContourColoring,
  levels: Pick<ContourLevels, 'start' | 'size' | 'levels'>,
  zmin: number,
  zmax: number,
): [number, number] {
  if (coloring === 'heatmap') return [zmin, zmax];
  const size = levels.size > 0 && Number.isFinite(levels.size) ? levels.size : 1;
  const nc = Math.max(1, levels.levels.length);
  const extra = coloring === 'fill' ? 1 : 0;
  const lo = -(extra / 2) * size + levels.start;
  const hi = (nc + extra - 1 - extra / 2) * size + levels.start;
  return hi > lo ? [lo, hi] : [lo - 0.5, hi + 0.5];
}

/**
 * The z value whose color fills the band above level `k` (between level k and k + 1):
 * `start + (k + 0.5)·size`. `k = -1` is the region below the first level (`start − size/2`), the
 * background of a filled contour.
 */
export function bandValue(levels: Pick<ContourLevels, 'start' | 'size'>, k: number): number {
  return levels.start + (k + 0.5) * levels.size;
}
