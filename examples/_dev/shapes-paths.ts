import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * SVG path shapes (E5.5): straight and curved commands (C, S, Q, T, A), relative forms, several
 * subpaths with `fillrule` even-odd vs nonzero, an open path (filled as if closed, like SVG), and a
 * log y axis where path coordinates are data values. Curves are flattened adaptively.
 */
export const meta: ExampleMeta = {
  title: 'Shapes: SVG paths',
  description:
    'Cubic, quadratic and arc path commands, relative forms, even-odd and nonzero fills, open paths and a path on a log axis.',
  tags: ['dev', 'chart', 'shapes'],
  size: { width: 760, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const blue = { color: '#5e74d5', width: 2 };
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x: [0],
        y: [0],
        xaxis: 'x',
        yaxis: 'y',
        marker: { size: 1, opacity: 0 },
      },
      {
        type: 'scatter',
        mode: 'markers',
        x: [0],
        y: [1],
        xaxis: 'x2',
        yaxis: 'y2',
        marker: { size: 1, opacity: 0 },
      },
    ],
    layout: {
      showlegend: false,
      xaxis: { domain: [0, 0.62], range: [0, 12] },
      yaxis: { range: [0, 8] },
      xaxis2: { domain: [0.7, 1], range: [0, 4], anchor: 'y2' },
      yaxis2: { type: 'log', range: [0, 3], dtick: 1, anchor: 'x2' },
      shapes: [
        // Cubic and smooth cubic, closed with a line back.
        {
          type: 'path',
          path: 'M 0.5 1 C 1 5, 3 5, 3.5 1 S 6 -3, 6 3 L 6 1 Z',
          fillcolor: 'rgba(94, 116, 213, 0.25)',
          line: blue,
          label: { text: 'C + S', textposition: 'top center' },
        },
        // Quadratic chain with T, relative forms.
        {
          type: 'path',
          path: 'm 7 2 q 1 3 2 0 t 2 0',
          line: { color: '#cc540a', width: 3 },
          label: { text: 'q + t (open)', textposition: 'bottom center', yanchor: 'top' },
        },
        // Arcs: a pie wedge and a half circle (radii in data units).
        {
          type: 'path',
          path: 'M 2 6 L 3.5 6 A 1.5 1.5 0 0 1 2 7.5 Z',
          fillcolor: '#118e36',
          line: { width: 0 },
        },
        {
          type: 'path',
          path: 'M 4.5 6 a 1 1 0 0 0 2 0 Z',
          fillcolor: 'rgba(153, 98, 192, 0.5)',
          line: { color: '#9962c0', width: 2 },
          label: { text: 'arcs', textposition: 'top right', yanchor: 'bottom' },
        },
        // Two nested squares: even-odd leaves a hole, nonzero (same winding) fills it.
        {
          type: 'path',
          path: 'M 7 4.5 H 9 V 7.5 H 7 Z M 7.5 5 H 8.5 V 7 H 7.5 Z',
          fillcolor: '#ea2a37',
          line: { width: 1 },
          label: { text: 'evenodd', textposition: 'bottom center', yanchor: 'top' },
        },
        {
          type: 'path',
          path: 'M 9.5 4.5 H 11.5 V 7.5 H 9.5 Z M 10 5 H 11 V 7 H 10 Z',
          fillrule: 'nonzero',
          fillcolor: '#ea2a37',
          line: { width: 1 },
          label: { text: 'nonzero', textposition: 'bottom center', yanchor: 'top' },
        },
        // A curve on a log axis: y values are data values (1–1000).
        {
          type: 'path',
          xref: 'x2',
          yref: 'y2',
          path: 'M 0.3 2 Q 2 2000 3.7 2',
          line: { color: '#128b8b', width: 3 },
          fillcolor: 'rgba(18, 139, 139, 0.25)',
          label: { text: 'log y', textposition: 'bottom center', yanchor: 'bottom' },
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
