import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A basic funnel area (plan E12.6): the stages of a process as trapezoids stacked into a triangle,
 * each with an area proportional to its value — pie's data (`labels`, `values`) in a funnel shape.
 * Labels show the stage and its value; the legend lists the stages (a click hides one and the
 * others fill the funnel), and the title sits above it.
 */
export const meta: ExampleMeta = {
  title: 'Funnel area: basic',
  description:
    'Five stages as stacked trapezoids with areas proportional to their values, labeled with stage and value, with a per-stage legend and a title.',
  tags: ['funnelarea', 'financial', 'chart', 'text', 'legend', 'basic'],
  size: { width: 640, height: 420 },
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
          type: 'funnelarea',
          labels: ['Awareness', 'Interest', 'Consideration', 'Intent', 'Purchase'],
          values: [520, 310, 180, 95, 40],
          textinfo: 'label+value',
          title: { text: 'Customer journey, 2025' },
        },
      ],
      layout: { showlegend: true },
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
