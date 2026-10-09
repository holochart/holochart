/**
 * Polygons made ready to be triangulated in a chart's plane (backlog GEO8, ADR-028): placed in
 * the chart, cut where the chart is torn, and with their edges split along the great arcs they
 * stand for.
 *
 * **The cut.** The basemap's polygons are stitched across ±180°, which is what a sphere wants
 * and what a triangulation in longitude and latitude cannot take: Russia and Fiji would be bands
 * across the whole map (spike F). `d3`'s antimeridian clip does the cutting for the flat chart:
 * every polygon is streamed once through an unrotated equirectangular projection whose px are
 * degrees, into the package's stream sink, which also groups the rings (`sink.ts`). A polygon
 * that crossed the antimeridian comes out as two or more, each with an edge along +180° or
 * −180°. One that reaches both poles, which no polar chart can take, comes out with an edge
 * along ±90°, which on the sphere is a point. A polar chart has no tear inside the polygons it
 * is given, so those are taken as they are.
 *
 * **The edges.** A polygon's edge is a great arc, and a triangulation in a plane takes it for a
 * straight line there. Splitting every edge to at most `densify` degrees of arc makes the two
 * agree to the sagitta of such a piece. The points are computed on the sphere from the edge's
 * two ends in a fixed order, so two regions that share an edge split it at the same points, bit
 * for bit, whichever way round each runs it and whichever chart each is in.
 */
import { geoEquirectangular, type GeoProjection } from 'd3-geo';
import { FLAT, type Chart } from './chart.ts';
import { globeDeps } from './deps.ts';
import {
  alongArc,
  angleBetween,
  arcSteps,
  DEGREES,
  FloatBuffer,
  IndexBuffer,
  type Vec3,
} from './sphere.ts';

/** One polygon of the input: its rings (`[lon, lat]` in degrees) and the feature it is of. */
export interface SourcePolygon {
  readonly coordinates: readonly (readonly (readonly number[])[])[];
  readonly feature: number;
}

/**
 * Polygons in a chart's plane, in the layout of render's `FillGeometryInput`: `rings` has the
 * start vertex of each ring, `polygons` the first ring of each polygon (its outer ring, then its
 * holes). An outer ring runs clockwise and a hole counter-clockwise (`d3`'s winding), so the
 * region is on the right of every ring. In the flat chart a longitude of ±180° and a latitude of
 * ±90° are exact.
 */
export interface PlanePolygons {
  readonly chart: Chart;
  /** Plane coordinates of each vertex. */
  u: Float64Array;
  v: Float64Array;
  /** The vertex on the unit sphere: x, y, z. */
  xyz: Float64Array;
  vertexCount: number;
  rings: Uint32Array;
  ringCount: number;
  polygons: Uint32Array;
  polygonCount: number;
  /** For each polygon, the index of the feature it came from. */
  featureOf: Uint32Array;
}

/** A value within this of ±180° or ±90° is that value: d3's px are degrees to a rounding error. */
const SNAP = 1e-9;

function snap(value: number, limit: number): number {
  if (value >= limit - SNAP) return limit;
  return value <= SNAP - limit ? -limit : value;
}

/** Whether an edge of the flat chart lies on a pole: a point of the sphere. */
export function isPoleEdge(latA: number, latB: number): boolean {
  return latA === latB && (latA === 90 || latA === -90);
}

/** Rings being collected: plane coordinates, sphere positions and ring starts. */
class RingBuilder {
  readonly u: FloatBuffer;
  readonly v: FloatBuffer;
  readonly xyz: FloatBuffer;
  readonly rings: IndexBuffer;

  constructor(capacity: number) {
    this.u = new FloatBuffer(capacity);
    this.v = new FloatBuffer(capacity);
    this.xyz = new FloatBuffer(capacity * 3);
    this.rings = new IndexBuffer(64);
  }

  add(u: number, v: number, p: Readonly<Vec3>): void {
    this.u.push(u);
    this.v.push(v);
    this.xyz.push(p[0]);
    this.xyz.push(p[1]);
    this.xyz.push(p[2]);
  }
}

const A: Vec3 = [0, 0, 0];
const B: Vec3 = [0, 0, 0];
const P: Vec3 = [0, 0, 0];
const UV: [number, number] = [0, 0];

/** Whether `a` comes before `b`, by x, then y, then z: the fixed order of an edge's two ends. */
function before(a: Readonly<Vec3>, b: Readonly<Vec3>): boolean {
  if (a[0] !== b[0]) return a[0] < b[0];
  if (a[1] !== b[1]) return a[1] < b[1];
  return a[2] < b[2];
}

/**
 * Append the points that split the edge from `a` to `b` into pieces of at most `step` degrees of
 * arc; the two ends are not appended. An edge between antipodes, which no one arc joins, is left
 * whole. In the flat chart an edge along a pole has no length and is left whole, and the points
 * of an edge along a meridian (the cut at ±180° among them) keep its longitude exactly, which is
 * how a cut edge is known later.
 */
function splitEdge(
  chart: Chart,
  uA: number,
  vA: number,
  a: Readonly<Vec3>,
  uB: number,
  vB: number,
  b: Readonly<Vec3>,
  step: number,
  out: RingBuilder,
): void {
  if (chart.flat) {
    if (isPoleEdge(vA, vB)) return;
    if (uA === uB) {
      const span = Math.abs(vB - vA);
      const steps = Math.max(1, Math.ceil(span / step - 1e-9));
      const up = vA < vB;
      const low = up ? vA : vB;
      for (let k = 1; k < steps; k++) {
        const lat = low + ((up ? k : steps - k) / steps) * span;
        out.add(uA, lat, chart.toSphere(uA, lat, P));
      }
      return;
    }
  }
  const swap = before(b, a);
  const first = swap ? b : a;
  const second = swap ? a : b;
  const angle = angleBetween(first, second);
  const steps = arcSteps(angle, step);
  if (steps < 2 || angle > Math.PI - 1e-6) return;
  const u0 = swap ? uB : uA;
  const u1 = swap ? uA : uB;
  for (let k = 1; k < steps; k++) {
    const t = (swap ? steps - k : k) / steps;
    alongArc(first, second, angle, t, P);
    chart.toPlane(P, u0 + t * (u1 - u0), UV);
    out.add(UV[0], UV[1], P);
  }
}

/**
 * Append ring `[a, b)` of plane vertices, with every edge split. `xyz` has the vertices on the
 * sphere when they are known; else the chart says where they are.
 */
function addRing(
  chart: Chart,
  u: ArrayLike<number>,
  v: ArrayLike<number>,
  xyz: ArrayLike<number> | undefined,
  a: number,
  b: number,
  step: number,
  out: RingBuilder,
): void {
  const at = (i: number, p: Vec3): Vec3 => {
    if (!xyz) return chart.toSphere(u[i] as number, v[i] as number, p);
    p[0] = xyz[3 * i] as number;
    p[1] = xyz[3 * i + 1] as number;
    p[2] = xyz[3 * i + 2] as number;
    return p;
  };
  out.rings.push(out.u.length);
  // The ring's vertices without those that repeat the one before them (or, at the end, the
  // first): data closes its rings with a copy of the first vertex that can be a rounding error
  // off it, and an edge of no length is a triangle of no area to the triangulation.
  kept.length = 0;
  for (let i = a; i < b; i++) {
    const last = kept.length > 0 ? (kept[kept.length - 1] as number) : -1;
    if (last >= 0 && same(u, v, last, i)) continue;
    kept.push(i);
  }
  while (kept.length > 1 && same(u, v, kept[0] as number, kept[kept.length - 1] as number)) {
    kept.pop();
  }
  // Too little left to enclose anything: the ring stays empty.
  if (kept.length < 3) return;
  for (let k = 0; k < kept.length; k++) {
    const i = kept[k] as number;
    const j = kept[(k + 1) % kept.length] as number;
    at(i, A);
    at(j, B);
    out.add(u[i] as number, v[i] as number, A);
    splitEdge(
      chart,
      u[i] as number,
      v[i] as number,
      A,
      u[j] as number,
      v[j] as number,
      B,
      step,
      out,
    );
  }
}

/** Two vertices closer than this, in degrees of the plane, are one. */
const SAME = 1e-9;
const kept: number[] = [];

function same(u: ArrayLike<number>, v: ArrayLike<number>, i: number, j: number): boolean {
  return (
    Math.abs((u[i] as number) - (u[j] as number)) < SAME &&
    Math.abs((v[i] as number) - (v[j] as number)) < SAME
  );
}

function finish(
  chart: Chart,
  out: RingBuilder,
  polygons: Uint32Array,
  featureOf: Uint32Array,
): PlanePolygons {
  return {
    chart,
    u: out.u.data,
    v: out.v.data,
    xyz: out.xyz.data,
    vertexCount: out.u.length,
    rings: out.rings.finish(),
    ringCount: out.rings.length,
    polygons,
    polygonCount: polygons.length,
    featureOf,
  };
}

let cutProjection: GeoProjection | undefined;

/**
 * `polygons` in the flat chart: cut at the antimeridian (and closed around a pole they hold),
 * then every edge split to at most `densify` degrees of arc. `precision(0)` turns d3's own
 * resampling off, so the vertices are the input's and the points where the cut crosses an edge.
 */
export function flatPolygons(polygons: readonly SourcePolygon[], densify: number): PlanePolygons {
  // Unrotated, a scale of one degree per px, and no translation: x is the longitude, and the
  // sink's y (up from a height of 0) the latitude.
  cutProjection ??= geoEquirectangular().scale(DEGREES).translate([0, 0]).precision(0);
  const features = polygons.map((polygon) => ({
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: polygon.coordinates as number[][][] },
  }));
  const cut = globeDeps().projectPolygons(cutProjection, 0, features);
  const { x, y, vertexCount, rings, ringCount } = cut;
  for (let i = 0; i < vertexCount; i++) {
    x[i] = snap(x[i] as number, 180);
    y[i] = snap(y[i] as number, 90);
  }
  const out = new RingBuilder(vertexCount * 2);
  for (let r = 0; r < ringCount; r++) {
    const end = r + 1 < ringCount ? (rings[r + 1] as number) : vertexCount;
    addRing(FLAT, x, y, undefined, rings[r] as number, end, densify, out);
  }
  // The sink numbers features by their place in the list it was given.
  const featureOf = new Uint32Array(cut.polygonCount);
  for (let p = 0; p < cut.polygonCount; p++) {
    featureOf[p] = (polygons[cut.featureOf?.[p] ?? 0] as SourcePolygon).feature;
  }
  return finish(FLAT, out, cut.polygons.slice(0, cut.polygonCount), featureOf);
}

/**
 * `polygons` in a polar chart, every edge split to at most `densify` degrees of arc. Nothing is
 * cut: the rings are the input's, without the vertex that closes them and without repeats; a
 * ring with fewer than three vertices left is dropped, and with an outer ring its polygon.
 */
export function polarPolygons(
  polygons: readonly SourcePolygon[],
  chart: Chart,
  densify: number,
): PlanePolygons {
  const out = new RingBuilder(1024);
  const starts = new IndexBuffer(polygons.length);
  const features = new IndexBuffer(polygons.length);
  const u: number[] = [];
  const v: number[] = [];
  const xyz: number[] = [];
  for (const polygon of polygons) {
    let outer = true;
    for (const ring of polygon.coordinates) {
      u.length = v.length = xyz.length = 0;
      for (const at of ring) {
        const lon = at[0] as number;
        const lat = at[1] as number;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        chart.toPlane(FLAT.toSphere(lon, lat, P), 0, UV);
        u.push(UV[0]);
        v.push(UV[1]);
        xyz.push(P[0], P[1], P[2]);
      }
      const before = out.u.length;
      const ringsBefore = out.rings.length;
      addRing(chart, u, v, xyz, 0, u.length, densify, out);
      if (out.u.length === before) {
        // Nothing of the ring was left: it is no ring, and without an outer ring no polygon.
        out.rings.length = ringsBefore;
        if (outer) break;
        continue;
      }
      if (outer) {
        starts.push(ringsBefore);
        features.push(polygon.feature);
        outer = false;
      }
    }
  }
  return finish(chart, out, starts.finish(), features.finish());
}
