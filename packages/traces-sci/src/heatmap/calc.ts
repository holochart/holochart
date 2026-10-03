/**
 * `heatmap` calc (plan E11.1), following plotly.js `heatmap/calc.js`: the input becomes one
 * row-major grid, `z[j * nx + i]` for column i (x) and row j (y) — the heatmap primitive's layout —
 * with NaN for gaps, plus the cell edges of both axes in linear coordinates. Pure.
 *
 * 1. **Grid** — 1D `z` with `x` / `y` columns is placed on the sorted distinct x and y values
 *    (`convert_column_xyz.js`); a 2D `z` is read as rows, or as columns with `transpose`
 *    (`clean_2d_array.js`: numeric strings count, anything else is a gap). On a category axis
 *    the grid spans the axis' categories, each column taken from the trace's `x` entry of that
 *    category (so shared category orders line up).
 * 2. **Edges** — `make_bound_array.js`: an `x` array with one value per column holds cell
 *    centers (edges halfway between, the outer ones extrapolated; geometric on log axes), one more
 *    holds the edges; otherwise, and always on category axes, cells are `dx` wide from `x0`.
 * 3. **Gaps** — `connectgaps` fills them with Plotly's iterative neighbour average
 *    (`find_empties.js` + `interp2d.js`, shared with the contours).
 * 4. **Smoothing** — `zsmooth: 'fast'` falls back to none on log axes and uneven grids (Plotly
 *    warns and turns it off); `'best'` works everywhere.
 *
 * 5. **Periods** — with `xperiod` (date and linear axes, as bar and scatter), the given `x` values
 *    (and column data) snap to their periods before anything else (Plotly's `alignPeriod`); hover
 *    shows the values as given (Plotly's `orig_x`).
 * 6. **Range breaks** (ADR-022) — coordinates are compressed and the cells tile the compressed
 *    axis: edges halfway between centers there, so cells beside a break keep their width (Plotly
 *    halves in real time and maps each edge piecewise, which narrows or collapses them). As
 *    Plotly's `dropZonBreaks`, columns and rows whose center falls in a break are dropped;
 *    implicit centers (`x0` + i·`dx`) step in real time, as scatter's; given edges are clamped
 *    to the breaks and cells left without width dropped.
 *
 * Calc space follows Plotly (raw values on log axes, ms on dates, indices on categories); the
 * results are linear coordinates (log10 on log axes). Deferred: `xcalendar` / `ycalendar`.
 */
import {
  alignPeriod,
  cleanNumber,
  dateToMs,
  isArrayLike,
  type AxisType,
  type CategorySamples,
  type FullTrace,
} from '@mk7s/holochart-core';
import { createHeatmapAxis, type HeatmapAxis, type HeatmapSmoothing } from '@mk7s/holochart-render';
import {
  linearExtremes,
  type AxisInfo,
  type CalcContext,
  type TraceExtremes,
} from '@mk7s/holochart-runtime';
import { fillGaps, recordZExtent } from '@mk7s/holochart-traces-stats';
import { isColumnZ } from './defaults.ts';

/** More cells than this are not drawn (a warning is logged): 16.7 M, a 4096² grid. */
export const MAX_CELLS = 4096 * 4096;

/** One axis of the grid. @experimental */
export interface HeatmapAxisCells {
  /** Cell count. */
  readonly count: number;
  /** `count + 1` cell edges, linear coordinates (strictly monotonic when drawable). */
  readonly edges: Float64Array;
  /**
   * What hover and cell labels place each cell at, linear coordinates: the given centers (`x`
   * with one value per cell), else the middle of the cell's edges (in calc space: arithmetic on
   * log axes, as Plotly), or the category index.
   */
  readonly centers: Float64Array;
  /**
   * With `xperiod`: what hover labels each cell with, the given coordinates before alignment
   * (Plotly's `orig_x`: the value, or the middle of the given edges), linear coordinates.
   */
  readonly hoverAt?: Float64Array;
  readonly type: AxisType;
}

/** heatmap calcdata. @experimental */
export interface HeatmapCalc {
  readonly x: HeatmapAxisCells;
  readonly y: HeatmapAxisCells;
  readonly nx: number;
  readonly ny: number;
  /** Cell values, row-major (`z[j * nx + i]`); NaN for gaps (after `connectgaps`). */
  readonly z: Float64Array;
  /** Finite extent of `z` (`[NaN, NaN]` without values). */
  readonly zExtent: readonly [number, number];
  /**
   * Whether `zsmooth: 'fast'` applies: not on log axes nor uneven grids (Plotly turns it off
   * there). See {@link heatmapSmoothing}.
   */
  readonly fastSmoothing: boolean;
  /**
   * Smoothing hover assumes, overriding `zsmooth` (see {@link heatmapSmoothing}): contours set
   * `'best'` so labels sit on their grid points. Heatmaps leave it unset.
   */
  readonly smoothing?: HeatmapSmoothing;
  /**
   * Column data (1D `z`): per cell, the index of the point placed there (−1 for none), for hover
   * and events. Undefined for 2D `z`, whose cells are `[row, column]`.
   */
  readonly pointOf: Int32Array | undefined;
  /**
   * 2D `z` re-indexed by the categories of an axis: the source row / column (of `z` as given,
   * after `transpose`) of each grid row / column, −1 for none. Per-cell attributes (`text`,
   * `hovertext`, `customdata`) are read there, so they follow their values. Undefined when the
   * grid is `z` itself.
   */
  readonly source?: { readonly rows: Int32Array; readonly cols: Int32Array } | undefined;
}

/**
 * `[row, column]` where per-cell attributes of grid cell `(i, j)` are read (see
 * {@link HeatmapCalc.source}).
 */
export function sourceCell(calc: HeatmapCalc, i: number, j: number): [number, number] {
  return calc.source ? [calc.source.rows[j]!, calc.source.cols[i]!] : [j, i];
}

/** Validated axes of a calc, for cell lookups (hover). Built on first use. */
const lookups = new WeakMap<HeatmapCalc, [HeatmapAxis | undefined, HeatmapAxis | undefined]>();

/** The primitive's axes of a calc's edges (undefined for undrawable edges). */
export function heatmapLookupAxes(
  calc: HeatmapCalc,
): [HeatmapAxis | undefined, HeatmapAxis | undefined] {
  let axes = lookups.get(calc);
  if (!axes) {
    axes = [createHeatmapAxis(calc.x.edges, calc.nx), createHeatmapAxis(calc.y.edges, calc.ny)];
    lookups.set(calc, axes);
  }
  return axes;
}

const EMPTY_AXIS: HeatmapAxisCells = {
  count: 0,
  edges: new Float64Array(0),
  centers: new Float64Array(0),
  type: 'linear',
};

/** An empty calc (no axes, no data, or too many cells). */
export function emptyHeatmapCalc(): HeatmapCalc {
  return {
    x: EMPTY_AXIS,
    y: EMPTY_AXIS,
    nx: 0,
    ny: 0,
    z: new Float64Array(0),
    zExtent: [NaN, NaN],
    fastSmoothing: true,
    pointOf: undefined,
  };
}

/** Plotly's `cleanZvalue`: finite numbers and numeric strings, else NaN (a gap). */
export function cleanZ(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string' || v.trim() === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Plotly's `Lib.distinctVals`: the sorted distinct finite values (values within 1e-4 of the mean
 * spacing of an earlier one count as that one), and the smallest spacing between them.
 */
export function distinctValues(values: ArrayLike<number>): { vals: number[]; minDiff: number } {
  const sorted = Array.from(values)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  const last = sorted.length - 1;
  let minDiff = sorted[last]! - sorted[0]! || 1;
  const errDiff = minDiff / (last || 1) / 10000;
  const vals: number[] = [];
  let prev: number | undefined;
  for (let i = 0; i <= last; i++) {
    const v = sorted[i]!;
    if (prev === undefined) {
      vals.push(v);
      prev = v;
    } else if (v - prev > errDiff) {
      minDiff = Math.min(minDiff, v - prev);
      vals.push(v);
      prev = v;
    }
  }
  return { vals, minDiff };
}

/** Index of the last sorted value ≤ `v` (Plotly `Lib.findBin` on ascending bins); −1 below. */
function findBin(v: number, sorted: readonly number[]): number {
  let lo = -1;
  let hi = sorted.length;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= v) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Linear → Plotly's calc space (raw values on log axes). */
function toCalc(type: AxisType, l: number): number {
  return type === 'log' ? 10 ** l : l;
}

/** Calc space → linear coordinates (log10 on log axes; NaN at or below 0). */
function toLinear(type: AxisType, c: number): number {
  if (type !== 'log') return c;
  return c > 0 ? Math.log10(c) : NaN;
}

/** Options of {@link makeBoundArray}. */
export interface BoundOptions {
  readonly type: AxisType;
  /** Coordinates in calc space (`undefined` or empty: scaled). */
  readonly values: ArrayLike<number> | undefined;
  /** `x0` in calc space (`undefined`: 0). */
  readonly v0: number | undefined;
  /** `dx` (`undefined` or 0: 1). */
  readonly dv: number | undefined;
  /** Number of cells. */
  readonly count: number;
}

/**
 * Plotly's `makeBoundArray` for a heatmap: `count + 1` cell edges in calc space. Two or more
 * values (not on category axes) are centers when there are at most `count` of them (extended by
 * the last spacing when fewer; geometric means on log axes) and edges otherwise; a single center
 * gets a cell of width 1 (×/÷ 2 on log axes... as Plotly: `[v/2, 2v]`); else cells of `dv` from
 * `v0` (or the single value).
 */
export function makeBoundArray(opts: BoundOptions): number[] {
  const { type, values, count } = opts;
  const log = type === 'log';
  const out: number[] = [];
  const len = values?.length ?? 0;
  if (values && len > 1 && type !== 'category') {
    if (len > count) return Array.from(values).slice(0, count + 1);
    const a = (i: number) => values[i]!;
    if (count === 1) return log ? [0.5 * a(0), 2 * a(0)] : [a(0) - 0.5, a(0) + 0.5];
    if (log) {
      out.push(a(0) ** 1.5 / a(1) ** 0.5);
      for (let i = 1; i < len; i++) out.push(Math.sqrt(a(i - 1) * a(i)));
      out.push(a(len - 1) ** 1.5 / a(len - 2) ** 0.5);
    } else {
      out.push(1.5 * a(0) - 0.5 * a(1));
      for (let i = 1; i < len; i++) out.push((a(i - 1) + a(i)) * 0.5);
      out.push(1.5 * a(len - 1) - 0.5 * a(len - 2));
    }
    if (len < count) {
      let last = out[out.length - 1]!;
      const prev = out[out.length - 2]!;
      const delta = log ? last / prev : last - prev;
      for (let i = len; i < count; i++) {
        last = log ? last * delta : last + delta;
        out.push(last);
      }
    }
    return out;
  }
  const v0 = values && len === 1 ? values[0]! : (opts.v0 ?? 0);
  const dv = opts.dv || 1;
  for (let i = -0.5; i < count; i++) out.push(v0 + dv * i);
  return out;
}

/**
 * Linear edges of calc-space edges; on log axes, edges at or below 0 are extrapolated one cell
 * below the first positive one, so the grid stays drawable (like histogram2d).
 */
function linearEdges(type: AxisType, calcEdges: readonly number[]): Float64Array {
  const out = Float64Array.from(calcEdges, (c) => toLinear(type, c));
  if (type !== 'log') return out;
  const first = out.findIndex(Number.isFinite);
  if (first <= 0) return out;
  const next = out[first + 1];
  const step = next !== undefined && Number.isFinite(next) ? next - out[first]! : 1;
  for (let i = first - 1; i >= 0; i--) out[i] = out[i + 1]! - step;
  return out;
}

/** Plotly's `scaleIsLinear`: steps within 1% of the mean step. */
export function isEvenlySpaced(values: ArrayLike<number>): boolean {
  const n = values.length;
  if (n < 2) return true;
  const avg = (values[n - 1]! - values[0]!) / (n - 1);
  const maxErr = Math.abs(avg / 100);
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(values[i + 1]! - values[i]! - avg) > maxErr) return false;
  }
  return true;
}

/** `x0` of a scaled coordinate in calc space (Plotly: `d2c` on log axes, `r2c` otherwise). */
function startValue(axis: AxisInfo, v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (axis.type === 'log') {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  const l = axis.scale.r2l(v);
  return Number.isFinite(l) ? l : undefined;
}

/** A source grid: `rows × cols` values read through `at` (NaN for gaps). */
interface SourceGrid {
  readonly rows: number;
  readonly cols: number;
  at(row: number, col: number): number;
  /** Column / row centers in linear coordinates (column data: the distinct values). */
  readonly xs: ArrayLike<number> | undefined;
  readonly ys: ArrayLike<number> | undefined;
  /** `xs` / `ys` before period alignment (2D `z` with a period only). */
  readonly xOrig?: ArrayLike<number> | undefined;
  readonly yOrig?: ArrayLike<number> | undefined;
  /** Category names of the source columns / rows (category axes), for re-indexing. */
  readonly xNames: readonly string[] | undefined;
  readonly yNames: readonly string[] | undefined;
  readonly pointOf?: Int32Array;
  /** The rows of a 2D `z` read as they are (no `transpose`), for the direct copy. */
  readonly rowsIn?: ArrayLike<ArrayLike<unknown> | undefined>;
}

/**
 * Copy rows of a 2D `z` into the grid (the fast path of a grid that is not re-indexed): typed
 * rows without per-value checks beyond finiteness, other rows through {@link cleanZ}.
 */
function copyRows(
  rows: ArrayLike<ArrayLike<unknown> | undefined>,
  z: Float64Array,
  nx: number,
  ny: number,
): void {
  for (let j = 0; j < ny; j++) {
    const row = rows[j];
    const base = j * nx;
    const n = row ? Math.min(row.length, nx) : 0;
    if (row && ArrayBuffer.isView(row)) {
      const typed = row as unknown as ArrayLike<number>;
      for (let i = 0; i < n; i++) {
        const v = typed[i]!;
        // `v - v` is 0 exactly for finite numbers.
        z[base + i] = v - v === 0 ? v : NaN;
      }
    } else if (row) {
      for (let i = 0; i < n; i++) z[base + i] = cleanZ(row[i]);
    }
    z.fill(NaN, base + n, base + nx);
  }
}

function namesOf(values: unknown): string[] | undefined {
  if (!isArrayLike(values)) return undefined;
  return Array.from(values as ArrayLike<unknown>, (v) => String(v));
}

/**
 * Linear coordinates snapped to their `xperiod` / `yperiod` (Plotly's `alignPeriod`, on date and
 * linear axes as bar and scatter; periods tile real time across range breaks), or `undefined`
 * without a period.
 */
export function alignedCoordinates(
  trace: FullTrace,
  letter: 'x' | 'y',
  axis: AxisInfo,
  values: ArrayLike<number>,
): Float64Array | undefined {
  const period = trace[`${letter}period`];
  if (period === undefined || (axis.type !== 'date' && axis.type !== 'linear')) return undefined;
  return alignPeriod(values, {
    period,
    period0: trace[`${letter}period0`],
    alignment: trace[`${letter}periodalignment`] as 'start' | 'middle' | 'end' | undefined,
    isDate: axis.type === 'date',
    breaks: axis.scale.breaks,
  })?.vals;
}

/** Column data (Plotly `convertColumnData`): points placed on their distinct x and y values. */
function columnGrid(trace: FullTrace, xaxis: AxisInfo, yaxis: AxisInfo): SourceGrid {
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  const zIn = trace['z'] as ArrayLike<unknown>;
  let xl = xaxis.scale.d2lArray(trace['x'] as ArrayLike<unknown>);
  let yl = yaxis.scale.d2lArray(trace['y'] as ArrayLike<unknown>);
  // Plotly aligns the columns before placing them (hover then shows the aligned values).
  xl = alignedCoordinates(trace, 'x', xaxis, xl) ?? xl;
  yl = alignedCoordinates(trace, 'y', yaxis, yl) ?? yl;
  const dx = distinctValues(xl.subarray(0, length));
  const dy = distinctValues(yl.subarray(0, length));
  const cols = dx.vals.length;
  const rows = dy.vals.length;
  const values = new Float64Array(rows * cols).fill(NaN);
  const pointOf = new Int32Array(rows * cols).fill(-1);
  for (let k = 0; k < length; k++) {
    const x = xl[k]!;
    const y = yl[k]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const i = findBin(x + dx.minDiff / 2, dx.vals);
    const j = findBin(y + dy.minDiff / 2, dy.vals);
    if (i < 0 || j < 0) continue;
    values[j * cols + i] = cleanZ(zIn[k]);
    pointOf[j * cols + i] = k;
  }
  const names = (axis: AxisInfo, vals: readonly number[]) =>
    axis.type === 'category' ? vals.map((v) => String(axis.scale.l2d(v))) : undefined;
  return {
    rows,
    cols,
    at: (r, c) => values[r * cols + c]!,
    xs: dx.vals,
    ys: dy.vals,
    xNames: names(xaxis, dx.vals),
    yNames: names(yaxis, dy.vals),
    pointOf,
  };
}

/** A 2D `z` (Plotly `clean2dArray`): rows, or columns with `transpose`. */
function matrixGrid(trace: FullTrace, xaxis: AxisInfo, yaxis: AxisInfo): SourceGrid {
  const zIn = trace['z'] as ArrayLike<ArrayLike<unknown> | undefined>;
  const transpose = trace['transpose'] === true;
  let longest = 0;
  for (let i = 0; i < zIn.length; i++) longest = Math.max(longest, zIn[i]?.length ?? 0);
  const rows = transpose ? longest : zIn.length;
  const cols = transpose ? zIn.length : longest;
  const at = transpose
    ? (r: number, c: number) => cleanZ(zIn[c]?.[r])
    : (r: number, c: number) => cleanZ(zIn[r]?.[c]);
  // [aligned, as given] linear coordinates of an axis with `n` cells.
  const coord = (letter: 'x' | 'y', axis: AxisInfo, n: number) => {
    const v = trace[letter];
    if (trace[`${letter}type`] === 'scaled' || !isArrayLike(v)) return [];
    const values = v as ArrayLike<unknown>;
    // Cell edges on a range-break axis are clamped to the breaks (`r2l`), not hidden.
    const l =
      axis.scale.breaks && values.length > n
        ? Float64Array.from(values, (d) => axis.scale.r2l(d))
        : axis.scale.d2lArray(values);
    const aligned = alignedCoordinates(trace, letter, axis, l);
    return aligned ? [aligned, l] : [l];
  };
  const [xs, xOrig] = coord('x', xaxis, cols);
  const [ys, yOrig] = coord('y', yaxis, rows);
  const xv = trace['x'];
  const yv = trace['y'];
  return {
    rows,
    cols,
    at,
    ...(transpose ? {} : { rowsIn: zIn }),
    xs,
    ys,
    xOrig,
    yOrig,
    xNames: xaxis.type === 'category' ? namesOf(xv) : undefined,
    yNames: yaxis.type === 'category' ? namesOf(yv) : undefined,
  };
}

/**
 * Source index of each grid column / row: on a category axis with category names, grid column
 * i is axis category i, taken from the source column of that name (−1: none; the last source
 * column of a name wins, as Plotly's object map); otherwise the identity.
 */
function reindex(names: readonly string[] | undefined, axis: AxisInfo, n: number): Int32Array {
  const categories = axis.scale.categories;
  if (axis.type !== 'category' || !names || names.length === 0 || categories.length === 0) {
    return Int32Array.from({ length: n }, (_, i) => i);
  }
  const map = new Map<string, number>();
  names.forEach((name, i) => map.set(name, i));
  return Int32Array.from(categories, (c) => map.get(c) ?? -1);
}

/**
 * Range breaks (see the module comment): the source columns (rows) to keep and their compressed
 * coordinates, or undefined off break axes and for column data (its points in breaks are skipped).
 */
function breakCells(
  trace: FullTrace,
  letter: 'x' | 'y',
  axis: AxisInfo,
  n: number,
  coords: ArrayLike<number> | undefined,
  orig: ArrayLike<number> | undefined,
): { keep: Int32Array; coords: number[]; orig: number[] | undefined } | undefined {
  if (!axis.scale.breaks || isColumnZ(trace['z'])) return undefined;
  let c = coords;
  if (!c) {
    // x0 + i·dx in real time, then compressed (and hidden in breaks), like scatter's.
    const s = trace[`${letter}0`];
    const d = trace[`d${letter}`];
    const r0 = axis.type === 'date' ? dateToMs(s) : cleanNumber(s);
    const step = typeof d === 'number' && d !== 0 ? d : 1;
    c = Float64Array.from({ length: n }, (_, i) => axis.scale.d2l(r0 + i * step));
  }
  const keep: number[] = [];
  const out: number[] = [];
  const o: number[] = [];
  const at = (i: number) => {
    out.push(c[i]!);
    if (orig) o.push(orig[i]!);
  };
  if (c.length > n) {
    // Edges: drop the cells a break swallows (zero width), with their far edge.
    at(0);
    for (let i = 0; i < n; i++) {
      if (c[i + 1] === out[out.length - 1]) continue;
      keep.push(i);
      at(i + 1);
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (i < c.length && Number.isNaN(c[i])) continue;
      keep.push(i);
      if (i < c.length) at(i);
    }
  }
  return { keep: Int32Array.from(keep), coords: out, orig: orig ? o : undefined };
}

/** One axis' cells: edges and centers (linear) from its source coordinates. */
function axisCells(
  trace: FullTrace,
  letter: 'x' | 'y',
  axis: AxisInfo,
  count: number,
  source: ArrayLike<number> | undefined,
  orig?: ArrayLike<number>,
): HeatmapAxisCells {
  const type = axis.type;
  const calcValues = source ? Array.from(source, (l) => toCalc(type, l)) : undefined;
  const v0 = startValue(axis, trace[`${letter}0`]);
  const dv = trace[`d${letter}`];
  const calcEdges = makeBoundArray({
    type,
    values: calcValues,
    v0,
    dv: typeof dv === 'number' ? dv : undefined,
    count,
  });
  while (calcEdges.length < count + 1) calcEdges.push(NaN);
  const edges = linearEdges(type, calcEdges);
  const centers = new Float64Array(count);
  const given = calcValues !== undefined && calcValues.length === count && type !== 'category';
  for (let i = 0; i < count; i++) {
    if (type === 'category')
      centers[i] = Math.round(calcEdges[i]! + 0.5 * (calcEdges[i + 1]! - calcEdges[i]!));
    else if (given) centers[i] = source![i]!;
    else centers[i] = toLinear(type, (calcEdges[i]! + calcEdges[i + 1]!) / 2);
  }
  if (!orig) return { count, edges, centers, type };
  // Plotly's hover: the given value, or the middle of the given edges (centers past the end).
  const edgesGiven = orig.length > count;
  const hoverAt = Float64Array.from(centers, (c, i) =>
    edgesGiven ? (orig[i]! + orig[i + 1]!) / 2 : i < orig.length ? orig[i]! : c,
  );
  return { count, edges, centers, hoverAt, type };
}

/** Options of {@link calcHeatmapGrid}. */
export interface HeatmapCalcOptions {
  /** Warning sink (default `console.warn`). */
  readonly warn?: (message: string) => void;
}

/** Build the grid of a heatmap trace (see the module comment). Shared with contours. */
export function calcHeatmapGrid(
  trace: FullTrace,
  ctx: Pick<CalcContext, 'xaxis' | 'yaxis'>,
  options: HeatmapCalcOptions = {},
): HeatmapCalc {
  const { xaxis, yaxis } = ctx;
  if (!xaxis || !yaxis || trace.visible === false) return emptyHeatmapCalc();
  const warn = options.warn ?? ((m: string) => console.warn(m));
  const source = isColumnZ(trace['z'])
    ? columnGrid(trace, xaxis, yaxis)
    : matrixGrid(trace, xaxis, yaxis);
  const xb = breakCells(trace, 'x', xaxis, source.cols, source.xs, source.xOrig);
  const yb = breakCells(trace, 'y', yaxis, source.rows, source.ys, source.yOrig);
  const colOf = xb?.keep ?? reindex(source.xNames, xaxis, source.cols);
  const rowOf = yb?.keep ?? reindex(source.yNames, yaxis, source.rows);
  const nx = colOf.length;
  const ny = rowOf.length;
  if (nx === 0 || ny === 0) return emptyHeatmapCalc();
  if (nx * ny > MAX_CELLS) {
    warn(
      `[holochart] heatmap trace ${trace._index}: ${nx}×${ny} cells is more than ${MAX_CELLS}; not drawn.`,
    );
    return emptyHeatmapCalc();
  }
  let z: Float64Array = new Float64Array(nx * ny);
  const identity = colOf.every((c, i) => c === i) && rowOf.every((r, j) => r === j);
  let pointOf: Int32Array | undefined;
  if (source.pointOf) pointOf = new Int32Array(nx * ny).fill(-1);
  if (identity && source.rowsIn) copyRows(source.rowsIn, z, nx, ny);
  else {
    for (let j = 0; j < ny; j++) {
      const r = rowOf[j]!;
      for (let i = 0; i < nx; i++) {
        const c = colOf[i]!;
        const k = j * nx + i;
        z[k] = r < 0 || c < 0 ? NaN : source.at(r, c);
        if (pointOf && r >= 0 && c >= 0) pointOf[k] = source.pointOf![r * source.cols + c]!;
      }
    }
  }
  if (trace['connectgaps'] === true) z = fillGaps(z, nx, ny);

  // Source coordinates only place the cells when the grid was not re-indexed by categories.
  const xs = xb ? xb.coords : identity || xaxis.type !== 'category' ? source.xs : undefined;
  const ys = yb ? yb.coords : identity || yaxis.type !== 'category' ? source.ys : undefined;
  const x = axisCells(trace, 'x', xaxis, nx, xs, xb ? xb.orig : source.xOrig);
  const y = axisCells(trace, 'y', yaxis, ny, ys, yb ? yb.orig : source.yOrig);

  const fastSmoothing =
    xaxis.type !== 'log' &&
    yaxis.type !== 'log' &&
    isEvenlySpaced(xb?.coords ?? source.xs ?? []) &&
    isEvenlySpaced(yb?.coords ?? source.ys ?? []);

  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < z.length; k++) {
    const v = z[k]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const zExtent: [number, number] = lo <= hi ? [lo, hi] : [NaN, NaN];
  const reindexed = !identity && !pointOf ? { source: { rows: rowOf, cols: colOf } } : {};
  return { x, y, nx, ny, z, zExtent, fastSmoothing, pointOf, ...reindexed };
}

/** `zsmooth` in effect: `'fast'` falls back to none where the calc says it can't apply. */
export function heatmapSmoothing(
  trace: FullTrace,
  calc: Pick<HeatmapCalc, 'fastSmoothing'>,
): HeatmapSmoothing {
  const s = trace['zsmooth'];
  if (s === 'best') return 'best';
  return s === 'fast' && calc.fastSmoothing ? 'fast' : false;
}

/** The heatmap `calc`: build the grid, and record the value extent for the colorbar. */
export function calcHeatmap(trace: FullTrace, ctx: CalcContext): HeatmapCalc {
  const calc = calcHeatmapGrid(trace, ctx);
  if (Number.isFinite(calc.zExtent[0])) recordZExtent(trace, calc.zExtent);
  return calc;
}

/**
 * Samples for value-based category orders (`categoryorder: 'total descending'`, …; Plotly's
 * `sortAxisCategoriesByValue` for 2D maps): every cell with a value, at its column's (x) or row's
 * (y) category.
 */
export function heatmapCategoryValues(
  calc: HeatmapCalc,
  _trace: FullTrace,
  axis: 'x' | 'y',
): CategorySamples | undefined {
  const cells = axis === 'x' ? calc.x : calc.y;
  if (cells.type !== 'category' || calc.nx === 0 || calc.ny === 0) return undefined;
  const index: number[] = [];
  const value: number[] = [];
  for (let j = 0; j < calc.ny; j++) {
    for (let i = 0; i < calc.nx; i++) {
      const v = calc.z[j * calc.nx + i]!;
      if (!Number.isFinite(v)) continue;
      index.push(cells.centers[axis === 'x' ? i : j]!);
      value.push(v);
    }
  }
  return { index, value };
}

/** Autorange: the whole grid, edge to edge, without padding (Plotly heatmaps). */
export function heatmapExtremes(calc: HeatmapCalc): TraceExtremes {
  if (calc.nx === 0 || calc.ny === 0) return {};
  return { x: linearExtremes(calc.x.edges), y: linearExtremes(calc.y.edges) };
}
