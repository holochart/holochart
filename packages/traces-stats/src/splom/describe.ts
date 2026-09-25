/**
 * Accessible description of a scatter plot matrix (plan E17.1): the sample and dimension counts,
 * each dimension's name and range, and a table of the first samples (one column per dimension).
 */
import {
  accessibleText,
  countText,
  formatPlainNumber,
  listText,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { SplomCalc } from './calc.ts';
import { dimensionsOf } from './defaults.ts';

function cellText(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return formatPlainNumber(v);
  if (v instanceof Date) return v.toISOString();
  return accessibleText(v);
}

/** Range of a numeric column as text, or '' when it has no finite value. */
function rangeText(values: ArrayLike<unknown> | undefined, n: number): string {
  if (!values) return '';
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return '';
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? `${formatPlainNumber(lo)} to ${formatPlainNumber(hi)}` : '';
}

/** The splom module's `describe()`. */
export function describeSplom(ctx: DescribeContext<SplomCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const name = traceNameText(trace['name'], ctx.index);
  const dims = dimensionsOf(trace).filter((d) => d.visible);
  const labels = dims.map((d, i) => accessibleText(d.label) || `dimension ${i + 1}`);
  const ranges = dims.map((d, i) => {
    const r = rangeText(d.values, calc.length);
    return r ? `${labels[i]} ${r}` : (labels[i] as string);
  });
  const rows: string[][] = [];
  const shown = Math.min(calc.length, ctx.maxRows);
  for (let i = 0; i < shown; i++) rows.push(dims.map((d) => cellText(d.values?.[i])));
  return {
    kind: 'scatter plot matrix',
    summary: `Scatter plot matrix "${name}": ${countText(calc.length, 'sample')} of ${countText(dims.length, 'dimension')} (${listText(ranges)}), each pair of dimensions plotted against each other.`,
    table: {
      caption: `${name}: samples`,
      columns: labels,
      rows,
      total: calc.length,
    },
  };
}
