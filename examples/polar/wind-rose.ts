import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Wind rose (plan E11.5): wind frequency by direction (16 compass points) and speed bin, one
 * `barpolar` trace per bin stacked outwards (`polar.barmode: 'stack'`), on a compass-style
 * angular axis (`direction: 'clockwise'` from north) with a percent radial axis.
 */
export const meta: ExampleMeta = {
  title: 'Polar: wind rose',
  description: 'Stacked barpolar traces, one per wind speed bin, over 16 compass directions.',
  tags: ['polar', 'barpolar', 'wind rose', 'stack'],
  testTolerance: 0.004,
};

const DIRECTIONS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
];
const BINS = ['< 2 m/s', '2–4 m/s', '4–6 m/s', '6–8 m/s', '> 8 m/s'];
const COLORS = ['#3a0ca3', '#6a00f4', '#ff2bd6', '#ff9e00', '#f9f871'];

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(5);
  // Prevailing south-westerlies: more (and stronger) wind from SW and W.
  const weight = DIRECTIONS.map((_, i) => 1 + 1.6 * Math.exp(-(((i - 10.5) / 2.2) ** 2)));
  const data = BINS.map((name, b) => ({
    type: 'barpolar' as const,
    name,
    theta: DIRECTIONS,
    r: weight.map(
      (w) => +(w * (2.4 - b * 0.42) * (0.7 + 0.6 * random()) * (1 + (b * w) / 6)).toFixed(2),
    ),
    marker: { color: COLORS[b] },
    hovertemplate: `%{theta}: %{r}<extra>${name}</extra>`,
  }));
  const chart = createChart(el, {
    data,
    layout: {
      title: { text: 'Wind rose: frequency by direction and speed (%)' },
      polar: {
        angularaxis: { direction: 'clockwise' },
        radialaxis: { ticksuffix: '%', angle: 45 },
        bargap: 0.08,
      },
      legend: { title: { text: 'Wind speed' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
