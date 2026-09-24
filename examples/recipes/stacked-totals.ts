import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Stacked bars with total labels (plan E9.9 recipe). Bar labels belong to one segment, so a total
 * needs its own trace: a `scatter` trace in `mode: 'text'` at each stack's total, with
 * `textposition: 'top center'`. It has no legend entry and no hover (`hoverinfo: 'skip'`).
 * Autorange doesn't make room for text, so the y range is set with some headroom.
 */
export const meta: ExampleMeta = {
  title: 'Recipe: stacked bars with totals',
  description:
    'Three stacked bar traces with segment labels inside, and a text-only scatter trace that labels each stack total.',
  tags: ['recipe', 'bar', 'stack', 'text'],
  testTolerance: 0.004,
};

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const SERIES = [
  { name: 'Hardware', y: [14, 16, 13, 18] },
  { name: 'Software', y: [9, 11, 14, 12] },
  { name: 'Services', y: [5, 4, 7, 9] },
];

export function run(el: HTMLElement): ExampleHandle {
  const totals = QUARTERS.map((_, i) => SERIES.reduce((sum, s) => sum + s.y[i]!, 0));

  const chart = createChart(el, {
    data: [
      ...SERIES.map((s) => ({
        type: 'bar',
        name: s.name,
        x: QUARTERS,
        y: s.y,
        texttemplate: '%{y}',
        textposition: 'inside',
        insidetextanchor: 'middle',
      })),
      {
        type: 'scatter',
        mode: 'text',
        name: 'Total',
        x: QUARTERS,
        y: totals,
        texttemplate: '%{y}',
        textposition: 'top center',
        textfont: { size: 10, weight: 'bold', color: '#eceef4' },
        showlegend: false,
        hoverinfo: 'skip',
      },
    ],
    layout: {
      barmode: 'stack',
      yaxis: { title: { text: 'Revenue ($M)' }, range: [0, Math.max(...totals) * 1.15] },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
