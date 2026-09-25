import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic parallel categories (plan E10.11): three categorical dimensions of eight people. Each
 * dimension is a column of category bands sized by how many people fall in each category, and a
 * path joins the categories of every combination, as wide as its count. Hover a band or a path for
 * its count and probability; drag a band to reorder the categories, or a dimension label to
 * reorder the dimensions.
 */
export const meta: ExampleMeta = {
  title: 'Parallel categories: basic',
  description: 'Hair, eye color and sex of eight people as bands and the paths between them.',
  tags: ['parcats', 'statistical', 'domain', 'categorical', 'basic'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'parcats',
        dimensions: [
          {
            label: 'Hair',
            values: ['Black', 'Black', 'Black', 'Brown', 'Brown', 'Brown', 'Red', 'Brown'],
          },
          {
            label: 'Eye',
            values: ['Brown', 'Brown', 'Brown', 'Brown', 'Brown', 'Blue', 'Blue', 'Blue'],
          },
          {
            label: 'Sex',
            values: ['Female', 'Female', 'Female', 'Male', 'Female', 'Male', 'Male', 'Male'],
          },
        ],
      },
    ],
    layout: {
      title: { text: 'Hair, eyes and sex' },
      margin: { t: 48, l: 48, r: 48, b: 24 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
