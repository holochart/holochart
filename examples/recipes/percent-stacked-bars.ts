import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 100% stacked horizontal bars (plan E9.9): survey answers per question. `barmode: 'stack'` with
 * `barnorm: 'percent'` scales every row to 100, so rows with different response counts compare
 * as shares. Labels show each segment's raw count; a diverging palette orders the answers.
 */
export const meta: ExampleMeta = {
  title: 'Recipe: 100% stacked horizontal bars',
  description:
    "Survey responses as horizontal bars stacked to 100% with barnorm: 'percent', a diverging palette and inside labels.",
  tags: ['recipe', 'bar', 'horizontal', 'stack', 'barnorm'],
  size: { width: 680, height: 400 },
  testTolerance: 0.004,
};

const QUESTIONS = ['Docs are clear', 'Setup was easy', 'Charts are fast', 'API is consistent'];
const ANSWERS = [
  { name: 'Strongly disagree', color: '#ea2a37', counts: [6, 10, 2, 8] },
  { name: 'Disagree', color: '#8a2530', counts: [14, 22, 6, 15] },
  { name: 'Neutral', color: '#3e3e4c', counts: [25, 30, 12, 28] },
  { name: 'Agree', color: '#384a8f', counts: [60, 48, 55, 52] },
  { name: 'Strongly agree', color: '#5e74d5', counts: [45, 20, 95, 37] },
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: ANSWERS.map((a) => ({
      type: 'bar',
      orientation: 'h',
      name: a.name,
      y: QUESTIONS,
      x: a.counts,
      text: a.counts.map(String),
      textposition: 'inside',
      insidetextanchor: 'middle',
      marker: { color: a.color },
    })),
    layout: {
      barmode: 'stack',
      barnorm: 'percent',
      bargap: 0.3,
      xaxis: { ticksuffix: '%' },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
