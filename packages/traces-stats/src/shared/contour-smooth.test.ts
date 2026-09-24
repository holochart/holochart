import { describe, expect, it } from 'vitest';
import { smoothPath } from './contour-smooth.ts';

describe('smoothPath', () => {
  const zig = { x: [0, 1, 2, 3, 4], y: [0, 1, 0, 1, 0] };

  it('returns the input for smoothing 0 or fewer than 3 points', () => {
    const r = smoothPath(zig.x, zig.y, false, 0);
    expect(Array.from(r.x)).toEqual(zig.x);
    expect(Array.from(r.y)).toEqual(zig.y);
    const two = smoothPath([0, 1], [0, 1], false, 1);
    expect(Array.from(two.x)).toEqual([0, 1]);
    const tri = smoothPath([0, 1], [0, 1], true, 1);
    expect(tri.x).toHaveLength(2);
  });

  it('keeps the endpoints and every input point of open paths', () => {
    const segs = 6;
    const r = smoothPath(zig.x, zig.y, false, 1, segs);
    expect(r.x).toHaveLength(1 + (zig.x.length - 1) * segs);
    for (let k = 0; k < zig.x.length; k++) {
      expect(r.x[k * segs]).toBeCloseTo(zig.x[k]!, 12);
      expect(r.y[k * segs]).toBeCloseTo(zig.y[k]!, 12);
    }
    expect(r.x[0]).toBe(0);
    expect(r.x[r.x.length - 1]).toBe(4);
    expect(r.y[r.y.length - 1]).toBe(0);
    // Curved: samples between the vertices leave the straight segments.
    expect(r.y[segs / 2]).not.toBeCloseTo(0.5, 3);
  });

  it('keeps collinear points on their line', () => {
    const r = smoothPath([0, 1, 3, 6], [0, 2, 6, 12], false, 1.3);
    for (let k = 0; k < r.x.length; k++) expect(r.y[k]).toBeCloseTo(2 * r.x[k]!, 12);
  });

  it('smooths closed paths all the way round without repeating the start', () => {
    const sq = { x: [0, 1, 1, 0], y: [0, 0, 1, 1] };
    const segs = 8;
    const r = smoothPath(sq.x, sq.y, true, 1, segs);
    expect(r.x).toHaveLength(sq.x.length * segs);
    for (let k = 0; k < sq.x.length; k++) {
      expect(r.x[k * segs]).toBeCloseTo(sq.x[k]!, 12);
      expect(r.y[k * segs]).toBeCloseTo(sq.y[k]!, 12);
    }
    const last = r.x.length - 1;
    expect(r.x[last] === 0 && r.y[last] === 0).toBe(false);
    // The closing span bulges outwards like the others (symmetric shape).
    const mid = (k: number) => [r.x[k * segs + segs / 2]!, r.y[k * segs + segs / 2]!];
    expect(mid(0)[1]).toBeCloseTo(-(mid(2)[1]! - 1), 12);
    expect(mid(3)[0]).toBeCloseTo(-(mid(1)[0]! - 1), 12);
    expect(mid(3)[0]).toBeLessThan(0);
  });

  it('matches the Plotly tangent formula on a simple corner', () => {
    // Points (0,0), (1,0), (1,1), smoothing 1: tangent at (1,0) from makeTangent.
    const r = smoothPath([0, 1, 1], [0, 0, 1], false, 1, 2);
    // d1 = (−1, 0), d2 = (0, 1), |d|^0.5 = 1: num = (−1, −1), denom = 6.
    // Q (0,0) → (1 − 1/6, −1/6) → (1,0) at t = 0.5:
    expect(r.x[1]).toBeCloseTo(0.25 * 0 + 0.5 * (5 / 6) + 0.25 * 1, 12);
    expect(r.y[1]).toBeCloseTo(0.5 * (-1 / 6), 12);
  });
});
