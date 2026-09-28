import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A horizontal legend with a height limit (plan E5.2): 30 product lines in the default look's
 * legend, a row of entries above the plot. `maxheight: 44` (px; a value ≤ 1 would be a fraction
 * of the figure height) keeps the legend to two rows, so the rest scrolls inside it, with a
 * scrollbar at its right edge, instead of pushing the plot down. Horizontal legends that are not
 * given a `maxheight` scroll past half the figure height, as in Plotly.
 */
export const meta: ExampleMeta = {
  title: 'Legend: scrolling horizontal legend',
  description:
    'Stacked bars for 30 product lines with the default horizontal legend capped at two rows by maxheight; the rest scrolls.',
  tags: ['legend', 'bar'],
  size: { width: 720, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(5);
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const data = Array.from({ length: 30 }, (_, i) => ({
    type: 'bar' as const,
    name: `Line ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? 2 : ''}`,
    x: quarters,
    y: quarters.map((_, q) =>
      Math.round((4 + (i % 7) * 2) * (1 + q * 0.08) * (0.8 + 0.4 * random())),
    ),
  }));

  const chart = createChart(el, {
    data,
    layout: {
      title: { text: 'Revenue by product line (k€)' },
      barmode: 'stack',
      legend: { maxheight: 44 },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
