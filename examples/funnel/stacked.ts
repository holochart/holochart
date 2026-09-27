import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A stacked funnel (plan E12.5): three traces share the stages, and `funnelmode: 'stack'` (the
 * default) stacks their bars per stage, the whole stack centered on the value axis. Each trace
 * has its own connectors and labels; the legend toggles the regions.
 */
export const meta: ExampleMeta = {
  title: 'Funnel: stacked regions',
  description:
    'Three funnel traces stacked per stage and centered, each with its own connector regions and value labels, with a legend.',
  tags: ['funnel', 'financial', 'chart', 'stack', 'funnelmode', 'legend'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,% ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const STAGES = ['Website visit', 'Downloads', 'Potential customers', 'Requested price'];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        { type: 'funnel', name: 'Montreal', y: STAGES, x: [120, 60, 30, 20], textinfo: 'value' },
        {
          type: 'funnel',
          name: 'Toronto',
          y: STAGES,
          x: [100, 60, 40, 30],
          textinfo: 'value',
        },
        {
          type: 'funnel',
          name: 'Vancouver',
          y: STAGES,
          x: [90, 70, 50, 30],
          textinfo: 'value',
        },
      ],
      layout: {
        title: { text: 'Leads by office' },
        margin: { l: 120 },
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
