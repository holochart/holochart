import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Uniform text (plan E12.6, E4.6): `layout.uniformtext` draws the stage labels of every funnel area
 * of the chart at one size, the size of the smallest label that still fits, as in Plotly. With
 * `mode: 'hide'` and `minsize: 8`, labels that would have to shrink below 8 px to fit their stage
 * (here the narrow last stages) are hidden instead; the others read at a single size across both
 * funnels rather than each label shrinking on its own.
 */
export const meta: ExampleMeta = {
  title: 'Funnel area: uniform text',
  description:
    'Two funnel areas whose stage labels share one size through layout.uniformtext; labels under 8 px are hidden.',
  tags: ['funnelarea', 'financial', 'chart', 'text', 'uniformtext'],
  size: { width: 780, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,%: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const STAGES = [
  'Site visits',
  'Product page views',
  'Added to cart',
  'Started checkout',
  'Completed purchase',
];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'funnelarea',
          name: 'Web',
          labels: STAGES,
          values: [5200, 2600, 900, 420, 160],
          textinfo: 'label+percent',
          textfont: { size: 14 },
          domain: { row: 0, column: 0 },
          title: { text: 'Web' },
        },
        {
          type: 'funnelarea',
          name: 'App',
          labels: STAGES,
          values: [3100, 2200, 1300, 800, 520],
          textinfo: 'label+percent',
          textfont: { size: 14 },
          domain: { row: 0, column: 1 },
          title: { text: 'App' },
        },
      ],
      layout: {
        grid: { rows: 1, columns: 2 },
        uniformtext: { mode: 'hide', minsize: 8 },
        showlegend: false,
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
