import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Funnel area labels from a template (plan E12.6): `texttemplate` formats each stage's label from
 * `%{label}`, `%{value}` (with a d3 format) and `%{percent}`, in rich text (`<b>`), with a larger
 * `textfont`; labels shrink to fit their stage.
 */
export const meta: ExampleMeta = {
  title: 'Funnel area: texttemplate',
  description:
    'Stage labels from a texttemplate with bold names, formatted values and percentages, in a larger font.',
  tags: ['funnelarea', 'financial', 'chart', 'text', 'texttemplate', 'rich-text'],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,%() ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'funnelarea',
          labels: ['Leads', 'Qualified', 'Proposal', 'Won'],
          values: [3000, 1800, 900, 300],
          texttemplate: '<b>%{label}</b><br>%{value:,} (%{percent})',
          textfont: { size: 13 },
          title: { text: 'Deals, 2025', position: 'top left' },
        },
      ],
      layout: { showlegend: false },
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
