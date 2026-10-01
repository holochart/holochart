import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 2.5D view playground (plan E8.9, E9.10, E20.4): extruded bars (`depth: 40`) at x = 0…4 with
 * heights 2, 5, 3, 6, 4 and a scatter trace at (0.5, 7), (1.5, 1), (2.5, 7.5), (3.5, 1.5) on a
 * tilted, turned plot plane (`view3d`: tilt 25°, rotation -30°). Every chart event is logged to
 * `window.__interaction.events`; `window.__interaction.toScreen(x, y, z)` gives the container px
 * where data point `(x, y)` raised by `z` px toward the viewer is drawn (z = 0: on the plot plane,
 * z = 40: on the bars' front faces), which tests/interaction/view3d.spec.ts uses to aim.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: 2.5D view',
  description:
    'Hover, click, select and turn a tilted view of 3D bars and points; events are logged to window.__interaction.',
  tags: ['dev', 'view3d', '2.5d', 'bar', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 480 },
};

/** What the example exposes to the interaction tests. */
export interface View3DInteractionHook {
  chart: Chart;
  events: { name: string; payload: unknown }[];
  toScreen(x: number, y: number, z: number): { x: number; y: number };
}

const EVENTS = ['hover', 'unhover', 'click', 'relayout', 'selected'] as const;

function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p['points'])) return { ...p, event: undefined };
  return {
    ...p,
    event: undefined,
    points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
      curveNumber: pt['curveNumber'],
      pointNumber: pt['pointNumber'],
      x: pt['x'],
      y: pt['y'],
    })),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'bar', name: 'bars', x: [0, 1, 2, 3, 4], y: [2, 5, 3, 6, 4], depth: 40 },
      {
        type: 'scatter',
        name: 'points',
        mode: 'markers',
        x: [0.5, 1.5, 2.5, 3.5],
        y: [7, 1, 7.5, 1.5],
        marker: { size: 10 },
      },
    ],
    layout: {
      margin: { l: 60, r: 20, t: 20, b: 60 },
      showlegend: false,
      hovermode: 'closest',
      xaxis: { range: [-0.6, 4.6] },
      yaxis: { range: [0, 8] },
      view3d: { enabled: true, tilt: 25, rotation: -30 },
    },
  });
  const hook: View3DInteractionHook = {
    chart,
    events: [],
    toScreen(x, y, z) {
      const sp = chart.subplots.get('xy');
      const projector = sp?.viewport.projector as
        { project(x: number, y: number, z?: number): [number, number] } | null | undefined;
      if (!sp || !projector) throw new Error('no tilted xy subplot');
      const cx = sp.rect.x + sp.xaxis.scale.d2p(x);
      const cy = sp.rect.y + sp.rect.height - sp.yaxis.scale.d2p(y);
      const [sx, sy] = projector.project(cx, cy, z);
      return { x: sx, y: sy };
    },
  };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => hook.events.push({ name, payload: summarize(payload) }));
  }
  (window as unknown as { __interaction?: unknown }).__interaction = hook;
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      const w = window as unknown as { __interaction?: unknown };
      if (w.__interaction === hook) delete w.__interaction;
      chart.destroy();
    },
  };
}
