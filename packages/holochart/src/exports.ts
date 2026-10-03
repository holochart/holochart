/**
 * The public API shared by the full bundle (`index.ts`) and the 2D bundle of the script-tag build
 * (`bundle-2d.ts`): everything but the built-in module list, their registration and the 3D
 * package. No side effects.
 */
import type { Config } from '@mk7s/holochart-core';
import * as runtime from '@mk7s/holochart-runtime';
import type {
  AttributeUpdate,
  Chart,
  ChartOptions,
  DownloadImageOptions,
  LayoutUpdate,
  ToImageOptions,
} from '@mk7s/holochart-runtime';
import type { Figure } from './figure.ts';
import type { Data, Layout } from './generated/figure.ts';

export * from '@mk7s/holochart-core';
export * from '@mk7s/holochart-runtime';
// Core's module types cover only the pure parts; the runtime's add the render parts.
export type { ComponentModule, TraceModule } from '@mk7s/holochart-runtime';

/**
 * Figure types (backlog S1.6): `Figure`, `Frame`, `Data` (every built-in trace type) and `Layout`
 * (every layout attribute of the bundle's traces and components). Named here, these replace the
 * packages' types of the same name (core's base `Layout`, `traces-basic`'s `BarTrace` without the
 * 2.5D attributes, …).
 */
export type { Figure, Frame } from './figure.ts';
export type * from './generated/figure.ts';
export type {
  BarTrace,
  Data,
  FunnelTrace,
  HeatmapTrace,
  IcicleTrace,
  Layout,
  LayoutTitle,
  PieTrace,
  ScatterTrace,
  TreemapTrace,
  WaterfallTrace,
} from './generated/figure.ts';

type TraceIndices = number | readonly number[];

// The entry points are re-bound locally (not only re-exported) so that using any of them keeps the
// bundle module, and with it the registration of the built-ins, in a tree-shaken build
// ("sideEffects": false). The ones taking figures are typed against this bundle's `Figure`,
// `Data` and `Layout` (types only: the functions are the runtime's).

/** Create a chart in `el` (see the runtime's `createChart`), its figure typed as a {@link Figure}. */
export const createChart: (el: HTMLElement, figure?: Figure, options?: ChartOptions) => Chart =
  runtime.createChart;
/** Draw a new chart in `el`: Plotly's `(el, data, layout?, config?)` or `(el, figure)`. */
export const newPlot: (
  el: HTMLElement,
  dataOrFigure?: readonly Data[] | Figure,
  layout?: Layout,
  config?: Config,
  options?: ChartOptions,
) => Promise<Chart> = runtime.newPlot;
/** Update `el` to show a new figure efficiently (diffing), or create the chart if needed. */
export const react: (
  el: HTMLElement,
  dataOrFigure?: readonly Data[] | Figure,
  layout?: Layout,
  config?: Config,
  options?: ChartOptions,
) => Promise<Chart> = runtime.react;
/**
 * Plotly `restyle`: attribute paths (`'marker.color'`) whose array values hold one value per
 * trace, so the update is not typed against the traces (`AttributeUpdate`).
 */
export const restyle = runtime.restyle;
/** Plotly `relayout`: attribute paths (untyped) and whole layout attributes (typed). */
export const relayout: (el: HTMLElement, update: LayoutUpdate<Layout>) => Promise<Chart> =
  runtime.relayout;
/** Plotly `update`: `restyle` and `relayout` in one step. */
export const update: (
  el: HTMLElement,
  traceUpdate?: AttributeUpdate,
  layoutUpdate?: LayoutUpdate<Layout>,
  traces?: TraceIndices,
) => Promise<Chart> = runtime.update;
/** Plotly `addTraces`: add traces at the end, or at `newIndices`. */
export const addTraces: (
  el: HTMLElement,
  traces: Data | readonly Data[],
  newIndices?: TraceIndices,
) => Promise<Chart> = runtime.addTraces;
export const deleteTraces = runtime.deleteTraces;
export const moveTraces = runtime.moveTraces;
export const extendTraces = runtime.extendTraces;
export const prependTraces = runtime.prependTraces;
export const fromJSON = runtime.fromJSON;
export const chartToJSON = runtime.chartToJSON;
/** Plotly's `toImage`: render the chart in `el`, or a figure drawn offscreen, to a data URL. */
export const toImage: (
  target: HTMLElement | Figure,
  options?: ToImageOptions,
  chartOptions?: ChartOptions,
) => Promise<string> = runtime.toImage;
/** Plotly's `downloadImage`: {@link toImage} and save the file. Resolves to the file name. */
export const downloadImage: (
  target: HTMLElement | Figure,
  options?: DownloadImageOptions,
  chartOptions?: ChartOptions,
) => Promise<string> = runtime.downloadImage;
export const purge = runtime.purge;
export const register = runtime.register;
export const registry = runtime.registry;
export const setDefaultTemplate = runtime.setDefaultTemplate;

export * from '@mk7s/holochart-traces-basic';
export * from '@mk7s/holochart-traces-stats';
export * from '@mk7s/holochart-traces-sci';
export * from '@mk7s/holochart-traces-finance';
export * from '@mk7s/holochart-traces-hier';
export * from '@mk7s/holochart-components';
/**
 * The 2.5D view (`layout.view3d`) and extruded bars and areas (`depth`; plan E8.9, E9.10), and
 * pies, treemaps and icicles with depth and a tilt of their own (E9.12), registered by the full
 * bundle (not in `basic`).
 */
export {
  extrudedBar,
  extrudedIcicle,
  extrudedPie,
  extrudedScatter,
  extrudedTreemap,
  view3dAttributes,
  view3dComponent,
  view3dEnabled,
} from './view3d/index.ts';
/** The built-in themes (plan E8.1), namespaced: `themes.THEMES`, `themes.plotly_dark`, … */
export * as themes from '@mk7s/holochart-themes';
/**
 * Plotly Express-style charts from tabular data (plan E23), namespaced because its `scatter`,
 * `strip`, `box`, … share names with the trace modules above: `express.scatter(rows, { x, y })`.
 */
export * as express from '@mk7s/holochart-express';
/** Web fonts for chart text (plan E8.3): `fonts.register('Inter', { regular, bold, … })`. */
export { fonts } from '@mk7s/holochart-render';
/**
 * Custom marker symbols (plan E8.11): `symbols.register('pin', { path: 'M…' })` makes `'pin'` (and
 * `'pin-open'`, …) a `marker.symbol` value.
 */
export { symbols } from '@mk7s/holochart-render';

/**
 * Low-level GPU primitives and the render root, for plugin authors and custom traces (plan E22).
 * Namespaced so they don't collide with the figure-level API (e.g. core's `Primitive` value type).
 *
 * @experimental
 */
export * as render from '@mk7s/holochart-render';
