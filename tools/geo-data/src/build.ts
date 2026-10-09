/**
 * Natural Earth GeoJSON to the two topologies of one resolution (ADR-024), pure:
 *
 * - **base**: `countries` and `land`, sharing arcs. `land` is the union of the countries, so
 *   coastlines and country borders are meshes of the same arcs and need no data of their own;
 *   the ocean is the sphere.
 * - **extras**: `lakes`, `rivers` and `subunits`. It is not a topology on its own: its objects
 *   also use arcs of the base (a state's coast is its country's coast), so its arc indices count
 *   through the base's arcs first and its own after them. See {@link joinExtras}.
 *
 * Both are quantized to the same grid (`GRID` in `config.ts`). Geometry is not simplified beyond
 * what the grid does: consecutive vertices on one grid point become one, and a ring that
 * collapses to a point or a line is dropped.
 */
import { geoStitch } from 'd3-geo-projection';
import type {
  Feature,
  FeatureCollection,
  MultiLineString,
  MultiPolygon,
  Polygon,
  Position,
} from 'geojson';
import { feature, mergeArcs } from 'topojson-client';
import { topology as buildArcs } from 'topojson-server';
import type {
  GeometryCollection,
  GeometryObject,
  MultiPolygon as TopoMultiPolygon,
  Topology,
} from 'topojson-specification';
import { ID_OVERRIDES, SUBUNIT_COUNTRIES } from './config.ts';
import {
  alignAntimeridian,
  isWoundForD3,
  labelPoint,
  polygonsOf,
  ringArea,
  snapLine,
  snapPolygon,
  windForD3,
  type Displacement,
  type Ring,
} from './geometry.ts';
import { countryCodes, countryLocator, polygonCodes, splitByScope } from './scopes.ts';

/** The four Natural Earth layers of one resolution. */
export interface BuildSources {
  countries: FeatureCollection;
  lakes: FeatureCollection;
  rivers: FeatureCollection;
  subunits: FeatureCollection;
}

/** Options of {@link buildBasemap}. */
export interface BuildOptions {
  /** Grid steps across 360° of longitude and 180° of latitude. */
  grid: number;
  /** `adm0_a3` of the countries whose subunits are kept. */
  subunitCountries?: readonly string[];
}

/** What a build did, for the log and the README. */
export interface BuildReport {
  grid: number;
  /** The largest distance snapping moved a vertex, in km. */
  maxDisplacementKm: number;
  countries: number;
  /** Names of the country features that have no id. */
  withoutId: string[];
  /** Polygons (islands, mostly) that collapsed on the grid and were dropped, per object. */
  droppedPolygons: Record<string, number>;
  /** Features whose every polygon collapsed and that are therefore missing. */
  droppedFeatures: string[];
  /** Features whose Natural Earth label point lies outside them and was replaced. */
  movedLabels: string[];
  subunits: number;
  lakes: number;
  /** River stretches, after cutting at scope borders. */
  rivers: number;
}

/** The topologies of one resolution. */
export interface BuiltBasemap {
  base: Topology;
  extras: ExtrasTopology;
  report: BuildReport;
}

const ISO_A3 = /^[A-Z]{3}$/;
const ISO_N3 = /^\d{3}$/;

/**
 * The id of a country feature: `ISO_A3`; where Natural Earth has `-99` there, `ISO_A3_EH` when
 * it is the feature's own code (France and Norway; for Australia's Indian Ocean Territories and
 * Ashmore and Cartier Islands it is `AUS`, which is another feature's); else an override. A
 * feature with none of these has no id and cannot be a `locations` target.
 */
export function countryId(properties: Record<string, unknown>): string | undefined {
  const adm0 = String(properties['ADM0_A3']);
  const iso = String(properties['ISO_A3']);
  if (ISO_A3.test(iso)) return iso;
  const eh = String(properties['ISO_A3_EH']);
  if (ISO_A3.test(eh) && eh === adm0) return eh;
  return ID_OVERRIDES[adm0];
}

/**
 * The English name of a country feature: Natural Earth's short name (`NAME`: "Russia", "Laos",
 * "United States of America"), or `ADMIN` where the short name is cut down to fit a map label
 * ("Dem. Rep. Congo", "St-Martin").
 */
export function countryName(properties: Record<string, unknown>): string {
  const short = String(properties['NAME']);
  return short.includes('.') || short.startsWith('St-') ? String(properties['ADMIN']) : short;
}

/** The ISO 3166-1 numeric code of a country feature that has an ISO id, e.g. `'004'`. */
export function countryNumeric(properties: Record<string, unknown>): string | undefined {
  const n3 = String(properties['ISO_N3']);
  if (ISO_N3.test(n3)) return n3;
  const eh = String(properties['ISO_N3_EH']);
  return ISO_N3.test(eh) ? eh : undefined;
}

interface SnapContext {
  grid: number;
  moved: Displacement;
  report: BuildReport;
}

/**
 * A polygon geometry wound for d3, with the antimeridian cuts stitched, on the grid; `undefined`
 * when every polygon collapses there.
 *
 * Stitching can leave a polygon's rings in any order (it appends them as their fragments close),
 * and at 1:50m it turns the edge Natural Earth draws along 89.999° S under Antarctica into a
 * hole a hundred metres wide around the pole. So the outer ring is found by its area on the
 * sphere, not by its position, and rings are snapped one by one: that hole collapses on every
 * grid and goes, the coast stays.
 */
function snapGeometry(
  geometry: Polygon | MultiPolygon,
  object: string,
  context: SnapContext,
): MultiPolygon | undefined {
  const wound: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: polygonsOf(geometry).map(windForD3),
  };
  const drop = (): void => {
    context.report.droppedPolygons[object] = (context.report.droppedPolygons[object] ?? 0) + 1;
  };
  const coordinates: Ring[][] = [];
  // Natural Earth's two sides of a cut do not always meet to the digit (Fiji at 1:50m), and
  // `geoStitch` joins only those that do.
  for (const polygon of geoStitch(alignAntimeridian(wound)).coordinates) {
    const outers = polygon.filter((ring) => ringArea(ring) < 2 * Math.PI);
    const outer = outers[0];
    if (!outer || outers.length > 1) {
      throw new Error(`geo-data: a polygon of ${object} has ${outers.length} outer rings`);
    }
    const holes = polygon.filter((ring) => ring !== outer);
    const snapped = snapPolygon([outer, ...holes], context.grid, context.moved);
    if (snapped) coordinates.push(snapped);
    else drop();
  }
  return coordinates.length ? { type: 'MultiPolygon', coordinates } : undefined;
}

/** A polygon geometry as the output has it: a `Polygon` when it has one polygon. */
function compact(geometry: MultiPolygon): Polygon | MultiPolygon {
  const [only] = geometry.coordinates;
  return geometry.coordinates.length === 1 && only
    ? { type: 'Polygon', coordinates: only }
    : geometry;
}

/**
 * A quantized topology of `objects`, whose coordinates are grid indices: arcs are delta-encoded
 * and the transform maps the grid back to degrees. The grid spans the whole sphere whatever the
 * data's extent, so a rebuild with other layers keeps every vertex where it was.
 */
function toTopology(objects: Record<string, FeatureCollection>, grid: number): Topology {
  const topology = buildArcs(objects);
  delete topology.bbox;
  // New points, not edits in place: consecutive arcs share the point they meet at.
  topology.arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map((point) => {
      const [px = 0, py = 0] = point;
      const delta = [px - x, py - y];
      x = px;
      y = py;
      return delta;
    });
  });
  topology.transform = { scale: [360 / grid, 180 / grid], translate: [-180, -90] };
  return topology;
}

/** Arc references of a geometry, nested as deep as its type needs. */
type ArcRefs = number | ArcRefs[];

/** Every arc reference of `refs` through `map` (a reference `~i` is arc `i` reversed). */
function mapArcs(refs: ArcRefs, map: (arc: number) => number): ArcRefs {
  if (typeof refs !== 'number') return refs.map((inner) => mapArcs(inner, map));
  return refs < 0 ? ~map(~refs) : map(refs);
}

/** An extras topology as the data module has it: `base` is the number of base arcs it counts past. */
export type ExtrasTopology = Topology & { base: number };

/**
 * Splits a topology of all layers in two: the arcs the `baseNames` objects use, with those
 * objects, and the rest. The base is a topology of its own. The extras' objects keep referring
 * to base arcs by their index there and to their own arcs by `base.arcs.length + index`.
 */
function splitTopology(
  joint: Topology,
  baseNames: readonly string[],
): { base: Topology; extras: ExtrasTopology } {
  const inBase = new Uint8Array(joint.arcs.length);
  for (const name of baseNames) {
    for (const geometry of geometriesOf(joint, name)) {
      const refs = (geometry as { arcs?: ArcRefs }).arcs;
      if (refs === undefined) continue;
      mapArcs(refs, (arc) => {
        inBase[arc] = 1;
        return arc;
      });
    }
  }
  const baseArcs = joint.arcs.filter((_, index) => inBase[index]);
  const extrasArcs = joint.arcs.filter((_, index) => !inBase[index]);
  const renumbered = new Uint32Array(joint.arcs.length);
  let nextBase = 0;
  let nextExtras = baseArcs.length;
  for (let index = 0; index < joint.arcs.length; index++) {
    renumbered[index] = inBase[index] ? nextBase++ : nextExtras++;
  }
  const base: Topology = {
    type: 'Topology',
    transform: joint.transform,
    objects: {},
    arcs: baseArcs,
  };
  const extras: ExtrasTopology = {
    type: 'Topology',
    base: baseArcs.length,
    transform: joint.transform,
    objects: {},
    arcs: extrasArcs,
  };
  for (const [name, object] of Object.entries(joint.objects)) {
    for (const geometry of (object as GeometryCollection).geometries) {
      const holder = geometry as { arcs?: ArcRefs };
      if (holder.arcs !== undefined)
        holder.arcs = mapArcs(holder.arcs, (arc) => renumbered[arc] ?? 0);
    }
    (baseNames.includes(name) ? base : extras).objects[name] = object;
  }
  return { base, extras };
}

/**
 * The extras as a topology that decodes: its objects over the base's arcs followed by its own.
 * The loader of `@mk7s/holochart-traces-geo` does the same.
 */
export function joinExtras(base: Topology, extras: ExtrasTopology): Topology {
  if (extras.base !== base.arcs.length) {
    throw new Error('geo-data: the extras were built against another base');
  }
  return { ...extras, arcs: base.arcs.concat(extras.arcs) };
}

/** The geometries of a named object of `topology`. */
function geometriesOf(topology: Topology, name: string): GeometryObject[] {
  const object = topology.objects[name];
  if (!object || object.type !== 'GeometryCollection') {
    throw new Error(`geo-data: no object "${name}"`);
  }
  return (object as GeometryCollection).geometries;
}

/**
 * Replaces the label hint (`h`) of every feature of an object by `ct`, a point inside the
 * feature as the topology decodes it, and checks the decoded polygons are wound for d3.
 */
function finishFeatures(topology: Topology, name: string, report: BuildReport): void {
  const geometries = geometriesOf(topology, name);
  const decoded = feature(topology, topology.objects[name] as GeometryCollection).features;
  geometries.forEach((geometry, index) => {
    const properties = (geometry.properties ?? {}) as Record<string, unknown>;
    const shape = decoded[index]?.geometry as Polygon | MultiPolygon;
    const label = String(properties['name']);
    if (!polygonsOf(shape).every(isWoundForD3)) {
      throw new Error(`geo-data: ${name} "${label}" is not wound for d3 after snapping`);
    }
    const hint = properties['h'] as [number, number] | undefined;
    const point = labelPoint(shape, hint);
    if (!point) throw new Error(`geo-data: no label point inside ${name} "${label}"`);
    if (!hint || Math.abs(point[0] - hint[0]) > 0.01 || Math.abs(point[1] - hint[1]) > 0.01) {
      report.movedLabels.push(label);
    }
    delete properties['h'];
    properties['ct'] = point;
  });
}

/**
 * `land` as the union of the countries: the arcs only one country uses. Each polygon lists its
 * outer ring first; `mergeArcs` picks it by planar area, which a ring across the antimeridian
 * can fool, so the order is checked on the sphere.
 */
function mergeLand(base: Topology): TopoMultiPolygon {
  const land = mergeArcs(
    base,
    geometriesOf(base, 'countries') as Parameters<typeof mergeArcs>[1],
  ) as TopoMultiPolygon;
  const decoded = feature(base, land).geometry as MultiPolygon;
  land.arcs.forEach((polygon, index) => {
    const rings = decoded.coordinates[index] ?? [];
    const outer = rings.findIndex((ring) => ringArea(ring) < 2 * Math.PI);
    if (outer > 0) polygon.unshift(...polygon.splice(outer, 1));
    const ordered = [...rings];
    if (outer > 0) ordered.unshift(...ordered.splice(outer, 1));
    if (!isWoundForD3(ordered))
      throw new Error(`geo-data: land polygon ${index} is not wound for d3`);
  });
  return land;
}

/** The `countries` features on the grid, with their properties and a label hint. */
function countryFeatures(sources: BuildSources, context: SnapContext): Feature[] {
  const out: Feature[] = [];
  for (const source of sources.countries.features) {
    const p = source.properties ?? {};
    const name = countryName(p);
    const geometry = snapGeometry(source.geometry as Polygon | MultiPolygon, 'countries', context);
    if (!geometry) {
      context.report.droppedFeatures.push(name);
      continue;
    }
    const id = countryId(p);
    const properties: Record<string, unknown> = { name };
    // The numeric code goes with an ISO id; a feature without one does not borrow its sovereign's.
    const numeric = id && hasIsoId(p) ? countryNumeric(p) : undefined;
    if (numeric) properties['n'] = numeric;
    const codes = countryCodes(p).split(' ')[0];
    if (codes) properties['c'] = codes;
    properties['h'] = [Number(p['LABEL_X']), Number(p['LABEL_Y'])];
    if (!id) context.report.withoutId.push(name);
    out.push({ type: 'Feature', ...(id ? { id } : {}), properties, geometry: compact(geometry) });
  }
  return out;
}

/** Whether a country's id is an ISO code of its own, not an override. */
function hasIsoId(properties: Record<string, unknown>): boolean {
  return ID_OVERRIDES[String(properties['ADM0_A3'])] === undefined;
}

/** The `subunits` features on the grid: the states and provinces of the kept countries. */
function subunitFeatures(
  sources: BuildSources,
  keep: readonly string[],
  context: SnapContext,
): Feature[] {
  const out: Feature[] = [];
  for (const source of sources.subunits.features) {
    const p = source.properties ?? {};
    const country = String(p['adm0_a3']);
    if (!keep.includes(country)) continue;
    const name = String(p['name']);
    const geometry = snapGeometry(source.geometry as Polygon | MultiPolygon, 'subunits', context);
    if (!geometry) {
      context.report.droppedFeatures.push(name);
      continue;
    }
    const postal = p['postal'];
    if (typeof postal !== 'string' || !postal) {
      throw new Error(`geo-data: subunit "${name}" has no postal code`);
    }
    out.push({
      type: 'Feature',
      id: postal,
      properties: { name, gu: country, h: [Number(p['longitude']), Number(p['latitude'])] },
      geometry: compact(geometry),
    });
  }
  return out;
}

/** One feature per set of scope codes, so the loader picks a scope's lakes or rivers by `s`. */
function groupedFeatures<G extends MultiPolygon | MultiLineString>(
  type: G['type'],
  groups: Map<string, G['coordinates']>,
): Feature[] {
  return [...groups.keys()].sort().map((codes) => ({
    type: 'Feature',
    properties: codes ? { s: codes } : {},
    geometry: { type, coordinates: groups.get(codes) } as G,
  }));
}

/** Adds `item` to the group of `codes`. */
function addTo<T>(groups: Map<string, T[]>, codes: string, item: T): void {
  const group = groups.get(codes);
  if (group) group.push(item);
  else groups.set(codes, [item]);
}

/** Builds the base and extras topologies of one resolution. */
export function buildBasemap(sources: BuildSources, options: BuildOptions): BuiltBasemap {
  const report: BuildReport = {
    grid: options.grid,
    maxDisplacementKm: 0,
    countries: 0,
    withoutId: [],
    droppedPolygons: {},
    droppedFeatures: [],
    movedLabels: [],
    subunits: 0,
    lakes: 0,
    rivers: 0,
  };
  const moved: Displacement = { maxKm: 0 };
  const context: SnapContext = { grid: options.grid, moved, report };

  const countries = countryFeatures(sources, context);
  report.countries = countries.length;

  // Scope codes come from the countries as Natural Earth has them, before stitching and snapping.
  const locate = countryLocator(sources.countries.features);

  const lakes = new Map<string, Ring[][]>();
  for (const source of sources.lakes.features) {
    if (!source.geometry) continue;
    for (const polygon of polygonsOf(source.geometry as Polygon | MultiPolygon)) {
      const snapped = snapPolygon(windForD3(polygon), options.grid, moved);
      if (snapped) {
        addTo(lakes, polygonCodes(polygon, locate), snapped);
        report.lakes++;
      } else {
        report.droppedPolygons['lakes'] = (report.droppedPolygons['lakes'] ?? 0) + 1;
      }
    }
  }

  const rivers = new Map<string, Position[][]>();
  for (const source of sources.rivers.features) {
    const geometry = source.geometry;
    if (!geometry) continue;
    const lines =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.type === 'MultiLineString'
          ? geometry.coordinates
          : [];
    for (const line of lines) {
      for (const stretch of splitByScope(line, locate)) {
        const snapped = snapLine(stretch.line, options.grid, moved);
        if (!snapped) continue;
        addTo(rivers, stretch.codes, snapped);
        report.rivers++;
      }
    }
  }

  const subunits = subunitFeatures(sources, options.subunitCountries ?? SUBUNIT_COUNTRIES, context);
  report.subunits = subunits.length;

  const collection = (features: Feature[]): FeatureCollection => ({
    type: 'FeatureCollection',
    features,
  });
  const joint = toTopology(
    {
      countries: collection(countries),
      lakes: collection(groupedFeatures<MultiPolygon>('MultiPolygon', lakes)),
      rivers: collection(groupedFeatures<MultiLineString>('MultiLineString', rivers)),
      subunits: collection(subunits),
    },
    options.grid,
  );
  const { base, extras } = splitTopology(joint, ['countries']);
  base.objects['land'] = mergeLand(base);
  finishFeatures(base, 'countries', report);
  finishFeatures(joinExtras(base, extras), 'subunits', report);

  report.maxDisplacementKm = moved.maxKm;
  return { base, extras, report };
}
