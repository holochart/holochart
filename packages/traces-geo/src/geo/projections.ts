/**
 * The d3 projection behind a `projection.type` (backlog GEO2, ADR-026), and what a type decides
 * about a map.
 *
 * The 15 projections `d3-geo` has are imported here by name and are part of the package's initial
 * code. The 67 that need `d3-geo-projection` live in `projections-extra.ts`, one lazy chunk that
 * {@link loadProjection} imports the first time a figure names one of them.
 *
 * `'globe3d'` ({@link GLOBE_PROJECTION}) is Holochart's own type and in none of Plotly's tables
 * (ADR-028). As a projection it is `geoOrthographic`: every function here answers for it what it
 * answers for `'orthographic'`, and {@link isGlobeProjection} tells the two apart for the code
 * that draws.
 *
 * The predicates are Plotly's derived flags (`_isClipped`, `_isAlbersUsa`, `_isSatellite`,
 * `_isConic` of plotly.js `src/plots/geo/layout_defaults.js`, and the clip angle of `getProjection`
 * in `src/plots/geo/geo.js`, MIT) as functions of the type, so the view and the layout defaults ask
 * the same question the same way.
 */
import {
  geoAlbers,
  geoAzimuthalEqualArea,
  geoAzimuthalEquidistant,
  geoConicConformal,
  geoConicEqualArea,
  geoConicEquidistant,
  geoEqualEarth,
  geoEquirectangular,
  geoGnomonic,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  geoStereographic,
  geoTransverseMercator,
  type GeoProjection,
} from 'd3-geo';
import { albersUsa } from './albers-usa.ts';
import {
  D3_GEO_PROJECTION_PROJECTIONS,
  D3_GEO_PROJECTIONS,
  GLOBE_PROJECTION,
  LONAXIS_SPAN,
  type BuiltinProjectionType,
  type ExtraProjectionType,
  type GlobeProjectionType,
  type ProjectionType,
} from './constants.ts';

export { GLOBE_PROJECTION };

type ProjectionFactory = () => GeoProjection;

/** Plotly's `projection.type` to the factory of its `d3-geo` projection. */
const BUILTIN_PROJECTIONS: Readonly<Record<BuiltinProjectionType, ProjectionFactory>> = {
  // d3's `geoAlbersUsa`, with the lines of its three parts kept apart (`albers-usa.ts`).
  'albers usa': albersUsa,
  albers: geoAlbers,
  'azimuthal equal area': geoAzimuthalEqualArea,
  'azimuthal equidistant': geoAzimuthalEquidistant,
  'conic conformal': geoConicConformal,
  'conic equal area': geoConicEqualArea,
  'conic equidistant': geoConicEquidistant,
  'equal earth': geoEqualEarth,
  equirectangular: geoEquirectangular,
  gnomonic: geoGnomonic,
  mercator: geoMercator,
  'natural earth': geoNaturalEarth1,
  'natural earth1': geoNaturalEarth1,
  orthographic: geoOrthographic,
  stereographic: geoStereographic,
  'transverse mercator': geoTransverseMercator,
};

/** Whether `type` is one of Plotly's projections that `d3-geo` itself has. */
export function isBuiltinProjection(type: string): type is BuiltinProjectionType {
  return Object.hasOwn(D3_GEO_PROJECTIONS, type);
}

/**
 * Whether `type` is the 3D globe, `'globe3d'`: Holochart's own type, drawn as a sphere in a 3D
 * viewport (ADR-028). Everything else about it is the orthographic projection's.
 */
export function isGlobeProjection(type: string): type is GlobeProjectionType {
  return type === GLOBE_PROJECTION;
}

/** Whether `type` is one of the projections of the lazy `d3-geo-projection` chunk. */
export function isExtraProjection(type: string): type is ExtraProjectionType {
  return Object.hasOwn(D3_GEO_PROJECTION_PROJECTIONS, type);
}

/** Whether `type` is a `projection.type`: one of Plotly's, or the globe. */
export function isProjectionType(type: string): type is ProjectionType {
  return isBuiltinProjection(type) || isExtraProjection(type) || isGlobeProjection(type);
}

type ExtraFactories = Readonly<Record<ExtraProjectionType, ProjectionFactory>>;

/** The lazy chunk's table once it has loaded. A failed load leaves both of these unset. */
let extraFactories: ExtraFactories | undefined;
let extraLoading: Promise<ExtraFactories> | undefined;

function loadExtraFactories(): Promise<ExtraFactories> {
  if (extraFactories) return Promise.resolve(extraFactories);
  extraLoading ??= import('./projections-extra.ts').then(
    (chunk) => {
      extraFactories = chunk.EXTRA_PROJECTIONS;
      return extraFactories;
    },
    (cause: unknown) => {
      // Forget the failure, so the next figure that asks tries the network again.
      extraLoading = undefined;
      throw cause;
    },
  );
  return extraLoading;
}

/**
 * The projections with **seams**: lines of the sphere, other than the antimeridian that d3 cuts
 * at, across which the projection jumps from one place of the map to another. They are the four
 * that fold the sphere into squares: a hemisphere fills a square, and where two squares meet only
 * half of the shared side is continuous. d3 does not cut there, so a polygon that crosses a seam
 * comes out with an edge that runs along the side of the square, or across the map, and comes
 * back the same way a few vertices later. Such a ring is not a simple polygon and is filled by
 * the nonzero rule (`projectedFillRule` and "Seams" in `sink.ts`).
 */
const SEAMED_TYPES: ReadonlySet<string> = new Set([
  'gringorten',
  'gringorten quincuncial',
  'guyou',
  'peirce quincuncial',
]);

/** The projections built for a type of {@link SEAMED_TYPES}. */
const seamed = new WeakSet<object>();

/** Whether `projection` was built by this module for a type that has seams. */
export function hasSeams(projection: object): boolean {
  return seamed.has(projection);
}

function built(type: string, projection: GeoProjection): GeoProjection {
  if (SEAMED_TYPES.has(type)) seamed.add(projection);
  return projection;
}

/**
 * Whether {@link createProjection} can build `type` now: always for the `d3-geo` projections and
 * the globe, and for the others once {@link loadProjection} has resolved for any one of them
 * (they share a chunk). An unknown type is never ready.
 */
export function isProjectionReady(type: string): boolean {
  return (
    isBuiltinProjection(type) ||
    isGlobeProjection(type) ||
    (isExtraProjection(type) && extraFactories !== undefined)
  );
}

/**
 * A new d3 projection of `type` with d3's own defaults (scale, translate, and for some
 * projections a rotation, centre or clip angle of their own). `undefined` when the type is not
 * a projection type, or when it needs the lazy chunk and that has not loaded:
 * see {@link isProjectionReady} and {@link loadProjection}.
 */
export function createProjection(type: string): GeoProjection | undefined {
  if (isBuiltinProjection(type)) return BUILTIN_PROJECTIONS[type]();
  // The globe is the orthographic view (ADR-028).
  if (isGlobeProjection(type)) return geoOrthographic();
  if (isExtraProjection(type)) {
    const factory = extraFactories?.[type];
    return factory && built(type, factory());
  }
  return undefined;
}

/**
 * Makes `type` ready and resolves with a new projection of it. Resolves at once for the `d3-geo`
 * projections and the globe; for the others it imports the lazy chunk, once for all of them.
 *
 * The promise always settles. It rejects with an `Error` that names the type when the type is not
 * a projection type or when the chunk fails to load (the failure is the error's `cause`). A failed
 * load is not remembered: the next call imports again.
 */
export function loadProjection(type: string): Promise<GeoProjection> {
  if (isBuiltinProjection(type)) return Promise.resolve(BUILTIN_PROJECTIONS[type]());
  if (isGlobeProjection(type)) return Promise.resolve(geoOrthographic());
  if (!isExtraProjection(type)) {
    return Promise.reject(new Error(`Unknown geo projection type '${type}'.`));
  }
  return loadExtraFactories().then(
    (factories) => built(type, factories[type]()),
    (cause: unknown) => {
      throw new Error(
        `Could not load the projection '${type}': the chunk with the d3-geo-projection ` +
          'projections failed to load.',
        { cause },
      );
    },
  );
}

/** Plotly's `_isAlbersUsa`: the composite projection without `center`, `rotate` or a clip. */
export function isAlbersUsaProjection(type: string): boolean {
  return type === 'albers usa';
}

/** Plotly's `_isSatellite`: the projection that takes `tilt` and `distance`. */
export function isSatelliteProjection(type: string): boolean {
  return type === 'satellite';
}

/**
 * Plotly's `_isConic`: the types that take `projection.parallels`. `'conic'` anywhere in the name
 * counts, as in Plotly, so the two polyconic projections are included although their d3
 * projections have no `parallels`.
 */
export function isConicProjection(type: string): boolean {
  return type.includes('conic') || type === 'albers';
}

/**
 * Plotly's `_isClipped`: the types that show less than the whole sphere and are clipped to a
 * small circle about the rotation's centre (those with an entry in `LONAXIS_SPAN`, the globe
 * among them). A drag rotates these in longitude and latitude, unless the map is scoped.
 */
export function isClippedProjection(type: string): boolean {
  return type !== '*' && Object.hasOwn(LONAXIS_SPAN, type);
}

/**
 * The clip angle Plotly gives a projection, in degrees from the rotation's centre, before the
 * `CLIP_PAD` it subtracts: what a satellite at `distance` Earth radii can see, half the longitude
 * span of a clipped type, and `null` for a type Plotly sets no clip angle on (it keeps d3's).
 */
export function projectionClipAngle(type: string, distance?: number): number | null {
  if (isSatelliteProjection(type)) {
    const angle = (Math.acos(1 / (distance ?? NaN)) * 180) / Math.PI;
    return Number.isFinite(angle) && angle > 0 ? angle : null;
  }
  const span = isClippedProjection(type) ? LONAXIS_SPAN[type] : undefined;
  return span === undefined ? null : span / 2;
}
