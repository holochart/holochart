/**
 * The `scattergeo` trace module (backlog GEO3, plan E15.2): markers, great-circle lines, text and
 * filled areas at longitudes and latitudes on geo subplots. Core's schema/defaults parts, the geo
 * layout (`layout.geo*`, shared with the other geo traces), and the runtime's render and
 * interaction parts in one object (ADR-019).
 */
import type { FullLayout, LayoutDefaultsContext } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema, scatter } from '@mk7s/holochart-traces-basic';
import { lazyA11y, viewKit } from '../a11y-loader.ts';
import { geoCrossTraceLayout } from '../geo/cross-trace.ts';
import { geoSubplotDomain } from '../geo/domain.ts';
import { geoLayoutSchema } from '../geo/layout-attributes.ts';
import { supplyGeoLayoutDefaults } from '../geo/layout-defaults.ts';
import { scattergeoAttributes } from './attributes.ts';
import { calcScattergeo, type ScattergeoCalc } from './calc.ts';
import { supplyScattergeoDefaults } from './defaults.ts';
import { describeScattergeo } from './describe.ts';
import { scattergeoEventData } from './event-data.ts';
import { geoHoverPointOf, scattergeoHoverPoints } from './hover.ts';
import { scattergeoRenderer } from './plot.ts';
import { geoPositions, subplotFrame } from './positions.ts';
import { scattergeoSelectPoints } from './select.ts';

export const scattergeo: TraceModule<ScattergeoCalc, typeof scattergeoAttributes.children> = {
  type: 'scattergeo',
  categories: ['geo', 'symbols', 'showLegend', 'scatter-like'],
  // The map takes drags (pan, rotate) and pinches (zoom) in every direction.
  touchAction: 'none',
  schema: scattergeoAttributes,
  layoutSchema: /* @__PURE__ */ (() => ({ ...geoLayoutSchema, ...coloraxisLayoutSchema }))(),
  meta: {
    description:
      'Markers, lines along great circles, text and filled areas at longitudes and latitudes on a map-projection subplot: point maps, bubble maps, routes and regions drawn from coordinates (`fill: toself`).',
    docsPage: 'geo',
    plotlyEquivalent: 'scattergeo',
  },
  supplyDefaults: supplyScattergeoDefaults,
  supplyLayoutDefaults: (
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ) => {
    supplyGeoLayoutDefaults(layoutIn, layoutOut, ctx);
    scatter.supplyLayoutDefaults?.(layoutIn, layoutOut, ctx);
  },
  subplotDomain: geoSubplotDomain,
  calc: calcScattergeo,
  crossTraceLayout: geoCrossTraceLayout,
  plot: scattergeoRenderer,
  hoverPoints: scattergeoHoverPoints,
  a11y: /* @__PURE__ */ lazyA11y(
    'scattergeo',
    scattergeoHoverPoints,
    geoPositions,
    subplotFrame,
    geoHoverPointOf,
    ...viewKit,
  ),
  selectPoints: scattergeoSelectPoints,
  eventData: scattergeoEventData,
  legendIcon: (trace, ctx) => scatter.legendIcon!(trace, ctx),
  colorbar: (trace, ctx) => scatter.colorbar!(trace, ctx),
  describe: describeScattergeo,
};

export { scattergeoAttributes } from './attributes.ts';
export type { ScattergeoCalc } from './calc.ts';
