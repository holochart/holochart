import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Ranked horizontal bars (plan E9.8): `orientation: 'h'` puts categories on y, which leaves room
 * for long labels. Category axes run bottom-up, so sort ascending to put the largest bar on top.
 * Value labels sit past each bar end (`textposition: 'outside'`); one bar is highlighted with a
 * per-bar `marker.color` array.
 */
export const meta: ExampleMeta = {
  title: 'Recipe: ranked horizontal bars',
  description:
    'Sorted horizontal bars with long category labels, outside value labels, and one highlighted bar.',
  tags: ['recipe', 'bar', 'horizontal', 'text'],
  testTolerance: 0.004,
};

const SHARE: [string, number][] = [
  ['Search engines', 38.2],
  ['Direct traffic', 21.5],
  ['Social networks', 14.1],
  ['Email newsletters', 9.6],
  ['Partner websites', 7.3],
  ['Paid advertising', 5.2],
  ['Podcasts and video', 2.4],
  ['Other', 1.7],
];

export function run(el: HTMLElement): ExampleHandle {
  const sorted = [...SHARE].sort((a, b) => a[1] - b[1]);

  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        orientation: 'h',
        y: sorted.map(([name]) => name),
        x: sorted.map(([, v]) => v),
        texttemplate: '%{x:.1f}%',
        textposition: 'outside',
        marker: {
          color: sorted.map(([name]) => (name === 'Social networks' ? '#ef553b' : '#636efa')),
        },
        hovertemplate: '%{y}: %{x:.1f}%<extra></extra>',
      },
    ],
    layout: {
      font: { family: 'Inter', size: 12 },
      title: { text: 'Where visitors come from' },
      xaxis: { ticksuffix: '%', range: [0, 44] },
      bargap: 0.25,
      margin: { l: 136, r: 24, t: 48, b: 40 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
