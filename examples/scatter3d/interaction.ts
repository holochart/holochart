import { createChart, sceneFor, type Chart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `scatter3d` hover, click, spikes, legend and annotations under test (plan E14.1d, E20.4). Every
 * chart event is logged to `window.__interaction.events`, which
 * tests/interaction/scatter3d.spec.ts reads; `window.__interaction.project(trace, i)` gives the
 * container px of a point for the current camera.
 *
 * The geometry is fixed: 640×400 px, 20 px margins, one scene over the plot area with a fixed
 * camera; two traces of big markers (`alpha`: 5 points on a diagonal, `beta`: 3 points), a line
 * and an annotation at `alpha`'s middle point.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: scatter3d',
  description:
    'Hover, click, spikes, legend toggling and annotations of scatter3d; events are logged to window.__interaction.',
  tags: ['scatter3d', '3d', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['hover', 'unhover', 'click', 'clickannotation', 'relayout', 'restyle'] as const;

/** What this example adds to the interaction hook. */
export interface Scatter3dHook extends InteractionHook {
  /** Container px of point `i` of trace `trace` for the current camera. */
  project(trace: number, i: number): { x: number; y: number };
}

function projector(chart: Chart): Scatter3dHook['project'] {
  return (trace, i) => {
    const full = chart.fullData[trace]!;
    const scene = sceneFor(chart.fullLayout!, full)!;
    const [ax, ay, az] = scene.layout.axes;
    const v = (k: 'x' | 'y' | 'z') => (full[k] as ArrayLike<unknown>)[i];
    const w = scene.toWorld(ax.scale.d2l(v('x')), ay.scale.d2l(v('y')), az.scale.d2l(v('z')));
    const s = scene.project(w[0], w[1], w[2]);
    return { x: s.x, y: s.y };
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers',
        name: 'alpha',
        x: [0, 1, 2, 3, 4],
        y: [0, 1, 2, 3, 4],
        z: [0, 1, 2, 3, 4],
        text: ['a0', 'a1', 'a2', 'a3', 'a4'],
        marker: { size: 16 },
      },
      {
        type: 'scatter3d',
        mode: 'markers',
        name: 'beta',
        x: [4, 0, 4],
        y: [0, 4, 4],
        z: [1, 3, 0],
        customdata: ['b0', 'b1', 'b2'],
        hovertemplate: 'beta %{customdata}: %{z:.1f}<extra></extra>',
        marker: { size: 16, symbol: 'square' },
      },
      {
        type: 'scatter3d',
        mode: 'lines',
        name: 'path',
        x: [0, 4],
        y: [4, 0],
        z: [4, 4],
        line: { width: 6 },
        hoverinfo: 'skip',
      },
    ],
    layout: {
      margin: { l: 20, r: 20, t: 20, b: 20 },
      legend: { x: 1, xanchor: 'right', y: 1 },
      scene: {
        camera: { eye: { x: 1.6, y: -1.6, z: 0.9 } },
        annotations: [{ x: 2, y: 2, z: 2, text: 'middle', captureevents: true, ax: 40, ay: -40 }],
      },
    },
    config: { displayModeBar: false },
  });
  const hook: Scatter3dHook = { chart, events: [], project: projector(chart) };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      hook.events.push({
        name,
        payload: JSON.parse(
          JSON.stringify(payload ?? null, (key, value: unknown) =>
            key === 'data' || key === 'fullData' || key === 'event' || key === 'fullAnnotation'
              ? undefined
              : value,
          ),
        ) as unknown,
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
