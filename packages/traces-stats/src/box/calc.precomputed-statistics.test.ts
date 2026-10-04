/**
 * Box calc with precomputed statistics (`q1`, `median`, `q3`): which given statistics are kept,
 * what replaces missing or invalid ones, where the boxes sit and which samples are read. The
 * expected numbers are worked out by hand from the attribute descriptions (`attributes.ts`) and
 * plotly.js' `box/calc.js` (`_hasPreCompStats` branch).
 */
import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createChartRegistry,
  type AxisInfo,
  type CrossTraceContext,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
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

function calcOne(trace: Record<string, unknown>, x: AxisInfo, y: AxisInfo) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'box', ...trace }], layout: {} },
    registry.core,
  );
  const calcs = fullData.map((t, index) => box.calc!(t, { fullLayout, index, xaxis: x, yaxis: y }));
  box.crossTraceCalc!(
    fullData.map((t, index) => ({ trace: t, index, calc: calcs[index]! })),
    { fullLayout, xaxis: x, yaxis: y, subplot: {} as never } satisfies CrossTraceContext,
  );
  return { trace: fullData[0] as FullTrace, calc: calcs[0] as BoxCalc };
}

const lin = () => axis('x', 'linear');
const val = () => axis('y', 'linear');

describe('box calc: precomputed mean, sd and notch span', () => {
  // Three boxes with the same quartiles (2, 4, 6: IQR 4) and different extras.
  const { calc: c } = calcOne(
    {
      x: [1, 2, 3],
      q1: [2, 2, 2],
      median: [4, 4, 4],
      q3: [6, 6, 6],
      mean: [5, 5, 4.5],
      sd: [1.5, -1],
      notchspan: [0.75, 0],
      y: [[1, 4, 7], [3, 5, 7], []],
    },
    lin(),
    val(),
  );

  it('keeps a given mean, a non-negative sd and a positive notch span', () => {
    expect([c.stats.mean[0], c.stats.sd[0]]).toEqual([5, 1.5]);
    // Notch ends: median ± notchspan = 4 ± 0.75.
    expect([c.stats.ln[0], c.stats.un[0]]).toEqual([3.25, 4.75]);
    // Fences are not given: the extreme samples within 1.5 IQR (6) of the quartiles.
    expect([c.stats.lf[0], c.stats.uf[0]]).toEqual([1, 7]);
    expect([c.stats.min[0], c.stats.max[0]]).toEqual([1, 7]);
  });

  it('replaces a negative sd and a zero notch span by the samples’ values', () => {
    expect(c.stats.mean[1]).toBe(5);
    // Samples 3, 5, 7 around the given mean 5: √((4 + 0 + 4) / 3).
    expect(c.stats.sd[1]).toBeCloseTo(Math.sqrt(8 / 3), 12);
    // 1.57 · IQR / √n = 1.57 · 4 / √3.
    const ns = (1.57 * 4) / Math.sqrt(3);
    expect(c.stats.ln[1]).toBeCloseTo(4 - ns, 12);
    expect(c.stats.un[1]).toBeCloseTo(4 + ns, 12);
    // The lowest sample (3) is above q1, so the lower fence stays at q1.
    expect([c.stats.lf[1], c.stats.uf[1]]).toEqual([2, 7]);
    // Notched (the default with `notchspan`): min and max reach the notch ends (0.37 and 7.63).
    expect(c.stats.min[1]).toBeCloseTo(4 - ns, 12);
    expect(c.stats.max[1]).toBeCloseTo(4 + ns, 12);
  });

  it('without samples: sd is q3 − q1, the notch has no height and the fences are the quartiles', () => {
    expect(c.stats.n[2]).toBe(0);
    expect([c.stats.mean[2], c.stats.sd[2]]).toEqual([4.5, 4]);
    expect([c.stats.ln[2], c.stats.un[2]]).toEqual([4, 4]);
    expect([c.stats.lf[2], c.stats.uf[2]]).toEqual([2, 6]);
    expect([c.stats.min[2], c.stats.max[2]]).toEqual([2, 6]);
  });

  it('reports the value range over every box', () => {
    const ns = (1.57 * 4) / Math.sqrt(3);
    expect(c.valueRange[0]).toBeCloseTo(4 - ns, 12);
    expect(c.valueRange[1]).toBeCloseTo(4 + ns, 12);
  });
});

describe('box calc: precomputed notches and the value range', () => {
  const stats = { q1: [3], median: [4], q3: [5], notchspan: [2.5] };

  it('a notch wider than the box widens the range (notched by default with notchspan)', () => {
    const { trace, calc } = calcOne(stats, lin(), val());
    expect(trace['notched']).toBe(true);
    expect([calc.stats.ln[0], calc.stats.un[0]]).toEqual([1.5, 6.5]);
    expect([calc.stats.min[0], calc.stats.max[0]]).toEqual([1.5, 6.5]);
    expect(calc.valueRange).toEqual([1.5, 6.5]);
  });

  it('notched: false keeps the range at the fences', () => {
    const { calc } = calcOne({ ...stats, notched: false }, lin(), val());
    expect([calc.stats.min[0], calc.stats.max[0]]).toEqual([3, 5]);
    expect(calc.valueRange).toEqual([3, 5]);
  });
});

describe('box calc: invalid precomputed statistics', () => {
  it('draws the box as a line at the median, else between or at the quartiles, else at 0', () => {
    // Plotly: `v0 = med ?? (q1 and q3 ? (q1 + q3) / 2 : q1 ?? q3 ?? 0)`.
    const { calc: c } = calcOne(
      {
        q1: [1, 1, null, null, 5],
        median: [null, null, null, null, 3],
        q3: [3, null, 3, null, 4],
      },
      lin(),
      val(),
    );
    const expected = [2, 1, 3, 0, 3];
    expect(c.count).toBe(5);
    for (const key of ['q1', 'med', 'q3', 'lf', 'uf', 'min', 'max', 'mean', 'ln', 'un'] as const) {
      expect([...c.stats[key]], key).toEqual(expected);
    }
    expect(c.valueRange).toEqual([0, 3]);
  });
});

describe('box calc: positions of precomputed boxes', () => {
  const stats = { q1: [1, 1, 1], median: [2, 2, 2], q3: [3, 3, 3] };

  it('without x: box i sits at x0 + i·dx (0 and 1 by default)', () => {
    expect([...calcOne(stats, lin(), val()).calc.pos]).toEqual([0, 1, 2]);
    expect([...calcOne({ ...stats, x0: 10, dx: 5 }, lin(), val()).calc.pos]).toEqual([10, 15, 20]);
  });

  it('steps in data units on a log position axis', () => {
    // x = 1, 10, 19: the linear positions are their logarithms.
    const { calc } = calcOne({ ...stats, x0: 1, dx: 9 }, axis('x', 'log'), val());
    expect(calc.posType).toBe('log');
    expect(calc.pos[0]).toBe(0);
    expect(calc.pos[1]).toBe(1);
    expect(calc.pos[2]).toBeCloseTo(Math.log10(19), 12);
  });

  it('y0 / dy alone make horizontal boxes along y', () => {
    const { trace, calc } = calcOne({ ...stats, y0: 2, dy: 3 }, axis('x', 'linear'), val());
    expect(trace['orientation']).toBe('h');
    expect(calc.orientation).toBe('h');
    expect([...calc.pos]).toEqual([2, 5, 8]);
    expect([...calc.stats.med]).toEqual([2, 2, 2]);
  });

  it('a flat y with statistics is the positions of horizontal boxes', () => {
    const { calc } = calcOne(
      { y: ['a', 'b'], q1: [1, 2], median: [2, 3], q3: [3, 5] },
      axis('x', 'linear'),
      axis('y', 'category', ['a', 'b']),
    );
    expect(calc.orientation).toBe('h');
    expect([calc.posType, calc.valType]).toEqual(['category', 'linear']);
    expect([...calc.pos]).toEqual([0, 1]);
    expect([...calc.stats.q3]).toEqual([3, 5]);
  });

  it('skips boxes without a position and samples that are not numbers', () => {
    const { calc: c } = calcOne(
      {
        x: [1, null, 3],
        ...stats,
        y: [[7, null, 'x', 1], [5], [2, '', 2.5]],
      },
      lin(),
      val(),
    );
    expect(c.count).toBe(2);
    expect([...c.pos]).toEqual([1, 3]);
    expect([...c.stats.n]).toEqual([2, 2]);
    expect([...c.samples.start]).toEqual([0, 2, 4]);
    // Sorted by value, each sample remembering its box (`index`) and its place in the row (`sub`).
    expect([...c.samples.value]).toEqual([1, 7, 2, 2.5]);
    expect([...c.samples.index]).toEqual([0, 0, 2, 2]);
    expect([...c.samples.sub]).toEqual([3, 0, 0, 2]);
  });
});
