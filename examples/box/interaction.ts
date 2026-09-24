import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Box and violin hover playground (plan E10.4, E10.5): a box with fixed samples (statistics
 * 1…9 plus an outlier at 30) and a violin, both at category positions. Hovering a box shows one
 * label per statistic (Plotly's multi-label box hover); hovering the outlier shows that point.
 * Chart events are logged to `window.__interaction.events` for the interaction suite
 * (tests/interaction/box.spec.ts).
 *
 * Not a visual test: its point is the pointer behavior.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: box and violin hover',
  description:
    'Multi-label box statistics, point hover and violin density hover; events are logged to window.__interaction.',
  tags: ['box', 'violin', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'box', name: 'box', y: [1, 2, 3, 4, 5, 6, 7, 8, 9, 30] },
      {
        type: 'violin',
        name: 'violin',
        y: [2, 3, 3.5, 4, 4.2, 5, 5.5, 6, 7, 9],
        points: false,
      },
    ],
    layout: { yaxis: { range: [-5, 35] }, showlegend: false },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of ['hover', 'unhover'] as const) {
    chart.on(name, (payload: unknown) => {
      const p = payload as { points?: Record<string, unknown>[] };
      hook.events.push({
        name,
        payload: {
          points: (p.points ?? []).map((pt) => ({
            curveNumber: pt['curveNumber'],
            pointNumber: pt['pointNumber'],
            x: pt['x'],
            y: pt['y'],
          })),
        },
      });
    });
  }
  window.__interaction = hook;
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      chart.destroy();
    },
  };
}
