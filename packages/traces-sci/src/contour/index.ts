/**
 * The `contour` trace module (plan E11.2): level lines of a grid of values (`z`, uneven grids
 * allowed), drawn as filled bands (the lazily loaded fill primitive), a smooth GPU heatmap or
 * colored lines, with `line.smoothing`, dashes and level labels along the lines (the lines break
 * under them), or as constraint contours shading where `z` satisfies an inequality. Hover snaps to
 * the nearest grid point; filled contours get a banded colorbar. Registered with
 * `register(contour)` (ADR-019).
 *
 * The grid comes from `heatmap` (`../heatmap/calc.ts`); contouring, drawing and colors are shared
 * with `histogram2dcontour` (traces-stats `contour/`).
 *
 * `xperiod` / `yperiod` alignment and range breaks as in `../heatmap/calc.ts`. Deferred:
 * `xcalendar` / `ycalendar`.
 */
import type { FullLayout, LayoutDefaultsContext } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import {
  contourColorbar,
  contourLegendIcon,
  createContourRenderer,
  gridA11y,
  supplyZColoraxisDefaults,
} from '@mk7s/holochart-traces-stats';
import { heatmapCellTexts } from '../heatmap/text.ts';
import { contourAttributes } from './attributes.ts';
import { calcContour, contourExtremes, type ContourTraceCalc } from './calc.ts';
import { supplyContourTraceDefaults } from './defaults.ts';
import { describeContour } from './describe.ts';
import { contourHoverPoints } from './hover.ts';

/** Layout defaults: the color axes contour traces reference. */
function supplyContourLayoutDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  supplyZColoraxisDefaults(layoutIn, layoutOut, ctx);
}

export const contour: TraceModule<ContourTraceCalc, typeof contourAttributes.children> = {
  type: 'contour',
  categories: ['cartesian', '2dMap', 'contour', 'showLegend'],
  schema: contourAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'Contour plots: level lines of a grid of values, drawn as filled bands, a smooth heatmap or lines, with level labels along the lines, or constraint contours shading where the values satisfy an inequality.',
    docsPage: 'contour',
    plotlyEquivalent: 'contour',
  },
  supplyDefaults: supplyContourTraceDefaults,
  supplyLayoutDefaults: supplyContourLayoutDefaults,
  calc: calcContour,
  extremes: contourExtremes,
  plot: createContourRenderer<ContourTraceCalc>({
    cellTexts: (ctx, mapping) =>
      heatmapCellTexts(ctx.calc, ctx.trace, mapping, ctx, ctx.fullLayout),
  }),
  hoverPoints: contourHoverPoints,
  a11y: gridA11y,
  legendIcon: contourLegendIcon,
  colorbar: (trace, ctx) => contourColorbar(trace, ctx.fullLayout),
  describe: describeContour,
};

export { contourAttributes } from './attributes.ts';
export type { ContourTraceCalc } from './calc.ts';
