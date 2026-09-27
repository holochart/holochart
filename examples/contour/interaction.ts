import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Contour hover playground (plan E11.2): a 5 × 4 grid with uneven x (0, 1, 2, 4, 8) where
 * `z = 10·row + column`, plus a gap at column 2 of row 1 (`connectgaps: false`). Hover snaps to
 * the nearest grid point (cells split halfway between points) and shows its x, y and z; the gap
 * shows an empty z. Chart events are logged to `window.__interaction.events` for the interaction
 * suite (tests/interaction/contour.spec.ts).
 *
 * Not a visual test: its point is the pointer behavior.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: contour hover',
  description:
    'Nearest-grid-point hover on an uneven grid with a gap; events are logged to window.__interaction.',
  tags: ['contour', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

export function run(el: HTMLElement): ExampleHandle {
  const z: (number | null)[][] = [0, 1, 2, 3].map((j) => [0, 1, 2, 3, 4].map((i) => 10 * j + i));
  z[1]![2] = null;
  const chart = createChart(el, {
    data: [
      {
        type: 'contour',
        name: 'grid',
        x: [0, 1, 2, 4, 8],
        y: [0, 1, 2, 3],
        z,
        contours: { coloring: 'lines', showlabels: true },
      },
    ],
    layout: { showlegend: false, margin: { l: 60, r: 100, t: 30, b: 50 } },
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
            z: pt['z'],
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
