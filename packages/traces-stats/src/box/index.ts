/**
 * The `box` trace module (plan E10.4): core's schema/defaults parts, the `boxmode` layout
 * attributes, and the runtime's render and interaction parts in one object, registered with
 * `register(box)` (ADR-019).
 */
import type { FullLayout, LayoutDefaultsContext } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { boxAttributes, boxLayoutAttributes } from './attributes.ts';
import {
  boxCategoryValues,
  boxExtremes,
  calcBox,
  crossTraceCalcBox,
  type BoxCalc,
} from './calc.ts';
import { describeBox } from './describe.ts';
import { supplyBoxDefaults, supplyGroupingDefaults } from './defaults.ts';
import { boxHoverPoints, boxSelectPoints } from './hover.ts';
import { boxRenderer } from './plot.ts';
import { boxLegendIcon } from './style.ts';

export const box: TraceModule<BoxCalc, typeof boxAttributes.children> = {
  type: 'box',
  categories: ['cartesian', 'showLegend', 'box-violin', 'boxLayout'],
  schema: boxAttributes,
  layoutSchema: boxLayoutAttributes,
  meta: {
    description:
      'Box plots: the quartiles, median, whiskers (fences at 1.5 IQR) and outliers of samples at each position, or of precomputed statistics, with notches, means and jittered points; drawn as batched GPU fills, lines and markers.',
    docsPage: 'box',
    plotlyEquivalent: 'box',
  },
  supplyDefaults: supplyBoxDefaults,
  supplyLayoutDefaults: (
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ) => supplyGroupingDefaults('box', layoutIn, layoutOut, ctx),
  calc: calcBox,
  crossTraceCalc: crossTraceCalcBox,
  extremes: boxExtremes,
  categoryValues: boxCategoryValues,
  plot: boxRenderer,
  hoverPoints: boxHoverPoints,
  selectPoints: (calc, trace, query) => boxSelectPoints(calc, trace, query),
  legendIcon: boxLegendIcon,
  describe: describeBox,
};

export { boxAttributes, boxLayoutAttributes } from './attributes.ts';
export type { BoxCalc } from './calc.ts';
