/**
 * Accessible description of contour plots (plan E17.1): the grid size, the levels (or the
 * constraint) and where the highest and lowest values are; the table lists the grid points (first
 * rows only).
 */
import {
  formatPlainNumber,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import { axisHoverText } from '@mk7s/holochart-traces-stats';
import type { ContourTraceCalc } from './calc.ts';

const OPERATION_TEXT: Readonly<Record<string, string>> = {
  '=': 'equal to',
  '<': 'below',
  '<=': 'at most',
  '>': 'above',
  '>=': 'at least',
};

/** `describe()` of contour traces. */
export function describeContour(ctx: DescribeContext<ContourTraceCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const kind = 'contour plot';
  const name = traceNameText(trace['name'], ctx.index);
  if (calc.nx === 0 || calc.ny === 0) {
    return { kind, summary: `Contour plot "${name}": no data.` };
  }
  const xt = (i: number): string =>
    axisHoverText(ctx.xaxis, calc.x.centers[i]!, trace['xhoverformat']);
  const yt = (j: number): string =>
    axisHoverText(ctx.yaxis, calc.y.centers[j]!, trace['yhoverformat']);
  let hi = -1;
  let lo = -1;
  for (let k = 0; k < calc.z.length; k++) {
    const v = calc.z[k]!;
    if (!Number.isFinite(v)) continue;
    if (hi < 0 || v > calc.z[hi]!) hi = k;
    if (lo < 0 || v < calc.z[lo]!) lo = k;
  }
  let summary = `Contour plot "${name}": ${calc.nx} × ${calc.ny} grid`;
  const levels = calc.levels.levels;
  const c = calc.constraint;
  if (c) {
    const v = c.value;
    const op = c.operation;
    summary +=
      typeof v === 'number'
        ? `, region where the value is ${OPERATION_TEXT[op] ?? op} ${formatPlainNumber(v)}.`
        : `, region where the value is ${op.startsWith('[') || op.startsWith('(') ? 'between' : 'outside'} ${formatPlainNumber(v[0])} and ${formatPlainNumber(v[1])}.`;
  } else if (levels.length > 0) {
    summary += `, ${levels.length} level${levels.length === 1 ? '' : 's'} from ${formatPlainNumber(levels[0]!)} to ${formatPlainNumber(levels[levels.length - 1]!)}.`;
  } else summary += '.';
  const at = (k: number): string => `x ${xt(k % calc.nx)}, y ${yt(Math.floor(k / calc.nx))}`;
  if (hi >= 0) summary += ` Highest value ${formatPlainNumber(calc.z[hi]!)} at ${at(hi)}.`;
  if (lo >= 0) summary += ` Lowest value ${formatPlainNumber(calc.z[lo]!)} at ${at(lo)}.`;
  const rows: string[][] = [];
  let total = 0;
  for (let j = 0; j < calc.ny; j++) {
    for (let i = 0; i < calc.nx; i++) {
      const v = calc.z[j * calc.nx + i]!;
      if (!Number.isFinite(v)) continue;
      total++;
      if (rows.length < ctx.maxRows) rows.push([xt(i), yt(j), formatPlainNumber(v)]);
    }
  }
  return {
    kind,
    summary,
    table: { caption: name, columns: ['x', 'y', 'z'], rows, total },
    insight: {
      kind: 'grid',
      nx: calc.nx,
      ny: calc.ny,
      z: calc.z,
      xText: xt,
      yText: yt,
      formatValue: formatPlainNumber,
    },
  };
}
