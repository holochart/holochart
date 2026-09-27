/**
 * The `histogram2dcontour` trace module (plan E10.3): samples binned like `histogram2d`, drawn as
 * density contours — filled bands (the lazily loaded fill primitive), a smoothed heatmap, or colored
 * lines — with smoothing, dashes and labels along the lines, per-bin hover and a banded colorbar,
 * or as constraint contours (E11.2). Registered with `register(histogram2dcontour)` (ADR-019). The
 * contouring, drawing and colors are shared with the `contour` trace (`../contour/`).
 */
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { createContourRenderer } from '../contour/plot.ts';
import { contourColorbar, contourLegendIcon } from '../contour/style.ts';
import { describeHistogram2d } from '../histogram2d/describe.ts';
import { histogram2dHoverPoints } from '../histogram2d/hover.ts';
import { supplyHistogram2dLayoutDefaults } from '../histogram2d/index.ts';
import { cellTexts } from '../histogram2d/text.ts';
import { histogram2dcontourAttributes } from './attributes.ts';
import {
  calcHistogram2dContour,
  histogram2dContourExtremes,
  type Histogram2dContourCalc,
} from './calc.ts';
import { supplyHistogram2dContourDefaults } from './defaults.ts';

export const histogram2dcontour: TraceModule<
  Histogram2dContourCalc,
  typeof histogram2dcontourAttributes.children
> = {
  type: 'histogram2dcontour',
  categories: ['cartesian', '2dMap', 'histogram', 'contour', 'showLegend'],
  schema: histogram2dcontourAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      '2D density contours: samples binned along x and y, drawn as filled contour bands, a smoothed heatmap or level lines, with labels along the lines.',
    docsPage: 'histogram2d-contour',
    plotlyEquivalent: 'histogram2dcontour',
  },
  supplyDefaults: supplyHistogram2dContourDefaults,
  supplyLayoutDefaults: supplyHistogram2dLayoutDefaults,
  calc: calcHistogram2dContour,
  extremes: histogram2dContourExtremes,
  // Cell labels skip the padding bins (Plotly).
  plot: createContourRenderer<Histogram2dContourCalc>({
    cellTexts: (ctx, mapping) =>
      cellTexts(ctx.calc, ctx.trace, mapping, ctx, ctx.fullLayout, { skipBorder: true }),
  }),
  hoverPoints: (calc, trace, query, ctx) =>
    histogram2dHoverPoints(calc, trace, query, ctx, { ranges: false }),
  legendIcon: contourLegendIcon,
  colorbar: (trace, ctx) => contourColorbar(trace, ctx.fullLayout),
  describe: describeHistogram2d,
};

export { histogram2dcontourAttributes } from './attributes.ts';
export type { Histogram2dContourCalc } from './calc.ts';
