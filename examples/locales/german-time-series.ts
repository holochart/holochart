import { componentsReady, createChart, register } from '@mk7s/holochart';
import { de } from '@mk7s/holochart-locales';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A German locale (plan E17.6): `config.locale: 'de'` after registering plotly.js's German locale
 * module from `@mk7s/holochart-locales`. Month names on the date axis (`Mär`, `Okt`, `Dez`), the
 * decimal comma on the y axis and in the hover label, the German weekday and month names of
 * `%A` / `%B` in the hover template, and the modebar's button titles all follow the locale.
 */
export const meta: ExampleMeta = {
  title: 'Locales: German time series',
  description:
    'A daily exchange rate with config.locale "de": German month names on the date axis and a decimal comma in tick and hover labels.',
  tags: ['locales', 'time-series', 'date', 'line', 'config'],
  testTolerance: 0.004,
};

const DAY = 86_400_000;

export function run(el: HTMLElement): ExampleHandle {
  register(de);
  const normal = gaussian(rng(1706));
  const start = Date.UTC(2024, 0, 1);
  const x: number[] = [];
  const y: number[] = [];
  let rate = 1.095;
  for (let i = 0; i < 366; i++) {
    rate += normal() * 0.0035 + 0.00012 * Math.sin(i / 40);
    rate += (1.085 - rate) * 0.02;
    x.push(start + i * DAY);
    y.push(Math.round(rate * 10_000) / 10_000);
  }
  // 30-day moving average.
  const avg = y.map((_, i) => {
    const from = Math.max(0, i - 29);
    const window = y.slice(from, i + 1);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Tageskurs',
        x,
        y,
        line: { width: 1.2 },
        hovertemplate: '%{x|%A, %-d. %B %Y}<br>%{y:.4f} USD<extra></extra>',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: '30-Tage-Durchschnitt',
        x,
        y: avg,
        line: { width: 2.5 },
        hovertemplate: '%{y:.4f} USD<extra>Durchschnitt</extra>',
      },
    ],
    layout: {
      title: { text: 'Wechselkurs EUR/USD 2024' },
      xaxis: { type: 'date' },
      yaxis: { title: { text: 'USD je Euro' } },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
    },
    config: { locale: 'de' },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
