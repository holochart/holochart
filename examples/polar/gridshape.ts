import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Polygon grid (plan E11.4): `polar.gridshape: 'linear'` draws the radial grid and the outline
 * as polygons through the category angles — the classic radar look. The radial axis snaps to the
 * nearest vertex (`radialaxis.angle: 20` → the vertex at 0°… here 72°, the second category).
 */
export const meta: ExampleMeta = {
  title: 'Polar: polygon grid',
  description: 'A radar chart on a pentagon grid (gridshape linear) with a clockwise axis.',
  tags: ['polar', 'scatterpolar', 'radar', 'gridshape', 'fill'],
  testTolerance: 0.004,
};

const AXES = ['Quality', 'Price', 'Support', 'Speed', 'Design'];

export function run(el: HTMLElement): ExampleHandle {
  const close = <T>(a: readonly T[]): T[] => [...a, a[0]!];
  const chart = createChart(el, {
    data: [
      {
        type: 'scatterpolar',
        r: close([8, 6, 9, 5, 7]),
        theta: close(AXES),
        fill: 'toself',
        name: 'Product A',
      },
      {
        type: 'scatterpolar',
        r: close([5, 9, 4, 8, 6]),
        theta: close(AXES),
        fill: 'toself',
        name: 'Product B',
      },
    ],
    layout: {
      title: { text: 'Polygon grid' },
      polar: {
        gridshape: 'linear',
        radialaxis: { range: [0, 10], angle: 60, dtick: 2 },
        angularaxis: { direction: 'clockwise' },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
