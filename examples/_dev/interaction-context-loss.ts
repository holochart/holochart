import { createChart, type Chart } from '@mk7s/holochart';
import { placed, uvSphere } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * WebGL context loss and restore (plan E2.1, backlog S2.2): four charts that between them hold
 * every kind of GPU resource a chart keeps: buffers and data textures (scatter, heatmap), SDF
 * text, a lit 3D scene with an environment map (a render target, which only exists on the GPU)
 * and shadows, and GPU picking. Charts 0 and 1 own their context; 2 and 3 draw through the shared
 * renderer, which loses one context for both.
 *
 * `window.__contextLoss` exposes the charts and their context events;
 * tests/interaction/context-loss.spec.ts loses and restores the contexts with
 * `WEBGL_lose_context` and compares the frames.
 *
 * Not a visual test: its point is the frame after a restore, compared with the one before.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: context loss',
  description:
    'A 2D chart and a lit 3D scene on their own WebGL contexts and on the shared renderer; context events are logged to window.__contextLoss.',
  tags: ['dev', 'chart', '3d', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 480 },
};

/** What the example exposes to the interaction tests. */
export interface ContextLossHook {
  charts: Chart[];
  events: { chart: number; name: string }[];
}

declare global {
  interface Window {
    __contextLoss?: ContextLossHook;
  }
}

const WIDTH = 320;
const HEIGHT = 240;

function flat(shared: boolean): Parameters<typeof createChart>[1] {
  return {
    data: [
      {
        type: 'heatmap',
        z: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ],
        showscale: false,
      },
      {
        type: 'scatter',
        mode: 'lines+markers+text',
        x: [0, 1, 2],
        y: [2, 0, 1],
        text: ['a', 'b', 'c'],
        textposition: 'top center',
        marker: { size: 12, symbol: 'diamond' },
        hovertemplate: 'x=%{x} y=%{y}<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Flat' },
      margin: { l: 30, r: 10, t: 30, b: 24 },
      showlegend: false,
    },
    config: { displayModeBar: false, sharedRenderer: shared },
  };
}

function lit(shared: boolean): Parameters<typeof createChart>[1] {
  const ball = uvSphere(16, 32);
  return {
    data: [
      {
        type: 'mesh3d',
        ...placed(ball, 0.45, [-0.5, 0, 0]),
        color: '#2ca02c',
        material: { type: 'physical', metalness: 1, roughness: 0.2 },
      },
      {
        type: 'scatter3d',
        mode: 'markers',
        x: [0.5],
        y: [0],
        z: [0],
        marker: { size: 24 },
      },
    ],
    layout: {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      showlegend: false,
      scene: {
        aspectmode: 'data',
        camera: { eye: { x: 0, y: -1.8, z: 1 } },
        lighting: {
          ambient: { intensity: 0.3 },
          directional: [
            { position: { x: -1, y: -2, z: 3 }, space: 'scene', intensity: 0.9, castshadow: true },
          ],
          environment: 'studio',
        },
      },
    },
    config: { displayModeBar: false, sharedRenderer: shared },
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const grid = el.ownerDocument.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(2,${WIDTH}px);`;
  el.appendChild(grid);
  const hook: ContextLossHook = { charts: [], events: [] };
  [flat(false), lit(false), flat(true), lit(true)].forEach((figure, index) => {
    const cell = el.ownerDocument.createElement('div');
    cell.style.cssText = `width:${WIDTH}px;height:${HEIGHT}px;`;
    grid.appendChild(cell);
    const chart = createChart(cell, figure);
    for (const name of ['webglcontextlost', 'webglcontextrestored', 'hover'] as const) {
      chart.on(name, () => void hook.events.push({ chart: index, name }));
    }
    hook.charts.push(chart);
  });
  window.__contextLoss = hook;
  return {
    ready: Promise.all(hook.charts.map((c) => c.ready)).then(() => undefined),
    dispose: () => {
      if (window.__contextLoss === hook) delete window.__contextLoss;
      for (const chart of hook.charts) chart.destroy();
      grid.remove();
    },
  };
}
