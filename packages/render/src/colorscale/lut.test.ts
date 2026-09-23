import { describe, expect, it } from 'vitest';
import { createResourceManager } from '../resources.ts';
import {
  acquireColorscaleTexture,
  buildColorscaleLUT,
  colorscaleKey,
  colorscaleT,
  COLORSCALE_LUT_SIZE,
  lutCoord,
  resolveColorDomain,
  sampleColorscale,
  type Colorscale,
} from './lut.ts';

const GREYS: Colorscale = [
  [0, [0, 0, 0, 1]],
  [1, [1, 1, 1, 1]],
];
const RGB: Colorscale = [
  [0, [1, 0, 0, 1]],
  [0.5, [0, 1, 0, 1]],
  [1, [0, 0, 1, 0.5]],
];

describe('colorscale LUT', () => {
  it('builds 256 RGBA texels with exact endpoints', () => {
    const lut = buildColorscaleLUT(GREYS);
    expect(lut.length).toBe(COLORSCALE_LUT_SIZE * 4);
    expect([...lut.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...lut.subarray(255 * 4, 256 * 4)]).toEqual([255, 255, 255, 255]);
    for (let i = 0; i < 256; i++) expect(lut[i * 4]).toBe(i); // linear ramp maps 1:1
  });

  it('interpolates between multiple stops including alpha', () => {
    const lut = buildColorscaleLUT(RGB, 3);
    expect([...lut]).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 128]);
    expect(sampleColorscale(RGB, 0.25)).toEqual([0.5, 0.5, 0, 1]);
    expect(sampleColorscale(RGB, -1)).toEqual([1, 0, 0, 1]);
    expect(sampleColorscale(RGB, 2)).toEqual([0, 0, 1, 0.5]);
  });

  it('sorts unsorted stops and supports hard steps', () => {
    const unsorted: Colorscale = [RGB[2]!, RGB[0]!, RGB[1]!];
    expect([...buildColorscaleLUT(unsorted)]).toEqual([...buildColorscaleLUT(RGB)]);
    const step: Colorscale = [
      [0, [0, 0, 0, 1]],
      [0.5, [0, 0, 0, 1]],
      [0.5, [1, 1, 1, 1]],
      [1, [1, 1, 1, 1]],
    ];
    expect(sampleColorscale(step, 0.49)[0]).toBe(0);
    expect(sampleColorscale(step, 0.51)[0]).toBe(1);
  });

  it('rejects empty colorscales and handles single stops', () => {
    expect(() => buildColorscaleLUT([])).toThrow(RangeError);
    const lut = buildColorscaleLUT([[0.3, [0, 1, 0, 1]]], 4);
    expect([...lut]).toEqual([0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255]);
  });

  it('maps t = 0 and t = 1 to texel centers', () => {
    expect(lutCoord(0) * 256).toBeCloseTo(0.5);
    expect(lutCoord(1) * 256).toBeCloseTo(255.5);
    expect(lutCoord(2)).toBe(lutCoord(1));
  });

  it('derives stable keys that ignore stop order but not colors', () => {
    expect(colorscaleKey(RGB)).toBe(colorscaleKey([RGB[1]!, RGB[0]!, RGB[2]!]));
    expect(colorscaleKey(RGB)).not.toBe(colorscaleKey(GREYS));
  });

  it('shares one texture per unique colorscale via the resource manager', () => {
    const resources = createResourceManager();
    const a = acquireColorscaleTexture(resources, RGB);
    const b = acquireColorscaleTexture(resources, [...RGB]);
    const c = acquireColorscaleTexture(resources, GREYS);
    expect(a.texture).toBe(b.texture);
    expect(c.texture).not.toBe(a.texture);
    expect(a.texture.image.width).toBe(256);
    expect(resources.stats().find((s) => s.key === a.key)?.refs).toBe(2);
    a.release();
    a.release(); // idempotent
    expect(resources.stats().find((s) => s.key === a.key)?.refs).toBe(1);
    b.release();
    c.release();
    expect(resources.stats()).toEqual([]);
  });
});

describe('color domain', () => {
  it('passes cmin/cmax through and orders them', () => {
    expect(resolveColorDomain(2, 10)).toEqual([2, 10]);
    expect(resolveColorDomain(10, 2)).toEqual([2, 10]);
  });

  it('widens the domain symmetrically around cmid (Plotly semantics)', () => {
    expect(resolveColorDomain(-2, 10, 0)).toEqual([-10, 10]);
    expect(resolveColorDomain(0, 10, 8)).toEqual([0, 16]);
  });

  it('never returns a degenerate domain', () => {
    expect(resolveColorDomain(5, 5)).toEqual([4.5, 5.5]);
    expect(resolveColorDomain(NaN, NaN)).toEqual([0, 1]);
  });

  it('maps values to t with clamping, reversal, and NaN passthrough', () => {
    expect(colorscaleT(5, 0, 10)).toBe(0.5);
    expect(colorscaleT(-5, 0, 10)).toBe(0);
    expect(colorscaleT(2, 0, 10, true)).toBe(0.8);
    expect(colorscaleT(NaN, 0, 10)).toBeNaN();
  });
});
