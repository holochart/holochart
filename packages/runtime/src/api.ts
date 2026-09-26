/**
 * Plotly-compatible functional API (plan §7.1), keyed by element: every function finds the chart
 * living in `el` (see `getChart`). All of them return a promise that resolves after render.
 */
import { isPlainObject, type FigureInput } from '@mk7s/holochart-core';
import {
  createChart,
  figureExportSource,
  getChart,
  type Chart,
  type ChartOptions,
} from './chart.ts';
import type { AnimateTarget, AnimationOptions, Frame } from './anim/types.ts';
import type { DownloadImageOptions, ToImageOptions } from './export/types.ts';
import type { AttributeUpdate, MaxPoints, StreamUpdate } from './plan.ts';

type TraceIndices = number | readonly number[];

/**
 * Accept both Plotly call styles: `(el, data, layout?, config?)` and `(el, { data, layout,
 * config, frames })`.
 */
function toFigure(dataOrFigure: unknown, layout?: unknown, config?: unknown): FigureInput {
  if (Array.isArray(dataOrFigure)) {
    return {
      data: dataOrFigure,
      ...(layout === undefined ? {} : { layout }),
      ...(config === undefined ? {} : { config }),
    };
  }
  if (isPlainObject(dataOrFigure)) return dataOrFigure as FigureInput;
  return {
    ...(layout === undefined ? {} : { layout }),
    ...(config === undefined ? {} : { config }),
  };
}

function chartIn(el: HTMLElement, what: string): Chart {
  const chart = getChart(el);
  if (!chart) throw new Error(`${what}: no chart in this element; call newPlot(el, …) first`);
  return chart;
}

function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return fn();
  } catch (error) {
    return Promise.reject(error);
  }
}

/** Draw a new chart in `el`, replacing any chart already there. Resolves after the first frame. */
export function newPlot(
  el: HTMLElement,
  dataOrFigure?: readonly unknown[] | FigureInput,
  layout?: unknown,
  config?: unknown,
  options?: ChartOptions,
): Promise<Chart> {
  return call(() => createChart(el, toFigure(dataOrFigure, layout, config), options).ready);
}

/** Update `el` to show a new figure efficiently (diffing), or create the chart if needed. */
export function react(
  el: HTMLElement,
  dataOrFigure?: readonly unknown[] | FigureInput,
  layout?: unknown,
  config?: unknown,
  options?: ChartOptions,
): Promise<Chart> {
  const figure = toFigure(dataOrFigure, layout, config);
  const chart = getChart(el);
  return chart ? chart.react(figure) : newPlot(el, figure, undefined, undefined, options);
}

/** Plotly `restyle`: see {@link Chart.restyle}. */
export function restyle(
  el: HTMLElement,
  update: AttributeUpdate,
  traces?: TraceIndices,
): Promise<Chart> {
  return call(() => chartIn(el, 'restyle').restyle(update, traces));
}

/** Plotly `relayout`: see {@link Chart.relayout}. */
export function relayout(el: HTMLElement, update: AttributeUpdate): Promise<Chart> {
  return call(() => chartIn(el, 'relayout').relayout(update));
}

/** Plotly `update`: restyle and relayout in one step. */
export function update(
  el: HTMLElement,
  traceUpdate: AttributeUpdate = {},
  layoutUpdate: AttributeUpdate = {},
  traces?: TraceIndices,
): Promise<Chart> {
  return call(() => chartIn(el, 'update').updateAttributes(traceUpdate, layoutUpdate, traces));
}

export function addTraces(
  el: HTMLElement,
  traces: Readonly<Record<string, unknown>> | readonly Readonly<Record<string, unknown>>[],
  newIndices?: TraceIndices,
): Promise<Chart> {
  return call(() => chartIn(el, 'addTraces').addTraces(traces, newIndices));
}

export function deleteTraces(el: HTMLElement, indices: TraceIndices): Promise<Chart> {
  return call(() => chartIn(el, 'deleteTraces').deleteTraces(indices));
}

export function moveTraces(
  el: HTMLElement,
  current: TraceIndices,
  newIndices?: TraceIndices,
): Promise<Chart> {
  return call(() => chartIn(el, 'moveTraces').moveTraces(current, newIndices));
}

/** Plotly `extendTraces`: append points, optionally keeping a rolling window of `maxPoints`. */
export function extendTraces(
  el: HTMLElement,
  update: StreamUpdate,
  indices: TraceIndices,
  maxPoints?: MaxPoints,
): Promise<Chart> {
  return call(() => chartIn(el, 'extendTraces').extendTraces(update, indices, maxPoints));
}

/** Plotly `prependTraces`: insert points at the start (see {@link extendTraces}). */
export function prependTraces(
  el: HTMLElement,
  update: StreamUpdate,
  indices: TraceIndices,
  maxPoints?: MaxPoints,
): Promise<Chart> {
  return call(() => chartIn(el, 'prependTraces').prependTraces(update, indices, maxPoints));
}

/** Plotly `addFrames`: see {@link Chart.addFrames}. */
export function addFrames(
  el: HTMLElement,
  frames: readonly Frame[] | null | undefined,
  indices?: number | readonly (number | null | undefined)[],
): Promise<Chart> {
  return call(() => chartIn(el, 'addFrames').addFrames(frames, indices));
}

/** Plotly `deleteFrames`: see {@link Chart.deleteFrames}. */
export function deleteFrames(
  el: HTMLElement,
  indices?: number | readonly number[] | null,
): Promise<Chart> {
  return call(() => chartIn(el, 'deleteFrames').deleteFrames(indices));
}

/**
 * Plotly `animate`: play frames by group, name or object. See {@link Chart.animate}.
 *
 * @example
 * ```ts
 * await animate(el, null, { frame: { duration: 500, redraw: false }, fromcurrent: true });
 * ```
 */
export function animate(
  el: HTMLElement,
  target?: AnimateTarget,
  options?: AnimationOptions,
): Promise<Chart> {
  return call(() => chartIn(el, 'animate').animate(target, options));
}

/**
 * Show hover labels and emit `hover` programmatically (Plotly `Fx.hover`): points by trace and
 * index, or a position in data units. See {@link Chart.hover}.
 */
export function hover(el: HTMLElement, target: Parameters<Chart['hover']>[0]): void {
  chartIn(el, 'hover').hover(target);
}

/** Hide hover labels in `el` (Plotly `Fx.unhover`). */
export function unhover(el: HTMLElement): void {
  getChart(el)?.unhover();
}

/** Plotly's `Fx` namespace: `Fx.hover(el, [{ curveNumber, pointNumber }])`, `Fx.unhover(el)`. */
export const Fx = { hover, unhover } as const;

/** Destroy the chart in `el` (if any) and free everything it holds. */
export function purge(el: HTMLElement): void {
  getChart(el)?.destroy();
}

function isElement(value: unknown): value is HTMLElement {
  return (
    typeof value === 'object' && value !== null && (value as { nodeType?: unknown }).nodeType === 1
  );
}

/**
 * Plotly's `toImage`: render the chart in `el` — or a figure object (`{ data, layout, config }`),
 * drawn offscreen without a chart on the page — to an image. Resolves to a data URL. See
 * {@link Chart.toImage} for the options (`format`, `width`, `height`, `scale`, `transparent`).
 *
 * @example
 * ```ts
 * const url = await toImage(el, { format: 'jpeg', width: 800, height: 400 });
 * const url2 = await toImage({ data, layout }, { scale: 2 }); // no chart needed
 * ```
 */
export function toImage(
  target: HTMLElement | FigureInput,
  options: ToImageOptions = {},
  chartOptions?: ChartOptions,
): Promise<string> {
  return call(() => {
    if (isElement(target)) return chartIn(target, 'toImage').toImage(options);
    const source = figureExportSource(target, document, chartOptions);
    return import('./export/image.ts').then((m) => m.renderImage(source, options));
  });
}

/**
 * Plotly's `downloadImage`: {@link toImage} and save the file as `<filename>.<format>` (default
 * `newplot.png`). Resolves to the file name.
 */
export function downloadImage(
  target: HTMLElement | FigureInput,
  options: DownloadImageOptions = {},
  chartOptions?: ChartOptions,
): Promise<string> {
  return call(() => {
    if (isElement(target)) return chartIn(target, 'downloadImage').downloadImage(options);
    const source = figureExportSource(target, document, chartOptions);
    return import('./export/image.ts').then((m) => m.downloadImage(source, options));
  });
}
