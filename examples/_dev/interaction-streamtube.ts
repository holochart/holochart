import { createChart, sceneFor } from '@mk7s/holochart';
import { gridField, linspace } from '../_lib/streamtube-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { MeshInteractionHook } from './interaction-mesh3d.ts';

/**
 * `streamtube` hover playground (plan E14.6, E20.4): one straight tube along x through the field
 * `(u, v, w) = (1 + x / 2, 0, 0)` on [0, 4] × [−1, 1]², started at the origin — its norm grows
 * with x, its divergence (gl-streamtube3d's `|Σⱼ ∂V/∂Xⱼ|`) is 0.5 everywhere — with the default
 * `hoverinfo` in `scene`, with `hoverinfo: 'all'` and text in `scene2`, and with a
 * `hovertemplate` in `scene3`. Hover events are logged to `window.__interaction.events`;
 * `window.__interaction.toScreen(trace, x, y, z)` gives the container px of a data point
 * (tests/interaction/streamtube.spec.ts).
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: streamtube',
  description:
    'Hover a stream tube with the default hoverinfo, all fields, and a template; events are logged to window.__interaction.',
  tags: ['dev', 'streamtube', '3d', 'interaction', 'no-visual-test'],
  size: { width: 900, height: 400 },
};

const TUBE = {
  ...gridField(linspace(5, 0, 4), linspace(3, -1, 1), linspace(3, -1, 1), (x) => [1 + x / 2, 0, 0]),
  starts: { x: [0], y: [0], z: [0] },
  sizeref: 0.15,
  showscale: false,
} as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'streamtube', name: 'default', ...TUBE },
      { type: 'streamtube', name: 'all', scene: 'scene2', ...TUBE, hoverinfo: 'all', text: 'flow' },
      {
        type: 'streamtube',
        name: 'template',
        scene: 'scene3',
        ...TUBE,
        hovertemplate: '%{tubeu:.2f}|%{norm:.2f}|%{divergence:.2f}<extra></extra>',
      },
    ],
    layout: {
      margin: { l: 20, r: 20, t: 20, b: 20 },
      showlegend: false,
      scene: { domain: { x: [0, 0.33] } },
      scene2: { domain: { x: [0.33, 0.67] } },
      scene3: { domain: { x: [0.67, 1] } },
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
            tubex: pt['tubex'],
            tubey: pt['tubey'],
            tubez: pt['tubez'],
            tubeu: pt['tubeu'],
            tubev: pt['tubev'],
            tubew: pt['tubew'],
            norm: pt['norm'],
            divergence: pt['divergence'],
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
