import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
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
  { name: 'Strongly disagree', color: '#b2182b', counts: [6, 10, 2, 8] },
  { name: 'Disagree', color: '#ef8a62', counts: [14, 22, 6, 15] },
  { name: 'Neutral', color: '#bababa', counts: [25, 30, 12, 28] },
  { name: 'Agree', color: '#67a9cf', counts: [60, 48, 55, 52] },
  { name: 'Strongly agree', color: '#2166ac', counts: [45, 20, 95, 37] },
];

export function run(el: HTMLElement): ExampleHandle {
  useExampleFonts();
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
      font: { family: 'Inter', size: 12 },
      barmode: 'stack',
      barnorm: 'percent',
      bargap: 0.3,
      xaxis: { ticksuffix: '%' },
      legend: { orientation: 'h', y: -0.15 },
      margin: { l: 128, r: 24, t: 24, b: 40 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
