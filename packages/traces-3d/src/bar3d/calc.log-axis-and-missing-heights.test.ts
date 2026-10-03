/**
 * `bar3d` calc on a log z axis and with heights that are not plain numbers. As the module
 * documents: a bar spans `base` → `base + z` in z data units, converted to linear z per end
 * (log10 on a log axis, where an end at or below zero has no finite position: −∞); the autorange
 * takes the finite ends of the bars that have a height, and their whole footprints on x and y
 * (0.8 of the smallest spacing of the positions by default).
 */
import { supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcBar3d } from './calc.ts';
import { bar3d } from './index.ts';

const registry = createChartRegistry().register(bar3d, sceneComponent);

function calcOf(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const r = supplyDefaults(
    { data: [{ type: 'bar3d', ...trace }], layout: { template: 'none', ...layout } },
    registry.core,
  );
  return calcBar3d(r.fullData[0]!, { fullLayout: r.fullLayout, index: 0 } as CalcContext);
}

const LOG_Z = { scene: { zaxis: { type: 'log' } } };

describe('bar3d calc: log z axis', () => {
  it('bars from the default base 0 have no finite bottom: the range is the tops, in log10', () => {
    const c = calcOf({ x: [0, 1], y: [0, 0], z: [10, 1000] }, LOG_Z);
    expect(Array.from(c.bottom)).toEqual([0, 0]);
    expect(Array.from(c.top)).toEqual([10, 1000]);
    expect(Array.from(c.bottomL)).toEqual([-Infinity, -Infinity]);
    expect(Array.from(c.topL)).toEqual([1, 3]);
    expect(c.sceneExtremes.z).toEqual([1, 3]);
  });

  it('bars from a positive base span log10(base) → log10(base + z)', () => {
    const c = calcOf({ x: [0, 1], y: [0, 0], z: [9, 999], base: 1 }, LOG_Z);
    expect(Array.from(c.bottom)).toEqual([1, 1]);
    expect(Array.from(c.top)).toEqual([10, 1000]);
    expect(Array.from(c.bottomL)).toEqual([0, 0]);
    expect(Array.from(c.topL)).toEqual([1, 3]);
    expect(c.sceneExtremes.z).toEqual([0, 3]);
  });
});

describe('bar3d calc: heights that are not plain numbers', () => {
  it('reads numeric strings; a blank height is a missing bar, out of every range', () => {
    const c = calcOf({ x: [0, 5, 1], y: [0, 0, 0], z: ['3', ' ', 2] });
    expect(Array.from(c.value)).toEqual([3, NaN, 2]);
    expect(Array.from(c.top)).toEqual([3, NaN, 2]);
    expect(c.sceneExtremes.z).toEqual([0, 3]);
    // Footprints 0.8 wide (the smallest x spacing is 1) around x = 0 and 1; not the bar at 5.
    expect(c.sceneExtremes.x![0]).toBeCloseTo(-0.4, 12);
    expect(c.sceneExtremes.x![1]).toBeCloseTo(1.4, 12);
    // One y position: 0.8 deep.
    expect(c.sceneExtremes.y![0]).toBeCloseTo(-0.4, 12);
    expect(c.sceneExtremes.y![1]).toBeCloseTo(0.4, 12);
  });

  it('claims no range at all when no bar has a height', () => {
    const c = calcOf({ x: [0, 1], y: [0, 1], z: [null, 'tall'] });
    expect(c.count).toBe(2);
    expect(Array.from(c.value)).toEqual([NaN, NaN]);
    expect(c.sceneExtremes).toEqual({});
  });
});
