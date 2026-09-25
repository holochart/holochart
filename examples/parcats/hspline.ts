import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Curved paths (plan E10.11): `line.shape: 'hspline'` draws each path as horizontal S-curves
 * between the dimensions instead of straight ribbons. Coded answers (1–5) are shown by name with
 * `categoryarray` + `ticktext`, which also fixes their order.
 */
export const meta: ExampleMeta = {
  title: 'Parallel categories: curved paths',
  description: 'Survey answers across three questions, paths drawn as horizontal splines.',
  tags: ['parcats', 'statistical', 'domain', 'categorical', 'hspline'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(17);
  const n = 300;
  const q1: number[] = [];
  const q2: number[] = [];
  const q3: string[] = [];
  const clamp = (v: number): number => Math.max(1, Math.min(5, Math.round(v)));
  for (let i = 0; i < n; i++) {
    const mood = 1 + 4 * random();
    q1.push(clamp(mood + random() - 0.5));
    q2.push(clamp(mood + 2 * random() - 1));
    q3.push(mood + random() > 3.5 ? 'Yes' : 'No');
  }
  const scale = ['Very poor', 'Poor', 'Fair', 'Good', 'Excellent'];
  const chart = createChart(el, {
    data: [
      {
        type: 'parcats',
        line: { shape: 'hspline' },
        dimensions: [
          {
            label: 'Service',
            values: q1,
            categoryarray: [5, 4, 3, 2, 1],
            ticktext: [...scale].reverse(),
          },
          {
            label: 'Value',
            values: q2,
            categoryarray: [5, 4, 3, 2, 1],
            ticktext: [...scale].reverse(),
          },
          { label: 'Would recommend', values: q3, categoryarray: ['Yes', 'No'] },
        ],
      },
    ],
    layout: {
      title: { text: 'Survey: 300 answers' },
      margin: { t: 48, l: 64, r: 40, b: 24 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
