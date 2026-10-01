import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A scene in Plotly's look (`template: 'plotly-classic'`): white paper, no walls, the light
 * `rgb(204, 204, 204)` 3D grid (Plotly mixes the axis color 73 % towards the background) and
 * `#444` labels; `showbackground` turns on Plotly's `rgba(204, 204, 204, 0.5)` walls. The
 * `scatter3d` markers take the template's colorway.
 */
export const meta: ExampleMeta = {
  title: '3D scene: Plotly look',
  description: 'The 3D scene with template plotly-classic: Plotly defaults, one wall filled.',
  tags: ['scene', '3d', 'themes', 'scatter3d'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(21));
  const n = 300;
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers',
        x: Array.from({ length: n }, () => normal()),
        y: Array.from({ length: n }, () => normal()),
        z: Array.from({ length: n }, () => normal()),
        marker: { size: 4 },
      },
    ],
    layout: {
      template: 'plotly-classic',
      title: { text: "Plotly's 3D look" },
      scene: { zaxis: { showbackground: true } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
