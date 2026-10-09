/**
 * Constants of the `geo` subplot, ported from plotly.js (`src/plots/geo/constants.js`, MIT): the
 * projection names, the limits of the clipped projections, the defaults of each scope and the
 * order of the base layers.
 */
import type { GeoScope } from './types.ts';

/**
 * Plotly's `projection.type` names that `d3-geo` itself has, with the name of its factory
 * (ADR-026: these are in the package's initial code).
 */
export const D3_GEO_PROJECTIONS = {
  'albers usa': 'geoAlbersUsa',
  albers: 'geoAlbers',
  'azimuthal equal area': 'geoAzimuthalEqualArea',
  'azimuthal equidistant': 'geoAzimuthalEquidistant',
  'conic conformal': 'geoConicConformal',
  'conic equal area': 'geoConicEqualArea',
  'conic equidistant': 'geoConicEquidistant',
  'equal earth': 'geoEqualEarth',
  equirectangular: 'geoEquirectangular',
  gnomonic: 'geoGnomonic',
  mercator: 'geoMercator',
  // Plotly's `naturalEarth` is `geoNaturalEarth1` since d3-geo 3.
  'natural earth': 'geoNaturalEarth1',
  'natural earth1': 'geoNaturalEarth1',
  orthographic: 'geoOrthographic',
  stereographic: 'geoStereographic',
  'transverse mercator': 'geoTransverseMercator',
} as const satisfies Record<string, string>;

/**
 * Plotly's `projection.type` names that need `d3-geo-projection`, with the name of its factory
 * (ADR-026: one lazy chunk, loaded when a figure names one of them).
 */
export const D3_GEO_PROJECTION_PROJECTIONS = {
  airy: 'geoAiry',
  aitoff: 'geoAitoff',
  august: 'geoAugust',
  baker: 'geoBaker',
  bertin1953: 'geoBertin1953',
  boggs: 'geoBoggs',
  bonne: 'geoBonne',
  bottomley: 'geoBottomley',
  bromley: 'geoBromley',
  collignon: 'geoCollignon',
  craig: 'geoCraig',
  craster: 'geoCraster',
  'cylindrical equal area': 'geoCylindricalEqualArea',
  'cylindrical stereographic': 'geoCylindricalStereographic',
  eckert1: 'geoEckert1',
  eckert2: 'geoEckert2',
  eckert3: 'geoEckert3',
  eckert4: 'geoEckert4',
  eckert5: 'geoEckert5',
  eckert6: 'geoEckert6',
  eisenlohr: 'geoEisenlohr',
  fahey: 'geoFahey',
  'foucaut sinusoidal': 'geoFoucautSinusoidal',
  foucaut: 'geoFoucaut',
  ginzburg4: 'geoGinzburg4',
  ginzburg5: 'geoGinzburg5',
  ginzburg6: 'geoGinzburg6',
  ginzburg8: 'geoGinzburg8',
  ginzburg9: 'geoGinzburg9',
  'gringorten quincuncial': 'geoGringortenQuincuncial',
  gringorten: 'geoGringorten',
  guyou: 'geoGuyou',
  hammer: 'geoHammer',
  hill: 'geoHill',
  homolosine: 'geoHomolosine',
  hufnagel: 'geoHufnagel',
  hyperelliptical: 'geoHyperelliptical',
  kavrayskiy7: 'geoKavrayskiy7',
  lagrange: 'geoLagrange',
  larrivee: 'geoLarrivee',
  laskowski: 'geoLaskowski',
  loximuthal: 'geoLoximuthal',
  miller: 'geoMiller',
  mollweide: 'geoMollweide',
  'mt flat polar parabolic': 'geoMtFlatPolarParabolic',
  'mt flat polar quartic': 'geoMtFlatPolarQuartic',
  'mt flat polar sinusoidal': 'geoMtFlatPolarSinusoidal',
  'natural earth2': 'geoNaturalEarth2',
  'nell hammer': 'geoNellHammer',
  nicolosi: 'geoNicolosi',
  patterson: 'geoPatterson',
  'peirce quincuncial': 'geoPeirceQuincuncial',
  polyconic: 'geoPolyconic',
  'rectangular polyconic': 'geoRectangularPolyconic',
  robinson: 'geoRobinson',
  satellite: 'geoSatellite',
  'sinu mollweide': 'geoSinuMollweide',
  sinusoidal: 'geoSinusoidal',
  times: 'geoTimes',
  'van der grinten': 'geoVanDerGrinten',
  'van der grinten2': 'geoVanDerGrinten2',
  'van der grinten3': 'geoVanDerGrinten3',
  'van der grinten4': 'geoVanDerGrinten4',
  wagner4: 'geoWagner4',
  wagner6: 'geoWagner6',
  wiechel: 'geoWiechel',
  'winkel tripel': 'geoWinkel3',
  winkel3: 'geoWinkel3',
} as const satisfies Record<string, string>;

/** A `projection.type` drawn by `d3-geo` itself. */
export type BuiltinProjectionType = keyof typeof D3_GEO_PROJECTIONS;
/** A `projection.type` drawn by `d3-geo-projection`. */
export type ExtraProjectionType = keyof typeof D3_GEO_PROJECTION_PROJECTIONS;

/**
 * The 3D globe (backlog GEO8, ADR-028): the one `projection.type` that is Holochart's own and not
 * one of Plotly's, which is why it is in neither table above. Its view is the orthographic one
 * (`geoOrthographic`, the same spans, clip angle, fit and interaction); what differs is how the
 * subplot is drawn, as a sphere in a 3D viewport.
 */
export const GLOBE_PROJECTION = 'globe3d' as const;
export type GlobeProjectionType = typeof GLOBE_PROJECTION;

/** Every `projection.type` value: Plotly's, as Plotly spells them, and the globe. */
export type ProjectionType = BuiltinProjectionType | ExtraProjectionType | GlobeProjectionType;

/** Every `projection.type` value, sorted (the schema's enumeration). */
export const PROJECTION_TYPES: readonly ProjectionType[] = [
  ...(Object.keys(D3_GEO_PROJECTIONS) as ProjectionType[]),
  ...(Object.keys(D3_GEO_PROJECTION_PROJECTIONS) as ProjectionType[]),
  GLOBE_PROJECTION as ProjectionType,
].sort();

/**
 * Largest span of longitude a projection can show, in degrees; `'*'` is every other type. The
 * types named here are the clipped ones (Plotly's `_isClipped`).
 */
export const LONAXIS_SPAN: Readonly<Record<string, number>> = {
  orthographic: 180,
  'azimuthal equal area': 360,
  'azimuthal equidistant': 360,
  'conic conformal': 180,
  gnomonic: 160,
  stereographic: 180,
  'transverse mercator': 180,
  // Not Plotly's: the globe shows the hemisphere the orthographic projection shows.
  [GLOBE_PROJECTION]: 180,
  '*': 360,
};

/** Largest span of latitude a projection can show, in degrees; `'*'` is every other type. */
export const LATAXIS_SPAN: Readonly<Record<string, number>> = {
  'conic conformal': 150,
  stereographic: 179.5,
  '*': 180,
};

/** Projections that `fitbounds` cannot fit. */
export const FITBOUNDS_INCOMPATIBLE: ReadonlySet<string> = new Set([
  'albers usa',
  'craig',
  'peirce quincuncial',
  'satellite',
]);

/** What a scope sets when the figure does not. */
export interface ScopeDefaults {
  readonly lonaxisRange: readonly [number, number];
  readonly lataxisRange: readonly [number, number];
  readonly projType: ProjectionType;
  readonly projRotate?: readonly [number, number, number];
  readonly projParallels?: readonly [number, number];
}

export const SCOPE_DEFAULTS: Readonly<Record<GeoScope, ScopeDefaults>> = {
  world: {
    lonaxisRange: [-180, 180],
    lataxisRange: [-90, 90],
    projType: 'equirectangular',
    projRotate: [0, 0, 0],
  },
  usa: { lonaxisRange: [-180, -50], lataxisRange: [15, 80], projType: 'albers usa' },
  europe: {
    lonaxisRange: [-30, 60],
    lataxisRange: [30, 85],
    projType: 'conic conformal',
    projRotate: [15, 0, 0],
    projParallels: [0, 60],
  },
  asia: {
    lonaxisRange: [22, 160],
    lataxisRange: [-15, 55],
    projType: 'mercator',
    projRotate: [0, 0, 0],
  },
  africa: {
    lonaxisRange: [-30, 60],
    lataxisRange: [-40, 40],
    projType: 'mercator',
    projRotate: [0, 0, 0],
  },
  'north america': {
    lonaxisRange: [-180, -45],
    lataxisRange: [5, 85],
    projType: 'conic conformal',
    projRotate: [-100, 0, 0],
    projParallels: [29.5, 45.5],
  },
  'south america': {
    lonaxisRange: [-100, -30],
    lataxisRange: [-60, 15],
    projType: 'mercator',
    projRotate: [0, 0, 0],
  },
  antarctica: {
    lonaxisRange: [-180, 180],
    lataxisRange: [-90, -60],
    projType: 'equirectangular',
    projRotate: [0, 0, 0],
  },
  oceania: {
    lonaxisRange: [-180, 180],
    lataxisRange: [-50, 25],
    projType: 'equirectangular',
    projRotate: [0, 0, 0],
  },
};

/** Angular pad, in degrees, that keeps rounding errors away from clip angles and range edges. */
export const CLIP_PAD = 0.001;

/** `projection.precision`: the adaptive resampling threshold, in px. */
export const PROJECTION_PRECISION = 0.1;

/** Default fill of land, and of ocean and lakes. */
export const LAND_COLOR = '#F0DC82';
export const WATER_COLOR = '#3399FF';

/** `locationmode` to the base layer whose features it names. */
export const LOCATIONMODE_TO_LAYER = {
  'ISO-3': 'countries',
  'USA-states': 'subunits',
  'country names': 'countries',
} as const;

/** Base layers drawn as fills, and as lines. */
export const FILL_LAYERS = ['ocean', 'land', 'lakes'] as const;
export const LINE_LAYERS = ['subunits', 'countries', 'coastlines', 'rivers', 'frame'] as const;

/** Draw order, bottom to top. `backplot` holds choropleths, `frontplot` scatter traces. */
export const LAYERS = [
  'bg',
  'ocean',
  'land',
  'lakes',
  'subunits',
  'countries',
  'coastlines',
  'rivers',
  'lataxis',
  'lonaxis',
  'frame',
  'backplot',
  'frontplot',
] as const;

/** Draw order when the subplot has a choropleth: rivers and lakes go above the regions. */
export const LAYERS_FOR_CHOROPLETH = [
  'bg',
  'ocean',
  'land',
  'subunits',
  'countries',
  'coastlines',
  'lataxis',
  'lonaxis',
  'frame',
  'backplot',
  'rivers',
  'lakes',
  'frontplot',
] as const;

/** A base layer's name to the prefix of its attributes (`countries` → `countrycolor`). */
export const LAYER_NAME_TO_ADJECTIVE = {
  ocean: 'ocean',
  land: 'land',
  lakes: 'lake',
  subunits: 'subunit',
  countries: 'country',
  coastlines: 'coastline',
  rivers: 'river',
  frame: 'frame',
} as const;
