import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A tilted scatter and line chart (plan E8.9): `layout.view3d` shows the plot area as a plane in
 * perspective. Axes, grid lines, tick labels and titles lie in that plane; the markers keep their
 * size in px. Hover still finds points: the pointer is mapped onto the plane (the label here is
 * shown with `chart.hover`, anchored where the tilted point is drawn).
 */
export const meta: ExampleMeta = {
  title: '2.5D view: tilted scatter and line',
  description:
    'A scatter and a line chart on a tilted, perspective plot plane, with a hover label.',
  tags: ['view3d', '2.5d', 'scatter', 'line', 'hover', '3d-native', 'holochart-extension'],
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(7);
  const x = Array.from({ length: 40 }, (_, i) => i);
  const trend = x.map((i) => 20 + i * 0.8 + 6 * Math.sin(i / 4));
  const samples = trend.map((v) => v + (random() - 0.5) * 12);
  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'markers', name: 'samples', x, y: samples },
      { type: 'scatter', mode: 'lines', name: 'trend', x, y: trend, line: { width: 3 } },
    ],
    layout: {
      title: { text: 'Samples and trend' },
      xaxis: { title: { text: 'Day' } },
      yaxis: { title: { text: 'Load' } },
      view3d: { enabled: true, tilt: 35, rotation: -15, perspective: 0.6 },
    },
  });
  const ready = chart.ready.then(() => chart.hover([{ curveNumber: 1, pointNumber: 24 }]));
  return {
    ready: ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
