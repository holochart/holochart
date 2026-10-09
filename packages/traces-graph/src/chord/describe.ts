/**
 * Accessible description of a `chord` trace (backlog G8, G10, plan E17.1): its nodes, links and
 * groups, the total flow, the largest flows, what was left out, and a table with one row per
 * link — source, target and value, and the label when a link has one: the edge list of the
 * `graph` trace (`../graph/describe.ts`), with the same columns. Only the first `ctx.maxRows`
 * links are built up front; `row` formats any link on demand (E17.3). The generated summary reads
 * the links as shares of the total flow.
 */
import {
  accessibleText,
  countText,
  formatPlainNumber,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { ChordCalc } from './calc.ts';

/** How many of the largest flows the summary names. */
const LARGEST = 3;

/** The `chord` trace's description: a summary and one row per drawn link. */
export function describeChord(ctx: DescribeContext<ChordCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const name = traceNameText(trace.name, ctx.index);
  const label = (i: number): string => accessibleText(calc.names[i]!);
  // The links that are drawn: those the legend did not hide.
  const drawn = calc.layout.ribbons.map((r) => calc.links[r.link]!);
  const flow = (k: number): number => drawn[k]!.value + drawn[k]!.reverse;
  const ends = (k: number): string => {
    const l = drawn[k]!;
    const arrow = calc.directed ? '→' : '—';
    return `${label(l.source)} ${arrow} ${label(l.target)}`;
  };
  const parts = [
    countText(calc.layout.arcs.length, 'node'),
    countText(drawn.length, 'link'),
    ...(calc.groupNames.length > 0 ? [countText(calc.groupNames.length, 'group')] : []),
  ];
  const largest = drawn
    .map((_, k) => k)
    .sort((a, b) => flow(b) - flow(a) || a - b)
    .slice(0, LARGEST)
    .map((k) => `${ends(k)} (${formatPlainNumber(flow(k))})`);
  const sentences = [
    `${calc.directed ? 'Directed chord' : 'Chord'} diagram "${name}": ${parts.join(', ')}, total flow ${formatPlainNumber(calc.total)}.`,
    ...(largest.length > 0 ? [`Largest: ${largest.join('; ')}.`] : []),
    ...(calc.dropped > 0
      ? [`${countText(calc.dropped, 'link')} left out: no valid ends or no positive value.`]
      : []),
  ];
  const labelled = drawn.some((l) => accessibleText(l.label) !== '');
  const row = (k: number): string[] => {
    const l = drawn[k]!;
    return [
      label(l.source),
      label(l.target),
      formatPlainNumber(flow(k)),
      ...(labelled ? [accessibleText(l.label)] : []),
    ];
  };
  const rows: string[][] = [];
  for (let k = 0; k < Math.min(drawn.length, ctx.maxRows); k++) rows.push(row(k));
  return {
    kind: 'chord diagram',
    summary: sentences.join(' '),
    table: {
      caption: name,
      columns: ['Source', 'Target', 'Value', ...(labelled ? ['Label'] : [])],
      rows,
      total: drawn.length,
      row,
    },
    insight: {
      kind: 'shares',
      part: 'flow',
      length: drawn.length,
      values: drawn.map((_, k) => flow(k)),
      label: ends,
      total: calc.total,
      formatValue: formatPlainNumber,
    },
  };
}
