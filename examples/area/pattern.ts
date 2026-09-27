import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Stacked areas with pattern fills (plan E9.4, E8.10): `fillpattern` hatches a scatter fill like
 * `marker.pattern` hatches bars. By default (`fillmode: 'replace'`) the hatch takes `fillcolor`
 * (here the line color at half opacity); the last area overlays its pattern on the fill color.
 * Tiles are sized in screen px, so the hatch keeps its spacing when zooming.
 */
export const meta: ExampleMeta = {
  title: 'Area: pattern fills',
  description:
    'Three stacked areas hatched with fillpattern: lines, dots and an overlaid cross-hatch.',
  tags: ['area', 'fill', 'scatter', 'stacked', 'pattern'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const x = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        name: 'Hydro',
        x,
        y: [21, 22, 20, 23, 22, 24, 25],
        stackgroup: 'energy',
        fillpattern: { shape: '|', solidity: 0.25 },
      },
      {
        type: 'scatter',
        name: 'Wind',
        x,
        y: [12, 15, 18, 21, 26, 30, 34],
        stackgroup: 'energy',
        fillpattern: { shape: '.', size: 7, solidity: 0.35 },
      },
      {
        type: 'scatter',
        name: 'Solar',
        x,
        y: [4, 6, 9, 13, 18, 24, 31],
        stackgroup: 'energy',
        fillpattern: { shape: 'x', fillmode: 'overlay', size: 10, solidity: 0.2 },
      },
    ],
    layout: {
      title: { text: 'Renewable generation (TWh)' },
      yaxis: { title: { text: 'TWh' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
