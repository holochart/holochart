import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic table (plan E9.13): `header.values` names the columns and `cells.values` holds the data
 * column by column (`values[column][row]`). With the default look the header is raised above
 * background-colored cells; numbers are shown as given, text with spaces wraps to the column width
 * and grows its row, as in Plotly.
 */
export const meta: ExampleMeta = {
  title: 'Table: basic',
  description: 'A header and four columns of cells: text, integers and decimals, one wrapped note.',
  tags: ['table', 'chart', 'basic', 'domain'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'table',
        header: { values: ['Region', 'Stores', 'Revenue (M)', 'Note'] },
        cells: {
          values: [
            ['North', 'South', 'East', 'West', 'Central'],
            [42, 37, 51, 29, 18],
            [12.4, 9.8, 15.1, 7.2, 4.9],
            [
              'Two openings',
              'Flat year',
              'Record quarter after the new flagship store opened',
              'Refit',
              'New',
            ],
          ],
        },
      },
    ],
    layout: { title: { text: 'Stores by region, 2025' } },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
