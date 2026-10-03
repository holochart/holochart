/**
 * What a box trace reports to the axes: autorange extremes (`box.extremes`: the padded value range
 * on the value axis, the box slots on the position axis; plotly.js `box/calc.js` and
 * `cross_trace_calc.js` `findExtremes` calls), the samples for value-based category orders
 * (`box.categoryValues`) and the calc → linear conversion of the value axis.
 */
import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type CrossTraceContext,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { calcToLinear } from './calc.ts';
import { box, type BoxCalc } from './index.ts';

const registry = createChartRegistry().register(box);

function axis(
  id: string,
  type: 'linear' | 'log' | 'category',
  categories?: string[],
  range: [number, number] = [0, 1],
): AxisInfo {
  const scale = createScale({ type, range, ...(categories ? { categories } : {}) });
  return { id, scale, type, letter: id.charAt(0), full: { type } } as unknown as AxisInfo;
}

function setup(trace: Record<string, unknown>, x: AxisInfo, y: AxisInfo) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'box', ...trace }], layout: {} },
    registry.core,
  );
  const calcs = fullData.map((t, index) => box.calc!(t, { fullLayout, index, xaxis: x, yaxis: y }));
  box.crossTraceCalc!(
    fullData.map((t, index) => ({ trace: t, index, calc: calcs[index]! })),
    { fullLayout, xaxis: x, yaxis: y, subplot: {} as never } satisfies CrossTraceContext,
  );
  const full = fullData[0] as FullTrace;
  const calc = calcs[0] as BoxCalc;
  const ctx: CalcContext = { fullLayout, index: 0, xaxis: x, yaxis: y };
  const extremes = box.extremes!(calc, full, ctx);
  const categoryValues = (letter: 'x' | 'y') => {
    const samples = box.categoryValues!(calc, full, letter, ctx);
    return samples && { index: Array.from(samples.index), value: Array.from(samples.value) };
  };
  return { trace: full, calc, extremes, categoryValues };
}

/** A padded value-axis extreme (Plotly's `{padded: true}`: 5% of the range beyond it). */
const padded = (l: number) => ({ l, padPx: 0, extrapad: true });

describe('box extremes', () => {
  it('vertical: the samples’ range, padded, on y and the box slot on x', () => {
    const { extremes } = setup(
      { x: [1, 1, 1, 1, 1], y: [3, 1, 5, 2, 4] },
      axis('x', 'linear'),
      axis('y', 'linear'),
    );
    expect(extremes.y).toEqual({ min: [padded(1)], max: [padded(5)] });
    // One position: the slot is one unit wide around it (half-slot 0.5); no points to make room for.
    expect(extremes.x?.min).toEqual([{ l: 0.5, padPx: 0 }]);
    expect(extremes.x?.max).toEqual([{ l: 1.5, padPx: 0 }]);
  });

  it('includes outliers in the value range', () => {
    const { extremes } = setup(
      { x: Array.from({ length: 10 }, () => 0), y: [-10, 1, 2, 3, 4, 5, 6, 7, 8, 30] },
      axis('x', 'linear'),
      axis('y', 'linear'),
    );
    expect(extremes.y).toEqual({ min: [padded(-10)], max: [padded(30)] });
  });

  it('horizontal: values on x, positions on y', () => {
    const { extremes } = setup(
      { name: 'h', x: [1, 2, 3, 4, 5] },
      axis('x', 'linear'),
      axis('y', 'category', ['h']),
    );
    expect(extremes.x).toEqual({ min: [padded(1)], max: [padded(5)] });
    expect(extremes.y?.min).toEqual([{ l: -0.5, padPx: 0 }]);
    expect(extremes.y?.max).toEqual([{ l: 0.5, padPx: 0 }]);
  });

  it('log value axis: the extremes are the logarithms of the samples’ range', () => {
    const { calc, extremes } = setup(
      { x: [0, 0, 0], y: [10, 100, 1000] },
      axis('x', 'linear'),
      axis('y', 'log', undefined, [0, 3]),
    );
    // Calc space keeps the data values; the axis works in log10.
    expect(calc.valueRange).toEqual([10, 1000]);
    expect(extremes.y).toEqual({ min: [padded(1)], max: [padded(3)] });
  });

  it('category value axis: the extremes are the category indices', () => {
    const { calc, extremes } = setup(
      { x: [0, 0, 0, 0], y: ['mid', 'low', 'high', 'mid'] },
      axis('x', 'linear'),
      axis('y', 'category', ['low', 'mid', 'high']),
    );
    // low = 0, mid = 1, high = 2: the sorted sample is 0, 1, 1, 2.
    expect(calc.stats.med[0]).toBe(1);
    expect(extremes.y).toEqual({ min: [padded(0)], max: [padded(2)] });
  });

  it('a notch reaching past the samples widens the value range', () => {
    const { extremes } = setup(
      { x: [0, 0, 0], y: [1, 2, 3], notched: true },
      axis('x', 'linear'),
      axis('y', 'linear'),
    );
    // q1 = 1.25, q3 = 2.75 (indexes 0.25 and 1.75): the notch is 2 ± 1.57 · 1.5 / √3.
    const ns = (1.57 * 1.5) / Math.sqrt(3);
    expect(extremes.y?.min[0]?.l).toBeCloseTo(2 - ns, 12);
    expect(extremes.y?.max[0]?.l).toBeCloseTo(2 + ns, 12);
    expect(2 - ns).toBeLessThan(1);
  });

  it('reports nothing for a trace without a usable sample', () => {
    const { calc, extremes } = setup(
      { x: [1, 2], y: [null, null] },
      axis('x', 'linear'),
      axis('y', 'linear'),
    );
    expect(calc.count).toBe(0);
    expect(extremes).toEqual({ x: { min: [], max: [] }, y: { min: [], max: [] } });
  });
});

describe('box categoryValues', () => {
  it('gives each sample’s box position and value on the position axis only', () => {
    const { categoryValues } = setup(
      { x: ['b', 'a', 'b', 'a', 'a'], y: [5, 1, 3, 9, 2] },
      axis('x', 'category', ['a', 'b']),
      axis('y', 'linear'),
    );
    // Grouped by box (a at 0, b at 1), each box's samples ascending.
    expect(categoryValues('x')).toEqual({ index: [0, 0, 0, 1, 1], value: [1, 2, 9, 3, 5] });
    expect(categoryValues('y')).toBeUndefined();
  });

  it('horizontal boxes: on y', () => {
    const { categoryValues } = setup(
      { orientation: 'h', y: ['b', 'a', 'b'], x: [5, 1, 3] },
      axis('x', 'linear'),
      axis('y', 'category', ['a', 'b']),
    );
    expect(categoryValues('y')).toEqual({ index: [0, 1, 1], value: [1, 3, 5] });
    expect(categoryValues('x')).toBeUndefined();
  });
});

describe('calcToLinear', () => {
  it('takes log10 on log axes, where non-positive values have no position', () => {
    expect(calcToLinear('log', 1000)).toBe(3);
    expect(calcToLinear('log', 0.01)).toBe(-2);
    expect(calcToLinear('log', 0)).toBeNaN();
    expect(calcToLinear('log', -5)).toBeNaN();
  });

  it('is the identity on other axes', () => {
    expect(calcToLinear('linear', -5)).toBe(-5);
    expect(calcToLinear('date', 1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(calcToLinear(undefined, 2.5)).toBe(2.5);
  });
});
