import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Extruded bars in the 2.5D view (plan E9.10, E8.9): `depth` gives each bar a thickness toward the
 * viewer (here 60 % of the bar width), `bevel` rounds its front edges, and `layout.view3d` shows
 * the plot area tilted and turned, the axes, grid and tick labels with it. Plotly's lighting model
 * (the default `material`) shades the tops and sides.
 */
export const meta: ExampleMeta = {
  title: 'Bar: 3D bars (depth, 2.5D view)',
  description: 'Bars extruded toward the viewer with rounded edges, in a tilted and turned view.',
  tags: ['bar', 'chart', 'depth', '2.5d', 'view3d', '3d-native', 'holochart-extension'],
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        y: [12, 18, 7, -5, 21, 15, 9],
        depth: '60%',
        bevel: { size: 4 },
      },
    ],
    layout: {
      title: { text: 'Daily balance' },
      view3d: { enabled: true, tilt: 20, rotation: -25 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
