/**
 * Accessible description of a histogram (plan E17.1): sample and bin counts, the bins' range,
 * the largest bin with its range, and a table of the first bins (range, value).
 */
import { getIn } from '@mk7s/holochart-core';
import {
  accessibleText,
  countText,
  formatAxisValue,
  formatPlainNumber,
  traceNameText,
  type AxisInfo,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { HistogramCalc } from './calc.ts';

function axisTitle(axis: AxisInfo | undefined, fallback: string): string {
  return accessibleText(axis ? getIn(axis.full, 'title.text') : undefined) || fallback;
}

/** What the bar values are, from `histfunc` / `histnorm` / `cumulative`. */
function valueName(trace: DescribeContext['trace']): string {
  const func = typeof trace['histfunc'] === 'string' ? trace['histfunc'] : 'count';
  const norm = typeof trace['histnorm'] === 'string' ? trace['histnorm'] : '';
  const cumulative = (trace['cumulative'] as { enabled?: unknown } | undefined)?.enabled === true;
  const base = norm || func;
  return cumulative ? `cumulative ${base}` : base;
}

/** The histogram module's `describe()`. */
export function describeHistogram(ctx: DescribeContext<HistogramCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const horizontal = calc.orientation === 'h';
  const [pa, sa] = horizontal ? [ctx.yaxis, ctx.xaxis] : [ctx.xaxis, ctx.yaxis];
  const name = traceNameText(trace['name'], ctx.index);
  const posLog = (pa?.scale.type ?? calc.posType) === 'log';
  const fp = (c: number): string => formatAxisValue(pa, posLog ? (c > 0 ? Math.log10(c) : NaN) : c);
  const values = calc.bars?.value ?? calc.size;
  const fv = (v: number): string =>
    sa ? formatAxisValue(sa, calc.sizeType === 'log' ? Math.log10(v) : v) : formatPlainNumber(v);
  const range = (i: number): string => `${fp(calc.binStart[i]!)} to ${fp(calc.binEnd[i]!)}`;
  const n = calc.length;
  const samples = typeof trace['_length'] === 'number' ? trace['_length'] : calc.binned;
  const what = valueName(trace);

  let summary = `Histogram "${name}": ${countText(samples, 'sample')} in ${countText(n, 'bin')}`;
  if (n > 0) summary += ` from ${fp(calc.binStart[0]!)} to ${fp(calc.binEnd[n - 1]!)}`;
  summary += '.';
  let high = -1;
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    if (Number.isFinite(v) && (high < 0 || v > values[high]!)) high = i;
  }
  if (high >= 0) summary += ` Largest ${what}: ${fv(values[high]!)} (${range(high)}).`;

  const columns = [
    axisTitle(pa, horizontal ? 'y' : 'x'),
    axisTitle(sa, what.charAt(0).toUpperCase() + what.slice(1)),
  ];
  const rows: string[][] = [];
  for (let i = 0; i < Math.min(n, ctx.maxRows); i++) rows.push([range(i), fv(values[i]!)]);
  return {
    kind: horizontal ? 'horizontal histogram' : 'histogram',
    summary,
    table: { caption: name, columns, rows, total: n },
  };
}
