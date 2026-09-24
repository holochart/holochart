import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Styled table (plan E9.13): every style attribute takes one value, one per column, or — nested —
 * one per column and row, picked like Plotly's `gridPick` (short arrays repeat their last entry).
 * Here: d3 `format`s with a `prefix` / `suffix` per column, right-aligned numbers, alternating row
 * fills, a highlighted column, and a font color per cell for the change column (red falls, green
 * gains). Header text is bold via `font.weight`.
 */
export const meta: ExampleMeta = {
  title: 'Table: styled columns and rows',
  description:
    'Per-column formats, prefixes and suffixes, alignment, alternating row fills, a highlighted column and per-cell font colors.',
  tags: ['table', 'chart', 'format', 'style', 'domain'],
  testTolerance: 0.004,
};

const RED = '#ea2a37';
const GREEN = '#118e36';

export function run(el: HTMLElement): ExampleHandle {
  const tickers = ['ACME', 'GLOBEX', 'INITECH', 'UMBRELLA', 'HOOLI', 'STARK', 'WAYNE', 'TYRELL'];
  const price = [182.44, 57.1, 12.87, 403.2, 96.55, 1210.0, 244.18, 33.9];
  const change = [0.0132, -0.0241, 0.0018, -0.0077, 0.0456, 0.0105, -0.0311, 0.0002];
  const volume = [18.2e6, 4.51e6, 920e3, 2.2e6, 31.7e6, 1.08e6, 7.3e6, 640e3];
  const cap = [312.4, 18.6, 1.2, 95.7, 402.9, 210.0, 77.3, 3.4];
  const rows = tickers.length;
  // Alternating row fills, and a faint colorway blue on the price column.
  const zebra = Array.from({ length: rows }, (_, i) => (i % 2 ? '#12121a' : '#0a0a0f'));
  const highlight = Array.from({ length: rows }, (_, i) =>
    i % 2 ? 'rgba(94,116,213,0.22)' : 'rgba(94,116,213,0.14)',
  );

  const chart = createChart(el, {
    data: [
      {
        type: 'table',
        columnwidth: [1.3, 1, 1, 1.2, 1],
        header: {
          values: ['Ticker', 'Price', 'Change', 'Volume', 'Market cap'],
          align: ['left', 'right'],
          font: { weight: 'bold' },
        },
        cells: {
          values: [tickers, price, change, volume, cap],
          format: ['', ',.2f', '+.2%', '.3s', ',.1f'],
          prefix: ['', '$', '', '', '$'],
          suffix: ['', '', '', '', ' B'],
          align: ['left', 'right'],
          fill: { color: [zebra, highlight, zebra] },
          font: {
            color: ['#eceef4', '#a4a7b5', change.map((c) => (c < 0 ? RED : GREEN)), '#a4a7b5'],
          },
        },
      },
    ],
    layout: { title: { text: 'Watchlist' } },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
