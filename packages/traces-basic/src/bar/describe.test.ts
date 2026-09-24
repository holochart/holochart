import { createScale, supplyDefaults, type AxisType, type FullLayout } from '@mk7s/holochart-core';
import { createChartRegistry, MAX_TABLE_ROWS, type AxisInfo } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { bar, type BarCalc } from './index.ts';

const registry = createChartRegistry().register(bar);

function axis(fullLayout: FullLayout, letter: 'x' | 'y', type: AxisType, categories?: string[]) {
  const name = `${letter}axis`;
  const scale = createScale({ type, length: 400, ...(categories ? { categories } : {}) });
  return { id: letter, name, letter, type, full: fullLayout[name], scale } as unknown as AxisInfo;
}

function described(
  trace: Record<string, unknown>,
  layout: Record<string, unknown> = {},
  types: [AxisType, AxisType] = ['category', 'linear'],
  categories: string[] = ['Jan', 'Feb', 'Mar'],
) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'bar', ...trace }], layout },
    registry.core,
  );
  const t = fullData[0]!;
  const h = t['orientation'] === 'h';
  const xaxis = axis(fullLayout, 'x', types[0], h ? undefined : categories);
  const yaxis = axis(fullLayout, 'y', types[1], h ? categories : undefined);
  const calc = bar.calc!(t, { fullLayout, index: 0, xaxis, yaxis }) as BarCalc;
  bar.crossTraceCalc!([{ trace: t, index: 0, calc }], {
    fullLayout,
    xaxis,
    yaxis,
    subplot: {} as never,
  });
  return bar.describe!({ trace: t, calc, index: 0, fullLayout, xaxis, yaxis, maxRows: 100 })!;
}

describe('bar describe()', () => {
  it('names the largest and smallest bar at their positions', () => {
    const d = described({ name: 'Sales', x: ['Jan', 'Feb', 'Mar'], y: [3, 42, 7] });
    expect(d.kind).toBe('bar');
    expect(d.summary).toBe('Bar "Sales": 3 bars. Largest 42 at Feb, smallest 3 at Jan.');
    expect(d.table).toEqual({
      caption: 'Sales',
      columns: ['x', 'y'],
      rows: [
        ['Jan', '3'],
        ['Feb', '42'],
        ['Mar', '7'],
      ],
      total: 3,
    });
  });

  it('swaps position and value for horizontal bars and uses axis titles', () => {
    const d = described(
      { orientation: 'h', y: ['Jan', 'Feb', 'Mar'], x: [1, 2, 3] },
      { xaxis: { title: { text: 'Units' } }, yaxis: { title: { text: 'Month' } } },
      ['linear', 'category'],
    );
    expect(d.kind).toBe('horizontal bar');
    expect(d.summary).toBe(
      'Horizontal bar "trace 0": 3 bars. Largest 3 at Mar, smallest 1 at Jan.',
    );
    expect(d.table?.columns).toEqual(['Month', 'Units']);
  });

  it('counts bars without a value and caps the table', () => {
    const n = 150;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = x.map((i) => (i === 5 ? null : i));
    const d = described({ x, y }, {}, ['linear', 'linear']);
    expect(d.summary).toContain('150 bars.');
    expect(d.summary).toContain('1 bar without a value.');
    expect(d.table?.rows).toHaveLength(MAX_TABLE_ROWS);
    expect(d.table?.total).toBe(n);
  });
});
