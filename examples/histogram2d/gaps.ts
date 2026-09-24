import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Gaps between cells (plan E10.2): `xgap` / `ygap` leave 2 px of background between the cells,
 * a tiled look for coarse grids. `nbinsx` / `nbinsy` ask for at most 16 bins per direction (the
 * size is rounded to a nice value), and a reversed Viridis colorscale replaces the default.
 */
export const meta: ExampleMeta = {
  title: '2D histogram: gaps between cells',
  description:
    'A coarse grid (nbinsx / nbinsy) with 2 px gaps between cells and a custom colorscale.',
  tags: ['histogram2d', 'statistical', 'xgap', 'colorscale'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(3));
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 3000; i++) {
    // Two clusters.
    const second = i % 3 === 0;
    x.push((second ? 3 : 0) + normal() * (second ? 0.7 : 1.1));
    y.push((second ? -1 : 1) + normal() * 0.9);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'histogram2d',
        x,
        y,
        nbinsx: 16,
        nbinsy: 16,
        xgap: 2,
        ygap: 2,
        colorscale: 'Viridis',
      },
    ],
    layout: { title: { text: 'Two clusters, 2 px gaps' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
