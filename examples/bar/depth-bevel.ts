import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Extruded bars in the flat view (plan E9.10): with `depth` but no `layout.view3d`, bars are seen
 * straight on — their front faces show their color exactly, and a large `bevel` shades the rounded
 * edges, like buttons. The same trace without a bevel (right) looks flat but still lit.
 */
export const meta: ExampleMeta = {
  title: 'Bar: bevelled bars in the flat view',
  description: 'Extruded bars seen straight on: bevels shade the rounded edges of each bar.',
  tags: ['bar', 'chart', 'depth', 'bevel', '3d-native', 'holochart-extension'],
};

export function run(el: HTMLElement): ExampleHandle {
  const x = ['A', 'B', 'C', 'D', 'E'];
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: 'bevel 10 px',
        x,
        y: [5, 8, 6, 9, 7],
        depth: 12,
        bevel: { size: 10, segments: 6 },
      },
      {
        type: 'bar',
        name: 'no bevel',
        x,
        y: [4, 6, 7, 5, 8],
        depth: 12,
      },
    ],
    layout: { title: { text: 'Bevels, seen straight on' }, bargap: 0.3 },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
