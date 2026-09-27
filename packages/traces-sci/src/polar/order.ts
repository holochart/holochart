/**
 * Draw order of polar subplots in the overlay viewport (plan E11.4), where polar traces and axes
 * draw: under every component (legend, annotations, colorbars draw at orders ≥ 0) and under
 * domain traces such as pie (-9 … -3), following plotly.js' polar layers — background, grids and
 * `below traces` axes, then bars, then scatter traces (fill, line, markers, text), then the axis
 * lines, ticks and labels.
 */
export const POLAR_ORDER = {
  background: -1000,
  grid: -999,
  /** Axis lines, ticks and labels of `layer: 'below traces'` axes. */
  axesBelow: -998,
  bars: -900,
  scatter: -800,
  /** Axis lines, ticks and labels of `layer: 'above traces'` axes (the default). */
  axesAbove: -100,
  /** The radial zoom box. */
  zoombox: -50,
} as const;

/** Sub-layers of one scatter trace, as fractions of the per-trace step. */
export const SCATTER_LAYER = {
  fill: 0.1,
  nextFill: 0.15,
  line: 0.2,
  markers: 0.3,
  text: 0.4,
} as const;

/** Base draw order of trace `index` in `base` (`POLAR_ORDER.bars` or `.scatter`). */
export function traceOrder(base: number, index: number): number {
  return base + Math.min(index, 9999) * 0.01;
}
