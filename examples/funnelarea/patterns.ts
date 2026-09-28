import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Funnel areas with patterns (plan E12.6, E8.10): `marker.pattern.shape` per stage, as for pies.
 * On the left, the default `fillmode: 'replace'` draws each hatch in its stage color on the paper
 * color (Plotly's funnel area default background); on the right, `'overlay'` keeps the stage
 * colors and hatches over them in a contrasting color. The legend glyphs show the patterns too.
 */
export const meta: ExampleMeta = {
  title: 'Funnel area: patterns',
  description:
    'Two funnel areas hatched with a pattern per stage: replacing the stage fill on the left, overlaying it on the right, with patterned legend glyphs.',
  tags: ['funnelarea', 'financial', 'chart', 'pattern', 'legend'],
  size: { width: 780, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,%: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const STAGES = ['Leads', 'Qualified', 'Proposal', 'Negotiation', 'Won'];
const SHAPES = ['/', '.', 'x', '-', '+'];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'funnelarea',
          name: 'Replace',
          labels: STAGES,
          values: [300, 180, 90, 50, 30],
          textinfo: 'label',
          domain: { row: 0, column: 0 },
          title: { text: "fillmode: 'replace'" },
          marker: { pattern: { shape: SHAPES, solidity: 0.45 } },
        },
        {
          type: 'funnelarea',
          name: 'Overlay',
          labels: STAGES,
          values: [300, 180, 90, 50, 30],
          textinfo: 'value',
          domain: { row: 0, column: 1 },
          title: { text: "fillmode: 'overlay'" },
          marker: { pattern: { shape: SHAPES, fillmode: 'overlay', size: 10 } },
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
