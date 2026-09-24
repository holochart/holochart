import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Grouped violins (plan E10.5): three traces over the same categories with
 * `violinmode: 'group'` sit side by side in each category (`violingap` between categories,
 * `violingroupgap` between the violins of one), like grouped box plots.
 */
export const meta: ExampleMeta = {
  title: 'Violin: grouped',
  description: 'Three traces side by side in each category with violinmode group.',
  tags: ['violin', 'statistical', 'distribution', 'grouped', 'kde'],
  testTolerance: 0.004,
};

const REGIONS = ['North', 'South', 'East', 'West'];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(31));
  const trace = (name: string, shift: number) => {
    const x: string[] = [];
    const y: number[] = [];
    REGIONS.forEach((region, r) => {
      for (let i = 0; i < 80; i++) {
        x.push(region);
        y.push(50 + shift + 6 * Math.cos(r + shift / 5) + (6 + r) * normal());
      }
    });
    return { type: 'violin', name, x, y, points: false };
  };
  const chart = createChart(el, {
    data: [trace('2024', 0), trace('2025', 5), trace('2026', 9)],
    layout: {
      title: { text: 'Satisfaction score by region and year' },
      violinmode: 'group',
      violingroupgap: 0.1,
      yaxis: { title: { text: 'score' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
