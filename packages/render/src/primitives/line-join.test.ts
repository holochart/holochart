import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  computeSegmentFrame,
  END_BEVEL,
  END_MITER,
  segmentDistance,
  type LineCap,
  type LineJoin,
} from './line-join.ts';

type P = [number, number];

/** Frames of every segment of an open polyline, like the vertex shader builds them. */
function frames(points: P[], width: number, join: LineJoin, cap: LineCap, miterLimit = 4) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) {
    out.push(
      computeSegmentFrame(
        points[i - 1],
        points[i]!,
        points[i + 1]!,
        points[i + 2],
        width,
        join,
        cap,
        miterLimit,
      ),
    );
  }
  return out;
}

function coverCount(fs: ReturnType<typeof frames>, p: P): number {
  let n = 0;
  for (const f of fs) {
    const d = segmentDistance(f, p);
    if (d !== undefined && d <= 0) n++;
  }
  return n;
}

function distToSegment(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function distToPolyline(p: P, pts: P[]): number {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i]!, pts[i + 1]!));
  return d;
}

/** Two segments of length `len` turning by `turn` radians at the origin. */
function elbow(turn: number, len: number): P[] {
  return [
    [-len, 0],
    [0, 0],
    [len * Math.cos(turn), len * Math.sin(turn)],
  ];
}

describe('line joins (CPU mirror of the shader)', () => {
  const W = 10;

  it('round join + round caps cover exactly the stroke (union of capsules) with no overlap', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -2.2, max: 2.2, noNaN: true }),
        fc.double({ min: -30, max: 30, noNaN: true }),
        fc.double({ min: -30, max: 30, noNaN: true }),
        (turn, px, py) => {
          const pts = elbow(turn, 25);
          const fs = frames(pts, W, 'round', 'round');
          const d = distToPolyline([px, py], pts);
          const n = coverCount(fs, [px, py]);
          if (d < W / 2 - 1e-6) expect(n).toBe(1);
          else if (d > W / 2 + 1e-6) expect(n).toBe(0);
          else expect(n).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 3000 },
    );
  });

  for (const join of ['miter', 'bevel'] as const) {
    it(`${join} join: segment bodies covered exactly once, nothing beyond the join outline`, () => {
      fc.assert(
        fc.property(
          fc.double({ min: -2.2, max: 2.2, noNaN: true }),
          fc.double({ min: -30, max: 30, noNaN: true }),
          fc.double({ min: -30, max: 30, noNaN: true }),
          (turn, px, py) => {
            const pts = elbow(turn, 25);
            const fs = frames(pts, W, join, 'butt', 10);
            const p: P = [px, py];
            const n = coverCount(fs, p);
            expect(n).toBeLessThanOrEqual(1);
            // Inside either segment's rectangle body → covered.
            const inBody = fs.some((f) => {
              const rx = p[0] - f.a[0];
              const ry = p[1] - f.a[1];
              const t = rx * f.dir[0] + ry * f.dir[1];
              const perp = -rx * f.dir[1] + ry * f.dir[0];
              return t > 1e-6 && t < f.len - 1e-6 && Math.abs(perp) < W / 2 - 1e-6;
            });
            if (inBody) expect(n).toBe(1);
            // Bevel ⊂ round stroke; miter ⊂ stroke dilated by the miter length.
            const d = distToPolyline(p, pts);
            const bound = join === 'bevel' ? W / 2 : (W / 2) * 10;
            if (d > bound + 1e-6) expect(n).toBe(0);
          },
        ),
        { numRuns: 3000 },
      );
    });
  }

  it('miter tip reaches 1/cos(θ/2) · w/2 and falls back to bevel past the limit', () => {
    const turn = Math.PI / 2; // right angle: miter ratio √2
    const fs = frames(elbow(turn, 25), W, 'miter', 'butt', 4);
    expect(fs[0]!.endEnd.mode).toBe(END_MITER);
    // Outer corner of a left turn at the origin is (+w/2, -w/2).
    expect(coverCount(fs, [W / 2 - 0.1, -W / 2 + 0.1])).toBe(1);
    const sharp = frames(elbow(2.9, 25), W, 'miter', 'butt', 4);
    expect(sharp[0]!.endEnd.mode).toBe(END_BEVEL);
    expect(sharp[1]!.startEnd.mode).toBe(END_BEVEL);
  });

  it('caps: butt stops at the endpoint, square extends by w/2, round is a half disc', () => {
    const pts: P[] = [
      [0, 0],
      [20, 0],
    ];
    const at = (cap: LineCap, p: P) => coverCount(frames(pts, W, 'miter', cap), p);
    expect(at('butt', [-1, 0])).toBe(0);
    expect(at('square', [-4.9, 4.9])).toBe(1);
    expect(at('round', [-4.9, 0])).toBe(1);
    expect(at('round', [-4, 4])).toBe(0);
  });
});
