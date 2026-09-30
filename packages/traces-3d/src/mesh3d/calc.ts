/**
 * `mesh3d` calc (plan E14.4): vertices in linear coordinates and the triangles, as plotly.js
 * `mesh3d/convert.js` builds them: explicit `i` / `j` / `k` (rounded; the whole trace is dropped
 * when their lengths differ or one is out of range), or derived from the vertices by `alphahull`
 * (`triangulate.ts`) in Plotly's scaled coordinates — each axis divided by its data span
 * (Plotly's scene `dataScale`; here the trace's own span, which is the same for a scene with one
 * trace).
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import { sceneExtent, sceneScales } from '../scene/axes.ts';
import type { SceneCalc } from '../scene/layout.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import { alphaShape, convexHull, delaunay2D } from './triangulate.ts';

export interface Mesh3dCalc extends SceneCalc {
  /** Vertices, linear coordinates. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** Number of vertices. */
  readonly count: number;
  /** Three vertex indices per triangle. */
  readonly triangles: Uint32Array;
  /** Plotly's `dataScale`: 1 / the data span per axis (1 for no span). */
  readonly dataScale: readonly [number, number, number];
}

/** Rounded indices (Plotly `toRoundIndex`), or null when one is out of range. */
export function roundIndices(list: ArrayLike<unknown>, count: number): Int32Array | null {
  const out = new Int32Array(list.length);
  for (let m = 0; m < list.length; m++) {
    const v = Number(list[m]);
    // Plotly's `hasValidIndices`: (-0.5, count - 0.5), so -0.49 rounds to 0.
    if (!(v > -0.5 && v < count - 0.5)) return null;
    out[m] = Math.round(v);
  }
  return out;
}

/** Triangles from `i`, `j`, `k`, or null when they are invalid (Plotly draws nothing then). */
export function explicitTriangles(
  i: ArrayLike<unknown>,
  j: ArrayLike<unknown>,
  k: ArrayLike<unknown>,
  count: number,
): Uint32Array | null {
  if (i.length !== j.length || j.length !== k.length) return null;
  const a = roundIndices(i, count);
  const b = roundIndices(j, count);
  const c = roundIndices(k, count);
  if (!a || !b || !c) return null;
  const out = new Uint32Array(a.length * 3);
  for (let m = 0; m < a.length; m++) {
    out[m * 3] = a[m]!;
    out[m * 3 + 1] = b[m]!;
    out[m * 3 + 2] = c[m]!;
  }
  return out;
}

/**
 * Triangles derived from the vertices (already scaled by `dataScale`): `alphahull` 0 → convex
 * hull, > 0 → alpha shape, otherwise → Delaunay along `delaunayaxis` (the other two axes in cyclic
 * order: `z` → (x, y), `x` → (y, z), `y` → (z, x)).
 */
export function derivedTriangles(
  alphahull: number,
  delaunayaxis: 'x' | 'y' | 'z',
  p: readonly [ArrayLike<number>, ArrayLike<number>, ArrayLike<number>],
): Uint32Array {
  if (alphahull === 0) return convexHull(p[0], p[1], p[2]);
  if (alphahull > 0) return alphaShape(alphahull, p[0], p[1], p[2]);
  const d = ['x', 'y', 'z'].indexOf(delaunayaxis);
  return delaunay2D(p[(d + 1) % 3]!, p[(d + 2) % 3]!);
}

/** The `mesh3d` calc. */
export function calcMesh3d(trace: FullTrace, ctx: CalcContext): Mesh3dCalc {
  const s = sceneScales(ctx.fullLayout, sceneOf(trace));
  const col = (k: string): ArrayLike<unknown> =>
    isArrayLike(trace[k]) ? (trace[k] as ArrayLike<unknown>) : [];
  const x = s.x.d2lArray(col('x'));
  const y = s.y.d2lArray(col('y'));
  const z = s.z.d2lArray(col('z'));
  const count = Math.min(x.length, y.length, z.length);
  const extents = [sceneExtent(x), sceneExtent(y), sceneExtent(z)] as const;
  const dataScale = extents.map((e) => (e && e[1] > e[0] ? 1 / (e[1] - e[0]) : 1)) as [
    number,
    number,
    number,
  ];
  let triangles: Uint32Array | null;
  if (isArrayLike(trace['i']) && isArrayLike(trace['j']) && isArrayLike(trace['k'])) {
    triangles = explicitTriangles(col('i'), col('j'), col('k'), count);
  } else {
    const scaled = [x, y, z].map((v, a) =>
      Float64Array.from(v.subarray(0, count), (u) => u * dataScale[a]!),
    ) as [Float64Array, Float64Array, Float64Array];
    const alphahull = Number(trace['alphahull']);
    triangles = derivedTriangles(
      Number.isFinite(alphahull) ? alphahull : -1,
      (trace['delaunayaxis'] ?? 'z') as 'x' | 'y' | 'z',
      scaled,
    );
  }
  return {
    x,
    y,
    z,
    count,
    triangles: triangles ?? new Uint32Array(0),
    dataScale,
    sceneExtremes: triangles ? { x: extents[0], y: extents[1], z: extents[2] } : {},
  };
}
