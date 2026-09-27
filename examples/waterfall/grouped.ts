import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Grouped waterfalls (plan E12.4): two traces on the same positions sit side by side
 * (`waterfallmode: 'group'`, the default), with `waterfallgap` between positions and
 * `waterfallgroupgap` between the two years. Each trace keeps its own running total and connector
 * lines; the second year uses lighter direction colors so the pairs read apart. A `base` starts
 * both waterfalls at the opening headcount, and the `total` bar shows the year's closing one.
 */
export const meta: ExampleMeta = {
  title: 'Waterfall: grouped years',
  description:
    'Two waterfalls side by side per quarter with waterfallgap and waterfallgroupgap, a common base and per-trace direction colors.',
  tags: ['waterfall', 'financial', 'chart', 'group', 'waterfallmode', 'base', 'legend'],
  size: { width: 720, height: 420 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,+-− ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4', 'Year'];
const MEASURE = ['relative', 'relative', 'relative', 'relative', 'total'];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'waterfall',
          name: '2024',
          x: QUARTERS,
          y: [14, -6, 9, 4, null],
          measure: MEASURE,
          base: 120,
          textinfo: 'delta',
          textposition: 'outside',
        },
        {
          type: 'waterfall',
          name: '2025',
          x: QUARTERS,
          y: [8, 11, -12, 6, null],
          measure: MEASURE,
          base: 120,
          textinfo: 'delta',
          textposition: 'outside',
          increasing: { marker: { color: '#4ec27a' } },
          decreasing: { marker: { color: '#f2707a' } },
          totals: { marker: { color: '#9aa9ea' } },
        },
      ],
      layout: {
        title: { text: 'Headcount changes by quarter' },
        yaxis: { title: { text: 'people' } },
        waterfallgap: 0.3,
        waterfallgroupgap: 0.1,
        showlegend: true,
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
