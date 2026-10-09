/**
 * Maps (backlog GEO7): `scatterGeo`, `lineGeo` and `choropleth`, px's `scatter_geo` / `line_geo` /
 * `choropleth` — one `scattergeo` or `choropleth` trace per group on a `geo` subplot (one per
 * facet), with the projection, scope, center and fit of px's `configure_geo` on each.
 *
 * The functions only build figures, so they need nothing from the geo package; drawing one does
 * (ADR-026): `import '@mk7s/holochart/geo'`, or `register(...tracesGeo)` from
 * `@mk7s/holochart-traces-geo`.
 */
import { prepare, type Args } from '../core/args.ts';
import type { Config, Grouper, Role } from '../core/config.ts';
import { buildFigure } from '../core/engine.ts';
import { expressFunction } from '../core/render.ts';
import type { DataInput } from '../data/table.ts';
import type {
  AnimationFrameOptions,
  ColumnRef,
  CommonOptions,
  ContinuousColorOptions,
  DiscreteColorOptions,
  ExpressFigure,
  FacetOptions,
  HoverOptions,
  LineDashOptions,
  SymbolOptions,
} from '../options.ts';
import { continuousColor, defined, opacityPatch, sizeref, tailRoles } from './shared.ts';

/** Options every map function takes: the locations and the `geo` subplot. @experimental */
export interface GeoOptions
  extends CommonOptions, DiscreteColorOptions, HoverOptions, FacetOptions, AnimationFrameOptions {
  /**
   * Column of location ids or names (see `locationMode`): the regions of a choropleth, or the
   * places of markers and lines instead of `lat` / `lon`.
   */
  readonly locations?: ColumnRef;
  /**
   * What `locations` name (`locationmode`): `'ISO-3'` country codes (the default), `'USA-states'`,
   * `'country names'`, or `'geojson-id'` (the default with `geojson`).
   */
  readonly locationMode?: 'ISO-3' | 'USA-states' | 'country names' | 'geojson-id';
  /**
   * GeoJSON whose features `locations` refer to: a `FeatureCollection` or `Feature`, or a URL of
   * one. Every trace gets the object itself, not a copy.
   */
  readonly geojson?: object | string;
  /** Key of the `geojson` features matched against `locations` (`featureidkey`). Default `'id'`. */
  readonly featureIdKey?: string;
  /**
   * The map projection (`geo.projection.type`): `'natural earth'`, `'orthographic'`,
   * `'mercator'`, …, or `'globe3d'`, a Holochart extra (a 3D globe). Default: the scope's
   * (`'equirectangular'` for the world).
   */
  readonly projection?: string;
  /**
   * The part of the world the base map covers (`geo.scope`): the world, the USA or a continent.
   * Default `'world'`.
   */
  readonly scope?:
    | 'world'
    | 'usa'
    | 'europe'
    | 'asia'
    | 'africa'
    | 'north america'
    | 'south america'
    | 'antarctica'
    | 'oceania';
  /** The point at the middle of the map, in degrees (`geo.center`). */
  readonly center?: { readonly lat?: number; readonly lon?: number };
  /**
   * Fit the view to the data (`geo.fitbounds`): `'locations'`, `'geojson'` or `false`. Default:
   * unset, so the map fits its locations (Holochart's default); `false` with `animationFrame`, so
   * the view holds still across frames.
   */
  readonly fitBounds?: false | 'locations' | 'geojson';
  /** `false` hides the base map: coastlines, land, borders and the frame (`geo.visible`). */
  readonly basemapVisible?: boolean;
}

/** Options of {@link scatterGeo}: px.scatter_geo's arguments in camelCase. @experimental */
export interface ScatterGeoOptions extends GeoOptions, ContinuousColorOptions, SymbolOptions {
  /** Column of latitudes, in degrees north. */
  readonly lat?: ColumnRef;
  /** Column of longitudes, in degrees east. */
  readonly lon?: ColumnRef;
  /** Column of text drawn at the points. */
  readonly text?: ColumnRef;
  /** Column of marker sizes (area-proportional, the largest `sizeMax` px across). */
  readonly size?: ColumnRef;
  /** Diameter of the largest marker with `size`, in px. Default 20. */
  readonly sizeMax?: number;
  /** Marker opacity, 0–1. */
  readonly opacity?: number;
}

/** Options of {@link lineGeo}: px.line_geo's arguments in camelCase. @experimental */
export interface LineGeoOptions extends GeoOptions, SymbolOptions, LineDashOptions {
  /** Column of latitudes, in degrees north. */
  readonly lat?: ColumnRef;
  /** Column of longitudes, in degrees east. */
  readonly lon?: ColumnRef;
  /** Column of text drawn at the points. */
  readonly text?: ColumnRef;
  /** Column splitting lines within a color group. */
  readonly lineGroup?: ColumnRef;
  /** Show markers at the points. */
  readonly markers?: boolean;
}

/**
 * Options of {@link choropleth}: px.choropleth's arguments in camelCase. `color` is the column of
 * the regions' values: numeric values map to the colorscale, others to one color per value.
 * @experimental
 */
export interface ChoroplethOptions extends GeoOptions, ContinuousColorOptions {}

/** The groupers after the styles: frames, then one geo subplot per facet. */
const CELLS: readonly Grouper[] = [
  { variable: 'animationFrame' },
  { variable: 'facetRow' },
  { variable: 'facetCol' },
];

/**
 * Build a map figure. px writes `locationmode`, `geojson` and `featureidkey` on every trace and
 * `configure_geo` writes the view on every geo subplot. `geojson` is set here by reference: the
 * engine copies a spec's patch per trace, and a copy per group and frame of a large GeoJSON would
 * also hide it from the geo package, which reads each object once.
 */
function buildGeo(args: Args, config: Config, each?: (trace: Record<string, unknown>) => void) {
  const o = args.options;
  const figure = buildFigure(args, { ...config, subplotType: 'geo' });
  const patch = defined({ geojson: o['geojson'] });
  for (const frame of figure.frames ?? [figure]) {
    for (const trace of frame.data) {
      Object.assign(trace, patch);
      each?.(trace);
    }
  }
  const type = o['projection'];
  const geo = defined({
    center: o['center'],
    scope: o['scope'],
    // Holochart fits a map to its data unless told otherwise, which would move it at every frame.
    fitbounds: o['fitBounds'] ?? (figure.frames ? false : undefined),
    visible: o['basemapVisible'],
    projection: type === undefined ? undefined : { type },
  });
  for (const [key, subplot] of Object.entries(figure.layout)) {
    if (/^geo\d*$/.test(key)) Object.assign(subplot as object, structuredClone(geo));
  }
  return figure;
}

/** The trace attributes px passes through: `locationmode` and `featureidkey`. */
function locationPatch(args: Args): Record<string, unknown> {
  return defined({
    locationmode: args.options['locationMode'],
    featureidkey: args.options['featureIdKey'],
  });
}

function buildScatterGeo(
  data: DataInput | null | undefined,
  options: ScatterGeoOptions,
): ExpressFigure {
  const args = prepare('scatterGeo', data, options as Record<string, unknown>);
  const attrs: Role[] = [
    'size',
    'hoverName',
    'text',
    'lat',
    'lon',
    'locations',
    ...tailRoles(args),
  ];
  return buildGeo(args, {
    specs: [
      {
        type: 'scattergeo',
        attrs,
        patch: {
          mode: args.cols.text !== undefined ? 'markers+text' : 'markers',
          ...locationPatch(args),
          ...opacityPatch(args),
        },
      },
    ],
    groupers: [
      { variable: 'color', path: 'marker.color' },
      { variable: 'symbol', path: 'marker.symbol' },
      ...CELLS,
    ],
    continuousColor: 'marker',
    ...(args.cols.size !== undefined
      ? { sizeref: sizeref(args.table.column(args.cols.size), options.sizeMax ?? 20) }
      : {}),
  });
}

function buildLineGeo(data: DataInput | null | undefined, options: LineGeoOptions): ExpressFigure {
  const args = prepare('lineGeo', data, options as Record<string, unknown>);
  const attrs: Role[] = ['hoverName', 'text', 'lat', 'lon', 'locations', ...tailRoles(args, false)];
  // px's mode for line functions: lines, markers with text / symbol / markers, and text.
  const modes = ['lines'];
  const text = args.cols.text !== undefined;
  if (text || args.cols.symbol !== undefined || options.markers) modes.push('markers');
  if (text) modes.push('text');
  return buildGeo(args, {
    specs: [
      {
        type: 'scattergeo',
        attrs,
        patch: { mode: modes.sort().join('+'), ...locationPatch(args) },
      },
    ],
    groupers: [
      { variable: 'color', path: 'line.color' },
      { variable: 'dash', path: 'line.dash' },
      { variable: 'symbol', path: 'marker.symbol' },
      ...CELLS,
      { variable: 'lineGroup' },
    ],
  });
}

function buildChoropleth(
  data: DataInput | null | undefined,
  options: ChoroplethOptions,
): ExpressFigure {
  const args = prepare('choropleth', data, options as Record<string, unknown>);
  const spec = {
    type: 'choropleth',
    attrs: ['hoverName', 'locations', ...tailRoles(args)] as Role[],
    patch: locationPatch(args),
  };
  if (continuousColor(args)) {
    return buildGeo(args, { specs: [spec], groupers: CELLS, continuousColor: 'z' });
  }
  // px, for a `color` that is not numeric (or none): a group's regions take the group's color
  // through a colorscale of that one color, with `z` all ones and no colorbar.
  return buildGeo(
    args,
    { specs: [spec], groupers: [{ variable: 'color', path: 'colorscale' }, ...CELLS] },
    (trace) => {
      const color = trace['colorscale'];
      trace['colorscale'] = [
        [0, color],
        [1, color],
      ];
      trace['z'] = ((trace['locations'] ?? []) as unknown[]).map(() => 1);
      trace['showscale'] = false;
    },
  );
}

/**
 * Markers on a map (`px.scatter_geo`): one `scattergeo` trace (`mode: 'markers'`) per group of
 * `color` / `symbol` values, per facet and per frame, at `lat` / `lon` or at the places `locations`
 * name. A numeric `color` is a colorscale on `coloraxis` instead; `size` scales marker areas.
 * Drawing the figure needs the geo package: `import '@mk7s/holochart/geo'`.
 *
 * @experimental
 * @example
 * ```ts
 * const figure = scatterGeo(countries, {
 *   locations: 'iso', color: 'continent', size: 'pop', projection: 'natural earth',
 * });
 * ```
 */
export const scatterGeo = expressFunction<ScatterGeoOptions>(buildScatterGeo);

/**
 * Lines on a map (`px.line_geo`): one `scattergeo` line per group of `color` / `lineDash` /
 * `symbol` / `lineGroup` values, in data order, each segment along the great circle between its
 * points; `markers` adds markers at the points.
 *
 * @experimental
 * @example
 * ```ts
 * const figure = lineGeo(stops, { lat: 'lat', lon: 'lon', color: 'route', markers: true });
 * ```
 */
export const lineGeo = expressFunction<LineGeoOptions>(buildLineGeo);

/**
 * A choropleth map (`px.choropleth`): the regions `locations` name, colored by `color` — a numeric
 * column through a colorscale on `coloraxis` (one `choropleth` trace), any other column with one
 * color and legend item per value (one trace each).
 *
 * @experimental
 * @example
 * ```ts
 * const figure = choropleth(countries, {
 *   locations: 'iso', color: 'lifeExp', hoverName: 'country', colorContinuousScale: 'Viridis',
 * });
 * ```
 */
export const choropleth = expressFunction<ChoroplethOptions>(buildChoropleth);
