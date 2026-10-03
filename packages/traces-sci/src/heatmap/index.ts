/**
 * The `heatmap` trace module (plan E11.1): a grid of values — a 2D `z`, or 1D `z` with `x` / `y`
 * columns — drawn as colored cells on the GPU (one float texture and a colorscale LUT, uneven
 * cells, gaps, `zsmooth`), on linear, log, date or category axes, with `connectgaps`, annotated
 * cells (`texttemplate`), per-cell hover and a colorbar. Registered with `register(heatmap)`
 * (ADR-019).
 *
 * `xperiod` / `yperiod` alignment and range breaks as in `./calc.ts`. Deferred:
 * `xcalendar` / `ycalendar`.
 */
import {
  gridA11y,
  supplyZColoraxisDefaults,
  heatmapLegendIcon,
  zColorbar,
} from '@mk7s/holochart-traces-stats';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { heatmapAttributes } from './attributes.ts';
import { calcHeatmap, heatmapCategoryValues, heatmapExtremes, type HeatmapCalc } from './calc.ts';
import { supplyHeatmapDefaults } from './defaults.ts';
import { describeHeatmap } from './describe.ts';
import { heatmapHoverPoints } from './hover.ts';
import { heatmapRenderer } from './plot.ts';

export const heatmap: TraceModule<HeatmapCalc, typeof heatmapAttributes.children> = {
  type: 'heatmap',
  categories: ['cartesian', '2dMap', 'showLegend'],
  schema: heatmapAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'Heatmaps: a grid of values drawn as colored cells on the GPU (one float texture with a colorscale lookup), with optional cell labels.',
    docsPage: 'heatmap',
    plotlyEquivalent: 'heatmap',
  },
  supplyDefaults: supplyHeatmapDefaults,
  supplyLayoutDefaults: supplyZColoraxisDefaults,
  calc: calcHeatmap,
  extremes: heatmapExtremes,
  categoryValues: heatmapCategoryValues,
  plot: heatmapRenderer,
  hoverPoints: heatmapHoverPoints,
  a11y: gridA11y,
  legendIcon: heatmapLegendIcon,
  colorbar: (trace, ctx) => zColorbar(trace, ctx.fullLayout),
  describe: describeHeatmap,
};

export { heatmapAttributes } from './attributes.ts';
export type { HeatmapAxisCells, HeatmapCalc } from './calc.ts';
