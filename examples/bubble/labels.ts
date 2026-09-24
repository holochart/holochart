import { bubbleSizeref, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Labeled bubbles (plan E9.5, E9.3): `mode: 'markers+text'` with `textposition: 'middle center'`
 * puts each label inside its bubble. The sizes are chosen so the smallest bubble still fits its
 * label; a contrasting `textfont.color` keeps the text readable on the fill.
 */
export const meta: ExampleMeta = {
  title: 'Bubble: labels inside',
  description:
    "Bubbles with their names centered inside: mode 'markers+text' and textposition 'middle center'.",
  tags: ['bubble', 'scatter', 'markers', 'text'],
  testTolerance: 0.006,
};

const PROJECTS = [
  { name: 'Atlas', cost: 1.5, value: 7.5, team: 34 },
  { name: 'Orion', cost: 3.4, value: 3.1, team: 18 },
  { name: 'Nova', cost: 5.2, value: 8.2, team: 40 },
  { name: 'Delta', cost: 7.1, value: 4.6, team: 22 },
  { name: 'Echo', cost: 2.4, value: 1.0, team: 12 },
  { name: 'Lynx', cost: 8.8, value: 8.6, team: 26 },
  { name: 'Vega', cost: 5.6, value: 1.4, team: 15 },
  { name: 'Iris', cost: 9.0, value: 1.9, team: 20 },
];

export function run(el: HTMLElement): ExampleHandle {
  const team = PROJECTS.map((p) => p.team);

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers+text',
        name: 'projects',
        x: PROJECTS.map((p) => p.cost),
        y: PROJECTS.map((p) => p.value),
        text: PROJECTS.map((p) => p.name),
        textposition: 'middle center',
        textfont: { color: '#eceef4', weight: 'bold' },
        marker: {
          size: team,
          sizemode: 'area',
          sizeref: bubbleSizeref(team, 72),
          color: '#5e74d5',
          opacity: 0.85,
        },
        hovertemplate: '%{text}: team of %{marker.size}<extra></extra>',
      },
    ],
    layout: {
      xaxis: { title: { text: 'Cost (M$)' }, range: [0, 10.2] },
      yaxis: { title: { text: 'Expected value (M$)' }, range: [-0.4, 10] },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
