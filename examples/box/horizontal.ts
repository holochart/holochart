import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Horizontal box plots (plan E10.4): samples given as `x` only make horizontal boxes at their trace
 * names on a category y axis (`orientation: 'h'` is inferred). Long category names read better
 * this way. Traces are listed bottom-up, like any category axis.
 */
export const meta: ExampleMeta = {
  title: 'Box: horizontal',
  description: 'Samples given as x make horizontal boxes at the trace names on a category y axis.',
  tags: ['box', 'statistical', 'distribution', 'horizontal'],
  testTolerance: 0.004,
};

const SERVICES: [string, number, number][] = [
  ['auth-service', 38, 6],
  ['search-api', 64, 14],
  ['checkout', 92, 20],
  ['image-resizer', 140, 35],
];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(13));
  const chart = createChart(el, {
    data: SERVICES.map(([name, mu, sigma]) => ({
      type: 'box',
      name,
      x: Array.from({ length: 90 }, () => Math.max(5, mu + sigma * normal())),
    })),
    layout: {
      title: { text: 'p50 response time per service' },
      xaxis: { title: { text: 'ms' } },
      showlegend: false,
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
