/**
 * The `candlestick` trace module (plan E12.3): open, high, low and close per period as a body from
 * open to close with wicks to the high and low, colored by direction, drawn in two instanced draw
 * calls whatever the candle count; on date, linear, category or range-break axes, with period
 * alignment, `boxmode: 'group'`, a range slider by default, one hover label with all four prices
 * (or split labels) and box / lasso selection. Registered with `register(candlestick)` (ADR-019).
 *
 * Deferred: extruded 3D candles (`depth`, P2).
 */
import type { FullLayout, LayoutDefaultsContext } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { priceExtremes, type PriceCalc } from '../shared/calc.ts';
import { describePrices } from '../shared/describe.ts';
import { priceHoverPoints, priceSelectPoints } from '../shared/hover.ts';
import { candlestickLegendIcon } from '../shared/legend.ts';
import { candlestickAttributes, candlestickLayoutAttributes } from './attributes.ts';
import { calcCandlestick, crossTraceCalcCandlestick } from './calc.ts';
import { supplyCandlestickDefaults, supplyCandlestickLayoutDefaults } from './defaults.ts';
import { candlestickRenderer } from './plot.ts';

export const candlestick: TraceModule<PriceCalc, typeof candlestickAttributes.children> = {
  type: 'candlestick',
  categories: ['cartesian', 'showLegend', 'candlestick', 'boxLayout'],
  schema: candlestickAttributes,
  layoutSchema: candlestickLayoutAttributes,
  meta: {
    description:
      'Candlesticks: the open, high, low and close of each period as a body from open to close with wicks to the high and low, green when the price rose and red when it fell, drawn as one instanced GPU rect set and one batch of line segments.',
    docsPage: 'candlestick',
    plotlyEquivalent: 'candlestick',
  },
  supplyDefaults: supplyCandlestickDefaults,
  supplyLayoutDefaults: (
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ) => supplyCandlestickLayoutDefaults(layoutIn, layoutOut, ctx),
  calc: calcCandlestick,
  crossTraceCalc: (entries, ctx) => crossTraceCalcCandlestick(entries, ctx.fullLayout),
  extremes: (calc) => priceExtremes(calc),
  plot: candlestickRenderer,
  hoverPoints: priceHoverPoints,
  selectPoints: (calc, _trace, query) => priceSelectPoints(calc, query),
  legendIcon: candlestickLegendIcon,
  describe: (ctx) => describePrices(ctx, 'candlestick'),
};

export { candlestickAttributes, candlestickLayoutAttributes } from './attributes.ts';
