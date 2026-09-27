import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Overlaid polar bars (plan E11.5): `polar.barmode: 'overlay'` draws bars at the same angle over
 * one another instead of stacking them; translucent markers keep both visible. The angular axis
 * is linear (degrees), so bars are as wide as the smallest angle between them, less `bargap`.
 */
export const meta: ExampleMeta = {
  title: 'Polar: overlaid bars',
  description:
    'Two translucent barpolar traces overlaid (barmode overlay) on a linear angular axis.',
  tags: ['polar', 'barpolar', 'overlay', 'opacity'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const theta = Array.from({ length: 12 }, (_, i) => i * 30);
  const chart = createChart(el, {
    data: [
      {
        type: 'barpolar',
        r: theta.map((t) => 6 + 3 * Math.cos((t * Math.PI) / 180)),
        theta,
        name: 'observed',
        marker: { opacity: 0.6 },
      },
      {
        type: 'barpolar',
        r: theta.map((t) => 5 + 2 * Math.sin((t * Math.PI) / 90)),
        theta,
        name: 'model',
        marker: { opacity: 0.6 },
      },
    ],
    layout: {
      title: { text: 'Overlaid bars' },
      polar: { barmode: 'overlay', bargap: 0.25, radialaxis: { angle: 15 } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
