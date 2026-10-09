/**
 * Geometry steps of the basemap build, pure: winding for `d3-geo`, snapping to the quantization
 * grid, and a label point inside a polygon.
 *
 * Positions are `[lon, lat]` in degrees until they are snapped; after that they are grid indices
 * `[i, j]` with `lon = i * 360 / n - 180` and `lat = j * 180 / n - 90`.
 */
import { geoArea, geoContains, geoDistance } from 'd3-geo';
import type { MultiPolygon, Polygon, Position } from 'geojson';

export type Ring = Position[];

const TAU = 2 * Math.PI;

/** Mean Earth radius in km, to state a displacement as a distance. */
const EARTH_RADIUS_KM = 6371;

/** The polygons of a `Polygon` or `MultiPolygon`, each a list of rings. */
export function polygonsOf(geometry: Polygon | MultiPolygon): Ring[][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

/** Spherical area in steradians of the region `ring` encloses when it is a polygon's only ring. */
export function ringArea(ring: Ring): number {
  return geoArea({ type: 'Polygon', coordinates: [ring] });
}

/**
 * `polygon` with every ring wound for `d3-geo`: the outer ring encloses less than a hemisphere
 * and each hole, on its own, more. RFC 7946 winds the other way, and a polygon wound that way is
 * the whole globe except itself (backlog GEO5).
 */
export function windForD3(polygon: Ring[]): Ring[] {
  return polygon.map((ring, index) => {
    const small = ringArea(ring) < TAU;
    return small === (index === 0) ? ring : ring.slice().reverse();
  });
}

/** Whether every ring of `polygon` is wound for `d3-geo` (see {@link windForD3}). */
export function isWoundForD3(polygon: Ring[]): boolean {
  return polygon.every((ring, index) => ringArea(ring) < TAU === (index === 0));
}

/**
 * How far apart, in degrees, the two sides of a cut along the antimeridian can be in Natural
 * Earth and still be one cut. Measured at 1:50m in Fiji, the one country it matters for: Taveuni
 * ends at -16.962988° on its eastern half and at -16.963086° on its western, and a vertex of
 * Vanua Levu's tip is at 179.999219°, not 180°. A hundred metres.
 */
export const ANTIMERIDIAN_TOLERANCE = 1e-3;

/**
 * `geometry` with its cuts along the antimeridian made exact, so that `geoStitch` can undo them:
 * it joins two halves only where a ring leaves the antimeridian at the very latitude at which
 * another arrives, and takes a vertex for one on the antimeridian only within 0.0001° of it.
 *
 * - A vertex within `tolerance` of ±180° is put on it.
 * - Latitudes of such vertices that are within `tolerance` of each other become one latitude.
 * - A ring that starts on the antimeridian is turned to start elsewhere, when it has a vertex
 *   elsewhere: the run of a cut then lies inside the ring, not around its ends.
 *
 * Rings that do not come near the antimeridian are returned as they are.
 */
export function alignAntimeridian(
  geometry: MultiPolygon,
  tolerance = ANTIMERIDIAN_TOLERANCE,
): MultiPolygon {
  const onCut = (position: Position): boolean => Math.abs(position[0] ?? 0) >= 180 - tolerance;
  // Latitudes at which the geometry meets the antimeridian, each mapped to the one that stands
  // for those near it.
  const latitudes: number[] = [];
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      for (const position of ring) if (onCut(position)) latitudes.push(position[1] ?? 0);
    }
  }
  if (latitudes.length === 0) return geometry;
  latitudes.sort((a, b) => a - b);
  const aligned = new Map<number, number>();
  let standsFor = latitudes[0] as number;
  let previous = standsFor;
  for (const latitude of latitudes) {
    if (latitude - previous > tolerance) standsFor = latitude;
    aligned.set(latitude, standsFor);
    previous = latitude;
  }
  const coordinates = geometry.coordinates.map((polygon) =>
    polygon.map((ring) => {
      if (!ring.some(onCut)) return ring;
      const moved = ring.map((position): Position => {
        if (!onCut(position)) return position;
        const [lon = 0, lat = 0] = position;
        return [lon < 0 ? -180 : 180, aligned.get(lat) ?? lat, ...position.slice(2)];
      });
      // A closed ring repeats its first position at the end: turn it without the repeat.
      const start = moved.findIndex((position) => !onCut(position));
      if (start <= 0) return moved;
      const open = moved.slice(0, -1);
      const turned = [...open.slice(start), ...open.slice(0, start)];
      turned.push(turned[0] as Position);
      return turned;
    }),
  );
  return { type: 'MultiPolygon', coordinates };
}

/** The grid point nearest to `position`, as indices. */
export function toGrid(position: Position, n: number): [number, number] {
  const [lon = 0, lat = 0] = position;
  return [Math.round(((lon + 180) / 360) * n), Math.round(((lat + 90) / 180) * n)];
}

/** The position of a grid point, as the decoded TopoJSON has it. */
export function fromGrid(point: Position, n: number): [number, number] {
  const [i = 0, j = 0] = point;
  return [i * (360 / n) - 180, j * (180 / n) - 90];
}

/** Records how far snapping moved the vertices. */
export interface Displacement {
  /** The largest distance between a vertex and its grid point, in km. */
  maxKm: number;
}

/** `positions` on the grid, without consecutive repeats. */
function snapPositions(positions: Position[], n: number, moved: Displacement): Position[] {
  const out: Position[] = [];
  let last: [number, number] | undefined;
  for (const position of positions) {
    const point = toGrid(position, n);
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    const km = geoDistance(position as [number, number], fromGrid(point, n)) * EARTH_RADIUS_KM;
    if (km > moved.maxKm) moved.maxKm = km;
    out.push(point);
    last = point;
  }
  return out;
}

/** A line on the grid, or `undefined` when all of it falls on one grid point. */
export function snapLine(line: Position[], n: number, moved: Displacement): Position[] | undefined {
  const out = snapPositions(line, n, moved);
  return out.length < 2 ? undefined : out;
}

/**
 * A ring on the grid, or `undefined` when it collapses there: fewer than three grid points, or
 * all of them on one line. Longitude differences are taken the short way round, since a ring may
 * cross the antimeridian once the cuts are stitched.
 */
export function snapRing(ring: Ring, n: number, moved: Displacement): Ring | undefined {
  const out = snapPositions(ring, n, moved);
  const first = out[0];
  const last = out[out.length - 1];
  if (!first || !last) return undefined;
  if (first[0] !== last[0] || first[1] !== last[1]) out.push(first);
  if (out.length < 4) return undefined;
  const short = (d: number): number => (d > n / 2 ? d - n : d < -n / 2 ? d + n : d);
  for (let k = 2; k < out.length; k++) {
    const a = out[k - 2] as Position;
    const b = out[k - 1] as Position;
    const c = out[k] as Position;
    const cross =
      short((b[0] ?? 0) - (a[0] ?? 0)) * ((c[1] ?? 0) - (b[1] ?? 0)) -
      ((b[1] ?? 0) - (a[1] ?? 0)) * short((c[0] ?? 0) - (b[0] ?? 0));
    if (cross !== 0) return out;
  }
  return undefined;
}

/**
 * A polygon on the grid, or `undefined` when its outer ring collapses there. Holes that collapse
 * are dropped.
 */
export function snapPolygon(polygon: Ring[], n: number, moved: Displacement): Ring[] | undefined {
  const [outer, ...holes] = polygon;
  const snapped = outer && snapRing(outer, n, moved);
  if (!snapped) return undefined;
  const out = [snapped];
  for (const hole of holes) {
    const ring = snapRing(hole, n, moved);
    if (ring) out.push(ring);
  }
  return out;
}

/**
 * Whether `[x, y]` is inside `polygon` in the plane (even-odd over all its rings). Right for a
 * polygon as Natural Earth has it, cut at the antimeridian, and far cheaper than `geoContains`.
 */
export function planarContains(polygon: Ring[], x: number, y: number): boolean {
  let inside = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi = 0, yi = 0] = ring[i] as Position;
      const [xj = 0, yj = 0] = ring[j] as Position;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Squared distance in the plane from `[x, y]` to the nearest edge of `polygon`, with x scaled by `kx`. */
function planarEdgeDistance2(polygon: Ring[], x: number, y: number, kx: number): number {
  let best = Infinity;
  for (const ring of polygon) {
    for (let i = 1; i < ring.length; i++) {
      const [x0 = 0, y0 = 0] = ring[i - 1] as Position;
      const [x1 = 0, y1 = 0] = ring[i] as Position;
      const dx = (x1 - x0) * kx;
      const dy = y1 - y0;
      const px = (x - x0) * kx;
      const py = y - y0;
      const length2 = dx * dx + dy * dy;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / length2));
      const d2 = (px - t * dx) ** 2 + (py - t * dy) ** 2;
      if (d2 < best) best = d2;
    }
  }
  return best;
}

/**
 * A point well inside `polygon`: of a grid of candidates over its bounding box, the one farthest
 * from the boundary (a coarse pole of inaccessibility). The grid is refined until a candidate
 * falls inside, so a sliver gets a point too.
 */
function interiorPoint(polygon: Ring[]): [number, number] | undefined {
  const outer = polygon[0];
  if (!outer) return undefined;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x = 0, y = 0] of outer) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  // A ring that crosses the antimeridian has no planar bounding box; such polygons are large and
  // Natural Earth's own label point is inside them, so the search is not needed there.
  if (x1 - x0 > 180) return undefined;
  const kx = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  for (let cells = 32; cells <= 512; cells *= 2) {
    let best: [number, number] | undefined;
    let bestDistance = -1;
    for (let i = 0; i < cells; i++) {
      const x = x0 + ((i + 0.5) / cells) * (x1 - x0);
      for (let j = 0; j < cells; j++) {
        const y = y0 + ((j + 0.5) / cells) * (y1 - y0);
        if (!planarContains(polygon, x, y)) continue;
        const distance = planarEdgeDistance2(polygon, x, y, kx);
        if (distance > bestDistance) {
          bestDistance = distance;
          best = [x, y];
        }
      }
    }
    if (best) return best;
  }
  return undefined;
}

/** `point` with the fewest decimals (two to six) that keep it inside `geometry`. */
function roundInside(
  geometry: Polygon | MultiPolygon,
  point: readonly [number, number],
): [number, number] | undefined {
  for (let digits = 2; digits <= 6; digits++) {
    const rounded: [number, number] = [+point[0].toFixed(digits), +point[1].toFixed(digits)];
    if (geoContains(geometry, rounded)) return rounded;
  }
  return undefined;
}

/**
 * A point inside `geometry` to label it at: `hint` (Natural Earth's label point) when it lies
 * inside, else a point well inside the largest polygon. Natural Earth places its label points on
 * the 1:10m shapes, so a small island generalized or snapped to the grid can miss its own.
 * Returns `undefined` when no point is found (the caller treats that as a build error).
 */
export function labelPoint(
  geometry: Polygon | MultiPolygon,
  hint?: readonly [number, number],
): [number, number] | undefined {
  if (hint && Number.isFinite(hint[0]) && Number.isFinite(hint[1])) {
    const rounded = roundInside(geometry, hint);
    if (rounded) return rounded;
  }
  const bySize = polygonsOf(geometry)
    .map((polygon) => ({ polygon, area: geoArea({ type: 'Polygon', coordinates: polygon }) }))
    .sort((a, b) => b.area - a.area);
  for (const { polygon } of bySize) {
    const point = interiorPoint(polygon);
    const rounded = point && roundInside(geometry, point);
    if (rounded) return rounded;
  }
  return undefined;
}
