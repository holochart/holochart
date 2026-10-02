import { createChart, sceneFor, type VolumeTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { MeshInteractionHook } from './interaction-mesh3d.ts';

/**
 * `volume` hover playground (plan E14.7, E20.4): an opaque ball — the distance from the origin on
 * an 11³ grid over [-1, 1]³ (spacing 0.2), drawn up to 0.45 — seen along -x (the camera on the x
 * axis), ray-marched in `scene` (hover by a CPU ray cast: the first sample where the ray's opacity
 * builds up) and as stacked isosurfaces in `scene2` (hover by GPU picking). Both snap to the grid
 * point nearest to where the pointer's ray meets the ball: (0.4, 0, 0) at the ball's center on
 * screen. Hover events are logged to `window.__interaction.events`;
 * `window.__interaction.toScreen(trace, x, y, z)` gives the container px of a data point
 * (tests/interaction/volume.spec.ts).
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: volume',
  description:
    'Hover a ray-marched and a stacked volume: the nearest grid point where the ray meets the ball; events are logged to window.__interaction.',
  tags: ['dev', 'volume', '3d', 'interaction', 'no-visual-test'],
  size: { width: 800, height: 400 },
};

function ball() {
  const out = { x: [] as number[], y: [] as number[], z: [] as number[], value: [] as number[] };
  const a = Array.from({ length: 11 }, (_, i) => Math.round((i / 5 - 1) * 10) / 10);
  for (const z of a) {
    for (const y of a) {
      for (const x of a) {
        out.x.push(x);
        out.y.push(y);
        out.z.push(z);
        out.value.push(Math.round(Math.hypot(x, y, z) * 1e6) / 1e6);
      }
    }
  }
  return out;
}

export function run(el: HTMLElement): ExampleHandle {
  const trace: VolumeTrace = {
    type: 'volume',
    ...ball(),
    isomin: 0,
    isomax: 0.45,
    showscale: false,
  };
  const camera = { eye: { x: 2, y: 0, z: 0 } };
  const chart = createChart(el, {
    data: [
      { ...trace, name: 'raymarch', render: 'raymarch' as const, opacity: 1 },
      { ...trace, name: 'isosurfaces', scene: 'scene2' as const, opacity: 0.5 },
    ],
    layout: {
      margin: { l: 20, r: 20, t: 20, b: 20 },
      showlegend: false,
      scene: { domain: { x: [0, 0.5] }, camera },
      scene2: { domain: { x: [0.5, 1] }, camera },
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
            value: pt['value'],
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
