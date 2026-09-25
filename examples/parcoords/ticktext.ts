import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Ordinal axes and tick text (plan E10.10): categories coded as numbers get `tickvals` (their
 * codes) and `ticktext` (their names), which makes the axis ordinal: no range labels, and brushes
 * snap to the ticks. `labelangle` tilts the axis labels and `labelside: 'bottom'` puts them under
 * the axes.
 */
export const meta: ExampleMeta = {
  title: 'Parallel coordinates: tick text and labels',
  description:
    'Coded categories shown by name with tickvals / ticktext, tilted axis labels below the axes.',
  tags: ['parcoords', 'statistical', 'domain', 'ticks', 'categorical'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(31);
  const n = 240;
  const region: number[] = [];
  const plan: number[] = [];
  const tenure: number[] = [];
  const spend: number[] = [];
  const churn: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(random() * 4);
    const p = Math.min(2, Math.floor(random() * 3 + (r === 1 ? 0.5 : 0)));
    const t = Math.round(1 + random() * 47);
    region.push(r);
    plan.push(p);
    tenure.push(t);
    spend.push(Math.round(20 + 40 * p + 30 * random()));
    churn.push(random() < 0.6 - t / 100 - 0.1 * p ? 1 : 0);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'parcoords',
        labelangle: -20,
        labelside: 'bottom',
        line: {
          color: churn,
          colorscale: [
            [0, '#5e74d5'],
            [1, '#ea2a37'],
          ],
        },
        dimensions: [
          {
            label: 'Region',
            values: region,
            tickvals: [0, 1, 2, 3],
            ticktext: ['North', 'South', 'East', 'West'],
          },
          {
            label: 'Plan',
            values: plan,
            tickvals: [0, 1, 2],
            ticktext: ['Basic', 'Plus', 'Pro'],
          },
          { label: 'Tenure (months)', values: tenure },
          { label: 'Monthly spend', values: spend, tickformat: '$,' },
          {
            label: 'Churned',
            values: churn,
            tickvals: [0, 1],
            ticktext: ['No', 'Yes'],
            range: [-0.1, 1.1],
          },
        ],
      },
    ],
    layout: {
      title: { text: 'Customers by region, plan and churn' },
      margin: { t: 40, l: 56, r: 40, b: 64 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
