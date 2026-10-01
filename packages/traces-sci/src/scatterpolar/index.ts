/**
 * The `scatterpolar` trace module (plan E11.4): markers, lines, text and radar fills on polar
 * subplots. Core's schema/defaults parts, the polar layout (`layout.polar*`, shared with
 * `barpolar`), and the runtime's render and interaction parts in one object (ADR-019).
 */
import type { FullLayout, LayoutDefaultsContext } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema, scatter } from '@mk7s/holochart-traces-basic';
import { describePolar } from '../polar/describe.ts';
import { polarCrossTraceLayout } from '../polar/cross-trace.ts';
import { polarLayoutSchema } from '../polar/layout-attributes.ts';
import { supplyPolarLayoutDefaults } from '../polar/layout-defaults.ts';
import { polarSubplotDomain } from '../polar/domain.ts';
import { polarEventData, scatterpolarSelectPoints } from '../polar/select.ts';
import { scatterpolarAttributes } from './attributes.ts';
import { calcScatterpolar, type ScatterpolarCalc } from './calc.ts';
import { supplyScatterpolarDefaults } from './defaults.ts';
import { scatterpolarHoverPoints } from './hover.ts';
import { scatterpolarRenderer } from './plot.ts';

export const scatterpolar: TraceModule<ScatterpolarCalc, typeof scatterpolarAttributes.children> = {
  type: 'scatterpolar',
  categories: ['polar', 'symbols', 'showLegend', 'scatter-like'],
  // Polar axis drags and the zoom box (E6.6).
  touchAction: 'pan-y',
  schema: scatterpolarAttributes,
  layoutSchema: /* @__PURE__ */ (() => ({ ...polarLayoutSchema, ...coloraxisLayoutSchema }))(),
  meta: {
    description:
      'Markers, lines (straight or spline), text and filled areas at polar coordinates on a polar subplot: polar scatter plots, spirals and radar charts (`fill: toself`).',
    docsPage: 'polar',
    plotlyEquivalent: 'scatterpolar / scatterpolargl',
  },
  supplyDefaults: supplyScatterpolarDefaults,
  supplyLayoutDefaults: (
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ) => {
    supplyPolarLayoutDefaults(layoutIn, layoutOut, ctx);
    scatter.supplyLayoutDefaults?.(layoutIn, layoutOut, ctx);
  },
  subplotDomain: polarSubplotDomain,
  calc: calcScatterpolar,
  crossTraceLayout: polarCrossTraceLayout,
  plot: scatterpolarRenderer,
  hoverPoints: scatterpolarHoverPoints,
  selectPoints: scatterpolarSelectPoints,
  eventData: polarEventData,
  legendIcon: (trace, ctx) => scatter.legendIcon!(trace, ctx),
  colorbar: (trace, ctx) => scatter.colorbar!(trace, ctx),
  describe: (ctx) => describePolar(ctx),
};

export { scatterpolarAttributes } from './attributes.ts';
export type { ScatterpolarCalc } from './calc.ts';
