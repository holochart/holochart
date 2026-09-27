import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { bumps } from './basic.ts';

/**
 * Labelled contour lines (plan E11.2): `contours.coloring: 'lines'` colors each level's line from
 * the colorscale and fills nothing; `showlabels` writes the levels along the lines
 * (`labelformat`), placed by Plotly's label optimizer (horizontal where it can, away from the
 * edges and from each other) with the lines cut under them. Explicit levels every 0.25.
 */
export const meta: ExampleMeta = {
  title: 'Contour: lines with labels',
  description: 'Contour lines colored by level, with level labels along them at explicit levels.',
  tags: ['contour', 'scientific', 'labels'],
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
        contours: {
          coloring: 'lines',
          start: -1.25,
          end: 2.75,
          size: 0.25,
          showlabels: true,
          labelformat: '.2f',
          labelfont: { size: 9 },
        },
        line: { width: 1.5 },
        colorbar: { title: { text: 'height' } },
      },
    ],
    layout: { title: { text: 'Level lines with labels' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
