/**
 * Globe coordinates (backlog GEO8, ADR-028): where a longitude and latitude are on the sphere that
 * a `'globe3d'` subplot draws, and the rotation that turns that sphere to a view.
 *
 * Globe coordinates are the unit sphere with `x = cos φ sin λ`, `y = sin φ`, `z = cos φ cos λ`:
 * longitude 0 on the equator is at `(0, 0, 1)`, facing the viewer, east is `+x` and north is `+y`.
 * Seen from outside, a ring that runs counter-clockwise in longitude and latitude (east to the
 * right, north up) runs counter-clockwise on the sphere too.
 *
 * This module is part of the package's initial code, because `GeoSubplot.globeMatrix` needs the
 * rotation before the globe's lazy chunk (`globe/index.ts`) has loaded. Keep it this small.
 */
import type { Matrix4 } from 'three';

const RADIANS = Math.PI / 180;

/** A `projection.rotation`, in degrees. */
export interface GlobeRotation {
  readonly lon: number;
  readonly lat: number;
  readonly roll: number;
}

/**
 * Write the globe coordinates of a longitude and latitude (degrees), on a sphere of `radius`, to
 * `out[offset]`, `out[offset + 1]` and `out[offset + 2]`. Returns `out`.
 */
export function globePoint<T extends { [index: number]: number }>(
  lon: number,
  lat: number,
  radius: number,
  out: T,
  offset = 0,
): T {
  const lambda = lon * RADIANS;
  const phi = lat * RADIANS;
  const r = radius * Math.cos(phi);
  out[offset] = r * Math.sin(lambda);
  out[offset + 1] = radius * Math.sin(phi);
  out[offset + 2] = r * Math.cos(lambda);
  return out;
}

/**
 * The rotation `d3` applies for `projection.rotation` (`geoRotation([-lon, -lat, roll])`), as a
 * matrix on globe coordinates: the point at the rotation's `lon` and `lat` goes to `(0, 0, 1)`, in
 * front of the viewer, and `roll` turns the globe about the line of sight. After it, `x` and `y`
 * are what `d3`'s orthographic projection draws (`y` up) and `z` points at the viewer, so the near
 * hemisphere is `z > 0`.
 *
 * It is `d3`'s three steps in its order: about the polar axis by `-lon`, about the screen's x axis
 * by `-lat`, about the line of sight by `roll`.
 */
export function globeRotation(rotation: GlobeRotation, out: Matrix4): Matrix4 {
  const lambda = -rotation.lon * RADIANS;
  const phi = -rotation.lat * RADIANS;
  const gamma = rotation.roll * RADIANS;
  const cl = Math.cos(lambda);
  const sl = Math.sin(lambda);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const cg = Math.cos(gamma);
  const sg = Math.sin(gamma);
  return out.set(
    cg * cl + sg * sp * sl,
    -sg * cp,
    cg * sl - sg * sp * cl,
    0,
    sg * cl - cg * sp * sl,
    cg * cp,
    sg * sl + cg * sp * cl,
    0,
    -cp * sl,
    -sp,
    cp * cl,
    0,
    0,
    0,
    0,
    1,
  );
}
