import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Grouped box plots (plan E10.4): two traces share the x categories, and `boxmode: 'group'` sets
 * their boxes side by side within each category (`boxgap` between categories, `boxgroupgap`
 * between the boxes of one category). Each sample's `x` says which box it belongs to.
 */
export const meta: ExampleMeta = {
  title: 'Box: grouped',
  description:
    'Two traces over the same categories, side by side with boxmode group; each sample’s x picks its box.',
  tags: ['box', 'statistical', 'distribution', 'grouped'],
  testTolerance: 0.004,
};

const DAYS = ['Thu', 'Fri', 'Sat', 'Sun'];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(11));
  const trace = (name: string, lift: number) => {
    const x: string[] = [];
    const y: number[] = [];
    DAYS.forEach((day, d) => {
      for (let i = 0; i < 40; i++) {
        x.push(day);
        y.push(Math.max(3, 16 + 3 * d + lift + (4 + d) * normal()));
      }
    });
    return { type: 'box', name, x, y };
  };
  const chart = createChart(el, {
    data: [trace('Lunch', 0), trace('Dinner', 6)],
    layout: {
      title: { text: 'Total bill by day' },
      boxmode: 'group',
      yaxis: { title: { text: 'USD' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
