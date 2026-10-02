import { createChart, type BarTrace, type ScatterTrace } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Two legends, one per row (plan E5.2): daily temperatures of three cities on top, their rainfall
 * below. Each trace names its legend with the `legend` attribute — `'legend'` (the default) for
 * the temperature lines, `'legend2'` for the rainfall bars — and `layout.legend2` is a second,
 * complete legend with its own position, title, border and item order.
 *
 * Both legends are vertical columns beside the plot, each aligned with the top of its row (`y` in
 * paper units, `yanchor: 'top'`), and each pushes the right margin. Clicking an item toggles its
 * trace; double-clicking isolates it among its own legend's items, leaving the other legend alone.
 * The rainfall legend lists the cities in reverse (`traceorder: 'reversed'`), so they read in the
 * order the bars stack.
 */
export const meta: ExampleMeta = {
  title: 'Legend: two legends, one per row',
  description:
    'Temperature lines and stacked rainfall bars on two rows, each row with its own vertical legend (legend and legend2) beside it.',
  tags: ['legend', 'subplots', 'line', 'bar'],
  size: { width: 760, height: 460 },
  testTolerance: 0.004,
};

const CITIES = [
  { name: 'Lisbon', temp: 17, swing: 6, rain: 2.2, color: '#e8a33d' },
  { name: 'Oslo', temp: 7, swing: 9, rain: 2.4, color: '#5e74d5' },
  { name: 'Cairo', temp: 23, swing: 7, rain: 0.1, color: '#d85c5c' },
];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(28));
  const random = rng(29);
  const days = Array.from({ length: 12 }, (_, m) => `2025-${String(m + 1).padStart(2, '0')}-15`);

  const temps = CITIES.map((c): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines+markers',
    name: c.name,
    x: days,
    y: days.map(
      (_, m) =>
        +(c.temp - c.swing * Math.cos(((m - 0.5) / 12) * 2 * Math.PI) + normal() * 0.8).toFixed(1),
    ),
    line: { color: c.color, width: 2 },
    marker: { color: c.color, size: 5 },
  }));
  const rain = CITIES.map((c): BarTrace => ({
    type: 'bar',
    name: c.name,
    legend: 'legend2',
    x: days,
    y: days.map((_, m) =>
      Math.round(
        c.rain * 30 * (1 + 0.6 * Math.cos((m / 12) * 2 * Math.PI)) * (0.6 + 0.8 * random()),
      ),
    ),
    xaxis: 'x2',
    yaxis: 'y2',
    marker: { color: c.color, opacity: 0.85 },
  }));

  const chart = createChart(el, {
    data: [...temps, ...rain],
    layout: {
      title: { text: 'Three cities through 2025' },
      barmode: 'stack',
      xaxis: { anchor: 'y', showticklabels: false },
      yaxis: { domain: [0.55, 1], title: { text: '°C' } },
      xaxis2: { anchor: 'y2', matches: 'x', dtick: 'M2', tickformat: '%b' },
      yaxis2: { domain: [0, 0.45], title: { text: 'mm' } },
      legend: {
        orientation: 'v',
        x: 1.02,
        xanchor: 'left',
        y: 1,
        yanchor: 'top',
        title: { text: 'Temperature' },
      },
      legend2: {
        x: 1.02,
        xanchor: 'left',
        y: 0.45,
        yanchor: 'top',
        title: { text: 'Rainfall' },
        traceorder: 'reversed',
        bordercolor: '#3a3d4a',
        borderwidth: 1,
      },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
