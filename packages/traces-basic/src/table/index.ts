/**
 * The `table` trace module (plan E9.13): a grid of formatted values with a fixed header, placed by
 * `domain` (E4.5), with Plotly's per-column / per-row styling (`gridPick`), d3 `format`, prefix
 * and suffix, word wrapping that grows rows, `columnwidth` and `columnorder` (drag a header cell to
 * reorder; it restyles `columnorder`). Rows are virtualized: only the visible rows are laid out and
 * drawn, so 100k-row tables scroll smoothly with the wheel, by dragging, or with the scrollbar.
 * Core's schema/defaults parts and the runtime's render and interaction parts in one object,
 * registered with `register(table)` (ADR-019).
 *
 * Like Plotly, tables have no hover labels, legend entries or selection.
 *
 * Deferred: styled rich text in cells (tags are stripped until E2.10's rich text is integrated),
 * LaTeX, the column-move and scrollbar transitions (E7.3).
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { tableAttributes } from './attributes.ts';
import { calcTable, type TableCalc } from './calc.ts';
import { supplyTableDefaults } from './defaults.ts';
import { describeTable } from './describe.ts';
import { tableRenderer } from './plot.ts';

export const table: TraceModule<TableCalc, typeof tableAttributes.children> = {
  type: 'table',
  categories: ['domain', 'noOpacity'],
  schema: tableAttributes,
  meta: {
    description:
      'Tables: formatted values in columns with a fixed header, placed by `domain`; virtualized rows (only the visible ones are laid out and drawn) with wheel, drag and scrollbar scrolling, and drag-to-reorder columns.',
    docsPage: 'table',
    plotlyEquivalent: 'table',
  },
  supplyDefaults: supplyTableDefaults,
  calc: calcTable,
  plot: tableRenderer,
  describe: describeTable,
};

export { tableAttributes } from './attributes.ts';
export type { TableCalc, TableColumn } from './calc.ts';
