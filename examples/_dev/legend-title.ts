import { componentsReady, createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Figure title with subtitle (E5.1) and a vertical legend (E5.2): legend title, background and
 * border, items grouped by `legendgroup` with `tracegroupgap`, a `legendrank` that moves one item
 * to the top, a `legendonly` trace shown dimmed, and a trace hidden from the legend. The legend
 * pushes the right margin so it fits beside the plot.
 */
export const meta: ExampleMeta = {
  title: 'Legend: title, groups, rank, hidden items + figure title and subtitle',
  description:
    'Vertical legend with title, background, border, grouping, legendrank and legendonly; figure title and subtitle.',
  tags: ['dev', 'chart', 'legend', 'title'],
  size: { width: 760, height: 460 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

function cloud(n: number, cx: number, cy: number, seed: number) {
  const normal = gaussian(rng(seed));
  return {
    x: Float64Array.from({ length: n }, () => cx + normal() * 0.6),
    y: Float64Array.from({ length: n }, () => cy + normal() * 0.6),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { mode: 'markers', name: 'Setosa (train)', legendgroup: 'setosa', ...cloud(40, 1, 1, 1) },
      {
        mode: 'markers',
        name: 'Setosa (test)',
        legendgroup: 'setosa',
        marker: { symbol: 'circle-open', size: 9, color: '#ea2a37' },
        ...cloud(15, 1.3, 1.2, 2),
      },
      {
        mode: 'markers',
        name: 'Versicolor',
        legendgroup: 'versicolor',
        marker: { symbol: 'square', size: 7 },
        ...cloud(40, 3, 2, 3),
      },
      {
        mode: 'markers',
        name: 'Virginica<br>(two lines)',
        legendgroup: 'virginica',
        marker: { symbol: 'diamond', size: 10 },
        ...cloud(40, 4.5, 3.5, 4),
      },
      {
        mode: 'markers',
        name: 'Outliers',
        visible: 'legendonly',
        marker: { symbol: 'x', size: 8 },
        ...cloud(8, 3, 3, 5),
      },
      {
        mode: 'markers',
        name: 'Reference',
        legendrank: 1,
        marker: { symbol: 'star', size: 14, color: '#f9f871' },
        x: [2.5],
        y: [2.5],
      },
      {
        mode: 'markers',
        name: 'not in legend',
        showlegend: false,
        marker: { color: '#80838f', size: 4 },
        ...cloud(20, 2, 4, 6),
      },
    ],
    layout: {
      title: {
        text: '<b>Iris</b> measurements',
        x: 0.05,
        subtitle: {
          text: 'Sepal width vs. length, grouped by species',
          font: { color: '#80838f' },
        },
      },
      legend: {
        orientation: 'v',
        x: 1.02,
        xanchor: 'left',
        y: 1,
        yanchor: 'top',
        title: { text: '<b>Species</b>' },
        bgcolor: '#15151d',
        bordercolor: '#3e3e4c',
        borderwidth: 1,
        tracegroupgap: 12,
      },
      xaxis: { title: { text: 'length (cm)' }, zeroline: false, automargin: true },
      yaxis: { title: { text: 'width (cm)' }, zeroline: false },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
