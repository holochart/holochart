import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * An area with thickness (plan E8.9): `depth` turns a scatter trace's fill (`fill: 'tozeroy'`)
 * into a slab 40 px thick, lit by Plotly's lighting model, in a tilted and turned view
 * (`layout.view3d`). The line and markers are drawn on the slab's front face.
 */
export const meta: ExampleMeta = {
  title: 'Area: with depth (2.5D view)',
  description:
    'A filled area extruded into a 40 px slab, line and markers on its front face, in a tilted view.',
  tags: ['area', 'fill', 'scatter', 'depth', '2.5d', 'view3d', '3d-native', 'holochart-extension'],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 13 }, (_, i) => i);
  const y = x.map((i) => Math.round(40 + 25 * Math.sin(i / 2) + 2 * i));
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        x,
        y,
        mode: 'lines+markers',
        fill: 'tozeroy',
        fillcolor: 'rgba(64, 145, 108, 0.85)',
        line: { color: '#d8f3dc', width: 2 },
        marker: { size: 7, color: '#d8f3dc' },
        depth: 40,
      },
    ],
    layout: {
      title: { text: 'Monthly volume' },
      showlegend: false,
      yaxis: { rangemode: 'tozero' },
      view3d: { enabled: true, tilt: 22, rotation: -28 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
