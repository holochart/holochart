/**
 * The `funnel` trace module (plan E12.5): the stages of a process as bars centered on the value
 * axis (horizontal by default, first stage on top), labeled with the value and percentages of the
 * first, previous or total stage, with connector regions between stages,
 * `funnelmode: 'stack' | 'group' | 'overlay'` with `funnelgap` / `funnelgroupgap`, hover with
 * Plotly's percentage lines and box / lasso selection. Drawn by bar's renderer (one instanced
 * rect set, batched SDF labels) plus one polygon fill and one line primitive for the connectors.
 * Registered with `register(funnel)` (ADR-019).
 *
 * Funnels lay out on their own (Plotly): they never share slots with bars or waterfalls.
 */
import type { FullLayout, LayoutDefaultsContext } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { bar, barCategoryValues, barExtremes, barSelectPoints } from '@mk7s/holochart-traces-basic';
import { describeBarLike, describeFormatters } from '../bars/describe.ts';
import { formatPercent } from '../bars/text.ts';
import { funnelAttributes, funnelLayoutAttributes } from './attributes.ts';
import { calcFunnel, crossTraceCalcFunnel, type FunnelCalc } from './calc.ts';
import { supplyFunnelDefaults, supplyFunnelLayoutDefaults } from './defaults.ts';
import { funnelHoverPoints } from './hover.ts';
import { funnelRenderer } from './plot.ts';
import { funnelBarTrace } from './style.ts';

export const funnel: TraceModule<FunnelCalc, typeof funnelAttributes.children> = {
  type: 'funnel',
  categories: ['cartesian', 'funnel', 'showLegend'],
  schema: funnelAttributes,
  layoutSchema: funnelLayoutAttributes,
  meta: {
    description:
      'Funnel charts: the stages of a process as bars centered on the value axis, with connector regions between stages, drawn as one instanced GPU rect set with batched SDF labels.',
    docsPage: 'funnel',
    plotlyEquivalent: 'funnel',
  },
  supplyDefaults: supplyFunnelDefaults,
  supplyLayoutDefaults: (
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ) => supplyFunnelLayoutDefaults(layoutIn, layoutOut, ctx),
  calc: calcFunnel,
  crossTraceCalc: crossTraceCalcFunnel,
  // Room for `outside` labels is measured on the finished label strings.
  extremes: (calc, trace, ctx) =>
    barExtremes(calc, funnelBarTrace(trace, calc, ctx.xaxis, ctx.yaxis), ctx),
  categoryValues: barCategoryValues,
  plot: funnelRenderer,
  hoverPoints: funnelHoverPoints,
  selectPoints: barSelectPoints,
  legendIcon: (trace, ctx) => bar.legendIcon!(trace, ctx),
  colorbar: (trace, ctx) => bar.colorbar!(trace, ctx),
  describe: (ctx) => {
    const { calc } = ctx;
    const f = describeFormatters(ctx);
    return describeBarLike(ctx, 'funnel', '', ['Value', 'Percent of initial'], (i) => [
      f.size(calc.size[i]!),
      formatPercent(calc.percentInitial[i]!, 1),
    ]);
  },
};

export { funnelAttributes, funnelLayoutAttributes } from './attributes.ts';
export type { FunnelCalc } from './calc.ts';
