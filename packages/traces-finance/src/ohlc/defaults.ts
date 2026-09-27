/** `ohlc` supply-defaults (plan E12.2), following plotly.js' `ohlc/defaults.js`. */
import type { FullTrace, TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyPriceData, supplyPriceExtras } from '../shared/defaults.ts';

/**
 * Supply ohlc defaults: the data (hidden without all four prices), `line`, then each direction's
 * line, whose width and dash default to `line.width` and `line.dash`.
 */
export function supplyOhlcDefaults(
  _traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (supplyPriceData(traceOut, ctx) === 0) {
    traceOut.visible = false;
    return;
  }
  const width = ctx.coerce('line.width');
  const dash = ctx.coerce('line.dash');
  for (const d of ['increasing', 'decreasing']) {
    ctx.coerce(`${d}.line.color`);
    ctx.coerce(`${d}.line.width`, width);
    ctx.coerce(`${d}.line.dash`, dash);
  }
  ctx.coerce('tickwidth');
  supplyPriceExtras(traceOut, ctx);
}
