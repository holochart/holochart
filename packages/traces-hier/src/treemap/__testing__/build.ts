/** Test helpers for the treemap and icicle modules: defaults, calc and layout without a chart. */
import { supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, domainRect, type DomainTraceEntry } from '@mk7s/holochart-runtime';
import { icicle } from '../../icicle/index.ts';
import type { RectCalc } from '../geometry.ts';
import { treemap } from '../index.ts';

const registry = createChartRegistry().register(treemap, icicle);

/** Supply defaults; traces are treemaps unless they say otherwise. */
export function defaults(data: unknown[], layout: Record<string, unknown> = {}) {
  const traces = data.map((t) => ({ type: 'treemap', ...(t as object) }));
  return supplyDefaults({ data: traces, layout }, registry.core);
}

export interface Built {
  traces: FullTrace[];
  calcs: RectCalc[];
  fullLayout: FullLayout;
  entries: DomainTraceEntry<RectCalc>[];
  warnings: string[];
}

/** Defaults, calc and cross-trace layout of the visible traces on a figure without margins. */
export function build(
  data: unknown[],
  layout: Record<string, unknown> = {},
  size: { width: number; height: number } = { width: 600, height: 400 },
): Built {
  const { fullData, fullLayout } = defaults(data, layout);
  const plotArea = { x: 0, y: 0, ...size };
  const warnings: string[] = [];
  const traces = fullData.filter((t) => t.visible === true);
  const calcs = traces.map((trace) => {
    const mod = trace.type === 'icicle' ? icicle : treemap;
    return mod.calc!(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined });
  });
  const entries = traces.map((trace, index) => {
    const d = trace['domain'] as { x: [number, number]; y: [number, number] };
    return {
      trace,
      index,
      calc: calcs[index]!,
      domain: { x: d.x, y: d.y, rect: domainRect(plotArea, d.x, d.y) },
    };
  });
  for (const type of ['treemap', 'icicle']) {
    const mod = type === 'icicle' ? icicle : treemap;
    const mine = entries.filter((e) => e.trace.type === type);
    if (mine.length > 0) mod.crossTraceLayout!(mine, { fullLayout, ...size, plotArea });
  }
  return { traces, calcs, fullLayout, entries, warnings };
}

/** Plotly's "Eve" family tree. */
export const EVE = {
  labels: ['Eve', 'Cain', 'Seth', 'Enos', 'Noam', 'Abel', 'Awan', 'Enoch', 'Azura'],
  parents: ['', 'Eve', 'Eve', 'Seth', 'Seth', 'Eve', 'Eve', 'Awan', 'Eve'],
  values: [10, 14, 12, 10, 2, 6, 6, 4, 4],
};
