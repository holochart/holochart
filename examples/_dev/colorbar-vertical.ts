import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Vertical colorbar (E5.3) for a scatter trace colored by a numeric array: Viridis gradient, the
 * axis tick API (`dtick`, `ticksuffix`, outside tick marks), a right-side title and the default
 * placement beside the plot, which pushes the right margin.
 */
export const meta: ExampleMeta = {
  title: 'Colorbar: vertical, titled, custom ticks',
  description:
    'Scatter colored by depth with a Viridis colorbar: outside ticks every 20 m, a unit suffix and a rotated right-side title.',
  tags: ['dev', 'chart', 'colorbar', 'scatter'],
  size: { width: 720, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(11));
  const n = 300;
  const x = Float64Array.from({ length: n }, () => normal() * 2);
  const y = Float64Array.from({ length: n }, () => normal() * 1.5);
  const depth = Array.from(x, (v, i) => Math.round(50 + v * 18 + (y[i] as number) * 12));

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x,
        y,
        marker: {
          size: 9,
          color: depth,
          colorscale: 'Viridis',
          showscale: true,
          colorbar: {
            title: { text: 'Depth', side: 'right' },
            ticks: 'outside',
            dtick: 20,
            ticksuffix: ' m',
          },
        },
      },
    ],
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
