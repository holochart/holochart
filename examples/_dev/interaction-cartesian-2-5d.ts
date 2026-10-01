import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 2.5D cartesian traces playground (plan E8.9): four subplots in one tilted, turned view
 * (`view3d`: tilt 25°, rotation -30°), each with an extruded trace —
 *
 * - `xy`: a horizontal funnel, stages A, B, C (y 0…2) of 30, 20, 10 centered on x = 0, depth 30 px;
 * - `x2y2`: a waterfall at x = 0…2: +5, -2 and the total 3, depth 30 px;
 * - `x3y3`: a 3 × 3 heatmap, z = 1…9 row by row from the bottom, as columns 60 px tall at z = 9
 *   (the column at x = i, y = j is `60 · (3j + i + 1) / 9` px tall), `xgap` 4 px;
 * - `x4y4`: an area (`tozeroy`) through (0, 2), (1, 4), (2, 3), (3, 5), (4, 4) with markers, depth
 *   30 px.
 *
 * Every chart event is logged to `window.__interaction.events`;
 * `window.__interaction.toScreen(subplot, x, y, z)` gives the container px where the point at
 * linear coordinates `(x, y)` of `subplot`, raised `z` px toward the viewer, is drawn, which
 * tests/interaction/cartesian-2-5d.spec.ts uses to aim.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: 2.5D funnel, waterfall, heatmap columns and area',
  description:
    'Hover and click extruded funnel stages, waterfall steps, heatmap columns and an area slab in a tilted view; events are logged to window.__interaction.',
  tags: [
    'dev',
    'view3d',
    '2.5d',
    'funnel',
    'waterfall',
    'heatmap',
    'area',
    'interaction',
    'no-visual-test',
  ],
  size: { width: 800, height: 640 },
};

/** What the example exposes to the interaction tests. */
export interface Cartesian25DInteractionHook {
  chart: Chart;
  events: { name: string; payload: unknown }[];
  toScreen(subplot: string, x: number, y: number, z: number): { x: number; y: number };
}

const EVENTS = ['hover', 'unhover', 'click'] as const;

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
      ...(pt['z'] !== undefined ? { z: pt['z'] } : {}),
    })),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'funnel',
        y: ['A', 'B', 'C'],
        x: [30, 20, 10],
        textinfo: 'none',
        depth: 30,
      },
      {
        type: 'waterfall',
        x: [0, 1, 2],
        y: [5, -2, null],
        measure: ['relative', 'relative', 'total'],
        textinfo: 'none',
        depth: 30,
        xaxis: 'x2',
        yaxis: 'y2',
      },
      {
        type: 'heatmap',
        z: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ],
        depth: 60,
        xgap: 4,
        showscale: false,
        xaxis: 'x3',
        yaxis: 'y3',
      },
      {
        type: 'scatter',
        x: [0, 1, 2, 3, 4],
        y: [2, 4, 3, 5, 4],
        fill: 'tozeroy',
        mode: 'lines+markers',
        depth: 30,
        xaxis: 'x4',
        yaxis: 'y4',
      },
    ],
    layout: {
      margin: { l: 50, r: 20, t: 20, b: 40 },
      showlegend: false,
      hovermode: 'closest',
      xaxis: { domain: [0, 0.44], anchor: 'y' },
      yaxis: { domain: [0.58, 1], anchor: 'x' },
      xaxis2: { domain: [0.56, 1], anchor: 'y2', range: [-0.6, 2.6] },
      yaxis2: { domain: [0.58, 1], anchor: 'x2', range: [0, 6] },
      xaxis3: { domain: [0, 0.44], anchor: 'y3' },
      yaxis3: { domain: [0, 0.42], anchor: 'x3' },
      xaxis4: { domain: [0.56, 1], anchor: 'y4', range: [0, 4] },
      yaxis4: { domain: [0, 0.42], anchor: 'x4', range: [0, 6] },
      view3d: { enabled: true, tilt: 25, rotation: -30 },
    },
  });
  const hook: Cartesian25DInteractionHook = {
    chart,
    events: [],
    toScreen(subplot, x, y, z) {
      const sp = chart.subplots.get(subplot);
      const projector = sp?.viewport.projector as
        { project(x: number, y: number, z?: number): [number, number] } | null | undefined;
      if (!sp || !projector) throw new Error(`no tilted ${subplot} subplot`);
      const cx = sp.rect.x + sp.xaxis.scale.l2p(x);
      const cy = sp.rect.y + sp.rect.height - sp.yaxis.scale.l2p(y);
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
