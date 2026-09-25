/**
 * Accessible description of a `parcoords` trace (plan E17.1, E10.10): the dimensions with their
 * ranges, the brushed constraint ranges and how many lines they select, and a table with one row
 * per line (the first `ctx.maxRows`), one column per dimension in display order.
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
import type { ParcoordsCalc } from './calc.ts';
import { dimensionContainer } from './layout.ts';
import { selectionMask } from './lines.ts';
import { parseRanges, type Range } from './ranges.ts';

const num = (v: unknown): string =>
  typeof v === 'number' ? formatPlainNumber(v) : accessibleText(v);

/** The `parcoords` trace's description. */
export function describeParcoords(ctx: DescribeContext<ParcoordsCalc>): TraceDescription {
  const { calc, trace } = ctx;
  const names = calc.dimensions.map((d, i) => accessibleText(d.label) || `Dimension ${i + 1}`);
  const constraints = new Map<number, readonly Range[]>();
  const brushed: string[] = [];
  calc.dimensions.forEach((dim, d) => {
    const ranges = parseRanges(dimensionContainer(trace, dim)['constraintrange']);
    if (ranges.length === 0) return;
    constraints.set(d, ranges);
    brushed.push(`${names[d]} ${ranges.map(([a, b]) => `${num(a)} to ${num(b)}`).join(' or ')}`);
  });
  const axes = calc.dimensions.map((dim, d) => {
    const [a, b] = dim.range;
    return `${names[d]} (${num(Math.min(a, b))} to ${num(Math.max(a, b))})`;
  });
  const name = traceNameText(trace.name, ctx.index);
  let summary = `Parallel coordinates "${name}": ${countText(calc.length, 'line')} across ${countText(calc.dimensions.length, 'axis', 'axes')}: ${listText(axes)}.`;
  const mask = selectionMask(calc, constraints);
  if (mask) {
    let selected = 0;
    for (let i = 0; i < calc.length; i++) selected += mask[i]!;
    summary += ` Brushed: ${listText(brushed)}; ${selected.toLocaleString('en-US')} of ${calc.length.toLocaleString('en-US')} lines selected.`;
  }
  const colors = calc.colors;
  const shown = Math.max(0, Math.min(calc.length, ctx.maxRows));
  const rows: string[][] = [];
  for (let r = 0; r < shown; r++) {
    const row = calc.dimensions.map((d) => num(d.values[r]));
    if (colors) row.push(num(colors[r]));
    if (mask) row.push(mask[r] ? 'yes' : 'no');
    rows.push(row);
  }
  return {
    kind: 'parallel coordinates',
    summary,
    table: {
      caption: name,
      columns: [...names, ...(colors ? ['Color value'] : []), ...(mask ? ['Selected'] : [])],
      rows,
      total: calc.length,
    },
  };
}
