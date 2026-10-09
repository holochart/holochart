/**
 * Plotly's `layout.geo.scope` on a world topology. Plotly ships one file per scope, built by
 * sane-topojson: the countries of a continent (Natural Earth's `CONTINENT`) or the United
 * States, clipped to a bounding box, with land, lakes, rivers and subunits clipped to those
 * countries. Holochart ships the world once per resolution and picks a scope's part here:
 *
 * - countries by the continent code `tools/geo-data` gives each (`c`), `usa` by its id;
 * - of those, the polygons that reach into the scope's box, whole. France in `europe` is then
 *   France without French Guiana, as in Plotly's file, and `fitbounds` sees Europe only. Plotly
 *   cuts at the box; here a polygon that straddles it (Russia past 60° E) stays whole and the
 *   subplot's lon/lat ranges frame it;
 * - lakes and rivers by the scope codes they carry (`s`), rivers already cut at the borders.
 */
import type { GeometryObject, Topology } from 'topojson-specification';
import type { GeoScope } from '../geo/types.ts';

/** What tells a scope's features from the rest of the world. */
export interface ScopeSpec {
  /** The code countries (`c`), lakes and rivers (`s`) of the scope carry. */
  readonly code: string;
  /** `[west, south, east, north]` in degrees: sane-topojson's and plotly.js's `bounds`. */
  readonly bounds: readonly [number, number, number, number];
}

/** The id of the one country of the `usa` scope. */
export const USA = 'USA';

/** Every scope but `world`, which is everything. */
export const SCOPES: Readonly<Record<Exclude<GeoScope, 'world'>, ScopeSpec>> = {
  usa: { code: 'us', bounds: [-180, 0, -50, 85] },
  europe: { code: 'eu', bounds: [-30, 0, 60, 90] },
  asia: { code: 'as', bounds: [15, -90, 180, 85] },
  africa: { code: 'af', bounds: [-30, -50, 60, 50] },
  'north america': { code: 'na', bounds: [-180, 0, -45, 85] },
  'south america': { code: 'sa', bounds: [-100, -70, -30, 25] },
  antarctica: { code: 'an', bounds: [-180, -90, 180, -60] },
  oceania: { code: 'oc', bounds: [-180, -50, 180, 25] },
};

/** A polygon geometry of a topology: its arcs, nested one level deeper when it is a multipolygon. */
export type PolygonObject = Extract<GeometryObject, { type: 'Polygon' | 'MultiPolygon' }>;

/** Whether `geometry` is a polygon or a multipolygon. */
export function isPolygonObject(geometry: GeometryObject): geometry is PolygonObject {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
}

const boundsOfArcs = new WeakMap<Topology, Float64Array>();

/**
 * `[west, south, east, north]` of every arc of `topology`, four numbers per arc, computed once.
 * An arc that crosses the antimeridian spans all longitudes, which only ever keeps a polygon.
 */
function arcBounds(topology: Topology): Float64Array {
  let bounds = boundsOfArcs.get(topology);
  if (bounds) return bounds;
  const [kx, ky] = topology.transform?.scale ?? [1, 1];
  const [tx, ty] = topology.transform?.translate ?? [0, 0];
  const quantized = topology.transform !== undefined;
  bounds = new Float64Array(topology.arcs.length * 4);
  topology.arcs.forEach((arc, index) => {
    let x = 0;
    let y = 0;
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const [px = 0, py = 0] of arc) {
      // Quantized arcs are delta-encoded: each point is a step from the one before.
      x = quantized ? x + px : px;
      y = quantized ? y + py : py;
      if (x < west) west = x;
      if (x > east) east = x;
      if (y < south) south = y;
      if (y > north) north = y;
    }
    bounds?.set([west * kx + tx, south * ky + ty, east * kx + tx, north * ky + ty], index * 4);
  });
  boundsOfArcs.set(topology, bounds);
  return bounds;
}

/** Whether the outer ring of a polygon (its arcs) reaches into `box`. */
function ringReaches(
  ring: readonly number[] | undefined,
  bounds: Float64Array,
  box: ScopeSpec['bounds'],
): boolean {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ref of ring ?? []) {
    const at = (ref < 0 ? ~ref : ref) * 4;
    west = Math.min(west, bounds[at] ?? Infinity);
    south = Math.min(south, bounds[at + 1] ?? Infinity);
    east = Math.max(east, bounds[at + 2] ?? -Infinity);
    north = Math.max(north, bounds[at + 3] ?? -Infinity);
  }
  return west <= box[2] && east >= box[0] && south <= box[3] && north >= box[1];
}

/**
 * `geometry` without the polygons that lie wholly outside `box`, or `undefined` when none is
 * left. The result shares its arcs, id and properties with `geometry`.
 */
export function clipToBox(
  topology: Topology,
  geometry: PolygonObject,
  box: ScopeSpec['bounds'],
): PolygonObject | undefined {
  const bounds = arcBounds(topology);
  if (geometry.type === 'Polygon') {
    return ringReaches(geometry.arcs[0], bounds, box) ? geometry : undefined;
  }
  const arcs = geometry.arcs.filter((polygon) => ringReaches(polygon[0], bounds, box));
  if (arcs.length === geometry.arcs.length) return geometry;
  return arcs.length ? { ...geometry, arcs } : undefined;
}
