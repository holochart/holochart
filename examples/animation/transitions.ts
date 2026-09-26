import { createChart, type FigureInput } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Transitions (plan E7.3): a ranking of eight products as horizontal bars. `react` with a
 * `layout.transition` moves to the next quarter: each bar's value grows or shrinks, and bars that
 * change rank slide to their new row — the bars carry `ids`, so a product's bar is matched to
 * itself whatever its position, and `y` (the rank) interpolates. Colors follow the product.
 *
 * The example plays one transition, from Q1 to Q2, and is shown (and tested) once it has settled.
 */
export const meta: ExampleMeta = {
  title: 'Animation: bars re-sorting with layout.transition',
  description:
    'A ranking of horizontal bars: react with layout.transition animates new values, and bars matched by ids slide to their new ranks.',
  tags: ['animation', 'transitions', 'bar', 'horizontal'],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

const PRODUCTS = ['Aurora', 'Beacon', 'Cinder', 'Delta', 'Ember', 'Flux', 'Garnet', 'Helix'];
const COLORS = [
  '#ef4444',
  '#3b82f6',
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#a855f7',
];

/** Sales per product for four quarters (deterministic). */
function quarters(): number[][] {
  const random = rng(42);
  const base = PRODUCTS.map(() => 40 + random() * 60);
  return [0, 1, 2, 3].map((q) => base.map((b) => Math.round(b * (1 + q * (random() - 0.35)))));
}

/** The ranking for one quarter: bars sorted by value, rank 1 on top. */
function rankingFigure(values: readonly number[], quarter: string): FigureInput {
  const order = values.map((_, i) => i).sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0));
  const rank = new Array<number>(values.length);
  order.forEach((i, r) => (rank[i] = r + 1));
  return {
    data: [
      {
        type: 'bar',
        orientation: 'h',
        ids: PRODUCTS,
        x: [...values],
        y: rank,
        text: PRODUCTS.map((p, i) => `${p}  ${values[i]}`),
        textposition: 'inside',
        insidetextanchor: 'start',
        marker: { color: COLORS },
        hovertemplate: '%{text}<extra></extra>',
      },
    ],
    layout: {
      title: { text: `Sales ranking, ${quarter}` },
      transition: { duration: 750, easing: 'cubic-in-out' },
      xaxis: { range: [0, 130], title: { text: 'Units (thousands)' } },
      yaxis: { range: [8.6, 0.4], showticklabels: false, showgrid: false, zeroline: false },
      bargap: 0.25,
      showlegend: false,
    },
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const data = quarters();
  const chart = createChart(el, rankingFigure(data[0] as number[], 'Q1'));
  // One transition to the next quarter; `react` resolves once it has finished.
  const ready = chart.ready.then(() => chart.react(rankingFigure(data[1] as number[], 'Q2')));
  return {
    ready: ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
