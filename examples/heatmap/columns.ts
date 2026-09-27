import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Column data (plan E11.1): `z` as a 1D array with `x` and `y` columns — one value per weekday and
 * hour, in any order — placed on the grid of their distinct values, as plotly.js does for tidy
 * data. Weekdays sit on a category axis in the order given by `categoryarray`.
 */
export const meta: ExampleMeta = {
  title: 'Heatmap: column data',
  description: 'Visits per weekday and hour from x, y and z columns, on a category axis.',
  tags: ['heatmap', 'scientific', 'category', 'columns'],
  testTolerance: 0.004,
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function run(el: HTMLElement): ExampleHandle {
  const x: string[] = [];
  const y: number[] = [];
  const z: number[] = [];
  // Listed hour-major (not in grid order) to show the placement.
  for (let h = 0; h < 24; h++) {
    for (let d = DAYS.length - 1; d >= 0; d--) {
      const weekend = d >= 5;
      const peak = weekend ? 14 : 12;
      x.push(DAYS[d]!);
      y.push(h);
      z.push(Math.round(100 * Math.exp(-((h - peak) ** 2) / (weekend ? 30 : 12)) + ((h + d) % 5)));
    }
  }
  const chart = createChart(el, {
    data: [{ type: 'heatmap', x, y, z, colorbar: { title: { text: 'visits' } } }],
    layout: {
      title: { text: 'Visits by weekday and hour' },
      xaxis: { categoryorder: 'array', categoryarray: DAYS },
      yaxis: { title: { text: 'hour' }, dtick: 3 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
