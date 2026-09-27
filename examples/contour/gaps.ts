import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { bumps } from './basic.ts';

/**
 * Gaps in the data (plan E11.2): `null` values in `z` (a missing block and a few missing points)
 * are filled from their neighbours for contouring, as in Plotly, and with `connectgaps: false`
 * (the default for a 2D `z`) the drawing is clipped to the data, leaving holes that reach 90% of
 * the way to the nearest data. Labels follow the clipped lines.
 */
export const meta: ExampleMeta = {
  title: 'Contour: gaps',
  description: 'Missing values leave holes in filled, labelled contours (connectgaps: false).',
  tags: ['contour', 'scientific', 'gaps'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { x, y, z } = bumps(31, 21);
  const holey: (number | null)[][] = z.map((row) => row.slice());
  for (let j = 6; j < 10; j++) for (let i = 18; i < 24; i++) holey[j]![i] = null;
  for (const [i, j] of [
    [5, 15],
    [9, 4],
    [26, 16],
  ] as const) {
    holey[j]![i] = null;
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'contour',
        x,
        y,
        z: holey,
        ncontours: 12,
        contours: { showlabels: true, labelfont: { size: 8, color: '#0a0a0f' } },
        line: { color: 'rgba(10, 10, 15, 0.6)' },
        colorbar: { title: { text: 'height' } },
      },
    ],
    layout: { title: { text: 'Missing data left as holes' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
