import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Bubbles with a colorscale (plan E9.5, E5.3): each bubble encodes two values. `marker.size`
 * (area-scaled) is a well's daily output and the numeric `marker.color` its depth, mapped through
 * `'Viridis'`. `marker.showscale: true` draws a colorbar, titled and with a unit suffix.
 */
export const meta: ExampleMeta = {
  title: 'Bubble: colorscale',
  description:
    'Bubbles sized by one value and colored by another through Viridis, with a titled colorbar.',
  tags: ['bubble', 'scatter', 'markers', 'colorscale', 'colorbar'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(313);
  const n = 45;
  const x = Array.from({ length: n }, () => random() * 20);
  const y = Array.from({ length: n }, () => random() * 12);
  // Deeper wells in the east produce more.
  const depth = x.map((v) => Math.round(800 + v * 60 + random() * 500));
  const output = depth.map((d) => Math.round((d - 600) * (0.2 + random() * 0.6)));
  const maxOutput = Math.max(...output);

  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'wells',
        x,
        y,
        marker: {
          size: output,
          sizemode: 'area',
          sizeref: (2 * maxOutput) / 44 ** 2,
          sizemin: 4,
          color: depth,
          colorscale: 'Viridis',
          showscale: true,
          colorbar: { title: { text: 'Depth', side: 'right' }, ticksuffix: ' m' },
        },
        hovertemplate: '%{marker.size} bbl/day<br>%{marker.color} m deep<extra></extra>',
      },
    ],
    layout: {
      font: { family: 'Inter', size: 12 },
      xaxis: { title: { text: 'East (km)' } },
      yaxis: { title: { text: 'North (km)' } },
      margin: { l: 56, r: 24, t: 24, b: 48 },
      plot_bgcolor: '#f4f6fa',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
