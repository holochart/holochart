import { createChart, sceneFor } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { MeshInteractionHook } from './interaction-mesh3d.ts';

/**
 * `bar3d` and tube-line hover playground (plan E14.9, E14.10, E20.4), four cube scenes in a 2 × 2
 * grid. `scene`: three bars on
 * categorical axes (x `a`, `b`, `c`; y `p`), the middle one on a `base` of 2, default `hoverinfo`.
 * `scene2`: two traces stacked with `stackgroup` at the same three positions, `hoverinfo: 'all'`
 * and text. `scene3`: the same bars with a `hovertemplate` reading `%{base}` and `%{top}`.
 * `scene4`: a `scatter3d` line drawn as a tube (`line.render: 'tube'`) through (0, 0, 0),
 * (1, 0, 0), (2, 0, 0). Hover events are logged to `window.__interaction.events`;
 * `window.__interaction.toScreen(trace, x, y, z)` gives the container px of a linear position
 * (category index for categories), which tests/interaction/bar3d.spec.ts uses to aim.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: bar3d and tubes',
  description:
    'Hover 3D bars (base, stacks, templates) and a tube line; events are logged to window.__interaction.',
  tags: ['dev', 'bar3d', 'scatter3d', '3d', 'interaction', 'no-visual-test'],
  size: { width: 800, height: 640 },
};

const BARS = { x: ['a', 'b', 'c'], y: ['p', 'p', 'p'], z: [3, 4, 5], showlegend: false } as const;
const SCENE = { camera: { eye: { x: 0.3, y: -2.2, z: 0.7 } }, aspectmode: 'cube' } as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'bar3d', name: 'bars', ...BARS, base: [0, 2, 0] },
      {
        type: 'bar3d',
        name: 'lower',
        scene: 'scene2',
        ...BARS,
        stackgroup: 's',
        hoverinfo: 'all',
        text: ['one', 'two', 'three'],
      },
      {
        type: 'bar3d',
        name: 'upper',
        scene: 'scene2',
        ...BARS,
        z: [1, 2, 3],
        stackgroup: 's',
        hoverinfo: 'all',
      },
      {
        type: 'bar3d',
        name: 'template',
        scene: 'scene3',
        ...BARS,
        base: 1,
        hovertemplate: '%{x}/%{y}: %{z} from %{base} to %{top}<extra></extra>',
      },
      {
        type: 'scatter3d',
        name: 'tube',
        scene: 'scene4',
        mode: 'lines',
        x: [0, 1, 2],
        y: [0, 0, 0],
        z: [0, 0, 0],
        line: { render: 'tube', radius: 0.04 },
        showlegend: false,
      },
    ],
    layout: {
      margin: { l: 10, r: 10, t: 10, b: 10 },
      showlegend: false,
      scene: { domain: { x: [0, 0.5], y: [0.5, 1] }, ...SCENE },
      scene2: { domain: { x: [0.5, 1], y: [0.5, 1] }, ...SCENE },
      scene3: { domain: { x: [0, 0.5], y: [0, 0.5] }, ...SCENE },
      scene4: { domain: { x: [0.5, 1], y: [0, 0.5] }, ...SCENE },
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
            base: pt['base'],
            top: pt['top'],
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
