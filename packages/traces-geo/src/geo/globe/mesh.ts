/**
 * Polygons as a triangle mesh on the unit sphere (backlog GEO8, ADR-028): the base layers and the
 * choropleth regions of a `'globe3d'` subplot. Built once per geometry; a rotation or a zoom of
 * the globe is one matrix on it (`GeoSubplot.globeMatrix`).
 *
 * ## Method (spike F, "Projection in the vertex shader")
 *
 * 1. **Place** every polygon in a chart, a plane without a tear inside the polygon (`chart.ts`):
 *    the plane of longitude and latitude for nearly all, the plane about a pole for the few
 *    that hold a pole or come near one. In the flat chart d3 **cuts** at the antimeridian.
 *    Every edge is split along its great arc to at most `densify` degrees (`cut.ts`).
 * 2. **Triangulate** in the chart's plane, with render's `triangulateFills` (earcut). Earcut
 *    drops ring vertices that lie on a straight line, such as the ones just added along a
 *    meridian: the mesh's boundary is found from the vertices it kept.
 * 3. **Subdivide** by longest-edge bisection until no edge is longer than `maxEdge` degrees *in
 *    that plane*. An edge is always split at one point, shared by the triangles on both sides,
 *    so the mesh has no T-junctions.
 * 4. **Map** to the sphere, and wind every triangle to face outwards.
 *
 * ## Why the plane's lengths, and where an edge is split
 *
 * Earcut's triangles can span half the map, and three points far apart in a plane span another
 * region of the sphere than of the plane. Small triangles do not, away from slivers: so the
 * subdivision measures edges as the plane does, and splits an **inner** edge at the plane's
 * midpoint. An edge is never longer on the sphere than in a chart's plane, so `maxEdge` bounds
 * the arcs too.
 *
 * An edge of the **boundary** is a great arc, and is split at the arc's middle. The mesh's
 * outline is therefore the polygons' own, made of pieces of their edges, however far the
 * subdivision goes; its area on the sphere is theirs, and it meets the mesh of the region next
 * door without a gap (both split a shared edge at the same points, see `cut.ts`).
 *
 * What is left of the difference between plane and sphere: a sliver thinner than the sagitta
 * between an inner edge and the arc of its ends (0.03° for a 5° edge) can lie the other way
 * round on the sphere. {@link windOutwards} repairs those, and {@link SphereMesh.overlap} says
 * what it could not.
 *
 * ## The boundary
 *
 * {@link SphereMesh.boundary} lists the mesh edges on the true boundary of a region, for what is
 * built on it (the walls of a prism, `prisms.ts`). Two kinds of edge of the flat chart's cut
 * polygons are not on it: an edge along a pole, and an edge along the antimeridian when the same
 * feature has the edge again on the other side of it (the cut d3 made, or one the data came
 * with). A feature that simply ends at ±180° keeps its edge there.
 */
import type { GeoFeatureCollectionInput, GeoFeatureInput, GeoInput } from '../sink.ts';
import { chartOf, NORTH, SOUTH, type Chart } from './chart.ts';
import {
  flatPolygons,
  isPoleEdge,
  polarPolygons,
  type PlanePolygons,
  type SourcePolygon,
} from './cut.ts';
import { globeDeps } from './deps.ts';
import { arcMiddle, DEGREES, FloatBuffer, IndexBuffer, positive, type Vec3 } from './sphere.ts';

/** Options of {@link buildSphereMesh}. */
export interface SphereMeshOptions {
  /** The longest piece of a polygon's edge, in degrees of arc. Default 2.5. */
  readonly densify?: number;
  /** The longest edge of a triangle, in degrees of its chart's plane (and so of arc). Default 5. */
  readonly maxEdge?: number;
}

/** A triangle mesh on the unit sphere, in globe coordinates (`globe-frame.ts`). */
export interface SphereMesh {
  /** x, y, z of each vertex: a point of the unit sphere. */
  positions: Float32Array;
  /**
   * The outward normal of each vertex. On the unit sphere that is the vertex itself, and this is
   * the same array as {@link positions}: copy one before changing it.
   */
  normals: Float32Array;
  /** Three vertices per triangle, counter-clockwise seen from outside the sphere. */
  indices: Uint32Array;
  /**
   * For each **vertex**, the index of the feature it belongs to, in the array or collection the
   * mesh was built from (0 for a lone geometry or feature). Features share no vertices, so one
   * color per region is one color per vertex, and a picked vertex names its region.
   */
  featureOf: Uint32Array;
  vertexCount: number;
  triangleCount: number;
  /**
   * The mesh's edges on the true boundary of a region, two vertices each, run with the region on
   * the left as seen from outside the sphere (see the module comment for what is left out).
   * They are edges of the mesh's triangles, but for a ring that overlaps itself (two atolls of
   * the 1:50m land do): of such a ring the triangulation keeps what it can, and an edge listed
   * here may be none of a triangle.
   */
  boundary: Uint32Array;
  /** The number of edges in {@link boundary}. */
  boundaryCount: number;
  /**
   * The area, in steradians, of the slivers that lie the wrong way round on the sphere and could
   * only be turned round (see {@link windOutwards}): the mesh covers its regions once, and twice
   * more on these. Some millionths of the mesh's area for the basemap; 0 for most polygons.
   */
  overlap: number;
}

export const DEFAULT_DENSIFY = 2.5;
export const DEFAULT_MAX_EDGE = 5;

/** What an edge of the cut polygons is, in the low bits of its entry in the edge table. */
const BOUNDARY = 0;
const SEAM = 1;
const POLE = 2;
const KIND = 3;
/** Set when the edge has the region on its left run from its lesser vertex to its greater. */
const ASCENDING = 4;

/** Edges are keyed by their two vertices, the lesser first; exact up to 2²⁶ vertices. */
const KEY = 67108864;

function edgeKey(a: number, b: number): number {
  return a < b ? a * KEY + b : b * KEY + a;
}

/** The polygons of `input`, each with the index of its feature. Other geometry is skipped. */
function sourcePolygons(input: GeoInput): SourcePolygon[] {
  const out: SourcePolygon[] = [];
  const add = (geometry: unknown, feature: number): void => {
    const g = geometry as {
      type?: string;
      coordinates?: unknown;
      geometries?: readonly unknown[];
    } | null;
    if (!g) return;
    if (g.type === 'Polygon') {
      out.push({ coordinates: g.coordinates as SourcePolygon['coordinates'], feature });
    } else if (g.type === 'MultiPolygon') {
      for (const coordinates of g.coordinates as SourcePolygon['coordinates'][]) {
        out.push({ coordinates, feature });
      }
    } else if (g.type === 'GeometryCollection') {
      for (const member of g.geometries ?? []) add(member, feature);
    }
  };
  const object = input as GeoFeatureCollectionInput | GeoFeatureInput | { type: string };
  const features = Array.isArray(input)
    ? (input as readonly GeoFeatureInput[])
    : object.type === 'FeatureCollection'
      ? (object as GeoFeatureCollectionInput).features
      : undefined;
  if (features) features.forEach((feature, i) => add(feature.geometry, i));
  else if (object.type === 'Feature') add((object as GeoFeatureInput).geometry, 0);
  else add(object, 0);
  return out;
}

/** A mesh being put together from the parts of several charts. */
interface Parts {
  positions: number[];
  indices: number[];
  featureOf: number[];
  boundary: number[];
  overlap: number;
}

/**
 * The polygons of `input` (`Polygon` and `MultiPolygon` geometries, in a feature, a collection or
 * an array of features, or bare) as one indexed triangle mesh on the unit sphere. The polygons
 * are in degrees, wound for d3 (outer rings clockwise on the sphere), and may cross the
 * antimeridian and hold a pole, as the basemap's do. The vertices of a feature are not together
 * in the mesh (those a subdivision adds come after their chart's): {@link SphereMesh.featureOf}
 * says whose each is. d3's `Sphere` is no polygon here: {@link buildSphereShell} is the sphere.
 *
 * Load the module with `loadGlobe()`: it is handed the stream sink and the triangulation.
 */
export function buildSphereMesh(input: GeoInput, options: SphereMeshOptions = {}): SphereMesh {
  const densify = positive(options.densify, DEFAULT_DENSIFY);
  const maxEdge = positive(options.maxEdge, DEFAULT_MAX_EDGE);
  const flat: SourcePolygon[] = [];
  const north: SourcePolygon[] = [];
  const south: SourcePolygon[] = [];
  for (const polygon of sourcePolygons(input)) {
    const outer = polygon.coordinates[0];
    if (!outer || outer.length < 3) continue;
    const chart = chartOf(outer);
    (chart === NORTH ? north : chart === SOUTH ? south : flat).push(polygon);
  }
  const parts: Parts = { positions: [], indices: [], featureOf: [], boundary: [], overlap: 0 };
  if (flat.length > 0) meshPart(flatPolygons(flat, densify), maxEdge, parts);
  if (north.length > 0) meshPart(polarPolygons(north, NORTH, densify), maxEdge, parts);
  if (south.length > 0) meshPart(polarPolygons(south, SOUTH, densify), maxEdge, parts);
  const positions = Float32Array.from(parts.positions);
  const vertexCount = positions.length / 3;
  return {
    positions,
    normals: positions,
    indices: Uint32Array.from(parts.indices),
    featureOf: Uint32Array.from(parts.featureOf),
    vertexCount,
    triangleCount: parts.indices.length / 3,
    boundary: Uint32Array.from(parts.boundary),
    boundaryCount: parts.boundary.length / 2,
    overlap: parts.overlap,
  };
}

const A: Vec3 = [0, 0, 0];
const B: Vec3 = [0, 0, 0];
const M: Vec3 = [0, 0, 0];
const UV: [number, number] = [0, 0];

/** Triangulate, subdivide and wind the polygons of one chart, and append them to `parts`. */
function meshPart(part: PlanePolygons, maxEdge: number, parts: Parts): void {
  const { chart } = part;
  const count = part.vertexCount;
  if (count === 0) return;
  const tri = globeDeps().triangulate({
    x: part.u.subarray(0, count),
    y: part.v.subarray(0, count),
    rings: part.rings.subarray(0, part.ringCount),
    polygons: part.polygons.subarray(0, part.polygonCount),
  });
  // Every ring has three finite vertices or more, so the triangulation's vertices are the
  // input's, in the same order.
  if (tri.vertexCount !== count) {
    throw new Error(
      `The triangulation changed the vertices of the polygons (${count} in, ${tri.vertexCount} out).`,
    );
  }

  const u = new FloatBuffer(count * 2);
  const v = new FloatBuffer(count * 2);
  const xyz = new FloatBuffer(count * 6);
  u.data.set(part.u.subarray(0, count));
  v.data.set(part.v.subarray(0, count));
  xyz.data.set(part.xyz.subarray(0, count * 3));
  u.length = v.length = count;
  xyz.length = count * 3;
  const feature = new IndexBuffer(count * 2);
  feature.length = count;
  const edges = boundaryEdges(part, tri.indices, feature.data);

  // Longest-edge bisection, with every edge split at one vertex whoever splits it.
  const limit = maxEdge * maxEdge;
  const midpoints = new Map<number, number>();
  const stack: number[] = Array.from(tri.indices);
  const triangles: number[] = [];
  while (stack.length > 0) {
    const c = stack.pop() as number;
    const b = stack.pop() as number;
    const a = stack.pop() as number;
    const x = u.data;
    const y = v.data;
    const ab = (x[a]! - x[b]!) ** 2 + (y[a]! - y[b]!) ** 2;
    const bc = (x[b]! - x[c]!) ** 2 + (y[b]! - y[c]!) ** 2;
    const ca = (x[c]! - x[a]!) ** 2 + (y[c]! - y[a]!) ** 2;
    const longest = Math.max(ab, bc, ca);
    if (!(longest > limit)) {
      triangles.push(a, b, c);
      continue;
    }
    // `p` to `q` is the longest edge and `r` the vertex across it.
    const p = ab === longest ? a : bc === longest ? b : c;
    const q = ab === longest ? b : bc === longest ? c : a;
    const r = ab === longest ? c : bc === longest ? a : b;
    const key = edgeKey(p, q);
    let m = midpoints.get(key);
    if (m === undefined) {
      m = u.length;
      const edge = edges.get(key);
      splitAt(chart, p, q, edge === undefined ? -1 : edge & KIND, u, v, xyz);
      feature.push(feature.data[p] as number);
      midpoints.set(key, m);
      if (edge !== undefined) {
        // The two halves are on the boundary too, and run the way the edge ran.
        edges.delete(key);
        const lesser = Math.min(p, q);
        const greater = Math.max(p, q);
        const kind = edge & KIND;
        edges.set(lesser * KEY + m, kind | (edge & ASCENDING));
        edges.set(greater * KEY + m, kind | (edge & ASCENDING ? 0 : ASCENDING));
      }
    }
    stack.push(p, m, r, m, q, r);
  }

  const indices = Uint32Array.from(triangles);
  parts.overlap += windOutwards(indices, xyz.data);

  // Append to the mesh: this chart's vertices come after those already there.
  const base = parts.positions.length / 3;
  const vertexCount = u.length;
  for (let i = 0; i < vertexCount * 3; i++) parts.positions.push(xyz.data[i] as number);
  for (let i = 0; i < vertexCount; i++) parts.featureOf.push(feature.data[i] as number);
  for (let i = 0; i < indices.length; i++) parts.indices.push(base + (indices[i] as number));
  for (const [key, edge] of edges) {
    if ((edge & KIND) !== BOUNDARY) continue;
    const lesser = Math.floor(key / KEY);
    const greater = key - lesser * KEY;
    parts.boundary.push(
      base + (edge & ASCENDING ? lesser : greater),
      base + (edge & ASCENDING ? greater : lesser),
    );
  }
}

/**
 * Append the vertex that splits the edge between vertices `p` and `q`: the middle of the great
 * arc for an edge of the boundary, and the midpoint in the chart's plane for an inner edge
 * (`kind` −1) and, in the flat chart, for an edge along a pole or along a meridian, where the
 * longitude or latitude must stay exact (see the module comment).
 */
function splitAt(
  chart: Chart,
  p: number,
  q: number,
  kind: number,
  u: FloatBuffer,
  v: FloatBuffer,
  xyz: FloatBuffer,
): void {
  const uP = u.data[p] as number;
  const vP = v.data[p] as number;
  const uQ = u.data[q] as number;
  const vQ = v.data[q] as number;
  const straight = chart.flat && (uP === uQ || isPoleEdge(vP, vQ));
  if (kind === BOUNDARY && !straight) {
    const d = xyz.data;
    A[0] = d[3 * p] as number;
    A[1] = d[3 * p + 1] as number;
    A[2] = d[3 * p + 2] as number;
    B[0] = d[3 * q] as number;
    B[1] = d[3 * q + 1] as number;
    B[2] = d[3 * q + 2] as number;
    arcMiddle(A, B, M);
    chart.toPlane(M, (uP + uQ) / 2, UV);
  } else {
    UV[0] = (uP + uQ) / 2;
    UV[1] = (vP + vQ) / 2;
    chart.toSphere(UV[0], UV[1], M);
  }
  u.push(UV[0]);
  v.push(UV[1]);
  xyz.push(M[0]);
  xyz.push(M[1]);
  xyz.push(M[2]);
}

/** The intervals of latitude a feature has edges along, on each side of the antimeridian. */
interface Seams {
  east: number[];
  west: number[];
}

/** Sort intervals (pairs in a flat array) and merge those that touch. */
function merged(intervals: number[]): number[] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < intervals.length; i += 2) {
    pairs.push([intervals[i] as number, intervals[i + 1] as number]);
  }
  pairs.sort((p, q) => p[0] - q[0]);
  const out: number[] = [];
  for (const [lo, hi] of pairs) {
    const last = out.length - 1;
    if (last > 0 && lo <= (out[last] as number) + 1e-9) {
      if (hi > (out[last] as number)) out[last] = hi;
    } else out.push(lo, hi);
  }
  return out;
}

function covered(intervals: readonly number[], lo: number, hi: number): boolean {
  for (let i = 0; i < intervals.length; i += 2) {
    if (lo >= (intervals[i] as number) - 1e-9 && hi <= (intervals[i + 1] as number) + 1e-9) {
      return true;
    }
  }
  return false;
}

/**
 * The boundary edges of the triangulation, by {@link edgeKey}, with what each is (`BOUNDARY`,
 * or in the flat chart `SEAM` or `POLE`) and which way it runs with the region on its left;
 * and, written to `feature`, the feature of every vertex.
 *
 * The triangulation's boundary is the rings without the vertices earcut dropped: each ring's
 * vertices that a triangle uses, joined in ring order. The region is on the right of a ring
 * (`PlanePolygons`), so an edge runs with the region on its left from a vertex back to the one
 * before it.
 */
function boundaryEdges(
  part: PlanePolygons,
  indices: Uint32Array,
  feature: Uint32Array,
): Map<number, number> {
  const { u, v, vertexCount, rings, ringCount, polygons, polygonCount, featureOf } = part;
  const flat = part.chart.flat;
  const used = new Uint8Array(vertexCount);
  for (let i = 0; i < indices.length; i++) used[indices[i] as number] = 1;

  // The edges of each feature along the antimeridian, by side, as intervals of latitude.
  const seams = new Map<number, Seams>();
  const ringEdges: number[] = [];
  for (let p = 0; p < polygonCount; p++) {
    const f = featureOf[p] as number;
    const r1 = p + 1 < polygonCount ? (polygons[p + 1] as number) : ringCount;
    for (let r = polygons[p] as number; r < r1; r++) {
      const a = rings[r] as number;
      const b = r + 1 < ringCount ? (rings[r + 1] as number) : vertexCount;
      let first = -1;
      let previous = -1;
      for (let i = a; i <= b; i++) {
        // One step past the end closes the ring on its first used vertex.
        const at = i < b ? i : first;
        if (i < b) {
          feature[i] = f;
          if (!used[i]) continue;
        }
        if (at < 0) break;
        if (first < 0) first = at;
        if (previous >= 0 && previous !== at) ringEdges.push(previous, at);
        previous = at;
      }
      if (!flat) continue;
      // Every edge of the ring counts here, also between vertices earcut dropped: where d3 cuts
      // at a vertex that lies on the antimeridian it leaves a stub a rounding error long, and
      // the two sides must still be seen to cover each other.
      for (let i = a; i < b; i++) {
        const j = i + 1 < b ? i + 1 : a;
        const meridian = u[i] as number;
        if (meridian !== u[j] || (meridian !== 180 && meridian !== -180)) continue;
        let seam = seams.get(f);
        if (!seam) seams.set(f, (seam = { east: [], west: [] }));
        const side = meridian === 180 ? seam.east : seam.west;
        side.push(
          Math.min(v[i] as number, v[j] as number),
          Math.max(v[i] as number, v[j] as number),
        );
      }
    }
  }
  for (const seam of seams.values()) {
    seam.east = merged(seam.east);
    seam.west = merged(seam.west);
  }

  const edges = new Map<number, number>();
  for (let i = 0; i < ringEdges.length; i += 2) {
    const from = ringEdges[i] as number;
    const to = ringEdges[i + 1] as number;
    let kind = BOUNDARY;
    if (flat && isPoleEdge(v[from] as number, v[to] as number)) kind = POLE;
    else if (flat && u[from] === u[to] && Math.abs(u[from] as number) === 180) {
      // Inside the region when the feature has this stretch of the antimeridian on both sides.
      const seam = seams.get(feature[from] as number);
      const other = u[from] === 180 ? seam?.west : seam?.east;
      const lo = Math.min(v[from] as number, v[to] as number);
      const hi = Math.max(v[from] as number, v[to] as number);
      if (other && covered(other, lo, hi)) kind = SEAM;
    }
    // The ring runs `from` → `to` with the region on its right: on its left from `to` to `from`.
    edges.set(edgeKey(from, to), kind | (to < from ? ASCENDING : 0));
  }
  return edges;
}

/** Six times the signed volume under a triangle: positive when it runs counter-clockwise. */
function turnOf(xyz: Float64Array, a: number, b: number, c: number): number {
  const i = 3 * a;
  const j = 3 * b;
  const k = 3 * c;
  return (
    xyz[i]! * (xyz[j + 1]! * xyz[k + 2]! - xyz[j + 2]! * xyz[k + 1]!) +
    xyz[i + 1]! * (xyz[j + 2]! * xyz[k]! - xyz[j]! * xyz[k + 2]!) +
    xyz[i + 2]! * (xyz[j]! * xyz[k + 1]! - xyz[j + 1]! * xyz[k]!)
  );
}

/**
 * Make every triangle run counter-clockwise as seen from outside the sphere (`xyz` has the
 * vertices), in place.
 *
 * Earcut winds its triangles one way in the plane, and nearly all of them lie the same way on
 * the sphere. The exceptions are slivers (about one triangle in 250 of the basemap): three
 * vertices almost in a line in the plane, one of which is on the other side of the great arc
 * between the other two. Such a sliver lies under its neighbour across that edge, so turning it
 * round alone would cover its patch twice. Where it can be done, the two swap their shared edge
 * for the other diagonal of their four vertices: when that gives two triangles that lie right,
 * they cover what the pair covered, once. The few slivers left over (none of whose edges can be
 * swapped so) are turned round.
 */
function windOutwards(indices: Uint32Array, xyz: Float64Array): number {
  // The edges of each sliver, with the sliver's triangle.
  const slivers = new Map<number, number>();
  const shared = new Map<number, number>();
  const pending = new Set<number>();
  /** By triangle: whether it is a sliver still waiting. */
  const waiting = new Uint8Array(indices.length / 3);
  const marked = new Uint8Array(xyz.length / 3);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] as number;
    const b = indices[t + 1] as number;
    const c = indices[t + 2] as number;
    if (!(turnOf(xyz, a, b, c) < 0)) continue;
    pending.add(t);
    waiting[t / 3] = 1;
    marked[a] = marked[b] = marked[c] = 1;
    for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      // Two slivers can share an edge; once one of them is gone the other can use it.
      if (slivers.has(key)) shared.set(key, t);
      else slivers.set(key, t);
    }
  }
  if (pending.size === 0) return 0;

  // A swap gives the sliver's neighbours new edges, which a later pass meets.
  for (let pass = 0, before = -1; pass < 8 && pending.size !== before; pass++) {
    before = pending.size;
    for (let t = 0; t < indices.length && pending.size > 0; t += 3) {
      if (waiting[t / 3]) continue;
      for (let k = 0; k < 3; k++) {
        const p = indices[t + k] as number;
        const q = indices[t + ((k + 1) % 3)] as number;
        if (!marked[p] || !marked[q]) continue;
        const key = edgeKey(p, q);
        let sliver = slivers.get(key);
        if (sliver === undefined) continue;
        if (!waiting[sliver / 3]) sliver = shared.get(key);
        if (sliver === undefined || !waiting[sliver / 3]) continue;
        // `t` is the neighbour across the sliver's edge `p`–`q`; `d` and `r` are the vertices
        // across that edge in the neighbour and in the sliver.
        const d = indices[t + ((k + 2) % 3)] as number;
        const s0 = indices[sliver] as number;
        const s1 = indices[sliver + 1] as number;
        const s2 = indices[sliver + 2] as number;
        const r = s0 !== p && s0 !== q ? s0 : s1 !== p && s1 !== q ? s1 : s2;
        // The pair covers the neighbour less the sliver, which is what the triangles `d, p, r`
        // and `q, d, r` cover when both lie right.
        if (
          !(turnOf(xyz, p, q, d) > 0) ||
          !(turnOf(xyz, d, p, r) > 0) ||
          !(turnOf(xyz, q, d, r) > 0)
        ) {
          continue;
        }
        indices[sliver] = d;
        indices[sliver + 1] = p;
        indices[sliver + 2] = r;
        indices[t] = q;
        indices[t + 1] = d;
        indices[t + 2] = r;
        pending.delete(sliver);
        waiting[sliver / 3] = 0;
        break;
      }
    }
  }

  // What could not be swapped is turned round. Each such sliver is then covered three times
  // (by itself and by the neighbours it lies under) where it should be covered once.
  let overlap = 0;
  for (const t of pending) {
    const b = indices[t + 1] as number;
    const c = indices[t + 2] as number;
    overlap += sphericalArea(xyz, indices[t] as number, c, b);
    indices[t + 1] = c;
    indices[t + 2] = b;
  }
  return overlap;
}

/** The area of a triangle on the unit sphere, in steradians: positive when it lies right. */
function sphericalArea(xyz: Float64Array, a: number, b: number, c: number): number {
  const i = 3 * a;
  const j = 3 * b;
  const k = 3 * c;
  const ab = xyz[i]! * xyz[j]! + xyz[i + 1]! * xyz[j + 1]! + xyz[i + 2]! * xyz[j + 2]!;
  const bc = xyz[j]! * xyz[k]! + xyz[j + 1]! * xyz[k + 1]! + xyz[j + 2]! * xyz[k + 2]!;
  const ca = xyz[k]! * xyz[i]! + xyz[k + 1]! * xyz[i + 1]! + xyz[k + 2]! * xyz[i + 2]!;
  return 2 * Math.atan2(turnOf(xyz, a, b, c), 1 + ab + bc + ca);
}

// ---- The whole sphere ---------------------------------------------------------------------------

/** The twelve corners of an icosahedron, and its twenty faces, counter-clockwise from outside. */
const PHI = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON_VERTICES = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
] as const;
const ICOSAHEDRON_FACES = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
  3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
] as const;

/**
 * The whole unit sphere as a mesh: the globe's body, and the ocean. An icosahedron whose faces
 * are split in four, each new vertex pushed out to the sphere, until no edge is longer than
 * `maxEdge` degrees of arc (default 5: four splits, 2,562 vertices and 5,120 triangles with edges
 * of up to 4.7°). It is watertight, every vertex is feature 0, and it has no boundary.
 */
export function buildSphereShell(maxEdge?: number): SphereMesh {
  const limit = positive(maxEdge, DEFAULT_MAX_EDGE);
  const points: number[] = [];
  for (const [x, y, z] of ICOSAHEDRON_VERTICES) {
    const length = Math.hypot(x, y, z);
    points.push(x / length, y / length, z / length);
  }
  let faces: number[] = [...ICOSAHEDRON_FACES];
  // The faces are congruent to begin with and stay nearly so: the longest edge is the first's.
  const longest = (): number => {
    let most = 0;
    for (let i = 0; i < faces.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = 3 * (faces[i + k] as number);
        const b = 3 * (faces[i + ((k + 1) % 3)] as number);
        const dot =
          points[a]! * points[b]! +
          points[a + 1]! * points[b + 1]! +
          points[a + 2]! * points[b + 2]!;
        most = Math.max(most, Math.acos(Math.max(-1, Math.min(1, dot))));
      }
    }
    return most * DEGREES;
  };
  // Eight levels are 0.3° edges and 1.3 million triangles: nothing finer is asked for in earnest.
  for (let level = 0; level < 8 && longest() > limit; level++) {
    const midpoints = new Map<number, number>();
    const middle = (a: number, b: number): number => {
      const key = edgeKey(a, b);
      let m = midpoints.get(key);
      if (m === undefined) {
        m = points.length / 3;
        const x = points[3 * a]! + points[3 * b]!;
        const y = points[3 * a + 1]! + points[3 * b + 1]!;
        const z = points[3 * a + 2]! + points[3 * b + 2]!;
        const length = Math.hypot(x, y, z);
        points.push(x / length, y / length, z / length);
        midpoints.set(key, m);
      }
      return m;
    };
    const next: number[] = [];
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i] as number;
      const b = faces[i + 1] as number;
      const c = faces[i + 2] as number;
      const ab = middle(a, b);
      const bc = middle(b, c);
      const ca = middle(c, a);
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    faces = next;
  }
  const positions = Float32Array.from(points);
  const vertexCount = positions.length / 3;
  return {
    positions,
    normals: positions,
    indices: Uint32Array.from(faces),
    featureOf: new Uint32Array(vertexCount),
    vertexCount,
    triangleCount: faces.length / 3,
    boundary: new Uint32Array(0),
    boundaryCount: 0,
    overlap: 0,
  };
}
