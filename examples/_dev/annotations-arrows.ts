import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Arrow styles (E5.4): every `arrowhead` (0–8) in a row, then sizes and widths, start arrowheads
 * (`arrowside: 'end+start'`), `standoff` / `startstandoff` gaps around marker points, and colors.
 */
export const meta: ExampleMeta = {
  title: 'Annotations: arrowheads, sizes, standoff',
  description:
    'Arrowheads 0–8, arrowsize and arrowwidth, double-ended arrows and standoffs that stop short of the markers.',
  tags: ['dev', 'chart', 'annotations'],
  size: { width: 760, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const heads = Array.from({ length: 9 }, (_, i) => ({
    x: i,
    y: 3,
    text: String(i),
    arrowhead: i,
    ax: 0,
    ay: -45,
  }));
  const sizes = [0.6, 1, 1.5, 2].map((s, i) => ({
    x: i * 2 + 0.5,
    y: 1.6,
    text: `size ${s}`,
    arrowsize: s,
    arrowwidth: 1 + i,
    arrowhead: 2,
    arrowcolor: ['#5e74d5', '#118e36', '#ff9e00', '#9962c0'][i],
    ax: 30,
    ay: -35,
  }));

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x: [1, 7],
        y: [0.4, 0.4],
        marker: { size: 16 },
      },
    ],
    layout: {
      showlegend: false,
      xaxis: { range: [-0.7, 8.7], showgrid: false },
      yaxis: { range: [0, 3.9], showgrid: false, showticklabels: false },
      annotations: [
        ...heads,
        ...sizes,
        {
          x: 7,
          y: 0.4,
          axref: 'x',
          ayref: 'y',
          ax: 1,
          ay: 0.4,
          text: '',
          arrowside: 'end+start',
          arrowhead: 3,
          startarrowhead: 6,
          arrowwidth: 1.5,
          standoff: 10,
          startstandoff: 10,
          arrowcolor: '#eceef4',
        },
        {
          x: 4,
          y: 0.4,
          text: 'standoff 10 px on both ends',
          showarrow: false,
          yshift: 12,
        },
      ],
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
