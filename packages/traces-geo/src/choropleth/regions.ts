/**
 * The regions of a `choropleth` (backlog GEO4, GEO5, ADR-010, ADR-025): which features are drawn,
 * their polygons projected to the geometry of the subplot view's base state, and the hit test of
 * hover.
 *
 * ## What is drawn
 *
 * {@link drawnRegions}: the locations that name a feature and have a number for `z`, in the order
 * of `locations` (Plotly skips the others, `choropleth/calc.js`). The list is one object per
 * answer of the lookup and set of drawn locations, so a restyle of `z` that keeps the numbers
 * where they were hands the view the list it already projected.
 *
 * ## Winding (GEO5)
 *
 * `d3-geo` fills the inside of a ring that runs clockwise on the sphere; RFC 7946 winds outer
 * rings counter-clockwise, and such a ring is, to d3, the whole globe except the region. The
 * basemap is wound for d3. A feature of the trace's `geojson` is checked ring by ring with
 * `geoArea`: an outer ring that covers more than a hemisphere (an area above 2π) and a hole that
 * covers less are reversed, in a copy of the feature. One warning per `geojson` says that it was
 * rewound. A region that really is larger than a hemisphere cannot be told from one wound the
 * other way, and is rewound too.
 *
 * ## Projection
 *
 * {@link choroplethRegions}: the polygons of the drawn features through `projectPolygons`, taken
 * back to the base state (`GeoSubplot.toBase`), kept per calc and view version. The view, hover
 * and the keyboard stops share them; a pan or a zoom reuses them.
 *
 * ## Hit test
 *
 * {@link regionAt}: a uniform grid over the bounds of the projected polygons lists, per cell, the
 * polygons whose box touches it. A query reads one cell, tests the pointer against the box of each
 * candidate, and runs the crossing-number test on the rings of those whose box holds it (inside
 * the outer ring and inside no hole). The grid is built on the first query after a projection.
 * `flatbush` (render's index of points) is not a dependency of this package; a grid needs none and
 * suits boxes of similar size.
 *
 * On an M1 Max, in Node 26, for 3,000 polygons of 32 vertices (a 60 × 50 grid of cells over the
 * United States): the grid of 55 × 55 cells is built in 0.5 ms, a query takes 0.3 µs, and the
 * whole `hoverPoints` call of a pointer move 1.2 µs on average (a fifth of the moves hit a region
 * and build its label). For the 1,612 polygons (97,000 vertices) of the 50m countries on a natural
 * earth map: 0.4 ms to build, 2 to 3 µs per query (the rings of the one or two countries whose box
 * holds the pointer are walked, and the coasts of Russia or Canada are thousands of vertices), 2.7
 * µs per pointer move.
 */
import { geoArea } from 'd3-geo';
import type { Position } from 'geojson';
import type { LocatedFeature, LocationsRequest, LocationsResult } from '../geo/locations.ts';
import { projectPolygons, type GeoFeatureInput } from '../geo/sink.ts';
import type { GeoSubplot } from '../geo/subplot.ts';
import type { ProjectedPolygons } from '../geo/types.ts';

/** The regions a trace draws (see the module comment). Treat it as frozen: traces share it. */
export interface DrawnRegions {
  /** The index in `locations` of each drawn region, ascending. */
  readonly index: Int32Array;
  /** The feature each drawn region is, as the lookup found it. */
  readonly located: readonly LocatedFeature[];
  /** What is projected for each: the feature, rewound for d3 where it had to be. */
  readonly features: readonly GeoFeatureInput[];
}

// ---- Winding ------------------------------------------------------------------------------------

const HEMISPHERE = 2 * Math.PI;

/** A feature of a `geojson` as it is projected, and how many of its polygons were rewound. */
interface Wound {
  readonly feature: GeoFeatureInput;
  readonly rewound: number;
}

const WOUND = new WeakMap<object, Wound>();
/** The `geojson` sources (objects, and URLs) that were reported as rewound. */
const WARNED_OBJECTS = new WeakSet<object>();
const WARNED_URLS = new Set<string>();

function isRing(v: unknown): v is Position[] {
  return Array.isArray(v) && v.length > 0 && Array.isArray(v[0]);
}

/** `rings` with the rings that are wound against d3 reversed, or `undefined` when none is. */
function rewoundPolygon(rings: unknown): Position[][] | undefined {
  if (!Array.isArray(rings)) return undefined;
  let out: Position[][] | undefined;
  for (let k = 0; k < rings.length; k++) {
    const ring: unknown = rings[k];
    if (!isRing(ring) || ring.length < 4) continue;
    const area = geoArea({ type: 'Polygon', coordinates: [ring] });
    // To d3 an outer ring is the smaller side of its line, and a hole the larger.
    const wrong = k === 0 ? area > HEMISPHERE : area < HEMISPHERE && area > 0;
    if (!wrong) continue;
    out ??= (rings as Position[][]).slice();
    out[k] = ring.slice().reverse();
  }
  return out;
}

/** A feature of a trace's `geojson` wound for d3: itself, or a copy with rings reversed. */
function wound(located: LocatedFeature): Wound {
  const source = located.feature;
  let hit = WOUND.get(source);
  if (hit) return hit;
  const geometry = source.geometry;
  let rewound = 0;
  let feature: GeoFeatureInput = source;
  if (geometry.type === 'Polygon') {
    const rings = rewoundPolygon(geometry.coordinates);
    if (rings) {
      rewound = 1;
      feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: rings } };
    }
  } else if (Array.isArray(geometry.coordinates)) {
    let polygons: Position[][][] | undefined;
    geometry.coordinates.forEach((polygon, p) => {
      const rings = rewoundPolygon(polygon);
      if (!rings) return;
      polygons ??= geometry.coordinates.slice();
      polygons[p] = rings;
      rewound++;
    });
    if (polygons) {
      feature = { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: polygons } };
    }
  }
  hit = { feature, rewound };
  WOUND.set(source, hit);
  return hit;
}

/** Report, once per `geojson`, that `count` of its polygons were rewound. */
function warnRewound(request: LocationsRequest, count: number): void {
  const source: unknown = request.geojson;
  if (typeof source === 'string') {
    if (WARNED_URLS.has(source)) return;
    WARNED_URLS.add(source);
  } else if (typeof source === 'object' && source !== null) {
    if (WARNED_OBJECTS.has(source)) return;
    WARNED_OBJECTS.add(source);
  }
  console.warn(
    `[holochart] ${request.label ?? 'a trace'}: ${count} ${count === 1 ? 'polygon' : 'polygons'} ` +
      'of `geojson` had rings wound the RFC 7946 way (outer rings counter-clockwise) and ' +
      `${count === 1 ? 'was' : 'were'} rewound: d3-geo fills the inside of clockwise rings.`,
  );
}

// ---- What is drawn ------------------------------------------------------------------------------

const DRAWN = new WeakMap<LocationsResult, DrawnRegions[]>();
/** Lists kept per answer of the lookup: a figure switches between few sets of drawn regions. */
const KEPT = 4;

/**
 * The regions of a located trace that are drawn: every location among the first `length` that
 * names a feature and whose `z` is a number. The same object is returned for the same answer and
 * the same set of locations.
 */
export function drawnRegions(
  result: LocationsResult,
  z: ArrayLike<number>,
  length: number,
  request: LocationsRequest,
): DrawnRegions {
  const n = Math.min(length, result.features.length);
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (result.features[i] && Number.isFinite(z[i])) indices.push(i);
  }
  let hits = DRAWN.get(result);
  const hit = hits?.find(
    (h) => h.index.length === indices.length && indices.every((i, k) => h.index[k] === i),
  );
  if (hit) return hit;
  const located: LocatedFeature[] = [];
  const features: GeoFeatureInput[] = [];
  let rewound = 0;
  for (const i of indices) {
    const feature = result.features[i] as LocatedFeature;
    located.push(feature);
    if (feature.custom) {
      const w = wound(feature);
      features.push(w.feature);
      rewound += w.rewound;
    } else features.push(feature.feature);
  }
  if (rewound > 0) warnRewound(request, rewound);
  const drawn: DrawnRegions = { index: Int32Array.from(indices), located, features };
  if (!hits) DRAWN.set(result, (hits = []));
  hits.push(drawn);
  if (hits.length > KEPT) hits.shift();
  return drawn;
}

// ---- Projection ---------------------------------------------------------------------------------

/**
 * Project `features` at the subplot view's current state and take the result to its base state,
 * the coordinates `GeoSubplot.transform` carries to the screen. `featureOf` of the result indexes
 * `features`. `out` is reused when given. The view must be valid.
 */
export function projectRegions(
  features: readonly GeoFeatureInput[],
  subplot: GeoSubplot,
  out?: ProjectedPolygons,
): ProjectedPolygons {
  const view = subplot.view!;
  return subplot.toBase(projectPolygons(view.projection, view.size.height, features, out));
}

/** The projected regions of a trace at one view version. */
export interface ProjectedRegions {
  /** The view version the polygons were projected at. */
  version: number;
  /** The regions they are of; `polygons.featureOf` indexes its lists. */
  drawn: DrawnRegions;
  /** Base-state subplot px. The arrays are reused when the view turns. */
  readonly polygons: ProjectedPolygons;
  /** The hit-test grid of `polygons`, built by the first query. */
  grid: BoxGrid | undefined;
}

/** What {@link choroplethRegions} reads of a calc. */
interface RegionsOwner {
  readonly subplot: GeoSubplot | undefined;
  readonly drawn: DrawnRegions | undefined;
}

const MEMO = new WeakMap<RegionsOwner, ProjectedRegions>();

/**
 * The projected regions of `calc` on its subplot, or `undefined` while there is nothing to
 * project (the trace is not located, no region is drawn, the subplot has no valid view).
 *
 * Kept per calc: asked again at the same view version and for the same drawn regions, the answer
 * is the same object, and nothing is projected. `seed` is what the caller had for an earlier calc
 * of the trace: when it still fits (a restyle of `z` gives a new calc over the same regions) it is
 * taken over instead of projecting again.
 */
export function choroplethRegions(
  calc: RegionsOwner,
  seed?: ProjectedRegions,
): ProjectedRegions | undefined {
  const { subplot, drawn } = calc;
  const view = subplot?.view;
  if (!subplot || !view?.valid || !drawn || drawn.features.length === 0) return undefined;
  let hit = MEMO.get(calc);
  if (!hit && seed) MEMO.set(calc, (hit = seed));
  if (hit?.version === view.version && hit.drawn === drawn) return hit;
  const polygons = projectRegions(drawn.features, subplot, hit?.polygons);
  if (hit) {
    hit.version = view.version;
    hit.drawn = drawn;
    hit.grid = undefined;
  } else MEMO.set(calc, (hit = { version: view.version, drawn, polygons, grid: undefined }));
  return hit;
}

// ---- Hit test -----------------------------------------------------------------------------------

/** Most cells along a side of the grid. */
const MAX_CELLS = 64;

/** A uniform grid over polygon boxes (see the module comment). */
export interface BoxGrid {
  readonly x0: number;
  readonly y0: number;
  /** Cells per px. */
  readonly kx: number;
  readonly ky: number;
  readonly columns: number;
  readonly rows: number;
  /** Per polygon: min x, min y, max x, max y of its outer ring. */
  readonly boxes: Float64Array;
  /** Per cell, the range of `items` that lists its polygons, ascending. */
  readonly starts: Uint32Array;
  readonly items: Uint32Array;
}

/** The end of ring `r`'s vertices. */
function ringEnd(p: ProjectedPolygons, r: number): number {
  return r + 1 < p.ringCount ? (p.rings[r + 1] as number) : p.vertexCount;
}

/** The end of polygon `k`'s rings. */
function polygonEnd(p: ProjectedPolygons, k: number): number {
  return k + 1 < p.polygonCount ? (p.polygons[k + 1] as number) : p.ringCount;
}

/** Build the grid of `polygons`. Linear in the vertices of the outer rings and the cells touched. */
export function buildBoxGrid(polygons: ProjectedPolygons): BoxGrid {
  const { x, y, polygonCount } = polygons;
  const boxes = new Float64Array(polygonCount * 4);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < polygonCount; k++) {
    const outer = polygons.polygons[k] as number;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = polygons.rings[outer] as number, end = ringEnd(polygons, outer); i < end; i++) {
      const px = x[i] as number;
      const py = y[i] as number;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    boxes[4 * k] = minX;
    boxes[4 * k + 1] = minY;
    boxes[4 * k + 2] = maxX;
    boxes[4 * k + 3] = maxY;
    if (minX < x0) x0 = minX;
    if (minY < y0) y0 = minY;
    if (maxX > x1) x1 = maxX;
    if (maxY > y1) y1 = maxY;
  }
  const side = Math.max(1, Math.min(MAX_CELLS, Math.ceil(Math.sqrt(polygonCount))));
  const width = x1 - x0;
  const height = y1 - y0;
  const columns = width > 0 ? side : 1;
  const rows = height > 0 ? side : 1;
  const kx = width > 0 ? columns / width : 0;
  const ky = height > 0 ? rows / height : 0;
  const cellOf = (v: number, origin: number, k: number, count: number): number =>
    Math.max(0, Math.min(count - 1, Math.floor((v - origin) * k)));
  // Two passes: count the polygons of each cell, then list them.
  const starts = new Uint32Array(columns * rows + 1);
  const span = (k: number): [number, number, number, number] => [
    cellOf(boxes[4 * k] as number, x0, kx, columns),
    cellOf(boxes[4 * k + 1] as number, y0, ky, rows),
    cellOf(boxes[4 * k + 2] as number, x0, kx, columns),
    cellOf(boxes[4 * k + 3] as number, y0, ky, rows),
  ];
  for (let k = 0; k < polygonCount; k++) {
    const [c0, r0, c1, r1] = span(k);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) starts[r * columns + c + 1]!++;
    }
  }
  for (let i = 0; i < columns * rows; i++) starts[i + 1]! += starts[i] as number;
  const items = new Uint32Array(starts[columns * rows] as number);
  const next = starts.slice(0, columns * rows);
  for (let k = 0; k < polygonCount; k++) {
    const [c0, r0, c1, r1] = span(k);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) items[next[r * columns + c]!++] = k;
    }
  }
  return { x0, y0, kx, ky, columns, rows, boxes, starts, items };
}

/** Whether `(px, py)` is inside the ring of vertices `[a, b)` (crossing number). */
function pointInRing(
  x: Float64Array,
  y: Float64Array,
  a: number,
  b: number,
  px: number,
  py: number,
): boolean {
  let inside = false;
  for (let i = a, j = b - 1; i < b; j = i++) {
    const yi = y[i] as number;
    const yj = y[j] as number;
    if (
      yi > py !== yj > py &&
      px < (((x[j] as number) - (x[i] as number)) * (py - yi)) / (yj - yi) + (x[i] as number)
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Whether `(px, py)` is in polygon `k`: inside its outer ring and inside none of its holes. */
function inPolygon(p: ProjectedPolygons, k: number, px: number, py: number): boolean {
  const first = p.polygons[k] as number;
  const end = polygonEnd(p, k);
  if (!pointInRing(p.x, p.y, p.rings[first] as number, ringEnd(p, first), px, py)) return false;
  for (let r = first + 1; r < end; r++) {
    if (pointInRing(p.x, p.y, p.rings[r] as number, ringEnd(p, r), px, py)) return false;
  }
  return true;
}

/**
 * The drawn region under the base-state point `(x, y)`, as an index into `regions.drawn`, or -1.
 * Of regions that overlap, the one drawn last (on top) is found.
 */
export function regionAt(regions: ProjectedRegions, x: number, y: number): number {
  const polygons = regions.polygons;
  if (polygons.polygonCount === 0 || !Number.isFinite(x) || !Number.isFinite(y)) return -1;
  const grid = (regions.grid ??= buildBoxGrid(polygons));
  const c = Math.floor((x - grid.x0) * grid.kx);
  const r = Math.floor((y - grid.y0) * grid.ky);
  // The far edges belong to the last cells.
  const column = c === grid.columns && grid.kx > 0 ? c - 1 : c;
  const row = r === grid.rows && grid.ky > 0 ? r - 1 : r;
  if (column < 0 || column >= grid.columns || row < 0 || row >= grid.rows) return -1;
  const cell = row * grid.columns + column;
  const { boxes, items, starts } = grid;
  for (let i = (starts[cell + 1] as number) - 1, a = starts[cell] as number; i >= a; i--) {
    const k = items[i] as number;
    if (
      x < (boxes[4 * k] as number) ||
      y < (boxes[4 * k + 1] as number) ||
      x > (boxes[4 * k + 2] as number) ||
      y > (boxes[4 * k + 3] as number)
    ) {
      continue;
    }
    if (inPolygon(polygons, k, x, y)) return (polygons.featureOf as Uint32Array)[k] as number;
  }
  return -1;
}
