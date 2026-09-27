import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Grouped funnels (plan E12.5): `funnelmode: 'group'` puts the traces of a stage side by side,
 * each bar centered on the value axis, with `funnelgap` between stages and `funnelgroupgap`
 * between the bars of a stage. Each trace keeps its own connector regions.
 */
export const meta: ExampleMeta = {
  title: 'Funnel: grouped years',
  description:
    'Two funnel traces side by side per stage with funnelmode group, funnelgap and funnelgroupgap, and a legend.',
  tags: ['funnel', 'financial', 'chart', 'group', 'funnelmode', 'legend'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,% ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const STAGES = ['Applied', 'Screened', 'Interviewed', 'Hired'];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        { type: 'funnel', name: '2024', y: STAGES, x: [480, 300, 120, 40] },
        { type: 'funnel', name: '2025', y: STAGES, x: [620, 350, 160, 55] },
      ],
      layout: {
        title: { text: 'Hiring by year' },
        funnelmode: 'group',
        funnelgap: 0.3,
        funnelgroupgap: 0.1,
        margin: { l: 80 },
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
