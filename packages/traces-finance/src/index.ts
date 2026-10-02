/**
 * @mk7s/holochart-traces-finance — financial trace types (plan E12, milestone M4): `ohlc`,
 * `candlestick`, `waterfall`, `funnel`, `funnelarea` and `indicator`. Register them like any trace
 * module (`register(...financeTraces)`); the `@mk7s/holochart` bundle registers them for you.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { candlestick } from './candlestick/index.ts';
import { funnel } from './funnel/index.ts';
import { funnelarea } from './funnelarea/index.ts';
import { indicator } from './indicator/index.ts';
import { ohlc } from './ohlc/index.ts';
import { waterfall } from './waterfall/index.ts';

export { ohlc, ohlcAttributes } from './ohlc/index.ts';
export {
  candlestick,
  candlestickAttributes,
  candlestickLayoutAttributes,
} from './candlestick/index.ts';
export type { PriceCalc, PriceSlot } from './shared/calc.ts';
export {
  waterfall,
  waterfallAttributes,
  waterfallLayoutAttributes,
  type WaterfallCalc,
} from './waterfall/index.ts';
export {
  funnel,
  funnelAttributes,
  funnelLayoutAttributes,
  type FunnelCalc,
} from './funnel/index.ts';
export {
  funnelarea,
  funnelareaAttributes,
  funnelareaLayoutAttributes,
  type FunnelareaCalc,
  type FunnelareaSlice,
} from './funnelarea/index.ts';
export { indicator, indicatorAttributes, type IndicatorCalc } from './indicator/index.ts';

/** Every financial trace module, for `register(...financeTraces)`. */
export const financeTraces: readonly Registrable[] = [
  ohlc,
  candlestick,
  waterfall,
  funnel,
  funnelarea,
  indicator,
];

/**
 * Figure input types of this package's traces (backlog S1.6): one per trace type (`CandlestickTrace`, …) and
 * their union, generated from the attribute schemas by `tools/schema-gen`.
 */
export type * from './generated/traces.ts';
