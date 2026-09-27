import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Funnel areas side by side (plan E12.6): `layout.grid` splits the plot area and each trace picks
 * a cell with `domain.column`. They share a `scalegroup`, so their sizes follow their totals —
 * the smaller year reads as smaller instead of filling its cell — and stage colors are shared by
 * label, so one legend item hides a stage in both.
 */
export const meta: ExampleMeta = {
  title: 'Funnel area: domains and scalegroup',
  description:
    'Two funnel areas in layout.grid cells sized by their totals with a shared scalegroup, stage colors shared by label.',
  tags: ['funnelarea', 'financial', 'chart', 'grid', 'domain', 'scalegroup', 'legend'],
  size: { width: 780, height: 420 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,% ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const STAGES = ['Leads', 'Qualified', 'Proposal', 'Negotiation', 'Won'];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'funnelarea',
          name: '2024',
          labels: STAGES,
          values: [300, 180, 90, 50, 30],
          scalegroup: 'deals',
          domain: { row: 0, column: 0 },
          title: { text: '2024: 650 deals' },
        },
        {
          type: 'funnelarea',
          name: '2025',
          labels: STAGES,
          values: [520, 300, 170, 90, 60],
          scalegroup: 'deals',
          domain: { row: 0, column: 1 },
          title: { text: '2025: 1,140 deals' },
        },
      ],
      layout: { grid: { rows: 1, columns: 2 }, showlegend: true },
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
