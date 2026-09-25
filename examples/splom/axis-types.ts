import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Dimensions of every axis type in one matrix (plan E10.9): dates, categories and a log axis
 * (`axis.type: 'log'`), detected from the values or set per dimension. `axis.matches` links a
 * dimension's x and y axes, so zooming its column also zooms its row. Hover a point to see both
 * dimension values of the cell.
 */
export const meta: ExampleMeta = {
  title: 'Scatter plot matrix: axis types',
  description: 'Date, category and log dimensions; axis.matches links a dimension’s x and y axes.',
  tags: ['splom', 'statistical', 'dates', 'categories', 'log'],
  size: { width: 640, height: 600 },
  testTolerance: 0.004,
};

const PLANS = ['free', 'team', 'business'];

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(21);
  const normal = gaussian(random);
  const n = 240;
  const signup: string[] = [];
  const plan: string[] = [];
  const revenue: number[] = [];
  const seats: number[] = [];
  const start = Date.UTC(2025, 0, 1);
  for (let i = 0; i < n; i++) {
    const k = Math.min(2, Math.floor(random() * random() * 4));
    const day = Math.floor(random() * 365);
    signup.push(new Date(start + day * 86_400_000).toISOString().slice(0, 10));
    plan.push(PLANS[k]!);
    const s = Math.max(1, Math.round(Math.exp(1 + k * 1.3 + 0.5 * normal())));
    seats.push(s);
    revenue.push(Math.round(s * (k === 0 ? 1 : k === 1 ? 12 : 30) * Math.exp(0.3 * normal())));
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'splom',
        name: 'accounts',
        dimensions: [
          { label: 'sign-up', values: signup },
          { label: 'plan', values: plan },
          { label: 'seats', values: seats, axis: { type: 'log', matches: true } },
          { label: 'revenue ($/mo)', values: revenue, axis: { type: 'log', matches: true } },
        ],
        marker: { size: 4, opacity: 0.7 },
      },
    ],
    layout: {
      title: { text: 'Accounts' },
      // Half-year ticks fit the narrow date column without rotating.
      xaxis: { dtick: 'M6', tickformat: '%b %Y' },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
