/**
 * @mk7s/holochart-express — Plotly Express-style charts from tabular data (plan E23, milestone
 * M3): one call turns rows, columns, an Arrow table or CSV into a figure with one trace per group,
 * a legend, facets, animation frames and marginals, following plotly.py's `px` and
 * `figure_factory.create_distplot`. `imshow` (M4) draws arrays rather than tables: matrices as
 * heatmaps, RGB / RGBA arrays and `ImageData` as images. M5 adds trendlines (OLS, LOWESS, rolling,
 * EWM, expanding) with `getTrendlineResults`, `agg` on bars and lines, funnels, polar charts, and
 * `sunburst` / `treemap` / `icicle` with the `path` helper.
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
import { funnel, funnelArea } from './charts/funnel.ts';
import { icicle, sunburst, treemap } from './charts/hierarchy.ts';
import { imshow } from './charts/imshow.ts';
import { parallelCategories, parallelCoordinates, scatterMatrix } from './charts/multidim.ts';
import { pie } from './charts/pie.ts';
import { barPolar, linePolar, scatterPolar } from './charts/polar.ts';
import { getTrendlineResults } from './core/trendline.ts';
import { fromCSV } from './data/csv.ts';
import { columnTypes, inferColumnType, Table, toTable } from './data/table.ts';
import { distplot } from './ff/distplot.ts';

export {
  area,
  bar,
  barPolar,
  box,
  densityContour,
  densityHeatmap,
  ecdf,
  funnel,
  funnelArea,
  getTrendlineResults,
  histogram,
  icicle,
  imshow,
  line,
  linePolar,
  parallelCategories,
  parallelCoordinates,
  pie,
  scatter,
  scatterMatrix,
  scatterPolar,
  strip,
  sunburst,
  timeline,
  treemap,
  violin,
};
export { ecdfValues } from './charts/ecdf.ts';
export { fitNormal, gaussianKde, normalPdf } from './stats/kde.ts';
export type { GaussianKde } from './stats/kde.ts';
export { ols } from './stats/regression.ts';
export type { OlsFit } from './stats/regression.ts';
export { lowess } from './stats/lowess.ts';
export type { LowessOptions } from './stats/lowess.ts';
export { ewm, expanding, rolling } from './stats/window.ts';
export type { EwmFunction, EwmOptions, RollingOptions, WindowFunction } from './stats/window.ts';
export type {
  TrendlineArgs,
  TrendlineKind,
  TrendlineOptions,
  TrendlineResult,
} from './core/trendline.ts';
export type { AggFunction } from './charts/shared.ts';
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
export type { FunnelAreaOptions, FunnelOptions } from './charts/funnel.ts';
export type {
  HierarchyOptions,
  IcicleOptions,
  SunburstOptions,
  TreemapOptions,
} from './charts/hierarchy.ts';
export type {
  BarPolarOptions,
  LinePolarOptions,
  PolarOptions,
  ScatterPolarOptions,
} from './charts/polar.ts';
export type {
  ImageDataLike,
  ImshowArray,
  ImshowFunction,
  ImshowInput,
  ImshowLabels,
  ImshowOptions,
  ImshowValue,
} from './charts/imshow.ts';

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
  imshow,
  scatterMatrix,
  parallelCoordinates,
  parallelCategories,
  pie,
  funnel,
  funnelArea,
  sunburst,
  treemap,
  icicle,
  scatterPolar,
  linePolar,
  barPolar,
  getTrendlineResults,
  data,
  ff,
} as const;

export default hx;
