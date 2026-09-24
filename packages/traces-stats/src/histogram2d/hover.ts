/**
 * Hover for 2D histograms (plan E10.2, E6.1; ADR-010: CPU), following plotly.js
 * `heatmap/hover.js` + `histogram2d/hover.js`: the cell under the pointer, labelled with its bin
 * ranges (`0 - 4`) and value. Cells are found by bisecting the bin edges, O(log n).
 *
 * Heatmap-like traces report the largest hover distance, so markers or lines drawn over them win
 * the `closest` hover (Plotly's `maxHoverDistance`).
 */
import { formatNumber, formatValue, type FullTrace } from '@mk7s/holochart-core';
import type { AxisInfo, HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import type { Histogram2dAxisBins, Histogram2dCalc } from './calc.ts';
import { zColorMapping, type ZColorMapping } from './colorscale.ts';
import { sampleColorscale } from '@mk7s/holochart-render';

/** The bin of a linear coordinate: `0 … count - 1`, or -1 outside the edges. */
export function binAt(bins: Histogram2dAxisBins, l: number): number {
  const e = bins.edges;
  const n = bins.count;
  if (n === 0 || !(l >= e[0]! && l <= e[n]!)) return -1;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (e[mid]! <= l) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** A linear coordinate formatted like the axis' hover labels (`hoverformat` overrides it). */
export function axisHoverText(axis: AxisInfo | undefined, l: number, hoverformat: unknown): string {
  if (!Number.isFinite(l)) return '';
  if (!axis) return formatNumber(l);
  const full =
    typeof hoverformat === 'string' && hoverformat !== ''
      ? { ...axis.full, hoverformat }
      : axis.full;
  return formatValue(axis.scale, full, l, true);
}

/** A bin's hover label: `lo - hi` (Plotly's `hoverLabelText` of a range), or one value. */
export function binRangeText(
  bins: Histogram2dAxisBins,
  i: number,
  axis: AxisInfo | undefined,
  hoverformat: unknown,
): string {
  const lo = bins.ranges[2 * i]!;
  const hi = bins.ranges[2 * i + 1]!;
  const a = axisHoverText(axis, lo, hoverformat);
  return lo === hi ? a : `${a} - ${axisHoverText(axis, hi, hoverformat)}`;
}

/** A cell value's label (`zhoverformat`, else Plotly's hover precision). Empty cells give `''`. */
export function zText(z: number, zhoverformat: unknown): string {
  if (!Number.isFinite(z)) return '';
  const format = typeof zhoverformat === 'string' && zhoverformat !== '' ? zhoverformat : undefined;
  return formatNumber(z, format ? { tickformat: format } : {});
}

/** The data value of a linear coordinate (dates as strings, categories by name). */
export function dataValue(axis: AxisInfo | undefined, l: number): unknown {
  if (!axis || !Number.isFinite(l)) return l;
  return axis.scale.l2d(l);
}

/** CSS color of a value under a mapping (for hover label borders). */
export function cellColor(z: number, mapping: ZColorMapping): string | undefined {
  if (!Number.isFinite(z)) return undefined;
  const span = mapping.zmax - mapping.zmin;
  let t = span > 0 ? (z - mapping.zmin) / span : 0.5;
  if (mapping.reversescale) t = 1 - t;
  const c = sampleColorscale(mapping.colorscale, t);
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

function hoverFlags(trace: FullTrace): Set<string> {
  const v = trace['hoverinfo'];
  const s = typeof v === 'string' && v !== '' ? v : 'all';
  if (s === 'all') return new Set(['x', 'y', 'z', 'text', 'name']);
  return new Set(s.split('+'));
}

/** Options of {@link cellHoverPoint}. */
export interface CellHoverOptions {
  /** Label x / y by bin range (histogram2d) or by bin center (histogram2dcontour, Plotly). */
  readonly ranges: boolean;
  readonly mapping: ZColorMapping;
}

/** The hover point of cell `(i, j)`. */
export function cellHoverPoint(
  calc: Histogram2dCalc,
  trace: FullTrace,
  i: number,
  j: number,
  distance: number,
  ctx: Pick<HoverContext, 'transform' | 'xaxis' | 'yaxis'>,
  options: CellHoverOptions,
): HoverPoint {
  const t = ctx.transform;
  const c = j * calc.nx + i;
  const z = calc.z[c]!;
  const xl = calc.x.centers[i]!;
  const yl = calc.y.centers[j]!;
  const xLabel = options.ranges
    ? binRangeText(calc.x, i, ctx.xaxis, trace['xhoverformat'])
    : axisHoverText(ctx.xaxis, xl, trace['xhoverformat']);
  const yLabel = options.ranges
    ? binRangeText(calc.y, j, ctx.yaxis, trace['yhoverformat'])
    : axisHoverText(ctx.yaxis, yl, trace['yhoverformat']);
  const zLabel = zText(z, trace['zhoverformat']);
  const flags = hoverFlags(trace);
  const lines: string[] = [];
  if (flags.has('x')) lines.push(`x: ${xLabel}`);
  if (flags.has('y')) lines.push(`y: ${yLabel}`);
  if (flags.has('z')) lines.push(`z: ${zLabel}`);
  const text = trace['hovertext'] ?? trace['text'];
  if (flags.has('text') && typeof text === 'string' && text !== '') lines.push(text);
  const indices = calc.cellPoints.subarray(calc.cellStart[c]!, calc.cellStart[c + 1]!);
  const color = cellColor(z, options.mapping);
  return {
    pointIndex: c,
    pointIndices: Array.from(indices),
    distance,
    px: xl * t.scaleX + t.offsetX,
    py: yl * t.scaleY + t.offsetY,
    x: dataValue(ctx.xaxis, xl),
    y: dataValue(ctx.yaxis, yl),
    ...(color ? { color } : {}),
    fields: { z: Number.isFinite(z) ? z : undefined },
    labels: { x: xLabel, y: yLabel, z: zLabel },
    hoverText: lines.join('<br>'),
  };
}

/** Hover points of a 2D histogram: the cell under the pointer, if any. */
export function histogram2dHoverPoints(
  calc: Histogram2dCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
  options: { ranges?: boolean } = {},
): HoverPoint[] {
  const i = binAt(calc.x, query.xl);
  const j = binAt(calc.y, query.yl);
  if (i < 0 || j < 0) return [];
  const distance = Number.isFinite(query.distance) ? query.distance : Number.MAX_VALUE;
  const mapping = zColorMapping(trace, ctx.fullLayout, calc.zExtent);
  return [
    cellHoverPoint(calc, trace, i, j, distance, ctx, {
      ranges: options.ranges ?? true,
      mapping,
    }),
  ];
}
