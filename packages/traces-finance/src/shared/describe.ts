/**
 * Accessible descriptions of `ohlc` and `candlestick` traces (plan E17.1): the bar count and x
 * span, the first and last close with the lowest low and highest high, how many bars rose and
 * fell, and a table of every bar's prices (first rows only), formatted like the axes' hover
 * labels.
 */
import {
  countText,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { PriceCalc } from './calc.ts';
import { axisText } from './hover.ts';

/** The `describe()` of a financial trace: `ohlc` (bars) or `candlestick` (candles). */
export function describePrices(
  ctx: DescribeContext<PriceCalc>,
  kind: 'ohlc' | 'candlestick',
): TraceDescription {
  const { trace, calc } = ctx;
  const name = traceNameText(trace['name'], ctx.index);
  const [chart, noun] = kind === 'ohlc' ? ['OHLC chart', 'bar'] : ['Candlestick chart', 'candle'];
  const { drawn } = calc;
  const fx = (l: number): string => axisText(ctx.xaxis, l, trace['xhoverformat']);
  const fy = (l: number): string => axisText(ctx.yaxis, l, trace['yhoverformat']);
  let summary = `${chart} "${name}": ${countText(drawn.length, noun)}`;
  if (drawn.length === 0) return { kind, summary: `${summary}.` };
  const first = drawn[0]!;
  const last = drawn[drawn.length - 1]!;
  let lowest = first;
  let highest = first;
  let rising = 0;
  for (const i of drawn) {
    if (calc.low[i]! < calc.low[lowest]!) lowest = i;
    if (calc.high[i]! > calc.high[highest]!) highest = i;
    rising += calc.increasing[i]!;
  }
  summary +=
    drawn.length > 1
      ? ` from ${fx(calc.origPos[first]!)} to ${fx(calc.origPos[last]!)}.`
      : ` at ${fx(calc.origPos[first]!)}.`;
  summary +=
    drawn.length > 1
      ? ` Close from ${fy(calc.close[first]!)} to ${fy(calc.close[last]!)};`
      : ` Close ${fy(calc.close[first]!)};`;
  summary += ` lowest low ${fy(calc.low[lowest]!)} at ${fx(calc.origPos[lowest]!)}, highest high ${fy(calc.high[highest]!)} at ${fx(calc.origPos[highest]!)}.`;
  summary += ` ${rising} rising, ${drawn.length - rising} falling.`;
  const row = (k: number): string[] => {
    const i = drawn[k]!;
    return [
      fx(calc.origPos[i]!),
      fy(calc.open[i]!),
      fy(calc.high[i]!),
      fy(calc.low[i]!),
      fy(calc.close[i]!),
    ];
  };
  const rows: string[][] = [];
  for (let k = 0; k < Math.min(drawn.length, ctx.maxRows); k++) rows.push(row(k));
  return {
    kind,
    summary,
    table: {
      caption: name,
      columns: ['x', 'open', 'high', 'low', 'close'],
      rows,
      total: drawn.length,
      row,
    },
    insight: {
      kind: 'prices',
      points: drawn,
      x: calc.origPos,
      open: calc.open,
      high: calc.high,
      low: calc.low,
      close: calc.close,
      formatX: fx,
      formatY: fy,
    },
  };
}
