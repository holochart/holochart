import { createChart, sceneFor, type Chart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Surface hover and highlight lines for tests/interaction/surface.spec.ts (plan E14.3, E20.4):
 * hovering snaps to the nearest grid point, labels its `x`, `y` and `z` (the second trace through
 * a `hovertemplate` with `%{surfacecolor}`, in a second scene), and draws the highlight lines of that point in pure
 * green (`contours.*.highlightcolor`), which follow the pointer and go when it leaves. Chart
 * events are logged to `window.__interaction.events`; `window.__interaction.project(trace, i, j)`
 * gives the container px of grid point `(i, j)`.
 */
export const meta: ExampleMeta = {
  title: 'Surface: hover and highlight lines',
  description:
    'Hover snapping to grid points and highlight contour lines following the pointer; events are logged to window.__interaction.',
  tags: ['surface', '3d', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['hover', 'unhover', 'click'] as const;

/** What this example adds to the interaction hook. */
export interface SurfaceHook extends InteractionHook {
  /** Container px of grid point `(i, j)` (column, row) of trace `trace`. */
  project(trace: number, i: number, j: number): { x: number; y: number };
}

function projector(chart: Chart): SurfaceHook['project'] {
  return (trace, i, j) => {
    const full = chart.fullData[trace]!;
    const scene = sceneFor(chart.fullLayout!, full)!;
    const [ax, ay, az] = scene.layout.axes;
    const x = (full['x'] as number[])[i]!;
    const y = (full['y'] as number[])[j]!;
    const z = (full['z'] as number[][])[j]![i]!;
    const w = scene.toWorld(ax.scale.d2l(x), ay.scale.d2l(y), az.scale.d2l(z));
    const s = scene.project(w[0], w[1], w[2]);
    return { x: s.x, y: s.y };
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const n = 21;
  const x = Array.from({ length: n }, (_, i) => i);
  const y = Array.from({ length: n }, (_, j) => j);
  const green = {
    highlight: true,
    highlightcolor: '#00ff00',
    highlightwidth: 3,
  };
  const camera = { eye: { x: 0.9, y: -1.8, z: 1.2 } };
  const chart = createChart(el, {
    data: [
      {
        type: 'surface',
        name: 'plane',
        x,
        y,
        // A tilted plane: highlight lines through different points never meet near each other.
        z: y.map((yv) => x.map((xv) => (xv + 2 * yv) / 5)),
        colorscale: 'Greys',
        showscale: false,
        contours: { x: green, y: green, z: green },
      },
      {
        type: 'surface',
        name: 'colored',
        scene: 'scene2',
        x,
        y,
        z: y.map((yv) => x.map((xv) => (xv - yv) / 5)),
        surfacecolor: y.map((yv) => x.map((xv) => xv * 10 + yv)),
        colorscale: 'Greys',
        showscale: false,
        hovertemplate: 'c=%{surfacecolor} at %{x}, %{y}<extra></extra>',
        contours: { x: { highlight: false }, y: { highlight: false }, z: { highlight: false } },
      },
    ],
    layout: {
      margin: { l: 20, r: 20, t: 20, b: 20 },
      showlegend: false,
      scene: { domain: { x: [0, 0.5] }, camera },
      scene2: { domain: { x: [0.5, 1] }, camera },
    },
    config: { displayModeBar: false },
  });
  const hook: SurfaceHook = { chart, events: [], project: projector(chart) };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      hook.events.push({
        name,
        payload: JSON.parse(
          JSON.stringify(payload ?? null, (key, value: unknown) =>
            key === 'data' || key === 'fullData' || key === 'event' ? undefined : value,
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
