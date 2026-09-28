import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Concentration colorscales (plan E13.5b): each pair of nodes is joined by two links, one per
 * `link.label` ("Women", "Men"). `link.colorscales` colors the "Women" links by their share of
 * the flow between their two nodes — pale where few of the students are women, bright where most
 * are — so the stacked pair reads as one flow with its composition in color. Hover a link for its
 * concentration.
 */
export const meta: ExampleMeta = {
  title: 'Sankey: link colorscales',
  description: 'Students moving from school tracks to fields of study, colored by share of women.',
  tags: ['sankey', 'hierarchical', 'flow', 'domain', 'colorscale'],
  testTolerance: 0.004,
};

const LABELS = ['Sciences', 'Humanities', 'Vocational', 'Engineering', 'Medicine', 'Law', 'Arts'];

/** `[source, target, women, men]`. */
const FLOWS: [number, number, number, number][] = [
  [0, 3, 120, 410],
  [0, 4, 260, 150],
  [0, 5, 60, 55],
  [1, 5, 210, 120],
  [1, 6, 240, 90],
  [1, 4, 70, 30],
  [2, 3, 40, 230],
  [2, 6, 85, 60],
];

export function run(el: HTMLElement): ExampleHandle {
  const source: number[] = [];
  const target: number[] = [];
  const value: number[] = [];
  const label: string[] = [];
  for (const [s, t, women, men] of FLOWS) {
    source.push(s, s);
    target.push(t, t);
    value.push(women, men);
    label.push('Women', 'Men');
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'sankey',
        valuesuffix: ' students',
        node: { label: LABELS },
        link: {
          source,
          target,
          value,
          label,
          colorscales: [
            {
              label: 'Women',
              cmin: 0,
              cmax: 1,
              colorscale: [
                [0, '#2a1a4a'],
                [0.5, '#9962c0'],
                [1, '#f2b8ff'],
              ],
            },
          ],
        },
      },
    ],
    layout: { title: { text: 'From school track to field of study: share of women' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
