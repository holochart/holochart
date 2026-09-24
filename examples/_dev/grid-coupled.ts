import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A 2×2 `layout.grid` with `pattern: 'coupled'` (plan E4.4): one x axis per column (`x`, `x2`) and
 * one y axis per row (`y` on top, `y2` below, `roworder: 'top to bottom'`). The four traces only
 * name their axes; the grid gives those axes their `domain` and `anchor` defaults, so no axis
 * domain is written by hand. Each column shares its x axis and each row its y axis, like a small
 * scatter matrix: x ticks show only under the bottom row (`xside: 'bottom plot'`) and y ticks only
 * left of the first column (`yside: 'left plot'`).
 */
export const meta: ExampleMeta = {
  title: 'Grid: coupled 2×2',
  description:
    'layout.grid with pattern coupled: x and x2 per column, y and y2 per row, placed without any axis domains.',
  tags: ['dev', 'grid', 'subplots', 'layout', 'scatter'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  // 60 seeded days: temperature and humidity drive ice cream and umbrella sales.
  const random = rng(42);
  const normal = gaussian(random);
  const n = 60;
  const temp: number[] = [];
  const humidity: number[] = [];
  const iceCream: number[] = [];
  const umbrellas: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = 12 + random() * 18;
    const h = 35 + random() * 60;
    temp.push(Math.round(t * 10) / 10);
    humidity.push(Math.round(h));
    iceCream.push(Math.round(20 + t * 6 + normal() * 12));
    umbrellas.push(Math.max(0, Math.round((h - 40) * 0.9 + normal() * 6)));
  }

  const marker = { size: 6, opacity: 0.8 };
  useExampleFonts();
  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'markers', x: temp, y: iceCream, marker },
      { type: 'scatter', mode: 'markers', x: humidity, y: iceCream, xaxis: 'x2', marker },
      { type: 'scatter', mode: 'markers', x: temp, y: umbrellas, yaxis: 'y2', marker },
      {
        type: 'scatter',
        mode: 'markers',
        x: humidity,
        y: umbrellas,
        xaxis: 'x2',
        yaxis: 'y2',
        marker,
      },
    ],
    layout: {
      font: { family: 'Inter', size: 12 },
      grid: { rows: 2, columns: 2, pattern: 'coupled' },
      xaxis: { title: { text: 'Temperature (°C)' } },
      xaxis2: { title: { text: 'Humidity (%)' } },
      yaxis: { title: { text: 'Ice creams' } },
      yaxis2: { title: { text: 'Umbrellas' } },
      showlegend: false,
      margin: { l: 64, r: 24, t: 24, b: 56 },
      plot_bgcolor: '#e5ecf6',
    },
    config: { responsive: true },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
