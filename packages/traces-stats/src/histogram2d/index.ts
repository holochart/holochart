/**
 * The `histogram2d` trace module (plan E10.2): samples binned along x and y (Plotly's automatic,
 * shared or explicit bins), counted or aggregated per cell (`histfunc`, `histnorm`) and drawn as a
 * GPU heatmap (one textured quad, `zsmooth`, `xgap` / `ygap`), with cell labels
 * (`texttemplate`), per-cell hover with bin ranges and a colorbar. Registered with
 * `register(histogram2d)` (ADR-019).
 *
 * Deferred: GPU aggregation for > 1 M samples (see `calc.ts`), selection, `xcalendar` /
 * `ycalendar`.
 */
import type { FullLayout, FullTrace, LayoutDefaultsContext } from '@mk7s/holochart-core';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import type { LegendGlyph, LegendIconContext, TraceModule } from '@mk7s/holochart-runtime';
import { supplyBinGroups } from '../shared/bins.ts';
import { histogram2dAttributes } from './attributes.ts';
import { calcHistogram2d, histogram2dExtremes, type Histogram2dCalc } from './calc.ts';
import { cssStops, supplyZColoraxisDefaults, zColorbar, zColorMapping } from './colorscale.ts';
import { supplyHistogram2dDefaults } from './defaults.ts';
import { describeHistogram2d } from './describe.ts';
import { histogram2dHoverPoints } from './hover.ts';
import { histogram2dRenderer } from './plot.ts';

/**
 * Layout defaults shared by the 2D histograms: bin groups (with every other binned trace) and the
 * color axes they reference.
 */
export function supplyHistogram2dLayoutDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  supplyBinGroups(ctx.fullData, layoutOut);
  supplyZColoraxisDefaults(layoutIn, layoutOut, ctx);
}

/** Legend glyph (only shown with `showlegend: true`): a swatch of the colorscale's middle. */
export function heatmapLegendIcon(trace: FullTrace, ctx?: LegendIconContext): LegendGlyph {
  const stops = ctx ? cssStops(zColorMapping(trace, ctx.fullLayout, [0, 1])) : [];
  const mid = stops[Math.floor(stops.length / 2)]?.[1] ?? '#888';
  return { kind: 'fill', fill: { color: mid } };
}

export const histogram2d: TraceModule<Histogram2dCalc, typeof histogram2dAttributes.children> = {
  type: 'histogram2d',
  categories: ['cartesian', '2dMap', 'histogram', 'showLegend'],
  schema: histogram2dAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      '2D histograms: samples binned along x and y, counted or aggregated per cell, drawn as a GPU heatmap (one textured quad with a colorscale lookup).',
    docsPage: 'histogram2d',
    plotlyEquivalent: 'histogram2d',
  },
  supplyDefaults: supplyHistogram2dDefaults,
  supplyLayoutDefaults: supplyHistogram2dLayoutDefaults,
  calc: calcHistogram2d,
  extremes: histogram2dExtremes,
  plot: histogram2dRenderer,
  hoverPoints: histogram2dHoverPoints,
  legendIcon: heatmapLegendIcon,
  colorbar: (trace, ctx) => zColorbar(trace, ctx.fullLayout),
  describe: describeHistogram2d,
};

export { histogram2dAttributes } from './attributes.ts';
export type { Histogram2dCalc, Histogram2dAxisBins } from './calc.ts';
