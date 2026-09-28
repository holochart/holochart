/**
 * Accessible description of polar traces (plan E17.1, E11.4, E11.5): the kind (radar, polar line,
 * polar scatter, polar bar), point count, where `r` is lowest and highest (with the angle, both
 * formatted like the hover labels), and a table of the first points.
 */
import {
  accessibleText,
  countText,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { PolarCalc } from './cross-trace.ts';

function hasFlag(mode: unknown, flag: string): boolean {
  return typeof mode === 'string' && mode.split('+').includes(flag);
}

/** `'radar'`, `'polar line'`, `'polar scatter'` or `'polar bar'`. */
export function polarKind(trace: Readonly<Record<string, unknown>>): string {
  if (trace['type'] === 'barpolar') return 'polar bar';
  const fill = trace['fill'];
  if (fill === 'toself' || fill === 'tonext') return 'radar';
  return hasFlag(trace['mode'], 'lines') ? 'polar line' : 'polar scatter';
}

/** The polar traces' `describe()`. */
export function describePolar(ctx: DescribeContext<PolarCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const kind = polarKind(trace);
  const name = traceNameText(trace['name'], ctx.index);
  const { r, theta, length: n } = calc.coords;
  const sp = calc.subplot;
  const fr = (l: number): string => (sp ? sp.rLabel(l) : String(l));
  const ft = (c: number): string => (sp ? sp.thetaLabel(c) : String(c));
  let valid = 0;
  let low = -1;
  let high = -1;
  for (let i = 0; i < n; i++) {
    const ri = r[i]!;
    if (!Number.isFinite(ri) || !Number.isFinite(theta[i]!)) continue;
    valid++;
    if (low < 0 || ri < r[low]!) low = i;
    if (high < 0 || ri > r[high]!) high = i;
  }
  const unit = kind === 'polar bar' ? 'bar' : 'point';
  let summary = `${kind.charAt(0).toUpperCase()}${kind.slice(1)} "${name}": ${countText(n, unit)}.`;
  if (valid > 0) {
    const at = (i: number): string => `${fr(r[i]!)} at θ = ${ft(theta[i]!)}`;
    summary += valid > 1 ? ` Lowest r ${at(low)}, highest ${at(high)}.` : ` r ${at(low)}.`;
  }
  if (valid < n) summary += ` ${countText(n - valid, unit)} without a value.`;
  const text = trace['text'];
  const hasText = Array.isArray(text);
  const columns = ['r', 'θ'];
  if (hasText) columns.push('text');
  const row = (i: number): string[] => {
    const cells = [fr(r[i]!), ft(theta[i]!)];
    if (hasText) cells.push(accessibleText((text as unknown[])[i]));
    return cells;
  };
  const rows: string[][] = [];
  for (let i = 0; i < Math.min(n, ctx.maxRows); i++) rows.push(row(i));
  return { kind, summary, table: { caption: name, columns, rows, total: n, row } };
}
