import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { exposeChart } from './selections-hook.mts';

/**
 * Selections as layout objects (plan E5.12, Plotly 2.13+): two box selections given in
 * `layout.selections` are drawn as dotted outlines and select the points inside them on load,
 * in both traces (the others fade by `unselected.marker.opacity`). In `select` mode a new box
 * drag replaces them (shift adds one), a click on a selection activates it so it can be moved,
 * dragging its edges resizes it, and a double-click clears them — each change is a `relayout` of
 * `selections` followed by `selected`.
 */
export const meta: ExampleMeta = {
  title: 'Selections: restored box selections',
  description:
    'Two rect selections from layout.selections select points in two scatter traces on load; they can be moved, resized or cleared.',
  tags: ['dev', 'interaction', 'selections', 'select', 'scatter'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(5));
  const cloud = (cx: number, cy: number, n: number, s: number) => {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < n; i++) {
      x.push(Math.round((cx + normal() * s) * 100) / 100);
      y.push(Math.round((cy + normal() * s * 0.8) * 100) / 100);
    }
    return { x, y };
  };
  const a = cloud(3, 4, 120, 1.4);
  const b = cloud(7, 6, 120, 1.2);
  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'markers', name: 'A', ...a, marker: { size: 6 } },
      { type: 'scatter', mode: 'markers', name: 'B', ...b, marker: { size: 6 } },
    ],
    layout: {
      dragmode: 'select',
      xaxis: { range: [-1, 11] },
      yaxis: { range: [0, 10] },
      selections: [
        { type: 'rect', x0: 1, x1: 4, y0: 2, y1: 5.5 },
        { type: 'rect', x0: 6.5, x1: 9, y0: 5.5, y1: 8 },
      ],
    },
  });
  const dispose = exposeChart(chart);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      dispose();
      chart.destroy();
    },
  };
}
