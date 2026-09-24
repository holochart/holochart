/**
 * `table` calc (plan E9.13), after plotly.js' `traces/table/data_preparation_helper.js`: the
 * columns (header values squared into rows, cell values by reference), their relative widths and
 * the display order. Pure and layout-independent: pixel widths, row heights and text wrapping
 * depend on the domain size and are computed by the renderer, lazily for the visible rows only, so
 * calc does no per-row work and a 100k-row table costs nothing here.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';

/** One column, in data order. */
export interface TableColumn {
  /** Data index (Plotly's `specIndex`): what per-column style arrays are indexed by. */
  readonly index: number;
  /** Display position (from `columnorder`), 0 = leftmost. */
  readonly rank: number;
  /** Relative width (`columnwidth`, default 1). */
  readonly weight: number;
  /** Header values, one per header row (padded with `''`). */
  readonly header: readonly unknown[];
  /** Cell values by reference: `cells[row]`; rows past its length are empty. */
  readonly cells: ArrayLike<unknown>;
}

/** Calcdata of a table. */
export interface TableCalc {
  /** Columns in data order. */
  readonly columns: readonly TableColumn[];
  /** Data indices in display order (left to right). */
  readonly order: readonly number[];
  /** Header rows (at least 1 when there are columns; Plotly draws an empty 16 px header). */
  readonly headerRows: number;
  /** `header.values` was given (else the header is the empty 16 px strip). */
  readonly hasHeader: boolean;
  /** Body rows: the longest cell column. */
  readonly rowCount: number;
  /** Largest outline width of the header and cells (Plotly's `maxLineWidth`). */
  readonly maxLineWidth: number;
}

const EMPTY: readonly unknown[] = [];

/** A column entry as an array (Plotly's `squareStringMatrix` wraps scalars). */
function asColumn(v: unknown): ArrayLike<unknown> {
  return isArrayLike(v) ? v : [v];
}

/** Largest number in a value or (nested) array (Plotly's `arrayMax`). */
export function arrayMax(v: unknown): number {
  if (isArrayLike(v)) {
    let max = 0;
    for (let i = 0; i < v.length; i++) max = Math.max(max, arrayMax(v[i]));
    return max;
  }
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Relative width of column `i` from `columnwidth` (Plotly: the last entry repeats; default 1). */
export function columnWeight(columnwidth: unknown, i: number): number {
  const v = isArrayLike(columnwidth)
    ? columnwidth.length > 0
      ? columnwidth[Math.min(i, columnwidth.length - 1)]
      : undefined
    : columnwidth;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Table calc. */
export function calcTable(trace: FullTrace): TableCalc {
  const header = (trace['header'] ?? {}) as Record<string, unknown>;
  const cells = (trace['cells'] ?? {}) as Record<string, unknown>;
  const headerIn = isArrayLike(header['values']) ? header['values'] : EMPTY;
  const cellsIn = isArrayLike(cells['values']) ? cells['values'] : EMPTY;

  const headerCols = Array.from(headerIn, asColumn);
  const cellCols = Array.from(cellsIn, asColumn);
  let headerRows = 0;
  for (const c of headerCols) headerRows = Math.max(headerRows, c.length);
  // Plotly: an empty first header entry still makes one (empty) header row.
  headerRows = Math.max(headerRows, headerCols.length > 0 ? 1 : 0);
  let rowCount = 0;
  for (const c of cellCols) rowCount = Math.max(rowCount, c.length);

  const count = Math.max(headerCols.length, cellCols.length);
  const hasHeader = headerCols.length > 0;
  const rows = Math.max(headerRows, 1);
  const ranks = isArrayLike(trace['columnorder']) ? trace['columnorder'] : EMPTY;
  const columns: TableColumn[] = [];
  for (let i = 0; i < count; i++) {
    const h = headerCols[i] ?? EMPTY;
    const values: unknown[] = [];
    for (let r = 0; r < rows; r++) values.push(r < h.length ? h[r] : '');
    const rank = ranks[i];
    columns.push({
      index: i,
      rank: typeof rank === 'number' && Number.isFinite(rank) ? rank : i,
      weight: columnWeight(trace['columnwidth'], i),
      header: values,
      cells: cellCols[i] ?? EMPTY,
    });
  }
  const order = columns
    .map((c) => c.index)
    .sort((a, b) => columns[a]!.rank - columns[b]!.rank || a - b);
  const line = (b: Record<string, unknown>) => (b['line'] ?? {}) as Record<string, unknown>;
  return {
    columns,
    order,
    headerRows: count > 0 ? rows : 0,
    hasHeader,
    rowCount,
    maxLineWidth: Math.max(arrayMax(line(header)['width']), arrayMax(line(cells)['width'])),
  };
}
