import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { wind } from './datasets.mts';

/**
 * Express polar scatter (plan E23.6): `px.scatter_polar` on a wind table — radius the share of
 * time, angle the compass direction (categories, clockwise from north at the top, as px lays out
 * the angular axis), one trace per strength bin by color and symbol, marker areas by frequency.
 */
export const meta: ExampleMeta = {
  title: 'Express: polar scatter of wind data',
  description:
    'Wind frequency by compass direction and strength bin, colored and shaped by strength, sized by frequency.',
  tags: ['express', 'scatterpolar', 'polar', 'wind', 'grouping'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.scatterPolar(wind(), {
    r: 'frequency',
    theta: 'direction',
    color: 'strength',
    symbol: 'strength',
    size: 'frequency',
    sizeMax: 16,
    labels: { strength: 'Strength (m/s)', frequency: 'Frequency (%)' },
    title: 'Wind by direction and strength',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
