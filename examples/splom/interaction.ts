import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Scatter plot matrix interaction playground (plan E10.9, E6.1, E6.3): three dimensions of six
 * fixed samples, `dragmode: 'select'`. Box-selecting in one cell highlights the same samples in
 * every cell; hover labels name both dimensions of the hovered cell. Chart events are logged to
 * `window.__interaction.events` for the interaction suite (tests/interaction/splom.spec.ts).
 *
 * Not a visual test: its point is the pointer behavior.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: scatter plot matrix',
  description:
    'Linked selection across cells and per-cell hover; events are logged to window.__interaction.',
  tags: ['splom', 'interaction', 'no-visual-test'],
  size: { width: 600, height: 600 },
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'splom',
        name: 'samples',
        dimensions: [
          { label: 'alpha', values: [1, 2, 3, 4, 5, 6] },
          { label: 'beta', values: [6, 4, 5, 2, 3, 1] },
          { label: 'gamma', values: [10, 20, 10, 20, 10, 20] },
        ],
        marker: { size: 10, color: '#5e74d5' },
      },
    ],
    layout: {
      dragmode: 'select',
      showlegend: false,
      xaxis: { range: [0, 7] },
      xaxis2: { range: [0, 7] },
      xaxis3: { range: [5, 25] },
      yaxis: { range: [0, 7] },
      yaxis2: { range: [0, 7] },
      yaxis3: { range: [5, 25] },
    },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of ['hover', 'unhover', 'selected', 'deselect'] as const) {
    chart.on(name, (payload: unknown) => {
      const p = payload as { points?: Record<string, unknown>[] } | undefined;
      hook.events.push({
        name,
        payload: {
          points: (p?.points ?? []).map((pt) => ({
            curveNumber: pt['curveNumber'],
            pointNumber: pt['pointNumber'],
            x: pt['x'],
            y: pt['y'],
          })),
        },
      });
    });
  }
  chart.on('relayout', (payload: unknown) => hook.events.push({ name: 'relayout', payload }));
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
