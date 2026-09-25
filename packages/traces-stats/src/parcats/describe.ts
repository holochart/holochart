/**
 * Accessible description of a `parcats` trace (plan E17.1, E10.11): its dimensions, paths and
 * total count, and a table with one row per path — its category in each dimension (in display
 * order), its count and, for numeric `line.color`, its color value. Only the first `ctx.maxRows`
 * paths are built.
 */
import {
  accessibleText,
  countText,
  listText,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { ParcatsCalc } from './calc.ts';
import { defaultOrder } from './layout.ts';

/** The `parcats` trace's description: a summary and one row per path. */
export function describeParcats(ctx: DescribeContext<ParcatsCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const dims = defaultOrder(calc).dims.map((d) => calc.dimensions[d]!);
  const columns = dims.map((d) => accessibleText(d.label) || `Dimension ${d.container + 1}`);
  const paths = calc.paths.filter((p) => p.count > 0);
  const rows = paths.slice(0, Math.max(0, ctx.maxRows)).map((p) => {
    const row = dims.map((d) => accessibleText(d.categories[p.categories[d.index]!]!.label));
    row.push(String(p.count));
    if (calc.numeric) row.push(String(p.rawColor));
    return row;
  });
  const name = traceNameText(trace.name, ctx.index);
  return {
    kind: 'parallel categories',
    summary: `Parallel categories "${name}": ${countText(dims.length, 'dimension')} (${listText(columns)}), ${countText(paths.length, 'path')}, total count ${calc.total}.`,
    table: {
      caption: name,
      columns: [...columns, 'Count', ...(calc.numeric ? ['Color'] : [])],
      rows,
      total: paths.length,
    },
  };
}
