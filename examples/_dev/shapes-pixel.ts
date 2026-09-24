import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Pixel-sized shapes (E5.5): `xsizemode` / `ysizemode: 'pixel'` shapes keep their px size at any
 * zoom, anchored to data points (`xanchor` / `yanchor`): callout boxes, fixed-size circles around
 * points and a px-sized path; mixed with a data-sized band. Also label positions on a box.
 */
export const meta: ExampleMeta = {
  title: 'Shapes: pixel size mode and label positions',
  description:
    'Callouts and rings that keep their pixel size, anchored to data points, next to label positions on a box.',
  tags: ['dev', 'chart', 'shapes'],
  size: { width: 720, height: 420 },
  testTolerance: 0.004,
};

const POSITIONS = [
  'top left',
  'top center',
  'top right',
  'middle left',
  'middle center',
  'middle right',
  'bottom left',
  'bottom center',
  'bottom right',
] as const;

export function run(el: HTMLElement): ExampleHandle {
  const pts = [
    [1, 20],
    [3, 60],
    [5, 35],
  ] as const;
  const ring = ([x, y]: readonly [number, number]) => ({
    type: 'circle',
    xsizemode: 'pixel',
    ysizemode: 'pixel',
    xanchor: x,
    yanchor: y,
    x0: -12,
    x1: 12,
    y0: -12,
    y1: 12,
    line: { color: '#ff9e00', width: 2 },
  });
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x: pts.map((p) => p[0]),
        y: pts.map((p) => p[1]),
        marker: { size: 8 },
      },
    ],
    layout: {
      showlegend: false,
      xaxis: { range: [0, 12] },
      yaxis: { range: [0, 100] },
      shapes: [
        ...pts.map(ring),
        // A callout: 70 px wide box 20 px above the point, with its label.
        {
          type: 'rect',
          xsizemode: 'pixel',
          ysizemode: 'pixel',
          xanchor: 3,
          yanchor: 60,
          x0: -35,
          x1: 35,
          y0: 20,
          y1: 44,
          fillcolor: '#5e74d5',
          line: { width: 0 },
          label: { text: 'peak', font: { color: '#ffffff' } },
        },
        // A px-sized triangle path pointing at a point.
        {
          type: 'path',
          xsizemode: 'pixel',
          ysizemode: 'pixel',
          xanchor: 5,
          yanchor: 35,
          path: 'M 0 -14 L -8 -30 L 8 -30 Z',
          fillcolor: '#118e36',
          line: { width: 0 },
        },
        // Mixed: data-sized in x, pixel-sized in y (a 16 px strip at y = 85).
        {
          type: 'rect',
          x0: 0.5,
          x1: 5.5,
          ysizemode: 'pixel',
          yanchor: 85,
          y0: -8,
          y1: 8,
          fillcolor: 'rgba(204, 84, 10, 0.5)',
          line: { width: 0 },
          label: { text: '16 px tall', textposition: 'middle right' },
        },
        // Label positions on one box.
        {
          type: 'rect',
          x0: 6.5,
          x1: 11.5,
          y0: 10,
          y1: 75,
          fillcolor: 'rgba(153, 98, 192, 0.18)',
          line: { color: '#9962c0', width: 1 },
        },
        ...POSITIONS.map((p) => ({
          type: 'rect',
          x0: 6.5,
          x1: 11.5,
          y0: 10,
          y1: 75,
          line: { width: 0 },
          label: { text: p, textposition: p },
        })),
      ],
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
