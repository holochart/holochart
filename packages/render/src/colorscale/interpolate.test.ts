import { describe, expect, it } from 'vitest';
import type { RGBA } from '../types.ts';
import { densifyColorscale, isColorscaleInterpolation, mixColors } from './interpolate.ts';
import { buildColorscaleLUT, colorscaleKey, sampleColorscale, type Colorscale } from './lut.ts';

const BLACK: RGBA = [0, 0, 0, 1];
const WHITE: RGBA = [1, 1, 1, 1];
const RED: RGBA = [1, 0, 0, 1];
const BLUE: RGBA = [0, 0, 1, 1];

/** Gray level of the sRGB midpoint of black and white, per space (known values). */
const GRAY_MIDPOINTS = {
  // sRGB average.
  rgb: 0.5,
  // Oklab L = 0.5 → linear 0.125 → sRGB 0.3885.
  oklab: 0.3885,
  // CIE L* = 50 → Y = 0.1842 → sRGB 0.4663.
  lab: 0.4663,
  // Grays have no hue: LCh reduces to Lab.
  hcl: 0.4663,
} as const;

function chroma(c: readonly number[]): number {
  return Math.max(c[0]!, c[1]!, c[2]!) - Math.min(c[0]!, c[1]!, c[2]!);
}

describe('mixColors', () => {
  it.each(Object.entries(GRAY_MIDPOINTS))('black–white midpoint in %s', (space, gray) => {
    const mid = mixColors(BLACK, WHITE, 0.5, space as keyof typeof GRAY_MIDPOINTS);
    for (let i = 0; i < 3; i++) expect(mid[i]).toBeCloseTo(gray, 3);
    expect(mid[3]).toBe(1);
  });

  it('keeps endpoints exact in every space and interpolates alpha linearly', () => {
    for (const space of ['rgb', 'oklab', 'lab', 'hcl'] as const) {
      expect(mixColors(RED, BLUE, 0, space)).toEqual([1, 0, 0, 1]);
      expect(mixColors(RED, BLUE, 1, space)).toEqual([0, 0, 1, 1]);
      expect(mixColors([1, 0, 0, 0], [0, 0, 1, 1], 0.25, space)[3]).toBeCloseTo(0.25, 10);
    }
  });

  it('perceptual spaces avoid the dark sRGB midpoint of red and blue; hcl keeps chroma', () => {
    const rgb = mixColors(RED, BLUE, 0.5, 'rgb');
    expect(rgb.slice(0, 3)).toEqual([0.5, 0, 0.5]);
    const oklab = mixColors(RED, BLUE, 0.5, 'oklab');
    const lab = mixColors(RED, BLUE, 0.5, 'lab');
    const hcl = mixColors(RED, BLUE, 0.5, 'hcl');
    // Lighter than the sRGB average (the classic muddy purple).
    for (const c of [oklab, lab, hcl]) expect(c[0] + c[1] + c[2]).toBeGreaterThan(1.05);
    // LCh walks around the hue circle instead of through gray, so it stays more saturated.
    expect(chroma(hcl)).toBeGreaterThan(chroma(lab));
    // Oklab's red–blue midpoint is a known purple: about (0.55, 0.25, 0.71) in sRGB... up to
    // rounding of the reference; check it's purple (red and blue dominate green).
    expect(oklab[0]).toBeGreaterThan(oklab[1]);
    expect(oklab[2]).toBeGreaterThan(oklab[1]);
  });

  it('hcl takes the shorter hue arc and uses the other hue for grays', () => {
    const toGray = mixColors(RED, [0.5, 0.5, 0.5, 1], 0.5, 'hcl');
    // Hue stays red's: red channel dominates.
    expect(toGray[0]).toBeGreaterThan(toGray[1]);
    expect(toGray[0]).toBeGreaterThan(toGray[2]);
  });

  it('recognizes space names', () => {
    expect(isColorscaleInterpolation('oklab')).toBe(true);
    expect(isColorscaleInterpolation('hsl')).toBe(false);
  });
});

describe('densifyColorscale', () => {
  const scale: Colorscale = [
    [0, BLACK],
    [0.5, RED],
    [0.5, BLUE],
    [1, WHITE],
  ];

  it('returns rgb scales unchanged', () => {
    expect(densifyColorscale(scale, 'rgb')).toBe(scale);
  });

  it('adds stops per segment, keeps original stops and hard steps', () => {
    const dense = densifyColorscale(scale, 'oklab', 64);
    expect(dense.length).toBe(1 + 32 + 1 + 32);
    expect(dense[0]).toEqual([0, BLACK]);
    expect(dense[dense.length - 1]).toEqual([1, WHITE]);
    const atHalf = dense.filter(([p]) => p === 0.5).map(([, c]) => c);
    expect(atHalf).toEqual([RED, BLUE]);
    for (let i = 1; i < dense.length; i++) {
      expect(dense[i]![0]).toBeGreaterThanOrEqual(dense[i - 1]![0]);
    }
  });

  it('sRGB interpolation of the densified scale follows the space closely', () => {
    const bw: Colorscale = [
      [0, BLACK],
      [1, WHITE],
    ];
    for (const space of ['oklab', 'lab', 'hcl'] as const) {
      const dense = densifyColorscale(bw, space);
      for (const t of [0.13, 0.5, 0.77]) {
        const exact = mixColors(BLACK, WHITE, t, space);
        const approx = sampleColorscale(dense, t);
        expect(Math.abs(approx[0] - exact[0])).toBeLessThan(1.5 / 255);
      }
    }
  });
});

describe('LUT interpolation space', () => {
  const bw: Colorscale = [
    [0, BLACK],
    [1, WHITE],
  ];

  it('builds the LUT in the requested space (midpoint texels)', () => {
    const rgb = buildColorscaleLUT(bw, 3);
    const oklab = buildColorscaleLUT(bw, 3, undefined, 'oklab');
    const lab = buildColorscaleLUT(bw, 3, undefined, 'lab');
    expect(rgb[4]).toBe(128);
    expect(oklab[4]).toBe(Math.round(GRAY_MIDPOINTS.oklab * 255));
    expect(lab[4]).toBe(Math.round(GRAY_MIDPOINTS.lab * 255));
    expect(sampleColorscale(bw, 0.5, undefined, 'lab')[0]).toBeCloseTo(GRAY_MIDPOINTS.lab, 3);
  });

  it('keys textures by space', () => {
    expect(colorscaleKey(bw)).not.toBe(colorscaleKey(bw, 'oklab'));
    expect(colorscaleKey(bw, 'rgb')).toBe(colorscaleKey(bw));
  });
});
