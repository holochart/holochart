import { createChart, sceneFor } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { MeshInteractionHook } from './interaction-mesh3d.ts';

/**
 * `cone` hover playground (plan E14.5, E20.4): three large cones on the x axis (vectors along x,
 * y and z, norms 1, 2, 3; `sizemode: 'raw'`, `anchor: 'center'`, so each cone's middle is its
 * position) with the default `hoverinfo` in `scene`, and the same cones with `hoverinfo: 'all'`
 * and text in `scene2`, and with a `hovertemplate` in `scene3`. Hover events are logged to
 * `window.__interaction.events`; `window.__interaction.toScreen(trace, x, y, z)` gives the
 * container px of a data point (tests/interaction/cone.spec.ts).
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: cone',
  description:
    'Hover cones with the default hoverinfo, all fields, and a template; events are logged to window.__interaction.',
  tags: ['dev', 'cone', '3d', 'interaction', 'no-visual-test'],
  size: { width: 900, height: 400 },
};

const CONES = {
  x: [0, 2, 4],
  y: [0, 0, 0],
  z: [0, 0, 0],
  u: [1, 0, 0],
  v: [0, 2, 0],
  w: [0, 0, 3],
  sizemode: 'raw',
  sizeref: 0.6,
  anchor: 'center',
  showscale: false,
} as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'cone', name: 'default', ...CONES },
      {
        type: 'cone',
        name: 'all',
        scene: 'scene2',
        ...CONES,
        hoverinfo: 'all',
        text: ['first', 'second', 'third'],
      },
      {
        type: 'cone',
        name: 'template',
        scene: 'scene3',
        ...CONES,
        hovertemplate: '%{u}/%{v}/%{w} |%{norm:.2f}| %{x}<extra></extra>',
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
            z: pt['z'],
            u: pt['u'],
            v: pt['v'],
            w: pt['w'],
            norm: pt['norm'],
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
