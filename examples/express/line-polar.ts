import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { wind } from './datasets.mts';

/**
 * Express polar lines (plan E23.6): `px.line_polar` with `lineClose: true` — one closed line per
 * strength bin around the 16 compass directions (each line's first row repeated at its end, as px
 * does), for the three lightest bins of the wind table.
 */
export const meta: ExampleMeta = {
  title: 'Express: closed polar lines',
  description: 'Wind frequency around the compass for three strength bins, one closed line each.',
  tags: ['express', 'scatterpolar', 'polar', 'lines', 'wind'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = wind().filter((r) => ['0-1', '1-2', '2-3'].includes(r.strength));
  const figure = hx.linePolar(rows, {
    r: 'frequency',
    theta: 'direction',
    color: 'strength',
    lineClose: true,
    markers: true,
    labels: { strength: 'Strength (m/s)', frequency: 'Frequency (%)' },
    title: 'Wind frequency around the compass',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
