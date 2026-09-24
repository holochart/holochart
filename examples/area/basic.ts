import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic area chart (plan E9.4): a year of daily values on a date axis, filled down to y = 0 with
 * `fill: 'tozeroy'`. Without `fillcolor`, the fill takes the line color at half opacity.
 */
export const meta: ExampleMeta = {
  title: 'Area: basic time series',
  description: "A year of daily solar output as a line filled down to zero with fill: 'tozeroy'.",
  tags: ['area', 'fill', 'scatter', 'date', 'time-series'],
  testTolerance: 0.004,
};

const DAY = 86_400_000;

export function run(el: HTMLElement): ExampleHandle {
  // A seasonal curve with seeded day-to-day noise: deterministic, so the visual test is stable.
  const normal = gaussian(rng(211));
  const start = Date.UTC(2025, 0, 1);
  const x: string[] = [];
  const y: number[] = [];
  for (let i = 0; i < 365; i++) {
    const season = 14 - 9 * Math.cos((2 * Math.PI * (i + 10)) / 365);
    const clouds = Math.min(1, Math.max(0.25, 0.85 + normal() * 0.18));
    x.push(new Date(start + i * DAY).toISOString().slice(0, 10));
    y.push(Math.round(season * clouds * 10) / 10);
  }

  useExampleFonts();
  const chart = createChart(el, {
    data: [{ type: 'scatter', mode: 'lines', fill: 'tozeroy', name: 'Output', x, y }],
    layout: {
      font: { family: 'Inter', size: 12 },
      title: { text: 'Daily solar output, 2025' },
      yaxis: { title: { text: 'kWh' } },
      margin: { l: 56, r: 24, t: 48, b: 40 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
