/**
 * `scatter3d` calc: which points are kept when `x`, `y`, `z` differ in length, and what a ribbon
 * line (`line.render: 'ribbon'`, a Holochart extension) adds to the scene autorange: half of
 * `line.ribbon.width` on each side of the points along `line.ribbon.axis`, in that axis' units
 * (the attribute's definition), when the trace draws lines.
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
  return calcScatter3d(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined });
}

describe('scatter3d calc: point count', () => {
  it('keeps the points every array has; the rest of longer arrays is out of the autorange', () => {
    const calc = calcOf({ x: [1, 2, 3, 40], y: [7, 8], z: [5, 6, 70] });
    expect(calc.length).toBe(2);
    expect(Array.from(calc.x)).toEqual([1, 2]);
    expect(Array.from(calc.y)).toEqual([7, 8]);
    expect(Array.from(calc.z)).toEqual([5, 6]);
    expect(calc.sceneExtremes).toEqual({ x: [1, 2], y: [7, 8], z: [5, 6] });
  });
});

describe('scatter3d calc: ribbon autorange', () => {
  const LINE = { x: [0, 1, 2], y: [0, 10, 4], z: [5, 6, 7] };

  it('reaches half the ribbon width past the points along the ribbon axis', () => {
    const y = calcOf({
      ...LINE,
      mode: 'lines',
      line: { render: 'ribbon', ribbon: { axis: 'y', width: 4 } },
    });
    expect(y.sceneExtremes).toEqual({ x: [0, 2], y: [-2, 12], z: [5, 7] });
    const z = calcOf({
      ...LINE,
      mode: 'lines+markers',
      line: { render: 'ribbon', ribbon: { axis: 'z', width: 1 } },
    });
    expect(z.sceneExtremes).toEqual({ x: [0, 2], y: [0, 10], z: [4.5, 7.5] });
  });

  it('adds nothing when the trace draws no lines, or the line is not a ribbon', () => {
    const markers = calcOf({
      ...LINE,
      mode: 'markers',
      line: { render: 'ribbon', ribbon: { axis: 'y', width: 4 } },
    });
    expect(markers.sceneExtremes).toEqual({ x: [0, 2], y: [0, 10], z: [5, 7] });
    const tube = calcOf({
      ...LINE,
      mode: 'lines',
      line: { render: 'tube', ribbon: { axis: 'y', width: 4 } },
    });
    expect(tube.sceneExtremes).toEqual({ x: [0, 2], y: [0, 10], z: [5, 7] });
  });

  it('adds nothing for a ribbon without a width of its own, or of width 0', () => {
    // The default width (a twentieth of the axis range) is only known once the range is.
    const auto = calcOf({ ...LINE, mode: 'lines', line: { render: 'ribbon' } });
    expect(auto.sceneExtremes).toEqual({ x: [0, 2], y: [0, 10], z: [5, 7] });
    const flat = calcOf({
      ...LINE,
      mode: 'lines',
      line: { render: 'ribbon', ribbon: { axis: 'y', width: 0 } },
    });
    expect(flat.sceneExtremes).toEqual({ x: [0, 2], y: [0, 10], z: [5, 7] });
  });

  it('leaves an axis without any position without a range', () => {
    const calc = calcOf({
      x: [0, 1],
      y: [null, null],
      z: [5, 6],
      mode: 'lines',
      line: { render: 'ribbon', ribbon: { axis: 'y', width: 4 } },
    });
    expect(Array.from(calc.y)).toEqual([NaN, NaN]);
    expect(calc.sceneExtremes.y).toBeUndefined();
    expect(calc.sceneExtremes.x).toEqual([0, 1]);
    expect(calc.sceneExtremes.z).toEqual([5, 6]);
  });
});
