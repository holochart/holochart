import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A 100,000-row table (plan E9.13): rows are virtualized, so only the rows on screen are laid out
 * and drawn; scrolling with the wheel, by dragging the rows, or with the scrollbar (shown while the
 * pointer is over the table) re-draws only the visible window. Cell values stay plain arrays: calc
 * keeps them by reference and formats a cell only when it scrolls into view.
 */
export const meta: ExampleMeta = {
  title: 'Table: 100k rows, virtualized',
  description:
    'A request log with 100,000 rows; only the visible rows are laid out and drawn, so it scrolls smoothly.',
  tags: ['table', 'chart', 'perf', 'virtualized', 'large-data'],
  testTolerance: 0.004,
};

const ROWS = 100_000;

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(97);
  const methods = ['GET', 'GET', 'GET', 'POST', 'PUT', 'DELETE'];
  const paths = ['/api/orders', '/api/users', '/api/search', '/api/cart', '/health', '/api/items'];
  const statuses = [200, 200, 200, 200, 201, 204, 304, 404, 500];
  const id = new Array<number>(ROWS);
  const time = new Array<string>(ROWS);
  const request = new Array<string>(ROWS);
  const status = new Array<number>(ROWS);
  const latency = new Float64Array(ROWS);
  const start = Date.UTC(2025, 5, 1, 8, 0, 0);
  let t = start;
  for (let i = 0; i < ROWS; i++) {
    t += Math.floor(random() * 900);
    id[i] = i + 1;
    time[i] = new Date(t).toISOString().slice(11, 23);
    request[i] =
      `${methods[Math.floor(random() * methods.length)]!} ` +
      paths[Math.floor(random() * paths.length)]!;
    status[i] = statuses[Math.floor(random() * statuses.length)]!;
    latency[i] = 2 + 400 * random() ** 3;
  }

  const chart = createChart(el, {
    data: [
      {
        type: 'table',
        columnwidth: [0.8, 1.2, 2, 0.7, 1],
        header: {
          values: ['#', 'Time (UTC)', 'Request', 'Status', 'Latency'],
          align: ['right', 'left', 'left', 'right', 'right'],
        },
        cells: {
          values: [id, time, request, status, latency],
          format: [',', '', '', '', ',.1f'],
          suffix: ['', '', '', '', ' ms'],
          align: ['right', 'left', 'left', 'right', 'right'],
        },
      },
    ],
    layout: { title: { text: `Request log: ${ROWS.toLocaleString('en-US')} rows` } },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
