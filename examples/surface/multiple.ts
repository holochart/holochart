import { createChart } from '@mk7s/holochart';
import { linspace, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Several surfaces in one scene (plan E14.3): a measured field and its upper and lower bounds.
 * The bounds are translucent (`opacity: 0.45`) with one color each (a one-color colorscale), the
 * middle surface keeps the colorscale and the colorbar.
 */
export const meta: ExampleMeta = {
  title: 'Surface: multiple surfaces',
  description: 'A field between translucent upper and lower bound surfaces in one scene.',
  tags: ['surface', '3d', 'scientific', 'opacity'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const axis = linspace(0, 10, 40);
  const f = (x: number, y: number) => 2 + Math.sin(x / 1.5) + Math.cos(y / 2);
  const flat = (color: string) => [
    [0, color],
    [1, color],
  ];
  const chart = createChart(el, {
    data: [
      {
        type: 'surface',
        x: axis,
        y: axis,
        z: sample(axis, axis, f),
        name: 'estimate',
        colorbar: { title: { text: 'estimate' } },
      },
      {
        type: 'surface',
        x: axis,
        y: axis,
        z: sample(axis, axis, (x, y) => f(x, y) + 1.2),
        name: 'upper',
        colorscale: flat('#5ec8f2'),
        showscale: false,
        opacity: 0.45,
      },
      {
        type: 'surface',
        x: axis,
        y: axis,
        z: sample(axis, axis, (x, y) => f(x, y) - 1.2),
        name: 'lower',
        colorscale: flat('#f28e5e'),
        showscale: false,
        opacity: 0.45,
      },
    ],
    layout: {
      title: { text: 'Estimate with bounds' },
      scene: { camera: { eye: { x: 1.6, y: -1.3, z: 0.7 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
