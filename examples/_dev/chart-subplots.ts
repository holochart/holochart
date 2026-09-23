// Imported from source until examples/package.json depends on `@mk7s/holochart`.
import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Two cartesian subplots stacked by axis domains (E4.3): `xy` on top, `x2y2` below, each a
 * scissored viewport of one canvas (ADR-004). The top plot autoranges; the bottom one has a
 * categorical x axis and a fixed y `range`.
 */
export const meta: ExampleMeta = {
  title: 'Chart: 2×1 subplots',
  description:
    'Axis domains place two subplots in one canvas; a linear autoranged top plot and a categorical bottom plot with a fixed y range.',
  tags: ['dev', 'chart', 'scatter', 'subplots', 'runtime'],
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(11);
  const n = 60;
  const x = Float64Array.from({ length: n }, (_, i) => i / 4);
  const y = Float64Array.from(x, (v) => Math.sin(v) * 3 + (random() - 0.5));

  const days: string[] = [];
  const load: number[] = [];
  for (let k = 0; k < 3; k++) {
    for (const d of DAYS) {
      days.push(d);
      load.push(20 + random() * 60);
    }
  }

  // Vendored Inter: deterministic tick labels and legend text (no CDN font).
  useExampleFonts();
  const chart = createChart(el, {
    data: [
      { mode: 'markers', x, y, marker: { size: 7 } },
      {
        mode: 'markers',
        x: days,
        y: load,
        xaxis: 'x2',
        yaxis: 'y2',
        marker: { symbol: 'square', size: 10, opacity: 0.75 },
      },
    ],
    layout: {
      margin: { l: 40, r: 20, t: 20, b: 30 },
      plot_bgcolor: '#e5ecf6',
      yaxis: { domain: [0.55, 1] },
      xaxis2: { anchor: 'y2' },
      yaxis2: { domain: [0, 0.45], anchor: 'x2', range: [0, 100] },
    },
    config: { responsive: true },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
