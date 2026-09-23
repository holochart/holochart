/**
 * Plotly-compatible functional API (plan §7.1), keyed by element: every function finds the chart
 * living in `el` (see `getChart`). All of them return a promise that resolves after render.
 */
import { isPlainObject, type FigureInput } from '@mk7s/holochart-core';
import { createChart, getChart, type Chart, type ChartOptions } from './chart.ts';
import type { AttributeUpdate } from './plan.ts';

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

/** Destroy the chart in `el` (if any) and free everything it holds. */
export function purge(el: HTMLElement): void {
  getChart(el)?.destroy();
}
