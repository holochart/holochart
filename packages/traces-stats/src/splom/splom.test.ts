// @vitest-environment jsdom
import { createScale, supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import type { FrameScheduler } from '@mk7s/holochart-render';
import {
  createChart,
  createChartRegistry,
  type AxisInfo,
  type Chart,
  type HoverContext,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import type { WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { splom, type SplomCalc } from './index.ts';

const registry = createChartRegistry().register(splom);

function defaults(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  return supplyDefaults({ data: [{ type: 'splom', ...trace }], layout }, registry.core);
}

function dims(n: number, len = 4): { label: string; values: number[] }[] {
  return Array.from({ length: n }, (_, k) => ({
    label: `d${k}`,
    values: Array.from({ length: len }, (_, i) => k * 10 + i),
  }));
}

function axis(fullLayout: FullLayout, key: string): Record<string, unknown> {
  return fullLayout[key] as Record<string, unknown>;
}

describe('splom defaults: axes and cells', () => {
  it('makes one axis pair per dimension and one subplot per cell, laid out as a grid', () => {
    const { fullData, fullLayout } = defaults({ dimensions: dims(3) });
    const trace = fullData[0] as FullTrace;
    expect(trace.visible).toBe(true);
    expect(trace['_length']).toBe(4);
    expect(trace['xaxes']).toEqual(['x', 'x2', 'x3']);
    expect(trace['yaxes']).toEqual(['y', 'y2', 'y3']);
    expect(fullLayout._subplots.xaxis).toEqual(['x', 'x2', 'x3']);
    expect(fullLayout._subplots.yaxis).toEqual(['y', 'y2', 'y3']);
    expect([...fullLayout._subplots.cartesian].sort()).toEqual(
      ['xy', 'xy2', 'xy3', 'x2y', 'x2y2', 'x2y3', 'x3y', 'x3y2', 'x3y3'].sort(),
    );
    // Grid: one column per x axis, one row per y axis (row 0 on top), 0.1 gaps.
    expect(fullLayout.grid).toMatchObject({ rows: 3, columns: 3, xaxes: ['x', 'x2', 'x3'] });
    expect(fullLayout.grid?.yaxes).toEqual(['y', 'y2', 'y3']);
    const step = 1 / 2.9;
    expect(axis(fullLayout, 'xaxis2')['domain']).toEqual([
      expect.closeTo(step, 9),
      expect.closeTo(step + 0.9 * step, 9),
    ]);
    // Row 0 (dimension 0) on top.
    expect((axis(fullLayout, 'yaxis')['domain'] as number[])[1]).toBeCloseTo(1, 9);
    expect((axis(fullLayout, 'yaxis3')['domain'] as number[])[0]).toBeCloseTo(0, 9);
    // Axes at the bottom row and left column (Plotly's 'bottom plot' / 'left plot').
    expect(axis(fullLayout, 'xaxis')['anchor']).toBe('y3');
    expect(axis(fullLayout, 'yaxis2')['anchor']).toBe('x');
    // Titles are the labels.
    expect(axis(fullLayout, 'xaxis3')['title']).toMatchObject({ text: 'd2' });
    expect(axis(fullLayout, 'yaxis2')['title']).toMatchObject({ text: 'd1' });
    // Cells: every pair, with dimension indices.
    expect(trace['_cells']).toHaveLength(9);
    expect(trace['_cells']).toContainEqual({ xaxis: 'x3', yaxis: 'y', x: 2, y: 0 });
  });

  it('keeps the lower half (and diagonal) with showupperhalf: false', () => {
    const { fullData, fullLayout } = defaults({ dimensions: dims(3), showupperhalf: false });
    expect([...fullLayout._subplots.cartesian].sort()).toEqual(
      ['xy', 'xy2', 'xy3', 'x2y2', 'x2y3', 'x3y3'].sort(),
    );
    // The bottom row and left column are full: axes stay on their cells.
    expect(fullLayout.grid).toMatchObject({ xside: 'bottom plot', yside: 'left plot' });
    expect(axis(fullLayout, 'xaxis2')['anchor']).toBe('y3');
    expect((fullData[0] as FullTrace)['_cells']).toHaveLength(6);
  });

  it('puts the axes at the grid edges with showlowerhalf: false', () => {
    const { fullData, fullLayout } = defaults({ dimensions: dims(3), showlowerhalf: false });
    expect([...fullLayout._subplots.cartesian].sort()).toEqual(
      ['xy', 'x2y', 'x3y', 'x2y2', 'x3y2', 'x3y3'].sort(),
    );
    expect(fullLayout.grid).toMatchObject({ xside: 'bottom', yside: 'left' });
    expect(axis(fullLayout, 'xaxis2')['anchor']).toBe('free');
    expect(axis(fullLayout, 'xaxis2')['position']).toBe(0);
    expect(axis(fullLayout, 'yaxis3')['anchor']).toBe('free');
    expect(axis(fullLayout, 'yaxis3')['side']).toBe('left');
    expect((fullData[0] as FullTrace)['_cells']).toHaveLength(6);
  });

  it('drops the first row and last column with the upper half and the diagonal hidden', () => {
    const { fullData, fullLayout } = defaults({
      dimensions: dims(3),
      showupperhalf: false,
      diagonal: { visible: false },
    });
    // x: dimensions 0, 1; y: dimensions 1, 2 → the three cells below the diagonal.
    expect(fullLayout._subplots.xaxis).toEqual(['x', 'x2']);
    expect(fullLayout._subplots.yaxis).toEqual(['y2', 'y3']);
    expect([...fullLayout._subplots.cartesian].sort()).toEqual(['xy2', 'xy3', 'x2y3'].sort());
    expect(fullLayout.grid).toMatchObject({ rows: 2, columns: 2 });
    const cells = (fullData[0] as FullTrace)['_cells'] as { x: number; y: number }[];
    expect(cells.map((c) => [c.x, c.y]).sort()).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it('mirrors that for the upper half alone', () => {
    const { fullLayout } = defaults({
      dimensions: dims(3),
      showlowerhalf: false,
      diagonal: { visible: false },
    });
    expect(fullLayout._subplots.xaxis).toEqual(['x2', 'x3']);
    expect(fullLayout._subplots.yaxis).toEqual(['y', 'y2']);
    expect([...fullLayout._subplots.cartesian].sort()).toEqual(['x2y', 'x3y', 'x3y2'].sort());
  });

  it('hides only the diagonal cells when both halves are shown', () => {
    const { fullData, fullLayout } = defaults({
      dimensions: dims(3),
      diagonal: { visible: false },
    });
    expect(fullLayout._subplots.cartesian).toHaveLength(6);
    expect(fullLayout._subplots.cartesian).not.toContain('x2y2');
    expect(fullLayout.grid).toMatchObject({ xside: 'bottom', yside: 'left' });
    expect((fullData[0] as FullTrace)['_cells']).toHaveLength(6);
  });

  it('is not drawn without samples or with nothing to show', () => {
    expect(defaults({ dimensions: [] }).fullData[0]?.visible).toBe(false);
    expect(
      defaults({
        dimensions: dims(2),
        diagonal: { visible: false },
        showupperhalf: false,
        showlowerhalf: false,
      }).fullData[0]?.visible,
    ).toBe(false);
    const { fullData } = defaults({ dimensions: [{ label: 'a' }, { values: [1, 2] }] });
    const d = fullData[0]?.['dimensions'] as { visible: boolean }[];
    expect(d[0]?.visible).toBe(false);
    expect(d[1]?.visible).toBe(true);
    expect(fullData[0]?.['_length']).toBe(2);
  });

  it('applies dimension axis types, matches and custom axis ids; user axes win', () => {
    const { fullLayout } = defaults(
      {
        dimensions: [
          { label: 'a', values: [1, 10, 100], axis: { type: 'log', matches: true } },
          { label: 'b', values: ['p', 'q', 'r'] },
        ],
        xaxes: ['x', 'x4'],
        yaxes: ['y', 'y4'],
      },
      { yaxis4: { title: { text: 'mine' } } },
    );
    expect(axis(fullLayout, 'xaxis')['type']).toBe('log');
    expect(axis(fullLayout, 'yaxis')['type']).toBe('log');
    // x matches y (the loop back is dropped).
    expect(axis(fullLayout, 'xaxis')['matches']).toBe('y');
    expect(axis(fullLayout, 'yaxis')['matches']).toBeUndefined();
    expect(fullLayout._axisMatchGroups).toEqual([{ x: 1, y: 1 }]);
    // Categories are detected from the values.
    expect(axis(fullLayout, 'xaxis4')['type']).toBe('category');
    expect(axis(fullLayout, 'yaxis4')['title']).toMatchObject({ text: 'mine' });
    expect(fullLayout._subplots.cartesian).toContain('x4y4');
  });

  it('keeps a user grid with cell contents and is a supply-defaults fixed point', () => {
    const first = defaults({ dimensions: dims(2) }, { grid: { xgap: 0.02, ygap: 0.02 } });
    expect(first.fullLayout.grid).toMatchObject({ xgap: 0.02, rows: 2, columns: 2 });
    // Feeding the full output back in gives the same axes and grid.
    const strip = (v: unknown): unknown =>
      JSON.parse(JSON.stringify(v, (k, x: unknown) => (k.startsWith('_') ? undefined : x)));
    const layoutIn = strip(first.fullLayout) as Record<string, unknown>;
    delete layoutIn['template'];
    const again = defaults({ dimensions: dims(2) }, layoutIn);
    for (const key of ['xaxis', 'xaxis2', 'yaxis', 'yaxis2', 'grid']) {
      expect(strip(again.fullLayout[key])).toEqual(strip(first.fullLayout[key]));
    }
  });
});

function axisInfo(
  id: string,
  type: 'linear' | 'log' | 'category' | 'date',
  cats?: string[],
): AxisInfo {
  const scale = createScale({ type, range: [0, 1], ...(cats ? { categories: cats } : {}) });
  return { id, scale, type, letter: id.charAt(0), full: { type } } as unknown as AxisInfo;
}

describe('splom calc', () => {
  it('converts each dimension once through its axis: typed arrays, categories, logs', () => {
    const { fullData, fullLayout } = defaults({
      dimensions: [
        { label: 'n', values: new Float32Array([1, 2, 3, 4]) },
        { label: 'c', values: ['a', 'b', 'a', 'c'] },
        { label: 'l', values: [1, 10, 100, 1000], axis: { type: 'log' } },
      ],
    });
    const trace = fullData[0] as FullTrace;
    const axes = new Map<string, AxisInfo>([
      ['x', axisInfo('x', 'linear')],
      ['x2', axisInfo('x2', 'category', ['a', 'b', 'c'])],
      ['x3', axisInfo('x3', 'log')],
    ]);
    const calc = splom.calc!(trace, {
      fullLayout,
      index: 0,
      xaxis: undefined,
      yaxis: undefined,
      axes,
    });
    expect(calc.length).toBe(4);
    expect(Array.from(calc.columns[0]!)).toEqual([1, 2, 3, 4]);
    expect(Array.from(calc.columns[1]!)).toEqual([0, 1, 0, 2]);
    expect(Array.from(calc.columns[2]!)).toEqual([0, 1, 2, 3]);
    expect(calc.markerSize).toBe(6);
    // Autorange per axis: x and y of a dimension get the same extremes.
    const e = splom.extremes!(calc, trace, {
      fullLayout,
      index: 0,
      xaxis: undefined,
      yaxis: undefined,
    });
    expect(Object.keys(e.byAxis ?? {}).sort()).toEqual(['x', 'x2', 'x3', 'y', 'y2', 'y3']);
    expect(e.byAxis?.['y3']).toBe(e.byAxis?.['x3']);
    // Scatter's marker padding: 6 px / 1.6, with the 5% extra padding.
    expect(e.byAxis?.['x']?.min[0]).toMatchObject({ l: 1, padPx: 3.75, extrapad: true });
  });

  it('keeps hidden dimensions out and cuts every column to the shortest one', () => {
    const { fullData, fullLayout } = defaults({
      dimensions: [{ values: [1, 2, 3] }, { values: [4, 5], visible: false }, { values: [7, 8] }],
    });
    const trace = fullData[0] as FullTrace;
    const calc = splom.calc!(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined });
    expect(calc.length).toBe(2);
    expect(calc.columns[1]).toBeNull();
    expect(Array.from(calc.columns[0]!)).toEqual([1, 2]);
    // Hidden dimensions keep their axes (and cells) but give them no data.
    expect(splom.axisData!(trace, 'x2')).toBeUndefined();
    expect(splom.axisData!(trace, 'y3')).toEqual([7, 8]);
  });

  it('sizes bubbles like scatter', () => {
    const { fullData, fullLayout } = defaults({
      dimensions: dims(2, 3),
      marker: { size: [10, 20, 40], sizeref: 2 },
    });
    const trace = fullData[0] as FullTrace;
    const calc = splom.calc!(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined });
    expect(Array.from(calc.markerSize as Float32Array)).toEqual([5, 10, 20]);
    expect((trace['marker'] as { line: { width: number } }).line.width).toBe(1);
  });
});

/** Hover / selection context of cell (x axis, y axis) with a 1 px per unit transform. */
function cellContext(fullLayout: FullLayout, x: AxisInfo, y: AxisInfo): HoverContext {
  return {
    fullLayout,
    xaxis: x,
    yaxis: y,
    transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
  };
}

describe('splom hover and selection per cell', () => {
  const { fullData, fullLayout } = defaults({
    dimensions: [
      { label: 'alpha', values: [0, 10, 20, 30] },
      { label: 'beta', values: [100, 50, 0, 25] },
      { label: 'gamma', values: [5, 6, 7, 8] },
    ],
    text: ['s0', 's1', 's2', 's3'],
  });
  const trace = fullData[0] as FullTrace;
  const axes = new Map<string, AxisInfo>(
    ['x', 'x2', 'x3', 'y', 'y2', 'y3'].map((id) => [id, axisInfo(id, 'linear')]),
  );
  const calc = splom.calc!(trace, {
    fullLayout,
    index: 0,
    xaxis: undefined,
    yaxis: undefined,
    axes,
  }) as SplomCalc;

  it('finds the nearest sample of the hovered cell and names both dimensions', () => {
    // Cell x (alpha) × y2 (beta): sample 1 is at (10, 50).
    const q: HoverQuery = { px: 11, py: 49, xl: 11, yl: 49, mode: 'closest', distance: 20 };
    const ctx = cellContext(fullLayout, axes.get('x')!, axes.get('y2')!);
    const [p] = splom.hoverPoints!(calc, trace, q, ctx);
    expect(p).toMatchObject({ pointIndex: 1, x: 10, y: 50, px: 10, py: 50, text: 's1' });
    expect(p?.hoverText).toBe('alpha: 10<br>beta: 50<br>s1');
    // Another cell of the same sample: gamma × alpha.
    const other = cellContext(fullLayout, axes.get('x3')!, axes.get('y')!);
    const [p2] = splom.hoverPoints!(
      calc,
      trace,
      { px: 6, py: 10, xl: 6, yl: 10, mode: 'closest', distance: 20 },
      other,
    );
    expect(p2).toMatchObject({ pointIndex: 1, x: 6, y: 10 });
    expect(p2?.hoverText).toContain('gamma: 6<br>alpha: 10');
    // Nothing within reach.
    expect(
      splom.hoverPoints!(calc, trace, { ...q, xl: 500, yl: 500, px: 500, py: 500 }, ctx),
    ).toEqual([]);
  });

  it('selects the samples inside a box or lasso of one cell', () => {
    const ctx = cellContext(fullLayout, axes.get('x')!, axes.get('y2')!);
    // alpha in [5, 25], beta in [-1, 60] → samples 1 (10, 50) and 2 (20, 0).
    expect(
      splom.selectPoints!(calc, trace, { kind: 'rect', x: [5, 25], y: [-1, 60] }, ctx),
    ).toEqual([1, 2]);
    const lasso = {
      kind: 'lasso' as const,
      x: [-5, 40] as [number, number],
      y: [-5, 120] as [number, number],
      polygon: [
        [-5, 90],
        [40, 90],
        [40, 120],
        [-5, 120],
      ] as [number, number][],
    };
    expect(splom.selectPoints!(calc, trace, lasso, ctx)).toEqual([0]);
  });
});

// ---- End to end, through a chart with a WebGL-free renderer -------------------------------------

function fakeRenderer() {
  const canvas = document.createElement('canvas');
  return {
    domElement: canvas,
    autoClear: true,
    info: { autoReset: true, reset: vi.fn() },
    renderLists: { dispose: vi.fn() },
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    setRenderTarget: vi.fn(),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    setViewport: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  };
}

function manualScheduler(): FrameScheduler & { step(): void } {
  let queue: FrameRequestCallback[] = [];
  let id = 0;
  return {
    request(cb: FrameRequestCallback) {
      queue.push(cb);
      return ++id;
    },
    cancel() {
      queue = [];
    },
    step() {
      const run = queue;
      queue = [];
      for (const cb of run) cb(performance.now());
    },
  } as unknown as FrameScheduler & { step(): void };
}

let charts: Chart[] = [];
afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
});

async function chartOf(figure: Parameters<typeof createChart>[1]) {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 600 });
  Object.defineProperty(container, 'clientHeight', { value: 600 });
  document.body.appendChild(container);
  const scheduler = manualScheduler();
  const c = createChart(container, figure, {
    registry: createChartRegistry().register(splom),
    renderRoot: {
      scheduler,
      createRenderer: () => fakeRenderer() as unknown as WebGLRenderer,
    },
  });
  charts.push(c);
  await c.ready;
  return { c, scheduler };
}

describe('splom in a chart', () => {
  const figure = {
    data: [
      {
        type: 'splom',
        dimensions: [
          { label: 'a', values: [0, 1, 2, 3] },
          { label: 'b', values: [3, 1, 2, 0] },
          { label: 'c', values: [1, 1, 2, 2] },
        ],
      },
    ],
    layout: { margin: { l: 40, r: 20, t: 20, b: 40 } },
  };

  /** The cell mesh drawn in subplot `id`. */
  function cellIn(c: Chart, id: string) {
    const sp = c.subplots.get(id);
    const mesh = sp?.viewport.scene.children[0] as unknown as
      | {
          geometry: { getAttribute(n: string): { version: number; array: Float32Array } };
          material: { uniforms: Record<string, { value: { x: number; y: number } }> };
        }
      | undefined;
    if (!mesh) throw new Error(`no cell in ${id}`);
    return mesh;
  }

  it('draws one cell per subplot from one upload per dimension', async () => {
    const { c } = await chartOf(figure);
    expect(c.subplots.size).toBe(9);
    expect(c.getTraceObjects(0)).toHaveLength(9);
    // Every subplot's viewport holds exactly its cell.
    for (const sp of c.subplots.values()) expect(sp.viewport.scene.children).toHaveLength(1);
    // Cells of a column share one x buffer, cells of a row one y buffer: 3 buffers in all, each
    // written once.
    const xs = new Set(
      ['x', 'x2', 'x3'].map((x) => cellIn(c, `${x}y`).geometry.getAttribute('aX')),
    );
    for (const x of ['x', 'x2', 'x3']) {
      const a = cellIn(c, `${x}y`).geometry.getAttribute('aX');
      for (const y of ['y2', 'y3']) expect(cellIn(c, x + y).geometry.getAttribute('aX')).toBe(a);
      // Dimension i is the same buffer as x (column) and as y (row).
      const k = x === 'x' ? '' : x.slice(1);
      expect(cellIn(c, `xy${k}`).geometry.getAttribute('aY')).toBe(a);
      expect(a.version).toBe(1);
    }
    expect(xs.size).toBe(3);
    // Axes autorange over their dimension, x and y alike.
    const xa = c.fullLayout?.['xaxis2'] as { range: number[] };
    const ya = c.fullLayout?.['yaxis2'] as { range: number[] };
    expect(xa.range[0]).toBeLessThan(0);
    expect(xa.range[1]).toBeGreaterThan(3);
    expect(ya.range).toEqual(xa.range);
  });

  it('selecting in one cell highlights the same samples in every cell', async () => {
    const { c } = await chartOf(figure);
    const style = cellIn(c, 'xy2').geometry.getAttribute('aStyle');
    const opacities = () => [0, 1, 2, 3].map((i) => Math.round(style.array[i * 4 + 2]! * 10) / 10);
    expect(opacities()).toEqual([1, 1, 1, 1]);
    await c.restyle({ selectedpoints: [[1, 3]] });
    expect(opacities()).toEqual([0.2, 1, 0.2, 1]);
    // Every cell reads the same style buffer.
    for (const sp of c.subplots.values()) {
      expect(cellIn(c, sp.id).geometry.getAttribute('aStyle')).toBe(style);
    }
  });

  it('updates every cell of a zoomed axis with its new transform only', async () => {
    const { c } = await chartOf(figure);
    const scale = (id: string) => cellIn(c, id).material.uniforms['uScale']!.value.x;
    const before = ['x2y', 'x2y2', 'x2y3'].map(scale);
    const other = scale('xy');
    const buffer = cellIn(c, 'x2y').geometry.getAttribute('aX');
    await c.relayout({ 'xaxis2.range': [0, 1] });
    ['x2y', 'x2y2', 'x2y3'].forEach((id, k) => expect(scale(id)).toBeGreaterThan(before[k]!));
    expect(scale('xy')).toBe(other);
    // No re-upload, nor for a restyle.
    await c.restyle({ 'marker.color': 'red', name: 'renamed' });
    expect(cellIn(c, 'x2y').geometry.getAttribute('aX')).toBe(buffer);
    expect(buffer.version).toBe(1);
  });

  function fire(c: Chart, type: string, x: number, y: number): void {
    c.three.root.canvas.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
      }),
    );
  }

  /** Container px of data values (x, y) in subplot `id`. */
  function at(c: Chart, id: string, x: number, y: number): [number, number] {
    const sp = c.subplots.get(id)!;
    return [sp.xaxis.l2c(sp.xaxis.scale.d2l(x)), sp.yaxis.l2c(sp.yaxis.scale.d2l(y))];
  }

  it('box-selecting in one cell selects the same samples in every cell', async () => {
    const { c, scheduler } = await chartOf({
      ...figure,
      layout: { ...figure.layout, dragmode: 'select' },
    });
    const selected: unknown[] = [];
    c.on('selected', (e: unknown) => void selected.push(e));
    // Cell x2y: dimension b along x, a along y. Samples 1 (b 1, a 1) and 2 (b 2, a 2).
    const from = at(c, 'x2y', 0.5, 0.5);
    const to = at(c, 'x2y', 2.5, 2.5);
    fire(c, 'pointerdown', from[0], from[1]);
    fire(c, 'pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
    scheduler.step();
    fire(c, 'pointermove', to[0], to[1]);
    scheduler.step();
    fire(c, 'pointerup', to[0], to[1]);
    await c.relayout({});
    expect(selected).toHaveLength(1);
    const points = (selected[0] as { points: { pointNumber: number }[] }).points;
    expect(points.map((p) => p.pointNumber)).toEqual([1, 2]);
    // The shared style buffer dims samples 0 and 3 in every cell.
    for (const id of ['xy', 'x3y2', 'x2y3']) {
      const style = cellIn(c, id).geometry.getAttribute('aStyle');
      expect([0, 1, 2, 3].map((i) => Math.round(style.array[i * 4 + 2]! * 10) / 10)).toEqual([
        0.2, 1, 1, 0.2,
      ]);
    }
  });

  it('hovers the nearest sample of the hovered cell, labelled with both dimensions', async () => {
    const { c, scheduler } = await chartOf(figure);
    const hovers: { points: { pointNumber: number; x: unknown; y: unknown }[] }[] = [];
    c.on('hover', (e: unknown) => void hovers.push(e as (typeof hovers)[number]));
    // Cell x3y2: dimension c along x, b along y; sample 2 is at (2, 2).
    const p = at(c, 'x3y2', 2, 2);
    fire(c, 'pointermove', p[0] + 1, p[1]);
    scheduler.step();
    expect(hovers).toHaveLength(1);
    expect(hovers[0]?.points[0]).toMatchObject({ pointNumber: 2, x: 2, y: 2 });
    const text = [...c.element.querySelectorAll<HTMLElement>('.holochart-hoverlabel')]
      .filter((el) => el.style.display !== 'none')
      .map((el) => el.textContent ?? '')
      .join(' ');
    expect(text).toContain('c: 2');
    expect(text).toContain('b: 2');
  });

  it('describes the matrix for assistive technology', async () => {
    const { c } = await chartOf(figure);
    const text = c.element.textContent ?? '';
    expect(text).toContain('Scatter plot matrix');
    expect(text).toContain('4 samples of 3 dimensions');
  });
});
