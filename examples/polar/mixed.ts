import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Polar and cartesian subplots in one figure (plan E11.4): a line chart on x/y axes whose
 * `domain` takes the left half, and a polar subplot (`polar.domain`) on the right, sharing one
 * legend. Hourly wind: speed over the day on the left, direction and speed on the right.
 */
export const meta: ExampleMeta = {
  title: 'Polar: with cartesian axes',
  description: 'A cartesian line chart and a polar subplot side by side in one figure.',
  tags: ['polar', 'scatterpolar', 'subplots', 'domain'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const speed = hours.map((h) => 3 + 2.5 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + (h % 3) * 0.2);
  const direction = hours.map((h) => 200 + 60 * Math.sin((h / 24) * 2 * Math.PI));
  const chart = createChart(el, {
    data: [
      { type: 'scatter', x: hours, y: speed, name: 'speed (m/s)' },
      {
        type: 'scatterpolar',
        r: speed,
        theta: direction,
        mode: 'markers',
        marker: { color: hours, colorscale: 'Viridis', size: 6 },
        name: 'direction',
      },
    ],
    layout: {
      title: { text: 'Wind over a day' },
      xaxis: { domain: [0, 0.45], title: { text: 'hour' } },
      yaxis: { title: { text: 'speed (m/s)' } },
      polar: {
        domain: { x: [0.55, 1] },
        angularaxis: { direction: 'clockwise' },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
