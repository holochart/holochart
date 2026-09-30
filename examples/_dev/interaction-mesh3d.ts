import { createChart, sceneFor } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * `mesh3d` hover playground (plan E14.4, E20.4): a pyramid with per-vertex intensity, text and the
 * hover contour (`contour.show`) in `scene`, and one with per-triangle intensity
 * (`intensitymode: 'cell'`) in `scene2`. Hover events are logged to `window.__interaction.events`;
 * `window.__interaction.toScreen(trace, x, y, z)` gives the container px of a data point, which
 * tests/interaction/mesh3d.spec.ts uses to aim.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: mesh3d',
  description:
    'Hover a mesh per vertex (with its hover contour) and per triangle; events are logged to window.__interaction.',
  tags: ['dev', 'mesh3d', '3d', 'interaction', 'no-visual-test'],
  size: { width: 800, height: 400 },
};

/** A square pyramid: apex 4 over the square 0–3. */
const PYRAMID = {
  x: [0, 4, 4, 0, 2],
  y: [0, 0, 4, 4, 2],
  z: [0, 0, 0, 0, 3],
  i: [0, 1, 2, 3, 0],
  j: [1, 2, 3, 0, 1],
  k: [4, 4, 4, 4, 2],
};

export interface MeshInteractionHook extends InteractionHook {
  toScreen(trace: number, x: number, y: number, z: number): { x: number; y: number };
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'mesh3d',
        name: 'vertex',
        ...PYRAMID,
        intensity: [0, 1, 2, 3, 10],
        text: ['a', 'b', 'c', 'd', 'apex'],
        contour: { show: true, color: '#fff', width: 3 },
      },
      {
        type: 'mesh3d',
        name: 'cell',
        scene: 'scene2',
        ...PYRAMID,
        intensity: [1, 2, 3, 4, 5],
        intensitymode: 'cell',
        text: ['t0', 't1', 't2', 't3', 't4'],
        hovertemplate: 'cell %{pointNumber}: %{intensity}<extra></extra>',
        showscale: false,
      },
    ],
    layout: {
      margin: { l: 20, r: 20, t: 20, b: 20 },
      showlegend: false,
      scene: { domain: { x: [0, 0.5] } },
      scene2: { domain: { x: [0.5, 1] } },
    },
  });
  const hook: MeshInteractionHook = {
    chart,
    events: [],
    toScreen(trace, x, y, z) {
      const scene = sceneFor(chart.fullLayout!, chart.fullData[trace]!);
      if (!scene) throw new Error('no scene');
      const w = scene.toWorld(x, y, z);
      const s = scene.project(w[0], w[1], w[2]);
      return { x: s.x, y: s.y };
    },
  };
  for (const name of ['hover', 'unhover'] as const) {
    chart.on(name, (payload: unknown) => {
      const p = (payload ?? {}) as { points?: Record<string, unknown>[] };
      hook.events.push({
        name,
        payload: {
          points: (p.points ?? []).map((pt) => ({
            curveNumber: pt['curveNumber'],
            pointNumber: pt['pointNumber'],
            x: pt['x'],
            y: pt['y'],
            z: pt['z'],
            intensity: pt['intensity'],
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
