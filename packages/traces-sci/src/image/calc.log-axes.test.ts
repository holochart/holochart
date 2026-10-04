/**
 * Image placement on log axes (plotly.js `image/calc.js`): `x0` is read in Plotly's calc space,
 * which on a log axis is the raw value (`d2c` is `cleanNumber` there), so the first pixel starts at
 * `x0 − dx/2` and the picture ends `w·dx` further, in data units. The drawn edges are the log10 of
 * those two values; a value at or below 0 has no log10.
 */
import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { calcImage } from './calc.ts';
import { image } from './index.ts';

const registry = createChartRegistry().register(image);

function axis(fullLayout: FullLayout, id: 'x' | 'y'): AxisInfo {
  const full = fullLayout[`${id}axis`] as FullAxis;
  const type = full?.type === 'log' ? 'log' : 'linear';
  const scale = createScale({ type, range: type === 'log' ? [0, 3] : [-5, 5] });
  return { id, name: `${id}axis`, letter: id, type, scale, full } as unknown as AxisInfo;
}

function calcOf(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'image', ...trace }], layout },
    registry.core,
  );
  const xaxis = axis(fullLayout, 'x');
  const yaxis = axis(fullLayout, 'y');
  const t = fullData[0]!;
  const calc = calcImage(t, { xaxis, yaxis });
  const extremes = image.extremes!(calc, t, { fullLayout, index: 0, xaxis, yaxis });
  return { trace: t, xaxis, yaxis, calc, extremes };
}

/** 3 columns × 2 rows. */
const RGB = [
  [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ],
  [
    [0, 0, 0],
    [128, 128, 128],
    [255, 255, 255],
  ],
];

const LOG_X = { xaxis: { type: 'log' } };

describe('image calc on log axes', () => {
  it('reads x0 as a raw value and gives the edges as log10 of the first and last pixel edge', () => {
    const s = calcOf({ z: RGB, x0: 10, dx: 10 }, LOG_X);
    expect(s.xaxis.type).toBe('log');
    // First pixel from 10 − 10/2 = 5; three pixels of 10 end at 35.
    expect([s.calc.x0, s.calc.dx]).toEqual([5, 10]);
    expect(s.calc.xEdges).toEqual([Math.log10(5), Math.log10(35)]);
    // The linear y axis is placed as usual: rows from 0 − ½ to 2 − ½.
    expect(s.calc.yEdges).toEqual([-0.5, 1.5]);
    expect([s.extremes.x!.min[0]!.l, s.extremes.x!.max[0]!.l]).toEqual([
      Math.log10(5),
      Math.log10(35),
    ]);
  });

  it('places rows the same way on a log y axis', () => {
    const s = calcOf({ z: RGB, y0: 100, dy: 50 }, { yaxis: { type: 'log' } });
    expect(s.yaxis.type).toBe('log');
    // First row from 100 − 50/2 = 75; two rows of 50 end at 175.
    expect([s.calc.y0, s.calc.dy]).toEqual([75, 50]);
    expect(s.calc.yEdges).toEqual([Math.log10(75), Math.log10(175)]);
    expect(s.calc.xEdges).toEqual([-0.5, 2.5]);
  });

  it('reads a numeric string x0 as its number', () => {
    const s = calcOf({ z: RGB, x0: '100', dx: 20 }, LOG_X);
    // First pixel from 100 − 20/2 = 90; three pixels of 20 end at 150.
    expect(s.calc.x0).toBe(90);
    expect(s.calc.xEdges).toEqual([Math.log10(90), Math.log10(150)]);
  });

  it('has no position for an edge at or below 0', () => {
    // Default x0 = 0, dx = 1: the first pixel starts at −0.5 and the picture ends at 2.5.
    const s = calcOf({ z: RGB }, LOG_X);
    expect(s.calc.x0).toBe(-0.5);
    expect(s.calc.xEdges[0]).toBeNaN();
    expect(s.calc.xEdges[1]).toBe(Math.log10(2.5));
    // The pixels themselves are unaffected.
    expect([s.calc.w, s.calc.h]).toEqual([3, 2]);
    expect(Array.from(s.calc.pixels!.data).slice(0, 4)).toEqual([255, 0, 0, 255]);
  });

  it('has no position for a non-numeric x0, which then adds nothing to the x autorange', () => {
    const s = calcOf({ z: RGB, x0: 'abc' }, LOG_X);
    expect(s.calc.x0).toBeNaN();
    expect(s.calc.xEdges[0]).toBeNaN();
    expect(s.calc.xEdges[1]).toBeNaN();
    expect(s.extremes.x).toEqual({ min: [], max: [] });
    // y is still placed.
    expect([s.extremes.y!.min[0]!.l, s.extremes.y!.max[0]!.l]).toEqual([-0.5, 1.5]);
  });
});
