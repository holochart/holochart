/** `candlestick` supply-defaults (plan E12.3), following plotly.js' `candlestick/defaults.js`. */
import {
  toRGBA,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { supplyPriceData, supplyPriceExtras } from '../shared/defaults.ts';

/** Private trace key: index among the visible candlestick traces (Plotly's `t.num`). */
export const CANDLE_NUM = '_candleNum';
/** Private `fullLayout` key: the number of visible candlestick traces (Plotly's `_numBoxes`). */
export const CANDLE_COUNT = '_numCandles';

/** Plotly's `Color.addOpacity(color, 0.5)`: a color at half opacity. */
export function halfOpacity(color: unknown): string | undefined {
  const c = typeof color === 'string' ? toRGBA(color) : null;
  if (!c) return undefined;
  const [r, g, b] = [c[0], c[1], c[2]].map((v) => Math.round(v * 255));
  return `rgba(${r}, ${g}, ${b}, 0.5)`;
}

/**
 * Supply candlestick defaults: the data (hidden without all four prices), `line.width`, then each
 * direction's line (width defaulting to `line.width`) and body fill (its line color at half
 * opacity), and `whiskerwidth`.
 */
export function supplyCandlestickDefaults(
  _traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (supplyPriceData(traceOut, ctx) === 0) {
    traceOut.visible = false;
    return;
  }
  const width = ctx.coerce('line.width');
  for (const d of ['increasing', 'decreasing']) {
    const color = ctx.coerce(`${d}.line.color`);
    ctx.coerce(`${d}.line.width`, width);
    ctx.coerce(`${d}.fillcolor`, halfOpacity(color));
  }
  ctx.coerce('whiskerwidth');
  supplyPriceExtras(traceOut, ctx);
}

/**
 * Layout defaults: number the visible candlestick traces, for `boxmode: 'group'` (Plotly counts
 * box and candlestick traces together; here candles group with candles only).
 */
export function supplyCandlestickLayoutDefaults(
  _layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  let n = 0;
  for (const trace of ctx.fullData) {
    if (trace.type === 'candlestick' && trace.visible === true) trace[CANDLE_NUM] = n++;
  }
  layoutOut[CANDLE_COUNT] = n;
}
