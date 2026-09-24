import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Split violins (plan E10.5): two traces at the same positions, one drawn on the `negative` side
 * and one on the `positive` side, compare two distributions per category back to back. With
 * `violinmode: 'overlay'` (the default) they share each slot; `scalegroup` makes both halves use
 * one scale so their widths compare, and `meanline` marks each half's mean.
 */
export const meta: ExampleMeta = {
  title: 'Violin: split',
  description:
    'Two traces on opposite sides of each position compare distributions back to back, on one scale.',
  tags: ['violin', 'statistical', 'distribution', 'split', 'kde'],
  testTolerance: 0.004,
};

const DAYS = ['Thu', 'Fri', 'Sat', 'Sun'];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(23));
  const trace = (name: string, side: 'negative' | 'positive', lift: number) => {
    const x: string[] = [];
    const y: number[] = [];
    DAYS.forEach((day, d) => {
      for (let i = 0; i < 60; i++) {
        x.push(day);
        y.push(Math.max(3, 15 + 2.5 * d + lift + (3 + d) * normal()));
      }
    });
    return {
      type: 'violin',
      name,
      x,
      y,
      side,
      scalegroup: 'bills',
      meanline: { visible: true },
      points: false,
    };
  };
  const chart = createChart(el, {
    data: [trace('Non-smokers', 'negative', 0), trace('Smokers', 'positive', 4)],
    layout: {
      title: { text: 'Total bill by day and smoker' },
      yaxis: { title: { text: 'USD' } },
      violingap: 0,
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
