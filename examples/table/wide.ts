import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A wide table (plan E9.13): `columnwidth` gives the columns relative widths (the table always
 * fills its domain; there is no horizontal scrolling, as in Plotly), a two-row header (each header
 * entry is an array: one value per header row), and a description column whose text wraps to the
 * column width and grows its rows. Text that doesn't fit a column and can't wrap is clipped at the
 * column edge.
 */
export const meta: ExampleMeta = {
  title: 'Table: wide, with column widths',
  description:
    'Nine columns sized with columnwidth, a two-row header, wrapped descriptions and clipped overflow.',
  tags: ['table', 'chart', 'columnwidth', 'wrap', 'domain'],
  size: { width: 800, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'table',
        columnwidth: [0.6, 1.2, 3.4, 0.9, 0.9, 0.9, 0.9, 0.9, 1.1],
        header: {
          values: [
            ['#', ''],
            ['Service', ''],
            ['Description', ''],
            ['Latency', 'p50'],
            ['', 'p95'],
            ['', 'p99'],
            ['Errors', '5xx'],
            ['', '4xx'],
            ['Owner', ''],
          ],
          align: ['right', 'left', 'left', 'right'],
        },
        cells: {
          values: [
            [1, 2, 3, 4, 5, 6],
            ['gateway', 'auth', 'search-indexer-backfill', 'billing', 'media', 'notify'],
            [
              'Terminates TLS and routes requests to the internal services',
              'Sessions, tokens and single sign-on',
              'Rebuilds the search index from the event log when the schema changes',
              'Invoices, payments and refunds',
              'Image and video transcoding with a GPU worker pool',
              'Email and push notifications',
            ],
            [12, 8, 140, 22, 310, 15],
            [48, 31, 620, 95, 1400, 60],
            [120, 70, 1900, 240, 3100, 150],
            [0.0012, 0.0004, 0.021, 0.0009, 0.0061, 0.0002],
            [0.031, 0.12, 0.004, 0.018, 0.009, 0.002],
            ['platform', 'identity', 'discovery', 'payments', 'media', 'growth'],
          ],
          format: ['', '', '', 'd', 'd', 'd', '.2%', '.1%', ''],
          suffix: ['', '', '', ' ms', ' ms', ' ms', '', '', ''],
          align: ['right', 'left', 'left', 'right'],
        },
      },
    ],
    layout: { title: { text: 'Service health' } },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
