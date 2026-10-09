/**
 * @mk7s/holochart-traces-geo — geographic charts on map projections (backlog GEO2–GEO8, plan E15):
 * the `geo` subplot (Plotly's `layout.geo`: projections, base layers from Natural Earth, pan, zoom
 * and rotate), `scattergeo` and `choropleth`. It is not part of the `@mk7s/holochart` bundle (ADR-026):
 * register it yourself (`register(...tracesGeo)`), or import `@mk7s/holochart/geo`.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { choropleth } from './choropleth/index.ts';
import { geoComponent } from './geo/component.ts';
import { scattergeo } from './scattergeo/index.ts';

export { choropleth, choroplethAttributes } from './choropleth/index.ts';
export type { ChoroplethCalc } from './choropleth/index.ts';
export { scattergeo, scattergeoAttributes } from './scattergeo/index.ts';
export type { ScattergeoCalc } from './scattergeo/index.ts';
export { geoComponent } from './geo/component.ts';
export { geoAttributes } from './geo/layout-attributes.ts';
export { GLOBE_PROJECTION } from './geo/constants.ts';
export { GeoSubplot } from './geo/subplot.ts';
export { GeoView } from './geo/view.ts';
export type { GeoViewState } from './geo/view.ts';
export type {
  LocatedFeature,
  LocationMode,
  LocationsRequest,
  LocationsResult,
} from './geo/locations.ts';
export { loadBasemap } from './basemap/index.ts';
export type { BasemapOptions } from './basemap/index.ts';
export type {
  BasemapLayers,
  CountryProperties,
  FullGeoAxis,
  FullGeoLayout,
  FullGeoProjection,
  GeoResolution,
  GeoScope,
  SubunitProperties,
} from './geo/types.ts';

/** Every geo module, for `register(...tracesGeo)`. */
export const tracesGeo: readonly Registrable[] = [
  scattergeo,
  choropleth,
  // Draws geo subplots (their base layers) and runs their drags.
  geoComponent,
];

/**
 * Figure input types of this package's traces (backlog S1.6): one per trace type
 * (`ChoroplethTrace`, …) and their union, generated from the attribute schemas by
 * `tools/schema-gen`.
 */
export type * from './generated/traces.ts';
