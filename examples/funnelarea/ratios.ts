import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Funnel area shapes (plan E12.6): `aspectratio` sets the height relative to the width and
 * `baseratio` the width of the narrow end relative to the wide one. The same data three times:
 * a flat, wide funnel with a narrow tip, the default shape, and a tall funnel with a wide base.
 * The stage areas stay proportional to the values in every shape.
 */
export const meta: ExampleMeta = {
  title: 'Funnel area: aspect and base ratios',
  description:
    'The same stages as three funnel areas with different aspectratio and baseratio, from a flat pointed funnel to a tall wide-based one.',
  tags: ['funnelarea', 'financial', 'chart', 'aspectratio', 'baseratio', 'domain'],
  size: { width: 780, height: 380 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,%=: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const STAGES = ['Seen', 'Clicked', 'Signed up', 'Paid'];
const VALUES = [60, 25, 10, 5];

const SHAPES = [
  { aspectratio: 0.5, baseratio: 0.05, x: [0, 0.3] },
  { aspectratio: 1, baseratio: 0.333, x: [0.35, 0.65] },
  { aspectratio: 1.6, baseratio: 0.7, x: [0.7, 1] },
] as const;

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: SHAPES.map((s) => ({
        type: 'funnelarea',
        labels: STAGES,
        values: VALUES,
        aspectratio: s.aspectratio,
        baseratio: s.baseratio,
        domain: { x: [...s.x], y: [0, 1] },
        textinfo: 'percent',
        title: { text: `aspect ${s.aspectratio}, base ${s.baseratio}` },
        showlegend: false,
      })),
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
