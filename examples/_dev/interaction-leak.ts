import {
  componentsReady,
  createChart,
  purge,
  registry,
  type Chart,
  type Figure,
} from '@mk7s/holochart';
import { BufferGeometry, Material, Object3D, Texture, WebGLRenderTarget } from 'three';
import { STORE } from '../_lib/hierarchy.ts';
import { placed, uvSphere } from '../_lib/mesh3d-data.ts';
import { tornado } from '../_lib/streamtube-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { cubeGrid, sinc3 } from '../_lib/volume-data.ts';

/**
 * Leak test page (backlog S2.6, plan E20.6): one figure per chart family, each in two variants, so
 * tests/interaction/leak.spec.ts can create a chart, update it and destroy it over and over and
 * check that what it took (GPU resources, WebGL contexts, DOM nodes, listeners, observers, heap)
 * comes back. Between them the families use every built-in trace type and the components that
 * add DOM or listeners (legend, colorbar, modebar, annotations, shapes, range slider, sliders,
 * update menus, hover labels).
 *
 * `window.__leak` exposes the family names and `cycle()`, which does one create → update →
 * destroy round. With `anchor()` a small chart stays alive on the shared renderer, so the shared
 * context outlives the cycled charts and its resource counts can be compared.
 *
 * Not a visual test: nothing stays on screen.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: leak cycles',
  description:
    'One figure per chart family, created, updated and destroyed in a loop by the leak test; window.__leak runs the cycles.',
  tags: ['dev', 'chart', '3d', 'interaction', 'no-visual-test'],
  size: { width: 480, height: 360 },
};

const WIDTH = 360;
const HEIGHT = 260;

/** A family's figure; `v` is 0 for the first draw and 1 for the update. */
type Family = (v: 0 | 1) => Figure;

const seq = (n: number, f: (i: number) => number): number[] =>
  Array.from({ length: n }, (_, i) => f(i));
const grid = (rows: number, cols: number, f: (r: number, c: number) => number): number[][] =>
  Array.from({ length: rows }, (_, r) => seq(cols, (c) => f(r, c)));
const wave = (i: number, v: number): number => Math.sin(i * 0.7 + v) * 3 + 5;

const SMALL_MARGIN = { l: 36, r: 12, t: 30, b: 28 };

const FAMILIES: Record<string, Family> = {
  // Scatter and bar with text, fills, error bars, a colorscale and the layout components.
  cartesian: (v) => ({
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers+text',
        name: 'line',
        x: seq(12 + 6 * v, (i) => i),
        y: seq(12 + 6 * v, (i) => wave(i, v)),
        text: seq(12 + 6 * v, (i) => i).map(String),
        textposition: 'top center',
        fill: 'tozeroy',
        error_y: { type: 'constant', value: 0.4 },
        marker: {
          size: 8,
          symbol: v ? 'diamond' : 'circle',
          color: seq(12 + 6 * v, (i) => i),
          colorscale: 'Viridis',
          showscale: true,
        },
        line: { dash: v ? 'dash' : 'solid' },
      },
      {
        type: 'bar',
        name: 'bars',
        x: seq(8, (i) => i),
        y: seq(8, (i) => 1 + ((i * 3 + v) % 5)),
        text: seq(8, (i) => i).map((i) => `b${i}`),
        textposition: 'auto',
      },
    ],
    layout: {
      title: { text: `Cartesian <b>${v}</b>` },
      margin: SMALL_MARGIN,
      showlegend: true,
      xaxis: { title: { text: 'x' }, rangeslider: {} },
      annotations: [{ x: 3, y: 6, text: 'note', showarrow: true }],
      shapes: [{ type: 'rect', x0: 1, x1: 2 + v, y0: 1, y1: 3, fillcolor: 'rgba(200,0,0,0.2)' }],
    },
  }),
  // Sliders, update menus and the modebar: DOM controls with their own listeners.
  controls: (v) => ({
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x: [1, 2, 3, 4],
        y: [2, 1 + v, 3, 2],
        marker: { size: 6 },
      },
    ],
    layout: {
      margin: SMALL_MARGIN,
      sliders: [
        {
          currentvalue: { prefix: 'Size: ' },
          steps: seq(4 + v, (i) => i).map((i) => ({
            label: String(4 + 2 * i),
            method: 'restyle',
            args: ['marker.size', 4 + 2 * i],
          })),
        },
      ],
      updatemenus: [
        {
          type: v ? 'buttons' : 'dropdown',
          buttons: [
            { label: 'Markers', method: 'restyle', args: ['mode', 'markers'] },
            { label: 'Lines', method: 'restyle', args: ['mode', 'lines'] },
          ],
        },
      ],
    },
    config: { displayModeBar: true },
  }),
  // Data textures and contour lines, with a colorbar.
  heatmap: (v) => ({
    data: [
      { type: 'heatmap', z: grid(6 + 2 * v, 8, (r, c) => Math.sin(r + v) * Math.cos(c)) },
      {
        type: 'contour',
        z: grid(8, 8 + 2 * v, (r, c) => (r - 4) ** 2 + (c - 4) ** 2),
        xaxis: 'x2',
        yaxis: 'y2',
        showscale: false,
        contours: { showlabels: true },
      },
    ],
    layout: {
      margin: SMALL_MARGIN,
      grid: { rows: 1, columns: 2, pattern: 'independent' },
    },
  }),
  image: (v) => ({
    data: [
      {
        type: 'image',
        z: Array.from({ length: 8 + 4 * v }, (_, r) =>
          Array.from({ length: 12 }, (_, c) => [r * 20, c * 20, 128 + 60 * v]),
        ),
      },
    ],
    layout: { margin: SMALL_MARGIN },
  }),
  polar: (v) => ({
    data: [
      {
        type: 'scatterpolar',
        mode: 'lines+markers',
        r: seq(9 + v, (i) => 1 + (i % 4)),
        theta: seq(9 + v, (i) => i * 40),
        fill: 'toself',
      },
      { type: 'barpolar', r: [3, 2, 4 + v, 1], theta: [0, 90, 180, 270], subplot: 'polar2' },
    ],
    layout: {
      margin: SMALL_MARGIN,
      showlegend: false,
      polar: { domain: { x: [0, 0.46] } },
      polar2: { domain: { x: [0.54, 1] } },
    },
  }),
  pie: (v) => ({
    data: [
      {
        type: 'pie',
        labels: ['a', 'b', 'c', 'd', 'e'].slice(0, 4 + v),
        values: [5, 3, 2, 4, 1].slice(0, 4 + v),
        hole: v ? 0.4 : 0,
        textinfo: 'label+percent',
      },
    ],
    layout: { margin: SMALL_MARGIN, showlegend: true },
  }),
  table: (v) => ({
    data: [
      {
        type: 'table',
        header: { values: ['Region', 'Stores', 'Revenue'] },
        cells: {
          values: [
            ['North', 'South', 'East', 'West'].slice(0, 3 + v),
            [42, 37, 51, 29].slice(0, 3 + v),
            [12.4, 9.8, 15.1, 7.2].slice(0, 3 + v),
          ],
        },
      },
    ],
    layout: { margin: SMALL_MARGIN },
  }),
  // Distribution traces on one pair of axes and a histogram on another.
  stats: (v) => ({
    data: [
      { type: 'box', name: 'box', y: seq(40, (i) => wave(i, v)), boxpoints: 'all' },
      {
        type: 'violin',
        name: 'violin',
        y: seq(40, (i) => wave(i * 1.3, v)),
        box: { visible: true },
      },
      {
        type: 'histogram',
        name: 'hist',
        x: seq(60 + 20 * v, (i) => wave(i * 0.37, v)),
        xaxis: 'x2',
        yaxis: 'y2',
      },
    ],
    layout: {
      margin: SMALL_MARGIN,
      showlegend: false,
      grid: { rows: 1, columns: 2, pattern: 'independent' },
    },
  }),
  density: (v) => ({
    data: [
      {
        type: 'histogram2d',
        x: seq(200, (i) => wave(i * 0.31, v)),
        y: seq(200, (i) => wave(i * 0.53, 1)),
        showscale: false,
      },
      {
        type: 'histogram2dcontour',
        x: seq(200, (i) => wave(i * 0.31, 0)),
        y: seq(200, (i) => wave(i * 0.53, v)),
        xaxis: 'x2',
        yaxis: 'y2',
        showscale: false,
      },
    ],
    layout: {
      margin: SMALL_MARGIN,
      grid: { rows: 1, columns: 2, pattern: 'independent' },
    },
  }),
  splom: (v) => ({
    data: [
      {
        type: 'splom',
        dimensions: [
          { label: 'a', values: seq(40, (i) => wave(i, 0)) },
          { label: 'b', values: seq(40, (i) => wave(i * 1.7, v)) },
          { label: 'c', values: seq(40, (i) => wave(i * 2.3, 1)) },
        ],
        marker: { size: 4 },
      },
    ],
    layout: { margin: SMALL_MARGIN },
  }),
  parcoords: (v) => ({
    data: [
      {
        type: 'parcoords',
        line: { color: seq(30, (i) => i), colorscale: 'Viridis' },
        dimensions: [
          { label: 'a', values: seq(30, (i) => wave(i, 0)) },
          { label: 'b', values: seq(30, (i) => wave(i * 1.7, v)) },
          { label: 'c', values: seq(30, (i) => wave(i * 2.3, 1)) },
        ],
      },
    ],
    layout: { margin: { l: 40, r: 40, t: 50, b: 24 } },
  }),
  parcats: (v) => ({
    data: [
      {
        type: 'parcats',
        dimensions: [
          {
            label: 'Hair',
            values: ['Black', 'Black', 'Brown', 'Brown', 'Red', v ? 'Red' : 'Brown'],
          },
          { label: 'Eye', values: ['Brown', 'Blue', 'Brown', 'Blue', 'Blue', 'Brown'] },
          { label: 'Sex', values: ['F', 'M', 'F', 'M', 'M', 'F'] },
        ],
      },
    ],
    layout: { margin: { l: 40, r: 40, t: 40, b: 24 } },
  }),
  finance: (v) => {
    const days = seq(12 + 4 * v, (i) => i).map((i) => `2026-03-${String(i + 1).padStart(2, '0')}`);
    const open = days.map((_, i) => 20 + wave(i, v));
    const close = days.map((_, i) => 20 + wave(i + 1, v));
    return {
      data: [
        {
          type: 'candlestick',
          x: days,
          open,
          close,
          high: open.map((o, i) => Math.max(o, close[i]!) + 1),
          low: open.map((o, i) => Math.min(o, close[i]!) - 1),
        },
        {
          type: 'ohlc',
          x: days,
          open,
          close,
          high: open.map((o, i) => Math.max(o, close[i]!) + 1),
          low: open.map((o, i) => Math.min(o, close[i]!) - 1),
          yaxis: 'y2',
        },
      ],
      layout: {
        margin: SMALL_MARGIN,
        showlegend: false,
        yaxis: { domain: [0.55, 1] },
        yaxis2: { domain: [0, 0.45] },
      },
    };
  },
  waterfall: (v) => ({
    data: [
      {
        type: 'waterfall',
        x: ['Sales', 'Costs', 'Tax', 'Net'],
        y: [10, -4 - v, -2, 0],
        measure: ['relative', 'relative', 'relative', 'total'],
        text: ['+10', 'costs', 'tax', 'net'],
      },
      {
        type: 'funnel',
        y: ['Visit', 'Cart', 'Pay'],
        x: [30, 20 - 5 * v, 10],
        xaxis: 'x2',
        yaxis: 'y2',
      },
    ],
    layout: {
      margin: SMALL_MARGIN,
      showlegend: false,
      grid: { rows: 1, columns: 2, pattern: 'independent' },
    },
  }),
  // Domain traces of the finance package.
  indicator: (v) => ({
    data: [
      {
        type: 'indicator',
        mode: 'number+gauge+delta',
        value: 220 + 30 * v,
        delta: { reference: 200 },
        gauge: { axis: { range: [0, 300] }, steps: [{ range: [0, 150], color: '#dde' }] },
        domain: { x: [0, 0.48] },
      },
      {
        type: 'funnelarea',
        labels: ['Visit', 'Cart', 'Pay'],
        values: [30, 20 - 5 * v, 10],
        domain: { x: [0.52, 1] },
      },
    ],
    layout: { margin: SMALL_MARGIN, showlegend: false },
  }),
  hierarchy: (v) => {
    const values = v ? STORE.values.map((n) => n * 2) : STORE.values;
    const tree = { ...STORE, values };
    return {
      data: [
        { type: 'sunburst', ...tree, domain: { x: [0, 0.32] } },
        { type: 'treemap', ...tree, domain: { x: [0.34, 0.66] } },
        { type: 'icicle', ...tree, domain: { x: [0.68, 1] } },
      ],
      layout: { margin: { l: 4, r: 4, t: 4, b: 4 } },
    };
  },
  sankey: (v) => ({
    data: [
      {
        type: 'sankey',
        node: { label: ['New', 'Triage', 'Self-service', 'Level 1', 'Solved'], pad: 12 },
        link: {
          source: [0, 0, 1, 2, 3],
          target: [1, 2, 3, 4, 4],
          value: [40, 18, 30 + 5 * v, 15, 25],
        },
      },
    ],
    layout: { margin: { l: 8, r: 8, t: 8, b: 8 } },
  }),
  // The backlog's 3D case: markers, a surface and a lit mesh, with shadows and an environment map
  // (a render target, which only exists on the GPU).
  scene: (v) => ({
    data: [
      {
        type: 'scatter3d',
        mode: 'lines+markers+text',
        x: seq(8 + 4 * v, (i) => Math.cos(i)),
        y: seq(8 + 4 * v, (i) => Math.sin(i)),
        z: seq(8 + 4 * v, (i) => i / 8),
        text: seq(8 + 4 * v, (i) => i).map((i) => `p${i}`),
        marker: { size: 6 },
      },
      {
        type: 'surface',
        z: grid(12, 12 + 4 * v, (r, c) => 0.2 * Math.sin(r / 2 + v) * Math.cos(c / 2) - 0.6),
        x: seq(12 + 4 * v, (c) => -1 + (2 * c) / (11 + 4 * v)),
        y: seq(12, (r) => -1 + (2 * r) / 11),
        showscale: false,
      },
      {
        type: 'mesh3d',
        ...placed(uvSphere(8, 12 + 4 * v), 0.3, [0, 0, 1.3]),
        color: '#2ca02c',
        material: { type: 'physical', metalness: 1, roughness: 0.2, castshadow: true },
      },
    ],
    layout: {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      showlegend: false,
      scene: {
        camera: { eye: { x: 1.4, y: -1.6, z: 1 + 0.2 * v } },
        lighting: {
          ambient: { intensity: 0.3 },
          directional: [
            { position: { x: -1, y: -2, z: 3 }, space: 'scene', intensity: 0.9, castshadow: true },
          ],
          environment: 'studio',
        },
      },
    },
  }),
  fields: (v) => {
    const field = tornado();
    return {
      data: [
        { type: 'streamtube', ...field, sizeref: 0.5 + 0.2 * v, showscale: false },
        {
          type: 'cone',
          x: [0, 1, 2, 0, 1, 2],
          y: [0, 0, 0, 1, 1, 1],
          z: [0, 0, 0, 0, 0, 0],
          u: [1, 0, 1, 0, 1, 0],
          v: [0, 1, 0, 1, 0, 1],
          w: [0.2, 0.2, 0.2 + v, 0.2, 0.2, 0.2],
          scene: 'scene2',
          showscale: false,
        },
      ],
      layout: {
        margin: { l: 0, r: 0, t: 0, b: 0 },
        scene: { domain: { x: [0, 0.5] } },
        scene2: { domain: { x: [0.5, 1] } },
      },
    };
  },
  volumes: (v) => ({
    data: [
      {
        type: 'isosurface',
        ...cubeGrid(10, -4, 4, (x, y, z) => x * x * 0.5 + y * y + z * z * 2),
        isomin: 4 + 2 * v,
        isomax: 20,
        showscale: false,
      },
      {
        type: 'volume',
        ...cubeGrid(12, -8, 8, sinc3),
        isomin: 0.1,
        isomax: 0.8,
        opacity: 0.1 + 0.1 * v,
        surface: { count: 5 },
        scene: 'scene2',
        showscale: false,
      },
    ],
    layout: {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      scene: { domain: { x: [0, 0.5] } },
      scene2: { domain: { x: [0.5, 1] } },
    },
  }),
  bar3d: (v) => ({
    data: [
      {
        type: 'bar3d',
        x: ['a', 'b', 'c', 'a', 'b', 'c'],
        y: [1, 1, 1, 2, 2, 2],
        z: [1, 2, 3 + v, 2, 1, 2],
        marker: { colorscale: 'RdBu', showscale: true },
      },
    ],
    layout: { margin: { l: 0, r: 0, t: 0, b: 0 } },
  }),
  // The 2.5D view of a cartesian chart: extruded bars and an area.
  view3d: (v) => ({
    data: [
      { type: 'bar', x: [0, 1, 2], y: [3, 1 + v, 2], depth: 30 },
      {
        type: 'scatter',
        mode: 'lines',
        x: [0, 1, 2],
        y: [1, 2, 1 + v],
        fill: 'tozeroy',
        depth: 20,
      },
    ],
    layout: {
      margin: SMALL_MARGIN,
      showlegend: false,
      view3d: { enabled: true, tilt: 25, rotation: -30 },
    },
  }),
};

/** What the example exposes to the leak test. */
export interface LeakHook {
  families: string[];
  /** Registered trace types that draw and that no family uses (none, or the test is incomplete). */
  uncovered: string[];
  /**
   * Create `family` in a new container, hover it, update it (`react` with the second variant,
   * then a `relayout`) and tear it down: `destroy()` on even rounds, `purge(el)` on odd ones.
   * Returns the chart's renderer as it is after the teardown.
   */
  cycle(family: string, shared: boolean, round: number): Promise<Chart['three']['renderer']>;
  /**
   * Prototypes of what a chart is made of, for a census of live instances after a forced GC
   * (Chromium's `Runtime.queryObjects`).
   */
  prototypes: Record<string, object>;
  /** A small chart that stays on the shared renderer until `release()`. */
  anchor(): Promise<Chart>;
  release(): void;
}

declare global {
  interface Window {
    __leak?: LeakHook;
  }
}

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

export function run(el: HTMLElement): ExampleHandle {
  const doc = el.ownerDocument;
  const stage = doc.createElement('div');
  el.appendChild(stage);
  let anchored: { chart: Chart; cell: HTMLElement } | undefined;

  const mount = (): HTMLElement => {
    const cell = doc.createElement('div');
    cell.style.cssText = `width:${WIDTH}px;height:${HEIGHT}px;`;
    stage.appendChild(cell);
    return cell;
  };
  const settle = async (chart: Chart): Promise<void> => {
    await chart.ready;
    await componentsReady(chart);
    await frame();
  };

  const used = new Set(
    Object.values(FAMILIES).flatMap((figure) =>
      (figure(0).data ?? []).map((t) => t.type as string),
    ),
  );
  const hook: LeakHook = {
    families: Object.keys(FAMILIES),
    uncovered: registry
      .list()
      .traces.filter((t) => t.renders && !used.has(t.type))
      .map((t) => t.type),
    prototypes: {
      object3d: Object3D.prototype,
      geometry: BufferGeometry.prototype,
      material: Material.prototype,
      texture: Texture.prototype,
      renderTarget: WebGLRenderTarget.prototype,
      canvas: HTMLCanvasElement.prototype,
      element: HTMLElement.prototype,
    },
    async cycle(family, shared, round) {
      const make = FAMILIES[family];
      if (!make) throw new Error(`no family "${family}"`);
      // Both variants carry the renderer choice: `react` takes the figure's config as given.
      const figure = (v: 0 | 1): Figure => {
        const f = make(v);
        return { ...f, config: { ...f.config, sharedRenderer: shared } };
      };
      const cell = mount();
      const chart = createChart(cell, figure(0));
      await settle(chart);
      // A pointer over the middle of the chart: hover labels and spikes, where the family has any.
      const canvas = chart.three.root.canvas;
      const box = canvas.getBoundingClientRect();
      const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
      canvas.dispatchEvent(
        new PointerEvent('pointermove', { ...at, bubbles: true, pointerType: 'mouse' }),
      );
      canvas.dispatchEvent(new MouseEvent('mousemove', { ...at, bubbles: true }));
      await frame();
      await chart.react(figure(1));
      await settle(chart);
      await chart.relayout({ width: WIDTH - 40, height: HEIGHT - 20 });
      await settle(chart);
      const renderer = chart.three.renderer;
      if (round % 2) purge(cell);
      else chart.destroy();
      cell.remove();
      return renderer;
    },
    async anchor() {
      if (anchored) return anchored.chart;
      const cell = mount();
      const chart = createChart(cell, {
        data: [{ type: 'scatter', mode: 'markers', x: [0, 1], y: [0, 1] }],
        layout: { margin: SMALL_MARGIN, showlegend: false },
        config: { displayModeBar: false, sharedRenderer: true },
      });
      anchored = { chart, cell };
      await settle(chart);
      return chart;
    },
    release() {
      anchored?.chart.destroy();
      anchored?.cell.remove();
      anchored = undefined;
    },
  };
  window.__leak = hook;
  return {
    dispose: () => {
      if (window.__leak === hook) delete window.__leak;
      hook.release();
      stage.remove();
    },
  };
}
