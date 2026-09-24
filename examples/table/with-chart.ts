import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A table next to a chart (plan E9.13, E4.5): the table is a domain trace placed by `domain`, the
 * bar chart's axes take the rest of the width with `xaxis.domain`. Both show the same numbers, the
 * table with exact values, the chart for comparison.
 */
export const meta: ExampleMeta = {
  title: 'Table: next to a chart',
  description:
    'A table of monthly signups in the left third and the same numbers as bars on the right.',
  tags: ['table', 'chart', 'bar', 'domain', 'layout'],
  size: { width: 800, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const signups = [1240, 1310, 1580, 1490, 1720, 1950, 2110, 2040, 2380, 2610];
  const growth = signups.map((v, i) => (i === 0 ? null : v / signups[i - 1]! - 1));

  const chart = createChart(el, {
    data: [
      {
        type: 'table',
        domain: { x: [0, 0.36], y: [0, 1] },
        header: { values: ['Month', 'Signups', 'MoM'], align: ['left', 'right', 'right'] },
        cells: {
          values: [months, signups, growth],
          format: ['', ',', '+.1%'],
          align: ['left', 'right', 'right'],
        },
      },
      { type: 'bar', name: 'Signups', x: months, y: signups, showlegend: false },
    ],
    layout: {
      title: { text: 'Signups, 2025' },
      xaxis: { domain: [0.44, 1] },
      yaxis: { anchor: 'x', title: { text: 'Signups' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
