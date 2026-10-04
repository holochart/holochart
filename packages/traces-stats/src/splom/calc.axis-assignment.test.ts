/**
 * splom calc: which axis each dimension converts through and which axes get its extremes.
 *
 * Expected values follow from the trace's documented layout (splom/defaults.ts, after plotly.js'
 * splom/defaults.js): a dimension converts through its x axis, else its y axis; with the diagonal
 * and one half hidden, the first or last dimension has no column / row, so no x / y axis; a hidden
 * dimension keeps its axes but gives them no data. Coordinates are worked out by hand (log10 on a
 * log axis, the category index on a category axis).
 */
import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { splom } from './index.ts';

const registry = createChartRegistry().register(splom);

function defaults(trace: Record<string, unknown>) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'splom', ...trace }], layout: {} },
    registry.core,
  );
  return { trace: fullData[0] as FullTrace, fullLayout };
}

function axisInfo(id: string, type: 'linear' | 'log' | 'category', cats?: string[]): AxisInfo {
  const scale = createScale({ type, range: [0, 1], ...(cats ? { categories: cats } : {}) });
  return { id, scale, type, letter: id.charAt(0), full: { type } } as unknown as AxisInfo;
}

/** Calc and extremes of a defaulted trace, converting through `axes`. */
function calcOf(input: Record<string, unknown>, axes?: AxisInfo[]) {
  const { trace, fullLayout } = defaults(input);
  const base = { fullLayout, index: 0, xaxis: undefined, yaxis: undefined };
  const ctx = axes ? { ...base, axes: new Map(axes.map((a) => [a.id, a])) } : base;
  const calc = splom.calc!(trace, ctx);
  return { trace, calc, extremes: splom.extremes!(calc, trace, ctx) };
}

const column = (calc: { columns: readonly (Float64Array | null)[] }, i: number): number[] =>
  Array.from(calc.columns[i]!);

/** Extremes of a column from `lo` to `hi` drawn with the default 6 px markers (6 / 1.6 px). */
const spans = (lo: number, hi: number) => ({
  min: [{ l: lo, padPx: 3.75, extrapad: true }],
  max: [{ l: hi, padPx: 3.75, extrapad: true }],
});

describe('splom calc: the axis a dimension converts through', () => {
  it('uses the y axis of the first dimension when only the upper half is drawn', () => {
    // Upper half alone: dimension 0 has no column (no x axis), dimension 2 no row (no y axis).
    const { trace, calc, extremes } = calcOf(
      {
        dimensions: [
          { label: 'l', values: [1, 10, 100], axis: { type: 'log' } },
          { label: 'n', values: [5, 6, 7] },
          { label: 'c', values: ['lo', 'hi', 'lo'] },
        ],
        showlowerhalf: false,
        diagonal: { visible: false },
      },
      [
        axisInfo('y', 'log'),
        axisInfo('x2', 'linear'),
        axisInfo('y2', 'linear'),
        axisInfo('x3', 'category', ['lo', 'hi']),
      ],
    );
    expect(trace['_diag']).toEqual([
      [undefined, 'y'],
      ['x2', 'y2'],
      ['x3', undefined],
    ]);
    // log10 through `y`, as is through `x2`, category indices through `x3`.
    expect(column(calc, 0)).toEqual([0, 1, 2]);
    expect(column(calc, 1)).toEqual([5, 6, 7]);
    expect(column(calc, 2)).toEqual([0, 1, 0]);
    // Only the axes that exist get extremes.
    expect(extremes.byAxis).toEqual({
      y: spans(0, 2),
      x2: spans(5, 7),
      y2: spans(5, 7),
      x3: spans(0, 1),
    });
  });

  it('uses the y axis of the last dimension when only the lower half is drawn', () => {
    // Lower half alone: dimension 0 has no row (no y axis), dimension 2 no column (no x axis).
    const { trace, calc, extremes } = calcOf(
      {
        dimensions: [
          { values: [1, 2, 3] },
          { values: [4, 5, 6] },
          { values: [1, 100, 10], axis: { type: 'log' } },
        ],
        showupperhalf: false,
        diagonal: { visible: false },
      },
      [
        axisInfo('x', 'linear'),
        axisInfo('x2', 'linear'),
        axisInfo('y2', 'linear'),
        axisInfo('y3', 'log'),
      ],
    );
    expect(trace['_diag']).toEqual([
      ['x', undefined],
      ['x2', 'y2'],
      [undefined, 'y3'],
    ]);
    expect(column(calc, 0)).toEqual([1, 2, 3]);
    expect(column(calc, 2)).toEqual([0, 2, 1]);
    expect(extremes.byAxis).toEqual({
      x: spans(1, 3),
      x2: spans(4, 6),
      y2: spans(4, 6),
      y3: spans(0, 2),
    });
  });

  it('has no axis for a lone dimension whose diagonal cell is hidden: values as they are', () => {
    // One dimension is first and last at once: no column and no row, so no cell and no axis.
    const { trace, calc, extremes } = calcOf(
      { dimensions: [{ values: [3, 1, 2] }], diagonal: { visible: false }, showlowerhalf: false },
      [axisInfo('x', 'log'), axisInfo('y', 'log')],
    );
    expect(trace.visible).toBe(true);
    expect(trace['_cells']).toEqual([]);
    expect(trace['_diag']).toEqual([[undefined, undefined]]);
    expect(calc.length).toBe(3);
    expect(column(calc, 0)).toEqual([3, 1, 2]);
    expect(extremes.byAxis).toEqual({});
  });
});

describe('splom calc: columns and extremes of uneven and hidden dimensions', () => {
  it('cuts a typed array to the shortest dimension without touching the array', () => {
    const long = new Float32Array([1, 10, 100, 1000, 10000]);
    const input = {
      dimensions: [{ values: long, axis: { type: 'log' } }, { values: [10, 20, 30] }],
    };
    // Through its (log) x axis.
    const converted = calcOf(input, [axisInfo('x', 'log'), axisInfo('x2', 'linear')]);
    expect(converted.calc.length).toBe(3);
    expect(column(converted.calc, 0)).toEqual([0, 1, 2]);
    expect(column(converted.calc, 1)).toEqual([10, 20, 30]);
    // The samples past the shortest dimension do not reach the autorange.
    expect(converted.extremes.byAxis?.['x']).toEqual(spans(0, 2));
    // Without axes (a hand-built context) the values are the coordinates.
    expect(column(calcOf(input).calc, 0)).toEqual([1, 10, 100]);
    expect(Array.from(long)).toEqual([1, 10, 100, 1000, 10000]);
  });

  it('gives the axes of a hidden dimension no extremes', () => {
    const { trace, calc, extremes } = calcOf({
      dimensions: [
        { values: [1, 2, 3] },
        { values: [40, 50, 60], visible: false },
        { values: [7, 8, 9] },
      ],
    });
    // The hidden dimension keeps its row and column (empty)…
    expect(trace['_diag']).toEqual([
      ['x', 'y'],
      ['x2', 'y2'],
      ['x3', 'y3'],
    ]);
    // …but has no column of coordinates and adds nothing to the autorange of `x2` / `y2`.
    expect(calc.columns[1]).toBeNull();
    expect(extremes.byAxis).toEqual({
      x: spans(1, 3),
      y: spans(1, 3),
      x3: spans(7, 9),
      y3: spans(7, 9),
    });
  });
});
