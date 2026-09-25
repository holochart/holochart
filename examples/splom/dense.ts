import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A dense scatter plot matrix (plan E10.9): eight correlated signals, 400 samples, 64 cells.
 * Each cell is one instanced draw over the two shared dimension buffers, so the matrix costs
 * eight uploads whatever the number of cells. Small, translucent points show the density; the
 * grid gap is tightened for the many cells.
 */
export const meta: ExampleMeta = {
  title: 'Scatter plot matrix: 8 dimensions',
  description: 'Eight correlated signals, 400 samples in 64 cells, with small translucent points.',
  tags: ['splom', 'statistical', 'large-data'],
  size: { width: 640, height: 640 },
  testTolerance: 0.006,
};

const DIMS = 8;
const N = 400;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(5));
  const cols = Array.from({ length: DIMS }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) {
    const f = normal();
    const g = normal();
    for (let d = 0; d < DIMS; d++) {
      const a = (d * Math.PI) / DIMS;
      const v = Math.cos(a) * f + Math.sin(a) * g + 0.35 * normal();
      // Two signals are skewed, one is quantized.
      cols[d]![i] = d === 3 ? Math.exp(0.6 * v) : d === 6 ? Math.round(v * 2) / 2 : v;
    }
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'splom',
        name: 'signals',
        dimensions: cols.map((values, d) => ({ label: `s${d + 1}`, values })),
        marker: { size: 2.5, opacity: 0.6, color: '#5e74d5' },
      },
    ],
    layout: {
      title: { text: 'Eight signals' },
      grid: { xgap: 0.04, ygap: 0.04 },
      showlegend: false,
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
