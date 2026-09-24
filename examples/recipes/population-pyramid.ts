import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Population pyramid (plan E9.8, E9.9): two horizontal bar traces, one with negated values so it
 * grows left. `barmode: 'relative'` puts both on the same row, and `bargap: 0.05` closes them up.
 * `tickvals` / `ticktext` label the x axis with absolute values; `customdata` carries the
 * unsigned numbers for the hover label.
 */
export const meta: ExampleMeta = {
  title: 'Recipe: population pyramid',
  description:
    'Back-to-back horizontal bars: negated values, relative barmode, and tickvals/ticktext showing absolute values.',
  tags: ['recipe', 'bar', 'horizontal', 'relative', 'negative'],
  size: { width: 640, height: 440 },
  testTolerance: 0.004,
};

const AGES = ['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79', '80+'];
const MEN = [5.1, 5.4, 6.2, 6.8, 6.5, 6.9, 5.8, 3.9, 1.8];
const WOMEN = [4.9, 5.1, 6.0, 6.7, 6.5, 7.0, 6.2, 4.6, 3.1];

export function run(el: HTMLElement): ExampleHandle {
  const ticks = [-8, -6, -4, -2, 0, 2, 4, 6, 8];

  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        orientation: 'h',
        name: 'Men',
        y: AGES,
        x: MEN.map((v) => -v),
        customdata: MEN,
        marker: { color: '#5e74d5' },
        hovertemplate: 'Men %{y}: %{customdata}M<extra></extra>',
      },
      {
        type: 'bar',
        orientation: 'h',
        name: 'Women',
        y: AGES,
        x: WOMEN,
        customdata: WOMEN,
        marker: { color: '#cc540a' },
        hovertemplate: 'Women %{y}: %{customdata}M<extra></extra>',
      },
    ],
    layout: {
      barmode: 'relative',
      bargap: 0.05,
      xaxis: {
        title: { text: 'Population (millions)' },
        range: [-8.5, 8.5],
        tickvals: ticks,
        ticktext: ticks.map((t) => String(Math.abs(t))),
      },
      yaxis: { title: { text: 'Age' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
