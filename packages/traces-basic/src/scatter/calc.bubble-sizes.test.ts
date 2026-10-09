/**
 * Per-point marker sizes at their edges: `sizeref: 0`, sizes that are missing, not numeric or not
 * positive, and a size array shorter than the trace. Expected values are worked out by hand from
 * the plotly.js definitions the calc ports:
 *
 * - drawn diameter (`makeBubbleSizeFn`): `2 · max(v / 2 / sizeref, sizemin)` for `diameter`,
 *   `2 · max(sqrt(v / 2 / sizeref), sizemin)` for `area`, with `sizeref || 1`, and 0 when the base
 *   size is not a positive number;
 * - autorange padding (`calcMarkerSize`): `max((v || 0) / (1.6 · (sizeref || 1)), 3)`, with the
 *   square root of the quotient for `area`.
 */
import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { scatter, type ScatterCalc } from './index.ts';

const registry = createChartRegistry().register(scatter);

function defaults(data: unknown[]): FullTrace[] {
  return supplyDefaults({ data, layout: {} }, registry.core).fullData;
}

function calcOf(trace: FullTrace): ScatterCalc {
  const axis = { scale: createScale({ type: 'linear' }), type: 'linear', full: {} };
  const ctx: CalcContext = {
    fullLayout: {} as never,
    index: 0,
    xaxis: axis as unknown as AxisInfo,
    yaxis: axis as unknown as AxisInfo,
  };
  return scatter.calc!(trace, ctx) as ScatterCalc;
}

const diameters = (calc: ScatterCalc): number[] => Array.from(calc.markerSize as Float32Array);
const paddings = (calc: ScatterCalc): number[] => Array.from(calc.ppad as Float64Array);

function expectClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 6));
}

describe('scatter calc: per-point marker sizes', () => {
  it('reads sizeref 0 as 1 (Plotly: `marker.sizeref || 1`)', () => {
    const [trace] = defaults([
      { y: [1, 2], mode: 'markers', marker: { size: [10, 40], sizeref: 0 } },
    ]);
    // The zero reaches calc: it is the calc that falls back, not the defaults.
    expect((trace!['marker'] as { sizeref: unknown }).sizeref).toBe(0);
    const calc = calcOf(trace!);
    expect(diameters(calc)).toEqual([10, 40]);
    // 10 / 1.6 and 40 / 1.6.
    expectClose(paddings(calc), [6.25, 25]);
  });

  it('hides points whose size is missing, not numeric or not positive; they pad by 3 px', () => {
    const [trace] = defaults([
      {
        y: [1, 2, 3, 4, 5, 6, 7],
        mode: 'markers',
        marker: { size: [12, null, '', 'big', '20', -4, 0] },
      },
    ]);
    const calc = calcOf(trace!);
    // Only 12 and the numeric string '20' draw.
    expect(diameters(calc)).toEqual([12, 0, 0, 0, 20, 0, 0]);
    // 12 / 1.6 = 7.5 and 20 / 1.6 = 12.5; everything else gets the 3 px minimum.
    expectClose(paddings(calc), [7.5, 3, 3, 3, 12.5, 3, 3]);
  });

  it('hides the points beyond the end of a size array shorter than the trace', () => {
    const [trace] = defaults([{ y: [1, 2, 3], mode: 'markers', marker: { size: [10] } }]);
    const calc = calcOf(trace!);
    expect(calc.length).toBe(3);
    expect(diameters(calc)).toEqual([10, 0, 0]);
    expectClose(paddings(calc), [6.25, 3, 3]);
  });

  it("sizemode 'area': zero and missing sizes draw nothing and pad by 3 px", () => {
    const [trace] = defaults([
      {
        y: [1, 2, 3],
        mode: 'markers',
        marker: { size: [0, 80, null], sizemode: 'area', sizeref: 2 },
      },
    ]);
    const calc = calcOf(trace!);
    // 80: radius sqrt(80 / 2 / 2) = sqrt(20); padding sqrt(80 / (1.6 · 2)) = sqrt(25).
    expectClose(diameters(calc), [0, 2 * Math.sqrt(20), 0]);
    expectClose(paddings(calc), [3, 5, 3]);
  });
});
