import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Uniform text size for pie labels (E4.6): two pies side by side (one chart, so one size across
 * both traces) with inside labels on slices of very different sizes,
 * `layout.uniformtext: { mode: 'hide', minsize: 10 }` on the left chart and `mode: 'show'` on the
 * right one. Without it, each label shrinks on its own to fit its slice.
 */
export const meta: ExampleMeta = {
  title: 'Uniform text: pies (hide vs show)',
  description:
    'layout.uniformtext with mode hide and show on pies with inside labels, negotiated across two pie traces.',
  tags: ['dev', 'chart', 'pie', 'text', 'uniformtext'],
  size: { width: 760, height: 380 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const LABELS = ['Search', 'Direct', 'Social', 'Email', 'Referral', 'Ads', 'Other'];

function figure(mode: 'hide' | 'show') {
  const pie = (values: number[], x: [number, number]) => ({
    type: 'pie',
    labels: LABELS,
    values,
    textinfo: 'label+percent',
    textposition: 'inside',
    textfont: { size: 14 },
    domain: { x, y: [0, 1] },
    sort: false,
  });
  return {
    data: [
      pie([520, 260, 90, 45, 30, 14, 6], [0, 0.48]),
      pie([300, 300, 200, 120, 40, 25, 15], [0.52, 1]),
    ],
    layout: {
      title: { text: `uniformtext.mode: <b>'${mode}'</b>, minsize: 10` },
      uniformtext: { mode, minsize: 10 },
      showlegend: false,
    },
  };
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.display = 'flex';
  const charts: Chart[] = [];
  for (const mode of ['hide', 'show'] as const) {
    const pane = document.createElement('div');
    pane.style.cssText = 'flex: 1 1 0; min-width: 0; height: 100%;';
    el.append(pane);
    charts.push(createChart(pane, figure(mode)));
  }
  return {
    ready: Promise.all(charts.map((c) => c.ready)).then(() => undefined),
    renderer: charts[0]?.three.renderer,
    dispose: () => {
      for (const c of charts) c.destroy();
      el.replaceChildren();
      el.style.display = '';
    },
  };
}
