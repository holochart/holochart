/**
 * Triangles for a `mesh3d` without `i` / `j` / `k` (plan E14.4), as plotly.js derives them from
 * `alphahull` (`mesh3d/convert.js`): `0` the convex hull, `> 0` the alpha shape with that alpha,
 * otherwise (the default `-1`) a 2D Delaunay triangulation of the points projected along
 * `delaunayaxis`. No dependencies; all three come from one convex hull routine:
 *
 * - **Convex hull**: {@link convexHull}, a d-dimensional Quickhull (Barber, Dobkin & Huhdanpaa
 *   1996) with conflict lists, for d = 3 and 4.
 * - **Delaunay**: the lower hull of the points lifted onto the paraboloid `w = |p|²` (Brown 1979,
 *   what plotly.js' `delaunay-triangulate` does): 2D triangles from a 3D hull
 *   ({@link delaunay2D}), 3D tetrahedra from a 4D hull ({@link delaunay3D}).
 * - **Alpha shape** (plotly.js' `alpha-shape`): the Delaunay tetrahedra whose circumradius is
 *   below `1 / alpha`, and the triangles of their boundary (faces used by exactly one of them).
 *
 * Coordinates are normalized to a unit box first (per axis for the hull, uniformly for Delaunay,
 * which is not affine invariant), and a point closer than {@link EPSILON} to a facet's plane counts
 * as on it, so duplicates, coplanar and co-circular points (grids) are handled: a point on the
 * hull that is not a corner is left out, and co-circular points get some valid Delaunay
 * triangulation. Input spanning less than the hull's dimension (coplanar points for the 3D hull,
 * collinear ones for 2D Delaunay) gives no triangles, as in plotly.js.
 */

/** Distance (normalized units) within which a point counts as on a facet's hyperplane. */
const EPSILON = 1e-10;

/** A facet (d vertices) of the d-dimensional hull. */
interface Facet {
  readonly v: number[];
  /** Unit normal, pointing out of the hull. */
  readonly n: Float64Array;
  /** `n · x` on the facet's hyperplane. */
  readonly off: number;
  /** `nb[i]`: the facet across the ridge opposite `v[i]`. */
  readonly nb: Facet[];
  /** Points outside this facet not assigned elsewhere (the conflict list). */
  out: number[];
  /** Index of the farthest outside point, and its distance. */
  far: number;
  farDist: number;
  dead: boolean;
  /** Visit stamp of the latest visibility search. */
  seen: number;
}

/** Signed distance of point `i` (dimension `d` coordinates in `pts`) to facet `f`. */
function distance(f: Facet, pts: Float64Array, d: number, i: number): number {
  let s = -f.off;
  for (let k = 0; k < d; k++) s += f.n[k]! * pts[i * d + k]!;
  return s;
}

/** 3×3 determinant (rows a, b, c). */
function det3(
  a0: number,
  a1: number,
  a2: number,
  b0: number,
  b1: number,
  b2: number,
  c0: number,
  c1: number,
  c2: number,
): number {
  return a0 * (b1 * c2 - b2 * c1) - a1 * (b0 * c2 - b2 * c0) + a2 * (b0 * c1 - b1 * c0);
}

/**
 * The (unnormalized) normal of the hyperplane through `d` points: the generalized cross product
 * of the edge vectors from the first (cofactors of their (d − 1) × d matrix), d = 3 or 4.
 */
function hyperplaneNormal(pts: Float64Array, d: number, v: readonly number[]): Float64Array {
  const n = new Float64Array(d);
  const o = v[0]! * d;
  const e = (r: number, k: number) => pts[v[r]! * d + k]! - pts[o + k]!;
  if (d === 3) {
    n[0] = e(1, 1) * e(2, 2) - e(1, 2) * e(2, 1);
    n[1] = e(1, 2) * e(2, 0) - e(1, 0) * e(2, 2);
    n[2] = e(1, 0) * e(2, 1) - e(1, 1) * e(2, 0);
    return n;
  }
  // d = 4: n_j = (-1)^j · det(the 3 × 3 minor without column j).
  for (let j = 0; j < 4; j++) {
    const c = [0, 1, 2, 3].filter((k) => k !== j) as [number, number, number];
    const m = det3(
      e(1, c[0]),
      e(1, c[1]),
      e(1, c[2]),
      e(2, c[0]),
      e(2, c[1]),
      e(2, c[2]),
      e(3, c[0]),
      e(3, c[1]),
      e(3, c[2]),
    );
    n[j] = j % 2 === 0 ? m : -m;
  }
  return n;
}

/** A facet through `v`, its normal pointing away from `inside`; null when degenerate. */
function makeFacet(pts: Float64Array, d: number, v: number[], inside: Float64Array): Facet | null {
  const n = hyperplaneNormal(pts, d, v);
  let len = 0;
  for (let k = 0; k < d; k++) len += n[k]! * n[k]!;
  len = Math.sqrt(len);
  if (!(len > 0)) return null;
  let off = 0;
  let side = 0;
  for (let k = 0; k < d; k++) {
    n[k]! /= len;
    off += n[k]! * pts[v[0]! * d + k]!;
    side += n[k]! * inside[k]!;
  }
  if (side - off > 0) {
    for (let k = 0; k < d; k++) n[k] = -n[k]!;
    off = -off;
  }
  return { v, n, off, nb: [], out: [], far: -1, farDist: 0, dead: false, seen: 0 };
}

/**
 * The first `d + 1` affinely independent points, greedily far apart (the initial simplex), or
 * the (fewer) independent points found when the input spans less than `d` dimensions.
 */
function initialSimplex(pts: Float64Array, d: number, count: number): number[] {
  // Start with the two points farthest apart along one axis.
  let best = -1;
  let a = 0;
  let b = 0;
  for (let k = 0; k < d; k++) {
    let lo = 0;
    let hi = 0;
    for (let i = 1; i < count; i++) {
      if (pts[i * d + k]! < pts[lo * d + k]!) lo = i;
      if (pts[i * d + k]! > pts[hi * d + k]!) hi = i;
    }
    const span = pts[hi * d + k]! - pts[lo * d + k]!;
    if (span > best) [best, a, b] = [span, lo, hi];
  }
  if (!(best > EPSILON)) return [a];
  const simplex = [a, b];
  // Orthonormal basis of the simplex's affine span (Gram–Schmidt), grown one point at a time
  // with the point farthest from it.
  const basis: Float64Array[] = [];
  const residual = (i: number, out: Float64Array): number => {
    for (let k = 0; k < d; k++) out[k] = pts[i * d + k]! - pts[a * d + k]!;
    for (const u of basis) {
      let dot = 0;
      for (let k = 0; k < d; k++) dot += out[k]! * u[k]!;
      for (let k = 0; k < d; k++) out[k]! -= dot * u[k]!;
    }
    let s = 0;
    for (let k = 0; k < d; k++) s += out[k]! * out[k]!;
    return Math.sqrt(s);
  };
  const r = new Float64Array(d);
  const add = (i: number) => {
    const len = residual(i, r);
    basis.push(r.map((x) => x / len));
  };
  add(b);
  while (simplex.length < d + 1) {
    let far = -1;
    let farDist = EPSILON;
    for (let i = 0; i < count; i++) {
      const dist = residual(i, r);
      if (dist > farDist) [far, farDist] = [i, dist];
    }
    if (far < 0) break;
    simplex.push(far);
    add(far);
  }
  return simplex;
}

/**
 * Convex hull facets of `count` points of dimension `d` (3 or 4; coordinates `pts[i * d + k]`),
 * each with its `d` vertex indices (in no particular orientation) and its outward unit normal.
 * `null` when the points span less than `d` dimensions.
 */
export function hullFacets(pts: Float64Array, d: 3 | 4, count = pts.length / d): Facet[] | null {
  const simplex = initialSimplex(pts, d, count);
  if (simplex.length < d + 1) return null;
  const inside = new Float64Array(d);
  for (const i of simplex) for (let k = 0; k < d; k++) inside[k]! += pts[i * d + k]! / (d + 1);
  // The simplex' facets: facet j lies opposite simplex vertex j.
  const facets: Facet[] = [];
  for (let j = 0; j <= d; j++) {
    const f = makeFacet(
      pts,
      d,
      simplex.filter((_, k) => k !== j),
      inside,
    );
    if (!f) return null;
    facets.push(f);
  }
  for (let j = 0; j <= d; j++) {
    const f = facets[j]!;
    // Across the ridge opposite `f.v[i]` (simplex vertex s) lies the facet opposite s.
    f.v.forEach((vi, i) => (f.nb[i] = facets[simplex.indexOf(vi)]!));
  }
  const assign = (i: number, candidates: readonly Facet[]): void => {
    for (const f of candidates) {
      const dist = distance(f, pts, d, i);
      if (dist > EPSILON) {
        f.out.push(i);
        if (dist > f.farDist) [f.far, f.farDist] = [i, dist];
        return;
      }
    }
  };
  const inSimplex = new Set(simplex);
  for (let i = 0; i < count; i++) if (!inSimplex.has(i)) assign(i, facets);

  const stack = facets.filter((f) => f.out.length > 0);
  let stamp = 0;
  while (stack.length > 0) {
    const start = stack.pop()!;
    if (start.dead || start.out.length === 0) continue;
    const p = start.far;
    // The facets p sees (a connected region containing `start`).
    stamp++;
    start.seen = stamp;
    const visible = [start];
    for (let q = 0; q < visible.length; q++) {
      for (const g of visible[q]!.nb) {
        if (g.seen === stamp) continue;
        g.seen = stamp;
        if (distance(g, pts, d, p) > EPSILON) visible.push(g);
      }
    }
    for (const f of visible) f.dead = true;
    // One new facet per horizon ridge: the ridge (a visible facet without one vertex, whose
    // neighbor across it is not visible) and p.
    const created: Facet[] = [];
    const ridges = new Map<number, [Facet, number]>();
    let failed = false;
    for (const f of visible) {
      for (let i = 0; i < d; i++) {
        const h = f.nb[i]!;
        if (h.dead) continue;
        const ridge = f.v.filter((_, k) => k !== i);
        const g = makeFacet(pts, d, [...ridge, p], inside);
        if (!g) {
          failed = true;
          continue;
        }
        g.nb[d - 1] = h;
        h.nb[h.nb.indexOf(f)] = g;
        // Link to the other new facets across the ridges through p.
        for (let k = 0; k < d - 1; k++) {
          // The ridge's vertices other than p: one (d = 3) or two (d = 4), as one number.
          const a = ridge[k === 0 ? 1 : 0]!;
          const b = d === 4 ? ridge[k === 2 ? 1 : 2]! : -1;
          const key = b < 0 ? a : Math.min(a, b) * count + Math.max(a, b);
          const other = ridges.get(key);
          if (other) {
            g.nb[k] = other[0];
            other[0].nb[other[1]] = g;
            ridges.delete(key);
          } else ridges.set(key, [g, k]);
        }
        created.push(g);
      }
    }
    // A degenerate new facet (numerically) would leave a hole: stop growing, keep what is valid.
    if (failed || ridges.size > 0) {
      for (const f of visible) f.dead = false;
      for (const g of created) {
        for (let i = 0; i < d; i++) {
          const h = g.nb[i];
          if (h && !h.dead && created.indexOf(h) < 0) {
            const f = visible.find((v) => v.nb.includes(h));
            if (f) h.nb[h.nb.indexOf(g)] = f;
          }
        }
      }
      start.out = start.out.filter((i) => i !== p);
      start.farDist = 0;
      start.far = -1;
      for (const i of start.out) {
        const dist = distance(start, pts, d, i);
        if (dist > start.farDist) [start.far, start.farDist] = [i, dist];
      }
      if (start.out.length > 0) stack.push(start);
      continue;
    }
    for (const f of visible) {
      for (const i of f.out) if (i !== p) assign(i, created);
      f.out = [];
    }
    for (const g of created) {
      facets.push(g);
      if (g.out.length > 0) stack.push(g);
    }
  }
  return facets.filter((f) => !f.dead);
}

/** Coordinates as a flat array of dimension `d`, per-axis mapped by `scale` / `shift`. */
function pack(
  columns: readonly ArrayLike<number>[],
  count: number,
  shift: readonly number[],
  scale: readonly number[],
  lift: boolean,
): Float64Array {
  const d = columns.length + (lift ? 1 : 0);
  const out = new Float64Array(count * d);
  for (let i = 0; i < count; i++) {
    let w = 0;
    columns.forEach((c, k) => {
      const v = (c[i]! - shift[k]!) * scale[k]!;
      out[i * d + k] = v;
      w += v * v;
    });
    if (lift) out[i * d + d - 1] = w;
  }
  return out;
}

interface Extent {
  lo: number[];
  span: number[];
  count: number;
  /** Indices of the points with finite coordinates. */
  finite: number[];
}

function extentOf(columns: readonly ArrayLike<number>[]): Extent {
  const count = Math.min(...columns.map((c) => c.length));
  const lo = columns.map(() => Infinity);
  const hi = columns.map(() => -Infinity);
  const finite: number[] = [];
  for (let i = 0; i < count; i++) {
    if (!columns.every((c) => Number.isFinite(c[i]))) continue;
    finite.push(i);
    columns.forEach((c, k) => {
      lo[k] = Math.min(lo[k]!, c[i]!);
      hi[k] = Math.max(hi[k]!, c[i]!);
    });
  }
  return { lo, span: lo.map((l, k) => (hi[k]! > l ? hi[k]! - l : 0)), count, finite };
}

/** `columns` restricted to `finite` (dense), and the map back to input indices. */
function compact(columns: readonly ArrayLike<number>[], finite: readonly number[]): number[][] {
  return columns.map((c) => finite.map((i) => c[i]!));
}

/**
 * Triangles of the convex hull of the points (`x`, `y`, `z`, non-finite points ignored), outward
 * facing (counterclockwise seen from outside): three input indices each. Coplanar input gives
 * none, as in plotly.js (`convex-hull`).
 */
export function convexHull(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  z: ArrayLike<number>,
): Uint32Array {
  const ext = extentOf([x, y, z]);
  const cols = compact([x, y, z], ext.finite);
  const n = ext.finite.length;
  const scale = ext.span.map((s) => (s > 0 ? 1 / s : 1));
  const pts = pack(cols, n, ext.lo, scale, false);
  const facets = hullFacets(pts, 3, n);
  if (facets) {
    const out = new Uint32Array(facets.length * 3);
    facets.forEach((f, t) => {
      // Counterclockwise around the outward normal.
      const [a, b, c] = f.v as [number, number, number];
      const nn = hyperplaneNormal(pts, 3, [a, b, c]);
      const flip = nn[0]! * f.n[0]! + nn[1]! * f.n[1]! + nn[2]! * f.n[2]! < 0;
      out[t * 3] = ext.finite[a]!;
      out[t * 3 + 1] = ext.finite[flip ? c : b]!;
      out[t * 3 + 2] = ext.finite[flip ? b : c]!;
    });
    return out;
  }
  return new Uint32Array(0);
}

/** Lower-hull facets of the lifted points: the Delaunay simplices, as input indices. */
function delaunay(columns: readonly ArrayLike<number>[]): Uint32Array {
  const dim = columns.length;
  const ext = extentOf(columns);
  const cols = compact(columns, ext.finite);
  const n = ext.finite.length;
  // Uniform scaling (Delaunay is only similarity invariant) around the box center.
  const span = Math.max(...ext.span);
  const scale = columns.map(() => (span > 0 ? 2 / span : 1));
  const center = ext.lo.map((l, k) => l + ext.span[k]! / 2);
  const d = dim + 1;
  // A point high above the paraboloid at the centroid (never on the lower hull) keeps the lifted
  // set full-dimensional when every point is co-circular / co-spherical (points on a sphere).
  const pts = new Float64Array((n + 1) * d);
  pts.set(pack(cols, n, center, scale, true));
  for (let i = 0; i < n; i++) for (let k = 0; k < dim; k++) pts[n * d + k]! += pts[i * d + k]! / n;
  pts[n * d + dim] = 4 * d;
  const facets = hullFacets(pts, d as 3 | 4, n + 1);
  if (!facets) return new Uint32Array(0);
  const lower = facets.filter((f) => f.n[dim]! < -EPSILON && !f.v.includes(n));
  const out = new Uint32Array(lower.length * d);
  lower.forEach((f, t) => f.v.forEach((v, k) => (out[t * d + k] = ext.finite[v]!)));
  return out;
}

/**
 * Delaunay triangulation of the 2D points (`u`, `v`): three input indices per triangle (no
 * point strictly inside any triangle's circumcircle). Non-finite points are ignored; collinear
 * input gives no triangles.
 */
export function delaunay2D(u: ArrayLike<number>, v: ArrayLike<number>): Uint32Array {
  return delaunay([u, v]);
}

/**
 * Delaunay tetrahedralization of the 3D points: four input indices per tetrahedron (no point
 * strictly inside any circumsphere). Coplanar input gives none.
 */
export function delaunay3D(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  z: ArrayLike<number>,
): Uint32Array {
  return delaunay([x, y, z]);
}

/** Circumradius of the tetrahedron `a`, `b`, `c`, `d` (Infinity when flat). */
export function circumradius(
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
  d: readonly number[],
): number {
  const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
  const w = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!];
  const cross = (p: number[], q: number[]) => [
    p[1]! * q[2]! - p[2]! * q[1]!,
    p[2]! * q[0]! - p[0]! * q[2]!,
    p[0]! * q[1]! - p[1]! * q[0]!,
  ];
  const vw = cross(v, w);
  const wu = cross(w, u);
  const uv = cross(u, v);
  const det = 2 * (u[0]! * vw[0]! + u[1]! * vw[1]! + u[2]! * vw[2]!);
  if (det === 0) return Infinity;
  const uu = u[0]! ** 2 + u[1]! ** 2 + u[2]! ** 2;
  const vv = v[0]! ** 2 + v[1]! ** 2 + v[2]! ** 2;
  const ww = w[0]! ** 2 + w[1]! ** 2 + w[2]! ** 2;
  const r = [0, 1, 2].map((k) => (uu * vw[k]! + vv * wu[k]! + ww * uv[k]!) / det);
  return Math.hypot(r[0]!, r[1]!, r[2]!);
}

/**
 * The alpha shape of the points (plotly.js' `alpha-shape`): the boundary triangles of the
 * Delaunay tetrahedra with circumradius · alpha < 1 (their faces that belong to exactly one of
 * them). Coordinates are used as given (plotly.js passes them scaled by the scene's
 * `dataScale`, see `calc.ts`).
 */
export function alphaShape(
  alpha: number,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  z: ArrayLike<number>,
): Uint32Array {
  const tets = delaunay3D(x, y, z);
  const p = (i: number) => [x[i]!, y[i]!, z[i]!];
  // Faces by their sorted vertices, as one number while that is exact.
  const n = x.length;
  const numeric = n * n * n < Number.MAX_SAFE_INTEGER;
  const faces = new Map<number | string, number[] | null>();
  for (let t = 0; t < tets.length; t += 4) {
    const v = [tets[t]!, tets[t + 1]!, tets[t + 2]!, tets[t + 3]!];
    if (!(circumradius(p(v[0]!), p(v[1]!), p(v[2]!), p(v[3]!)) * alpha < 1)) continue;
    for (let k = 0; k < 4; k++) {
      const face = v.filter((_, m) => m !== k);
      const [a, b, c] = [...face].sort((q, r) => q - r) as [number, number, number];
      const key = numeric ? (a * n + b) * n + c : `${a},${b},${c}`;
      faces.set(key, faces.has(key) ? null : face);
    }
  }
  const out: number[] = [];
  for (const face of faces.values()) if (face) out.push(...face);
  return Uint32Array.from(out);
}
