import { componentsReady, createChart, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
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

async function loadFonts(): Promise<void> {
  useExampleFonts();
  await Promise.all([document.fonts.load('12px Inter'), document.fonts.load('bold 12px Inter')]);
}

function cloud(n: number, cx: number, cy: number, seed: number) {
  const normal = gaussian(rng(seed));
  return {
    x: Float64Array.from({ length: n }, () => cx + normal() * 0.6),
    y: Float64Array.from({ length: n }, () => cy + normal() * 0.6),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;

  const ready = loadFonts().then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        { mode: 'markers', name: 'Setosa (train)', legendgroup: 'setosa', ...cloud(40, 1, 1, 1) },
        {
          mode: 'markers',
          name: 'Setosa (test)',
          legendgroup: 'setosa',
          marker: { symbol: 'circle-open', size: 9, color: '#1f77b4' },
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
          marker: { symbol: 'x', size: 8, color: '#d62728' },
          ...cloud(8, 3, 3, 5),
        },
        {
          mode: 'markers',
          name: 'Reference',
          legendrank: 1,
          marker: { symbol: 'star', size: 14, color: '#bcbd22' },
          x: [2.5],
          y: [2.5],
        },
        {
          mode: 'markers',
          name: 'not in legend',
          showlegend: false,
          marker: { color: '#999', size: 4 },
          ...cloud(20, 2, 4, 6),
        },
      ],
      layout: {
        font: { family: 'Inter', size: 12 },
        margin: { l: 50, r: 20, t: 70, b: 40 },
        plot_bgcolor: '#f4f6fa',
        title: {
          text: '<b>Iris</b> measurements',
          x: 0.05,
          subtitle: {
            text: 'Sepal width vs. length, grouped by species',
            font: { color: '#7f8fa6' },
          },
        },
        legend: {
          title: { text: '<b>Species</b>' },
          bgcolor: '#fbfcfe',
          bordercolor: '#9aa7b8',
          borderwidth: 1,
          tracegroupgap: 12,
        },
        xaxis: { title: { text: 'length (cm)' }, zeroline: false, automargin: true },
        yaxis: { title: { text: 'width (cm)' }, zeroline: false },
      },
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
