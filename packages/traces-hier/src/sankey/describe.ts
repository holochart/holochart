/**
 * Accessible description of a `sankey` trace (plan E17.1, E13.5a): its nodes, links and total
 * flow (the sum of the source nodes' outflows), whether it has cycles, and a table with one row
 * per link — source, target, value and label. Only the first `ctx.maxRows` links are built.
 */
import {
  accessibleText,
  countText,
  formatPlainNumber,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { SankeyCalc } from './calc.ts';

/** The `sankey` trace's description: a summary and one row per link. */
export function describeSankey(ctx: DescribeContext<SankeyCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const name = traceNameText(trace.name, ctx.index);
  const label = (i: number): string =>
    accessibleText(calc.nodes[i]!.label) || `Node ${calc.nodes[i]!.index}`;
  const hasIn = new Set(calc.links.map((l) => l.target));
  let total = 0;
  for (const l of calc.links) if (!hasIn.has(l.source)) total += l.value;
  const cycles = calc.circular ? ', with cycles' : '';
  const rows = calc.links
    .slice(0, Math.max(0, ctx.maxRows))
    .map((l) => [
      label(l.source),
      label(l.target),
      formatPlainNumber(l.value),
      accessibleText(l.label),
    ]);
  return {
    kind: 'sankey diagram',
    summary: `Sankey diagram "${name}": ${countText(calc.nodes.length, 'node')}, ${countText(calc.links.length, 'link')}${cycles}, total flow from sources ${formatPlainNumber(total)}.`,
    table: {
      caption: name,
      columns: ['Source', 'Target', 'Value', 'Label'],
      rows,
      total: calc.links.length,
    },
    insight: {
      kind: 'shares',
      part: 'flow',
      length: calc.links.length,
      values: calc.links.map((l) => l.value),
      label: (i) => `${label(calc.links[i]!.source)} → ${label(calc.links[i]!.target)}`,
      total,
      formatValue: formatPlainNumber,
    },
  };
}
