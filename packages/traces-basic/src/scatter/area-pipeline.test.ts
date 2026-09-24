// @vitest-environment jsdom
/**
 * Filled and stacked areas (E9.4) through the whole pipeline: `createChart` with the real scatter
 * module on a WebGL-free renderer and a manual frame scheduler (as the runtime's own tests do).
 */
import type { FrameScheduler } from '@mk7s/holochart-render';
import {
  createChart,
  createChartRegistry,
  extendTraces,
  type Chart,
  type ChartOptions,
} from '@mk7s/holochart-runtime';
import type { BufferGeometry, Mesh, Object3D, ShaderMaterial, WebGLRenderer } from 'three';
import { LinePrimitive } from '@mk7s/holochart-render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { traceRenderOrder } from '../shared/render-order.ts';
import type { ScatterCalc } from './calc.ts';
import { scatter } from './index.ts';

/** The subset of `WebGLRenderer` a render root touches; no WebGL involved. */
function fakeRenderer(): WebGLRenderer {
  const noop = (): void => {};
  return {
    domElement: document.createElement('canvas'),
    autoClear: true,
    info: { autoReset: true, reset: noop },
    renderLists: { dispose: noop },
    setPixelRatio: noop,
    setSize: noop,
    setRenderTarget: noop,
    setClearColor: noop,
    clear: noop,
    setScissor: noop,
    setScissorTest: noop,
    setViewport: noop,
    render: noop,
    dispose: noop,
    forceContextLoss: noop,
  } as unknown as WebGLRenderer;
}

/** Frames run on the microtask queue, so `await chart.ready` / updates resolve on their own. */
const scheduler: FrameScheduler = {
  request(cb) {
    queueMicrotask(() => cb(0));
    return 1;
  },
  cancel() {},
  now: () => 0,
};

let container: HTMLElement;
let options: ChartOptions;
let charts: Chart[] = [];

function chart(figure: Parameters<typeof createChart>[1]): Chart {
  const c = createChart(container, figure, options);
  charts.push(c);
  return c;
}

beforeEach(() => {
  container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 640 });
  Object.defineProperty(container, 'clientHeight', { value: 400 });
  document.body.appendChild(container);
  options = {
    registry: createChartRegistry().register(scatter),
    renderRoot: { scheduler, createRenderer: fakeRenderer },
  };
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  container.remove();
});

/** The fill mesh of a trace (the only primitive with the gradient uniform). */
function fillOf(c: Chart, index: number): Mesh<BufferGeometry, ShaderMaterial> | undefined {
  return c
    .getTraceObjects(index)
    .find(
      (o: Object3D) =>
        (o as Mesh<BufferGeometry, ShaderMaterial>).material?.uniforms?.['uGradient'] !== undefined,
    ) as Mesh<BufferGeometry, ShaderMaterial> | undefined;
}

/** An attribute's identity and upload version (a grown geometry replaces the attribute). */
const version = (m: Mesh<BufferGeometry, ShaderMaterial>, name: string): string => {
  const attribute = m.geometry.getAttribute(name) as unknown as { id?: number; version: number };
  ATTRIBUTE_IDS.set(attribute, ATTRIBUTE_IDS.get(attribute) ?? ATTRIBUTE_IDS.size);
  return `${ATTRIBUTE_IDS.get(attribute)}:${attribute.version}`;
};
const ATTRIBUTE_IDS = new Map<object, number>();

describe('areas through createChart', () => {
  it('stacks, links fills, orders them under the previous line and autoranges to zero', async () => {
    const c = chart({
      data: [
        { x: [0, 1, 2], y: [1, 2, 3], stackgroup: 'a' },
        { x: [0, 1, 2], y: [2, 2, 2], stackgroup: 'a' },
      ],
    });
    await c.ready;
    const second = c.getCalcdata(1) as ScatterCalc;
    expect(Array.from(second.y)).toEqual([3, 4, 5]);
    expect(second.link?.previous?.index).toBe(0);

    const own = fillOf(c, 0)!;
    const next = fillOf(c, 1)!;
    const order0 = traceRenderOrder(c.fullData[0]!, 0);
    // Trace 1's tonexty fill draws in trace 0's group: above its fill, under its line (Plotly).
    expect(own.renderOrder).toBeCloseTo(order0 + 0.05);
    expect(next.renderOrder).toBeCloseTo(order0 + 0.06);
    const line0 = c
      .getTraceObjects(0)
      .map((o) => o.renderOrder)
      .filter((r) => r > next.renderOrder);
    expect(line0.length).toBeGreaterThan(0);

    const y = c.fullLayout?.['yaxis'] as { range: [number, number] };
    expect(y.range[0]).toBeLessThanOrEqual(0);
    expect(y.range[1]).toBeGreaterThanOrEqual(5);
    // Lines-only stacked areas: tight x.
    expect((c.fullLayout?.['xaxis'] as { range: number[] }).range).toEqual([0, 2]);
  });

  it('zoom and pan only change the transform (no re-triangulation)', async () => {
    const c = chart({ data: [{ x: [0, 1, 2, 3], y: [1, 3, 2, 4], fill: 'tozeroy' }] });
    await c.ready;
    const fill = fillOf(c, 0)!;
    const before = version(fill, 'position');
    const scale = (fill.material.uniforms['uScale']!.value as { x: number }).x;
    await c.relayout({ 'xaxis.range': [1, 2] });
    expect(version(fill, 'position')).toBe(before);
    expect((fill.material.uniforms['uScale']!.value as { x: number }).x).not.toBe(scale);
  });

  it('restyles fillcolor without touching geometry; removes the fill with fill none', async () => {
    const c = chart({ data: [{ x: [0, 1, 2], y: [1, 3, 2], fill: 'tozeroy' }] });
    await c.ready;
    const fill = fillOf(c, 0)!;
    const pos = version(fill, 'position');
    const color = version(fill, 'aColor');
    await c.restyle({ fillcolor: 'red' }, [0]);
    expect(version(fill, 'position')).toBe(pos);
    expect(version(fill, 'aColor')).not.toBe(color);
    await c.restyle({ fill: 'none' }, [0]);
    expect(fillOf(c, 0)).toBeUndefined();
  });

  it('a tonexty fill follows its previous trace when that trace changes', async () => {
    const c = chart({
      data: [
        { x: [0, 1, 2], y: [1, 1, 1] },
        { x: [0, 1, 2], y: [3, 3, 3], fill: 'tonexty' },
      ],
    });
    await c.ready;
    const fill = fillOf(c, 1)!;
    const before = version(fill, 'position');
    await c.restyle({ y: [[0, 0, 0]] }, [0]);
    expect(version(fill, 'position')).not.toBe(before);
    // A line shape edit on the previous trace reshapes the fill too (crossTraceCalc edit type).
    const again = version(fill, 'position');
    await c.restyle({ 'line.shape': 'hv' }, [0]);
    expect(version(fill, 'position')).not.toBe(again);
    // An unrelated restyle of the previous trace does not re-triangulate this fill.
    const settled = version(fill, 'position');
    await c.restyle({ 'line.width': 4 }, [0]);
    expect(version(fill, 'position')).toBe(settled);
  });

  it('streams: appended points extend the fill', async () => {
    const c = chart({ data: [{ x: [0, 1, 2], y: [1, 3, 2], fill: 'tozeroy', mode: 'lines' }] });
    await c.ready;
    const fill = fillOf(c, 0)!;
    const count = fill.geometry.drawRange.count;
    await extendTraces(container, { x: [[3, 4]], y: [[5, 1]] }, [0]);
    expect(fill.geometry.drawRange.count).toBeGreaterThan(count);
    const calc = c.getCalcdata(0) as ScatterCalc;
    expect(calc.length).toBe(5);
    // The calc came from the streaming path.
    expect(calc.appendOf?.append.count).toBe(2);
  });

  it('keeps the streaming path with several scatter traces (crossTraceCalc drops plan.append)', async () => {
    const x = Array.from({ length: 50 }, (_, i) => i);
    const c = chart({
      data: [
        { x, y: x.map((v) => Math.sin(v)), mode: 'lines' },
        { x, y: x.map((v) => Math.cos(v)), mode: 'lines' },
      ],
    });
    await c.ready;
    // The first streamed edit after a full draw re-lays the path out with room to grow.
    await extendTraces(container, { x: [[50]], y: [[0]] }, [0]);
    const splice = vi.spyOn(LinePrimitive.prototype, 'splice');
    try {
      await extendTraces(container, { x: [[51]], y: [[1]] }, [0]);
      // The streamed trace's line takes the incremental path.
      expect(splice).toHaveBeenCalledTimes(1);
      expect((c.getCalcdata(0) as ScatterCalc).length).toBe(52);
    } finally {
      splice.mockRestore();
    }
  });

  it('hovers on the fill through the module with the chart transform', async () => {
    const c = chart({
      data: [{ x: [0, 10, 10, 0], y: [0, 0, 10, 10], fill: 'toself', mode: 'lines', name: 'sq' }],
      layout: { xaxis: { range: [-1, 11] }, yaxis: { range: [-1, 11] } },
    });
    await c.ready;
    const sp = c.subplots.get('xy')!;
    const tr = sp.transform;
    const px = 5 * tr.scaleX + tr.offsetX;
    const py = 5 * tr.scaleY + tr.offsetY;
    const points = scatter.hoverPoints!(
      c.getCalcdata(0) as ScatterCalc,
      c.fullData[0]!,
      { px, py, xl: 5, yl: 5, mode: 'closest', distance: 20 },
      { fullLayout: c.fullLayout!, xaxis: sp.xaxis, yaxis: sp.yaxis, transform: tr },
    );
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ pointIndex: -1, text: 'sq' });
    // The label sits inside the plot area, at the fill's vertical middle.
    expect(points[0]!.py).toBeCloseTo(py, 0);
  });
});
