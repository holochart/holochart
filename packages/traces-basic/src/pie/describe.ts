/**
 * Accessible description of a pie trace (plan E17.1): slice count, total and the largest slices
 * with their shares, plus a table of every visible slice (label, value, percent), formatted like
 * the pie's own labels, and the slices for the generated summary (E17.2).
 */
import {
  accessibleText,
  countText,
  listText,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { PieCalc, PieSlice } from './calc.ts';
import { formatPiePercent, formatPieValue } from './helpers.ts';

/** Largest slices named in the summary. */
const TOP_SLICES = 3;

/** The pie module's `describe()`. */
export function describePie(ctx: DescribeContext<PieCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const hole = trace['hole'];
  const kind = typeof hole === 'number' && hole > 0 ? 'donut' : 'pie';
  const name = traceNameText(trace['name'], ctx.index);
  const visible = calc.slices.filter((s) => !s.hidden);
  const hidden = calc.slices.length - visible.length;
  const total = calc.vTotal;
  const share = (s: PieSlice): string => (total > 0 ? formatPiePercent(s.v / total) : '');
  const label = (s: PieSlice): string => accessibleText(s.label);

  let summary = `${kind === 'donut' ? 'Donut' : 'Pie'} "${name}": ${countText(visible.length, 'slice')}`;
  summary += total > 0 ? `, total ${formatPieValue(total)}.` : '.';
  const top = [...visible].sort((a, b) => b.v - a.v).slice(0, TOP_SLICES);
  if (top.length > 0 && total > 0) {
    const items = top.map((s) => `${label(s)} ${share(s)} (${formatPieValue(s.v)})`);
    summary += ` ${top.length === 1 ? 'Slice' : 'Largest'}: ${listText(items)}.`;
  }
  if (hidden > 0) summary += ` ${countText(hidden, 'slice')} hidden.`;

  const row = (i: number): string[] => {
    const s = visible[i]!;
    return [label(s), formatPieValue(s.v), share(s)];
  };
  const rows: string[][] = [];
  for (let i = 0; i < Math.min(visible.length, ctx.maxRows); i++) rows.push(row(i));
  const slices = calc.slices;
  return {
    kind,
    summary,
    table: {
      caption: name,
      columns: ['Label', 'Value', 'Percent'],
      rows,
      total: visible.length,
      row,
    },
    insight: {
      kind: 'shares',
      part: 'slice',
      length: slices.length,
      values: slices.map((s) => s.v),
      label: (i) => label(slices[i]!),
      skip: (i) => slices[i]!.hidden === true,
      formatValue: formatPieValue,
    },
  };
}
