import { createChart, sceneFor, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 40 charts on one page (plan E2.16, ADR-023): more than a browser keeps WebGL contexts for. The
 * first four charts get a context each; the rest draw through one shared renderer. Every tenth
 * chart is a 3D scene, the others are the same scatter, so a chart with its own context and one on
 * the shared renderer can be compared pixel for pixel.
 *
 * `window.__dashboard` exposes the charts, their hover/click events, and the indices of charts
 * that lost their WebGL context (none, if the budget holds); tests/interaction/dashboard.spec.ts
 * reads it.
 *
 * Not a visual test: its point is the context count and pointer behavior.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: 40-chart dashboard',
  description:
    '40 charts on one page, drawing and hovering through four dedicated WebGL contexts and one shared renderer; events are logged to window.__dashboard.',
  tags: ['dev', 'chart', 'dashboard', 'interaction', 'no-visual-test'],
  size: { width: 1200, height: 750 },
};

export const COUNT = 40;
const COLUMNS = 8;
const CELL = 150;

/** What the example exposes to the interaction tests. */
export interface DashboardHook {
  charts: Chart[];
  events: { chart: number; name: string; points: { pointNumber: number }[] }[];
  /** Charts that got `webglcontextlost`. */
  lost: number[];
  /** Page px of point `i` of trace 0 of chart `chart`. */
  point(chart: number, i: number): { x: number; y: number };
}

declare global {
  interface Window {
    __dashboard?: DashboardHook;
  }
}

const is3d = (index: number): boolean => index % 10 === 9;

function figure(index: number): Parameters<typeof createChart>[1] {
  const margin = { l: 24, r: 8, t: 8, b: 20 };
  if (is3d(index)) {
    return {
      data: [
        {
          type: 'scatter3d',
          mode: 'markers',
          x: [0, 1, 2, 0, 2],
          y: [0, 1, 2, 2, 0],
          z: [0, 1, 2, 0, 2],
          marker: { size: 12 },
        },
      ],
      layout: { margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false },
      config: { displayModeBar: false },
    };
  }
  return {
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        x: [0, 1, 2, 3, 4],
        y: [1, 3, 2, 4, 0],
        marker: { size: 9 },
        hovertemplate: 'x=%{x} y=%{y}<extra></extra>',
      },
    ],
    layout: {
      margin,
      showlegend: false,
      xaxis: { range: [-0.5, 4.5] },
      yaxis: { range: [-0.5, 4.5] },
    },
    config: { displayModeBar: false },
  };
}

function locate(chart: Chart, i: number): { x: number; y: number } {
  const box = chart.three.root.canvas.getBoundingClientRect();
  const full = chart.fullData[0]!;
  const v = (k: 'x' | 'y' | 'z'): unknown => (full[k] as ArrayLike<unknown>)[i];
  const scene = sceneFor(chart.fullLayout!, full);
  if (scene) {
    const [ax, ay, az] = scene.layout.axes;
    const w = scene.toWorld(ax.scale.d2l(v('x')), ay.scale.d2l(v('y')), az.scale.d2l(v('z')));
    const s = scene.project(w[0], w[1], w[2]);
    return { x: box.left + s.x, y: box.top + s.y };
  }
  const sp = chart.subplots.get('xy')!;
  return {
    x: box.left + sp.rect.x + sp.xaxis.scale.d2p(v('x')),
    y: box.top + sp.rect.y + sp.rect.height - sp.yaxis.scale.d2p(v('y')),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const grid = el.ownerDocument.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${COLUMNS},${CELL}px);`;
  el.appendChild(grid);
  const hook: DashboardHook = {
    charts: [],
    events: [],
    lost: [],
    point: (chart, i) => locate(hook.charts[chart]!, i),
  };
  for (let index = 0; index < COUNT; index++) {
    const cell = el.ownerDocument.createElement('div');
    cell.style.cssText = `width:${CELL}px;height:${CELL}px;`;
    grid.appendChild(cell);
    const chart = createChart(cell, figure(index));
    for (const name of ['hover', 'unhover', 'click'] as const) {
      chart.on(name, (payload: unknown) => {
        const points = (payload as { points?: { pointNumber: number }[] } | undefined)?.points;
        hook.events.push({
          chart: index,
          name,
          points: (points ?? []).map((p) => ({ pointNumber: p.pointNumber })),
        });
      });
    }
    chart.on('webglcontextlost', () => void hook.lost.push(index));
    hook.charts.push(chart);
  }
  window.__dashboard = hook;
  return {
    ready: Promise.all(hook.charts.map((c) => c.ready)).then(() => undefined),
    dispose: () => {
      if (window.__dashboard === hook) delete window.__dashboard;
      for (const chart of hook.charts) chart.destroy();
      grid.remove();
    },
  };
}
