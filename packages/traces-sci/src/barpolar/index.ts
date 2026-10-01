/**
 * The `barpolar` trace module (plan E11.5): stacked or overlaid bars on polar subplots (wind
 * roses). Core's schema/defaults parts, the polar layout (`layout.polar*` with `bargap` /
 * `barmode`, shared with `scatterpolar`), and the runtime's render and interaction parts (ADR-019).
 */
import type { FullLayout, LayoutDefaultsContext } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { bar, coloraxisLayoutSchema, scatter } from '@mk7s/holochart-traces-basic';
import { describePolar } from '../polar/describe.ts';
import { polarCrossTraceLayout, type PolarCalc } from '../polar/cross-trace.ts';
import { polarSubplotDomain } from '../polar/domain.ts';
import { barpolarSelectPoints, polarEventData } from '../polar/select.ts';
import { polarLayoutSchema } from '../polar/layout-attributes.ts';
import { supplyPolarLayoutDefaults } from '../polar/layout-defaults.ts';
import { barpolarAttributes } from './attributes.ts';
import { calcBarpolar } from './calc.ts';
import { supplyBarpolarDefaults } from './defaults.ts';
import { barpolarHoverPoints } from './hover.ts';
import { barpolarRenderer } from './plot.ts';

export const barpolar: TraceModule<PolarCalc, typeof barpolarAttributes.children> = {
  type: 'barpolar',
  categories: ['polar', 'bar', 'showLegend'],
  // Polar axis drags and the zoom box (E6.6).
  touchAction: 'pan-y',
  schema: barpolarAttributes,
  layoutSchema: /* @__PURE__ */ (() => ({ ...polarLayoutSchema, ...coloraxisLayoutSchema }))(),
  meta: {
    description:
      'Bars in polar coordinates: annular sectors from a base to `r` at angles `theta`, stacked or overlaid (`polar.barmode`), e.g. wind roses; one instanced GPU draw call per trace.',
    docsPage: 'barpolar',
    plotlyEquivalent: 'barpolar',
  },
  supplyDefaults: supplyBarpolarDefaults,
  supplyLayoutDefaults: (
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ) => {
    supplyPolarLayoutDefaults(layoutIn, layoutOut, ctx);
    // Color axes (scatter's layout defaults are exactly those; bar's add cartesian `barmode`).
    scatter.supplyLayoutDefaults?.(layoutIn, layoutOut, ctx);
  },
  subplotDomain: polarSubplotDomain,
  calc: calcBarpolar,
  crossTraceLayout: polarCrossTraceLayout,
  plot: barpolarRenderer,
  hoverPoints: barpolarHoverPoints,
  selectPoints: barpolarSelectPoints,
  eventData: polarEventData,
  legendIcon: (trace, ctx) => bar.legendIcon!(trace, ctx),
  colorbar: (trace, ctx) => bar.colorbar!(trace, ctx),
  describe: describePolar,
};

export { barpolarAttributes } from './attributes.ts';
