import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Boxes on category and date axes (plan E10.4): on the left, one box per month from samples whose
 * `x` are dates (each distinct date is a box; widths follow the spacing of the dates); on the
 * right, horizontal boxes whose values are dates, at category positions — how long each release
 * took to ship, as spreads of ship dates.
 */
export const meta: ExampleMeta = {
  title: 'Box: categories and dates',
  description:
    'Monthly boxes at date positions, and horizontal boxes of date values at category positions.',
  tags: ['box', 'statistical', 'distribution', 'date', 'category', 'subplots'],
  testTolerance: 0.004,
};

const MONTHS = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01'];
const DAY = 86_400_000;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(17));
  const x: string[] = [];
  const y: number[] = [];
  MONTHS.forEach((month, m) => {
    for (let i = 0; i < 30; i++) {
      x.push(month);
      y.push(12 + 4 * Math.sin(m / 1.5) + 2.5 * normal());
    }
  });
  const shipped = (start: string, spreadDays: number, n: number) =>
    Array.from({ length: n }, () =>
      new Date(Date.parse(start) + Math.abs(normal()) * spreadDays * DAY).toISOString(),
    );
  const chart = createChart(el, {
    data: [
      { type: 'box', name: 'Temperature', x, y, xaxis: 'x', yaxis: 'y' },
      {
        type: 'box',
        name: 'v2.0',
        x: shipped('2026-02-02', 12, 30),
        xaxis: 'x2',
        yaxis: 'y2',
      },
      {
        type: 'box',
        name: 'v2.1',
        x: shipped('2026-03-09', 20, 30),
        xaxis: 'x2',
        yaxis: 'y2',
      },
    ],
    layout: {
      title: { text: 'Boxes on date axes' },
      showlegend: false,
      xaxis: { domain: [0, 0.5] },
      yaxis: { title: { text: '°C' } },
      xaxis2: { domain: [0.6, 1], anchor: 'y2', type: 'date' },
      yaxis2: { anchor: 'x2' },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
