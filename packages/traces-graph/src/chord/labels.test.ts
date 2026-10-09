import { describe, expect, it } from 'vitest';
import { fitsTangential, placeLabels, TEXT_PAD, type LabelArc } from './labels.ts';

const DEG = Math.PI / 180;
const CX = 200;
const CY = 150;
const R = 100;

/** An arc of `span` degrees around `mid` degrees, with a 40 × 12 px text. */
const arc = (mid: number, span = 30, width = 40, height = 12): LabelArc => ({
  start: (mid - span / 2) * DEG,
  end: (mid + span / 2) * DEG,
  width,
  height,
});

const radius = (p: { x: number; y: number }): number => Math.hypot(p.x - CX, p.y - CY);

describe('radial labels', () => {
  it('start just outside the ring, reading away from the center on the right half', () => {
    const [right, below] = placeLabels([arc(60), arc(150)], CX, CY, R, 'radial');
    expect(radius(right!)).toBeCloseTo(R + TEXT_PAD, 9);
    expect(right!.x).toBeCloseTo(CX + (R + TEXT_PAD) * Math.sin(60 * DEG), 9);
    expect(right!.y).toBeCloseTo(CY - (R + TEXT_PAD) * Math.cos(60 * DEG), 9);
    // Text at 0° reads to the right; clockwise positive. At 60° from 12 o'clock: −30°.
    expect(right!.angle).toBeCloseTo(-30, 9);
    expect(right!.anchor).toBe('left');
    expect(below!.angle).toBeCloseTo(60, 9);
    expect(below!.anchor).toBe('left');
  });

  it('are turned around on the left half, so no label is upside down', () => {
    const places = placeLabels([arc(240), arc(300)], CX, CY, R, 'radial');
    expect(places.map((p) => p.anchor)).toEqual(['right', 'right']);
    // 240°: the outward direction is at 150° on screen; turned around, −30°.
    expect(places[0]!.angle).toBeCloseTo(-30, 9);
    expect(places[1]!.angle).toBeCloseTo(30, 9);
    // Every angle around the ring ends up between −90° and 90°.
    const ring = Array.from({ length: 36 }, (_, k) => arc(k * 10 + 5, 9));
    for (const p of placeLabels(ring, CX, CY, R, 'radial')) {
      expect(p.angle).toBeGreaterThanOrEqual(-90);
      expect(p.angle).toBeLessThanOrEqual(90);
    }
    // Straight up and straight down are not flipped.
    const [up, down] = placeLabels([arc(0), arc(180)], CX, CY, R, 'radial');
    expect(up!.anchor).toBe('left');
    expect(Math.abs(up!.angle)).toBeCloseTo(90, 9);
    expect(down!.anchor).toBe('left');
    expect(Math.abs(down!.angle)).toBeCloseTo(90, 9);
  });

  it('are left out where the arc is shorter than a line of text', () => {
    // 12 px of text needs 12 / 104 rad ≈ 6.6° of ring, gaps to the neighbours included.
    const tight = [arc(10, 4), arc(14, 4), arc(18, 4), arc(22, 4), arc(196, 344)];
    expect(placeLabels(tight, CX, CY, R, 'radial').map((p) => p.arc)).toEqual([4]);
    // The same short arc with room on both sides keeps its label.
    const roomy = [arc(10, 4), arc(100, 20), arc(250, 20)];
    expect(placeLabels(roomy, CX, CY, R, 'radial').map((p) => p.arc)).toEqual([0, 1, 2]);
    // An arc alone has no neighbours to make room for.
    expect(placeLabels([arc(10, 4)], CX, CY, R, 'radial')).toHaveLength(0);
    expect(
      placeLabels([{ start: 0, end: 2 * Math.PI, width: 40, height: 12 }], CX, CY, R, 'radial'),
    ).toHaveLength(1);
  });

  it('works on a counterclockwise ring', () => {
    const ccw: LabelArc[] = [
      { start: -10 * DEG, end: -50 * DEG, width: 40, height: 12 },
      { start: -60 * DEG, end: -100 * DEG, width: 40, height: 12 },
    ];
    const places = placeLabels(ccw, CX, CY, R, 'radial');
    expect(places).toHaveLength(2);
    expect(places.every((p) => p.anchor === 'right')).toBe(true);
    // −30° from 12 o'clock is on the left: the outward direction at −120°, turned around.
    expect(places[0]!.angle).toBeCloseTo(60, 9);
  });
});

describe('tangential labels', () => {
  it('sit across the radius over the middle of their arc', () => {
    const [top, right] = placeLabels([arc(20, 60), arc(90, 60)], CX, CY, R, 'tangential');
    expect(radius(top!)).toBeCloseTo(R + TEXT_PAD + 6, 9);
    expect(top!.angle).toBeCloseTo(20, 9);
    expect(top!.anchor).toBe('center');
    expect(right!.angle).toBeCloseTo(90, 9);
  });

  it('are turned around on the lower half', () => {
    const [low, left] = placeLabels([arc(170, 60), arc(260, 60)], CX, CY, R, 'tangential');
    expect(low!.angle).toBeCloseTo(-10, 9);
    expect(left!.angle).toBeCloseTo(80, 9);
    const ring = Array.from({ length: 12 }, (_, k) => arc(k * 30 + 15, 29, 20));
    for (const p of placeLabels(ring, CX, CY, R, 'tangential')) {
      expect(p.angle).toBeGreaterThanOrEqual(-90);
      expect(p.angle).toBeLessThanOrEqual(90);
    }
  });

  it('are left out where the text is wider than its arc', () => {
    // 40 px at radius 104 is seen under 2·atan(20 / 104) ≈ 21.8° from the center.
    expect(fitsTangential(40, 22 * DEG, R + TEXT_PAD)).toBe(true);
    expect(fitsTangential(40, 21 * DEG, R + TEXT_PAD)).toBe(false);
    expect(fitsTangential(4000, 200 * DEG, R + TEXT_PAD)).toBe(true);
    expect(fitsTangential(40, 22 * DEG, 0)).toBe(false);
    const places = placeLabels([arc(30, 21), arc(120, 22)], CX, CY, R, 'tangential');
    expect(places.map((p) => p.arc)).toEqual([1]);
  });
});

describe('placeLabels', () => {
  it('skips arcs without text', () => {
    const arcs = [arc(30), arc(120, 30, 0, 12), arc(210, 30, 40, 0)];
    expect(placeLabels(arcs, CX, CY, R, 'radial').map((p) => p.arc)).toEqual([0]);
    expect(placeLabels(arcs, CX, CY, R, 'tangential').map((p) => p.arc)).toEqual([0]);
    expect(placeLabels([], CX, CY, R, 'radial')).toEqual([]);
  });
});
