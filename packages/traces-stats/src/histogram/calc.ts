/**
 * `histogram` calc (plan E10.1), a port of plotly.js' histogram calc: bin the samples (shared bins
 * per bin group, see `shared/bins.ts`), aggregate (`histfunc`), normalize (`histnorm`),
 * accumulate (`cumulative`), drop the empty bins at both ends, and lay the remaining bins out as
 * a bar calc, so grouping and stacking with bars (`crossTraceCalc`), autorange, drawing, labels
 * and error bars are bar's. Pure.
 */
import { createScale, type FullTrace, type Scale } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import { layoutBarCalc, type BarCalc } from '@mk7s/holochart-traces-basic';
import {
  accumulateBins,
  averageBins,
  BIN_FUNCTIONS,
  binAxis,
  binIncrement,
  binLabelRounder,
  initialBinValue,
  makeBins,
  normalizeBins,
  resolveBins,
  type BinSpec,
  type HistFunc,
  type HistNorm,
} from '../shared/bins.ts';

/**
 * Histogram calcdata: a bar calc with one bar per kept bin (empty bins at both ends are dropped,
 * as in Plotly), plus what hover, selection and the description need.
 */
export interface HistogramCalc extends BarCalc {
  /** The bins used (calc space of the position axis). */
  readonly spec: BinSpec;
  /** Bin edges of each bar (calc space): bar `i` spans `[binStart[i], binEnd[i])`. */
  readonly binStart: Float64Array;
  readonly binEnd: Float64Array;
  /**
   * The hover range of each bar (calc space, Plotly's `ph0` / `ph1`): the one value its samples
   * share, or its edges rounded to what the data can distinguish (`0 - 4` for integers in bins of
   * 5). Equal ends show one value.
   */
  readonly hover0: Float64Array;
  readonly hover1: Float64Array;
  /** Sample indices in each bar (Plotly's `pts`); empty for cumulative histograms. */
  readonly points: readonly (readonly number[])[];
  /** The bar of each sample, -1 outside every kept bin. */
  readonly barOfSample: Int32Array;
  readonly cumulative: boolean;
  /** Samples binned (inside the bins). */
  readonly binned: number;
}

const LINEAR: Scale = /* @__PURE__ */ createScale({ type: 'linear' });

function str<T extends string>(v: unknown, dflt: T): T {
  return typeof v === 'string' ? (v as T) : dflt;
}

/** Histogram calc: bins, aggregation, normalization and the bar layout of the trace alone. */
export function calcHistogram(trace: FullTrace, ctx: CalcContext): HistogramCalc {
  const orientation = trace['orientation'] === 'h' ? 'h' : 'v';
  const dir = orientation === 'h' ? 'y' : 'x';
  const counterDir = orientation === 'h' ? 'x' : 'y';
  const [pa, sa] = orientation === 'h' ? [ctx.yaxis, ctx.xaxis] : [ctx.xaxis, ctx.yaxis];
  const axis = binAxis(pa?.scale ?? LINEAR);
  const resolved = resolveBins(trace, dir, axis, ctx.fullLayout);
  const { spec, positions } = resolved;
  const bins = makeBins(spec);
  const nBins = bins.count;
  const edges = bins.edges;

  const cumulativeIn = (trace['cumulative'] ?? {}) as Record<string, unknown>;
  const cumulative = cumulativeIn['enabled'] === true;
  let norm = str<HistNorm>(trace['histnorm'], '');
  let density = norm.includes('density');
  if (cumulative && density) {
    // Cumulative "density" is an integral: the same as without density (Plotly).
    norm = norm.replace(/ ?density$/, '') as HistNorm;
    density = false;
  }
  const counter = trace[counterDir] as ArrayLike<unknown> | undefined;
  let func = str<HistFunc>(trace['histfunc'], 'count');
  if (!counter || typeof counter.length !== 'number') func = 'count';
  const fn = BIN_FUNCTIONS[func] ?? BIN_FUNCTIONS.count;

  const size = new Float64Array(nBins).fill(initialBinValue(func));
  const counts = func === 'avg' ? new Float64Array(nBins) : undefined;
  const inc = new Float64Array(density ? nBins : 0);
  if (density) for (let b = 0; b < nBins; b++) inc[b] = 1 / (edges[b + 1]! - edges[b]!);
  const points: number[][] = Array.from({ length: nBins }, () => []);
  const binOfSample = new Int32Array(positions.length).fill(-1);
  let total = 0;
  let unique = true;
  let binned = 0;
  for (let i = 0; i < positions.length; i++) {
    const v = positions[i]!;
    const b = bins.find(v);
    if (!(b >= 0 && b < nBins)) continue;
    total += fn(b, i, size, counter, counts);
    const list = points[b]!;
    if (unique && list.length > 0 && v !== positions[list[0]!]) unique = false;
    list.push(i);
    binOfSample[i] = b;
    binned++;
  }
  if (counts) total = averageBins(size, counts);
  if (norm) normalizeBins(size, norm, total, inc);
  if (cumulative) {
    accumulateBins(
      size,
      cumulativeIn['direction'] === 'decreasing' ? 'decreasing' : 'increasing',
      str(cumulativeIn['currentbin'], 'include') as 'include' | 'exclude' | 'half',
    );
  }

  // Drop the empty bins at both ends, so autorange omits them (Plotly: `size[i]` falsy).
  let first = 0;
  let last = nBins - 1;
  for (let b = 0; b < nBins; b++) {
    if (size[b]) {
      first = b;
      break;
    }
  }
  for (let b = nBins - 1; b >= first; b--) {
    if (size[b]) {
      last = b;
      break;
    }
  }
  const kept: number[] = [];
  for (let b = first; b <= last; b++) {
    const center = (edges[b]! + edges[b + 1]!) / 2;
    if (Number.isFinite(center) && Number.isFinite(size[b]!)) kept.push(b);
  }

  const n = kept.length;
  const posType = pa?.scale.type;
  const pos = new Float64Array(n);
  const centers = new Float64Array(n);
  const barSize = new Float64Array(n);
  const binStart = new Float64Array(n);
  const binEnd = new Float64Array(n);
  const barOfBin = new Int32Array(nBins).fill(-1);
  kept.forEach((b, i) => {
    const c = (edges[b]! + edges[b + 1]!) / 2;
    centers[i] = c;
    // Log position axes: bins are linear in data units, positions are log10 (linear coords).
    pos[i] = posType === 'log' ? (c > 0 ? Math.log10(c) : NaN) : c;
    barSize[i] = size[b]!;
    binStart[i] = edges[b]!;
    binEnd[i] = edges[b + 1]!;
    barOfBin[b] = i;
  });
  const barOfSample = new Int32Array(positions.length).fill(-1);
  for (let i = 0; i < binOfSample.length; i++) {
    const b = binOfSample[i]!;
    if (b >= 0) barOfSample[i] = barOfBin[b]!;
  }
  const barPoints: number[][] = cumulative ? kept.map(() => []) : kept.map((b) => points[b]!);

  // Hover ranges: the shared value of each bin, or rounded edges (Plotly's `ph0` / `ph1`).
  const hover0 = new Float64Array(n);
  const hover1 = new Float64Array(n);
  if (unique || cumulative) {
    kept.forEach((b, i) => {
      const list = points[b]!;
      const v = !cumulative && list.length > 0 ? positions[list[0]!]! : centers[i]!;
      hover0[i] = hover1[i] = v;
    });
  } else {
    const gaps = resolved.gaps;
    const round = binLabelRounder(gaps.left, gaps.right, edges, axis.type);
    for (let i = 0; i < n; i++) {
      hover0[i] = round(binStart[i]!);
      hover1[i] = round(binEnd[i]!, true);
    }
  }

  const calc: HistogramCalc = {
    length: n,
    orientation,
    pos,
    size: barSize,
    base: new Float64Array(n),
    hasBase: new Uint8Array(n),
    sizeType: sa?.scale.type,
    posType,
    // Filled by `layoutBarCalc` below.
    bars: undefined as unknown as BarCalc['bars'],
    s0: new Float64Array(0),
    s1: new Float64Array(0),
    floor: false,
    ends: { x: new Float64Array(0), y: new Float64Array(0) },
    errorX: undefined,
    errorY: undefined,
    // One bin left: its width sizes the bar (Plotly's `width1`).
    ...(n === 1 ? { minSpacing: binIncrement(centers[0]!, spec.size) - centers[0]! } : {}),
    positionValues: centers,
    // Overlaid histograms keep their own bin widths (Plotly lays out each overlaid trace alone).
    overlayAlone: true,
    spec,
    binStart,
    binEnd,
    hover0,
    hover1,
    points: barPoints,
    barOfSample,
    cumulative,
    binned,
  };
  layoutBarCalc(calc, trace, ctx);
  return calc;
}
