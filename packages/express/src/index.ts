/**
 * @mk7s/holochart-express — Plotly Express-style charts from tabular data (plan E23, milestone
 * M3): one call turns rows, columns, an Arrow table or CSV into a figure with one trace per group,
 * a legend, facets, animation frames and marginals, following plotly.py's `px` and
 * `figure_factory.create_distplot`.
 *
 * ```ts
 * import hx from '@mk7s/holochart-express';
 * const figure = hx.scatter(rows, { x: 'gdpPercap', y: 'lifeExp', color: 'continent', logX: true });
 * await hx.scatter(el, rows, { x: 'gdpPercap', y: 'lifeExp' }); // or render directly
 * ```
 *
 * Every function returns a plain figure (`{ data, layout, frames? }`) to adjust and pass to
 * `createChart`, or renders it with `newPlot` when given an element first. Rendering needs the
 * figure's trace types and components registered: use the `@mk7s/holochart` bundle, or register
 * the modules (`register(...basicTraces, ...statsTraces, ...builtinComponents)`).
 */
import { area, line, scatter } from './charts/scatter.ts';
import { bar, timeline } from './charts/bar.ts';
import { box, histogram, strip, violin } from './charts/distribution.ts';
import { densityContour, densityHeatmap } from './charts/density.ts';
import { ecdf } from './charts/ecdf.ts';
import { parallelCategories, parallelCoordinates, scatterMatrix } from './charts/multidim.ts';
import { pie } from './charts/pie.ts';
import { fromCSV } from './data/csv.ts';
import { columnTypes, inferColumnType, Table, toTable } from './data/table.ts';
import { distplot } from './ff/distplot.ts';

export {
  area,
  bar,
  box,
  densityContour,
  densityHeatmap,
  ecdf,
  histogram,
  line,
  parallelCategories,
  parallelCoordinates,
  pie,
  scatter,
  scatterMatrix,
  strip,
  timeline,
  violin,
};
export { ecdfValues } from './charts/ecdf.ts';
export { fitNormal, gaussianKde, normalPdf } from './stats/kde.ts';
export type { GaussianKde } from './stats/kde.ts';
export { fromCSV, parseCSVRecords } from './data/csv.ts';
export type { CSVOptions } from './data/csv.ts';
export { columnTypes, inferColumnType, isMissing, Table, toTable } from './data/table.ts';
export type {
  ArrowLikeTable,
  ArrowLikeVector,
  ColumnsInput,
  ColumnType,
  DataInput,
  RowsInput,
} from './data/table.ts';
export { distplot } from './ff/distplot.ts';
export type { DistplotOptions } from './ff/distplot.ts';
export type { ExpressFunction } from './core/render.ts';
export type * from './options.ts';
export type { AreaOptions, LineOptions, ScatterOptions } from './charts/scatter.ts';
export type { BarOptions, TimelineOptions } from './charts/bar.ts';
export type {
  BoxOptions,
  HistogramOptions,
  StripOptions,
  ViolinOptions,
} from './charts/distribution.ts';
export type { DensityContourOptions, DensityHeatmapOptions } from './charts/density.ts';
export type { EcdfMode, EcdfNorm, EcdfOptions } from './charts/ecdf.ts';
export type {
  ParallelCategoriesOptions,
  ParallelCoordinatesOptions,
  ScatterMatrixOptions,
} from './charts/multidim.ts';
export type { PieOptions } from './charts/pie.ts';

/** Data helpers: `data.fromCSV(text)`, `data.toTable(rows)`, `data.columnTypes(rows)`, …. */
export const data = { fromCSV, toTable, columnTypes, inferColumnType, Table } as const;

/** Figure factories: `ff.distplot(samples, labels, options)`. */
export const ff = { distplot } as const;

/** Everything as one namespace: `hx.scatter(…)`, `hx.data.fromCSV(…)`, `hx.ff.distplot(…)`. */
const hx = {
  scatter,
  line,
  area,
  bar,
  timeline,
  histogram,
  box,
  violin,
  strip,
  ecdf,
  densityHeatmap,
  densityContour,
  scatterMatrix,
  parallelCoordinates,
  parallelCategories,
  pie,
  data,
  ff,
} as const;

export default hx;
