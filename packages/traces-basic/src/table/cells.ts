/**
 * Cell content and style of a `table` (plan E9.13), ported from plotly.js' `traces/table/plot.js`:
 * Plotly's `gridPick` for per-column / per-row styling, `populateCellText` for the text (prefix,
 * d3 `format`, suffix) and when it may wrap or grow its row, `wrapTextMaker` for word wrapping and
 * `updateYPositionMaker` / `xPosition` for the text position and the row height it needs.
 *
 * Pure: text sizes come from the render layer's synchronous metrics oracle, so layout is unit
 * tested without a GPU.
 *
 * Rich text: tags are stripped the way scatter text does (`<br>` breaks lines, entities are
 * decoded) until the styled-run rich text engine (E2.10) is integrated; `<b>` etc. then style runs.
 */
import { formatNumber, isArrayLike, toRGBA, type FullTrace, type RGBA } from '@mk7s/holochart-core';
import { measureText, type TextFont, type TextFontWeight } from '@mk7s/holochart-render';
import { plainText } from '../scatter/text-position.ts';

/** Plotly's `cellPad`: px between the text and the cell's left/right and top/bottom edges. */
export const CELL_PAD = 8;
/** Line advance of multi-line cell text as a multiple of the font size (Plotly's tspans). */
export const LINE_SPACING = 1.3;
/** Height of the header strip Plotly draws when a table has no `header.values`. */
export const EMPTY_HEADER_HEIGHT = 16;
/** Plotly's `latexCheck`: such values are shown as given, without prefix, suffix or format. */
const LATEX = /^\$.*\$$/;
const TRANSPARENT: RGBA = [0, 0, 0, 0];

/** Which block a cell belongs to. */
export type TableBlock = 'header' | 'cells';

/**
 * Plotly's `gridPick`: a style value for column `col` and row `row` from a scalar, one entry per
 * column, or per column an array per row. Short arrays repeat their last entry.
 */
export function gridPick(spec: unknown, col: number, row: number): unknown {
  if (!isArrayLike(spec)) return spec;
  if (spec.length === 0) return undefined;
  const column = spec[Math.min(col, spec.length - 1)];
  if (!isArrayLike(column)) return column;
  return column.length === 0 ? undefined : column[Math.min(row, column.length - 1)];
}

/** Resolved text and flags of one cell (Plotly's `populateCellText`). */
export interface CellText {
  /** Plain text to draw (tags stripped, `<br>` as `\n`). */
  readonly text: string;
  /** Wrap at spaces to the column width (string values without `<br>`). */
  readonly wrap: boolean;
  /**
   * The row may grow to fit the text (Plotly's `cellHeightMayIncrease`: line breaks, markup or a
   * space). Other cells keep the row height and put their baseline at 0.75 em below the padding.
   */
  readonly grow: boolean;
}

function isNumericValue(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string' && v.trim() !== '') return Number.isFinite(Number(v));
  return false;
}

/** Format a value with a d3-format specifier (non-numeric values are shown as they are). */
export function formatCellValue(value: unknown, format: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof format === 'string' && format !== '' && isNumericValue(value)) {
    return formatNumber(Number(value), { tickformat: format });
  }
  return String(value);
}

/** The block container (`trace.header` / `trace.cells`). */
export function blockOf(trace: FullTrace, block: TableBlock): Record<string, unknown> {
  return (trace[block] ?? {}) as Record<string, unknown>;
}

/** Text of the cell at data column `col`, row `row` of `block`, holding `value`. */
export function cellText(
  spec: Record<string, unknown>,
  value: unknown,
  col: number,
  row: number,
): CellText {
  const isString = typeof value === 'string';
  const hasBreaks = isString && /<br>/i.test(value);
  const markup = isString && /[<&>]/.test(value);
  const latex = isString && LATEX.test(value);
  let raw: string;
  if (latex) raw = value;
  else {
    const prefix = gridPick(spec['prefix'], col, row);
    const suffix = gridPick(spec['suffix'], col, row);
    const format = gridPick(spec['format'], col, row);
    raw =
      (prefix == null ? '' : String(prefix)) +
      formatCellValue(value, format) +
      (suffix == null ? '' : String(suffix));
  }
  const space = raw.includes(' ');
  return {
    text: markup || hasBreaks ? plainText(raw) : raw,
    wrap: isString && !hasBreaks && !latex && space,
    grow: hasBreaks || latex || markup || space,
  };
}

/** Resolved style of one cell. */
export interface CellStyle {
  readonly font: TextFont;
  readonly color: RGBA;
  readonly align: 'left' | 'center' | 'right';
  readonly fill: RGBA;
  readonly lineColor: RGBA;
  readonly lineWidth: number;
}

function color(v: unknown, fallback: RGBA): RGBA {
  return typeof v === 'string' ? (toRGBA(v) ?? fallback) : fallback;
}

function weight(v: unknown): TextFontWeight | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v === 'bold') return 700;
  if (v === 'normal') return 400;
  return undefined;
}

/** Font of a cell: `font.*` picked per column and row. */
export function cellFont(spec: Record<string, unknown>, col: number, row: number): TextFont {
  const f = (spec['font'] ?? {}) as Record<string, unknown>;
  const family = gridPick(f['family'], col, row);
  const size = Number(gridPick(f['size'], col, row));
  const w = weight(gridPick(f['weight'], col, row));
  const style = gridPick(f['style'], col, row);
  return {
    family: typeof family === 'string' && family !== '' ? family : 'sans-serif',
    size: Number.isFinite(size) && size > 0 ? size : 12,
    ...(w !== undefined ? { weight: w } : {}),
    ...(style === 'italic' ? { style: 'italic' as const } : {}),
  };
}

/** Style of the cell at data column `col`, row `row`. */
export function cellStyle(spec: Record<string, unknown>, col: number, row: number): CellStyle {
  const font = (spec['font'] ?? {}) as Record<string, unknown>;
  const line = (spec['line'] ?? {}) as Record<string, unknown>;
  const fill = (spec['fill'] ?? {}) as Record<string, unknown>;
  const align = gridPick(spec['align'], col, row);
  const width = Number(gridPick(line['width'], col, row));
  return {
    font: cellFont(spec, col, row),
    color: color(gridPick(font['color'], col, row), [0.27, 0.27, 0.27, 1]),
    align: align === 'left' || align === 'right' ? align : 'center',
    fill: color(gridPick(fill['color'], col, row), TRANSPARENT),
    lineColor: color(gridPick(line['color'], col, row), TRANSPARENT),
    lineWidth: Number.isFinite(width) && width > 0 ? width : 0,
  };
}

/** Width of `text` in `font` (px). */
export type Measure = (text: string, font: TextFont) => number;

/** The default measure: the render layer's shared metrics oracle. */
export const measureWidth: Measure = (text, font) => measureText(text, font).width;

/**
 * Plotly's `wrapText`: split at spaces and fill lines greedily, each word counting its width plus
 * one space, up to `limit` px (the column width minus the padding on both sides). A word wider than
 * the limit gets a line of its own (Plotly starts such a cell with an empty line; that quirk is not
 * reproduced).
 */
export function wrapWords(text: string, font: TextFont, limit: number, measure: Measure): string[] {
  const words = text.split(' ');
  // Measured between two letters: widths exclude trailing whitespace (like troika), so a lone
  // space measures 0.
  const space = Math.max(0, measure('n n', font) - measure('nn', font));
  const lines: string[] = [];
  let line: string[] = [];
  let length = 0;
  for (const word of words) {
    const add = measure(word, font) + space;
    if (line.length > 0 && length + add > limit) {
      lines.push(line.join(' '));
      line = [];
      length = 0;
    }
    line.push(word);
    length += add;
  }
  if (line.length > 0) lines.push(line.join(' '));
  return lines;
}

/** One laid-out cell: its lines and the row height it needs. */
export interface CellLayout {
  readonly lines: readonly string[];
  /** Height the row needs for this cell (0 when it keeps the declared row height). */
  readonly height: number;
  /** Baseline of the first line below the cell top, px. */
  readonly baseline: number;
  /** Baseline the cell uses in a row that grew to fit text: the text top at the padding. */
  readonly grownBaseline: number;
}

/** Font ascent and descent in px (fractions of the size from the metrics oracle). */
function verticalMetrics(font: TextFont): { ascent: number; descent: number } {
  const m = measureText('', font);
  return { ascent: m.ascent, descent: m.descent };
}

/**
 * Lines of a cell and the height it needs in a column `width` px wide. Growing cells (see
 * {@link CellText.grow}) need their text block plus {@link CELL_PAD} above and below, with lines
 * {@link LINE_SPACING} em apart and the first line's top at the padding; other cells never grow and
 * put their baseline at `CELL_PAD + 0.75 em` (Plotly's `dy: 0.75em`), unless their row grew (see
 * `layoutRow`).
 */
export function layoutCell(
  content: CellText,
  font: TextFont,
  width: number,
  measure: Measure = measureWidth,
): CellLayout {
  const text = content.text;
  const lines = content.wrap
    ? wrapWords(text, font, width - 2 * CELL_PAD, measure)
    : text.split('\n');
  const { ascent, descent } = verticalMetrics(font);
  const grownBaseline = CELL_PAD + ascent;
  if (!content.grow) {
    return { lines, height: 0, baseline: CELL_PAD + 0.75 * font.size, grownBaseline };
  }
  const block = (lines.length - 1) * LINE_SPACING * font.size + ascent + descent;
  return { lines, height: block + 2 * CELL_PAD, baseline: grownBaseline, grownBaseline };
}
