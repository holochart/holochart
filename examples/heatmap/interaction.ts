import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Heatmap and image hover playground (plan E11.1, E11.3): a 3 × 2 heatmap on category x (left,
 * with 2D `text` and `customdata`, a gap and `hoverongaps: false`) and a 2 × 2 RGB image (right,
 * with a `hovertemplate` reading pixel components). Chart events are logged to
 * `window.__interaction.events` for the interaction suite (tests/interaction/heatmap.spec.ts).
 *
 * Not a visual test: its point is the pointer behavior.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: heatmap and image hover',
  description:
    'Cell hover with 2D text, gaps and pixel hover with a template; events are logged to window.__interaction.',
  tags: ['heatmap', 'image', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'heatmap',
        name: 'grid',
        x: ['a', 'b', 'c'],
        y: [0, 1],
        z: [
          [1, 2, null],
          [4, 5, 6],
        ],
        text: [
          ['t00', 't01', 't02'],
          ['t10', 't11', 't12'],
        ],
        customdata: [
          ['c00', 'c01', 'c02'],
          ['c10', 'c11', 'c12'],
        ],
        hoverongaps: false,
        showscale: false,
      },
      {
        type: 'image',
        name: 'pixels',
        z: [
          [
            [255, 0, 0],
            [0, 255, 0],
          ],
          [
            [0, 0, 255],
            [255, 255, 255],
          ],
        ],
        xaxis: 'x2',
        yaxis: 'y2',
        hovertemplate: 'px %{x},%{y}: %{z[0]}/%{z[1]}/%{z[2]}<extra>%{colormodel}</extra>',
      },
    ],
    layout: { grid: { rows: 1, columns: 2, pattern: 'independent' }, showlegend: false },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of ['hover', 'unhover', 'click'] as const) {
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
            z: pt['z'],
            text: pt['text'],
            customdata: pt['customdata'],
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
