/**
 * `histogram2d` calc (plan E10.2), following plotly.js `histogram2d/calc.js`: bin the samples along
 * x and y with the shared 1D binning (`shared/bins.ts`, bin groups included), aggregate per cell
 * (`histfunc`), normalize (`histnorm`), and keep what drawing, hover and cell labels need. Pure.
 *
 * Cells are row-major, `z[j * nx + i]` for x bin `i` and y bin `j` (the heatmap primitive's
 * layout). Bins are in calc space (raw values on log axes, ms on dates); drawing uses linear
 * coordinates, so edges are also converted.
 *
 * ## GPU aggregation (plan E10.2, P1): deferred
 *
 * With `makeBins`' O(1) lookup for numeric bins, binning and aggregating is one pass per sample
 * (≈ 25 ms per million samples in Node on a laptop). Automatic bin sizes need a statistics pass
 * over the samples in any case (Plotly's `autoBin`: ≈ 70 ms per million per direction), which a
 * GPU path would not remove. Uploading the samples, rendering them additively into a float target
 * and reading it back (hover, cell labels and the colorbar need the values on the CPU) costs about
 * as much as the CPU binning below ~10 M samples, and needs float render targets with float
 * blending (`EXT_color_buffer_float` + `EXT_float_blend`), which the visual-test renderer
 * (SwiftShader) does not guarantee. It is left for when streaming (E7.2) makes such sizes common.
 */
import type { AxisType, FullLayout, FullTrace } from '@mk7s/holochart-core';
import { linearExtremes, type CalcContext, type TraceExtremes } from '@mk7s/holochart-runtime';
import {
  averageBins,
  BIN_FUNCTIONS,
  binAxis,
  binLabelRounder,
  initialBinValue,
  makeBins,
  normalizeBins,
  resolveBins,
  type Bins,
  type HistFunc,
  type HistNorm,
} from '../shared/bins.ts';
import { recordZExtent } from './colorscale.ts';

/** More cells than this are not drawn (a warning is logged): 16.7 M, a 4096² grid. */
export const MAX_CELLS = 4096 * 4096;

/** One binned direction. */
export interface Histogram2dAxisBins {
  readonly count: number;
  /** `count + 1` edges, linear coordinates (log10 on log axes), ascending. */
  readonly edges: Float64Array;
  /** Edges in calc space (raw values on log axes, ms on date axes). */
  readonly calcEdges: Float64Array;
  /** Bin centers, linear coordinates. */
  readonly centers: Float64Array;
  /**
   * What hover shows per bin, in linear coordinates: `[lo, hi]` pairs (`2 * count` values) of
   * rounded bin edges (Plotly's `getBinSpanLabelRound`), or `[v, v]` when every sample of the
   * direction sits on one value per bin.
   */
  readonly ranges: Float64Array;
  readonly type: AxisType;
  /** Whether bins are equally wide (O(1) lookups). */
  readonly uniform: boolean;
}

/** histogram2d calcdata. */
export interface Histogram2dCalc {
  readonly x: Histogram2dAxisBins;
  readonly y: Histogram2dAxisBins;
  readonly nx: number;
  readonly ny: number;
  /** Cell values, row-major (`z[j * nx + i]`); NaN for empty `avg` / `min` / `max` cells. */
  readonly z: Float64Array;
  /** Finite extent of `z` (`[NaN, NaN]` without values). */
  readonly zExtent: readonly [number, number];
  /** Samples of each cell: `cellPoints[cellStart[c] … cellStart[c + 1]]` (sample indices). */
  readonly cellStart: Uint32Array;
  readonly cellPoints: Uint32Array;
  /** Samples that fell in some cell. */
  readonly binned: number;
  /** The aggregation actually used (`count` without `z` / `marker.color`). */
  readonly histfunc: HistFunc;
}

const EMPTY_AXIS: Histogram2dAxisBins = {
  count: 0,
  edges: new Float64Array(0),
  calcEdges: new Float64Array(0),
  centers: new Float64Array(0),
  ranges: new Float64Array(0),
  type: 'linear',
  uniform: true,
};

/** An empty calc (no axes, no data, or too many cells). */
export function emptyHistogram2dCalc(): Histogram2dCalc {
  return {
    x: EMPTY_AXIS,
    y: EMPTY_AXIS,
    nx: 0,
    ny: 0,
    z: new Float64Array(0),
    zExtent: [NaN, NaN],
    cellStart: new Uint32Array(1),
    cellPoints: new Uint32Array(0),
    binned: 0,
    histfunc: 'count',
  };
}

/** The data `histfunc` aggregates: `z`, else a `marker.color` array (Plotly). */
export function aggregationData(trace: FullTrace): ArrayLike<unknown> | undefined {
  const z = trace['z'];
  if (z !== undefined && z !== null && typeof z === 'object' && 'length' in z) {
    return z as ArrayLike<unknown>;
  }
  const color = (trace['marker'] as { color?: unknown } | undefined)?.color;
  return color !== null && typeof color === 'object' && 'length' in color
    ? (color as ArrayLike<unknown>)
    : undefined;
}

/** Calc space → linear coordinates of an axis type (log10 on log axes; NaN if non-positive). */
function toLinear(type: AxisType, c: number): number {
  if (type !== 'log') return c;
  return c > 0 ? Math.log10(c) : NaN;
}

/**
 * Linear edges; on log axes, edges at or below 0 (auto bins may start there) are extrapolated one
 * bin below the first positive one, so the grid stays drawable.
 */
function linearEdges(type: AxisType, calcEdges: Float64Array): Float64Array {
  const out = calcEdges.map((c) => toLinear(type, c));
  if (type !== 'log') return out;
  const first = out.findIndex(Number.isFinite);
  if (first <= 0) return out;
  const next = out[first + 1];
  const step = next !== undefined && Number.isFinite(next) ? next - out[first]! : 1;
  for (let i = first - 1; i >= 0; i--) out[i] = out[i + 1]! - step;
  return out;
}

/** Per-bin sample gaps and unique values of one direction (for hover labels). */
interface Tracking {
  vals: Float64Array;
  unique: boolean;
  gapLow: number;
  gapHigh: number;
}

function tracking(count: number): Tracking {
  return {
    vals: new Float64Array(count).fill(NaN),
    unique: true,
    gapLow: Infinity,
    gapHigh: Infinity,
  };
}

function track(t: Tracking, bins: Bins, n: number, v: number): void {
  if (t.unique) {
    const seen = t.vals[n]!;
    if (Number.isNaN(seen)) t.vals[n] = v;
    else if (seen !== v) t.unique = false;
  }
  t.gapLow = Math.min(t.gapLow, v - bins.edges[n]!);
  t.gapHigh = Math.min(t.gapHigh, bins.edges[n + 1]! - v);
}

function axisBins(bins: Bins, type: AxisType, t: Tracking): Histogram2dAxisBins {
  const calcEdges = bins.edges;
  const edges = linearEdges(type, calcEdges);
  const count = bins.count;
  const centers = new Float64Array(count);
  for (let i = 0; i < count; i++) centers[i] = (edges[i]! + edges[i + 1]!) / 2;
  const ranges = new Float64Array(2 * count);
  const round =
    count > 0 && Number.isFinite(t.gapLow)
      ? binLabelRounder(t.gapLow, t.gapHigh, calcEdges, type)
      : (v: number) => v;
  for (let i = 0; i < count; i++) {
    const v = t.unique ? t.vals[i]! : NaN;
    if (!Number.isNaN(v)) {
      ranges[2 * i] = ranges[2 * i + 1] = toLinear(type, v);
    } else {
      ranges[2 * i] = toLinear(type, round(calcEdges[i]!));
      ranges[2 * i + 1] = toLinear(type, round(calcEdges[i + 1]!, true));
    }
  }
  return { count, edges, calcEdges, centers, ranges, type, uniform: bins.uniform };
}

/** Options of {@link binSamples2d}. */
export interface Bin2dOptions {
  /** Every trace of the figure (single-valued overlay lookups of `resolveBins`). */
  readonly fullData?: readonly FullTrace[];
  /** Warning sink (default `console.warn`). */
  readonly warn?: (message: string) => void;
}

/**
 * Bin and aggregate a 2D histogram trace (Plotly's `histogram2d/calc`). Shared by
 * `histogram2d` and `histogram2dcontour`.
 */
export function binSamples2d(
  trace: FullTrace,
  ctx: Pick<CalcContext, 'fullLayout' | 'xaxis' | 'yaxis'>,
  options: Bin2dOptions = {},
): Histogram2dCalc {
  const { xaxis, yaxis } = ctx;
  if (!xaxis || !yaxis) return emptyHistogram2dCalc();
  const fullLayout: FullLayout = ctx.fullLayout;
  const resolveOpts = options.fullData ? { fullData: options.fullData } : {};
  const rx = resolveBins(trace, 'x', binAxis(xaxis.scale), fullLayout, resolveOpts);
  const ry = resolveBins(trace, 'y', binAxis(yaxis.scale), fullLayout, resolveOpts);
  if (!Number.isFinite(rx.spec.start) || !Number.isFinite(ry.spec.start)) {
    return emptyHistogram2dCalc();
  }
  const bx = makeBins(rx.spec);
  const by = makeBins(ry.spec);
  const nx = bx.count;
  const ny = by.count;
  if (nx * ny > MAX_CELLS || nx === 0 || ny === 0) {
    if (nx * ny > MAX_CELLS) {
      (options.warn ?? ((m: string) => console.warn(m)))(
        `[holochart] ${trace.type} trace ${trace._index}: ${nx}×${ny} bins is more than ${MAX_CELLS} cells; not drawn.`,
      );
    }
    return emptyHistogram2dCalc();
  }

  const values = aggregationData(trace);
  const requested = trace['histfunc'] as HistFunc | undefined;
  const func: HistFunc = values && requested && requested !== 'count' ? requested : 'count';
  const norm = (trace['histnorm'] ?? '') as HistNorm;
  const cells = nx * ny;
  const z = new Float64Array(cells).fill(initialBinValue(func));
  const counts = func === 'avg' ? new Float64Array(cells) : undefined;
  const binfunc = BIN_FUNCTIONS[func];

  const xs = rx.positions;
  const ys = ry.positions;
  const length = Math.min(
    typeof trace['_length'] === 'number' ? trace['_length'] : Infinity,
    xs.length,
    ys.length,
  );
  const cellOf = new Int32Array(length);
  const perCell = new Uint32Array(cells + 1);
  const tx = tracking(nx);
  const ty = tracking(ny);
  let total = 0;
  let binned = 0;
  for (let i = 0; i < length; i++) {
    const xv = xs[i]!;
    const yv = ys[i]!;
    const n = bx.find(xv);
    const m = by.find(yv);
    if (!(n >= 0 && n < nx && m >= 0 && m < ny)) {
      cellOf[i] = -1;
      continue;
    }
    const c = m * nx + n;
    if (func === 'count') {
      z[c]!++;
      total++;
    } else total += binfunc(c, i, z, values, counts);
    cellOf[i] = c;
    perCell[c + 1]!++;
    binned++;
    track(tx, bx, n, xv);
    track(ty, by, m, yv);
  }
  if (counts) total += averageBins(z, counts);
  if (norm) {
    const xinc = new Float64Array(nx);
    for (let i = 0; i < nx; i++) xinc[i] = 1 / (bx.edges[i + 1]! - bx.edges[i]!);
    for (let m = 0; m < ny; m++) {
      const yinc = 1 / (by.edges[m + 1]! - by.edges[m]!);
      normalizeBins(z.subarray(m * nx, (m + 1) * nx), norm, total, xinc, yinc);
    }
  }

  // Samples per cell (CSR), in sample order.
  for (let c = 0; c < cells; c++) perCell[c + 1]! += perCell[c]!;
  const cellStart = perCell;
  const cellPoints = new Uint32Array(binned);
  const cursor = cellStart.slice(0, cells);
  for (let i = 0; i < length; i++) {
    const c = cellOf[i]!;
    if (c >= 0) cellPoints[cursor[c]!++] = i;
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (let c = 0; c < cells; c++) {
    const v = z[c]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const zExtent: [number, number] = lo <= hi ? [lo, hi] : [NaN, NaN];
  return {
    x: axisBins(bx, xaxis.scale.type, tx),
    y: axisBins(by, yaxis.scale.type, ty),
    nx,
    ny,
    z,
    zExtent,
    cellStart,
    cellPoints,
    binned,
    histfunc: func,
  };
}

/** The histogram2d `calc`: bin, aggregate, and record the value extent for the colorbar. */
export function calcHistogram2d(trace: FullTrace, ctx: CalcContext): Histogram2dCalc {
  const calc = binSamples2d(trace, ctx);
  if (Number.isFinite(calc.zExtent[0])) recordZExtent(trace, calc.zExtent);
  return calc;
}

/** Autorange: the whole grid, edge to edge, without padding (Plotly heatmaps). */
export function histogram2dExtremes(calc: Histogram2dCalc): TraceExtremes {
  if (calc.nx === 0 || calc.ny === 0) return {};
  const x = calc.x.edges;
  const y = calc.y.edges;
  return {
    x: linearExtremes([x[0]!, x[calc.nx]!]),
    y: linearExtremes([y[0]!, y[calc.ny]!]),
  };
}
