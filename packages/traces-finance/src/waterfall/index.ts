/**
 * The `waterfall` trace module (plan E12.4): how a running total is built from changes — relative
 * bars from the previous total, `total` and `absolute` sum bars, a `base`, per-direction styles
 * (`increasing`, `decreasing`, `totals`), connector lines (`between` or `spanning`), labels with
 * the initial, delta and final values, `waterfallmode: 'group' | 'overlay'` with `waterfallgap` /
 * `waterfallgroupgap`, hover with Plotly's change lines and box / lasso selection. Drawn by bar's
 * renderer (one instanced rect set, batched SDF labels) plus one line primitive for the
 * connectors. Registered with `register(waterfall)` (ADR-019).
 *
 * Waterfalls lay out on their own (Plotly): they never share slots with bars or funnels.
 */
import type { FullLayout, LayoutDefaultsContext } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { barCategoryValues, barExtremes, barSelectPoints } from '@mk7s/holochart-traces-basic';
import { describeBarLike, describeFormatters } from '../bars/describe.ts';
import { waterfallAttributes, waterfallLayoutAttributes } from './attributes.ts';
import {
  calcWaterfall,
  crossTraceCalcWaterfall,
  waterfallValues,
  type WaterfallCalc,
} from './calc.ts';
import { supplyWaterfallDefaults, supplyWaterfallLayoutDefaults } from './defaults.ts';
import { waterfallHoverPoints } from './hover.ts';
import { waterfallRenderer } from './plot.ts';
import { waterfallBarTrace, waterfallLegendIcon } from './style.ts';

export const waterfall: TraceModule<WaterfallCalc, typeof waterfallAttributes.children> = {
  type: 'waterfall',
  categories: ['cartesian', 'waterfall', 'showLegend'],
  schema: waterfallAttributes,
  layoutSchema: waterfallLayoutAttributes,
  meta: {
    description:
      'Waterfall charts: how a running total is built from positive and negative changes, with sum bars and connector lines, drawn as one instanced GPU rect set with batched SDF labels.',
    docsPage: 'waterfall',
    plotlyEquivalent: 'waterfall',
  },
  supplyDefaults: supplyWaterfallDefaults,
  supplyLayoutDefaults: (
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ) => supplyWaterfallLayoutDefaults(layoutIn, layoutOut, ctx),
  calc: calcWaterfall,
  crossTraceCalc: crossTraceCalcWaterfall,
  // Room for `outside` labels is measured on the finished label strings.
  extremes: (calc, trace, ctx) =>
    barExtremes(calc, waterfallBarTrace(trace, calc, ctx.xaxis, ctx.yaxis), ctx),
  categoryValues: barCategoryValues,
  plot: waterfallRenderer,
  hoverPoints: waterfallHoverPoints,
  selectPoints: barSelectPoints,
  legendIcon: waterfallLegendIcon,
  describe: (ctx) => {
    const { calc } = ctx;
    const f = describeFormatters(ctx);
    const last = calc.length - 1;
    const summary = last >= 0 ? `Final value ${f.size(calc.final[last]!)}.` : '';
    return describeBarLike(ctx, 'waterfall', summary, ['Change', 'Total'], (i) => {
      const v = waterfallValues(calc, i);
      return [f.size(v.delta), f.size(v.final)];
    });
  },
};

export { waterfallAttributes, waterfallLayoutAttributes } from './attributes.ts';
export type { WaterfallCalc } from './calc.ts';
