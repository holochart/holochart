import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  computeEnd,
  computeSegmentFrame,
  END_BEVEL,
  END_MITER,
  QUAD_FRINGE,
  QUAD_SLACK,
  quadReach,
  segmentDistance,
  type LineCap,
  type LineJoin,
} from './line-join.ts';
import { LINE_VERTEX_SHADER } from './line.glsl.ts';

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

describe('segment quad extents stay bounded (spike B regression)', () => {
  const unit = fc
    .double({ min: 0, max: 2 * Math.PI, noNaN: true })
    .map((a): P => [Math.cos(a), Math.sin(a)]);
  const joins: LineJoin[] = ['miter', 'round', 'bevel'];

  it('never extends past the miter limit, and only miters extend past half the width', () => {
    fc.assert(
      fc.property(
        unit,
        unit,
        fc.double({ min: 0.05, max: 50, noNaN: true }),
        fc.double({ min: 1, max: 20, noNaN: true }),
        fc.constantFrom(...joins),
        (dIn, dOut, hw, limit, join) => {
          const end = computeEnd(dIn, dOut, true, hw, join, 'butt', limit);
          const bound = hw * Math.max(1, Math.sqrt(limit * limit - 1));
          expect(end.extent).toBeLessThanOrEqual(bound * (1 + 1e-9));
          if (end.mode !== END_MITER) expect(end.extent).toBe(hw);
        },
      ),
    );
  });

  it('keeps quads small on a sub-pixel random walk (near-reversals at every vertex)', () => {
    // Spike B's shape in screen px: 0.15 px x-steps, ±1 px noisy y-steps.
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const pts: P[] = [];
    let y = 0;
    for (let i = 0; i < 5000; i++) pts.push([i * 0.15, (y += random() * 2 - 1)]);
    const hw = 0.75;
    const aa = 1;
    let maxArea = 0;
    for (let i = 1; i + 2 < pts.length; i++) {
      const [a, b] = [pts[i]!, pts[i + 1]!];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dir: P = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      const norm = (p: P, q: P): P => {
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
        return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
      };
      const endA = computeEnd(norm(pts[i - 1]!, a), dir, true, hw, 'miter', 'butt', 4);
      const endB = computeEnd(dir, norm(b, pts[i + 2]!), true, hw, 'miter', 'butt', 4);
      // Same quad the vertex shader emits: along [-reachA, len + reachB] × ±(hw + fringe).
      const along = len + quadReach(endA, hw, aa, 'miter') + quadReach(endB, hw, aa, 'miter');
      const area = along * 2 * (hw + QUAD_FRINGE * aa);
      maxArea = Math.max(maxArea, area);
    }
    // A handful of px² per segment; the pathological case covered the whole 1024×640 canvas.
    expect(maxArea).toBeLessThan(40);
  });
});

describe('segment quads hold every pixel the segment draws (plan E16.9)', () => {
  const coord = fc.double({ min: -30, max: 30, noNaN: true });
  const point = fc.tuple(coord, coord);
  const joins: LineJoin[] = ['miter', 'round', 'bevel'];
  const caps: LineCap[] = ['butt', 'round', 'square'];

  type Frame = ReturnType<typeof computeSegmentFrame>;

  it('keeps half a pixel around the drawn pixels, as float literals in the shader', () => {
    // Less than half a pixel leaves pin holes at joins on a multisampled canvas.
    expect(QUAD_FRINGE - QUAD_SLACK).toBe(0.5);
    expect(QUAD_SLACK).toBeGreaterThanOrEqual(0.5);
    // `const float X = 1;` does not compile in GLSL ES.
    expect(LINE_VERTEX_SHADER).toContain('const float QUAD_FRINGE = 1.0000;');
    expect(LINE_VERTEX_SHADER).toContain('const float QUAD_SLACK = 0.5000;');
  });

  /**
   * Whether `p` is inside the quad the vertex shader emits for `f`, at least `inset` from every
   * edge that moved (an edge where the former quad already ended needs no room: it covers what
   * it covered).
   */
  function inQuad(f: Frame, p: P, aa: number, join: LineJoin, inset = 0): boolean {
    const rel: P = [p[0] - f.a[0], p[1] - f.a[1]];
    const t = rel[0] * f.dir[0] + rel[1] * f.dir[1];
    const perp = -rel[0] * f.dir[1] + rel[1] * f.dir[0];
    const reachA = quadReach(f.startEnd, f.halfWidth, aa, join);
    const reachB = quadReach(f.endEnd, f.halfWidth, aa, join);
    const roomA = reachA < f.startEnd.extent + aa ? inset : 0;
    const roomB = reachB < f.endEnd.extent + aa ? inset : 0;
    return (
      t >= -reachA + roomA &&
      t <= f.len + reachB - roomB &&
      Math.abs(perp) <= f.halfWidth + QUAD_FRINGE * aa
    );
  }

  /**
   * The quad before plan E16.9: the join or cap shape and a full ramp at each end and side. It
   * is what bounded the drawing at an exact reversal, whose ownership split leaves the segment
   * everything beyond the vertex.
   */
  function inFormerQuad(f: Frame, p: P, aa: number): boolean {
    const rel: P = [p[0] - f.a[0], p[1] - f.a[1]];
    const t = rel[0] * f.dir[0] + rel[1] * f.dir[1];
    const perp = -rel[0] * f.dir[1] + rel[1] * f.dir[0];
    return (
      t >= -(f.startEnd.extent + aa) &&
      t <= f.len + f.endEnd.extent + aa &&
      Math.abs(perp) <= f.halfWidth + aa
    );
  }

  it('draws the pixels the former, larger quad drew: any join, cap, turn and width', () => {
    fc.assert(
      fc.property(
        fc.option(point, { nil: undefined }),
        point,
        point,
        fc.option(point, { nil: undefined }),
        fc.double({ min: 0.2, max: 24, noNaN: true }),
        fc.constantFrom(...joins),
        fc.constantFrom(...caps),
        fc.double({ min: 1, max: 12, noNaN: true }),
        fc.constantFrom(1, 0.5),
        fc.array(fc.tuple(fc.double({ min: -0.5, max: 1.5, noNaN: true }), coord), {
          minLength: 40,
          maxLength: 40,
        }),
        (prev, a, b, next, width, join, cap, limit, aa, samples) => {
          fc.pre(Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-3);
          fc.pre(!prev || Math.hypot(a[0] - prev[0], a[1] - prev[1]) > 1e-3);
          fc.pre(!next || Math.hypot(next[0] - b[0], next[1] - b[1]) > 1e-3);
          const f = computeSegmentFrame(prev, a, b, next, width, join, cap, limit);
          for (const [u, v] of samples) {
            // Points along and around the segment, well past both ends and both sides.
            const p: P = [
              a[0] + u * (b[0] - a[0]) + v * f.dir[1],
              a[1] + u * (b[1] - a[1]) - v * f.dir[0],
            ];
            const d = segmentDistance(f, p);
            // Coverage is clamp(0.5 - d / aa, 0, 1): drawn only when d < aa / 2.
            const drawn = d !== undefined && d < 0.5 * aa && inFormerQuad(f, p, aa);
            // Inside by half a pixel (the samples of a multisampled pixel lie within 0.47 px of
            // its center), less the ownership split's offset from the vertex (OWN_EPS).
            if (drawn) expect(inQuad(f, p, aa, join, 0.49 * aa)).toBe(true);
            if (inQuad(f, p, aa, join)) expect(inFormerQuad(f, p, aa)).toBe(true);
          }
        },
      ),
      { numRuns: 2000 },
    );
  }, 60_000);

  it('is never larger than the quad it replaced, and almost nothing at a gentle join', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        fc.boolean(),
        fc.double({ min: 0.05, max: 50, noNaN: true }),
        fc.constantFrom(...joins),
        fc.constantFrom(...caps),
        fc.constantFrom(1, 0.5),
        (inAngle, outAngle, isJoin, hw, join, cap, aa) => {
          const dIn: P = [Math.cos(inAngle), Math.sin(inAngle)];
          const dOut: P = [Math.cos(outAngle), Math.sin(outAngle)];
          const end = computeEnd(dIn, dOut, isJoin, hw, join, cap, 4);
          const reach = quadReach(end, hw, aa, join);
          expect(reach).toBeGreaterThan(0);
          expect(reach).toBeLessThanOrEqual(end.extent + aa);
        },
      ),
    );
    // A straight continuation: the neighbour owns everything before the vertex, and the quad
    // keeps half a pixel of room for the samples of the pixels on the split.
    const straight = computeEnd([1, 0], [1, 0], true, 0.75, 'miter', 'butt', 4);
    expect(quadReach(straight, 0.75, 1)).toBeCloseTo(0.5, 6);
    expect(quadReach(straight, 0.75, 0.5)).toBeCloseTo(0.25, 6);
    // A reversal keeps the old quad: the join shape and a full ramp.
    const back = computeEnd([1, 0], [-1, 0], true, 0.75, 'miter', 'butt', 4);
    expect(quadReach(back, 0.75, 1)).toBe(0.75 + 1);
    // Caps: the fringe for butt, the cap and its fringe for round and square.
    const cap = (c: LineCap, join: LineJoin = 'miter') =>
      quadReach(computeEnd([1, 0], [1, 0], false, 3, join, c, 4), 3, 1, join);
    expect([cap('butt'), cap('round'), cap('square')]).toEqual([1, 4, 4]);
    // With round joins, the join's disc at the other end of a short segment covers the cap.
    expect([cap('butt', 'bevel'), cap('butt', 'round')]).toEqual([1, 4]);
  });
});

describe('join ownership at pixel-aligned symmetric joins (spike B notch regression)', () => {
  it('assigns every pixel of the partition column to exactly one segment despite rounding', () => {
    // Symmetric peak with its vertex exactly on a pixel center: the partition is the vertical line
    // x = 10.5, which passes through the center of every pixel in that column.
    const [s1, s2] = frames(
      [
        [0.5, 0.5],
        [10.5, 20.5],
        [20.5, 0.5],
      ],
      6,
      'miter',
      'butt',
    );
    // Emulate the two instances rounding their shared tangent differently (opposite ±1e-7 tilts).
    const tilt = (f: NonNullable<typeof s1>, which: 'startEnd' | 'endEnd', dy: number) => ({
      ...f,
      [which]: { ...f[which], tangent: [f[which].tangent[0], f[which].tangent[1] + dy] },
    });
    for (const dy of [1e-7, -1e-7]) {
      const a = tilt(s1!, 'endEnd', dy);
      const b = tilt(s2!, 'startEnd', -dy);
      for (let y = 0.5; y < 22; y += 1) {
        const owners = [segmentDistance(a, [10.5, y]), segmentDistance(b, [10.5, y])].filter(
          (d) => d !== undefined,
        );
        expect(owners).toHaveLength(1);
      }
    }
  });
});
