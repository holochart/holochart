/**
 * Box calc from samples: which samples make which box (missing values, missing or surplus
 * positions, horizontal boxes) and the value range of `sizemode: 'sd'`. Quartiles are worked out by
 * hand with Plotly's definition (`Lib.interp`: the value at index `p·n − 0.5` of the sorted sample,
 * interpolated and clamped).
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
  type: 'linear' | 'category',
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

describe('box calc: samples that do not count', () => {
  it('drops samples without a value or a position, and positions left without samples', () => {
    const { calc: c } = calcOne(
      {
        //  kept  no y  kept  no y  no y  no x  kept
        x: [1, 1, 1, 2, 2, null, 3],
        y: [5, null, 7, null, '', 4, 9],
      },
      axis('x', 'linear'),
      axis('y', 'linear'),
    );
    // Position 2 has no usable sample: no box there.
    expect(c.count).toBe(2);
    expect([...c.pos]).toEqual([1, 3]);
    expect([...c.stats.n]).toEqual([2, 1]);
    expect([...c.samples.start]).toEqual([0, 2, 3]);
    expect([...c.samples.value]).toEqual([5, 7, 9]);
    // Each kept sample points back at its place in the data arrays.
    expect([...c.samples.index]).toEqual([0, 2, 6]);
    // Two samples 5 and 7: q1 at index 0.25·2 − 0.5 = 0, median at 0.5, q3 at 1.
    expect([c.stats.q1[0], c.stats.med[0], c.stats.q3[0], c.stats.mean[0]]).toEqual([5, 6, 7, 6]);
    // One sample: every statistic is that sample.
    expect([c.stats.q1[1], c.stats.med[1], c.stats.q3[1]]).toEqual([9, 9, 9]);
    expect([c.stats.lf[1], c.stats.uf[1]]).toEqual([9, 9]);
    expect(c.valueRange).toEqual([5, 9]);
  });

  it('ignores positions beyond the last value', () => {
    const { trace, calc: c } = calcOne(
      { x: [1, 1, 2, 2, 3, 3], y: [1, 2, 3, 4] },
      axis('x', 'linear'),
      axis('y', 'linear'),
    );
    expect(trace['_length']).toBe(4);
    expect([...c.pos]).toEqual([1, 2]);
    expect([...c.stats.n]).toEqual([2, 2]);
    expect([...c.stats.med]).toEqual([1.5, 3.5]);
  });
});

describe('box calc: horizontal boxes', () => {
  it('groups x samples by their y position', () => {
    const { calc: c } = calcOne(
      { orientation: 'h', x: [1, 2, 3, 4, 10], y: ['a', 'a', 'b', 'b', 'b'] },
      axis('x', 'linear'),
      axis('y', 'category', ['a', 'b']),
    );
    expect(c.orientation).toBe('h');
    expect([c.posType, c.valType]).toEqual(['category', 'linear']);
    expect([...c.pos]).toEqual([0, 1]);
    expect([...c.stats.n]).toEqual([2, 3]);
    // b: 3, 4, 10. Median at index 0.5·3 − 0.5 = 1; q1 at 0.25 (3.25); q3 at 1.75 (8.5).
    expect([...c.stats.med]).toEqual([1.5, 4]);
    expect([c.stats.q1[1], c.stats.q3[1]]).toEqual([3.25, 8.5]);
    expect(c.valueRange).toEqual([1, 10]);
  });

  it('x samples alone make one horizontal box at the trace name', () => {
    const { trace, calc: c } = calcOne(
      { name: 'B', x: [4, 1, 3, 2] },
      axis('x', 'linear'),
      axis('y', 'category', ['A', 'B']),
    );
    expect(trace['orientation']).toBe('h');
    expect(c.orientation).toBe('h');
    expect([...c.pos]).toEqual([1]);
    // 1, 2, 3, 4: quartiles at indexes 0.5, 1.5 and 2.5.
    expect([c.stats.q1[0], c.stats.med[0], c.stats.q3[0]]).toEqual([1.5, 2.5, 3.5]);
    expect([...c.samples.index]).toEqual([1, 3, 2, 0]);
  });
});

describe('box calc: sizemode sd', () => {
  const data = { x: [0, 0, 0, 0, 0], y: [1, 2, 3, 4, 5] };

  it('the value range covers mean ± sdmultiple standard deviations', () => {
    const { calc: c } = calcOne(
      { ...data, sizemode: 'sd', sdmultiple: 3 },
      axis('x', 'linear'),
      axis('y', 'linear'),
    );
    // Mean 3, population variance (4 + 1 + 0 + 1 + 4) / 5 = 2.
    const sd = 3 * Math.sqrt(2);
    expect(c.stats.mean[0]).toBe(3);
    expect(c.stats.sd[0]).toBeCloseTo(sd, 12);
    expect(c.valueRange[0]).toBeCloseTo(3 - sd, 12);
    expect(c.valueRange[1]).toBeCloseTo(3 + sd, 12);
  });

  it('never shrinks the range below the samples', () => {
    const { calc: c } = calcOne(
      { ...data, sizemode: 'sd' },
      axis('x', 'linear'),
      axis('y', 'linear'),
    );
    // 3 ± √2 lies inside 1 … 5.
    expect(c.stats.sd[0]).toBeCloseTo(Math.SQRT2, 12);
    expect(c.valueRange).toEqual([1, 5]);
  });

  it('the quartile box (the default) ignores the standard deviation', () => {
    const { calc: c } = calcOne(
      { ...data, y: [1, 2, 3, 4, 50] },
      axis('x', 'linear'),
      axis('y', 'linear'),
    );
    expect(c.valueRange).toEqual([1, 50]);
  });
});
