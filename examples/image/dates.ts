import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * An image on a date axis (plan E11.3): one pixel column per hour of three days (`x0` a date,
 * `dx` one hour in ms), rows for 24 sensor channels. The axes have different types, so no
 * `scaleanchor` is set by default and the image fills the plot; the y axis is reversed (channel 0
 * at the top) as for every image. A line trace on a second y axis follows the daily cycle.
 */
export const meta: ExampleMeta = {
  title: 'Image: pixels over time',
  description: 'Hourly pixel columns on a date axis with an overlaid line on a second y axis.',
  tags: ['image', 'scientific', 'date', 'overlay'],
  testTolerance: 0.004,
};

const HOUR = 3_600_000;

export function run(el: HTMLElement): ExampleHandle {
  const hours = 72;
  const channels = 24;
  const z = Array.from({ length: channels }, (_, ch) =>
    Array.from({ length: hours }, (_, t) => {
      const day = Math.max(0, Math.sin(((t % 24) - 6) * (Math.PI / 12)));
      const v = day * (0.4 + 0.6 * Math.exp(-((ch - 8 - (t % 24) / 3) ** 2) / 20));
      return [
        Math.round(40 + 215 * v),
        Math.round(30 + 160 * v * v),
        Math.round(90 + 60 * (1 - v)),
      ];
    }),
  );
  const start = Date.UTC(2026, 5, 1);
  const x = Array.from({ length: hours }, (_, t) => start + t * HOUR);
  const chart = createChart(el, {
    data: [
      { type: 'image', z, x0: start, dx: HOUR },
      {
        type: 'scatter',
        mode: 'lines',
        x,
        y: x.map((_, t) => Math.max(0, Math.sin(((t % 24) - 6) * (Math.PI / 12)))),
        yaxis: 'y2',
        name: 'irradiance',
        line: { color: '#ffffff', width: 1 },
      },
    ],
    layout: {
      title: { text: 'Sensor channels, hourly' },
      xaxis: { type: 'date' },
      yaxis: { title: { text: 'channel' } },
      yaxis2: { overlaying: 'y', side: 'right', range: [0, 1.05], showgrid: false },
      showlegend: false,
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
