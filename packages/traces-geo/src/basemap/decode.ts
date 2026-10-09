/**
 * TopoJSON to the layers of a `geo` subplot (ADR-024), pure. Two layouts are read:
 *
 * - **Bundled** (`tools/geo-data`): a base topology with `countries` and `land` and an extras
 *   topology with `lakes`, `rivers` and `subunits`, both of the whole world; a scope is picked
 *   out of them (`scopes.ts`).
 * - **Plotly's** (`config.topojsonURL`): one topology per scope with the objects `coastlines`,
 *   `land`, `ocean`, `lakes`, `rivers`, `countries` and `subunits`.
 *
 * Coastlines and borders are not data in the bundled layout: they are meshes of the arcs the
 * polygons share, so a coast is stored once however many layers draw it.
 */
import type { Feature, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';
import { feature, mergeArcs, mesh } from 'topojson-client';
import type { GeometryCollection, GeometryObject, Topology } from 'topojson-specification';
import type {
  BasemapLayers,
  CountryProperties,
  GeoScope,
  SubunitProperties,
} from '../geo/types.ts';
import { clipToBox, isPolygonObject, SCOPES, USA, type PolygonObject } from './scopes.ts';

/**
 * The extras chunk as `tools/geo-data` writes it. Its objects also use arcs of the base (a
 * state's coast is its country's coast), so its arc indices count through the base's arcs first
 * (`base` of them) and its own after.
 */
export type ExtrasTopology = Topology & { base?: number };

/** The layers the extras chunk holds. */
export type ExtrasLayers = Pick<BasemapLayers, 'lakes' | 'rivers' | 'subunits' | 'subunitBorders'>;

type Properties = Record<string, unknown>;

/** The geometries of a named object; none when the topology has no such object. */
function geometriesOf(topology: Topology, name: string): GeometryObject[] {
  // The specification types properties as nullable in a topology and as an object elsewhere.
  const object = topology.objects[name] as GeometryObject | undefined;
  if (!object) return [];
  return object.type === 'GeometryCollection' ? object.geometries : [object];
}

function collection(geometries: GeometryObject[]): GeometryCollection {
  return { type: 'GeometryCollection', geometries };
}

function propertiesOf(geometry: GeometryObject): Properties {
  return (geometry.properties ?? {}) as Properties;
}

/** The polygons of `geometries` as one multipolygon; `undefined` when there are none. */
function polygons(topology: Topology, geometries: GeometryObject[]): MultiPolygon | undefined {
  const coordinates: Position[][][] = [];
  for (const { geometry } of feature(topology, collection(geometries)).features) {
    if (geometry?.type === 'Polygon') coordinates.push(geometry.coordinates);
    else if (geometry?.type === 'MultiPolygon') coordinates.push(...geometry.coordinates);
  }
  return coordinates.length ? { type: 'MultiPolygon', coordinates } : undefined;
}

/** The lines of `geometries` as one multiline; `undefined` when there are none. */
function lines(topology: Topology, geometries: GeometryObject[]): MultiLineString | undefined {
  const coordinates: Position[][] = [];
  for (const { geometry } of feature(topology, collection(geometries)).features) {
    if (geometry?.type === 'LineString') coordinates.push(geometry.coordinates);
    else if (geometry?.type === 'MultiLineString') coordinates.push(...geometry.coordinates);
  }
  return coordinates.length ? { type: 'MultiLineString', coordinates } : undefined;
}

/** A multiline, or `undefined` when it has no line (a layer with nothing to draw is absent). */
function nonEmpty(line: MultiLineString): MultiLineString | undefined {
  return line.coordinates.length ? line : undefined;
}

/** A point to label a feature at when its file gives none: the mean of its first ring's vertices. */
function fallbackLabel(geometry: Polygon | MultiPolygon): [number, number] {
  const ring =
    (geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0]?.[0]) ?? [];
  // A ring repeats its first vertex at the end; count it once.
  const n = Math.max(1, ring.length - 1);
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const [lon = 0, lat = 0] = ring[i] ?? [];
    x += lon;
    y += lat;
  }
  return [x / n, y / n];
}

/** `ct` of a feature's properties as a fresh pair, so a caller cannot edit the cached topology. */
function labelOf(properties: Properties, geometry: Polygon | MultiPolygon): [number, number] {
  const ct = properties['ct'];
  return Array.isArray(ct) && typeof ct[0] === 'number' && typeof ct[1] === 'number'
    ? [ct[0], ct[1]]
    : fallbackLabel(geometry);
}

/**
 * The polygon features of `geometries`, with the properties `properties` builds from those of the
 * topology. Geometries without a polygon are left out.
 */
function polygonFeatures<P>(
  topology: Topology,
  geometries: GeometryObject[],
  properties: (source: Properties, geometry: Polygon | MultiPolygon, id: string) => P,
): Feature<Polygon | MultiPolygon, P>[] {
  const out: Feature<Polygon | MultiPolygon, P>[] = [];
  for (const decoded of feature(topology, collection(geometries)).features) {
    const geometry = decoded.geometry;
    if (geometry?.type !== 'Polygon' && geometry?.type !== 'MultiPolygon') continue;
    const id = decoded.id === undefined ? undefined : String(decoded.id);
    const made: Feature<Polygon | MultiPolygon, P> = {
      type: 'Feature',
      properties: properties((decoded.properties ?? {}) as Properties, geometry, id ?? ''),
      geometry,
    };
    if (id !== undefined) made.id = id;
    out.push(made);
  }
  return out;
}

function countryProperties(
  source: Properties,
  geometry: Polygon | MultiPolygon,
  id: string,
): CountryProperties {
  // Plotly's files carry no names; the id stands in.
  const name = typeof source['name'] === 'string' ? source['name'] : id;
  const out: CountryProperties = { name, ct: labelOf(source, geometry) };
  if (typeof source['n'] === 'string') out.n = source['n'];
  return out;
}

function subunitProperties(
  source: Properties,
  geometry: Polygon | MultiPolygon,
  id: string,
): SubunitProperties {
  return {
    name: typeof source['name'] === 'string' ? source['name'] : id,
    gu: typeof source['gu'] === 'string' ? source['gu'] : '',
    ct: labelOf(source, geometry),
  };
}

/** Borders between the polygons of `geometries`: the arcs two of them share. */
function countryBorders(topology: Topology, geometries: GeometryObject[]): MultiLineString {
  return mesh(topology, collection(geometries), (a, b) => a !== b);
}

/**
 * Borders between subunits of one country: without the coast, which one subunit alone uses, and
 * without country borders, whose two sides belong to different countries.
 */
function subunitBorders(topology: Topology, geometries: GeometryObject[]): MultiLineString {
  return mesh(
    topology,
    collection(geometries),
    (a, b) => a !== b && propertiesOf(a)['gu'] === propertiesOf(b)['gu'],
  );
}

/** The polygon geometries of `geometries` that `keep` accepts, cut down to the scope's box. */
function scoped(
  topology: Topology,
  geometries: GeometryObject[],
  scope: Exclude<GeoScope, 'world'>,
  keep: (geometry: PolygonObject) => boolean,
): PolygonObject[] {
  const out: PolygonObject[] = [];
  for (const geometry of geometries) {
    if (!isPolygonObject(geometry) || !keep(geometry)) continue;
    const clipped = clipToBox(topology, geometry, SCOPES[scope].bounds);
    if (clipped) out.push(clipped);
  }
  return out;
}

/** The base layers of one scope: countries, land, coastlines and borders. */
export function decodeBase(base: Topology, scope: GeoScope): BasemapLayers {
  const all = geometriesOf(base, 'countries');
  let countries: GeometryObject[];
  let land: PolygonObject | undefined;
  if (scope === 'world') {
    countries = all;
    land = geometriesOf(base, 'land').find(isPolygonObject);
  } else {
    const { code } = SCOPES[scope];
    countries = scoped(base, all, scope, (geometry) =>
      scope === 'usa' ? geometry.id === USA : propertiesOf(geometry)['c'] === code,
    );
    // The union of the scope's countries: the arcs only one of them uses, stitched into rings.
    land = countries.length ? mergeArcs(base, countries as PolygonObject[]) : undefined;
  }
  const layers: BasemapLayers = {
    countries: polygonFeatures(base, countries, countryProperties),
  };
  const borders = nonEmpty(countryBorders(base, countries));
  if (borders) layers.borders = borders;
  if (land) {
    const fill = polygons(base, [land]);
    if (fill) layers.land = fill;
    const coastlines = nonEmpty(mesh(base, land));
    if (coastlines) layers.coastlines = coastlines;
  }
  return layers;
}

/** The extras over the base's arcs followed by their own, as a topology that decodes. */
export function joinExtras(base: Topology, extras: ExtrasTopology): Topology {
  if (extras.base === undefined) return extras;
  if (extras.base !== base.arcs.length) {
    throw new Error('the extras chunk was built against another base chunk');
  }
  return { ...extras, arcs: base.arcs.concat(extras.arcs) };
}

/**
 * The extras layers of one scope: lakes, rivers, subunits and the borders between subunits.
 * `joined` is the extras topology after {@link joinExtras}; `base` tells which continent a
 * subunit's country is on.
 */
export function decodeExtras(base: Topology, joined: Topology, scope: GeoScope): ExtrasLayers {
  let lakes = geometriesOf(joined, 'lakes');
  let rivers = geometriesOf(joined, 'rivers');
  let subunits = geometriesOf(joined, 'subunits');
  if (scope !== 'world') {
    const { code } = SCOPES[scope];
    // Scope codes are two letters apart by spaces, so a substring match is a whole code.
    const inScope = (geometry: GeometryObject): boolean =>
      String(propertiesOf(geometry)['s'] ?? '').includes(code);
    lakes = lakes.filter(inScope);
    rivers = rivers.filter(inScope);
    const continents = new Map<unknown, unknown>();
    for (const country of geometriesOf(base, 'countries')) {
      continents.set(country.id, propertiesOf(country)['c']);
    }
    subunits = scoped(joined, subunits, scope, (geometry) => {
      const country = propertiesOf(geometry)['gu'];
      return scope === 'usa' ? country === USA : continents.get(country) === code;
    });
  }
  const layers: ExtrasLayers = {};
  const lakeFill = polygons(joined, lakes);
  if (lakeFill) layers.lakes = lakeFill;
  const riverLines = lines(joined, rivers);
  if (riverLines) layers.rivers = riverLines;
  if (subunits.length) {
    layers.subunits = polygonFeatures(joined, subunits, subunitProperties);
    const borders = nonEmpty(subunitBorders(joined, subunits));
    if (borders) layers.subunitBorders = borders;
  }
  return layers;
}

/**
 * The layers of a file in Plotly's layout, which is one scope already. `extras` says whether
 * lakes, rivers and subunits are wanted. Plotly's files are wound for `d3-geo`, as Plotly draws
 * them with it, so nothing is rewound here.
 */
export function decodePlotly(topology: Topology, extras: boolean): BasemapLayers {
  const layers: BasemapLayers = {};
  const countries = geometriesOf(topology, 'countries');
  if (countries.length) {
    layers.countries = polygonFeatures(topology, countries, countryProperties);
    const borders = nonEmpty(countryBorders(topology, countries));
    if (borders) layers.borders = borders;
  }
  const land = geometriesOf(topology, 'land');
  const fill = polygons(topology, land);
  if (fill) layers.land = fill;
  // Plotly's files have coastlines of their own; a file without them gets the land's outline.
  const coastlines =
    lines(topology, geometriesOf(topology, 'coastlines')) ??
    (land.length ? nonEmpty(mesh(topology, collection(land))) : undefined);
  if (coastlines) layers.coastlines = coastlines;
  if (!extras) return layers;
  const lakes = polygons(topology, geometriesOf(topology, 'lakes'));
  if (lakes) layers.lakes = lakes;
  const rivers = lines(topology, geometriesOf(topology, 'rivers'));
  if (rivers) layers.rivers = rivers;
  const subunits = geometriesOf(topology, 'subunits');
  if (subunits.length) {
    layers.subunits = polygonFeatures(topology, subunits, subunitProperties);
    const borders = nonEmpty(subunitBorders(topology, subunits));
    if (borders) layers.subunitBorders = borders;
  }
  return layers;
}
