/**
 * The `bar` trace module (plan E9.8, E9.9): core's schema/defaults parts, the `barmode` layout
 * attributes, and the runtime's render and interaction parts in one object, registered with
 * `register(bar)` (ADR-019).
 */
import type { FullLayout, LayoutDefaultsContext } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema, supplyColoraxisDefaults } from '../shared/colorscale.ts';
import { barAttributes, barLayoutAttributes } from './attributes.ts';
import {
  barCategoryValues,
  barExtremes,
  calcBar,
  crossTraceCalcBar,
  type BarCalc,
} from './calc.ts';
import { barColorbar } from './colorbar.ts';
import { supplyBarDefaults, supplyBarLayoutDefaults } from './defaults.ts';
import { barHoverPoints, barSelectPoints } from './hover.ts';
import { barRenderer } from './plot.ts';
import { barLegendIcon } from './style.ts';
import { describeBar } from './describe.ts';

export const bar: TraceModule<BarCalc, typeof barAttributes.children> = {
  type: 'bar',
  categories: ['cartesian', 'bar-like', 'showLegend', 'errorBarsOK'],
  schema: barAttributes,
  // An object spread at the top level looks side-effectful to bundlers (getters): wrapped so the
  // bar schema tree-shakes out of bundles without bar (E21.6).
  layoutSchema: /* @__PURE__ */ (() => ({ ...barLayoutAttributes, ...coloraxisLayoutSchema }))(),
  meta: {
    description:
      'Bars from a base to a value, vertical or horizontal, grouped, stacked or overlaid (`layout.barmode`), drawn as one instanced GPU rect set with batched SDF labels.',
    docsPage: 'bar',
    plotlyEquivalent: 'bar',
  },
  animatable: ['x', 'y', 'base', 'width', 'offset', 'marker.color', 'marker.opacity'],
  supplyDefaults: supplyBarDefaults,
  supplyLayoutDefaults: (
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ) => {
    supplyBarLayoutDefaults(layoutIn, layoutOut, ctx);
    supplyColoraxisDefaults(layoutIn, layoutOut, ctx);
  },
  calc: calcBar,
  crossTraceCalc: crossTraceCalcBar,
  extremes: barExtremes,
  categoryValues: barCategoryValues,
  plot: barRenderer,
  hoverPoints: barHoverPoints,
  selectPoints: barSelectPoints,
  legendIcon: barLegendIcon,
  colorbar: barColorbar,
  describe: describeBar,
};

export { barAttributes, barLayoutAttributes } from './attributes.ts';
export type { BarCalc } from './calc.ts';
