/**
 * Locations: data addressed by place instead of by coordinates (backlog GEO3, GEO4). A trace gives
 * `locations` and says what they name with `locationmode`; this module finds the feature each one
 * names and the point it is drawn at. `scattergeo` draws at the points, `choropleth` fills the
 * features: both use {@link locate}.
 *
 * | `locationmode`    | A location is                                  | Matched against                       |
 * | ----------------- | ---------------------------------------------- | ------------------------------------- |
 * | `'ISO-3'`         | an ISO 3166-1 alpha-3 code, in any case        | the basemap's countries, by `id`      |
 * | `'USA-states'`    | a postal code (`'CA'`) or a state's name       | the basemap's subunits of the USA     |
 * | `'country names'` | a name or a code (see `country-names.ts`)      | the basemap's countries, by `id`      |
 * | `'geojson-id'`    | a string or a number                           | the trace's `geojson`, `featureidkey` |
 *
 * The point of a basemap feature is its label point (`properties.ct`). The point of a feature of
 * the trace's `geojson` is the mean of the vertices of its largest polygon, which is what Plotly
 * draws at.
 *
 * Everything here is synchronous and takes its data in hand: the basemap layers, the parsed
 * `geojson` and the country-name lookup are loaded by `location-data.ts`. {@link locate} answers
 * `undefined` while what the mode needs is not there.
 *
 * Ported from plotly.js 4.1.1 (MIT, Copyright (c) 2016-2024 Plotly Technologies Inc.):
 * `src/lib/geo_location_utils.js` (`locationToFeature`, `extractTraceFeature`, `findCentroid`,
 * `coordsOf`), `src/lib/usa_location_names.js` and the location part of `scattergeo/calc.js`.
 * `findCentroid` calls `@turf/area` and `@turf/centroid` 7 (MIT, Copyright (c) 2017 TurfJS): the
 * ring area and the vertex mean below are theirs.
 *
 * Differences from Plotly:
 *
 * - `'ISO-3'` codes match in any case and with spaces around them; Plotly compares them as given.
 * - With `'geojson-id'`, every location that names a feature gets it. Plotly keeps one point per
 *   distinct location (the last), so a location given twice is drawn once.
 * - Locations that match nothing are named in one warning per trace data. Plotly logs each one at
 *   its verbose level only.
 */
import { getIn, isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { Feature, GeoJsonProperties, MultiPolygon, Polygon, Position } from 'geojson';
import type { BasemapLayers } from './types.ts';

/** Plotly's `locationmode` values. */
export type LocationMode = 'ISO-3' | 'USA-states' | 'country names' | 'geojson-id';

/** The location attributes of a trace (see {@link locationsOf}). */
export interface LocationsRequest {
  /** The trace's `locations`. Results are cached by this array, so keep it between passes. */
  readonly locations: ArrayLike<unknown>;
  readonly locationmode: LocationMode;
  /** The trace's `geojson`: an object, or the URL of one. Read with `'geojson-id'` only. */
  readonly geojson?: unknown;
  /** The path of the id in a feature of `geojson`, e.g. `'properties.name'`. */
  readonly featureidkey: string;
  /** What to call the trace in the warning about locations that match nothing. */
  readonly label?: string;
}

/** What {@link locate} matches against; each mode needs one part (see the module comment). */
export interface LocationsSource {
  /** The basemap of the trace's subplot. `'USA-states'` needs its `subunits` (the extras). */
  readonly layers?: BasemapLayers | undefined;
  /** The trace's `geojson`, parsed: a `FeatureCollection` or a `Feature`. */
  readonly geojson?: unknown;
  /** `countryNameToIso3` of `country-names.ts`, once its chunk has loaded. */
  readonly countryNames?: ((name: string) => string | undefined) | undefined;
}

/** A feature that locations name. One object per feature and source, shared by its locations. */
export interface LocatedFeature {
  /**
   * What the location resolved to: the ISO-3 code, the postal code, or the feature's value at
   * `featureidkey` as a string.
   */
  readonly id: string;
  /** The feature as the basemap or the trace's `geojson` has it; its geometry is in degrees. */
  readonly feature: Feature<Polygon | MultiPolygon, GeoJsonProperties>;
  /**
   * Where the location is drawn and labelled, `[lon, lat]`. Both NaN for a `geojson` feature
   * without a polygon that has an area.
   */
  readonly point: readonly [number, number];
  /**
   * `true` for a feature of the trace's `geojson`: events and `hovertemplate` then carry its
   * `properties`, as in Plotly. `false` for a feature of the basemap.
   */
  readonly custom: boolean;
}

/** The answer of {@link locate}; treat it as frozen, traces with the same locations share it. */
export interface LocationsResult {
  /** For each location, the feature it names; `undefined` for a gap or a location without one. */
  readonly features: readonly (LocatedFeature | undefined)[];
  /** The point of each location, in degrees; both NaN where there is none. */
  readonly lon: Float64Array;
  readonly lat: Float64Array;
  /** The distinct locations that name no feature, as given, in order of first appearance. */
  readonly unmatched: readonly string[];
}

const MODES: readonly unknown[] = ['ISO-3', 'USA-states', 'country names', 'geojson-id'];

/**
 * The location attributes of a defaulted trace, or `undefined` when it gives no `locations` (it
 * is then drawn from coordinates, or from nothing).
 */
export function locationsOf(trace: FullTrace, label?: string): LocationsRequest | undefined {
  const locations = trace['locations'];
  if (!isArrayLike(locations) || locations.length === 0) return undefined;
  const mode = trace['locationmode'];
  const key = trace['featureidkey'];
  return {
    locations,
    locationmode: MODES.includes(mode) ? (mode as LocationMode) : 'ISO-3',
    geojson: trace['geojson'],
    featureidkey: typeof key === 'string' && key !== '' ? key : 'id',
    ...(label !== undefined ? { label } : {}),
  };
}

// ---- US states (plotly.js usa_location_names.js) ----------------------------------------------

const USA_STATES: Readonly<Record<string, string>> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'washington dc': 'DC',
  'washington d.c.': 'DC',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
};

const USA_CODES: ReadonlySet<string> = /* @__PURE__ */ new Set(Object.values(USA_STATES));

/**
 * The postal code of a US state given by its code or its name, in any case (`'ca'`,
 * `'California'` → `'CA'`); `undefined` for anything else.
 */
export function usaStateCode(location: string): string | undefined {
  const s = location.trim();
  const upper = s.toUpperCase();
  return USA_CODES.has(upper) ? upper : USA_STATES[s.toLowerCase()];
}

// ---- Centroids and coordinates of GeoJSON -----------------------------------------------------

const RADIANS = Math.PI / 180;

/** The area of a ring up to a constant factor, signed by its direction (`@turf/area`). */
function ringArea(ring: readonly Position[]): number {
  // The closing coordinate is not a vertex.
  const n = ring.length - 1;
  if (n <= 2) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const lower = ring[i] as Position;
    const middle = ring[i + 1 === n ? 0 : i + 1] as Position;
    const upper = ring[i + 2 >= n ? (i + 2) % n : i + 2] as Position;
    total +=
      ((upper[0] as number) - (lower[0] as number)) *
      RADIANS *
      Math.sin((middle[1] as number) * RADIANS);
  }
  return total;
}

/** The area of a polygon up to a constant factor: its outer ring less its holes. */
function polygonArea(rings: readonly (readonly Position[])[]): number {
  let total = 0;
  for (let i = 0; i < rings.length; i++) {
    const area = Math.abs(ringArea(rings[i] as Position[]));
    total += i === 0 ? area : -area;
  }
  return total;
}

function isRings(v: unknown): v is Position[][] {
  return Array.isArray(v) && v.every((ring) => Array.isArray(ring));
}

/**
 * The point Plotly draws a feature of a trace's `geojson` at (`findCentroid`): the mean of the
 * vertices of its polygon, holes included, each ring's closing coordinate left out. Of a
 * `MultiPolygon`, the polygon with the largest area. `[NaN, NaN]` when no polygon has an area or
 * a vertex.
 */
export function featureCentroid(geometry: Polygon | MultiPolygon): [number, number] {
  let rings: readonly Position[][] | undefined;
  if (geometry.type === 'MultiPolygon') {
    let largest = 0;
    for (const polygon of Array.isArray(geometry.coordinates) ? geometry.coordinates : []) {
      if (!isRings(polygon)) continue;
      const area = polygonArea(polygon);
      if (area > largest) {
        largest = area;
        rings = polygon;
      }
    }
  } else if (isRings(geometry.coordinates)) {
    rings = geometry.coordinates;
  }
  let x = 0;
  let y = 0;
  let count = 0;
  for (const ring of rings ?? []) {
    for (let i = 0; i < ring.length - 1; i++) {
      const p = ring[i] as Position;
      x += p[0] as number;
      y += p[1] as number;
      count++;
    }
  }
  return count > 0 ? [x / count, y / count] : [NaN, NaN];
}

const COORDS = new WeakMap<object, readonly [number, number][]>();

/** Appends the `[lon, lat]` pairs of a `coordinates` member of any depth. */
function pushCoords(coordinates: unknown, out: [number, number][]): void {
  if (!Array.isArray(coordinates)) return;
  if (typeof coordinates[0] === 'number') {
    if (typeof coordinates[1] === 'number') out.push([coordinates[0], coordinates[1]]);
    return;
  }
  for (const part of coordinates) pushCoords(part, out);
}

function pushGeojson(geojson: unknown, out: [number, number][]): void {
  if (typeof geojson !== 'object' || geojson === null) return;
  const g = geojson as Record<string, unknown>;
  if (g['type'] === 'FeatureCollection') {
    for (const f of Array.isArray(g['features']) ? g['features'] : []) pushGeojson(f, out);
  } else if (g['type'] === 'Feature') {
    pushGeojson(g['geometry'], out);
  } else if (g['type'] === 'GeometryCollection') {
    for (const part of Array.isArray(g['geometries']) ? g['geometries'] : []) {
      pushGeojson(part, out);
    }
  } else {
    pushCoords(g['coordinates'], out);
  }
}

/**
 * Every coordinate of a GeoJSON object (a `FeatureCollection`, a `Feature`, a geometry or a
 * `GeometryCollection`) as `[lon, lat]` pairs; empty for anything else. This is what
 * `fitbounds: 'geojson'` fits the view to (Plotly's `coordsOf`). Computed once per object.
 */
export function geojsonCoords(geojson: unknown): readonly [number, number][] {
  if (typeof geojson !== 'object' || geojson === null) return [];
  let coords = COORDS.get(geojson);
  if (!coords) {
    const out: [number, number][] = [];
    pushGeojson(geojson, out);
    coords = out;
    COORDS.set(geojson, coords);
  }
  return coords;
}

// ---- Feature indexes --------------------------------------------------------------------------

type AreaFeature = Feature<Polygon | MultiPolygon, GeoJsonProperties>;

/** A feature under its id, and what {@link locate} hands out for it once a location names it. */
interface Slot {
  readonly feature: AreaFeature;
  located?: LocatedFeature;
}

type Index = Map<string, Slot>;

/** Indexes by what they were built from: a layer's feature array, or a `geojson` object. */
const INDEXES = new WeakMap<object, Map<string, Index>>();

function indexOf(owner: object, key: string, build: () => Index): Index {
  let byKey = INDEXES.get(owner);
  if (!byKey) INDEXES.set(owner, (byKey = new Map()));
  let index = byKey.get(key);
  if (!index) byKey.set(key, (index = build()));
  return index;
}

function isAreaFeature(f: unknown): f is AreaFeature {
  const geometry = (f as Partial<AreaFeature> | null)?.geometry as { type?: unknown } | undefined;
  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
}

/** The features of a basemap layer by upper-case id; the first feature of an id stands. */
function layerIndex(features: readonly AreaFeature[], usaOnly: boolean): Index {
  return indexOf(features, usaOnly ? 'usa' : 'all', () => {
    const index: Index = new Map();
    for (const feature of features) {
      // The subunit layer also has the provinces of Canada, Australia and Brazil, and their codes
      // overlap (WA is Washington and Western Australia).
      if (usaOnly && (feature.properties as { gu?: unknown } | null)?.gu !== 'USA') continue;
      if (feature.id === undefined || feature.id === null) continue;
      const id = String(feature.id).toUpperCase();
      if (!index.has(id)) index.set(id, { feature });
    }
    return index;
  });
}

/**
 * The `Polygon` and `MultiPolygon` features of a trace's `geojson` by their value at
 * `featureidkey`, or `undefined` when the object is neither a `FeatureCollection` nor a
 * `Feature`.
 */
function geojsonIndex(geojson: unknown, featureidkey: string): Index | undefined {
  if (typeof geojson !== 'object' || geojson === null) return undefined;
  const g = geojson as { type?: unknown; features?: unknown };
  const features: readonly unknown[] | undefined =
    g.type === 'FeatureCollection'
      ? Array.isArray(g.features)
        ? g.features
        : []
      : g.type === 'Feature'
        ? [g]
        : undefined;
  if (!features) return undefined;
  return indexOf(geojson, `key:${featureidkey}`, () => {
    const index: Index = new Map();
    for (const feature of features) {
      if (!isAreaFeature(feature)) continue;
      let id: unknown;
      try {
        id = getIn(feature, featureidkey);
      } catch {
        // Not a path: no feature has an id.
        break;
      }
      if (typeof id !== 'string' && typeof id !== 'number') continue;
      const key = String(id);
      if (!index.has(key)) index.set(key, { feature });
    }
    return index;
  });
}

function located(slot: Slot, id: string, custom: boolean): LocatedFeature {
  if (!slot.located) {
    const { feature } = slot;
    const ct = (feature.properties as { ct?: unknown } | null)?.ct;
    const point: readonly [number, number] = custom
      ? featureCentroid(feature.geometry)
      : Array.isArray(ct) && typeof ct[0] === 'number' && typeof ct[1] === 'number'
        ? [ct[0], ct[1]]
        : [NaN, NaN];
    slot.located = { id, feature, point, custom };
  }
  return slot.located;
}

// ---- The lookup -------------------------------------------------------------------------------

/** A location that is not a gap, as the warning names it. */
function nameOf(location: unknown): string | undefined {
  if (location === null || location === undefined || location === '') return undefined;
  if (typeof location === 'number' && Number.isNaN(location)) return undefined;
  return typeof location === 'string' ? location : String(location as number);
}

/** One answer and what it was computed from. */
interface Hit {
  readonly mode: LocationMode;
  /** The feature array or the `geojson` object the features came from. */
  readonly owner: object;
  readonly featureidkey: string;
  readonly result: LocationsResult;
}

const RESULTS = new WeakMap<object, Hit[]>();
/** Answers kept per `locations` array: a figure switches between few basemaps. */
const KEPT = 4;
/** Unmatched locations named in the warning. */
const NAMED = 10;

const WHAT: Readonly<Record<LocationMode, string>> = {
  'ISO-3': 'no country of the base map by its ISO-3 code',
  'USA-states': 'no US state of the base map',
  'country names': 'no country of the base map',
  'geojson-id': 'no Polygon or MultiPolygon feature of `geojson`',
};

function warnUnmatched(request: LocationsRequest, unmatched: readonly string[]): void {
  const n = unmatched.length;
  const names = unmatched.slice(0, NAMED).map((name) => JSON.stringify(name));
  const key = request.locationmode === 'geojson-id' ? ` at '${request.featureidkey}'` : '';
  console.warn(
    `[holochart] ${request.label ?? 'a trace'}: ${n} ${n === 1 ? 'location matches' : 'locations match'} ` +
      `${WHAT[request.locationmode]}${key} (locationmode '${request.locationmode}') and ` +
      `${n === 1 ? 'is' : 'are'} not drawn: ${names.join(', ')}` +
      `${n > NAMED ? `, and ${n - NAMED} more` : ''}.`,
  );
}

/**
 * The features and points the `locations` of a trace name, or `undefined` while `source` lacks
 * what the trace's mode needs (the basemap layer, the parsed `geojson`, the country-name lookup).
 *
 * - A location that is `null`, `undefined`, `''` or NaN is a gap: no feature and no warning.
 * - Any other location that names no feature is skipped, and is in `unmatched`. The first time an
 *   answer is computed, one `console.warn` names the unmatched locations (the first ten).
 * - A `geojson` that is neither a `FeatureCollection` nor a `Feature` matches nothing, and the
 *   warning says so instead.
 *
 * The answer is cached by the `locations` array, the mode, the features matched against (the
 * layer of the basemap, or the `geojson` object) and `featureidkey`: asking again on every layout
 * pass costs a lookup, and the features of two answers over the same source are the same objects.
 */
export function locate(
  request: LocationsRequest,
  source: LocationsSource,
): LocationsResult | undefined {
  const { locations, locationmode: mode } = request;
  const custom = mode === 'geojson-id';
  const featureidkey = custom ? request.featureidkey : '';

  // What the features come from; its identity is the cache key.
  let owner: object | undefined;
  if (custom) {
    owner =
      typeof source.geojson === 'object' && source.geojson !== null ? source.geojson : undefined;
  } else if (mode === 'USA-states') {
    owner = source.layers?.subunits;
  } else {
    owner = source.layers?.countries;
    if (mode === 'country names' && !source.countryNames) return undefined;
  }
  if (!owner) return undefined;

  let hits = RESULTS.get(locations);
  const hit = hits?.find(
    (h) => h.mode === mode && h.owner === owner && h.featureidkey === featureidkey,
  );
  if (hit) return hit.result;

  const index = custom
    ? geojsonIndex(owner, featureidkey)
    : layerIndex(owner as readonly AreaFeature[], mode === 'USA-states');
  const idOf = (location: string): string | undefined =>
    mode === 'ISO-3'
      ? location.trim().toUpperCase()
      : mode === 'USA-states'
        ? usaStateCode(location)
        : mode === 'country names'
          ? source.countryNames?.(location)
          : location;

  const n = locations.length;
  const features = new Array<LocatedFeature | undefined>(n).fill(undefined);
  const lon = new Float64Array(n).fill(NaN);
  const lat = new Float64Array(n).fill(NaN);
  const unmatched = new Set<string>();
  for (let i = 0; i < n; i++) {
    const location = locations[i];
    const name = nameOf(location);
    if (name === undefined) continue;
    // Only a `geojson` has ids that are numbers.
    const id = typeof location === 'string' || custom ? idOf(name) : undefined;
    const slot = id === undefined ? undefined : index?.get(id);
    if (!slot) {
      unmatched.add(name);
      continue;
    }
    const feature = located(slot, id as string, custom);
    features[i] = feature;
    lon[i] = feature.point[0];
    lat[i] = Number.isNaN(feature.point[0]) ? NaN : feature.point[1];
  }
  const result: LocationsResult = { features, lon, lat, unmatched: [...unmatched] };

  if (!index) {
    console.warn(
      `[holochart] ${request.label ?? 'a trace'}: \`geojson\` is neither a FeatureCollection ` +
        "nor a Feature; its locations (locationmode 'geojson-id') are not drawn.",
    );
  } else if (result.unmatched.length > 0) {
    warnUnmatched(request, result.unmatched);
  }

  if (!hits) RESULTS.set(locations, (hits = []));
  hits.push({ mode, owner, featureidkey, result });
  if (hits.length > KEPT) hits.shift();
  return result;
}
