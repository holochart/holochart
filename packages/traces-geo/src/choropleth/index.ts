/**
 * The `choropleth` trace module (backlog GEO4, plan E15.3): the regions that `locations` name
 * (countries, US states, or the features of a `geojson`) filled with the colors of their `z`
 * values on geo subplots. Core's schema/defaults parts, the geo layout (`layout.geo*`, shared with
 * the other geo traces) with the color axes, and the runtime's render and interaction parts in one
 * object (ADR-019).
 */
import type { FullLayout, LayoutDefaultsContext } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import { lazyA11y, viewKit } from '../a11y-loader.ts';
import { geoCrossTraceLayout } from '../geo/cross-trace.ts';
import { geoSubplotDomain } from '../geo/domain.ts';
import { geoLayoutSchema } from '../geo/layout-attributes.ts';
import { supplyGeoLayoutDefaults } from '../geo/layout-defaults.ts';
import { choroplethAttributes } from './attributes.ts';
import { calcChoropleth, type ChoroplethCalc } from './calc.ts';
import {
  choroplethColorbar,
  choroplethLegendIcon,
  supplyChoroplethColoraxisDefaults,
} from './colors.ts';
import { supplyChoroplethDefaults } from './defaults.ts';
import { describeChoropleth } from './describe.ts';
import { choroplethEventData } from './event-data.ts';
import { choroplethAnchor, choroplethHoverPoint, choroplethHoverPoints } from './hover.ts';
import { choroplethRenderer } from './plot.ts';
import { choroplethSelectPoints } from './select.ts';

export const choropleth: TraceModule<ChoroplethCalc, typeof choroplethAttributes.children> = {
  type: 'choropleth',
  categories: ['geo', 'showLegend'],
  // The map takes drags (pan, rotate) and pinches (zoom) in every direction.
  touchAction: 'none',
  schema: choroplethAttributes,
  layoutSchema: /* @__PURE__ */ (() => ({ ...geoLayoutSchema, ...coloraxisLayoutSchema }))(),
  meta: {
    description:
      'Choropleth maps: countries, US states or the features of a GeoJSON, named by `locations`, filled with the colors of their `z` values on a map-projection subplot.',
    docsPage: 'geo',
    plotlyEquivalent: 'choropleth',
  },
  supplyDefaults: supplyChoroplethDefaults,
  supplyLayoutDefaults: (
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ) => {
    supplyGeoLayoutDefaults(layoutIn, layoutOut, ctx);
    supplyChoroplethColoraxisDefaults(layoutIn, layoutOut, ctx);
  },
  subplotDomain: geoSubplotDomain,
  calc: calcChoropleth,
  crossTraceLayout: geoCrossTraceLayout,
  plot: choroplethRenderer,
  hoverPoints: choroplethHoverPoints,
  a11y: /* @__PURE__ */ lazyA11y('choropleth', choroplethHoverPoint, choroplethAnchor, ...viewKit),
  selectPoints: choroplethSelectPoints,
  eventData: choroplethEventData,
  legendIcon: choroplethLegendIcon,
  colorbar: (trace, ctx) => choroplethColorbar(trace, ctx.fullLayout),
  describe: describeChoropleth,
};

export { choroplethAttributes } from './attributes.ts';
export type { ChoroplethCalc } from './calc.ts';
export type { DrawnRegions } from './regions.ts';
