/**
 * Autorange extremes of a horizontal violin (plotly.js `violin/calc.js`: the density span on the
 * value axis, padded; the violin's slot on the position axis). The span is worked out here from
 * the definitions: Silverman's rule `1.059 · min(sd, IQR / 1.349) · n^(−1/5)` with the sample
 * standard deviation, and the `soft` span two bandwidths past the extreme samples.
 */
import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createChartRegistry,
  type AxisInfo,
  type CrossTraceContext,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { box } from '../box/index.ts';
import { violin, type ViolinCalc } from './index.ts';

const registry = createChartRegistry().register(violin, box);

function axis(id: string, range: [number, number]): AxisInfo {
  const scale = createScale({ type: 'linear', range });
  return {
    id,
    scale,
    type: 'linear',
    letter: id.charAt(0),
    full: { type: 'linear' },
  } as unknown as AxisInfo;
}

function setup(trace: Record<string, unknown>) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'violin', ...trace }], layout: {} },
    registry.core,
  );
  const x = axis('x', [-5, 25]);
  const y = axis('y', [-1, 3]);
  const calcs = fullData.map((t, index) =>
    violin.calc!(t, { fullLayout, index, xaxis: x, yaxis: y }),
  );
  violin.crossTraceCalc!(
    fullData.map((t, index) => ({ trace: t, index, calc: calcs[index]! })),
    { fullLayout, xaxis: x, yaxis: y, subplot: {} as never } satisfies CrossTraceContext,
  );
  const full = fullData[0] as FullTrace;
  const calc = calcs[0] as ViolinCalc;
  const extremes = violin.extremes!(calc, full, { fullLayout, index: 0, xaxis: x, yaxis: y });
  return { trace: full, calc, extremes };
}

// Sorted, 10 samples: q1 = 3.5 and q3 = 6 (indexes 0.25·10 − 0.5 = 2 and 7).
const A = [2, 3, 3.5, 4, 4.2, 5, 5.5, 6, 7, 9];

function silverman(samples: readonly number[], iqr: number): number {
  const n = samples.length;
  const mean = samples.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(samples.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  return 1.059 * Math.min(sd, iqr / 1.349) * n ** -0.2;
}

describe('violin extremes: horizontal', () => {
  it('reports the density span on x and the violin slot on y', () => {
    // With both arrays given, horizontal has to be asked for.
    const { calc, extremes } = setup({ x: A, y: A.map(() => 2), orientation: 'h' });
    expect(calc.orientation).toBe('h');
    expect([...calc.pos]).toEqual([2]);
    const bw = silverman(A, 6 - 3.5);
    expect(calc.bandwidth[0]).toBeCloseTo(bw, 12);
    expect(extremes.x?.min).toHaveLength(1);
    expect(extremes.x?.max).toHaveLength(1);
    expect(extremes.x?.min[0]?.l).toBeCloseTo(2 - 2 * bw, 12);
    expect(extremes.x?.max[0]?.l).toBeCloseTo(9 + 2 * bw, 12);
    expect(extremes.x?.min[0]?.extrapad).toBe(true);
    expect(extremes.x?.max[0]?.extrapad).toBe(true);
    // One violin at y = 2: a slot one unit wide around it (no outliers to make room for).
    expect(extremes.y?.min).toEqual([{ l: 1.5, padPx: 0 }]);
    expect(extremes.y?.max).toEqual([{ l: 2.5, padPx: 0 }]);
  });

  it('the same samples drawn vertically swap the two axes', () => {
    const { calc, extremes } = setup({ y: A, x: A.map(() => 2) });
    expect(calc.orientation).toBe('v');
    const bw = silverman(A, 6 - 3.5);
    expect(extremes.y?.min[0]?.l).toBeCloseTo(2 - 2 * bw, 12);
    expect(extremes.y?.max[0]?.l).toBeCloseTo(9 + 2 * bw, 12);
    expect(extremes.x?.min).toEqual([{ l: 1.5, padPx: 0 }]);
    expect(extremes.x?.max).toEqual([{ l: 2.5, padPx: 0 }]);
  });

  it('x samples alone make a horizontal violin at its index', () => {
    const { trace, calc, extremes } = setup({ x: A });
    expect(trace['orientation']).toBe('h');
    expect([...calc.pos]).toEqual([0]);
    const bw = silverman(A, 6 - 3.5);
    expect(extremes.x?.min[0]?.l).toBeCloseTo(2 - 2 * bw, 12);
    expect(extremes.y?.min).toEqual([{ l: -0.5, padPx: 0 }]);
    expect(extremes.y?.max).toEqual([{ l: 0.5, padPx: 0 }]);
  });
});
