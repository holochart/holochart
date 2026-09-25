import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 100,000 samples of 10 dimensions (plan E10.9, E16): 100 cells, each one instanced draw over two
 * shared column buffers. The ten dimensions are uploaded once (4 MB of float32) and the per-sample
 * style once; box or lasso select in any cell restyles one shared opacity buffer, and zoom or pan
 * only sets the transforms of the cells on the moved axes.
 */
export const meta: ExampleMeta = {
  title: 'Scatter plot matrix: 10 × 100k',
  description:
    '100,000 samples of ten dimensions in 100 cells; select in any cell to highlight everywhere.',
  tags: ['splom', 'statistical', 'perf', 'large-data', 'no-visual-test'],
  size: { width: 800, height: 800 },
};

const DIMS = 10;
const N = 100_000;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(9));
  const cols = Array.from({ length: DIMS }, () => new Float64Array(N));
  const color = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const f = normal();
    const g = normal();
    for (let d = 0; d < DIMS; d++) {
      const a = (d * Math.PI) / DIMS;
      cols[d]![i] = Math.cos(a) * f + Math.sin(a) * g + 0.4 * normal();
    }
    color[i] = f;
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'splom',
        dimensions: cols.map((values, d) => ({ label: `d${d + 1}`, values })),
        marker: { size: 1.5, opacity: 0.25, color, colorscale: 'Viridis' },
      },
    ],
    layout: { grid: { xgap: 0.03, ygap: 0.03 }, dragmode: 'select', showlegend: false },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
