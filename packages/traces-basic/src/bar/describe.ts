/**
 * Accessible description of a bar trace (plan E17.1): bar count and the largest and smallest bar
 * with their positions, formatted like the axes' hover labels, plus a table of the first bars.
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
  const shown = Math.min(n, ctx.maxRows);
  const rows: string[][] = [];
  for (let i = 0; i < shown; i++) rows.push([fp(pos[i] as number), fs(values[i] as number)]);
  return { kind, summary, table: { caption: name, columns, rows, total: n } };
}
