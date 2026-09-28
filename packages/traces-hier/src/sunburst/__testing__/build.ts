/** Test helpers for the sunburst module: defaults, calc and cross-trace layout without a chart. */
import { supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, domainRect, type DomainTraceEntry } from '@mk7s/holochart-runtime';
import { calcSunburst, type SunburstCalc } from '../geometry.ts';
import { sunburst } from '../index.ts';

const registry = createChartRegistry().register(sunburst);

/** Supply defaults; traces are sunbursts. */
export function defaults(data: unknown[], layout: Record<string, unknown> = {}) {
  const traces = data.map((t) => ({ type: 'sunburst', ...(t as object) }));
  return supplyDefaults({ data: traces, layout }, registry.core);
}

export interface Built {
  traces: FullTrace[];
  calcs: SunburstCalc[];
  fullLayout: FullLayout;
  entries: DomainTraceEntry<SunburstCalc>[];
  warnings: string[];
}

/** Defaults, calc and cross-trace layout of the visible sunbursts on a figure without margins. */
export function build(
  data: unknown[],
  layout: Record<string, unknown> = {},
  size: { width: number; height: number } = { width: 600, height: 400 },
): Built {
  const { fullData, fullLayout } = defaults(data, layout);
  const plotArea = { x: 0, y: 0, ...size };
  const warnings: string[] = [];
  const traces = fullData.filter((t) => t.visible === true);
  const calcs = traces.map((trace) =>
    calcSunburst(trace, { fullLayout }, { warn: (m) => warnings.push(m) }),
  );
  const entries = traces.map((trace, index) => {
    const d = trace['domain'] as { x: [number, number]; y: [number, number] };
    return {
      trace,
      index,
      calc: calcs[index]!,
      domain: { x: d.x, y: d.y, rect: domainRect(plotArea, d.x, d.y) },
    };
  });
  sunburst.crossTraceLayout!(entries, { fullLayout, ...size, plotArea });
  return { traces, calcs, fullLayout, entries, warnings };
}

/** Plotly's "Eve" family tree (its sunburst docs' first example). */
export const EVE = {
  labels: ['Eve', 'Cain', 'Seth', 'Enos', 'Noam', 'Abel', 'Awan', 'Enoch', 'Azura'],
  parents: ['', 'Eve', 'Eve', 'Seth', 'Seth', 'Eve', 'Eve', 'Awan', 'Eve'],
  values: [10, 14, 12, 10, 2, 6, 6, 4, 4],
};
