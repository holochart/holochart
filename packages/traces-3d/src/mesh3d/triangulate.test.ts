import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { alphaShape, circumradius, convexHull, delaunay2D, delaunay3D } from './triangulate.ts';

type P3 = [number, number, number];

const columns = (pts: readonly (readonly number[])[]) =>
  [0, 1, 2].map((k) => Float64Array.from(pts.map((p) => p[k]!))) as [
    Float64Array,
    Float64Array,
    Float64Array,
  ];

const sub = (a: readonly number[], b: readonly number[]) => a.map((v, k) => v - b[k]!);
const cross = (a: readonly number[], b: readonly number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, k) => s + v * b[k]!, 0);

/** Every point lies on the inner side of every (outward) hull triangle. */
function expectContains(pts: readonly P3[], tris: Uint32Array, tol = 1e-9): void {
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [pts[tris[t]!]!, pts[tris[t + 1]!]!, pts[tris[t + 2]!]!];
    const n = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(...n);
    for (const p of pts) expect(dot(n, sub(p, a)) / len).toBeLessThanOrEqual(tol);
  }
}

/** Every edge of a closed surface is shared by exactly two triangles. */
function expectClosed(tris: Uint32Array): void {
  const edges = new Map<string, number>();
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e]!;
      const b = tris[t + ((e + 1) % 3)]!;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const n of edges.values()) expect(n).toBe(2);
}

function circumcircle(a: number[], b: number[], c: number[]): [number, number, number] {
  const d = 2 * (a[0]! * (b[1]! - c[1]!) + b[0]! * (c[1]! - a[1]!) + c[0]! * (a[1]! - b[1]!));
  const a2 = a[0]! ** 2 + a[1]! ** 2;
  const b2 = b[0]! ** 2 + b[1]! ** 2;
  const c2 = c[0]! ** 2 + c[1]! ** 2;
  const ux = (a2 * (b[1]! - c[1]!) + b2 * (c[1]! - a[1]!) + c2 * (a[1]! - b[1]!)) / d;
  const uy = (a2 * (c[0]! - b[0]!) + b2 * (a[0]! - c[0]!) + c2 * (b[0]! - a[0]!)) / d;
  return [ux, uy, Math.hypot(a[0]! - ux, a[1]! - uy)];
}

// Coordinates on a 0.2 grid: duplicates, collinear, coplanar and co-circular points are common
// (the degenerate cases), but no two distinct points closer than the hull's tolerance.
const coord = fc.integer({ min: -500, max: 500 }).map((v) => v / 5);
const point3 = fc.tuple(coord, coord, coord);

describe('convexHull', () => {
  it('closes a cube, leaving out points inside and on faces', () => {
    const pts: P3[] = [];
    for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) pts.push([x, y, z]);
    pts.push([0.5, 0.5, 0.5], [0.5, 0.5, 0], [0.2, 0.7, 1]);
    const tris = convexHull(...columns(pts));
    expect(tris.length / 3).toBe(12);
    expect([...tris].every((i) => i < 8)).toBe(true);
    expectContains(pts, tris);
    expectClosed(tris);
  });

  it('gives no triangles for coplanar or too few points (Plotly)', () => {
    expect(
      convexHull(
        ...columns([
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
          [1, 1, 0],
        ]),
      ),
    ).toHaveLength(0);
    expect(
      convexHull(
        ...columns([
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ]),
      ),
    ).toHaveLength(0);
  });

  it('ignores non-finite points and handles duplicates', () => {
    const pts: P3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 1],
      [NaN, 0, 0],
    ];
    const tris = convexHull(...columns(pts));
    expect(tris.length / 3).toBe(4);
    expect([...tris]).not.toContain(5);
  });

  it('contains every point and is closed (random clouds)', () => {
    fc.assert(
      fc.property(fc.array(point3, { minLength: 4, maxLength: 80 }), (pts) => {
        const tris = convexHull(...columns(pts));
        if (tris.length === 0) return; // degenerate (coplanar) sample
        // Tolerance relative to the cloud size (the hull works in normalized coordinates).
        expectContains(pts, tris, 1e-6);
        expectClosed(tris);
      }),
      { numRuns: 60 },
    );
  });

  it('keeps every point of a sphere (all extreme)', () => {
    const pts: P3[] = [];
    for (let i = 0; i < 200; i++) {
      const t = Math.acos(1 - (2 * (i + 0.5)) / 200);
      const p = Math.PI * (1 + Math.sqrt(5)) * i;
      pts.push([Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)]);
    }
    const tris = convexHull(...columns(pts));
    expect(new Set(tris).size).toBe(200);
    expect(tris.length / 3).toBe(2 * 200 - 4);
    expectClosed(tris);
  });
});

describe('delaunay2D', () => {
  it('triangulates a square with a center point into four triangles', () => {
    const u = [0, 1, 1, 0, 0.5];
    const v = [0, 0, 1, 1, 0.5];
    const tris = delaunay2D(u, v);
    expect(tris.length / 3).toBe(4);
  });

  it('triangulates a regular grid (co-circular points) into 2 triangles per cell', () => {
    const u: number[] = [];
    const v: number[] = [];
    for (let j = 0; j < 6; j++) {
      for (let i = 0; i < 7; i++) {
        u.push(i);
        v.push(j * 2);
      }
    }
    const tris = delaunay2D(u, v);
    expect(tris.length / 3).toBe(6 * 5 * 2);
  });

  it('gives nothing for collinear points', () => {
    expect(delaunay2D([0, 1, 2, 3], [0, 1, 2, 3])).toHaveLength(0);
  });

  it('has empty circumcircles and covers the convex hull (random points)', () => {
    const point = fc.tuple(coord, coord);
    fc.assert(
      fc.property(fc.array(point, { minLength: 3, maxLength: 60 }), (pts) => {
        const u = pts.map((p) => p[0]);
        const v = pts.map((p) => p[1]);
        const tris = delaunay2D(u, v);
        let area = 0;
        for (let t = 0; t < tris.length; t += 3) {
          const [a, b, c] = [0, 1, 2].map((k) => pts[tris[t + k]!]!) as [
            [number, number],
            [number, number],
            [number, number],
          ];
          const [cx, cy, r] = circumcircle(a, b, c);
          area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
          for (const p of pts) {
            expect(Math.hypot(p[0] - cx, p[1] - cy)).toBeGreaterThanOrEqual(r * (1 - 1e-6) - 1e-6);
          }
        }
        // The triangles tile the convex hull: compare areas with the 3D hull of the lifted-flat
        // points is overkill; the hull area from a monotone chain is enough.
        const hull = hullArea(pts);
        if (tris.length > 0) expect(area).toBeCloseTo(hull, 3);
        else expect(hull).toBeLessThan(1e-3);
      }),
      { numRuns: 80 },
    );
  });
});

function hullArea(pts: readonly [number, number][]): number {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const chain = (list: [number, number][]) => {
    const h: [number, number][] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  const ring = [...chain(s), ...chain(s.reverse())];
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

describe('delaunay3D', () => {
  it('has empty circumspheres (random points)', () => {
    fc.assert(
      fc.property(fc.array(point3, { minLength: 5, maxLength: 40 }), (pts) => {
        const tets = delaunay3D(...columns(pts));
        for (let t = 0; t < tets.length; t += 4) {
          const v = [0, 1, 2, 3].map((k) => pts[tets[t + k]!]!);
          const r = circumradius(v[0]!, v[1]!, v[2]!, v[3]!);
          if (!Number.isFinite(r) || r > 1e6) continue;
          const c = sphereCenter(v);
          for (const p of pts) {
            expect(Math.hypot(...sub(p, c))).toBeGreaterThanOrEqual(r * (1 - 1e-6) - 1e-6);
          }
        }
      }),
      { numRuns: 40 },
    );
  });

  it('splits a cube with a center point', () => {
    const pts: P3[] = [];
    for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) pts.push([x, y, z]);
    pts.push([0.5, 0.5, 0.5]);
    const tets = delaunay3D(...columns(pts));
    let volume = 0;
    for (let t = 0; t < tets.length; t += 4) {
      const [a, b, c, d] = [0, 1, 2, 3].map((k) => pts[tets[t + k]!]!) as P3[];
      volume += Math.abs(dot(sub(b!, a!), cross(sub(c!, a!), sub(d!, a!)))) / 6;
    }
    expect(volume).toBeCloseTo(1, 9);
  });
});

function sphereCenter(v: readonly number[][]): number[] {
  const [a, b, c, d] = v as [number[], number[], number[], number[]];
  const u = sub(b, a);
  const w1 = sub(c, a);
  const w2 = sub(d, a);
  const det = 2 * dot(u, cross(w1, w2));
  const uu = dot(u, u);
  const vv = dot(w1, w1);
  const ww = dot(w2, w2);
  const r = [0, 1, 2].map(
    (k) => (uu * cross(w1, w2)[k]! + vv * cross(w2, u)[k]! + ww * cross(u, w1)[k]!) / det,
  );
  return r.map((x, k) => x + a[k]!);
}

describe('alphaShape', () => {
  it('is the convex hull for a small alpha, and drops large tetrahedra for a large one', () => {
    const pts: P3[] = [];
    for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) pts.push([x, y, z]);
    const hull = alphaShape(0.1, ...columns(pts));
    expect(hull.length / 3).toBe(12);
    expectClosed(hull);
    // The cube's tetrahedra have circumradius √3 / 2 ≈ 0.866: alpha 2 keeps none.
    expect(alphaShape(2, ...columns(pts))).toHaveLength(0);
  });

  it('carves a concave shape (two clusters)', () => {
    const pts: P3[] = [];
    for (const ox of [0, 10])
      for (const x of [0, 1])
        for (const y of [0, 1]) for (const z of [0, 1]) pts.push([x + ox, y, z]);
    const shape = alphaShape(1, ...columns(pts));
    // Two separate closed cubes (12 triangles each), nothing bridging the gap.
    expect(shape.length / 3).toBe(24);
    expectClosed(shape);
    for (let t = 0; t < shape.length; t += 3) {
      const side = [0, 1, 2].map((k) => (shape[t + k]! < 8 ? 0 : 1));
      expect(new Set(side).size).toBe(1);
    }
  });

  it('circumradius of a regular tetrahedron', () => {
    const r = circumradius([1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]);
    expect(r).toBeCloseTo(Math.sqrt(3), 12);
    expect(circumradius([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0])).toBe(Infinity);
  });
});
