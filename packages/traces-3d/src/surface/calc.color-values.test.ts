/**
 * `surface` calc: the values the colorscale maps (`SurfaceCalc.color`). As documented there:
 * `surfacecolor` when given; else the raw `z` numbers on a z axis that is not linear (the heights
 * are then log10 of the data, while colors follow the data values); else null (the linear heights
 * themselves are mapped).
 */
import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcSurface } from './calc.ts';
import { surface } from './index.ts';

const registry = createChartRegistry().register(surface, sceneComponent);

function calcOf(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'surface', ...trace }], layout: { template: 'none', ...layout } },
    registry.core,
  );
  return calcSurface(fullData[0] as FullTrace, { fullLayout });
}

const DECADES = [
  [1, 10],
  [100, 1000],
];
const LOG_Z = { scene: { zaxis: { type: 'log' } } };

describe('surface calc: color values', () => {
  it('maps the heights themselves on a linear z axis (no separate color values)', () => {
    const calc = calcOf({ z: DECADES });
    expect(Array.from(calc.grid!.z)).toEqual([1, 10, 100, 1000]);
    expect(calc.color).toBeNull();
    expect(calc.surfacecolor).toBe(false);
    // Without x / y: the column and row indices.
    expect(calc.sceneExtremes).toEqual({ x: [0, 1], y: [0, 1], z: [1, 1000] });
  });

  it('on a log z axis: heights in log10, colors by the raw z values', () => {
    const calc = calcOf({ z: DECADES }, LOG_Z);
    expect(Array.from(calc.grid!.z)).toEqual([0, 1, 2, 3]);
    expect(Array.from(calc.color!)).toEqual([1, 10, 100, 1000]);
    expect(calc.surfacecolor).toBe(false);
    expect(calc.sceneExtremes.z).toEqual([0, 3]);
  });

  it('surfacecolor wins on any axis; its missing entries are gaps', () => {
    const calc = calcOf({ z: DECADES, surfacecolor: [[5, 'n/a'], [7]] }, LOG_Z);
    expect(Array.from(calc.grid!.z)).toEqual([0, 1, 2, 3]);
    expect(Array.from(calc.color!)).toEqual([5, NaN, 7, NaN]);
    expect(calc.surfacecolor).toBe(true);
  });
});
