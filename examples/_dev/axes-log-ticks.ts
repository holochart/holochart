import { componentsReady, createChart, makeSubplots } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Automatic log ticks (E3.7) in the default look, one span per subplot: two decades get 1-2-5
 * ticks (`D2`) whose in-between labels are small digits without `ticksuffix` (Plotly), or full
 * values with the suffix (`minorloglabels: 'complete'`); many decades get powers of ten written
 * per `exponentformat` (`power` here, with the suffix after the exponent); less than a decade gets
 * linear steps (`L<f>`) labelled in full with `tickprefix`.
 */
export const meta: ExampleMeta = {
  title: 'Axes: automatic log ticks and labels',
  description:
    'Log axes at four spans: 1-2-5 ticks with small-digit or complete labels, powers of ten in power format, and linear steps within a decade, with tick prefixes and suffixes.',
  tags: ['dev', 'chart', 'axes', 'log'],
  size: { width: 720, height: 460 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

/** `n` points of `a · 10^(k·i)` from x = 1. */
function growth(n: number, a: number, k: number): { x: number[]; y: number[] } {
  const x = Array.from({ length: n }, (_, i) => i + 1);
  return { x, y: x.map((i) => a * 10 ** (k * (i - 1))) };
}

export function run(el: HTMLElement): ExampleHandle {
  const sp = makeSubplots({
    rows: 2,
    cols: 2,
    subplotTitles: [
      'small digits (Plotly default)',
      "minorloglabels: 'complete'",
      "exponentformat: 'power'",
      'within a decade: linear steps',
    ],
    verticalSpacing: 0.2,
  });
  const chart = createChart(el, {
    data: [
      sp.place({ mode: 'lines+markers', name: 'tokens', ...growth(12, 0.8, 0.2) }, 1, 1),
      sp.place({ mode: 'lines+markers', name: 'tokens', ...growth(12, 0.8, 0.2) }, 1, 2),
      sp.place({ mode: 'lines+markers', name: 'energy', ...growth(12, 3, 0.9) }, 2, 1),
      sp.place({ mode: 'lines+markers', name: 'price', ...growth(12, 2.2, 0.05) }, 2, 2),
    ],
    layout: {
      ...sp.layout,
      showlegend: false,
      title: { text: 'Automatic log ticks' },
      yaxis: { ...(sp.layout['yaxis'] as object), type: 'log', ticksuffix: 'T' },
      yaxis2: {
        ...(sp.layout['yaxis2'] as object),
        type: 'log',
        ticksuffix: 'T',
        minorloglabels: 'complete',
      },
      yaxis3: {
        ...(sp.layout['yaxis3'] as object),
        type: 'log',
        exponentformat: 'power',
        ticksuffix: ' J',
      },
      yaxis4: { ...(sp.layout['yaxis4'] as object), type: 'log', tickprefix: '$' },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
