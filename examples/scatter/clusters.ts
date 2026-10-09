import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Three marker traces, one per cluster. A takes every default; B sets a `diamond` symbol, a size,
 * an opacity and an outline; C draws open circles with one size and one color per point. Colors
 * come from the colorway, except the per-point colors of cluster C, and both axes autorange.
 */
export const meta: ExampleMeta = {
  title: 'Scatter: three clusters',
  description:
    'Three seeded clusters as marker traces: colorway colors, a diamond symbol with an outline, and open circles with per-point sizes and colors.',
  tags: ['scatter', 'markers'],
};

function cluster(n: number, cx: number, cy: number, spread: number, seed: number) {
  const normal = gaussian(rng(seed));
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = cx + normal() * spread;
    y[i] = cy + normal() * spread;
  }
  return { x, y };
}

export function run(el: HTMLElement): ExampleHandle {
  const a = cluster(150, 2, 3, 0.8, 1);
  const b = cluster(120, 6, 5, 1.1, 2);
  const c = cluster(40, 4.5, 1, 0.5, 3);
  const random = rng(4);
  const cSizes = Array.from({ length: 40 }, () => 8 + random() * 14);
  const cColors = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? '#ff9e00' : '#6fe3ff'));

  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'markers', name: 'A', ...a },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'B',
        ...b,
        marker: { symbol: 'diamond', size: 9, opacity: 0.8, line: { width: 1, color: '#eceef4' } },
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'C',
        ...c,
        marker: { symbol: 'circle-open', size: cSizes, color: cColors },
      },
    ],
    layout: {},
    config: { responsive: true },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
