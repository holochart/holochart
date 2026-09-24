import { describe, expect, it } from 'vitest';
import {
  ellipsePoints,
  flattenPath,
  parsePath,
  type FlatRing,
  type FlattenOptions,
  type PathSegment,
  type PathValue,
} from './path.ts';

/** Builds an expected segment from interleaved x, y values. */
function seg(type: PathSegment['type'], ...xy: PathValue[]): PathSegment {
  return {
    type,
    x: xy.filter((_, k) => k % 2 === 0),
    y: xy.filter((_, k) => k % 2 === 1),
  };
}

const segs = (d: string): PathSegment[] => {
  const r = parsePath(d);
  expect(r.error).toBeUndefined();
  return r.segments;
};

const num = (v: PathValue): number => (typeof v === 'number' ? v : NaN);
const opts = (scale = 1, tolerance?: number): FlattenOptions => ({
  mapX: num,
  mapY: num,
  scaleX: scale,
  scaleY: scale,
  ...(tolerance === undefined ? {} : { tolerance }),
});
const flat = (d: string, scale = 100, tolerance?: number): FlatRing[] =>
  flattenPath(segs(d), opts(scale, tolerance));

/** All points of all rings as [x, y] pairs. */
const points = (rings: FlatRing[]): [number, number][] =>
  rings.flatMap((r) => r.x.map((x, k): [number, number] => [x, r.y[k] ?? NaN]));

function cubicAt(p: readonly number[], t: number): number {
  const [a = 0, b = 0, c = 0, d = 0] = p;
  const s = 1 - t;
  return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
}

function distToSegment(
  px: number,
  py: number,
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

describe('parsePath: commands', () => {
  it('returns nothing for an empty or blank string', () => {
    expect(parsePath('')).toEqual({ segments: [] });
    expect(parsePath('  \n, ')).toEqual({ segments: [] });
  });

  it('parses M and L, absolute and relative', () => {
    expect(segs('M1 2 L3 4')).toEqual([seg('M', 1, 2), seg('L', 3, 4)]);
    expect(segs('m1 2 l3 4')).toEqual([seg('M', 1, 2), seg('L', 4, 6)]);
    expect(segs('M1 2 m1 1')).toEqual([seg('M', 1, 2), seg('M', 2, 3)]);
  });

  it('repeats parameter groups implicitly; extra pairs after M/m are L/l', () => {
    expect(segs('M0 0 1 1 2 2')).toEqual([seg('M', 0, 0), seg('L', 1, 1), seg('L', 2, 2)]);
    expect(segs('m1 1 2 2 1 0')).toEqual([seg('M', 1, 1), seg('L', 3, 3), seg('L', 4, 3)]);
    expect(segs('M0 0 L1 2 3 4')).toEqual([seg('M', 0, 0), seg('L', 1, 2), seg('L', 3, 4)]);
    expect(segs('M0 0 h1 2')).toEqual([seg('M', 0, 0), seg('L', 1, 0), seg('L', 3, 0)]);
  });

  it('turns H and V into L, copying the other coordinate', () => {
    expect(segs('M1 2 H5 V7 h-1 v-2')).toEqual([
      seg('M', 1, 2),
      seg('L', 5, 2),
      seg('L', 5, 7),
      seg('L', 4, 7),
      seg('L', 4, 5),
    ]);
  });

  it('parses C and c', () => {
    expect(segs('M1 1 C2 2 3 3 4 1')).toEqual([seg('M', 1, 1), seg('C', 2, 2, 3, 3, 4, 1)]);
    expect(segs('M1 1 c1 1 2 2 3 0')).toEqual([seg('M', 1, 1), seg('C', 2, 2, 3, 3, 4, 1)]);
  });

  it('reflects the previous cubic control for S/s', () => {
    expect(segs('M0 0 C1 1 2 1 3 0 S5 -1 6 0')).toEqual([
      seg('M', 0, 0),
      seg('C', 1, 1, 2, 1, 3, 0),
      seg('C', 4, -1, 5, -1, 6, 0),
    ]);
    expect(segs('M0 0 c1 1 2 1 3 0 s2 -1 3 0 s1 1 2 0')).toEqual([
      seg('M', 0, 0),
      seg('C', 1, 1, 2, 1, 3, 0),
      seg('C', 4, -1, 5, -1, 6, 0),
      seg('C', 7, 1, 7, 1, 8, 0),
    ]);
  });

  it('uses the current point as S control when the previous segment was not C/S', () => {
    expect(segs('M0 0 L1 1 S2 2 3 1')).toEqual([
      seg('M', 0, 0),
      seg('L', 1, 1),
      seg('C', 1, 1, 2, 2, 3, 1),
    ]);
    expect(segs('M0 0 Q1 1 2 0 S3 1 4 0')[2]).toEqual(seg('C', 2, 0, 3, 1, 4, 0));
  });

  it('parses Q/q and reflects for T/t', () => {
    expect(segs('M0 0 Q1 2 2 0 T4 0')).toEqual([
      seg('M', 0, 0),
      seg('Q', 1, 2, 2, 0),
      seg('Q', 3, -2, 4, 0),
    ]);
    expect(segs('M0 0 q1 2 2 0 t2 0 t2 0')).toEqual([
      seg('M', 0, 0),
      seg('Q', 1, 2, 2, 0),
      seg('Q', 3, -2, 4, 0),
      seg('Q', 5, 2, 6, 0),
    ]);
    // T after a non-quadratic uses the current point, then chains from there.
    expect(segs('M0 0 L1 0 T2 0 T3 0')).toEqual([
      seg('M', 0, 0),
      seg('L', 1, 0),
      seg('Q', 1, 0, 2, 0),
      seg('Q', 3, 0, 3, 0),
    ]);
    expect(segs('M0 0 C1 1 1 1 2 0 T3 0')[2]).toEqual(seg('Q', 2, 0, 3, 0));
  });

  it('handles Z and z, returning to the subpath start', () => {
    expect(segs('M1 1 L2 1 L2 2 Z M5 5 L6 6 z')).toEqual([
      seg('M', 1, 1),
      seg('L', 2, 1),
      seg('L', 2, 2),
      seg('Z'),
      seg('M', 5, 5),
      seg('L', 6, 6),
      seg('Z'),
    ]);
    expect(segs('M1 1 L2 2 z m1 0')).toEqual([
      seg('M', 1, 1),
      seg('L', 2, 2),
      seg('Z'),
      seg('M', 2, 1),
    ]);
  });

  it('emits an implicit M at the subpath start for a drawing command after Z', () => {
    expect(segs('M1 1 L3 1 L3 3 Z L0 5')).toEqual([
      seg('M', 1, 1),
      seg('L', 3, 1),
      seg('L', 3, 3),
      seg('Z'),
      seg('M', 1, 1),
      seg('L', 0, 5),
    ]);
    expect(segs('M1 1 L3 3 z l1 0')).toEqual([
      seg('M', 1, 1),
      seg('L', 3, 3),
      seg('Z'),
      seg('M', 1, 1),
      seg('L', 2, 1),
    ]);
  });
});

describe('parsePath: number grammar', () => {
  it('reads signs, leading dots and exponents', () => {
    expect(segs('M-.5-.25L1e-3,2E1 L+3 4.e1')).toEqual([
      seg('M', -0.5, -0.25),
      seg('L', 0.001, 20),
      seg('L', 3, 40),
    ]);
  });

  it('splits compact numbers the SVG way', () => {
    expect(segs('M1.5.5')).toEqual([seg('M', 1.5, 0.5)]);
    expect(segs('M10-5')).toEqual([seg('M', 10, -5)]);
    expect(segs('M0.5.5.5.5')).toEqual([seg('M', 0.5, 0.5), seg('L', 0.5, 0.5)]);
    expect(segs('M1,2,3,4')).toEqual([seg('M', 1, 2), seg('L', 3, 4)]);
    expect(segs('  M 1 ,\t2\nL3 4  ')).toEqual([seg('M', 1, 2), seg('L', 3, 4)]);
  });

  it('reads arc flags without separators', () => {
    const spaced = segs('M0 0 a1 1 0 0 0 1 1');
    expect(segs('M0 0a1 1 0 00 1 1')).toEqual(spaced);
    expect(segs('M0 0a1,1,0,0,0,1,1')).toEqual(spaced);
    expect(segs('M0 0 a1 1 0 111 1')).toEqual(segs('M0 0 a1 1 0 1 1 1 1'));
  });
});

describe('parsePath: date tokens', () => {
  it('keeps dates as strings with _ replaced by a space', () => {
    expect(segs('M2015-02-21_13:45:56.789,1 L2015-03,2 H2016-01-01 V3')).toEqual([
      seg('M', '2015-02-21 13:45:56.789', 1),
      seg('L', '2015-03', 2),
      seg('L', '2016-01-01', 2),
      seg('L', '2016-01-01', 3),
    ]);
    expect(segs('M2015-02-21_13:45 0 L2015-2-3_4 1')).toEqual([
      seg('M', '2015-02-21 13:45', 0),
      seg('L', '2015-2-3 4', 1),
    ]);
  });

  it('allows dates in absolute curves', () => {
    expect(
      segs('M2015-01-01 0 C2015-02-01 1 2015-03-01 1 2015-04-01 0 Q2015-05-01 1 2015-06-01 0'),
    ).toEqual([
      seg('M', '2015-01-01', 0),
      seg('C', '2015-02-01', 1, '2015-03-01', 1, '2015-04-01', 0),
      seg('Q', '2015-05-01', 1, '2015-06-01', 0),
    ]);
  });

  it('uses the current point as the S/T control when the previous control is a date', () => {
    expect(segs('M0 0 C2015-01-01 1 2015-01-02 1 2 2 S3 3 4 4')[2]).toEqual(
      seg('C', 2, 2, 3, 3, 4, 4),
    );
    expect(segs('M0 0 Q2015-01-01 1 2 2 T4 4')[2]).toEqual(seg('Q', 2, 2, 4, 4));
    // With a date current point the control is that (string) point.
    expect(segs('M0 0 Q1 1 2015-01-01 2 T2015-01-02 4')[2]).toEqual(
      seg('Q', '2015-01-01', 2, '2015-01-02', 4),
    );
  });

  it('stops with an error when a relative command or arc meets a date', () => {
    for (const d of [
      'M2015-02-21 1 l1 1',
      'M0 0 l2015-02-21 1',
      'M2015-02-21 1 h1',
      'M0 0 A1 1 0 0 1 2015-01-01 1',
      'M2015-01-01 0 A1 1 0 0 1 2 1',
    ]) {
      const r = parsePath(d);
      expect(r.error, d).toBeDefined();
      expect(r.segments, d).toHaveLength(1);
    }
  });

  it('does not treat short or long digit runs as years', () => {
    expect(segs('M201-5 12345-6')).toEqual([seg('M', 201, -5), seg('L', 12345, -6)]);
    expect(segs('M2015-2.5')).toEqual([seg('M', 2015, -2.5)]);
  });
});

describe('parsePath: malformed input', () => {
  it('rejects a path that does not start with M', () => {
    for (const d of ['L0 0', 'z', '0 0', 'foo M0 0', 'l1 1 M0 0']) {
      const r = parsePath(d);
      expect(r.segments, d).toEqual([]);
      expect(r.error, d).toBeDefined();
    }
  });

  it('stops at an unknown command, keeping what parsed', () => {
    const r = parsePath('M0 0 L1 1 X2 2 L3 3');
    expect(r.segments).toEqual([seg('M', 0, 0), seg('L', 1, 1)]);
    expect(r.error).toMatch(/unknown command 'X'/);
    expect(parsePath('M0 0 e1').error).toBeDefined();
  });

  it('stops at missing parameters and dangling numbers', () => {
    expect(parsePath('M0 0 L1')).toMatchObject({ segments: [seg('M', 0, 0)] });
    expect(parsePath('M0 0 L1').error).toMatch(/missing parameter/);
    expect(parsePath('M0 0 C1 1 2 2 L3 3').segments).toHaveLength(1);
    expect(parsePath('M')).toEqual({ segments: [], error: expect.any(String) as string });
    const trailing = parsePath('M0 0 L1 1 2');
    expect(trailing.segments).toEqual([seg('M', 0, 0), seg('L', 1, 1)]);
    expect(trailing.error).toBeDefined();
    const afterZ = parsePath('M0 0 L1 1 Z 2 2');
    expect(afterZ.segments).toHaveLength(3);
    expect(afterZ.error).toMatch(/unexpected/);
    expect(parsePath('M0 0 A1 1 0 2 1 3 3').error).toMatch(/flag/);
    expect(parsePath('M0 0 L1 #').error).toBeDefined();
  });
});

describe('parsePath: arcs', () => {
  it('converts a half circle into two cubics ending at the endpoint', () => {
    const s = segs('M-1 0 A1 1 0 0 1 1 0');
    expect(s.map((x) => x.type)).toEqual(['M', 'C', 'C']);
    expect(s[2]?.x[2]).toBe(1);
    expect(s[2]?.y[2]).toBe(0);
    // The midpoint joint lies on the circle.
    expect(Math.hypot(num(s[1]?.x[2] ?? NaN), num(s[1]?.y[2] ?? NaN))).toBeCloseTo(1, 12);
  });

  it('keeps the flattened arc on the circle, sweep choosing the side', () => {
    const lower = points(flat('M-1 0 A1 1 0 0 1 1 0'));
    const upper = points(flat('M-1 0 A1 1 0 0 0 1 0'));
    for (const [x, y] of [...lower, ...upper]) expect(Math.hypot(x, y)).toBeCloseTo(1, 3);
    // sweep = 1 runs in the positive-angle direction: from angle π through 3π/2.
    expect(Math.min(...lower.map(([, y]) => y))).toBeCloseTo(-1, 3);
    expect(Math.max(...lower.map(([, y]) => y))).toBeCloseTo(0, 9);
    expect(Math.max(...upper.map(([, y]) => y))).toBeCloseTo(1, 3);
  });

  it('picks the right arc of four from the large-arc and sweep flags', () => {
    // From (1, 0) to (0, 1) with r = 1: centers (0, 0) and (1, 1).
    const cases: [string, [number, number], number, [number, number]][] = [
      ['0 1', [0, 0], 1, [Math.SQRT1_2, Math.SQRT1_2]],
      ['1 0', [0, 0], 3, [-1, 0]],
      ['1 1', [1, 1], 3, [2, 1]],
      ['0 0', [1, 1], 1, [1 - Math.SQRT1_2, 1 - Math.SQRT1_2]],
    ];
    for (const [flags, [ccx, ccy], cubics, [mx, my]] of cases) {
      const s = segs(`M1 0 A1 1 0 ${flags} 0 1`);
      expect(
        s.filter((x) => x.type === 'C'),
        flags,
      ).toHaveLength(cubics);
      const pts = points(flattenPath(s, opts(100)));
      for (const [x, y] of pts) expect(Math.hypot(x - ccx, y - ccy), flags).toBeCloseTo(1, 3);
      const nearest = Math.min(...pts.map(([x, y]) => Math.hypot(x - mx, y - my)));
      expect(nearest, flags).toBeLessThan(0.05);
    }
  });

  it('scales up radii that are too small to reach the endpoint', () => {
    const pts = points(flat('M0 0 A0.5 0.5 0 0 1 4 0'));
    for (const [x, y] of pts) expect(Math.hypot(x - 2, y)).toBeCloseTo(2, 2);
    expect(Math.min(...pts.map(([, y]) => y))).toBeCloseTo(-2, 3);
  });

  it('handles rotation, relative arcs and degenerate cases', () => {
    // A 2×1 ellipse rotated 90°: the major axis is vertical, centered at (0, 2).
    const rotated = points(flat('M0 0 A2 1 90 0 1 0 4'));
    for (const [x, y] of rotated) expect(x * x + ((y - 2) / 2) ** 2).toBeCloseTo(1, 2);
    expect(Math.max(...rotated.map(([x]) => Math.abs(x)))).toBeCloseTo(1, 3);
    const rel = segs('m1 1 a1 1 0 0 0 2 0');
    expect(rel.at(-1)).toMatchObject({ x: [expect.any(Number), expect.any(Number), 3] });
    expect(rel.at(-1)?.y[2]).toBe(1);
    expect(segs('M0 0 A0 1 0 0 1 3 4')).toEqual([seg('M', 0, 0), seg('L', 3, 4)]);
    expect(segs('M0 0 a1 0 0 0 1 3 4')).toEqual([seg('M', 0, 0), seg('L', 3, 4)]);
    expect(segs('M1 1 A1 1 0 0 1 1 1 L2 2')).toEqual([seg('M', 1, 1), seg('L', 2, 2)]);
  });

  it('does not reflect across an arc for S', () => {
    const s = segs('M0 0 A1 1 0 0 1 2 0 S3 1 4 0');
    expect(s.at(-1)).toEqual(seg('C', 2, 0, 3, 1, 4, 0));
  });
});

describe('flattenPath', () => {
  it('makes one ring per subpath with closed flags', () => {
    const rings = flat('M0 0 L1 0 L1 1 Z M5 5 L6 6 L7 5');
    expect(rings).toEqual([
      { x: [0, 1, 1], y: [0, 0, 1], closed: true },
      { x: [5, 6, 7], y: [5, 6, 5], closed: false },
    ]);
  });

  it('drops a written-out copy of the first point on closed rings', () => {
    expect(flat('M0 0 L1 0 L1 1 L0 0 Z')).toEqual([{ x: [0, 1, 1], y: [0, 0, 1], closed: true }]);
    expect(flat('M0 0 L1 0 L0 0')[0]?.x).toEqual([0, 1, 0]);
  });

  it('drops rings with fewer than two points and starts a ring after Z', () => {
    expect(flat('M0 0 M1 1 L2 2')).toEqual([{ x: [1, 2], y: [1, 2], closed: false }]);
    expect(flat('M0 0 L1 0 L1 1 Z L0 5')).toEqual([
      { x: [0, 1, 1], y: [0, 0, 1], closed: true },
      { x: [0, 0], y: [0, 5], closed: false },
    ]);
  });

  it('continues from the current point for hand-built segments without M', () => {
    const rings = flattenPath([seg('M', 0, 0), seg('L', 1, 0), seg('Z'), seg('L', 2, 2)], opts());
    expect(rings).toEqual([
      { x: [0, 1], y: [0, 0], closed: true },
      { x: [0, 2], y: [0, 2], closed: false },
    ]);
  });

  it('keeps a flattened quarter-circle cubic within tolerance in px', () => {
    const s = segs('M1 0 A1 1 0 0 1 0 1');
    const c = s[1];
    expect(c?.type).toBe('C');
    const cx = [1, ...(c?.x.map(num) ?? [])];
    const cy = [0, ...(c?.y.map(num) ?? [])];
    for (const [scale, tol] of [
      [100, 0.25],
      [1000, 0.25],
      [300, 1],
      [50, 0.05],
    ] as const) {
      const [ring] = flattenPath(s, opts(scale, tol));
      const pts = points(ring ? [ring] : []);
      let worst = 0;
      for (let k = 0; k <= 1000; k++) {
        const px = cubicAt(cx, k / 1000);
        const py = cubicAt(cy, k / 1000);
        let d = Infinity;
        for (let j = 1; j < pts.length; j++) {
          d = Math.min(d, distToSegment(px, py, pts[j - 1] ?? [0, 0], pts[j] ?? [0, 0]));
        }
        worst = Math.max(worst, d);
      }
      expect(worst * scale, `scale ${scale}`).toBeLessThanOrEqual(tol);
      expect(pts[0]).toEqual([1, 0]);
      expect(pts.at(-1)).toEqual([0, 1]);
    }
  });

  it('uses more segments at larger scale and caps them at 256 per curve', () => {
    const count = (scale: number): number => flat('M1 0 A1 1 0 0 1 0 1', scale)[0]?.x.length ?? 0;
    expect(count(0.01)).toBe(2);
    expect(count(100)).toBeGreaterThan(count(10));
    expect(count(1000)).toBeGreaterThan(count(100));
    expect(count(1e9)).toBe(257);
    // Anisotropic scales: only the px extent matters.
    const wide = flattenPath(segs('M1 0 A1 1 0 0 1 0 1'), { ...opts(1), scaleX: 1000 });
    expect(wide[0]?.x.length).toBeGreaterThan(count(1));
    expect(wide[0]?.x.length).toBeLessThan(count(1000));
    // A straight "curve" needs no subdivision.
    expect(flat('M0 0 C1 1 2 2 3 3')[0]?.x).toEqual([0, 3]);
  });

  it('flattens quadratics onto the curve', () => {
    const [ring] = flat('M0 0 Q1 2 2 0', 100);
    expect(ring?.x.length).toBeGreaterThan(3);
    for (const [x, y] of points(ring ? [ring] : [])) {
      // Q(t) = (2t, 4t(1 - t)) → y = x(2 - x).
      expect(y).toBeCloseTo(x * (2 - x), 12);
    }
  });

  it('skips points whose mapping is non-finite', () => {
    expect(flat('M0 0 L2015-01-01 1 L2 2')).toEqual([{ x: [0, 2], y: [0, 2], closed: false }]);
    // A curve with an unmappable control point degrades to a line to its end.
    expect(flat('M0 0 Q2015-01-01 5 2 0')).toEqual([{ x: [0, 2], y: [0, 0], closed: false }]);
    // An unmappable start leaves the rest of the ring.
    expect(flat('M2015-01-01 0 L1 1 L2 2')).toEqual([{ x: [1, 2], y: [1, 2], closed: false }]);
    const logY = flattenPath(segs('M1 1 L2 0 L3 10'), {
      ...opts(),
      mapY: (v) => Math.log10(num(v)),
    });
    expect(logY).toEqual([{ x: [1, 3], y: [0, 1], closed: false }]);
  });

  it('maps date strings through the caller mapping', () => {
    const rings = flattenPath(segs('M2020-01-01 0 L2020-01-02 1'), {
      ...opts(),
      mapX: (v) => (typeof v === 'string' ? Date.parse(v) / 864e5 : v),
    });
    expect(rings[0]?.x).toEqual([18262, 18263]);
  });
});

describe('ellipsePoints', () => {
  it('grows the point count with the px radius within [8, 512]', () => {
    const n = (r: number, scale = 1, tol?: number): number =>
      ellipsePoints(0, 0, r, r, scale, scale, tol).x.length;
    expect(n(0)).toBe(8);
    expect(n(0.5)).toBe(8);
    expect(n(1e9)).toBe(512);
    expect(n(50)).toBeGreaterThan(n(10));
    expect(n(200)).toBeGreaterThan(n(50));
    expect(n(1, 200)).toBe(n(200));
    expect(n(50, 1, 1)).toBeLessThan(n(50));
    for (const r of [1, 10, 100, 1000, 1e6]) {
      expect(n(r)).toBeGreaterThanOrEqual(8);
      expect(n(r)).toBeLessThanOrEqual(512);
    }
    // Uses the larger px radius of the two axes.
    expect(ellipsePoints(0, 0, 1, 100, 1, 1).x.length).toBe(n(100));
  });

  it('keeps chords within tolerance of the curve', () => {
    for (const r of [5, 40, 300]) {
      const count = ellipsePoints(0, 0, r, r, 1, 1, 0.25).x.length;
      expect(r * (1 - Math.cos(Math.PI / count))).toBeLessThanOrEqual(0.25);
    }
  });

  it('puts points on the ellipse, counter-clockwise, without repeating the first', () => {
    const { x, y } = ellipsePoints(3, -2, 4, 1, 20, 20);
    expect(x[0]).toBe(7);
    expect(y[0]).toBe(-2);
    expect(y[1]).toBeGreaterThan(-2);
    for (let k = 0; k < x.length; k++) {
      expect((((x[k] ?? 0) - 3) / 4) ** 2 + ((y[k] ?? 0) + 2) ** 2).toBeCloseTo(1, 12);
    }
    const lastAngle = Math.atan2((y.at(-1) ?? 0) + 2, ((x.at(-1) ?? 0) - 3) / 4);
    expect(lastAngle).toBeLessThan(0);
    expect(lastAngle).toBeCloseTo(-(2 * Math.PI) / x.length, 12);
  });
});
