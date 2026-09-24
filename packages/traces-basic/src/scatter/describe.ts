/**
 * Accessible description of a scatter trace (plan E17.1): its kind (line, area, bubble or
 * scatter), point count, x extent and where y is lowest and highest, formatted like the axes'
 * hover labels, plus a table of the first points. One pass over the points, no allocation per
 * point.
 */
import { getIn, isArrayLike } from '@mk7s/holochart-core';
import {
  accessibleText,
  countText,
  formatAxisValue,
  traceNameText,
  type AxisInfo,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { ScatterCalc } from './calc.ts';
import { hasFill, hasLines, isBubble } from './defaults.ts';

/** `'line'`, `'area'`, `'bubble'` or `'scatter'`, from `mode`, `fill` and per-point sizes. */
export function scatterKind(trace: Readonly<Record<string, unknown>>): string {
  if (hasFill(trace)) return 'area';
  if (hasLines(trace['mode'])) return 'line';
  return isBubble(trace) ? 'bubble' : 'scatter';
}

function axisTitle(axis: AxisInfo | undefined, fallback: string): string {
  return accessibleText(axis ? getIn(axis.full, 'title.text') : undefined) || fallback;
}

/** The scatter module's `describe()`. */
export function describeScatter(ctx: DescribeContext<ScatterCalc>): TraceDescription {
  const { trace, calc, xaxis, yaxis } = ctx;
  const kind = scatterKind(trace);
  const name = traceNameText(trace['name'], ctx.index);
  // Stacked traces describe their own values, not the stacked positions.
  const { x, y } = calc.stack?.raw ?? calc;
  const n = Math.min(calc.length, x.length, y.length);
  const fx = (l: number): string => formatAxisValue(xaxis, l);
  const fy = (l: number): string => formatAxisValue(yaxis, l);

  let valid = 0;
  let xMin = Infinity;
  let xMax = -Infinity;
  let low = -1;
  let high = -1;
  for (let i = 0; i < n; i++) {
    const xi = x[i] as number;
    const yi = y[i] as number;
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    valid++;
    if (xi < xMin) xMin = xi;
    if (xi > xMax) xMax = xi;
    if (low < 0 || yi < (y[low] as number)) low = i;
    if (high < 0 || yi > (y[high] as number)) high = i;
  }

  let summary = `${kind.charAt(0).toUpperCase()}${kind.slice(1)} "${name}": ${countText(n, 'point')}.`;
  if (valid > 0) {
    const at = (i: number): string => `${fy(y[i] as number)} at x = ${fx(x[i] as number)}`;
    summary += ` x from ${fx(xMin)} to ${fx(xMax)}.`;
    summary += valid > 1 ? ` Lowest y ${at(low)}, highest ${at(high)}.` : ` y ${at(low)}.`;
  }
  if (valid < n) summary += ` ${countText(n - valid, 'point')} without a value.`;

  const text = trace['text'];
  const hasText = isArrayLike(text);
  const columns = [axisTitle(xaxis, 'x'), axisTitle(yaxis, 'y')];
  if (hasText) columns.push('text');
  const shown = Math.min(n, ctx.maxRows);
  const rows: string[][] = [];
  for (let i = 0; i < shown; i++) {
    const row = [fx(x[i] as number), fy(y[i] as number)];
    if (hasText) row.push(accessibleText((text as ArrayLike<unknown>)[i]));
    rows.push(row);
  }
  return { kind, summary, table: { caption: name, columns, rows, total: n } };
}
