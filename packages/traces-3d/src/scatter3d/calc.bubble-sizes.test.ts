/**
 * `scatter3d` calc: marker diameters of bubbles (`marker.size` per point), through the trace's
 * defaults. Expected values follow plotly.js `scatter/make_bubble_size_func.js`, worked by hand:
 *
 *   radius = sizemode 'area' ? √(size / 2 / sizeref) : size / 2 / sizeref   (sizeref 0 counts as 1)
 *   drawn radius = radius > 0 ? max(radius, sizemin) : 0   (non-numeric and negative: not drawn)
 *   diameter = 2 · drawn radius
 */
import { supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcScatter3d } from './calc.ts';
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
  return { trace, calc };
}

const POINTS = { x: [0, 1, 2], y: [0, 1, 2], z: [0, 1, 2] };

describe('scatter3d calc: bubble diameters', () => {
  it("scales per-point sizes by diameter (the default sizemode), with sizemin as a radius' floor", () => {
    const { calc } = calcOf({
      ...POINTS,
      mode: 'markers',
      marker: { size: [4, 10, 30], sizeref: 2, sizemin: 3 },
    });
    // Radii 4/2/2 = 1, 10/2/2 = 2.5, 30/2/2 = 7.5; the first two are raised to sizemin 3.
    expect(calc.markerSize).toBeInstanceOf(Float32Array);
    expect(Array.from(calc.markerSize as Float32Array)).toEqual([6, 6, 15]);
  });

  it('scales by area with sizemode: area', () => {
    const { calc } = calcOf({
      ...POINTS,
      mode: 'markers',
      marker: { size: [8, 32, 200], sizeref: 4, sizemode: 'area' },
    });
    // Radii √(8/2/4) = 1, √(32/2/4) = 2, √(200/2/4) = 5.
    expect(Array.from(calc.markerSize as Float32Array)).toEqual([2, 4, 10]);
  });

  it('counts numeric strings; blank, missing and negative sizes are not drawn', () => {
    const { calc } = calcOf({
      x: [0, 1, 2, 3, 4, 5],
      y: [0, 1, 2, 3, 4, 5],
      z: [0, 1, 2, 3, 4, 5],
      mode: 'markers',
      // Five sizes for six points: the last point has none.
      marker: { size: ['12', '', null, -4, 8] },
    });
    expect(calc.length).toBe(6);
    expect(Array.from(calc.markerSize as Float32Array)).toEqual([12, 0, 0, 0, 8, 0]);
  });

  it('takes sizeref 0 as 1, like Plotly', () => {
    const { calc } = calcOf({
      ...POINTS,
      mode: 'markers',
      marker: { size: [4, 9, 16], sizeref: 0 },
    });
    expect(Array.from(calc.markerSize as Float32Array)).toEqual([4, 9, 16]);
  });

  it('gives one diameter for a single size (8 by default), and none without markers', () => {
    expect(calcOf({ ...POINTS, mode: 'markers' }).calc.markerSize).toBe(8);
    // sizeref and sizemode only apply to per-point sizes.
    const one = calcOf({
      ...POINTS,
      mode: 'markers',
      marker: { size: 12, sizeref: 4, sizemode: 'area' },
    });
    expect(one.calc.markerSize).toBe(12);
    expect(calcOf({ ...POINTS, mode: 'lines', marker: { size: [4, 9, 16] } }).calc.markerSize).toBe(
      0,
    );
  });
});
