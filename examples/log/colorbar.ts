import { componentsReady, createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A log colorbar (plan E11.11): air samples by temperature and humidity, colored by particle count,
 * which ranges from tens to millions per cubic meter. Colorscales are linear, so the markers are
 * colored by `log10(count)` and the colorbar is labeled with the counts themselves: `tickvals` at
 * the exponents 1–6 and `ticktext` 10, 100, 1k … 1M. The hover label shows the real count from
 * `customdata`.
 */
export const meta: ExampleMeta = {
  title: 'Log: log-scaled colorbar',
  description:
    'Markers colored by the log of a value spanning five decades, with a colorbar labeled 10 to 1M via tickvals and ticktext.',
  tags: ['log', 'colorbar', 'colorscale', 'scatter', 'markers'],
  size: { width: 680, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(606);
  const normal = gaussian(rng(607));
  const temperature: number[] = [];
  const humidity: number[] = [];
  const count: number[] = [];
  for (let i = 0; i < 400; i++) {
    const t = 5 + random() * 30;
    const h = 20 + random() * 75;
    // More particles when warm and humid, spread over five decades.
    const exponent = 1.2 + 3.8 * ((t - 5) / 30) * ((h - 20) / 75) + normal() * 0.45;
    temperature.push(Math.round(t * 10) / 10);
    humidity.push(Math.round(h));
    count.push(Math.round(10 ** Math.min(6, Math.max(1, exponent))));
  }

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x: temperature,
        y: humidity,
        customdata: count,
        marker: {
          size: 8,
          color: count.map(Math.log10),
          colorscale: 'Viridis',
          cmin: 1,
          cmax: 6,
          showscale: true,
          colorbar: {
            title: { text: 'Particles / m³' },
            tickvals: [1, 2, 3, 4, 5, 6],
            ticktext: ['10', '100', '1k', '10k', '100k', '1M'],
          },
        },
        hovertemplate: '%{x} °C, %{y} %<br>%{customdata:,} particles / m³<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Particle counts in air samples' },
      xaxis: { title: { text: 'Temperature (°C)' } },
      yaxis: { title: { text: 'Relative humidity (%)' } },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
