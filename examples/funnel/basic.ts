import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A basic funnel (plan E12.5): the stages of a sales process as bars centered on the value axis,
 * first stage on top. Funnels are horizontal by default, their stage axis is reversed and their
 * value axis hidden (Plotly). Labels show the value and the share of the first stage, and the
 * connector regions between stages take the bar color at half opacity.
 */
export const meta: ExampleMeta = {
  title: 'Funnel: basic',
  description:
    'Six stages of a sales funnel, centered bars with value and percent-of-initial labels and connector regions between stages.',
  tags: ['funnel', 'financial', 'chart', 'text', 'basic'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,% ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'funnel',
          name: 'Pipeline',
          y: [
            'Website visit',
            'Downloads',
            'Potential customers',
            'Requested price',
            'Invoice sent',
            'Closed deals',
          ],
          x: [39, 27.4, 20.6, 11, 2, 1.2],
          textinfo: 'value+percent initial',
        },
      ],
      layout: {
        title: { text: 'Sales funnel, thousands' },
        margin: { l: 120 },
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
