import {
  holochartTemplate,
  plotlyClassicTemplate,
  supplyDefaults,
  type FullTrace,
} from '@mk7s/holochart-core';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { basicTraces } from '../index.ts';
import { arrayMax, calcTable, columnWeight } from './calc.ts';
import { normalizeColumnOrder } from './defaults.ts';
import { describeTable } from './describe.ts';
import { table } from './index.ts';

const registry = createChartRegistry().register(table);

function defaults(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  return supplyDefaults({ data: [{ type: 'table', ...trace }], layout }, registry.core);
}

function traceOf(trace: Record<string, unknown>, layout: Record<string, unknown> = {}): FullTrace {
  return defaults(trace, layout).fullData[0]!;
}

const block = (t: FullTrace, key: 'header' | 'cells') => t[key] as Record<string, unknown>;

describe('table module', () => {
  it('is registered with basicTraces as a domain trace without legend or hover', () => {
    expect(basicTraces).toContain(table);
    expect(table.categories).toContain('domain');
    expect(table.categories).not.toContain('showLegend');
    expect(table.hoverPoints).toBeUndefined();
    expect(table.legendIcon).toBeUndefined();
  });
});

describe('table defaults', () => {
  it("fills Plotly's defaults: heights, alignment, outlines, fills and the layout font", () => {
    const t = traceOf({ header: { values: ['A', 'B'] }, cells: { values: [[1], [2]] } });
    const header = block(t, 'header');
    const cells = block(t, 'cells');
    expect(header['height']).toBe(28);
    expect(cells['height']).toBe(20);
    expect(header['align']).toBe('center');
    expect(cells['align']).toBe('center');
    expect(header['line']).toEqual({ width: 1, color: 'rgb(128, 128, 128)' });
    expect(cells['fill']).toEqual({ color: 'rgb(255, 255, 255)' });
    expect(header['font']).toMatchObject({ size: 12, color: 'rgb(68, 68, 68)' });
    expect(t['domain']).toMatchObject({ x: [0, 1], y: [0, 1] });
    expect(t.visible).toBe(true);
  });

  it('keeps arrayOk styles (per column, nested per row) by reference', () => {
    const fill = ['red', ['white', 'lightgrey']];
    const t = traceOf({ cells: { values: [[1, 2]], fill: { color: fill }, align: ['left'] } });
    expect((block(t, 'cells')['fill'] as { color: unknown }).color).toBe(fill);
    expect(block(t, 'cells')['align']).toEqual(['left']);
  });

  it('normalizes columnorder to display ranks over every column', () => {
    const t = traceOf({
      header: { values: ['a', 'b', 'c'] },
      cells: { values: [[1], [2], [3], [4]] },
      columnorder: [2, 0, 1],
    });
    expect(t['columnorder']).toEqual([2, 0, 1, 3]);
    expect(traceOf({ header: { values: ['a', 'b'] } })['columnorder']).toEqual([0, 1]);
  });

  it('treats columnorder entries as sort keys (Plotly), ties and gaps in data order', () => {
    expect(normalizeColumnOrder([10, 5], 2)).toEqual([1, 0]);
    expect(normalizeColumnOrder([1, 1, 0], 3)).toEqual([1, 2, 0]);
    expect(normalizeColumnOrder(['x', 0], 3)).toEqual([0, 1, 2]);
    // Column 0 sorts by its key 2, the others by their index: 1, then 0 and 2 (tie, data order).
    expect(normalizeColumnOrder([2], 3)).toEqual([1, 0, 2]);
    expect(normalizeColumnOrder(undefined, 0)).toEqual([]);
  });
});

describe('table template defaults', () => {
  const styled = (template: unknown) =>
    traceOf({ header: { values: ['A'] }, cells: { values: [[1]] } }, { template });

  it('the holochart template gives a dark header, background cells, faint rules and 9 px text', () => {
    const t = styled(holochartTemplate);
    expect(block(t, 'header')['fill']).toEqual({ color: 'rgb(21, 21, 29)' });
    expect(block(t, 'header')['line']).toEqual({ width: 1, color: 'rgb(44, 44, 56)' });
    expect(block(t, 'header')['font']).toMatchObject({ size: 9, color: 'rgb(236, 238, 244)' });
    expect(block(t, 'cells')['fill']).toEqual({ color: 'rgb(10, 10, 15)' });
    expect(block(t, 'cells')['line']).toEqual({ width: 1, color: 'rgb(26, 26, 34)' });
    expect(block(t, 'cells')['font']).toMatchObject({ size: 9, color: 'rgb(164, 167, 181)' });
    // The template's font family comes through the layout font.
    expect((block(t, 'cells')['font'] as { family: string }).family).toContain('Helvetica');
  });

  it("plotly-classic keeps Plotly's white cells and grey rules", () => {
    const t = styled(plotlyClassicTemplate);
    expect(block(t, 'cells')['fill']).toEqual({ color: 'rgb(255, 255, 255)' });
    expect(block(t, 'header')['line']).toEqual({ width: 1, color: 'rgb(128, 128, 128)' });
    expect(block(t, 'cells')['font']).toMatchObject({ size: 12, color: 'rgb(68, 68, 68)' });
  });

  it('user values win over the template', () => {
    const t = traceOf(
      { cells: { values: [[1]], fill: { color: 'red' } } },
      { template: holochartTemplate },
    );
    expect(block(t, 'cells')['fill']).toEqual({ color: 'rgb(255, 0, 0)' });
  });
});

describe('table calc', () => {
  it('squares header rows, pads short header columns and adds headers for extra cell columns', () => {
    const c = calcTable(
      traceOf({
        header: { values: [['Latency', 'p50'], 'Owner'] },
        cells: { values: [[1, 2, 3], ['a'], [true]] },
      }),
    );
    expect(c.columns.map((col) => col.header)).toEqual([
      ['Latency', 'p50'],
      ['Owner', ''],
      ['', ''],
    ]);
    expect(c.headerRows).toBe(2);
    expect(c.hasHeader).toBe(true);
    expect(c.rowCount).toBe(3);
    expect(c.order).toEqual([0, 1, 2]);
  });

  it('draws one empty header row without header values (Plotly)', () => {
    const c = calcTable(traceOf({ cells: { values: [[1], [2]] } }));
    expect(c.hasHeader).toBe(false);
    expect(c.headerRows).toBe(1);
    expect(c.columns.map((col) => col.header)).toEqual([[''], ['']]);
  });

  it('keeps cell columns by reference (no per-row work)', () => {
    const big = new Float64Array(100_000);
    const c = calcTable(traceOf({ cells: { values: [big] } }));
    expect(c.columns[0]?.cells).toBe(big);
    expect(c.rowCount).toBe(100_000);
  });

  it('orders columns by columnorder and weighs them by columnwidth', () => {
    const c = calcTable(
      traceOf({
        header: { values: ['a', 'b', 'c'] },
        columnorder: [1, 2, 0],
        columnwidth: [2, 'x'],
      }),
    );
    expect(c.order).toEqual([2, 0, 1]);
    expect(c.columns.map((col) => col.weight)).toEqual([2, 1, 1]);
    expect(columnWeight(3, 5)).toBe(3);
    expect(columnWeight([], 0)).toBe(1);
    expect(columnWeight([1, -2], 4)).toBe(1);
  });

  it('finds the largest outline width in nested arrays', () => {
    expect(arrayMax([1, [3, 2], 'x'])).toBe(3);
    const c = calcTable(
      traceOf({ header: { values: ['a'], line: { width: [[0.5, 4]] } }, cells: { values: [[1]] } }),
    );
    expect(c.maxLineWidth).toBe(4);
  });
});

describe('table describe', () => {
  const describeOf = (trace: FullTrace, maxRows = 100) =>
    describeTable({
      trace,
      calc: calcTable(trace),
      index: 0,
      fullLayout: defaults({}).fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      maxRows,
    });

  it('returns the header and the formatted cells in display order', () => {
    const d = describeOf(
      traceOf({
        name: 'Prices',
        columnorder: [1, 0],
        header: { values: [['Price', 'USD'], '<b>Item</b>'] },
        cells: {
          values: [
            [1.5, 20],
            ['Tea', 'Cake<br>slice'],
          ],
          format: [',.2f'],
          prefix: ['$', ''],
        },
      }),
    );
    expect(d.kind).toBe('table');
    expect(d.table?.columns).toEqual(['Item', 'Price USD']);
    expect(d.table?.rows).toEqual([
      ['Tea', '$1.50'],
      ['Cake slice', '$20.00'],
    ]);
    expect(d.table?.caption).toBe('Prices');
    expect(d.table?.total).toBe(2);
    expect(d.summary).toBe('Table "Prices": 2 columns (Item and Price USD), 2 rows.');
  });

  it('builds at most maxRows rows and reports the total', () => {
    const d = describeOf(
      traceOf({ cells: { values: [Array.from({ length: 1500 }, (_, i) => i)] } }),
      100,
    );
    expect(d.table?.rows).toHaveLength(100);
    expect(d.table?.total).toBe(1500);
    expect(d.table?.columns).toEqual(['Column 1']);
    expect(d.summary).toBe('Table "trace 0": 1 column (Column 1), 1,500 rows.');
  });
});
