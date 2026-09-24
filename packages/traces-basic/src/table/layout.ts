/**
 * Table geometry (plan E9.13), after plotly.js' `data_preparation_helper.js` and `plot.js`: the
 * table fills its domain (`floor`ed to whole px), columns share the width in proportion to
 * `columnwidth` and are placed left to right in display order, the header rows sit on top and the
 * body rows scroll below them. Pure: text sizes come from the metrics oracle.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { TableCalc } from './calc.ts';
import {
  blockOf,
  cellStyle,
  cellText,
  EMPTY_HEADER_HEIGHT,
  layoutCell,
  measureWidth,
  type CellLayout,
  type CellStyle,
  type Measure,
  type TableBlock,
} from './cells.ts';

/** A column as placed, in display order. */
export interface ColumnGeometry {
  /** Data index. */
  readonly index: number;
  /** Left edge relative to the table, px. */
  readonly x: number;
  readonly width: number;
}

/**
 * Column widths by data index: `weight / Σ weights` of the table width (Plotly fits the columns in
 * the available width; there is no horizontal scrolling).
 */
export function columnWidths(calc: TableCalc, width: number): number[] {
  let sum = 0;
  for (const c of calc.columns) sum += c.weight;
  return calc.columns.map((c) => (sum > 0 ? (c.weight / sum) * width : 0));
}

/** Columns placed left to right in `order` (data indices). */
export function placeColumns(
  widths: readonly number[],
  order: readonly number[],
): ColumnGeometry[] {
  let x = 0;
  return order.map((index) => {
    const width = widths[index] ?? 0;
    const column = { index, x, width };
    x += width;
    return column;
  });
}

/** One laid-out cell: content, style and text layout. */
export interface LaidOutCell {
  /** Data column. */
  readonly column: number;
  readonly style: CellStyle;
  readonly layout: CellLayout;
}

/** A value of `block` at data column `col`, row `row` (empty past the column's end). */
export function cellValue(calc: TableCalc, block: TableBlock, col: number, row: number): unknown {
  const column = calc.columns[col];
  if (!column) return '';
  if (block === 'header') return row < column.header.length ? column.header[row] : '';
  return row < column.cells.length ? column.cells[row] : '';
}

/** Lay out every cell of one row of `block` (data order) and the row height it needs. */
export function layoutRow(
  trace: FullTrace,
  calc: TableCalc,
  block: TableBlock,
  row: number,
  widths: readonly number[],
  measure: Measure = measureWidth,
): { cells: LaidOutCell[]; height: number } {
  const spec = blockOf(trace, block);
  const declared = Number(spec['height']);
  let height = Number.isFinite(declared) ? declared : 0;
  if (block === 'header' && !calc.hasHeader) height = EMPTY_HEADER_HEIGHT;
  const cells: LaidOutCell[] = [];
  for (const column of calc.columns) {
    const col = column.index;
    const style = cellStyle(spec, col, row);
    const content = cellText(spec, cellValue(calc, block, col, row), col, row);
    const layout = layoutCell(content, style.font, widths[col] ?? 0, measure);
    height = Math.max(height, layout.height);
    cells.push({ column: col, style, layout });
  }
  // Plotly leaves the cells that don't grow at their short-row baseline, above the first line of
  // the cells that made the row grow; aligning them on one baseline reads better.
  if (cells.some((c) => c.layout.height > 0)) {
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]!;
      if (c.layout.baseline !== c.layout.grownBaseline) {
        cells[i] = { ...c, layout: { ...c.layout, baseline: c.layout.grownBaseline } };
      }
    }
  }
  return { cells, height };
}

/** The header rows, laid out: every cell and each row's height. */
export interface HeaderLayout {
  readonly rows: readonly { cells: LaidOutCell[]; height: number }[];
  /** Total header height, px. */
  readonly height: number;
}

/** Lay out the header (a table without `header.values` gets one empty 16 px row, as in Plotly). */
export function layoutHeader(
  trace: FullTrace,
  calc: TableCalc,
  widths: readonly number[],
  measure: Measure = measureWidth,
): HeaderLayout {
  const rows = [];
  let height = 0;
  for (let r = 0; r < calc.headerRows; r++) {
    const row = layoutRow(trace, calc, 'header', r, widths, measure);
    rows.push(row);
    height += row.height;
  }
  return { rows, height };
}
