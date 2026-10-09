/**
 * Shared shapes of the `geo` subplot (backlog GEO2): the defaulted `layout.geo` container, the
 * basemap layers, and projected geometry as the render primitives take it. The modules of this
 * folder meet at these types and import nothing else from each other's internals.
 */
import type { Feature, MultiLineString, MultiPolygon, Polygon } from 'geojson';

/** Plotly's `layout.geo.scope` values. */
export type GeoScope =
  | 'world'
  | 'usa'
  | 'europe'
  | 'asia'
  | 'africa'
  | 'north america'
  | 'south america'
  | 'antarctica'
  | 'oceania';

/** `layout.geo.resolution`: the Natural Earth scale denominator in millions. */
export type GeoResolution = 110 | 50;

/** `layout.geo.lonaxis` / `lataxis` after defaults. */
export interface FullGeoAxis {
  range: [number, number];
  showgrid: boolean;
  tick0: number;
  dtick: number;
  gridcolor: string;
  gridwidth: number;
  griddash: string;
}

/** `layout.geo.projection` after defaults. */
export interface FullGeoProjection {
  /** One of Plotly's `projection.type` names, e.g. `'natural earth'`, or Holochart's `'globe3d'`. */
  type: string;
  rotation: { lon: number; lat: number; roll: number };
  /** Conic projections only. */
  parallels?: [number, number];
  /** 1 fits the `lonaxis` / `lataxis` ranges into the subplot's domain. */
  scale: number;
  minscale: number;
  maxscale?: number;
  /** `'satellite'` only. */
  tilt?: number;
  /** `'satellite'` only. */
  distance?: number;
}

/** One `layout.geo` container after defaults (`fullLayout.geo`, `fullLayout.geo2`, …). */
export interface FullGeoLayout {
  domain: { x: [number, number]; y: [number, number]; row?: number; column?: number };
  fitbounds: false | 'locations' | 'geojson';
  resolution: GeoResolution;
  scope: GeoScope;
  projection: FullGeoProjection;
  center: { lon: number; lat: number };
  visible: boolean;
  showcoastlines: boolean;
  coastlinecolor: string;
  coastlinewidth: number;
  showland: boolean;
  landcolor: string;
  showocean: boolean;
  oceancolor: string;
  showlakes: boolean;
  lakecolor: string;
  showrivers: boolean;
  rivercolor: string;
  riverwidth: number;
  showcountries: boolean;
  countrycolor: string;
  countrywidth: number;
  showsubunits: boolean;
  subunitcolor: string;
  subunitwidth: number;
  showframe: boolean;
  framecolor: string;
  framewidth: number;
  bgcolor: string;
  lonaxis: FullGeoAxis;
  lataxis: FullGeoAxis;
  uirevision?: unknown;
  /**
   * The flags below are derived from `scope` and `projection.type` by the layout defaults, which
   * always write them (Plotly writes the same keys on the container). They are optional in the
   * type so that a hand-built container need not carry them: `geoFlags` in `layout-defaults.ts`
   * derives the same values from a scope and a projection type.
   */
  /** The map shows one scope, not the world: its ranges, rotation and parallels come from the scope. */
  readonly _isScoped?: boolean;
  /** `projection.type` is `'satellite'`: `projection.tilt` and `projection.distance` apply. */
  readonly _isSatellite?: boolean;
  /** A conic projection (or `'albers'`): `projection.parallels` applies. */
  readonly _isConic?: boolean;
  /**
   * The projection shows less than the whole sphere (`LONAXIS_SPAN` names its type) and is clipped
   * to a small circle of half that span around the rotation.
   */
  readonly _isClipped?: boolean;
  /** `projection.type` is `'albers usa'`: no rotation and no center of its own; `scope` is `'usa'`. */
  readonly _isAlbersUsa?: boolean;
}

/** Properties of a country feature of the basemap. */
export interface CountryProperties {
  /** English short name, as Natural Earth has it. */
  name: string;
  /** ISO 3166-1 numeric code, when the country has one. */
  n?: string;
  /** A point inside the country to label it at, `[lon, lat]`. */
  ct: [number, number];
}

/** Properties of a subunit feature (a US state and the like). */
export interface SubunitProperties {
  name: string;
  /** ISO 3166-1 alpha-3 code of the country the subunit belongs to. */
  gu: string;
  ct: [number, number];
}

/**
 * The basemap of one resolution and scope, decoded to GeoJSON in degrees (ADR-024). Polygons are
 * wound the way `d3-geo` expects (clockwise outer rings on the sphere), so they stream without a
 * rewind. A layer that failed to load, or was not asked for, is absent.
 */
export interface BasemapLayers {
  /** All land of the scope as one geometry (`showland`). */
  land?: MultiPolygon;
  /** Coastlines: the outline of `land` (`showcoastlines`). */
  coastlines?: MultiLineString;
  /** Country features; `id` is the ISO 3166-1 alpha-3 code (`locationmode: 'ISO-3'`). */
  countries?: Feature<Polygon | MultiPolygon, CountryProperties>[];
  /** Borders between countries, without the coastlines (`showcountries`). */
  borders?: MultiLineString;
  /** `showlakes`. */
  lakes?: MultiPolygon;
  /** `showrivers`. */
  rivers?: MultiLineString;
  /** Subunit features; `id` is the postal code, e.g. `'CA'` (`locationmode: 'USA-states'`). */
  subunits?: Feature<Polygon | MultiPolygon, SubunitProperties>[];
  /** Borders between subunits, without country borders and coastlines (`showsubunits`). */
  subunitBorders?: MultiLineString;
}

/**
 * Polygons projected to subplot px, in the layout of render's `FillGeometryInput`: flat vertex
 * arrays, the start vertex of each ring, and the first ring of each polygon (its outer ring; the
 * rest are holes). Arrays may be longer than what is in use; the counts say how much is.
 *
 * Subplot px are the world units of the subplot's 2D viewport: x from the left edge of the
 * subplot's rect, y **up** from its bottom edge, in CSS px.
 */
export interface ProjectedPolygons {
  x: Float64Array;
  y: Float64Array;
  vertexCount: number;
  rings: Uint32Array;
  ringCount: number;
  polygons: Uint32Array;
  polygonCount: number;
  /**
   * For each polygon, the index of the feature it came from, when features were projected: one
   * feature can become several polygons (a multipolygon, or a polygon cut by the clip edge) or
   * none (wholly clipped away).
   */
  featureOf?: Uint32Array;
}

/**
 * Polylines projected to subplot px, in the layout of render's `LineGeometryInput`: flat vertex
 * arrays and the start vertex of each polyline after the first.
 */
export interface ProjectedLines {
  x: Float64Array;
  y: Float64Array;
  vertexCount: number;
  starts: Uint32Array;
  startCount: number;
}
