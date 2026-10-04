/**
 * Density scale of violins with a fixed `width` (module comment of `violin/calc.ts`): such a violin
 * is scaled alone, its own peak density filling half its width, and takes no part in the scale
 * group of the other violins.
 */
import { createScale, supplyDefaults } from '@mk7s/holochart-core';
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

function calcAll(data: Record<string, unknown>[]) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: data.map((t) => ({ type: 'violin', ...t })), layout: {} },
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
  return calcs as ViolinCalc[];
}

/** Half-width (position-axis units) of the widest point of the trace's only violin. */
function widest(calc: ViolinCalc): number {
  return Math.max(...calc.density.v) / calc.scale[0]!;
}

// A tight cluster (a tall, narrow density) and a spread sample (a low, wide one).
const TIGHT = [4.9, 5, 5, 5.1, 5.2];
const SPREAD = [2, 3, 3.5, 4, 4.2, 5, 5.5, 6, 7, 9];
const tight = { x: TIGHT.map(() => 0), y: TIGHT, scalegroup: 'g' };
const spread = { x: SPREAD.map(() => 1), y: SPREAD, scalegroup: 'g' };
/** Automatic half-width for positions one apart: 0.5 · (1 − gap 0.3) · (1 − groupgap 0.3). */
const AUTO_HALF_WIDTH = 0.245;

describe('violin calc: fixed width', () => {
  it('in one scale group, the tallest density fills the half-width and the others follow', () => {
    const [a, b] = calcAll([tight, spread]);
    expect(Math.max(...a!.density.v)).toBeGreaterThan(Math.max(...b!.density.v));
    expect(widest(a!)).toBeCloseTo(AUTO_HALF_WIDTH, 12);
    const ratio = Math.max(...b!.density.v) / Math.max(...a!.density.v);
    expect(widest(b!)).toBeCloseTo(AUTO_HALF_WIDTH * ratio, 12);
  });

  it('a violin with a width fills half of it and leaves the scale group', () => {
    const [a, b] = calcAll([{ ...tight, width: 0.4 }, spread]);
    expect(a!.offsets.bdPos).toBe(0.2);
    expect(widest(a!)).toBeCloseTo(0.2, 12);
    // The spread violin is now the only one of its group: its own peak fills its half-width.
    expect(widest(b!)).toBeCloseTo(AUTO_HALF_WIDTH, 12);
  });

  it('scalemode count does not apply to a violin with a width', () => {
    const both = [...TIGHT, ...SPREAD];
    const data = { x: [...TIGHT.map(() => 0), ...SPREAD.map(() => 1)], y: both };
    const [c] = calcAll([{ ...data, width: 0.4, scalemode: 'count' }]);
    // Both violins of the trace share one scale: the trace's peak density over half the width.
    const peak = Math.max(...c!.density.v);
    expect(c!.scale[0]).toBeCloseTo(peak / 0.2, 9);
    expect(c!.scale[1]).toBeCloseTo(peak / 0.2, 9);
  });
});
