/**
 * Supply-defaults shared by `ohlc` and `candlestick` (plotly.js `ohlc/ohlc_defaults.js`
 * `handleOHLC`, `scatter/period_defaults.js`): the data arrays and their common length, period
 * alignment, hover formats and text, `zorder`, and the range slider request.
 */
import {
  isArrayLike,
  requestRangeslider,
  type FullTrace,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';

/**
 * Coerce `x`, `open`, `high`, `low` and `close` and set `_length`: the shortest of the four price
 * arrays (and of `x` when given). Returns 0 when a price array is missing or empty; the caller
 * then hides the trace (Plotly).
 */
export function supplyPriceData(traceOut: FullTrace, ctx: TraceDefaultsContext): number {
  const x = ctx.coerce('x');
  let length = Infinity;
  for (const key of ['open', 'high', 'low', 'close']) {
    const v = ctx.coerce(key);
    length = isArrayLike(v) ? Math.min(length, v.length) : 0;
    if (length === 0) return 0;
  }
  if (isArrayLike(x)) length = Math.min(length, x.length);
  if (length === 0) return 0;
  traceOut['_length'] = length;
  // Plotly's `handlePeriodDefaults` for x: `period0` / `periodalignment` only matter with a period.
  if (ctx.coerce('xperiod') !== undefined) {
    ctx.coerce('xperiod0');
    ctx.coerce('xperiodalignment');
  }
  ctx.coerce('xhoverformat');
  ctx.coerce('yhoverformat');
  return length;
}

/**
 * The rest of both types' defaults, after their styles: `text`, `zorder`, the range slider the
 * trace asks its x axis for (Plotly's `layout._requestRangeslider`), and `hoverlabel.split`
 * turning `hovertemplate` off (Plotly ignores the template for split labels).
 */
export function supplyPriceExtras(traceOut: FullTrace, ctx: TraceDefaultsContext): void {
  ctx.coerce('text');
  ctx.coerce('zorder');
  requestRangeslider(ctx.fullLayout, String(traceOut['xaxis'] ?? 'x'));
  const hoverlabel = traceOut['hoverlabel'] as { split?: unknown } | undefined;
  if (hoverlabel?.split === true) traceOut['hovertemplate'] = '';
}
