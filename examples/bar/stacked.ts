import { createChart, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Stacked bars on a date axis (plan E9.8, E9.9): `barmode: 'stack'` stacks traces per position in
 * trace order; bar widths are in ms (80% of the month spacing). Only the outermost bar of each
 * stack gets the corner radius, and white outlines separate the segments.
 */
export const meta: ExampleMeta = {
  title: 'Bar: stacked, date axis',
  description:
    'Three traces stacked per month on a date axis, with rounded stack ends and segment outlines.',
  tags: ['bar', 'chart', 'stack', 'barmode', 'date'],
};

const QUIET_MS = 500;

/**
 * `chart.ready` covers the first frame only; text (tick labels) typesets asynchronously and redraws
 * later. Resolve once frames have stopped for a while so visual tests capture the final frame.
 */
function settled(chart: Chart): Promise<void> {
  return chart.ready.then(
    () =>
      new Promise<void>((resolve) => {
        const done = (): void => {
          off();
          resolve();
        };
        let timer = setTimeout(done, QUIET_MS);
        const off = chart.on('afterrender', () => {
          clearTimeout(timer);
          timer = setTimeout(done, QUIET_MS);
        });
      }),
  );
}

export function run(el: HTMLElement): ExampleHandle {
  // Vendored Inter for axis labels: offline and deterministic (troika's default is a CDN font).
  useExampleFonts();
  const months = [
    '2024-01-01',
    '2024-02-01',
    '2024-03-01',
    '2024-04-01',
    '2024-05-01',
    '2024-06-01',
  ];
  const line = { width: 1, color: '#ffffff' };
  const chart = createChart(el, {
    data: [
      { type: 'bar', name: 'Hardware', x: months, y: [14, 16, 13, 18, 21, 19], marker: { line } },
      { type: 'bar', name: 'Software', x: months, y: [9, 11, 14, 12, 15, 18], marker: { line } },
      { type: 'bar', name: 'Services', x: months, y: [5, 4, 7, 9, 8, 11], marker: { line } },
    ],
    layout: {
      font: { family: 'Inter' },
      margin: { l: 48, r: 24, t: 24, b: 40 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#e5ecf6',
      barmode: 'stack',
      barcornerradius: 6,
    },
    config: { responsive: true },
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
