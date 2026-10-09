/**
 * The base layers of a geo subplot as data (backlog GEO2): which layers a `layout.geo` container
 * shows, in what order, how each is styled and what geometry it projects. The part of plotly.js
 * `updateBaseLayers` (`src/plots/geo/geo.js`, MIT) that does not touch the DOM; the geo component
 * turns it into primitives.
 *
 * | Layer                | Drawn as | Geometry                                   | Style              |
 * | -------------------- | -------- | ------------------------------------------ | ------------------ |
 * | `ocean`              | fill     | the sphere                                 | `oceancolor`       |
 * | `land`               | fill     | `land`                                     | `landcolor`        |
 * | `lakes`              | fill     | `lakes`                                    | `lakecolor`        |
 * | `subunits`           | line     | `subunitBorders` and their country outline | `subunitcolor/width` |
 * | `countries`          | line     | `borders` and `coastlines`                 | `countrycolor/width` |
 * | `coastlines`         | line     | `coastlines`                               | `coastlinecolor/width` |
 * | `rivers`             | line     | `rivers`                                   | `rivercolor/width` |
 * | `lataxis`, `lonaxis` | line     | the graticule (`graticule.ts`)             | `gridcolor/width/dash` |
 * | `frame`              | line     | the sphere's outline                       | `framecolor/width` |
 *
 * Plotly strokes whole country and subunit polygons, coasts included, while the basemap keeps
 * `borders` and `subunitBorders` as interior lines only (each arc once). So the `countries` layer
 * adds the coastlines to the borders, and the `subunits` layer adds the outline of the countries
 * the subunits belong to.
 */
import { toRGBA } from '@mk7s/holochart-core';
import type { RGBA } from '@mk7s/holochart-render';
import type { GeoGeometryObjects, GeoSphere } from 'd3-geo';
import { FILL_LAYERS, LAYER_NAME_TO_ADJECTIVE } from './constants.ts';
import { geoLayers, type GeoLayerName } from './order.ts';
import type { GeoInput } from './sink.ts';
import type { BasemapLayers, FullGeoLayout } from './types.ts';

/** A layer the geo component draws: every layer but the background and the two trace slots. */
export type BaseLayerName = Exclude<GeoLayerName, 'bg' | 'backplot' | 'frontplot'>;

/** A base layer whose geometry is basemap data. */
export type DataLayerName = Exclude<BaseLayerName, 'ocean' | 'lataxis' | 'lonaxis' | 'frame'>;

/** The whole globe: the ocean's fill and the frame's outline. */
export const SPHERE: GeoSphere = { type: 'Sphere' };

const DATA_LAYERS: ReadonlySet<string> = new Set<DataLayerName>([
  'land',
  'lakes',
  'subunits',
  'countries',
  'coastlines',
  'rivers',
]);

/** Plotly's `stroke-miterlimit` of the base line layers; the graticule keeps SVG's default. */
const BASE_LINE_MITER_LIMIT = 2;
const SVG_MITER_LIMIT = 4;

function isAxisLayer(name: BaseLayerName): name is 'lataxis' | 'lonaxis' {
  return name === 'lataxis' || name === 'lonaxis';
}

/** Whether a base layer's geometry comes from the basemap. */
export function isDataLayer(name: BaseLayerName): name is DataLayerName {
  return DATA_LAYERS.has(name);
}

/** Whether a base layer is a batched fill; the others are lines. */
export function isFillLayer(name: BaseLayerName): boolean {
  return (FILL_LAYERS as readonly string[]).includes(name);
}

/** Whether a container shows a base layer (its `show…` flag, `showgrid` for the graticule). */
function isShown(layout: FullGeoLayout, name: BaseLayerName): boolean {
  if (isAxisLayer(name)) return layout[name].showgrid === true;
  return layout[`show${name}`] === true;
}

/** The base layers a container shows, bottom to top (Plotly's `layerData`). */
export function shownBaseLayers(layout: FullGeoLayout, hasChoropleth: boolean): BaseLayerName[] {
  const out: BaseLayerName[] = [];
  for (const name of geoLayers(hasChoropleth)) {
    if (name === 'bg' || name === 'backplot' || name === 'frontplot') continue;
    if (isShown(layout, name)) out.push(name);
  }
  return out;
}

/**
 * Whether a container needs the basemap's second chunk: the lakes, rivers and subunits. A map
 * that shows none of them does not ask for it.
 */
export function needsBasemapExtras(layout: FullGeoLayout): boolean {
  return layout.showlakes || layout.showrivers || layout.showsubunits;
}

/** Whether a container shows a layer made of basemap data at all. */
export function needsBasemap(layout: FullGeoLayout): boolean {
  return (
    layout.showland || layout.showcoastlines || layout.showcountries || needsBasemapExtras(layout)
  );
}

/** How a base layer is painted. */
export interface BaseLayerStyle {
  /** sRGB 0–1, straight alpha. */
  readonly color: RGBA;
  /** Lines only, CSS px. */
  readonly width: number;
  /** Lines only: a Plotly dash name or a px list; base layers but the graticule are solid. */
  readonly dash: string;
  /** Lines only. */
  readonly miterLimit: number;
  /** Changes when any of the above does. */
  readonly key: string;
}

const BLACK: RGBA = [0, 0, 0, 1];

/** The style of a base layer, from its attributes in the container. */
export function baseLayerStyle(layout: FullGeoLayout, name: BaseLayerName): BaseLayerStyle {
  let color: unknown;
  let width = 0;
  let dash = 'solid';
  if (isAxisLayer(name)) {
    const axis = layout[name];
    color = axis.gridcolor;
    width = axis.gridwidth;
    dash = axis.griddash || 'solid';
  } else {
    // `countries` reads `countrycolor` and `countrywidth`; a fill has no width.
    const attributes = layout as unknown as Readonly<Record<string, unknown>>;
    const adjective = LAYER_NAME_TO_ADJECTIVE[name];
    color = attributes[`${adjective}color`];
    if (!isFillLayer(name)) width = Number(attributes[`${adjective}width`]) || 0;
  }
  return {
    color: (typeof color === 'string' ? toRGBA(color) : null) ?? BLACK,
    width,
    dash,
    miterLimit: isAxisLayer(name) ? SVG_MITER_LIMIT : BASE_LINE_MITER_LIMIT,
    key: `${String(color)}|${width}|${dash}`,
  };
}

/** Geometry put together from several basemap layers, made once per basemap. */
const COMBINED = new WeakMap<BasemapLayers, Partial<Record<DataLayerName, GeoInput>>>();

function collection(parts: readonly (GeoGeometryObjects | undefined)[]): GeoInput | undefined {
  const geometries = parts.filter((p): p is GeoGeometryObjects => p !== undefined);
  if (geometries.length === 0) return undefined;
  if (geometries.length === 1) return geometries[0];
  return { type: 'GeometryCollection', geometries } as GeoGeometryObjects;
}

/**
 * The outline of the countries the subunits belong to (the USA; Canada too at 50m): the rings of
 * those countries' polygons, which `projectLines` draws closed. Empty when the basemap has no
 * such country.
 */
function subunitCountries(basemap: BasemapLayers): GeoGeometryObjects[] {
  const owners = new Set<string>();
  for (const subunit of basemap.subunits ?? []) owners.add(subunit.properties.gu);
  const out: GeoGeometryObjects[] = [];
  for (const country of basemap.countries ?? []) {
    if (typeof country.id === 'string' && owners.has(country.id)) out.push(country.geometry);
  }
  return out;
}

/**
 * The geometry a data layer projects, in degrees, or `undefined` when the basemap does not have
 * it (the layer is then not drawn). The same object for the same basemap on every call, so its
 * identity says whether a primitive's geometry is still the layer's.
 */
export function baseLayerGeometry(
  name: DataLayerName,
  basemap: BasemapLayers,
): GeoInput | undefined {
  if (name === 'land') return basemap.land;
  if (name === 'lakes') return basemap.lakes;
  if (name === 'coastlines') return basemap.coastlines;
  if (name === 'rivers') return basemap.rivers;
  let combined = COMBINED.get(basemap);
  if (!combined) COMBINED.set(basemap, (combined = {}));
  if (!(name in combined)) {
    combined[name] =
      name === 'countries'
        ? collection([basemap.borders, basemap.coastlines])
        : basemap.subunitBorders &&
          collection([basemap.subunitBorders, ...subunitCountries(basemap)]);
  }
  return combined[name];
}

/**
 * The order in which layers go back to the figure's resolution when a rotation has settled
 * (ADR-025): lines first, which are cheap and carry the detail the eye follows, then fills.
 */
export function settleOrder(names: readonly BaseLayerName[]): BaseLayerName[] {
  return [...names.filter((n) => !isFillLayer(n)), ...names.filter((n) => isFillLayer(n))];
}
