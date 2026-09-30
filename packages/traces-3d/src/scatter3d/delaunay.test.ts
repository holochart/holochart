import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { delaunayTriangles } from './delaunay.ts';

type Pt = [number, number];

function triangles(tri: Uint32Array): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let t = 0; t < tri.length; t += 3) out.push([tri[t]!, tri[t + 1]!, tri[t + 2]!]);
  return out;
}

/** Twice the signed area of (a, b, c), positive when counter-clockwise. */
function cross(a: Pt, b: Pt, c: Pt): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/**
 * A test coordinate as an exact integer (× 2^80): every coordinate the property tests use is a
 * multiple of 2^-80 (doubles ≥ 1e-6 in magnitude, integers, multiples of 2^-40).
 */
function exact(x: number): bigint {
  return BigInt(x * 2 ** 80);
}

/** Exact `cross` (scaled by 2^160). */
function crossExact(a: Pt, b: Pt, c: Pt): bigint {
  const [ax, ay, bx, by, cx, cy] = [a[0], a[1], b[0], b[1], c[0], c[1]].map(exact) as bigint[];
  return (bx! - ax!) * (cy! - ay!) - (by! - ay!) * (cx! - ax!);
}

/** Convex hull (Andrew's monotone chain), counter-clockwise, with `turn` as the orientation. */
function convexHull(pts: Pt[], turn: (a: Pt, b: Pt, c: Pt) => number | bigint): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return [];
  const half = (list: Pt[]): Pt[] => {
    const h: Pt[] = [];
    for (const q of list) {
      while (h.length >= 2 && turn(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(p), ...half([...p].reverse())];
}

/** Convex hull area (float). */
function hullArea(pts: Pt[]): number {
  const hull = convexHull(pts, cross);
  let area = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

/** Twice the convex hull area, exact (scaled by 2^160). */
function hullArea2Exact(pts: Pt[]): bigint {
  const hull = convexHull(pts, crossExact);
  let area = 0n;
  for (let i = 1; i + 1 < hull.length; i++) area += crossExact(hull[0]!, hull[i]!, hull[i + 1]!);
  return area;
}

/**
 * How far p is inside the circumcircle of the CCW triangle (a, b, c), relative to its scale:
 * > 0 inside, < 0 outside.
 */
function inCircumcircle(a: Pt, b: Pt, c: Pt, p: Pt): number {
  const ax = a[0] - p[0];
  const ay = a[1] - p[1];
  const bx = b[0] - p[0];
  const by = b[1] - p[1];
  const cx = c[0] - p[0];
  const cy = c[1] - p[1];
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const det = ax * (by * c2 - b2 * cy) - ay * (bx * c2 - b2 * cx) + a2 * (bx * cy - by * cx);
  const scale = Math.max(a2, b2, c2) ** 2;
  return scale === 0 ? 0 : det / scale;
}

/** Checks the triangulation of `pts` (finite, possibly duplicated) against its invariants. */
function checkTriangulation(pts: Pt[], tri: Uint32Array): void {
  expect(tri.length % 3).toBe(0);
  const first = new Map<string, number>();
  pts.forEach((p, i) => {
    const key = `${p[0]},${p[1]}`;
    if (!first.has(key)) first.set(key, i);
  });
  const distinct = [...first.values()].map((i) => pts[i]!);
  // Orientation and areas exactly: slivers one ulp wide are valid triangles.
  const hull = hullArea2Exact(distinct);
  if (hull === 0n) {
    expect(tri.length).toBe(0);
    return;
  }

  const used = new Set<number>();
  let area = 0n;
  for (const [i, j, k] of triangles(tri)) {
    for (const idx of [i, j, k]) {
      // Each vertex is the first copy of its point.
      expect(first.get(`${pts[idx]![0]},${pts[idx]![1]}`)).toBe(idx);
      used.add(idx);
    }
    const a = crossExact(pts[i]!, pts[j]!, pts[k]!);
    expect(a > 0n).toBe(true);
    area += a;
    for (const p of distinct) {
      expect(inCircumcircle(pts[i]!, pts[j]!, pts[k]!, p)).toBeLessThan(1e-9);
    }
  }
  // Every distinct point is a vertex, and the triangles tile the hull.
  expect(used.size).toBe(distinct.length);
  expect(area).toBe(hull);
}

describe('delaunayTriangles', () => {
  it('a triangle: one CCW triangle whatever the input order', () => {
    expect([...delaunayTriangles([0, 1, 0], [0, 0, 1])].sort()).toEqual([0, 1, 2]);
    const tri = delaunayTriangles([0, 0, 1], [0, 1, 0]);
    expect(tri.length).toBe(3);
    const pts: Pt[] = [
      [0, 0],
      [0, 1],
      [1, 0],
    ];
    expect(cross(pts[tri[0]!]!, pts[tri[1]!]!, pts[tri[2]!]!)).toBeGreaterThan(0);
  });

  it('a square: two triangles covering it', () => {
    const u = [0, 1, 1, 0];
    const v = [0, 0, 1, 1];
    const tri = delaunayTriangles(u, v);
    expect(tri.length).toBe(6);
    checkTriangulation(
      u.map((x, i) => [x, v[i]!]),
      tri,
    );
  });

  it('fewer than 3 points, collinear points or one repeated point: no triangles', () => {
    expect(delaunayTriangles([], [])).toEqual(new Uint32Array(0));
    expect(delaunayTriangles([0, 1], [0, 1])).toEqual(new Uint32Array(0));
    expect(delaunayTriangles([0, 1, 2, 3, 1.5], [0, 2, 4, 6, 3])).toEqual(new Uint32Array(0));
    expect(delaunayTriangles([5, 5, 5, 5], [0, 3, 1, 2])).toEqual(new Uint32Array(0));
    expect(delaunayTriangles([1, 1, 1], [2, 2, 2])).toEqual(new Uint32Array(0));
    expect(delaunayTriangles([0, 1, 0, 1], [0, 0, 0, 0])).toEqual(new Uint32Array(0));
  });

  it('duplicates are triangulated once, as their first index', () => {
    const u = [0, 1, 0, 1, 0, 0];
    const v = [0, 0, 0, 0, 1, 1];
    const tri = delaunayTriangles(u, v);
    expect([...tri].sort()).toEqual([0, 1, 4]);
  });

  it('non-finite points are skipped and indices map back to the input', () => {
    const u = [NaN, 0, Infinity, 2, 0, 5, 2];
    const v = [0, 0, 1, 0, NaN, -Infinity, 2];
    expect([...delaunayTriangles(u, v)].sort()).toEqual([1, 3, 6]);
    expect(delaunayTriangles([NaN, 0, 1, 0], [0, 0, 0, NaN])).toEqual(new Uint32Array(0));
  });

  it('count limits the points', () => {
    const u = [0, 1, 0, 1];
    const v = [0, 0, 1, 1];
    expect(delaunayTriangles(u, v, 3).length).toBe(3);
    expect(delaunayTriangles(u, v, 2).length).toBe(0);
    expect(delaunayTriangles(u, v.slice(0, 3)).length).toBe(3);
    expect(delaunayTriangles(u, v, 10).length).toBe(6);
  });

  it('a collinear subset with points off the line', () => {
    const u = [0, 1, 2, 3, 4, 2];
    const v = [0, 0, 0, 0, 0, 1];
    const tri = delaunayTriangles(u, v);
    expect(tri.length).toBe(12);
    checkTriangulation(
      u.map((x, i) => [x, v[i]!]),
      tri,
    );
  });

  it('a grid (co-circular points everywhere) triangulates with 2 triangles per cell', () => {
    const pts: Pt[] = [];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 9; j++) pts.push([i, j]);
    const tri = delaunayTriangles(
      pts.map((p) => p[0]),
      pts.map((p) => p[1]),
    );
    expect(tri.length / 3).toBe(2 * 11 * 8);
    checkTriangulation(pts, tri);
  });

  it('large offsets (dates in ms) triangulate like the offset-free points', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 50 })), {
          minLength: 3,
          maxLength: 40,
        }),
        (pts) => {
          const plain = delaunayTriangles(
            pts.map((p) => p[0]),
            pts.map((p) => p[1]),
          );
          checkTriangulation(pts, plain);
          const shiftedPts: Pt[] = pts.map(([x, y]) => [1.7e12 + x, y - 3e5]);
          const shifted = delaunayTriangles(
            shiftedPts.map((p) => p[0]),
            shiftedPts.map((p) => p[1]),
          );
          checkTriangulation(shiftedPts, shifted);
          // Co-circular ties may resolve differently, but the triangle count is 2n − h − 2.
          expect(shifted.length).toBe(plain.length);
        },
      ),
      { numRuns: 200 },
    );
    const u = [0, 1000, 0, 1000, 500].map((x) => 1.7e12 + x);
    const v = [0, 0, 1e-6, 1e-6, 5e-7];
    expect(delaunayTriangles(u, v).length / 3).toBe(4);
  });

  it('thin sets (spans ~1e12 apart): every point is triangulated', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 1000 })), {
          minLength: 3,
          maxLength: 40,
        }),
        (cells) => {
          // Binary scale: exact, so integer-collinear points stay collinear.
          const pts: Pt[] = cells.map(([i, j]) => [i, j * 2 ** -40]);
          checkTriangulation(
            pts,
            delaunayTriangles(
              pts.map((p) => p[0]),
              pts.map((p) => p[1]),
            ),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('random points: Delaunay, CCW, covering the hull (integer grid: duplicates, collinear)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -8, max: 8 }), fc.integer({ min: -8, max: 8 })), {
          maxLength: 60,
          size: 'medium',
        }),
        (pts) => {
          const tri = delaunayTriangles(
            pts.map((p) => p[0]),
            pts.map((p) => p[1]),
          );
          checkTriangulation(pts, tri);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('random points: Delaunay, CCW, covering the hull (doubles, with non-finite entries)', () => {
    const coord = fc.oneof(
      {
        weight: 20,
        // Far from underflow, where the test's own float areas would lose the triangles.
        arbitrary: fc
          .double({ min: -1e3, max: 1e3, noNaN: true })
          .map((x) => (Math.abs(x) < 1e-6 ? 0 : x)),
      },
      { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity) },
    );
    fc.assert(
      fc.property(fc.array(fc.tuple(coord, coord), { maxLength: 80, size: 'medium' }), (pts) => {
        const tri = delaunayTriangles(
          pts.map((p) => p[0]),
          pts.map((p) => p[1]),
        );
        const finite = new Map<number, Pt>();
        pts.forEach((p, i) => {
          if (Number.isFinite(p[0]) && Number.isFinite(p[1])) finite.set(i, p);
        });
        for (const idx of tri) expect(finite.has(idx)).toBe(true);
        // Check against the finite subset, re-indexed.
        const keys = [...finite.keys()];
        const rank = new Map(keys.map((k, r) => [k, r]));
        checkTriangulation(
          keys.map((k) => finite.get(k)!),
          Uint32Array.from(tri, (i) => rank.get(i)!),
        );
      }),
      { numRuns: 300 },
    );
  });

  it('performance: 50k random points, 2n − h − 2 triangles', () => {
    let seed = 12345;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const n = 50_000;
    const u = new Float64Array(n);
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      u[i] = rand();
      v[i] = rand();
    }
    const t0 = performance.now();
    const tri = delaunayTriangles(u, v);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1000);

    const pts: Pt[] = Array.from(u, (x, i) => [x, v[i]!]);
    let area = 0;
    const edges = new Map<number, number>();
    for (const [i, j, k] of triangles(tri)) {
      const a = cross(pts[i]!, pts[j]!, pts[k]!);
      expect(a > 0).toBe(true);
      area += a / 2;
      for (const [p, q] of [
        [i, j],
        [j, k],
        [k, i],
      ] as const) {
        const key = Math.min(p, q) * n + Math.max(p, q);
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    // Boundary edges (used once) are the hull's: h of them.
    let h = 0;
    for (const c of edges.values()) {
      expect(c).toBeLessThanOrEqual(2);
      if (c === 1) h++;
    }
    expect(tri.length / 3).toBe(2 * n - h - 2);
    expect(Math.abs(area - hullArea(pts))).toBeLessThan(1e-9);
  });
});
