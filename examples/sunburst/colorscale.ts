import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Colorscale by value (plan E13.2): sectors sized by headcount and colored by a second number,
 * year-on-year growth, through `marker.colors` with a diverging `colorscale` centered on 0
 * (`cmid`) and a colorbar (`showscale`). With a colorscale every sector, the root included, takes
 * its own color and leaves stay opaque (`leaf.opacity` defaults to 1).
 */
export const meta: ExampleMeta = {
  title: 'Sunburst: colorscale',
  description:
    'Departments sized by headcount and colored by growth on a diverging colorscale centered on zero, with a colorbar.',
  tags: ['sunburst', 'hierarchical', 'chart', 'colorscale', 'colorbar'],
  size: { width: 640, height: 480 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789%.,−- ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz&';

const ROWS: readonly (readonly [string, string, number, number])[] = [
  ['Company', '', 0, 4],
  ['Engineering', 'Company', 0, 12],
  ['Platform', 'Engineering', 120, 18],
  ['Apps', 'Engineering', 160, 9],
  ['Data', 'Engineering', 70, 25],
  ['Sales', 'Company', 0, -3],
  ['EMEA', 'Sales', 60, -8],
  ['Americas', 'Sales', 90, 2],
  ['APAC', 'Sales', 40, 6],
  ['Operations', 'Company', 0, -6],
  ['Finance', 'Operations', 30, -2],
  ['People', 'Operations', 25, -12],
  ['IT', 'Operations', 35, 1],
  ['Marketing', 'Company', 55, 8],
];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'sunburst',
          labels: ROWS.map((r) => r[0]),
          parents: ROWS.map((r) => r[1]),
          values: ROWS.map((r) => r[2]),
          marker: {
            colors: ROWS.map((r) => r[3]),
            colorscale: 'RdBu',
            cmid: 0,
            showscale: true,
            colorbar: { title: { text: 'Growth %' } },
          },
          hovertemplate: '%{label}<br>%{value} people<br>growth %{color}%<extra></extra>',
        },
      ],
      layout: {
        title: { text: 'Headcount by department, colored by growth' },
        margin: { l: 20, r: 20, t: 50, b: 20 },
      },
      config: { responsive: true },
    });
    await componentsReady(chart);
  });

  return {
    ready,
    get renderer() {
      return chart?.three.renderer;
    },
    dispose: () => {
      disposed = true;
      chart?.destroy();
    },
  };
}
