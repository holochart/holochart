/**
 * The `ohlc` trace module (plan E12.2): open, high, low and close per period as a low–high line
 * with open and close ticks, colored by direction, on date, linear, category or range-break axes,
 * with period alignment, a range slider by default, one hover label with all four prices (or split
 * labels) and box / lasso selection. Registered with `register(ohlc)` (ADR-019).
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { priceExtremes, type PriceCalc } from '../shared/calc.ts';
import { describePrices } from '../shared/describe.ts';
import { priceHoverPoints, priceSelectPoints } from '../shared/hover.ts';
import { ohlcLegendIcon } from '../shared/legend.ts';
import { ohlcAttributes } from './attributes.ts';
import { calcOhlc, crossTraceCalcOhlc } from './calc.ts';
import { supplyOhlcDefaults } from './defaults.ts';
import { ohlcRenderer } from './plot.ts';

export const ohlc: TraceModule<PriceCalc, typeof ohlcAttributes.children> = {
  type: 'ohlc',
  categories: ['cartesian', 'showLegend'],
  schema: ohlcAttributes,
  meta: {
    description:
      'OHLC bars: the open, high, low and close of each period as a low–high line with an open tick on the left and a close tick on the right, green when the price rose and red when it fell, drawn as batched GPU line segments.',
    docsPage: 'ohlc',
    plotlyEquivalent: 'ohlc',
  },
  supplyDefaults: supplyOhlcDefaults,
  calc: calcOhlc,
  crossTraceCalc: (entries) => crossTraceCalcOhlc(entries),
  extremes: (calc) => priceExtremes(calc),
  plot: ohlcRenderer,
  hoverPoints: priceHoverPoints,
  selectPoints: (calc, _trace, query) => priceSelectPoints(calc, query),
  legendIcon: ohlcLegendIcon,
  describe: (ctx) => describePrices(ctx, 'ohlc'),
};

export { ohlcAttributes } from './attributes.ts';
