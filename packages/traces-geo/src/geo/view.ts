/**
 * The view of one geo subplot (backlog GEO2, ADR-025): the d3 projection that a `layout.geo`
 * container describes, fitted to the subplot's rectangle, and the affine that carries geometry
 * projected once to where a pan or zoom has moved it. No rendering and no DOM.
 *
 * Ported from plotly.js `src/plots/geo/geo.js` (MIT): `getProjection` (clip angles, precision,
 * satellite tilt and distance, `isLonLatOverEdges`), `updateProjection` (the pre-fit centre,
 * rotation and parallels, the range box, `fitExtent`, the pixel bounds, the `fitbounds` branch,
 * `projection.scale`, the mid-point translate, the Albers USA centre) and `makeRangeBox`; and
 * from `src/lib/geo_location_utils.js`: `unwrapLonRange` and `boundsOfCoords`.
 *
 * ## Coordinates
 *
 * Everything this module takes and returns in pixels is in **subplot px**: x from the left edge of
 * the subplot's rect, y **up** from its bottom edge, CSS px (the convention of `ProjectedPolygons`
 * in `types.ts`). The one exception is {@link GeoView.projection}, the d3 projection itself, whose
 * pixels have y **down** from the rect's top-left corner: `y_subplot = size.height - y_d3`.
 *
 * ## What a view holds
 *
 * A view is built from one defaulted container and one size, and those fix its projection type,
 * parallels, tilt, distance, clip angle, d3 `center`, fit scale and bounds for its whole life (as
 * Plotly fixes them between two `updateProjection` calls). What changes during an interaction is
 * its {@link GeoViewState}: the rotation, `projection.scale`, and the translate point. A new
 * layout means a new view.
 *
 * ## Base and transform (ADR-025)
 *
 * Geometry is projected at a **base** state and drawn through {@link GeoView.transform}:
 *
 * - A change of `scale` or `translate` is **transform only**. A d3 projection is
 *   `px = k * raw(rotate(lonlat)) + offset`, where `k` is the scale and `offset` depends on the
 *   translate, the scale and d3's `center`, so both are an affine of pixel space, the same one for
 *   every point. This holds for every projection Plotly has, Albers USA included (its three parts
 *   and their inset frames scale and move together). `version` does not change.
 * - A change of `rotation` (`lon`, `lat` or `roll`) **reprojects**: the base becomes the new state,
 *   the transform the identity, and `version` changes.
 * - Type, parallels, tilt, distance and size cannot change within a view. A view built with
 *   `options.previous` keeps that view's base and version when all of those and the rotation are
 *   equal, so the relayout that ends a pan does not reproject. (A new `center` is then transform
 *   only as well: d3's `center` is part of the offset.)
 * - {@link GeoView.rebase} makes the current state the base. Positions under a transform are
 *   exact, but d3 resamples curves to `PROJECTION_PRECISION` px at the scale it projects at, so
 *   after a zoom of 8 a curve can be 5.7 px off (spike F). Rebase and reproject when a zoom settles.
 *
 * Plotly's pan of a scoped map changes `center` in the layout, yet is implemented as a move of the
 * translate point; `center` is read back from the pixel in the middle ({@link GeoView.toLayout}).
 *
 * The projection has no `clipExtent`. Plotly clips each redraw to the bounds of the range box; a
 * view projects once and pans, so what lies outside the bounds at the base state must exist. The
 * subplot clips to {@link GeoView.bounds} with its scissor instead.
 */
import {
  geoAlbers,
  geoBounds,
  geoDistance,
  geoStream,
  type GeoGeometryObjects,
  type GeoProjection,
} from 'd3-geo';
import type { Polygon } from 'geojson';
import type { DataTransform } from '@mk7s/holochart-render';
import {
  CLIP_PAD,
  FITBOUNDS_INCOMPATIBLE,
  LATAXIS_SPAN,
  LONAXIS_SPAN,
  PROJECTION_PRECISION,
  SCOPE_DEFAULTS,
} from './constants.ts';
import {
  createProjection,
  isAlbersUsaProjection,
  isClippedProjection,
  isExtraProjection,
  isSatelliteProjection,
  projectionClipAngle,
} from './projections.ts';
import type { FullGeoLayout, GeoScope } from './types.ts';

type Pair = readonly [number, number];

/**
 * Which of Plotly's three interactions a map has (`createGeoZoom` in plotly.js `zoom.js`):
 * `'scoped'` pans and zooms, `'clipped'` rotates in longitude and latitude, `'unclipped'` rotates
 * in longitude and moves up and down.
 */
export type GeoInteractionMode = 'scoped' | 'clipped' | 'unclipped';

/** Plotly's `_isScoped`: any scope but the world, and every Albers USA map. */
export function isScopedGeo(scope: GeoScope, projectionType: string): boolean {
  return scope !== 'world' || isAlbersUsaProjection(projectionType);
}

/** The interaction of a map. Scoped comes first: a scope's projection can be a clipped one. */
export function geoInteractionMode(scope: GeoScope, projectionType: string): GeoInteractionMode {
  if (isScopedGeo(scope, projectionType)) return 'scoped';
  return isClippedProjection(projectionType) ? 'clipped' : 'unclipped';
}

/** The size of a subplot's rect, in CSS px. */
export interface GeoSize {
  readonly width: number;
  readonly height: number;
}

/** A rectangle in subplot px (y up): `x0 <= x1`, `y0 <= y1`. */
export interface GeoBounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** What an interaction changes about a view. */
export interface GeoViewState {
  /** `projection.rotation` in degrees. d3's `rotate` is `[-lon, -lat, roll]`. */
  readonly rotation: { readonly lon: number; readonly lat: number; readonly roll: number };
  /** `projection.scale`: 1 fits the range box of `lonaxis.range` × `lataxis.range`. */
  readonly scale: number;
  /** d3's translate point, in subplot px (y up): where d3's `center` is drawn. */
  readonly translate: Pair;
}

/** A partial {@link GeoViewState} for {@link GeoView.set}. Values that are not finite are ignored. */
export interface GeoViewPatch {
  readonly rotation?: { readonly lon?: number; readonly lat?: number; readonly roll?: number };
  readonly scale?: number;
  readonly translate?: Pair;
}

/** A view as the layout values Plotly writes after an interaction. */
export interface GeoLayoutView {
  /** `projection.rotation.lon` and `.lat`. */
  readonly rotation: { readonly lon: number; readonly lat: number };
  /**
   * `center.lon` and `.lat`: the longitude and latitude in the middle of the bounds. `null` when
   * the projection has no inverse there (the middle is off the map).
   */
  readonly center: { readonly lon: number; readonly lat: number } | null;
  /** `projection.scale`. */
  readonly scale: number;
}

/**
 * The extent of the data that `fitbounds` fits, from the caller (Plotly finds it through its
 * axis autorange; here the subplot collects it from its traces). Either the bounds themselves, or
 * the coordinates to bound.
 *
 * - `lon` / `lat`: `[west, east]` and `[south, north]` in degrees. An extent that crosses the
 *   antimeridian has `west > east`, or an `east` past 180.
 * - `points`: `[lon, lat]` pairs. Their latitude range is their minimum and maximum; their
 *   longitude range is the narrower of minimum-to-maximum and the smallest arc that holds them
 *   all, so points on both sides of the antimeridian fit as one group (Plotly's `boundsOfCoords`).
 * - `pad`: px to keep free on each side, as Plotly's autorange keeps room for markers. Ignored
 *   when it would leave less than a tenth of the subplot.
 */
export type GeoFit =
  | { readonly lon: Pair; readonly lat: Pair; readonly pad?: number }
  | { readonly points: readonly Pair[]; readonly pad?: number };

/** Options of {@link createGeoView}. */
export interface GeoViewOptions {
  /** The data extent, used when `layout.fitbounds` is on. Without it the axis ranges are fitted. */
  readonly fit?: GeoFit;
  /**
   * The view this one replaces. When both project alike (same type, size, rotation, parallels,
   * tilt and distance), the new view keeps the old base and `version`, and its `transform` carries
   * the geometry already projected to the new centre and scale.
   */
  readonly previous?: GeoView;
}

/** Plotly's `unwrapLonRange`: a `[west, east]` range that crosses the antimeridian gets `east + 360`. */
export function unwrapLonRange(range: Pair): [number, number] {
  return [range[0], range[0] > range[1] ? range[1] + 360 : range[1]];
}

/**
 * Plotly's `makeRangeBox`: the polygon of a longitude and latitude range, wound the way d3 wants
 * (the box is the inside), drawn `CLIP_PAD` inside the range, with the long sides cut in four so
 * that no edge spans 180° or more.
 */
export function makeRangeBox(lon: Pair, lat: Pair): Polygon {
  const [lon0, lon1] = unwrapLonRange([lon[0] + CLIP_PAD, lon[1] - CLIP_PAD]);
  const lat0 = lat[0] + CLIP_PAD;
  const lat1 = lat[1] - CLIP_PAD;
  const dlon4 = (lon1 - lon0) / 4;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lon0, lat0],
        [lon0, lat1],
        [lon0 + dlon4, lat1],
        [lon0 + 2 * dlon4, lat1],
        [lon0 + 3 * dlon4, lat1],
        [lon1, lat1],
        [lon1, lat0],
        [lon1 - dlon4, lat0],
        [lon1 - 2 * dlon4, lat0],
        [lon1 - 3 * dlon4, lat0],
        [lon0, lat0],
      ],
    ],
  };
}

type D3Bounds = [[number, number], [number, number]];

const noop = (): void => {};

/**
 * The pixel bounds of `object` as `projection` draws it, clipped and resampled: what
 * `geoPath(projection).bounds(object)` returns, without bringing `geoPath` into the bundle.
 */
/** Equal but for rounding (degrees). */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9;
}

function projectedBounds(projection: GeoProjection, object: GeoGeometryObjects): D3Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  geoStream(
    object,
    projection.stream({
      point(x, y) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      },
      lineStart: noop,
      lineEnd: noop,
      polygonStart: noop,
      polygonEnd: noop,
      sphere: noop,
    }),
  );
  return [
    [x0, y0],
    [x1, y1],
  ];
}

/**
 * Whether `fitExtent` found something to fit: a finite scale, and bounds with a width and a height.
 */
function isFit(projection: GeoProjection, bounds: D3Bounds): boolean {
  const scale = projection.scale();
  const w = bounds[1][0] - bounds[0][0];
  const h = bounds[1][1] - bounds[0][1];
  return (
    scale > 0 && Number.isFinite(scale) && w > FIT_EPSILON && h > FIT_EPSILON && w + h < Infinity
  );
}

/**
 * Bounds thinner than this, in px, are a line or a point: the fit did not see the range box. (The
 * sliver d3 leaves of a box that touches the clip circle is 5e-5 px thick in a 450 px subplot.)
 */
const FIT_EPSILON = 1e-3;

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function num(v: unknown, fallback: number): number {
  return finite(v) ? v : fallback;
}

function finitePair(p: readonly unknown[] | null | undefined): p is [number, number] {
  return p != null && finite(p[0]) && finite(p[1]);
}

/**
 * The range a linear axis of `length` px gives data from `min` to `max` with `pad` px free on each
 * side: the part of Plotly's `getAutoRange` that a geo axis uses. One value gets a degree on each
 * side; a pad that leaves less than a tenth of the axis is dropped.
 */
function autoRange(min: number, max: number, pad: number, length: number): [number, number] {
  if (min === max) return [min - 1, max + 1];
  const usable = length - 2 * pad;
  if (!(pad > 0) || !(usable > length / 10)) return [min, max];
  const perPx = (max - min) / usable;
  return [min - perPx * pad, max + perPx * pad];
}

interface FitRanges {
  lon: [number, number];
  lat: [number, number];
}

/**
 * The longitude and latitude ranges `fitbounds` fits (Plotly's `axLon.range` and `axLat.range`),
 * or `undefined` when the caller gave no usable extent.
 */
function fitRanges(fit: GeoFit | undefined, size: GeoSize): FitRanges | undefined {
  if (!fit) return undefined;
  const pad = Math.max(0, num(fit.pad, 0));
  if ('points' in fit) {
    let lonMin = Infinity;
    let lonMax = -Infinity;
    let latMin = Infinity;
    let latMax = -Infinity;
    const points: [number, number][] = [];
    for (const p of fit.points) {
      if (!finitePair(p)) continue;
      points.push([p[0], p[1]]);
      if (p[0] < lonMin) lonMin = p[0];
      if (p[0] > lonMax) lonMax = p[0];
      if (p[1] < latMin) latMin = p[1];
      if (p[1] > latMax) latMax = p[1];
    }
    if (points.length === 0) return undefined;
    let lon = autoRange(lonMin, lonMax, pad, size.width);
    // Minimum to maximum is the long way round for points on both sides of the antimeridian.
    // `geoBounds` of all of them at once finds the smallest arc that holds them.
    if (points.length > 1) {
      const [[west], [east]] = geoBounds({ type: 'MultiPoint', coordinates: points });
      const arc = unwrapLonRange([west, east]);
      const arcSpan = arc[1] - arc[0];
      const span = lonMax - lonMin;
      if (span > 360 || (span < 360 && arcSpan < span)) {
        const usable = size.width - 2 * pad;
        const padded = usable > size.width / 10 ? (arcSpan * size.width) / usable : arcSpan;
        const mid = (arc[0] + arc[1]) / 2;
        lon = [mid - padded / 2, mid + padded / 2];
      }
    }
    return { lon, lat: autoRange(latMin, latMax, pad, size.height) };
  }
  if (!finitePair(fit.lon) || !finitePair(fit.lat)) return undefined;
  const [west, east] = unwrapLonRange(fit.lon);
  return {
    lon: autoRange(west, east, pad, size.width),
    lat: autoRange(
      Math.min(fit.lat[0], fit.lat[1]),
      Math.max(fit.lat[0], fit.lat[1]),
      pad,
      size.height,
    ),
  };
}

/** The methods a d3 projection may lack (Albers USA has none of them). */
interface OptionalMethods {
  center?: (center: [number, number]) => unknown;
  rotate?: (angles: [number, number, number]) => unknown;
  clipAngle?: ((angle: number) => unknown) & (() => number | null);
  parallels?: (parallels: [number, number]) => unknown;
  tilt?: (degrees: number) => unknown;
  distance?: (radii: number) => unknown;
}

function has<K extends keyof OptionalMethods>(
  projection: GeoProjection,
  method: K,
): projection is GeoProjection & Required<Pick<OptionalMethods, K>> {
  return typeof (projection as unknown as OptionalMethods)[method] === 'function';
}

/** What projected geometry was made with: a scale, and where one point of the sphere fell. */
interface Base {
  /** d3's scale at the base state. */
  readonly k: number;
  /** A `[lon, lat]` whose pixel is finite at this rotation, or `null` when none was found. */
  readonly point: Pair | null;
  /** Where `point` is at the base state, in d3 px. */
  readonly px: Pair | null;
}

/** A point of the contiguous states, inside every clip of Albers USA. */
const ALBERS_USA_PROBE: Pair = [-98, 39];

/** Offsets from the rotation's centre to try as the probe point, in degrees. */
const PROBE_OFFSETS: readonly Pair[] = [
  [0, 0],
  [10, 5],
  [-15, -10],
];

/**
 * How far a pixel may be from where its own longitude and latitude are drawn and still count as
 * on the map (Plotly's `INSIDETOLORANCEPXS`).
 */
export const INSIDE_TOLERANCE_PX = 2;

/** Views share one counter, so a version names one projection of one view and nothing else. */
let versions = 0;

/**
 * One geo subplot's projection and view. Build it with {@link createGeoView}.
 *
 * To draw: stream geometry through {@link projection} (or project points with {@link project}),
 * remember {@link version}, and give the primitives {@link transform} on every frame. Reproject
 * when `version` has changed. When a zoom has settled, call {@link rebase} and reproject.
 */
export class GeoView {
  /** The container this view was built from. */
  readonly layout: FullGeoLayout;
  /** `projection.type`. */
  readonly type: string;
  /** Which of Plotly's interactions the map has. */
  readonly mode: GeoInteractionMode;
  /** The subplot's rect; {@link projection} draws into `[0, width] × [0, height]`, y down. */
  readonly size: GeoSize;
  /**
   * The d3 projection at the **current** state, for streaming geometry (`projection.stream`) and
   * for d3's own helpers. Its output is d3 px: x from the left edge of the subplot's rect, y
   * **down** from its top edge, so a sink writes `size.height - y` to get subplot px. It has no
   * `clipExtent`; clip to {@link bounds}.
   *
   * Geometry streamed here is at the current state, while {@link transform} applies to geometry of
   * the base state: call {@link rebase} before projecting unless `version` has just changed.
   * Do not call its setters; change the view with {@link set}.
   */
  readonly projection: GeoProjection;
  /** d3's scale when `projection.scale` is 1 (Plotly's `fitScale`). */
  readonly fitScale: number;
  /**
   * The pixel bounds of the range box at the fitted view (Plotly's `this.bounds`): the clip
   * rectangle of the map and its background. It does not move with a pan or zoom.
   */
  readonly bounds: GeoBounds;
  /** The middle of {@link bounds} (Plotly's `midPt`), where `center` is read back from. */
  readonly midPoint: Pair;
  /** The least and greatest `projection.scale` an interaction may reach (`minscale`, `maxscale`). */
  readonly scaleExtent: Pair;
  /** The ranges of the range box: the axis ranges, or what `fitbounds` made of them. */
  readonly ranges: { readonly lon: Pair; readonly lat: Pair };
  /** The state the layout (and the fit) describe, before any interaction. */
  readonly initialState: GeoViewState;
  /**
   * The angle from the rotation's centre past which a point is hidden, in degrees, or `null` when
   * the projection shows the whole sphere.
   */
  readonly clipAngle: number | null;
  /** `false` when the fit failed (an empty rect or ranges d3 cannot bound): nothing can be drawn. */
  readonly valid: boolean;

  readonly #albersUsa: boolean;
  /** The clip angle Plotly sets, before `CLIP_PAD`; `null` leaves d3's own. */
  readonly #setClipAngle: number | null;
  /** d3's `center`: Plotly's `[center.lon - rotation.lon, center.lat - rotation.lat]`. */
  readonly #center: [number, number];
  readonly #parallels: [number, number] | undefined;
  readonly #tilt: number;
  readonly #distance: number;
  /** The contiguous states' projection alone, which answers where Albers USA's clips say nothing. */
  readonly #lower48: GeoProjection | undefined;
  #scratch: GeoProjection | undefined;
  #scratchState: GeoViewState | undefined;
  #state: GeoViewState;
  #base: Base;
  #version: number;
  #transform: DataTransform;

  /** @internal Use {@link createGeoView}. */
  constructor(layout: FullGeoLayout, size: GeoSize, options: GeoViewOptions = {}) {
    const projLayout = layout.projection;
    const type = projLayout.type;
    const projection = createProjection(type);
    if (!projection) {
      throw new Error(
        isExtraProjection(type)
          ? `The projection '${type}' is not loaded: await loadProjection('${type}') first.`
          : `Unknown geo projection type '${type}'.`,
      );
    }
    const width = Math.max(0, num(size.width, 0));
    const height = Math.max(0, num(size.height, 0));
    const scoped = isScopedGeo(layout.scope, type);
    const clipped = isClippedProjection(type);

    this.layout = layout;
    this.type = type;
    this.mode = geoInteractionMode(layout.scope, type);
    this.size = { width, height };
    this.projection = projection;
    this.#albersUsa = isAlbersUsaProjection(type);
    this.#lower48 = this.#albersUsa ? geoAlbers() : undefined;
    this.#tilt = num(projLayout.tilt, 0);
    this.#distance = num(projLayout.distance, 2);
    this.#setClipAngle = projectionClipAngle(type, this.#distance);
    this.#parallels = finitePair(projLayout.parallels)
      ? [projLayout.parallels[0], projLayout.parallels[1]]
      : undefined;

    let center = { lon: num(layout.center?.lon, 0), lat: num(layout.center?.lat, 0) };
    let rotation = {
      lon: num(projLayout.rotation?.lon, 0),
      lat: num(projLayout.rotation?.lat, 0),
      roll: num(projLayout.rotation?.roll, 0),
    };
    const lonHalf = (LONAXIS_SPAN[type] ?? 360) / 2;
    const latHalf = (LATAXIS_SPAN[type] ?? 180) / 2;
    const scope = SCOPE_DEFAULTS[layout.scope];
    let lonRange: Pair = finitePair(layout.lonaxis?.range)
      ? layout.lonaxis.range
      : scoped
        ? scope.lonaxisRange
        : [rotation.lon - lonHalf, rotation.lon + lonHalf];
    let latRange: Pair = finitePair(layout.lataxis?.range)
      ? layout.lataxis.range
      : scoped
        ? scope.lataxisRange
        : [rotation.lat - latHalf, rotation.lat + latHalf];

    // `fitbounds`: the view comes from the data's extent, and which attributes it sets depends on
    // the kind of map. With no extent the axis ranges stand in for it, as in Plotly.
    const fitting = layout.fitbounds !== false && !FITBOUNDS_INCOMPATIBLE.has(type);
    let fitted: FitRanges | undefined;
    if (fitting) {
      fitted = fitRanges(options.fit, { width, height }) ?? {
        lon: unwrapLonRange(lonRange),
        lat: [latRange[0], latRange[1]],
      };
      const midLon = (fitted.lon[0] + fitted.lon[1]) / 2;
      const midLat = (fitted.lat[0] + fitted.lat[1]) / 2;
      center = { lon: midLon, lat: midLat };
      if (scoped) {
        // A scope keeps its ranges and rotation; only the centre and the scale follow the data.
      } else if (clipped) {
        // Turn the globe to the data and show the projection's whole span around it.
        rotation = { lon: midLon, lat: midLat, roll: rotation.roll };
        lonRange = [midLon - lonHalf, midLon + lonHalf];
        latRange = [midLat - latHalf, midLat + latHalf];
      } else {
        rotation = { lon: midLon, lat: rotation.lat, roll: rotation.roll };
      }
    }
    this.ranges = { lon: [lonRange[0], lonRange[1]], lat: [latRange[0], latRange[1]] };
    this.#center = [center.lon - rotation.lon, center.lat - rotation.lat];

    // The 'pre-fit' projection, then scale and translate fitted to the range box.
    this.#configure(projection);
    if (has(projection, 'rotate')) projection.rotate([-rotation.lon, -rotation.lat, rotation.roll]);
    // A globe (orthographic, or the 3D globe that is drawn like it) shows the hemisphere around
    // its rotation, and its range box is that hemisphere's: sides a quarter turn from the centre
    // both ways. Plotly fits the box, which d3 has to clip to the hemisphere first, and at some
    // rotations what is left of the box is not the whole disc: at lon −45, lat 28 its bounds are
    // twice as wide as high and the globe comes out 1.5 times too large (so a drag that happened
    // to end there made the map jump). The outline of the sphere is the disc at every rotation,
    // and is what that fit means, so it is fitted instead.
    const hemisphere =
      !scoped &&
      this.#setClipAngle === 90 &&
      lonHalf === 90 &&
      latHalf === 90 &&
      near(lonRange[0], rotation.lon - 90) &&
      near(lonRange[1], rotation.lon + 90) &&
      near(latRange[0], rotation.lat - 90) &&
      near(latRange[1], rotation.lat + 90);
    const rangeBox: GeoGeometryObjects = hemisphere
      ? { type: 'Sphere' }
      : makeRangeBox(lonRange, latRange);
    const extent: [[number, number], [number, number]] = [
      [0, 0],
      [width, height],
    ];
    projection.fitExtent(extent, rangeBox);
    let b = projectedBounds(projection, rangeBox);
    if (!hemisphere && !isFit(projection, b) && width > 0 && height > 0) {
      // Plotly's range box of a clipped world map has its sides `half - CLIP_PAD` from the
      // rotation's centre, and the clip circle has that radius: at `rotation.lat` 0 they touch, at
      // one point each. d3 then finds the circle inside the box (the fit Plotly means), or misses
      // it (no bounds, a scale of Infinity), or keeps the two points alone (bounds 5e-5 px high,
      // a map 1.5 times too large), as rounding has it: a gnomonic map failed at 4 longitudes in
      // 10. Fit a box whose sides stand clear of the circle instead, which is the same fit.
      const [west, east] = unwrapLonRange(lonRange);
      if (east - west + 4 * CLIP_PAD < 360) {
        const clear = makeRangeBox([west - 2 * CLIP_PAD, east + 2 * CLIP_PAD], latRange);
        projection.fitExtent(extent, clear);
        b = projectedBounds(projection, clear);
      }
    }
    const fitScale = projection.scale();
    this.fitScale = fitScale;
    this.valid =
      fitScale > 0 &&
      Number.isFinite(fitScale) &&
      Number.isFinite(b[0][0] + b[0][1] + b[1][0] + b[1][1]);

    let scale = Math.max(0, num(projLayout.scale, 1)) || 1;
    if (fitted) {
      // How much larger the range box is than the data, in whichever direction is tighter.
      const b2 = projectedBounds(projection, makeRangeBox(fitted.lon, fitted.lat));
      const k2 = Math.min(
        (b[1][0] - b[0][0]) / (b2[1][0] - b2[0][0]),
        (b[1][1] - b[0][1]) / (b2[1][1] - b2[0][1]),
      );
      scale = Number.isFinite(k2) && k2 > 0 ? k2 : 1;
    }

    // `minscale` and `maxscale` are relative to the fitted scale, and may come in either order.
    const minscale = Math.max(0, num(projLayout.minscale, 0));
    const maxscale = finite(projLayout.maxscale) ? Math.max(0, projLayout.maxscale) : Infinity;
    this.scaleExtent = [Math.min(minscale, maxscale), Math.max(minscale, maxscale)];

    // The middle of the bounds becomes the translate point, so `center` is drawn there.
    const mid: [number, number] = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
    this.bounds = { x0: b[0][0], y0: height - b[1][1], x1: b[1][0], y1: height - b[0][1] };
    this.midPoint = [mid[0], height - mid[1]];
    projection.scale(fitScale * scale).translate(mid);

    // Albers USA has no `center`: move the translate point so that `layout.center` is drawn in the
    // middle. Where the composite clips the centre away (a pan left the country), the projection
    // of the contiguous states places it, which is also what `invert` used to find that centre.
    let translate = mid;
    if (this.#lower48) {
      const lonlat: [number, number] = [center.lon, center.lat];
      const at = projection(lonlat) ?? this.#lower48.scale(fitScale * scale).translate(mid)(lonlat);
      if (finitePair(at)) translate = [2 * mid[0] - at[0], 2 * mid[1] - at[1]];
      projection.translate(translate);
    }

    this.clipAngle = this.#setClipAngle ?? this.#ownClipAngle();
    this.#state = { rotation, scale, translate: [translate[0], height - translate[1]] };
    this.initialState = this.#state;
    this.#base = this.#baseNow();
    this.#version = ++versions;
    this.#transform = identity();

    const previous = options.previous;
    if (previous && this.#projectsLike(previous) && previous.#base.px) {
      this.#base = previous.#base;
      if (this.#updateTransform()) this.#version = previous.#version;
      else this.#base = this.#baseNow();
    }
  }

  /** The current rotation, scale and translate point. */
  get state(): GeoViewState {
    return this.#state;
  }

  /**
   * Names the projection that geometry was made with. It changes when geometry projected earlier
   * no longer fits this view: after a rotation and after {@link rebase}. It is unique across views,
   * so a view of another type, size or parallels has another version too.
   */
  get version(): number {
    return this.#version;
  }

  /**
   * Carries geometry projected at the base state (subplot px) to where the current pan and zoom
   * draw it: `world = data * scale + offset`. The identity right after a projection.
   */
  get transform(): Readonly<DataTransform> {
    return this.#transform;
  }

  /**
   * Changes the view for an interactive preview. `scale` and `translate` change the transform
   * only; a rotation makes the new state the base and changes `version`. A projection that cannot
   * rotate (Albers USA) ignores `rotation`.
   */
  set(patch: GeoViewPatch): this {
    const s = this.#state;
    const turn = has(this.projection, 'rotate') ? patch.rotation : undefined;
    const rotation = {
      lon: num(turn?.lon, s.rotation.lon),
      lat: num(turn?.lat, s.rotation.lat),
      roll: num(turn?.roll, s.rotation.roll),
    };
    const scale = finite(patch.scale) && patch.scale > 0 ? patch.scale : s.scale;
    const translate: Pair = finitePair(patch.translate)
      ? [patch.translate[0], patch.translate[1]]
      : s.translate;
    const rotated =
      rotation.lon !== s.rotation.lon ||
      rotation.lat !== s.rotation.lat ||
      rotation.roll !== s.rotation.roll;
    const moved =
      scale !== s.scale || translate[0] !== s.translate[0] || translate[1] !== s.translate[1];
    if (!rotated && !moved) return this;

    this.#state = { rotation: rotated ? rotation : s.rotation, scale, translate };
    this.#apply(this.projection, this.#state);
    // Without a point to measure the affine by, what was projected cannot be carried along.
    if (rotated || !this.#updateTransform()) this.#rebaseNow();
    return this;
  }

  /**
   * Makes the current state the base: `transform` becomes the identity and `version` changes, so
   * the caller reprojects. Call it when a zoom has settled (curves resampled at the old scale
   * drift). Returns whether anything changed; a view already at its base is left alone.
   */
  rebase(): boolean {
    const t = this.#transform;
    if (t.scaleX === 1 && t.scaleY === 1 && t.offsetX === 0 && t.offsetY === 0) return false;
    this.#rebaseNow();
    return true;
  }

  /**
   * Where a longitude and latitude are drawn in the current view, in subplot px; `null` when the
   * projection hides the point ({@link isLonLatOverEdges}) or has no finite answer. Points outside
   * {@link bounds} are returned: the subplot's scissor hides those.
   */
  project(lon: number, lat: number): [number, number] | null {
    const px = this.projection([lon, lat]);
    if (!finitePair(px) || this.#beyondClip(lon, lat, this.#state)) return null;
    return [px[0], this.size.height - px[1]];
  }

  /**
   * The longitude and latitude drawn at a subplot px in the current view; `null` when the pixel
   * is off the map. d3's inverses answer for any pixel (off an orthographic disc they give the
   * nearest point of its edge), so a pixel counts as on the map when its longitude and latitude
   * are drawn within {@link INSIDE_TOLERANCE_PX} of it (Plotly's `outside` test) and the
   * projection does not hide them.
   */
  invert(x: number, y: number): [number, number] | null {
    const lonlat = this.invertAt(this.#state, x, y);
    if (!lonlat) return null;
    const back = this.project(lonlat[0], lonlat[1]);
    const near =
      back !== null &&
      Math.abs(back[0] - x) <= INSIDE_TOLERANCE_PX &&
      Math.abs(back[1] - y) <= INSIDE_TOLERANCE_PX;
    return near ? lonlat : null;
  }

  /**
   * Plotly's `isLonLatOverEdges`: whether the projection hides a point, either because it has no
   * pixel for it (outside the three parts of Albers USA) or because it lies past the clip angle
   * (the far side of an orthographic globe).
   */
  isLonLatOverEdges(lon: number, lat: number): boolean {
    return this.projection([lon, lat]) === null || this.#beyondClip(lon, lat, this.#state);
  }

  /**
   * d3's answer for a longitude and latitude at another state of this view, in subplot px, without
   * the clip test of {@link project}. For interaction maths, which asks where things would be.
   */
  projectAt(state: GeoViewState, lon: number, lat: number): [number, number] | null {
    const px = this.#at(state)([lon, lat]);
    return finitePair(px) ? [px[0], this.size.height - px[1]] : null;
  }

  /**
   * d3's inverse at another state of this view, without the on-the-map test of {@link invert};
   * `null` when it is missing or not finite.
   */
  invertAt(state: GeoViewState, x: number, y: number): [number, number] | null {
    const lonlat = this.#at(state).invert?.([x, this.size.height - y]);
    return finitePair(lonlat) ? [lonlat[0], lonlat[1]] : null;
  }

  /**
   * The view as the layout values Plotly writes when an interaction ends: the rotation, the
   * longitude and latitude in the middle of the bounds as `center`, and `projection.scale`.
   * `center` is d3's inverse as it is, which is what Plotly writes.
   */
  toLayout(state: GeoViewState = this.#state): GeoLayoutView {
    const c = this.invertAt(state, this.midPoint[0], this.midPoint[1]);
    return {
      rotation: { lon: state.rotation.lon, lat: state.rotation.lat },
      center: c ? { lon: c[0], lat: c[1] } : null,
      scale: state.scale,
    };
  }

  /** Everything of Plotly's `getProjection` that does not depend on the view's state. */
  #configure(projection: GeoProjection): void {
    projection.precision(PROJECTION_PRECISION);
    if (isSatelliteProjection(this.type)) {
      if (has(projection, 'tilt')) projection.tilt(this.#tilt);
      if (has(projection, 'distance')) projection.distance(this.#distance);
    }
    // The pad keeps rounding at the edge of the hemisphere from drawing the other side.
    if (this.#setClipAngle !== null && has(projection, 'clipAngle')) {
      projection.clipAngle(this.#setClipAngle - CLIP_PAD);
    }
    if (has(projection, 'center')) projection.center(this.#center);
    if (this.#parallels && has(projection, 'parallels')) projection.parallels(this.#parallels);
  }

  /** The clip angle a projection has of its own (Airy's 147°, say), which Plotly leaves in place. */
  #ownClipAngle(): number | null {
    if (!has(this.projection, 'clipAngle')) return null;
    const angle = (this.projection.clipAngle as () => number | null)();
    return finite(angle) && angle > 0 ? angle : null;
  }

  #beyondClip(lon: number, lat: number, state: GeoViewState): boolean {
    if (this.clipAngle === null) return false;
    const angle = geoDistance([lon, lat], [state.rotation.lon, state.rotation.lat]);
    return angle > (this.clipAngle * Math.PI) / 180;
  }

  #apply(projection: GeoProjection, state: GeoViewState): void {
    const { rotation, translate } = state;
    if (has(projection, 'rotate')) projection.rotate([-rotation.lon, -rotation.lat, rotation.roll]);
    projection
      .scale(this.fitScale * state.scale)
      .translate([translate[0], this.size.height - translate[1]]);
  }

  /** The projection at `state`: the view's own for its current state, a second one otherwise. */
  #at(state: GeoViewState): GeoProjection {
    if (state === this.#state) return this.projection;
    if (!this.#scratch) {
      // `createProjection` answered for this type when the view was built.
      this.#scratch = createProjection(this.type) as GeoProjection;
      this.#configure(this.#scratch);
    }
    if (state !== this.#scratchState) {
      this.#apply(this.#scratch, state);
      this.#scratchState = state;
    }
    return this.#scratch;
  }

  /** Where `point` is drawn now, in d3 px, by the maths alone: no clip can say `null`. */
  #probe(point: Pair): [number, number] | null {
    const projection = this.#lower48
      ? this.#lower48.scale(this.projection.scale()).translate(this.projection.translate())
      : this.projection;
    const px = projection([point[0], point[1]]);
    return finitePair(px) ? [px[0], px[1]] : null;
  }

  #baseNow(): Base {
    const k = this.projection.scale();
    if (this.#albersUsa) {
      return { k, point: ALBERS_USA_PROBE, px: this.#probe(ALBERS_USA_PROBE) };
    }
    const { lon, lat } = this.#state.rotation;
    for (const [dLon, dLat] of PROBE_OFFSETS) {
      const point: Pair = [lon + dLon, Math.max(-89, Math.min(89, lat + dLat))];
      const px = this.#probe(point);
      if (px) return { k, point, px };
    }
    return { k, point: null, px: null };
  }

  #rebaseNow(): void {
    this.#base = this.#baseNow();
    this.#version = ++versions;
    this.#transform = identity();
  }

  /**
   * The affine from the base to the current state, measured at the base's probe point: in d3 px
   * `now = z * base + (probeNow - z * probeBase)`, then flipped to y up. Returns `false` when it
   * cannot be measured.
   */
  #updateTransform(): boolean {
    const base = this.#base;
    const z = this.projection.scale() / base.k;
    const now = base.point && this.#probe(base.point);
    if (!now || !base.px || !(z > 0) || !Number.isFinite(z)) return false;
    const offsetX = now[0] - z * base.px[0];
    const offsetY = now[1] - z * base.px[1];
    this.#transform = {
      scaleX: z,
      scaleY: z,
      offsetX,
      offsetY: this.size.height * (1 - z) - offsetY,
    };
    return true;
  }

  /** Whether geometry projected by `other` differs from this view's by an affine only. */
  #projectsLike(other: GeoView): boolean {
    const a = this.#state.rotation;
    const b = other.#state.rotation;
    return (
      other.type === this.type &&
      other.size.width === this.size.width &&
      other.size.height === this.size.height &&
      a.lon === b.lon &&
      a.lat === b.lat &&
      a.roll === b.roll &&
      other.#parallels?.[0] === this.#parallels?.[0] &&
      other.#parallels?.[1] === this.#parallels?.[1] &&
      other.#tilt === this.#tilt &&
      other.#distance === this.#distance
    );
  }
}

function identity(): DataTransform {
  return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
}

/**
 * The view of a geo subplot: the projection that `layout` describes, fitted into a rect of `size`
 * as Plotly fits it into the subplot's domain.
 *
 * Throws when `layout.projection.type` is not ready: a type of the lazy chunk needs
 * `await loadProjection(type)` first (`isProjectionReady` asks without throwing).
 */
export function createGeoView(
  layout: FullGeoLayout,
  size: GeoSize,
  options?: GeoViewOptions,
): GeoView {
  return new GeoView(layout, size, options);
}
