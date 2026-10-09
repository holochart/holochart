/**
 * Draw order inside a geo subplot's viewport (backlog GEO2), following plotly.js' geo layers
 * (`constants.layers` and `constants.layersForChoropleth`): the base layers the geo component
 * draws, with a slot for the choropleths (`backplot`) and one for the scatter traces
 * (`frontplot`).
 *
 * A geo subplot has a viewport of its own, so these orders only rank what is drawn in it. Each
 * layer is {@link GEO_LAYER_STEP} above the one below: a base layer is one primitive at its
 * layer's order, and a trace takes orders inside its slot with {@link geoTraceOrder}.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import { LAYERS, LAYERS_FOR_CHOROPLETH } from './constants.ts';
import { geoOf } from './layout-defaults.ts';

/** A layer of a geo subplot, as Plotly names it. */
export type GeoLayerName = (typeof LAYERS)[number];

/** The `renderOrder` of each layer. */
export type GeoOrder = Readonly<Record<GeoLayerName, number>>;

/** The distance between two layers: the room a trace slot has for its traces. */
export const GEO_LAYER_STEP = 100;

function orderOf(layers: readonly GeoLayerName[]): GeoOrder {
  const order = {} as Record<GeoLayerName, number>;
  layers.forEach((name, i) => (order[name] = i * GEO_LAYER_STEP));
  return order;
}

/**
 * Draw order of a subplot without a choropleth, bottom to top: `bg` 0 (the viewport's background),
 * `ocean` 100, `land` 200, `lakes` 300, `subunits` 400, `countries` 500, `coastlines` 600,
 * `rivers` 700, `lataxis` 800, `lonaxis` 900, `frame` 1000, `backplot` 1100, `frontplot` 1200.
 */
export const GEO_ORDER: GeoOrder = /* @__PURE__ */ orderOf(LAYERS);

/**
 * Draw order of a subplot with a choropleth, where rivers and lakes go above the regions: `bg` 0,
 * `ocean` 100, `land` 200, `subunits` 300, `countries` 400, `coastlines` 500, `lataxis` 600,
 * `lonaxis` 700, `frame` 800, `backplot` 900, `rivers` 1000, `lakes` 1100, `frontplot` 1200.
 */
export const GEO_ORDER_FOR_CHOROPLETH: GeoOrder = /* @__PURE__ */ orderOf(LAYERS_FOR_CHOROPLETH);

/** Whether a visible choropleth is drawn on geo subplot `id` (Plotly's `hasChoropleth`). */
export function geoHasChoropleth(fullData: readonly FullTrace[], id: string): boolean {
  return fullData.some((t) => t.type === 'choropleth' && t.visible === true && geoOf(t) === id);
}

/** The layers of a subplot, bottom to top. */
export function geoLayers(hasChoropleth: boolean): readonly GeoLayerName[] {
  return hasChoropleth ? LAYERS_FOR_CHOROPLETH : LAYERS;
}

/** The draw order of a subplot. */
export function geoOrder(hasChoropleth: boolean): GeoOrder {
  return hasChoropleth ? GEO_ORDER_FOR_CHOROPLETH : GEO_ORDER;
}

/**
 * Base draw order of trace `index` in a slot (`order.backplot` for a choropleth, `order.frontplot`
 * for a scatter trace): traces stack in data order, and each has a hundredth of a unit for its
 * own parts (fill, line, markers, text).
 */
export function geoTraceOrder(slot: number, index: number): number {
  return slot + Math.min(index, GEO_LAYER_STEP * 100 - 1) * 0.01;
}
