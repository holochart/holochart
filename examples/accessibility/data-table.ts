import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Visible data table (plan E17.3): `config.a11y.dataTable: 'visible'` shows each trace's data as
 * a table below the chart, styled like it (font, colors, grid color for the rules). A year of
 * daily values is 366 rows: the table scrolls, rendering only the rows in view (virtualized), and
 * the header stays put.
 */
export const meta: ExampleMeta = {
  title: 'Accessibility: visible data table',
  description:
    "A year of daily visits as a line, with config.a11y.dataTable: 'visible' showing every value in a scrolling, virtualized table below the chart.",
  tags: ['a11y', 'data table', 'line', 'config'],
  size: { width: 640, height: 700 },
  // The table is DOM text, rasterized by the OS: Linux CI draws it with other fonts than the macOS
  // baseline (0.92% of pixels; the window rule skips DOM text, the whole-image fraction doesn't).
  testTolerance: 0.015,
};

export function run(el: HTMLElement): ExampleHandle {
  const box = document.createElement('div');
  box.style.height = '320px';
  el.appendChild(box);
  const random = gaussian(rng(17));
  const start = Date.UTC(2024, 0, 1);
  const x = Array.from({ length: 366 }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10),
  );
  let level = 1200;
  const y = x.map((_, i) => {
    level += random() * 25 + 1.5;
    return Math.round(level + 180 * Math.sin((i / 7) * 2 * Math.PI));
  });
  const chart = createChart(box, {
    data: [{ type: 'scatter', mode: 'lines', name: 'Visits', x, y }],
    layout: {
      title: { text: 'Daily visits, 2024' },
      xaxis: { title: { text: 'Day' } },
      yaxis: { title: { text: 'Visits' } },
    },
    config: { a11y: { dataTable: 'visible' } },
  });
  return {
    ready: chart.ready.then(() => chart.describe()).then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      box.remove();
    },
  };
}
