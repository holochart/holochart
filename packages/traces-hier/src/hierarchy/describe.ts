/**
 * Accessible description of a hierarchy trace (plan E17.1; sunburst, later treemap and icicle):
 * node and level counts, the current root and its largest children with their shares, plus a table
 * of the nodes (label, path, value and percent of the root), formatted like the trace's labels.
 */
import {
  accessibleText,
  countText,
  listText,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { HierarchyCalc } from './calc.ts';
import { formatNodePercent, formatNodeValue, nodePath } from './format.ts';
import { findEntry } from './levels.ts';

/** Largest children of the entry named in the summary. */
const TOP_CHILDREN = 3;

/** The `describe()` of a hierarchy trace; `noun` names it (`'Sunburst'`). */
export function describeHierarchy(
  ctx: DescribeContext<HierarchyCalc>,
  noun: string,
): TraceDescription {
  const { trace, calc } = ctx;
  const kind = noun.toLowerCase();
  const name = traceNameText(trace['name'], ctx.index);
  const hierarchy = calc.hierarchy;
  if (!hierarchy) {
    return {
      kind,
      summary: `${noun} "${name}": the hierarchy could not be built${calc.error ? ` (${calc.error})` : ''}.`,
    };
  }
  const nodes = hierarchy.nodes.filter((n) => !n.generated || n.generated === 'implied');
  const levels = hierarchy.root.height + (hierarchy.hasMultipleRoots ? 0 : 1);
  const entry = findEntry(hierarchy, trace['level']);
  const total = hierarchy.root.value;
  const share = (v: number): string => (total > 0 ? formatNodePercent(v / total) : '');
  let summary = `${noun} "${name}": ${countText(nodes.length, 'node')} on ${countText(levels, 'level')}`;
  if (entry !== hierarchy.root && entry.label) {
    summary += `, showing ${accessibleText(entry.label)} (${share(entry.value)} of the total)`;
  }
  summary += '.';
  const top = [...entry.children].sort((a, b) => b.value - a.value).slice(0, TOP_CHILDREN);
  if (top.length > 0 && entry.value > 0) {
    const items = top.map(
      (n) => `${accessibleText(n.label)} ${formatNodePercent(n.value / entry.value)}`,
    );
    summary += ` ${top.length === 1 ? 'Branch' : 'Largest branches'}: ${listText(items)}.`;
  }
  const rows = nodes
    .slice(0, ctx.maxRows)
    .map((n) => [
      accessibleText(n.label),
      accessibleText(nodePath(n)),
      formatNodeValue(n.value),
      share(n.value),
    ]);
  return {
    kind,
    summary,
    table: {
      caption: name,
      columns: ['Label', 'Path', 'Value', 'Percent of root'],
      rows,
      total: nodes.length,
    },
  };
}
