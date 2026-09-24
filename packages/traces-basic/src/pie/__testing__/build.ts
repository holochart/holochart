/** Test helpers for the pie module: defaults, calc and cross-trace layout without a chart. */
import { supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, domainRect, type DomainTraceEntry } from '@mk7s/holochart-runtime';
import { calcPie, type PieCalc } from '../calc.ts';
import { pie } from '../index.ts';

const registry = createChartRegistry().register(pie);

/** Supply defaults; traces are pies. */
export function defaults(data: unknown[], layout: Record<string, unknown> = {}) {
  const pies = data.map((t) => ({ type: 'pie', ...(t as object) }));
  return supplyDefaults({ data: pies, layout }, registry.core);
}

export interface Built {
  traces: FullTrace[];
  calcs: PieCalc[];
  fullLayout: FullLayout;
  entries: DomainTraceEntry<PieCalc>[];
}

/** Defaults, calc and cross-trace layout of the visible pies on a figure without margins. */
export function build(
  data: unknown[],
  layout: Record<string, unknown> = {},
  size: { width: number; height: number } = { width: 600, height: 400 },
): Built {
  const { fullData, fullLayout } = defaults(data, layout);
  const plotArea = { x: 0, y: 0, ...size };
  const traces = fullData.filter((t) => t.visible === true);
  const calcs = traces.map((trace) => calcPie(trace, { fullLayout }));
  const entries = traces.map((trace, index) => {
    const d = trace['domain'] as { x: [number, number]; y: [number, number] };
    return {
      trace,
      index,
      calc: calcs[index]!,
      domain: { x: d.x, y: d.y, rect: domainRect(plotArea, d.x, d.y) },
    };
  });
  pie.crossTraceLayout!(entries, { fullLayout, ...size, plotArea });
  return { traces, calcs, fullLayout, entries };
}
