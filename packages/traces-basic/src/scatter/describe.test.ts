import { createScale, supplyDefaults, type AxisType, type FullLayout } from '@mk7s/holochart-core';
import { createChartRegistry, MAX_TABLE_ROWS, type AxisInfo } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { scatter, type ScatterCalc } from './index.ts';
import { scatterKind } from './describe.ts';

const registry = createChartRegistry().register(scatter);

function axis(
  fullLayout: FullLayout,
  letter: 'x' | 'y',
  type: AxisType,
  categories?: string[],
): AxisInfo {
  const name = `${letter}axis`;
  const scale = createScale({ type, length: 400, ...(categories ? { categories } : {}) });
  return {
    id: letter,
    name,
    letter,
    type,
    full: fullLayout[name],
    scale,
    start: 0,
    end: 400,
    l2c: (l: number) => l,
  } as AxisInfo;
}

function described(
  trace: Record<string, unknown>,
  layout: Record<string, unknown> = {},
  types: [AxisType, AxisType] = ['linear', 'linear'],
  categories?: string[],
) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'scatter', ...trace }], layout },
    registry.core,
  );
  const t = fullData[0]!;
  const xaxis = axis(fullLayout, 'x', types[0], categories);
  const yaxis = axis(fullLayout, 'y', types[1]);
  const calc = scatter.calc!(t, { fullLayout, index: 0, xaxis, yaxis }) as ScatterCalc;
  return scatter.describe!({
    trace: t,
    calc,
    index: 0,
    fullLayout,
    xaxis,
    yaxis,
    maxRows: MAX_TABLE_ROWS,
  })!;
}

describe('scatter describe()', () => {
  it('names the kind from mode, fill and marker sizes', () => {
    expect(scatterKind({ mode: 'lines+markers' })).toBe('line');
    expect(scatterKind({ mode: 'markers' })).toBe('scatter');
    expect(scatterKind({ mode: 'markers', marker: { size: [1, 2] } })).toBe('bubble');
    expect(scatterKind({ mode: 'lines', fill: 'tozeroy' })).toBe('area');
    expect(scatterKind({ mode: 'text' })).toBe('scatter');
  });

  it('summarizes count, x extent and y extremes with the axes formatting', () => {
    const d = described({ name: 'Revenue', x: [1, 2, 3, 4], y: [5, 2, 9, 4] });
    expect(d.kind).toBe('line');
    expect(d.summary).toBe(
      'Line "Revenue": 4 points. x from 1 to 4. Lowest y 2 at x = 2, highest 9 at x = 3.',
    );
    expect(d.table).toEqual({
      caption: 'Revenue',
      columns: ['x', 'y'],
      rows: [
        ['1', '5'],
        ['2', '2'],
        ['3', '9'],
        ['4', '4'],
      ],
      total: 4,
    });
  });

  it('formats dates and categories, uses axis titles and adds a text column', () => {
    const d = described(
      {
        mode: 'markers',
        x: ['2024-01-01', '2024-03-01'],
        y: [1, 3],
        text: ['a<b>b</b>', 'c'],
      },
      { yaxis: { title: { text: 'Sales' } } },
      ['date', 'linear'],
    );
    expect(d.summary).toBe(
      'Scatter "trace 0": 2 points. x from Jan 1, 2024 to Mar 1, 2024. Lowest y 1 at x = Jan 1, 2024, highest 3 at x = Mar 1, 2024.',
    );
    expect(d.table?.columns).toEqual(['x', 'Sales', 'text']);
    expect(d.table?.rows[0]).toEqual(['Jan 1, 2024', '1', 'ab']);
    const c = described(
      { mode: 'markers', x: ['a', 'b'], y: [1, 2] },
      {},
      ['category', 'linear'],
      ['a', 'b'],
    );
    expect(c.summary).toContain('x from a to b.');
  });

  it('counts points without a value and caps the table', () => {
    const y = Array.from({ length: 250 }, (_, i) => (i === 3 ? null : i));
    const d = described({ y });
    expect(d.summary).toContain('250 points.');
    expect(d.summary).toContain('1 point without a value.');
    expect(d.table?.rows).toHaveLength(MAX_TABLE_ROWS);
    expect(d.table?.total).toBe(250);
  });

  it('describes a single point and an empty trace', () => {
    expect(described({ x: [1], y: [2] }).summary).toBe(
      'Line "trace 0": 1 point. x from 1 to 1. y 2 at x = 1.',
    );
    expect(described({ x: [], y: [] }).summary).toBe('Scatter "trace 0": 0 points.');
  });
});
