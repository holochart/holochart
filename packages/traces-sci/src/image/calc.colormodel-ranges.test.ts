/**
 * Component ranges of the image color models and the pixels calc makes from them, following
 * plotly.js `image/constants.js` (`colormodel`: the CSS range of each component, which `zmin` /
 * `zmax` default to; `rgba256` defaults its alpha to 0–255) and `image/calc.js` (`makeScaler`: each
 * component is mapped linearly from `[zmin, zmax]` to the CSS range and clamped). Expected pixels
 * are the 8-bit RGBA of the CSS color, worked out by hand.
 */
import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { calcImage, colorRangeOf } from './calc.ts';
import { image } from './index.ts';

const registry = createChartRegistry().register(image);

function axis(fullLayout: FullLayout, id: 'x' | 'y'): AxisInfo {
  const full = fullLayout[`${id}axis`] as FullAxis;
  const scale = createScale({ type: 'linear', range: [-5, 5] });
  return { id, name: `${id}axis`, letter: id, type: 'linear', scale, full } as unknown as AxisInfo;
}

/** Defaults, then calc, of an image of one row of pixels. */
function calcRow(pixels: unknown[], trace: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'image', z: [pixels], ...trace }] },
    registry.core,
  );
  const t = fullData[0]!;
  const calc = calcImage(t, { xaxis: axis(fullLayout, 'x'), yaxis: axis(fullLayout, 'y') });
  return { trace: t, calc, rgba: Array.from(calc.pixels!.data) };
}

/** Plotly's `constants.colormodel`: the default `zmin` / `zmax` of each model. */
const RANGES = [
  { model: 'rgb', zmin: [0, 0, 0], zmax: [255, 255, 255] },
  { model: 'rgba', zmin: [0, 0, 0, 0], zmax: [255, 255, 255, 1] },
  { model: 'rgba256', zmin: [0, 0, 0, 0], zmax: [255, 255, 255, 255] },
  { model: 'hsl', zmin: [0, 0, 0], zmax: [360, 100, 100] },
  { model: 'hsla', zmin: [0, 0, 0, 0], zmax: [360, 100, 100, 1] },
];

/** One pixel per model and the 8-bit RGBA of its CSS color. */
const PIXELS = [
  { model: 'rgb', pixel: [10, 20, 30], rgba: [10, 20, 30, 255] },
  // Alpha 0.2 of 1 → 51 of 255.
  { model: 'rgba', pixel: [10, 20, 30, 0.2], rgba: [10, 20, 30, 51] },
  // Alpha 51 of 255 is the same 0.2.
  { model: 'rgba256', pixel: [10, 20, 30, 51], rgba: [10, 20, 30, 51] },
  // hsl(120°, 100%, 50%) is pure green; hsl(240°, 100%, 50%) pure blue.
  { model: 'hsl', pixel: [120, 100, 50], rgba: [0, 255, 0, 255] },
  { model: 'hsla', pixel: [240, 100, 50, 0.2], rgba: [0, 0, 255, 51] },
];

describe('image calc: component ranges per color model', () => {
  it.each(RANGES)('$model defaults zmin / zmax to its range', ({ model, zmin, zmax }) => {
    const { trace, calc } = calcRow([[0, 0, 0, 0]], { colormodel: model });
    expect(colorRangeOf(trace)).toEqual({ colormodel: model, zmin, zmax });
    expect(calc.colormodel).toBe(model);
  });

  it("defaults to 'rgb'", () => {
    const { trace, calc } = calcRow([[0, 0, 0]]);
    expect(colorRangeOf(trace)).toEqual({
      colormodel: 'rgb',
      zmin: [0, 0, 0],
      zmax: [255, 255, 255],
    });
    expect(calc.colormodel).toBe('rgb');
  });

  it.each(PIXELS)('$model pixels become the RGBA of their CSS color', ({ model, pixel, rgba }) => {
    expect(calcRow([pixel], { colormodel: model }).rgba).toEqual(rgba);
  });

  it('draws a 3-component model opaque and reads only its components', () => {
    // The fourth value is not an alpha in 'rgb' and 'hsl'.
    expect(calcRow([[10, 20, 30, 0]]).rgba).toEqual([10, 20, 30, 255]);
    expect(calcRow([[0, 100, 50, 0]], { colormodel: 'hsl' }).rgba).toEqual([255, 0, 0, 255]);
  });
});

describe('image calc: zmin / zmax rescale components to the model range', () => {
  it('maps [0, zmax] onto 0–255 and clamps what falls outside', () => {
    // 0.2 of 1 → 51 of 255; 2 is above zmax, −1 below zmin.
    const s = calcRow(
      [
        [0.2, 1, 0],
        [2, -1, 0.2],
      ],
      { zmax: [1, 1, 1] },
    );
    expect(s.rgba).toEqual([51, 255, 0, 255, 255, 0, 51, 255]);
  });

  it('fills the components a partial zmax leaves out from the model range', () => {
    const s = calcRow([[40, 51, 300]], { zmax: [100] });
    expect(colorRangeOf(s.trace).zmax).toEqual([100, 255, 255]);
    // Red: 40 of 100 → 102 of 255; green as given; blue clamped to 255.
    expect(s.rgba).toEqual([102, 51, 255, 255]);
  });

  it('maps [zmin, zmax] with a zmin above 0', () => {
    // Red from 100 to 200: 120 is 0.2 of the way → 51; 50 is below zmin → 0.
    const s = calcRow(
      [
        [120, 0, 0],
        [50, 0, 0],
      ],
      { zmin: [100, 0, 0], zmax: [200, 255, 255] },
    );
    expect(colorRangeOf(s.trace)).toMatchObject({ zmin: [100, 0, 0], zmax: [200, 255, 255] });
    expect(s.rgba).toEqual([51, 0, 0, 255, 0, 0, 0, 255]);
  });

  it('rescales hsl and alpha components as well', () => {
    // Hue 0.5 of 1 → 180° (cyan), saturation and lightness as fractions of 1.
    const hsl = calcRow([[0.5, 1, 0.5]], { colormodel: 'hsl', zmax: [1, 1, 1] });
    expect(hsl.rgba).toEqual([0, 255, 255, 255]);
    // Alpha 20 of 100 → 0.2 → 51 of 255.
    const rgba = calcRow([[10, 20, 30, 20]], { colormodel: 'rgba', zmax: [255, 255, 255, 100] });
    expect(rgba.rgba).toEqual([10, 20, 30, 51]);
  });
});
