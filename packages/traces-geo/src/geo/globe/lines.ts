/**
 * Lines on the globe (backlog GEO8, ADR-028), in the layout of render's `Line3D` (`x`, `y`, `z`
 * and the start vertex of every polyline after the first), in globe coordinates:
 *
 * - {@link buildSphereLines}: the lines of a geometry (coastlines, borders, the graticule, the
 *   outline of a region) on a sphere, each segment split along its great arc;
 * - {@link buildArcs}: the lines of a `scattergeo` trace, which rise above the surface between
 *   their points, the higher the longer.
 *
 * Nothing is cut at the antimeridian: on a sphere a line that crosses ±180° just goes on.
 */
import type { GeoFeatureCollectionInput, GeoFeatureInput, GeoInput } from '../sink.ts';
import { alongArc, angleBetween, arcSteps, positive, toSphere, type Vec3 } from './sphere.ts';

/** Polylines in 3D, in the layout of render's `Line3D`. */
export interface SphereLines {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  /** The start vertex of every polyline after the first. */
  starts: Uint32Array;
  vertexCount: number;
  /** The number of polylines. */
  lineCount: number;
}

/** Options of {@link buildSphereLines}. */
export interface SphereLinesOptions {
  /** The longest piece of a segment, in degrees of arc. Default 2.5. */
  readonly densify?: number;
  /**
   * The radius of the sphere the lines lie on. Default 1; a little more keeps a line clear of
   * the facets of a mesh under it.
   */
  readonly radius?: number;
}

/** Options of {@link buildArcs}. */
export interface ArcsOptions {
  /**
   * How high a segment rises in its middle, in globe radii per radian of its length. Default
   * {@link DEFAULT_LIFT}; 0 keeps the line on the surface.
   */
  readonly lift?: number;
  /** The longest piece of a segment, in degrees of arc. Default 2.5. */
  readonly densify?: number;
  /** Join the points on either side of a missing one. Default false: the line breaks there. */
  readonly connectgaps?: boolean;
  /** The radius of the sphere the lines start and end on. Default 1. */
  readonly radius?: number;
}

/**
 * The default {@link ArcsOptions.lift}: a segment's height in its middle is 0.15 of its length.
 * A transatlantic route (New York to London, 50°) then peaks at 0.13 radii, clear of the surface
 * from any side and still a route more than a jump, and a route to the antipodes at 0.47 radii,
 * inside the radius of headroom the globe's camera keeps above the surface (which a lift above
 * 1 / π would leave). Every arc leaves the surface at the same angle, 25°, whatever its length:
 * arcs of different lengths are the same shape at different sizes.
 */
export const DEFAULT_LIFT = 0.15;

/**
 * How far the straight pieces of a lifted arc may be from its curve, in globe radii (0.6 px on a
 * globe 300 px in radius): a short high arc gets more pieces than `densify` alone gives it.
 */
const LIFT_TOLERANCE = 0.002;

/** Collects polylines; a polyline of fewer than two vertices is dropped. */
class LineBuilder {
  #x: number[] = [];
  #y: number[] = [];
  #z: number[] = [];
  #starts: number[] = [];
  #lineStart = 0;
  #lines = 0;

  /** Append a point of the unit sphere, drawn at `radius`. */
  add(p: Readonly<Vec3>, radius: number): void {
    this.#x.push(p[0] * radius);
    this.#y.push(p[1] * radius);
    this.#z.push(p[2] * radius);
  }

  /** End the polyline under way, if any. */
  end(): void {
    const n = this.#x.length;
    if (n - this.#lineStart < 2) {
      this.#x.length = this.#y.length = this.#z.length = this.#lineStart;
      return;
    }
    if (this.#lines > 0) this.#starts.push(this.#lineStart);
    this.#lines++;
    this.#lineStart = n;
  }

  finish(): SphereLines {
    this.end();
    return {
      x: Float32Array.from(this.#x),
      y: Float32Array.from(this.#y),
      z: Float32Array.from(this.#z),
      starts: Uint32Array.from(this.#starts),
      vertexCount: this.#x.length,
      lineCount: this.#lines,
    };
  }
}

const A: Vec3 = [0, 0, 0];
const B: Vec3 = [0, 0, 0];
const P: Vec3 = [0, 0, 0];
const Q: Vec3 = [0, 0, 0];

/**
 * A point a quarter turn from `a`, to go by on the way to its antipode, which no one arc leads
 * to: towards the north pole, or towards longitude 0 on the equator when `a` is a pole.
 */
function quarterTurnFrom(a: Readonly<Vec3>, out: Vec3): Vec3 {
  // The pole (or the point on the equator) less its part along `a`, at unit length.
  const ty = Math.abs(a[1]) > 1 - 1e-9 ? 0 : 1;
  const tz = 1 - ty;
  const along = a[1] * ty + a[2] * tz;
  const x = -along * a[0];
  const y = ty - along * a[1];
  const z = tz - along * a[2];
  const length = Math.hypot(x, y, z);
  out[0] = x / length;
  out[1] = y / length;
  out[2] = z / length;
  return out;
}

/**
 * The point a fraction `t` of the way from `a` to `b`, `angle` radians apart, along their great
 * arc; between antipodes, along the half circle through {@link quarterTurnFrom} of `a`.
 */
function along(a: Readonly<Vec3>, b: Readonly<Vec3>, angle: number, t: number, out: Vec3): Vec3 {
  if (angle > Math.PI - 1e-6) {
    quarterTurnFrom(a, Q);
    const c = Math.cos(t * Math.PI);
    const s = Math.sin(t * Math.PI);
    out[0] = c * a[0] + s * Q[0];
    out[1] = c * a[1] + s * Q[1];
    out[2] = c * a[2] + s * Q[2];
    return out;
  }
  return alongArc(a, b, angle, t, out);
}

/** Append the path of `coordinates` (`[lon, lat]` in degrees), split along its great arcs. */
function addPath(
  builder: LineBuilder,
  coordinates: readonly (readonly number[])[],
  closed: boolean,
  densify: number,
  radius: number,
): void {
  const count = coordinates.length;
  let open = false;
  // A closed path (a ring) returns to its first point, unless it already ends there.
  const total = closed && count > 0 ? count + 1 : count;
  for (let i = 0; i < total; i++) {
    const at = coordinates[i % count] as readonly number[];
    const lon = at[0] as number;
    const lat = at[1] as number;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      // A point that is nowhere: the line stops and starts again after it.
      builder.end();
      open = false;
      continue;
    }
    toSphere(lon, lat, B);
    if (open) {
      const angle = angleBetween(A, B);
      // The same point again adds nothing (a ring that repeats its first point at its end).
      if (angle === 0) continue;
      const steps = arcSteps(angle, densify);
      for (let k = 1; k < steps; k++) builder.add(along(A, B, angle, k / steps, P), radius);
    }
    builder.add(B, radius);
    A[0] = B[0];
    A[1] = B[1];
    A[2] = B[2];
    open = true;
  }
  builder.end();
}

type Coordinates = readonly (readonly number[])[];

interface Geometry {
  readonly type: string;
  readonly coordinates?: unknown;
  readonly geometries?: readonly Geometry[];
}

function addGeometry(
  builder: LineBuilder,
  geometry: Geometry | null | undefined,
  densify: number,
  radius: number,
): void {
  if (!geometry) return;
  const c = geometry.coordinates;
  switch (geometry.type) {
    case 'LineString':
      addPath(builder, c as Coordinates, false, densify, radius);
      break;
    case 'MultiLineString':
      for (const line of c as Coordinates[]) addPath(builder, line, false, densify, radius);
      break;
    case 'Polygon':
      for (const ring of c as Coordinates[]) addPath(builder, ring, true, densify, radius);
      break;
    case 'MultiPolygon':
      for (const polygon of c as Coordinates[][]) {
        for (const ring of polygon) addPath(builder, ring, true, densify, radius);
      }
      break;
    case 'GeometryCollection':
      for (const member of geometry.geometries ?? []) addGeometry(builder, member, densify, radius);
      break;
    default:
    // Points have no lines, and neither has the sphere.
  }
}

/**
 * The lines of `input` on a sphere: `LineString` and `MultiLineString` geometries as open
 * polylines and the rings of `Polygon` and `MultiPolygon` geometries as closed ones, bare or in a
 * feature, a collection or an array of features. Coordinates are in degrees. Every segment
 * follows its great arc in pieces of at most `densify` degrees; a segment between antipodes,
 * which has no one arc, goes over the north pole. A point that is not finite breaks its line.
 */
export function buildSphereLines(input: GeoInput, options: SphereLinesOptions = {}): SphereLines {
  const densify = positive(options.densify, 2.5);
  const radius = positive(options.radius, 1);
  const builder = new LineBuilder();
  const object = input as GeoFeatureCollectionInput | GeoFeatureInput | Geometry;
  const features = Array.isArray(input)
    ? (input as readonly GeoFeatureInput[])
    : object.type === 'FeatureCollection'
      ? (object as GeoFeatureCollectionInput).features
      : undefined;
  if (features) {
    for (const feature of features) {
      addGeometry(builder, feature.geometry as Geometry | null, densify, radius);
    }
  } else if (object.type === 'Feature') {
    addGeometry(builder, (object as GeoFeatureInput).geometry as Geometry | null, densify, radius);
  } else addGeometry(builder, object as Geometry, densify, radius);
  return builder.finish();
}

/**
 * The lines of a `scattergeo` trace on the globe: consecutive points (`lon`, `lat` in degrees)
 * joined along their great circle, each segment lifted above the surface. A segment starts and
 * ends on the surface and is highest in the middle, by `sin` of the way along it, and its height
 * there is `lift` × its length in radians: a short hop stays low and a long route stands clear
 * of the globe (GEO8: "arcs lifted above it by their length"). See {@link DEFAULT_LIFT}.
 *
 * A point that is not finite breaks the line, or is skipped with `connectgaps`. A lifted segment
 * has an even number of pieces, so its highest point is a vertex.
 */
export function buildArcs(
  lon: ArrayLike<number>,
  lat: ArrayLike<number>,
  options: ArcsOptions = {},
): SphereLines {
  const lift = Math.max(0, options.lift ?? DEFAULT_LIFT) || 0;
  const densify = positive(options.densify, 2.5);
  const radius = positive(options.radius, 1);
  const connect = options.connectgaps === true;
  const builder = new LineBuilder();
  const count = Math.min(lon.length, lat.length);
  let open = false;
  for (let i = 0; i < count; i++) {
    const x = lon[i] as number;
    const y = lat[i] as number;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (!connect) {
        builder.end();
        open = false;
      }
      continue;
    }
    toSphere(x, y, B);
    if (open) {
      const angle = angleBetween(A, B);
      if (angle === 0) continue;
      const height = lift * angle;
      // Enough pieces for the arc on the sphere, and for the rise above it.
      let steps = Math.max(
        arcSteps(angle, densify),
        Math.ceil(Math.PI * Math.sqrt(height / (8 * LIFT_TOLERANCE))),
      );
      if (height > 0 && steps % 2 === 1) steps++;
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        builder.add(along(A, B, angle, t, P), radius * (1 + height * Math.sin(Math.PI * t)));
      }
    }
    builder.add(B, radius);
    A[0] = B[0];
    A[1] = B[1];
    A[2] = B[2];
    open = true;
  }
  return builder.finish();
}
