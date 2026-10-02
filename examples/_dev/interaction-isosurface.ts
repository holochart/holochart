import { createChart, sceneFor, type IsosurfaceTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { MeshInteractionHook } from './interaction-mesh3d.ts';

/**
 * `isosurface` hover playground (plan E14.8, E20.4): the field `value = z` on a 5³ grid (0–4 on
 * every axis) with one isosurface at 2 — the plane z = 2 — and no caps, with per-point `text` in
 * `scene`, and the same with a `hovertemplate` in `scene2`. Hover snaps to the nearest grid point
 * and shows its `x`, `y`, `z` and `value`. Hover events are logged to `window.__interaction.events`;
 * `window.__interaction.toScreen(trace, x, y, z)` gives the container px of a data point
 * (tests/interaction/isosurface.spec.ts).
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: isosurface',
  description:
    'Hover an isosurface: the nearest grid point with its value, with text and a template; events are logged to window.__interaction.',
  tags: ['dev', 'isosurface', '3d', 'interaction', 'no-visual-test'],
  size: { width: 800, height: 400 },
};

/** The 5³ grid (x fastest) with `value = z` and a text per point. */
function grid() {
  const out = {
    x: [] as number[],
    y: [] as number[],
    z: [] as number[],
    value: [] as number[],
    text: [] as string[],
  };
  for (let z = 0; z < 5; z++) {
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        out.x.push(x);
        out.y.push(y);
        out.z.push(z);
        out.value.push(z);
        out.text.push(`p${x}${y}${z}`);
      }
    }
  }
  return out;
}

export function run(el: HTMLElement): ExampleHandle {
  const g = grid();
  const off = { show: false };
  const plane: IsosurfaceTrace = {
    type: 'isosurface',
    ...g,
    isomin: 2,
    isomax: 2,
    surface: { count: 1 },
    caps: { x: off, y: off, z: off },
    showscale: false,
  };
  const camera = { eye: { x: 0.4, y: -1.3, z: 1.6 } };
  const chart = createChart(el, {
    data: [
      { ...plane, name: 'plane' },
      {
        ...plane,
        name: 'template',
        scene: 'scene2' as const,
        hovertemplate: 'v=%{value} at %{x},%{y},%{z}<extra></extra>',
      },
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
