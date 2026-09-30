import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Stacked 3D bars (plan E14.9): electricity generation by source for four countries (x) over
 * three years (y). The three `bar3d` traces share `stackgroup: 'mix'`, so at every (country, year)
 * each source starts where the one before it ended (Plotly's `barmode: 'stack'`, set per trace
 * like scatter's `stackgroup`); the z autorange covers the stack totals. Hover a block for its
 * value and where it starts (`base`).
 */
export const meta: ExampleMeta = {
  title: 'Bar3D: stacked bars',
  description: 'Generation mix by country and year as stacked 3D bars (stackgroup).',
  tags: ['bar3d', '3d', 'bar', 'stacked', 'holochart-extension'],
  testTolerance: 0.004,
};

const COUNTRIES = ['Norland', 'Ostia', 'Sudmark', 'Westfall'];
const YEARS = ['2022', '2023', '2024'];
const MIX: Record<string, number[][]> = {
  // [country][year], TWh
  Fossil: [
    [60, 55, 48],
    [90, 86, 80],
    [40, 35, 31],
    [70, 62, 51],
  ],
  Nuclear: [
    [30, 30, 32],
    [10, 12, 12],
    [55, 57, 58],
    [20, 20, 18],
  ],
  Renewables: [
    [25, 34, 45],
    [15, 21, 30],
    [20, 26, 33],
    [35, 46, 60],
  ],
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: Object.entries(MIX).map(([source, values]) => ({
      type: 'bar3d',
      name: source,
      stackgroup: 'mix',
      x: COUNTRIES.flatMap((c) => YEARS.map(() => c)),
      y: COUNTRIES.flatMap(() => YEARS),
      z: values.flat(),
      width: 0.6,
      depth: 0.6,
    })),
    layout: {
      title: { text: 'Electricity generation by source (TWh)' },
      scene: {
        camera: { eye: { x: 1.6, y: -1.35, z: 0.8 } },
        zaxis: { title: { text: 'TWh' } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
