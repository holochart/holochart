import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { bumps } from './basic.ts';

/**
 * Interval constraints (plan E11.2): `operation: '[]'` shades where `value[0] ≤ z ≤ value[1]`
 * (a band between two levels, with both boundaries drawn and labelled), and `operation: '='` draws
 * a single level as a line, here dashed over a light `coloring: 'lines'` contour of the same
 * field.
 */
export const meta: ExampleMeta = {
  title: 'Contour: interval and equality constraints',
  description: 'A shaded band between two levels and a dashed single-level line over level lines.',
  tags: ['contour', 'scientific', 'constraint'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { x, y, z } = bumps(61, 41);
  const chart = createChart(el, {
    data: [
      {
        type: 'contour',
        x,
        y,
        z,
        contours: { coloring: 'lines', size: 0.25, start: -1.25, end: 2.75 },
        line: { width: 0.75 },
        showscale: false,
        name: 'levels',
      },
      {
        type: 'contour',
        x,
        y,
        z,
        name: '0.5 ≤ z ≤ 1.5',
        contours: {
          type: 'constraint',
          operation: '[]',
          value: [0.5, 1.5],
          showlabels: true,
          labelfont: { size: 9 },
        },
        fillcolor: 'rgba(124, 255, 178, 0.25)',
        line: { color: '#7cffb2', width: 1.5 },
      },
      {
        type: 'contour',
        x,
        y,
        z,
        name: 'z = −0.5',
        contours: { type: 'constraint', operation: '=', value: -0.5 },
        line: { color: '#ffd166', dash: 'dot', width: 2 },
      },
    ],
    layout: { title: { text: 'A band between two levels' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
