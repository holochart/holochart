/**
 * The `violin` trace module (plan E10.5): core's schema/defaults parts, the `violinmode` layout
 * attributes, and the runtime's render and interaction parts in one object, registered with
 * `register(violin)` (ADR-019). Calc, layout, points and hover build on `box`.
 */
import type { FullLayout, LayoutDefaultsContext } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { supplyGroupingDefaults } from '../box/defaults.ts';
import { describeBox } from '../box/describe.ts';
import { boxCategoryValues } from '../box/calc.ts';
import { boxSelectPoints } from '../box/hover.ts';
import { boxLegendIcon } from '../box/style.ts';
import { violinAttributes, violinLayoutAttributes } from './attributes.ts';
import { calcViolin, crossTraceCalcViolin, violinExtremes, type ViolinCalc } from './calc.ts';
import { supplyViolinDefaults } from './defaults.ts';
import { violinHoverPoints } from './hover.ts';
import { violinRenderer } from './plot.ts';

export const violin: TraceModule<ViolinCalc, typeof violinAttributes.children> = {
  type: 'violin',
  categories: ['cartesian', 'showLegend', 'box-violin', 'violinLayout'],
  schema: violinAttributes,
  layoutSchema: violinLayoutAttributes,
  meta: {
    description:
      'Violin plots: a Gaussian kernel density estimate of the samples at each position (Silverman bandwidth by default), mirrored or one-sided for split violins, with an optional inner box, mean line and jittered points.',
    docsPage: 'violin',
    plotlyEquivalent: 'violin',
  },
  supplyDefaults: supplyViolinDefaults,
  supplyLayoutDefaults: (
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ) => supplyGroupingDefaults('violin', layoutIn, layoutOut, ctx),
  calc: calcViolin,
  crossTraceCalc: crossTraceCalcViolin,
  extremes: violinExtremes,
  categoryValues: boxCategoryValues,
  plot: violinRenderer,
  hoverPoints: violinHoverPoints,
  selectPoints: (calc, trace, query) => boxSelectPoints(calc, trace, query),
  legendIcon: boxLegendIcon,
  describe: describeBox,
};

export { violinAttributes, violinLayoutAttributes } from './attributes.ts';
export type { ViolinCalc } from './calc.ts';
