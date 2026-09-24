import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Filled bands without lines (plan E10.3): `contours.showlines: false` leaves only the bands, here
 * of a `probability` normalized density (each level is a share of all samples), with the Viridis
 * colorscale, 20 automatic levels and unsmoothed contours (`line.smoothing: 0`, straight segments
 * between bin-edge crossings). The ring-shaped data makes a hole in the middle band.
 */
export const meta: ExampleMeta = {
  title: '2D density contour: bands without lines',
  description: 'A ring-shaped density as filled Viridis bands, without lines or smoothing.',
  tags: ['histogram2dcontour', 'contour', 'statistical', 'histnorm', 'colorscale'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(13);
  const normal = gaussian(random);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 8000; i++) {
    const a = random() * 2 * Math.PI;
    const r = 2.2 + normal() * 0.45;
    x.push(r * Math.cos(a) + normal() * 0.2);
    y.push(r * Math.sin(a) + normal() * 0.2);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'histogram2dcontour',
        x,
        y,
        histnorm: 'probability',
        ncontours: 20,
        colorscale: 'Viridis',
        contours: { showlines: false },
        line: { smoothing: 0 },
        colorbar: { title: { text: 'share' }, tickformat: '.1%' },
      },
    ],
    layout: {
      title: { text: 'A ring of samples' },
      yaxis: { scaleanchor: 'x' },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
