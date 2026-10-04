/**
 * `scatter3d` calc: 3D error bars through the trace's defaults. Expected ends are worked by hand
 * from plotly.js `errorbars/compute_error.js` (`makeComputeError`) and `scatter3d/calc_errors.js`:
 *
 *   percent  → |value · k / 100|,  constant → |k|   (k: `value`, or `valueminus` downwards when
 *   `symmetric` is false);  data → `array[i]` (and `arrayminus[i]` downwards; a missing side is 0
 *   when the other one is given, no bar when both are missing).
 *
 * A bar runs from `value − minus` to `value + plus`; on a log axis the ends are `log10` of those.
 */
import { supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcScatter3d, type ErrorBar3d } from './calc.ts';
import { scatter3d } from './index.ts';

const registry = createChartRegistry().register(scatter3d, sceneComponent);

/** Defaults, then calc, as the runtime runs them. */
function calcOf(t: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'scatter3d', ...t }], layout: { template: 'none', ...layout } },
    registry.core,
  );
  const trace = fullData[0]!;
  const calc = calcScatter3d(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined });
  const bars = (letter: 'x' | 'y' | 'z'): ErrorBar3d | undefined =>
    calc.errors.find((e) => e.letter === letter);
  return { trace, calc, bars };
}

describe('scatter3d calc: error bars', () => {
  it('percent bars with valueminus are longer on one side', () => {
    const { calc, bars } = calcOf({
      x: [0, 1],
      y: [0, 1],
      z: [10, -20],
      error_z: { type: 'percent', value: 10, valueminus: 50 },
    });
    const z = bars('z')!;
    // 10: +10 % = 1 up, 50 % = 5 down. −20: 2 up, 10 down.
    expect(Array.from(z.plus)).toEqual([11, -18]);
    expect(Array.from(z.minus)).toEqual([5, -30]);
    expect(z.count).toBe(2);
    // The autorange holds the points (−20 … 10) and every bar end (−30 … 11).
    expect(calc.sceneExtremes.z).toEqual([-30, 11]);
    expect(calc.sceneExtremes.x).toEqual([0, 1]);
  });

  it('constant bars with valueminus, on the x axis', () => {
    const { calc, bars } = calcOf({
      x: [0, 4],
      y: [0, 1],
      z: [0, 1],
      error_x: { type: 'constant', value: 1, valueminus: 3 },
    });
    const x = bars('x')!;
    expect(Array.from(x.plus)).toEqual([1, 5]);
    expect(Array.from(x.minus)).toEqual([-3, 1]);
    expect(calc.errors.map((e) => e.letter)).toEqual(['x']);
    expect(calc.sceneExtremes.x).toEqual([-3, 5]);
    expect(calc.sceneExtremes.z).toEqual([0, 1]);
  });

  it('data bars: a side that is missing is 0 when the other is given, no bar when both are', () => {
    const { calc, bars } = calcOf({
      x: [0, 1, 2],
      y: [0, 1, 2],
      z: [10, 20, 30],
      // Point 0: only up (1). Point 1: only down (2). Point 2: neither.
      error_z: { array: [1], arrayminus: [undefined, 2] },
    });
    const z = bars('z')!;
    expect(Array.from(z.minus)).toEqual([10, 18, NaN]);
    expect(Array.from(z.plus)).toEqual([11, 20, NaN]);
    expect(z.count).toBe(2);
    expect(calc.sceneExtremes.z).toEqual([10, 30]);
  });

  it('symmetric data bars: none for points without a position or without a length', () => {
    const { calc, bars } = calcOf({
      x: [0, 1, 2, 3],
      y: [0, 1, 2, 3],
      z: [10, null, 30, 40],
      // Point 1 has no z; point 2's length is not a number; point 3 is past the array's end.
      error_z: { array: [1, 2, 'n/a'] },
    });
    const z = bars('z')!;
    expect(Array.from(z.minus)).toEqual([9, NaN, NaN, NaN]);
    expect(Array.from(z.plus)).toEqual([11, NaN, NaN, NaN]);
    expect(z.count).toBe(1);
    expect(calc.sceneExtremes.z).toEqual([9, 40]);
  });

  it('data bars without an array draw nothing and leave the autorange to the points', () => {
    const { trace, calc } = calcOf({
      x: [0, 1],
      y: [0, 1],
      z: [10, 30],
      error_z: { visible: true, type: 'data' },
    });
    expect((trace['error_z'] as Record<string, unknown>)['visible']).toBe(true);
    expect(calc.errors).toEqual([]);
    expect(calc.sceneExtremes.z).toEqual([10, 30]);
  });

  it('on a log axis the ends are the log10 of the data-space ends', () => {
    const { calc, bars } = calcOf(
      { x: [0, 1], y: [0, 1], z: [100, 1000], error_z: { type: 'constant', value: 50 } },
      { scene: { zaxis: { type: 'log' } } },
    );
    expect(Array.from(calc.z)).toEqual([2, 3]);
    const z = bars('z')!;
    expect(z.minus[0]).toBeCloseTo(Math.log10(50), 12);
    expect(z.minus[1]).toBeCloseTo(Math.log10(950), 12);
    expect(z.plus[0]).toBeCloseTo(Math.log10(150), 12);
    expect(z.plus[1]).toBeCloseTo(Math.log10(1050), 12);
    expect(calc.sceneExtremes.z![0]).toBeCloseTo(Math.log10(50), 12);
    expect(calc.sceneExtremes.z![1]).toBeCloseTo(Math.log10(1050), 12);
  });

  it('on a log axis a lower end at or below zero runs off the axis and stays out of the autorange', () => {
    const { calc, bars } = calcOf(
      { x: [0, 1], y: [0, 1], z: [1, 2], error_z: { type: 'constant', value: 5 } },
      { scene: { zaxis: { type: 'log' } } },
    );
    const z = bars('z')!;
    // 1 − 5 and 2 − 5 are negative: no log.
    expect(Array.from(z.minus)).toEqual([-Infinity, -Infinity]);
    expect(z.plus[0]).toBeCloseTo(Math.log10(6), 12);
    expect(z.plus[1]).toBeCloseTo(Math.log10(7), 12);
    expect(z.count).toBe(2);
    // From the lowest point (log10 1 = 0) to the highest upper end.
    expect(calc.sceneExtremes.z![0]).toBe(0);
    expect(calc.sceneExtremes.z![1]).toBeCloseTo(Math.log10(7), 12);
  });
});
