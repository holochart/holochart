/**
 * Violin calc when every sample of a violin is equal (plotly.js `violin/calc.js`): Silverman's rule
 * gives no bandwidth, so the violin is flat (one grid point of density 1 at the value); a user
 * `bandwidth` still draws the Gaussian kernel around the value.
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
  const x = axis('x', [-1, 3]);
  const y = axis('y', [-5, 25]);
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

describe('violin calc: all samples equal', () => {
  it('is flat without a bandwidth: one grid point of density 1 at the value', () => {
    const { calc: c, extremes } = setup({ x: [0, 0, 0], y: [5, 5, 5] });
    expect(c.count).toBe(1);
    expect(c.bandwidth[0]).toBe(0);
    expect([c.span0[0], c.span1[0]]).toEqual([5, 5]);
    expect([...c.density.start]).toEqual([0, 1]);
    expect([...c.density.t]).toEqual([5]);
    expect([...c.density.v]).toEqual([1]);
    expect(c.maxKDE).toBe(1);
    expect(c.maxCount).toBe(3);
    // The density 1 fills the half-width: 0.5 · (1 − violingap 0.3) · (1 − violingroupgap 0.3).
    expect(1 / c.scale[0]!).toBeCloseTo(0.245, 12);
    // The value axis only needs the value itself (padded).
    expect(extremes.y).toEqual({
      min: [{ l: 5, padPx: 0, extrapad: true }],
      max: [{ l: 5, padPx: 0, extrapad: true }],
    });
  });

  it('a user bandwidth draws its Gaussian two bandwidths each way', () => {
    const h = 0.5;
    const { calc: c } = setup({ x: [0, 0, 0], y: [5, 5, 5], bandwidth: h });
    expect(c.bandwidth[0]).toBe(h);
    expect([c.span0[0], c.span1[0]]).toEqual([4, 6]);
    const { t, v } = c.density;
    // The grid runs over the span in steps of at most a third of the bandwidth.
    expect(t[0]).toBe(4);
    expect(t[t.length - 1]).toBeCloseTo(6, 9);
    expect(t.length).toBeGreaterThanOrEqual(2 / (h / 3) + 1);
    for (let k = 1; k < t.length; k++) {
      expect(t[k]! - t[k - 1]!).toBeLessThanOrEqual(h / 3 + 1e-12);
    }
    // n equal samples: the density is one Gaussian of standard deviation h centered on the value.
    const gauss = (at: number) =>
      Math.exp(-0.5 * ((at - 5) / h) ** 2) / (h * Math.sqrt(2 * Math.PI));
    for (let k = 0; k < t.length; k++) expect(v[k]).toBeCloseTo(gauss(t[k]!), 12);
    expect(c.maxKDE).toBe(Math.max(...v));
    expect(c.maxKDE).toBeLessThanOrEqual(gauss(5) + 1e-12);
    expect(c.maxKDE).toBeGreaterThan(gauss(5 + h / 6));
  });
});
