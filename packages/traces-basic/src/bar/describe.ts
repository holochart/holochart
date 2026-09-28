/**
 * Accessible description of a bar trace (plan E17.1): bar count and the largest and smallest bar
 * with their positions, formatted like the axes' hover labels, plus a table of the first bars
 * (every bar on demand) and the bars for the generated summary (E17.2).
 * Values are each bar's own value (after `barnorm`), not the stacked top.
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
import type { BarCalc } from './calc.ts';

function axisTitle(axis: AxisInfo | undefined, fallback: string): string {
  return accessibleText(axis ? getIn(axis.full, 'title.text') : undefined) || fallback;
}

/** The bar module's `describe()`. */
export function describeBar(ctx: DescribeContext<BarCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const horizontal = calc.orientation === 'h';
  const [pa, sa] = horizontal ? [ctx.yaxis, ctx.xaxis] : [ctx.xaxis, ctx.yaxis];
  const kind = horizontal ? 'horizontal bar' : 'bar';
  const name = traceNameText(trace['name'], ctx.index);
  const n = calc.length;
  const pos = calc.pos;
  const values = calc.bars?.value ?? calc.size;
  const fp = (l: number): string => formatAxisValue(pa, l);
  // Sizes are in calc space: linearize for log axes.
  const fs = (v: number): string =>
    sa ? formatAxisValue(sa, calc.sizeType === 'log' ? Math.log10(v) : v) : formatPlainNumber(v);

  let valid = 0;
  let low = -1;
  let high = -1;
  for (let i = 0; i < n; i++) {
    const v = values[i] as number;
    if (!Number.isFinite(v) || !Number.isFinite(pos[i] as number)) continue;
    valid++;
    if (low < 0 || v < (values[low] as number)) low = i;
    if (high < 0 || v > (values[high] as number)) high = i;
  }

  const label = horizontal ? 'Horizontal bar' : 'Bar';
  let summary = `${label} "${name}": ${countText(n, 'bar')}.`;
  if (valid > 0) {
    const at = (i: number): string => `${fs(values[i] as number)} at ${fp(pos[i] as number)}`;
    summary += valid > 1 ? ` Largest ${at(high)}, smallest ${at(low)}.` : ` Value ${at(high)}.`;
  }
  if (valid < n) summary += ` ${countText(n - valid, 'bar')} without a value.`;

  const letters = horizontal ? ['y', 'x'] : ['x', 'y'];
  const columns = [axisTitle(pa, letters[0] as string), axisTitle(sa, letters[1] as string)];
  const row = (i: number): string[] => [fp(pos[i] as number), fs(values[i] as number)];
  const rows: string[][] = [];
  for (let i = 0; i < Math.min(n, ctx.maxRows); i++) rows.push(row(i));
  // Bars on categories are ranked (E17.2), bars along dates or numbers are a series.
  const categories = pa?.type === 'category' || pa?.type === 'multicategory';
  return {
    kind,
    summary,
    table: { caption: name, columns, rows, total: n, row },
    insight: categories
      ? {
          kind: 'shares',
          part: 'bar',
          length: n,
          values: values as ArrayLike<number>,
          label: (i) => fp(pos[i] as number),
          formatValue: fs,
        }
      : {
          kind: 'series',
          length: n,
          x: pos as ArrayLike<number>,
          y: values as ArrayLike<number>,
          joined: true,
          formatX: fp,
          formatY: fs,
        },
  };
}
