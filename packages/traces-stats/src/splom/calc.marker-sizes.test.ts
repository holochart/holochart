/**
 * splom calc: marker diameters and the autorange padding they ask for.
 *
 * Expected values are worked out by hand from the plotly.js definitions the calc follows:
 *
 * - `makeBubbleSizeFn` (scatter/make_bubble_size_func.js), for per-sample sizes: the radius is
 *   `size / 2 / sizeref` (`sizemode: 'diameter'`) or `sqrt(size / 2 / sizeref)` (`'area'`), at
 *   least `sizemin`; sizes that are not positive numbers are not drawn (0). The drawn diameter is
 *   twice the radius. `sizeref || 1`: a zero `sizeref` is 1.
 * - `calcMarkerSize` (scatter/calc.js), the padding: `max(size / (1.6 · sizeref), 3)`, or
 *   `max(sqrt(size / (1.6 · sizeref)), 3)` with `sizemode: 'area'`; a missing size counts as 0.
 */
import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { splom } from './index.ts';

const registry = createChartRegistry().register(splom);

/** Two dimensions of `samples` values: 0, 1, 2, … and 10, 11, 12, … */
function dims(samples: number): { label: string; values: number[] }[] {
  return [0, 1].map((k) => ({
    label: `d${k}`,
    values: Array.from({ length: samples }, (_, i) => k * 10 + i),
  }));
}

/** Defaults, calc and extremes of a splom of `samples` samples with `marker`. */
function calcOf(marker: Record<string, unknown>, samples: number) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'splom', dimensions: dims(samples), marker }], layout: {} },
    registry.core,
  );
  const trace = fullData[0] as FullTrace;
  const ctx = { fullLayout, index: 0, xaxis: undefined, yaxis: undefined };
  const calc = splom.calc!(trace, ctx);
  return { trace, calc, extremes: splom.extremes!(calc, trace, ctx) };
}

const diameters = (marker: Record<string, unknown>, samples: number): number[] =>
  Array.from(calcOf(marker, samples).calc.markerSize as Float32Array);

const paddings = (marker: Record<string, unknown>, samples: number): number[] =>
  Array.from(calcOf(marker, samples).calc.ppad as Float64Array);

describe('splom calc: bubble diameters', () => {
  it("grows the diameter with the square root of size with sizemode: 'area'", () => {
    // radius = sqrt(size / 2 / sizeref): sqrt(1), sqrt(4), sqrt(9), sqrt(25).
    expect(diameters({ size: [4, 16, 36, 100], sizemode: 'area', sizeref: 2 }, 4)).toEqual([
      2, 4, 6, 10,
    ]);
    // The same sizes as diameters: radius = size / 2 / sizeref.
    expect(diameters({ size: [4, 16, 36, 100], sizeref: 2 }, 4)).toEqual([2, 8, 18, 50]);
  });

  it('keeps every drawn bubble at least sizemin in radius', () => {
    // Radii 1 and 15 against a minimum of 4.
    expect(diameters({ size: [2, 30], sizemin: 4 }, 2)).toEqual([8, 30]);
    // Area mode: radii sqrt(2 / 2) = 1 and sqrt(200 / 2) = 10.
    expect(diameters({ size: [2, 200], sizemode: 'area', sizemin: 4 }, 2)).toEqual([8, 20]);
  });

  it('does not draw zero, negative, missing and non-numeric sizes, sizemin or not', () => {
    expect(diameters({ size: [0, -8, null, 'big', '', 12], sizemin: 4 }, 6)).toEqual([
      0, 0, 0, 0, 0, 12,
    ]);
    // Area mode: the square root of a negative size is not a number.
    expect(diameters({ size: [-8, 0, 8], sizemode: 'area' }, 3)).toEqual([0, 0, 4]);
  });

  it('reads numeric strings as numbers', () => {
    expect(diameters({ size: ['20', ' 8 ', 10] }, 3)).toEqual([20, 8, 10]);
  });

  it('does not draw the samples past the end of a shorter size array', () => {
    const { calc } = calcOf({ size: [10, 20] }, 4);
    expect(calc.length).toBe(4);
    expect(Array.from(calc.markerSize as Float32Array)).toEqual([10, 20, 0, 0]);
    // They still pad the autorange by the 3 px minimum (a missing size counts as 0).
    expect(Array.from(calc.ppad as Float64Array)).toEqual([10 / 1.6, 20 / 1.6, 3, 3]);
  });

  it('treats sizeref: 0 as 1', () => {
    const { trace, calc } = calcOf({ size: [10, 20], sizeref: 0 }, 2);
    expect((trace['marker'] as { sizeref: number }).sizeref).toBe(0);
    expect(Array.from(calc.markerSize as Float32Array)).toEqual([10, 20]);
    expect(Array.from(calc.ppad as Float64Array)).toEqual([10 / 1.6, 20 / 1.6]);
  });
});

describe('splom calc: autorange padding of the markers', () => {
  it('pads by size / 1.6, at least 3 px, for one marker size', () => {
    expect(calcOf({ size: 16 }, 3).calc.ppad).toBeCloseTo(10, 12);
    expect(calcOf({ size: 2 }, 3).calc.ppad).toBe(3);
    // Invisible markers (size 0) still get the minimum padding.
    const none = calcOf({ size: 0 }, 3);
    expect(none.calc.markerSize).toBe(0);
    expect(none.calc.ppad).toBe(3);
    // sizeref and sizemode only apply to per-sample sizes.
    const { trace, calc } = calcOf({ size: 16, sizeref: 4, sizemode: 'area' }, 3);
    expect((trace['marker'] as Record<string, unknown>)['sizemode']).toBeUndefined();
    expect(calc.markerSize).toBe(16);
    expect(calc.ppad).toBeCloseTo(10, 12);
  });

  it('pads each sample by its size / (1.6 · sizeref)', () => {
    // 1.6 · 2 = 3.2: 16 / 3.2 = 5, 1.6 / 3.2 = 0.5 (→ 3), 32 / 3.2 = 10.
    const pads = paddings({ size: [16, 1.6, 32], sizeref: 2 }, 3);
    expect(pads).toHaveLength(3);
    expect(pads[0]).toBeCloseTo(5, 12);
    expect(pads[1]).toBe(3);
    expect(pads[2]).toBeCloseTo(10, 12);
  });

  it("pads by the square root with sizemode: 'area'", () => {
    // 1.6 · 2.5 = 4: sqrt(400 / 4) = 10, sqrt(4 / 4) = 1 (→ 3); 0 and a missing size → 3.
    const pads = paddings({ size: [400, 4, 0, null], sizemode: 'area', sizeref: 2.5 }, 4);
    expect(pads).toHaveLength(4);
    expect(pads[0]).toBeCloseTo(10, 12);
    expect(pads.slice(1)).toEqual([3, 3, 3]);
  });

  it('gives the axes the extremes that the bubble paddings leave undominated', () => {
    // Dimension 0 is 0, 1, 2 with paddings 10, 3, 3 px (sizes 16, 1.6, 4.8).
    const { extremes } = calcOf({ size: [16, 1.6, 4.8] }, 3);
    const x = extremes.byAxis?.['x'];
    // Lowest value and largest padding: sample 0 alone decides the minimum.
    expect(x?.min).toEqual([{ l: 0, padPx: expect.closeTo(10, 12), extrapad: true }]);
    // The maximum is either the highest value (2, 3 px) or sample 0 with its 10 px; sample 1 is
    // both lower than sample 2 and padded no more, so it cannot decide it.
    expect(x?.max).toHaveLength(2);
    expect(x?.max).toContainEqual({ l: 0, padPx: expect.closeTo(10, 12), extrapad: true });
    expect(x?.max).toContainEqual({ l: 2, padPx: 3, extrapad: true });
    // The y axis of the dimension gets the same extremes.
    expect(extremes.byAxis?.['y']).toEqual(x);
  });
});
