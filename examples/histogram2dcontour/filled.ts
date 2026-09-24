import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Filled density contours (plan E10.3): 5,000 samples from two overlapping clusters, binned like a
 * 2D histogram and contoured at automatic levels. Bands between levels are filled (the lazily
 * loaded fill primitive) and separated by thin lines; the colorbar shows the bands as blocks.
 */
export const meta: ExampleMeta = {
  title: '2D density contour: filled',
  description: 'Two overlapping clusters as filled density bands with a banded colorbar.',
  tags: ['histogram2dcontour', 'contour', 'statistical', 'density'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(17));
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 5000; i++) {
    const b = i % 5 < 2;
    x.push(b ? 2.2 + normal() * 0.8 : normal() * 1.1);
    y.push(b ? 1.5 + normal() * 0.6 : normal() * 0.9 - 0.3 * x[i]!);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'histogram2dcontour',
        x,
        y,
        ncontours: 12,
        line: { color: 'rgba(10, 10, 15, 0.6)' },
        colorbar: { title: { text: 'count' } },
      },
    ],
    layout: { title: { text: 'Filled density contours' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
