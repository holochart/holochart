/**
 * Draw order of traces within a subplot (plan E2.14), following plotly.js `plots/cartesian`:
 * traces are grouped by `zorder` (higher on top); within a group each trace type draws in its
 * own layer, in the fixed order of Plotly's `traceLayerClasses` (heatmaps under bars, bars under
 * boxes, scatter on top); within a layer, trace order. So a bar listed after a line still draws
 * below it, unless its `zorder` is higher.
 */
import type { FullTrace } from '@mk7s/holochart-core';

/**
 * Layer rank of each trace type, from plotly.js `traceLayerClasses` (image … scatter). Types not
 * listed draw with scatter, on top, as the layer Plotly gives other SVG cartesian traces.
 */
const LAYER_RANK: Readonly<Record<string, number>> = {
  image: 0,
  heatmap: 1,
  contourcarpet: 2,
  contour: 3,
  funnel: 4,
  waterfall: 5,
  bar: 6,
  carpet: 7,
  violin: 8,
  box: 9,
  ohlc: 10,
  candlestick: 10,
  scattercarpet: 11,
  scatter: 12,
};
const TOP_RANK = 12;

/**
 * Spacing of the order key. Sub-layers inside a trace (line, markers, text) add fractions < 1;
 * trace indices stay below `RANK_STEP`; ranks stay below `Z_STEP / RANK_STEP`. Components that
 * draw below every trace (grid lines) use an order far below `-Z_STEP * |zorder|`.
 */
const RANK_STEP = 1e4;
const Z_STEP = 1e6;

/** The `zorder` of a trace (0 when unset). */
export function zorderOf(trace: Readonly<Record<string, unknown>>): number {
  const z = trace['zorder'];
  return typeof z === 'number' && Number.isFinite(z) ? z : 0;
}

/**
 * three.js `renderOrder` of a trace: `zorder`, then Plotly's layer of its type, then trace order.
 * Add fractions in [0, 1) for layers inside the trace.
 */
export function traceRenderOrder(trace: FullTrace, index: number): number {
  const rank = LAYER_RANK[trace.type] ?? TOP_RANK;
  return zorderOf(trace) * Z_STEP + rank * RANK_STEP + index;
}
