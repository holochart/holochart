/**
 * The `histogram2dcontour` trace module (plan E10.3): samples binned like `histogram2d`, drawn as
 * density contours — filled bands (the lazily loaded fill primitive), a smoothed heatmap, or colored
 * lines — with smoothing, dashes and labels along the lines, per-bin hover and a banded colorbar.
 * Registered with `register(histogram2dcontour)` (ADR-019). The contouring itself lives in
 * `shared/contour.ts`, for the M4 `contour` trace.
 *
 * Deferred: constraint contours (`contours.type: 'constraint'`, E11.2).
 */
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import type { FullTrace } from '@mk7s/holochart-core';
import type { LegendGlyph, LegendIconContext, TraceModule } from '@mk7s/holochart-runtime';
import { describeHistogram2d } from '../histogram2d/describe.ts';
import { histogram2dHoverPoints } from '../histogram2d/hover.ts';
import { heatmapLegendIcon, supplyHistogram2dLayoutDefaults } from '../histogram2d/index.ts';
import { histogram2dcontourAttributes } from './attributes.ts';
import {
  calcHistogram2dContour,
  histogram2dContourExtremes,
  type Histogram2dContourCalc,
} from './calc.ts';
import { supplyHistogram2dContourDefaults } from './defaults.ts';
import { histogram2dContourRenderer } from './plot.ts';
import { contourColorbar } from './style.ts';

/** Legend glyph: the line for `coloring: 'none'`, else a swatch of the colorscale. */
function contourLegendIcon(trace: FullTrace, ctx?: LegendIconContext): LegendGlyph {
  const contours = (trace['contours'] ?? {}) as Record<string, unknown>;
  if (contours['coloring'] !== 'none') return heatmapLegendIcon(trace, ctx);
  const line = (trace['line'] ?? {}) as Record<string, unknown>;
  return {
    kind: 'line',
    line: {
      color: typeof line['color'] === 'string' ? line['color'] : '#000',
      width: typeof line['width'] === 'number' ? line['width'] : 0.5,
      ...(typeof line['dash'] === 'string' ? { dash: line['dash'] } : {}),
    },
  };
}

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
  plot: histogram2dContourRenderer,
  hoverPoints: (calc, trace, query, ctx) =>
    histogram2dHoverPoints(calc, trace, query, ctx, { ranges: false }),
  legendIcon: contourLegendIcon,
  colorbar: (trace, ctx) => contourColorbar(trace, ctx.fullLayout),
  describe: describeHistogram2d,
};

export { histogram2dcontourAttributes } from './attributes.ts';
export type { Histogram2dContourCalc } from './calc.ts';
