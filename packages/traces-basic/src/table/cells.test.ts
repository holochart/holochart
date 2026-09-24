import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import type { TextFont } from '@mk7s/holochart-render';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { calcTable } from './calc.ts';
import {
  CELL_PAD,
  cellStyle,
  cellText,
  formatCellValue,
  gridPick,
  layoutCell,
  LINE_SPACING,
  wrapWords,
  type Measure,
} from './cells.ts';
import { table } from './index.ts';
import { cellLabel, columnWidths, layoutHeader, layoutRow, placeColumns } from './layout.ts';

const registry = createChartRegistry().register(table);

function traceOf(trace: Record<string, unknown>): FullTrace {
  return supplyDefaults({ data: [{ type: 'table', ...trace }], layout: {} }, registry.core)
    .fullData[0]!;
}

/** 1 px per character: wrapping becomes character arithmetic. */
const mono: Measure = (text) => text.length;
const FONT: TextFont = { family: 'sans-serif', size: 10 };

describe('gridPick (per column, per row)', () => {
  it('picks scalars, per-column entries and nested per-row entries, repeating the last', () => {
    expect(gridPick('red', 3, 9)).toBe('red');
    expect(gridPick(['a', 'b'], 0, 5)).toBe('a');
    expect(gridPick(['a', 'b'], 7, 0)).toBe('b');
    expect(gridPick(['a', ['x', 'y']], 1, 0)).toBe('x');
    expect(gridPick(['a', ['x', 'y']], 1, 10)).toBe('y');
    expect(gridPick([], 0, 0)).toBeUndefined();
    expect(gridPick([[]], 0, 0)).toBeUndefined();
  });
});

describe('cell text', () => {
  it('formats numbers with d3-format and leaves other values as they are', () => {
    expect(formatCellValue(1234.5, ',.2f')).toBe('1,234.50');
    expect(formatCellValue('0.25', '.0%')).toBe('25%');
    expect(formatCellValue(-3, '+d')).toBe('−3');
    expect(formatCellValue('n/a', '.2f')).toBe('n/a');
    expect(formatCellValue(12.5, '')).toBe('12.5');
    expect(formatCellValue(null, '.2f')).toBe('');
    expect(formatCellValue(undefined, undefined)).toBe('');
  });

  it('adds prefix and suffix per column and row, and applies the format', () => {
    const spec = { prefix: ['$', ['', '≈']], suffix: [' M'], format: ['.1f'] };
    expect(cellText(spec, 3.14159, 0, 0).text).toBe('$3.1 M');
    expect(cellText(spec, 2, 1, 1).text).toBe('≈2.0 M');
  });

  it('flags wrapping (strings with spaces) and row growth (spaces, <br>, markup) like Plotly', () => {
    expect(cellText({}, 'two words', 0, 0)).toEqual({ text: 'two words', wrap: true, grow: true });
    expect(cellText({}, 'single', 0, 0)).toEqual({ text: 'single', wrap: false, grow: false });
    expect(cellText({}, 'a<br>b', 0, 0)).toEqual({
      text: 'a\nb',
      markup: 'a<br>b',
      wrap: false,
      grow: true,
    });
    expect(cellText({}, '<b>bold</b>', 0, 0)).toEqual({
      text: 'bold',
      markup: '<b>bold</b>',
      wrap: false,
      grow: true,
    });
    // Numbers never wrap, but a suffix with a space still grows the row.
    expect(cellText({ suffix: [' ms'] }, 12, 0, 0)).toEqual({
      text: '12 ms',
      wrap: false,
      grow: true,
    });
    // LaTeX is shown as given, without prefix or suffix.
    expect(cellText({ prefix: ['$'] }, '$x^2$', 0, 0).text).toBe('$x^2$');
  });
});

describe('wrapping and cell layout', () => {
  it('fills lines greedily, each word counting one space (Plotly wrapText)', () => {
    // 'aaa ' = 4, 'bb ' = 3: 7 fits in 8, 'c ' would make 9.
    expect(wrapWords('aaa bb c dddd', FONT, 8, mono)).toEqual(['aaa bb', 'c dddd']);
    expect(wrapWords('longerthanlimit x', FONT, 5, mono)).toEqual(['longerthanlimit', 'x']);
    expect(wrapWords('fits', FONT, 100, mono)).toEqual(['fits']);
  });

  it('measures a space between letters (widths drop trailing spaces)', () => {
    const trimmed: Measure = (t) => t.trimEnd().length;
    expect(wrapWords('aa bb cc', FONT, 6, trimmed)).toEqual(['aa bb', 'cc']);
  });

  it('grows rows by the text block plus the padding; short cells keep the row height', () => {
    const grown = layoutCell(cellText({}, 'aaa bb c dddd', 0, 0), FONT, 8 + 2 * CELL_PAD, mono);
    expect(grown.lines).toEqual(['aaa bb', 'c dddd']);
    expect(grown.height).toBeGreaterThan(2 * CELL_PAD + LINE_SPACING * FONT.size);
    expect(grown.baseline).toBe(grown.grownBaseline);
    const short = layoutCell(cellText({}, 42, 0, 0), FONT, 100, mono);
    expect(short.height).toBe(0);
    expect(short.baseline).toBe(CELL_PAD + 0.75 * FONT.size);
  });

  it('resolves styles per column and row', () => {
    const spec = {
      align: ['left', ['right', 'center']],
      fill: { color: [['#ff0000', '#00ff00']] },
      line: { width: [2, 0], color: 'black' },
      font: { family: 'Mono', size: [11, [8, 14]], color: '#111', weight: 'bold' },
    };
    const a = cellStyle(spec, 0, 1);
    expect(a.align).toBe('left');
    expect(a.fill).toEqual([0, 1, 0, 1]);
    expect(a.lineWidth).toBe(2);
    expect(a.font).toEqual({ family: 'Mono', size: 11, weight: 700 });
    const b = cellStyle(spec, 1, 1);
    expect(b.align).toBe('center');
    expect(b.lineWidth).toBe(0);
    expect(b.font.size).toBe(14);
  });
});

describe('table layout', () => {
  it('shares the width by columnwidth and places columns in display order', () => {
    const calc = calcTable(
      traceOf({
        header: { values: ['a', 'b', 'c'] },
        columnwidth: [2, 1, 1],
        columnorder: [2, 0, 1],
      }),
    );
    const widths = columnWidths(calc, 400);
    expect(widths).toEqual([200, 100, 100]);
    expect(placeColumns(widths, calc.order)).toEqual([
      { index: 1, x: 0, width: 100 },
      { index: 2, x: 100, width: 100 },
      { index: 0, x: 200, width: 200 },
    ]);
  });

  it('grows a row to its tallest cell and aligns the other cells on its baseline', () => {
    const trace = traceOf({
      cells: { values: [['x'], ['one two three four five six']], height: 20 },
    });
    const calc = calcTable(trace);
    const row = layoutRow(trace, calc, 'cells', 0, [40, 40], mono);
    expect(row.cells[1]?.layout.lines.length).toBeGreaterThan(1);
    expect(row.height).toBe(row.cells[1]?.layout.height);
    expect(row.height).toBeGreaterThan(20);
    expect(row.cells[0]?.layout.baseline).toBe(row.cells[1]?.layout.baseline);
    const flat = layoutRow(trace, calc, 'cells', 5, [40, 40], mono);
    expect(flat.height).toBe(20);
  });

  it('lays out every header row; no header values give one 16 px row', () => {
    const multi = traceOf({ header: { values: [['A', 'a'], ['B']] } });
    const header = layoutHeader(multi, calcTable(multi), [50, 50], mono);
    expect(header.rows).toHaveLength(2);
    expect(header.height).toBe(56);
    const none = traceOf({ cells: { values: [[1]] } });
    expect(layoutHeader(none, calcTable(none), [50], mono).height).toBe(16);
  });
});

describe('rich text in cells', () => {
  it('keeps the markup of values, prefixes and suffixes; plain values keep the plain path', () => {
    expect(cellText({}, 'plain words', 0, 0).markup).toBeUndefined();
    const c = cellText({ prefix: ['<b>$</b>'] }, 'x<sup>2</sup>\nand &amp; more', 0, 0);
    // Raw newlines are spaces (Plotly's SVG text); entities are decoded in the plain text.
    expect(c).toEqual({
      text: '$x2 and & more',
      markup: '<b>$</b>x<sup>2</sup>\nand &amp; more',
      wrap: true,
      grow: true,
    });
    // LaTeX stays as given (not parsed as markup).
    expect(cellText({}, '$a<b$', 0, 0).markup).toBeUndefined();
  });

  it('draws a cell styled as a whole as one plain label with the merged font', () => {
    const layout = layoutCell(cellText({}, '<b>all bold</b>', 0, 0), FONT, 100, mono);
    expect(layout.runs).toBeUndefined();
    expect(layout.font).toEqual({ ...FONT, weight: 'bold' });
    expect(layout.lines).toEqual(['all bold']);
    // Only <br> and entities: plain lines in the cell font, exactly like before.
    const br = layoutCell(cellText({}, 'a &amp; b<br>c', 0, 0), FONT, 100, mono);
    expect(br.font).toBeUndefined();
    expect(br.runs).toBeUndefined();
    expect(br.lines).toEqual(['a & b', 'c']);
  });

  it('wraps mixed runs to the column width, keeping each run style, and grows the row', () => {
    const content = cellText({}, 'aaa <b>bb c</b> <i>dddd</i>', 0, 0);
    const layout = layoutCell(content, FONT, 8 + 2 * CELL_PAD, mono);
    // Same breaks as the plain text 'aaa bb c dddd' (see the plain wrap test).
    expect(layout.lines).toEqual(['aaa bb', 'c dddd']);
    expect(layout.runs).toEqual([
      [{ text: 'aaa ' }, { text: 'bb', font: { weight: 'bold' } }],
      [
        { text: 'c', font: { weight: 'bold' } },
        { text: ' ' },
        { text: 'dddd', font: { style: 'italic' } },
      ],
    ]);
    const plain = layoutCell(cellText({}, 'aaa bb c dddd', 0, 0), FONT, 8 + 2 * CELL_PAD, mono);
    expect(layout.height).toBe(plain.height);
    expect(layout.baseline).toBe(plain.baseline);
  });

  it("doesn't wrap cells with <br> (Plotly), and lines keep their runs", () => {
    const layout = layoutCell(cellText({}, 'one <b>two</b><br>three four', 0, 0), FONT, 10, mono);
    expect(layout.lines).toEqual(['one two', 'three four']);
    expect(layout.runs?.[0]).toEqual([{ text: 'one ' }, { text: 'two', font: { weight: 'bold' } }]);
  });

  it('lays out rows with rich values and labels them with their runs and link', () => {
    const trace = traceOf({
      cells: {
        values: [['x'], ['see <a href="https://example.com">the docs</a> for more details']],
        height: 20,
        align: 'left',
      },
    });
    const calc = calcTable(trace);
    const row = layoutRow(trace, calc, 'cells', 0, [40, 40], mono);
    const rich = row.cells[1]!;
    expect(rich.layout.lines.length).toBeGreaterThan(1);
    expect(row.height).toBe(rich.layout.height);
    expect(row.cells[0]?.layout.baseline).toBe(rich.layout.baseline);
    const label = cellLabel(rich, 100, 50, 40)!;
    expect(label.x).toBe(100 + CELL_PAD);
    expect(label.y).toBe(50 + rich.layout.baseline);
    expect(label.runs).toBe(rich.layout.runs);
    expect(label.text).toBe(rich.layout.lines.join('\n'));
    const links = label.runs!.flat().filter((r) => r.link);
    expect(links.map((r) => r.text).join(' ')).toBe('the docs');
    expect(links[0]?.link).toEqual({ href: 'https://example.com', target: '_blank' });
    // Blank cells have no label.
    expect(cellLabel(layoutRow(trace, calc, 'cells', 3, [40, 40], mono).cells[0]!, 0, 0, 40)).toBe(
      undefined,
    );
  });
});
