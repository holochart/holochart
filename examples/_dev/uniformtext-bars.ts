import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Uniform text size for bar labels (E4.6): the same two grouped bar traces with inside labels,
 * `layout.uniformtext: { mode: 'hide', minsize: 9 }` on the left and `{ mode: 'show', minsize: 9 }`
 * on the right. Every label is drawn at the smallest size any label shrank to (across both
 * traces); labels that would be smaller than 9 px are hidden (left) or drawn at that size anyway
 * (right).
 */
export const meta: ExampleMeta = {
  title: 'Uniform text: bars (hide vs show)',
  description:
    'layout.uniformtext with mode hide and show on grouped bars with inside labels of very different bar sizes.',
  tags: ['dev', 'chart', 'bar', 'text', 'uniformtext'],
  size: { width: 760, height: 380 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CATEGORIES = ['north', 'east', 'south', 'west', 'central'];

function figure(mode: 'hide' | 'show') {
  return {
    data: [
      {
        type: 'bar',
        name: '2025',
        x: CATEGORIES,
        y: [1200, 310, 45, 870, 2300],
        texttemplate: '%{y:,}',
        textposition: 'inside',
        textfont: { size: 16 },
      },
      {
        type: 'bar',
        name: '2026',
        x: CATEGORIES,
        y: [1450, 280, 20, 990, 2100],
        texttemplate: '%{y:,}',
        textposition: 'inside',
        textfont: { size: 16 },
      },
    ],
    layout: {
      title: { text: `uniformtext.mode: <b>'${mode}'</b>, minsize: 9` },
      uniformtext: { mode, minsize: 9 },
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
