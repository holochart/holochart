import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A heatmap on a date axis and a log axis (plan E11.1): daily cells (`x0` a date, `dx` one day in
 * ms) against frequency bands whose centers grow geometrically — on the log axis Plotly's cell
 * edges are geometric means, so the bands are evenly tall.
 */
export const meta: ExampleMeta = {
  title: 'Heatmap: date and log axes',
  description: 'Thirty days of a spectrum: daily columns on a date axis, frequency bands on log y.',
  tags: ['heatmap', 'scientific', 'date', 'log'],
  testTolerance: 0.004,
};

const DAY = 86_400_000;

export function run(el: HTMLElement): ExampleHandle {
  const days = 30;
  const freqs = Array.from({ length: 16 }, (_, j) => 10 * 2 ** (j / 2));
  const z = freqs.map((f, j) =>
    Array.from(
      { length: days },
      (_, d) => Math.exp(-((j - 7 - 4 * Math.sin(d / 5)) ** 2) / 6) * (1 + (d % 7 < 5 ? 0.4 : 0)),
    ),
  );
  const chart = createChart(el, {
    data: [
      {
        type: 'heatmap',
        x0: '2026-03-01',
        dx: DAY,
        y: freqs,
        z,
        colorbar: { title: { text: 'power' } },
        yhoverformat: '.0f',
      },
    ],
    layout: {
      title: { text: 'Daily spectrum' },
      xaxis: { type: 'date' },
      yaxis: { type: 'log', title: { text: 'frequency (Hz)' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
