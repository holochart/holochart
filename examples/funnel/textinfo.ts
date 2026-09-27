import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Funnel labels and styles (plan E12.5): `textinfo` combines the label, the value and the three
 * percentages (of the first stage, of the previous stage, of the total); with several
 * percentages each says which it is. Left, a horizontal funnel with per-stage colors and outlined,
 * tinted connectors (per-stage colors would default them to translucent black); right, a vertical funnel (`orientation: 'v'`) with labels outside the bars. Each
 * funnel hides its value axis.
 */
export const meta: ExampleMeta = {
  title: 'Funnel: textinfo and styles',
  description:
    'Label, value and percent-of-initial / previous / total labels on a horizontal and a vertical funnel, per-stage colors and outlined connectors.',
  tags: ['funnel', 'financial', 'chart', 'text', 'textinfo', 'vertical', 'style', 'subplots'],
  size: { width: 780, height: 420 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,% ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const STAGES = ['Applied', 'Screened', 'Interviewed', 'Offered', 'Hired'];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'funnel',
          name: 'Engineering',
          y: STAGES,
          x: [480, 300, 190, 120, 90],
          textinfo: 'value+percent previous+percent total',
          textposition: 'inside',
          marker: { color: ['#5e74d5', '#9962c0', '#b8267e', '#ea2a37', '#cc540a'] },
          connector: {
            fillcolor: 'rgba(128, 131, 143, 0.25)',
            line: { color: '#80838f', width: 1, dash: 'dot' },
          },
        },
        {
          type: 'funnel',
          name: 'Sales',
          orientation: 'v',
          x: STAGES,
          y: [320, 190, 70, 26, 20],
          textinfo: 'label+percent initial',
          textposition: 'outside',
          xaxis: 'x2',
          yaxis: 'y2',
          marker: { color: '#128b8b' },
        },
      ],
      layout: {
        grid: { rows: 1, columns: 2, pattern: 'independent' },
        title: { text: 'Hiring funnels' },
        margin: { l: 80 },
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
