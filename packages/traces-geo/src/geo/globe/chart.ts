/**
 * The planes the globe's polygons are triangulated in (backlog GEO8). A triangulation needs a
 * plane, and no one plane shows the whole sphere without a tear: so there are three **charts**,
 * and each polygon is triangulated in the one that has no tear inside it.
 *
 * - {@link FLAT}: the plane of longitude and latitude, in degrees. It is torn along the
 *   antimeridian, where `d3` cuts the polygons (`cut.ts`), and each pole is a whole edge of it.
 *   Good for everything that stays clear of the poles, which is nearly everything.
 * - {@link NORTH} and {@link SOUTH}: the azimuthal equidistant plane about a pole, in degrees
 *   from it. The pole is an ordinary point there and the antimeridian an ordinary line; the tear
 *   is the other pole. A polygon that holds a pole, or comes near one, is triangulated here.
 *
 * In the plane of longitude and latitude a triangle with a corner on a pole's edge is not the
 * triangle its corners span on the sphere, however small it is: every longitude of that edge is
 * the same point, so the fan of triangles about one of its vertices does not turn about the pole
 * the way it turns in the plane. A third of the triangles of a polar cap triangulated there lie
 * the wrong way round. That is what the polar charts are for.
 *
 * Every chart keeps the sense of rotation: what runs clockwise seen from outside the sphere runs
 * clockwise in the plane, with the first coordinate to the right and the second up.
 */
import { DEGREES, latitudeOf, longitudeOf, RADIANS, type Vec3 } from './sphere.ts';

export interface Chart {
  /** {@link FLAT}: polygons are cut at the antimeridian, and its edges have kinds (`cut.ts`). */
  readonly flat: boolean;
  /**
   * The plane coordinates of a point of the unit sphere, written to `out`. In {@link FLAT} the
   * longitude is the one within 180° of `near` (a ring stays on its side of the antimeridian).
   */
  toPlane(p: Readonly<Vec3>, near: number, out: [number, number]): [number, number];
  /** The point of the unit sphere at plane coordinates. */
  toSphere(u: number, v: number, out: Vec3): Vec3;
}

export const FLAT: Chart = {
  flat: true,
  toPlane(p, near, out) {
    out[0] = Math.max(-180, Math.min(180, longitudeOf(p, near)));
    out[1] = latitudeOf(p);
    return out;
  },
  toSphere(u, v, out) {
    const lambda = u * RADIANS;
    const phi = v * RADIANS;
    const c = Math.cos(phi);
    out[0] = c * Math.sin(lambda);
    out[1] = Math.sin(phi);
    out[2] = c * Math.cos(lambda);
    return out;
  },
};

/**
 * The azimuthal equidistant chart about the pole at latitude `side` × 90°: a point `r` degrees
 * from the pole, at longitude λ, is at `(r cos λ, side × r sin λ)`. Seen from above its pole,
 * longitude runs counter-clockwise in the north and clockwise in the south.
 */
function polar(side: 1 | -1): Chart {
  return {
    flat: false,
    toPlane(p, _near, out) {
      const h = Math.hypot(p[0], p[2]);
      if (h === 0) {
        out[0] = out[1] = 0;
        return out;
      }
      const r = Math.atan2(h, side * p[1]) * DEGREES;
      out[0] = (r * p[2]) / h;
      out[1] = (side * r * p[0]) / h;
      return out;
    },
    toSphere(u, v, out) {
      const r = Math.hypot(u, v);
      if (r === 0) {
        out[0] = out[2] = 0;
        out[1] = side;
        return out;
      }
      const s = Math.sin(r * RADIANS);
      out[0] = (s * side * v) / r;
      out[1] = side * Math.cos(r * RADIANS);
      out[2] = (s * u) / r;
      return out;
    },
  };
}

export const NORTH: Chart = polar(1);
export const SOUTH: Chart = polar(-1);

/**
 * A polygon that holds no pole is still triangulated about one that its outer ring comes this
 * near to, in degrees.
 */
export const POLAR_MARGIN = 5;
/** … when it stays within this of that pole; further out the flat chart serves it better. */
export const POLAR_NEAR_REACH = 120;
/**
 * A polygon that holds a pole is triangulated about it when it stays within this of it, in
 * degrees: the polar chart tears at the other pole, and stretches towards it (5 times at 150°,
 * 17 times at 170°, so such a polygon gets as many more triangles out there).
 */
export const POLAR_REACH = 170;

/**
 * The chart for a polygon whose outer ring is `ring` (`[lon, lat]` in degrees, wound for d3):
 *
 * - the chart of the pole it **holds**, when all of it is within {@link POLAR_REACH} of that
 *   pole;
 * - else the chart of a pole it comes within {@link POLAR_MARGIN} of, when all of it is within
 *   {@link POLAR_NEAR_REACH} of that pole (the flat chart has no tear in such a polygon, only
 *   very wide triangles for what they cover), and the ring runs clockwise as an outer ring does;
 * - else {@link FLAT}.
 *
 * So a polygon that holds both poles, or holds one and reaches the other, is left to the flat
 * chart, with the fans about its poles as they come out (`SphereMesh.overlap` says how much of
 * it is covered more than once).
 *
 * A ring holds a pole when it goes once around the axis. d3's rings have their inside on the
 * right: one that goes around eastwards holds the south pole, one that goes westwards the north.
 */
export function chartOf(ring: readonly (readonly number[])[]): Chart {
  let around = 0;
  let north = -Infinity;
  let south = Infinity;
  const count = ring.length;
  for (let i = 0; i < count; i++) {
    const at = ring[i] as readonly number[];
    const next = ring[(i + 1) % count] as readonly number[];
    const lat = at[1] as number;
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    const step = (next[0] as number) - (at[0] as number);
    // The short way round from one vertex to the next.
    around += step - 360 * Math.round(step / 360);
  }
  // How far the ring reaches from the north pole, and from the south.
  const fromNorth = 90 - south;
  const fromSouth = north + 90;
  if (around < -180) return fromNorth <= POLAR_REACH ? NORTH : FLAT;
  if (around > 180) return fromSouth <= POLAR_REACH ? SOUTH : FLAT;
  const nearNorth = 90 - north < POLAR_MARGIN && fromNorth <= POLAR_NEAR_REACH;
  const nearSouth = south + 90 < POLAR_MARGIN && fromSouth <= POLAR_NEAR_REACH;
  const side = nearNorth ? 1 : nearSouth ? -1 : 0;
  // A ring that runs counter-clockwise means everything outside it (d3's winding), which holds
  // both poles: the flat chart's.
  return side !== 0 && runsClockwise(ring, side) ? (side === 1 ? NORTH : SOUTH) : FLAT;
}

/** Whether `ring` runs clockwise in the chart about the pole on `side`, as an outer ring does. */
function runsClockwise(ring: readonly (readonly number[])[], side: number): boolean {
  let twice = 0;
  let u0 = 0;
  let v0 = 0;
  for (let i = 0; i <= ring.length; i++) {
    const at = ring[i % ring.length] as readonly number[];
    const r = 90 - side * (at[1] as number);
    const u = r * Math.cos((at[0] as number) * RADIANS);
    const v = side * r * Math.sin((at[0] as number) * RADIANS);
    if (i > 0) twice += u0 * v - u * v0;
    u0 = u;
    v0 = v;
  }
  return twice < 0;
}
