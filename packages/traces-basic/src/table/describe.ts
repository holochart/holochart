/**
 * Accessible description of a `table` (plan E17.1, E9.13): the header and the cells as plain text,
 * in display order, formatted exactly as drawn (prefix, d3 `format`, suffix; tags stripped), for
 * the runtime's visually hidden `<table>` (screen readers, copy and paste). Only the first
 * `ctx.maxRows` rows are built, so describing a 100k-row table stays cheap; `total` tells the
 * runtime how many there are.
 */
import {
  accessibleText,
  countText,
  listText,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { TableCalc } from './calc.ts';
import { blockOf, cellText } from './cells.ts';
import { cellValue } from './layout.ts';

/** Plain text of a cell on one line (line breaks become spaces). */
function plain(text: string): string {
  return accessibleText(text)
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

/** The `table` trace's description: a summary and the table itself. */
export function describeTable(ctx: DescribeContext<TableCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const header = blockOf(trace, 'header');
  const cells = blockOf(trace, 'cells');
  const columns = calc.order.map((col) => {
    const parts: string[] = [];
    for (let r = 0; r < calc.headerRows; r++) {
      const text = plain(cellText(header, cellValue(calc, 'header', col, r), col, r).text);
      if (text) parts.push(text);
    }
    return parts.join(' ') || `Column ${col + 1}`;
  });
  const shown = Math.max(0, Math.min(calc.rowCount, ctx.maxRows));
  const rows: string[][] = [];
  for (let r = 0; r < shown; r++) {
    rows.push(
      calc.order.map((col) =>
        plain(cellText(cells, cellValue(calc, 'cells', col, r), col, r).text),
      ),
    );
  }
  const name = traceNameText(trace.name, ctx.index);
  return {
    kind: 'table',
    summary: `Table "${name}": ${countText(columns.length, 'column')} (${listText(columns)}), ${countText(calc.rowCount, 'row')}.`,
    table: { caption: name, columns, rows, total: calc.rowCount },
  };
}
