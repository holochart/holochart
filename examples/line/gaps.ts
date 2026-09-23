import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Gaps (plan E9.2): a sensor series with missing readings (`null` and `NaN`). By default the line
 * breaks at every missing value; `connectgaps: true` draws straight across instead. Markers show
 * which readings exist.
 */
export const meta: ExampleMeta = {
  title: 'Line: gaps and connectgaps',
  description:
    'Missing values (null, NaN) break a line by default; connectgaps: true bridges them.',
  tags: ['line', 'scatter', 'gaps', 'connectgaps'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(13));
  const x = Array.from({ length: 48 }, (_, i) => i * 0.5);
  const reading = x.map((h) => 18 + 4 * Math.sin((h - 8) / 3.8) + normal() * 0.3);
  // Two outages (null) and one bad sample (NaN).
  const missing = (i: number): boolean => (i >= 10 && i <= 14) || (i >= 30 && i <= 32) || i === 40;
  const y = reading.map((v, i) => (missing(i) ? (i === 40 ? NaN : null) : v));

  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'default: gaps break the line',
        x,
        y,
        marker: { size: 5 },
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'connectgaps: true',
        x,
        y: y.map((v) => (v === null ? null : v + 8)),
        connectgaps: true,
        marker: { size: 5 },
      },
    ],
    layout: {
      font: { family: 'Inter', size: 12 },
      xaxis: { title: { text: 'Hour' } },
      yaxis: { title: { text: 'Temperature (°C)' } },
      legend: { orientation: 'h', y: 1.12 },
      margin: { l: 56, r: 24, t: 40, b: 48 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
