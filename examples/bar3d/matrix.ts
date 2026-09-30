import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A matrix of values as 3D columns (plan E14.9, a Holochart extension): revenue of five
 * products (categorical x) in four regions (categorical y), one `bar3d` trace per region so each
 * row takes a colorway color and a legend entry. Bars fill 0.8 of each category cell by default
 * (`width`, `depth`), and their edges are drawn in the faces (`marker.line`, thin and dark in the
 * default template). Hover a column for its product, region and value.
 */
export const meta: ExampleMeta = {
  title: 'Bar3D: a matrix of values',
  description: 'Revenue by product and region as 3D columns on categorical axes, a trace per row.',
  tags: ['bar3d', '3d', 'bar', 'categorical', 'holochart-extension'],
  testTolerance: 0.004,
};

const PRODUCTS = ['Atlas', 'Beacon', 'Cirrus', 'Delta', 'Echo'];
const REGIONS = ['North', 'South', 'East', 'West'];
const REVENUE = [
  [42, 31, 18, 27, 12],
  [35, 44, 22, 19, 16],
  [28, 26, 39, 33, 21],
  [19, 23, 30, 41, 36],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: REGIONS.map((region, r) => ({
      type: 'bar3d',
      name: region,
      x: PRODUCTS,
      y: PRODUCTS.map(() => region),
      z: REVENUE[r]!,
    })),
    layout: {
      title: { text: 'Revenue by product and region (k$)' },
      scene: {
        camera: { eye: { x: 1.55, y: -1.45, z: 0.95 } },
        zaxis: { title: { text: 'revenue' } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
