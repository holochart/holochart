/**
 * Histogram hover and selection (plan E10.1, E6.1, E6.3): bar hit-testing, with Plotly's
 * histogram labels and event data.
 *
 * - Hover: the position value is the bin's range (`0 - 4`, `Jan 2024 - Mar 2024`), or its single
 *   value when every sample in the bin has the same one (Plotly's `hoverLabelText` of `ph0` /
 *   `ph1`); cumulative histograms show the bin center. Event points carry `binNumber` and the
 *   bin's samples as `pointNumbers` / `pointIndices` (Plotly's histogram `eventData`).
 * - Selection selects the underlying samples: a bar inside the box or lasso selects every sample
 *   in its bin, and `selectedpoints` holds sample indices, as in Plotly.
 */
import type { AxisType, FullTrace } from '@mk7s/holochart-core';
import {
  formatAxisValue,
  type AxisInfo,
  type HoverContext,
  type HoverPoint,
  type HoverQuery,
  type SelectionQuery,
} from '@mk7s/holochart-runtime';
import { bar } from '@mk7s/holochart-traces-basic';
import type { HistogramCalc } from './calc.ts';

/** Calc value → linear on an axis (log axes bin raw values). */
function c2l(type: AxisType | undefined, v: number): number {
  return type === 'log' ? (v > 0 ? Math.log10(v) : NaN) : v;
}

/**
 * The position label of bar `i`: `a - b` for a range (each end formatted like the axis' hover
 * labels), else the value itself as data (a category name, ms, a number), formatted by the
 * runtime like any hover value.
 */
export function histogramPositionValue(
  calc: HistogramCalc,
  i: number,
  axis: AxisInfo | undefined,
): unknown {
  const h0 = calc.hover0[i]!;
  const h1 = calc.hover1[i]!;
  const type = axis?.scale.type ?? calc.posType;
  if (h0 !== h1) {
    return `${formatAxisValue(axis, c2l(type, h0))} - ${formatAxisValue(axis, c2l(type, h1))}`;
  }
  const l = c2l(type, h0);
  if (!axis) return h0;
  if (type === 'category' || type === 'multicategory') return axis.scale.l2d(l);
  return h0;
}

/** Histogram hover points: bar hover with bin ranges and the bins' samples. */
export function histogramHoverPoints(
  calc: HistogramCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const points = bar.hoverPoints?.(calc, trace, query, ctx) ?? [];
  if (points.length === 0) return points;
  const horizontal = calc.orientation === 'h';
  const axis = horizontal ? ctx.yaxis : ctx.xaxis;
  return points.map((p) => {
    const i = p.pointIndex;
    const position = histogramPositionValue(calc, i, axis);
    const samples = calc.points[i] ?? [];
    const fields: Record<string, unknown> = { ...(p.fields ?? {}), binNumber: i };
    if (!calc.cumulative) fields['pointIndices'] = samples;
    return {
      ...p,
      ...(horizontal ? { y: position } : { x: position }),
      ...(calc.cumulative ? {} : { pointIndices: samples }),
      fields,
    };
  });
}

/**
 * Samples of the bars inside a box or lasso selection (a bar is selected when its center is, as
 * for bars), in sample order.
 */
export function histogramSelectPoints(
  calc: HistogramCalc,
  trace: FullTrace,
  query: SelectionQuery,
  ctx: HoverContext,
): number[] {
  const selected = new Set(bar.selectPoints?.(calc, trace, query, ctx) ?? []);
  if (selected.size === 0) return [];
  const out: number[] = [];
  for (let s = 0; s < calc.barOfSample.length; s++) {
    if (selected.has(calc.barOfSample[s]!)) out.push(s);
  }
  return out;
}

/** Bars with a selected sample (Plotly's `tagSelected` through `ptNumber2cdIndex`). */
export function selectedBars(
  calc: HistogramCalc,
  samples: readonly number[] | null | undefined,
): number[] | null {
  if (!samples) return null;
  const bars = new Set<number>();
  for (const s of samples) {
    const b = calc.barOfSample[s];
    if (b !== undefined && b >= 0) bars.add(b);
  }
  return [...bars].sort((a, b) => a - b);
}
