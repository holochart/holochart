// @vitest-environment jsdom
/**
 * The fill code loads lazily (plan E21.6): a scatter chart without fills never loads it, the first
 * fill does, and `chart.ready` waits for it so the fill is drawn when it resolves. Tests run in
 * order and share the loader's module state (vitest isolates it per file).
 */
import { fillPrimitiveLoaded, type FrameScheduler } from '@mk7s/holochart-render';
import { createChart, createChartRegistry, type Chart } from '@mk7s/holochart-runtime';
import type { BufferGeometry, Mesh, Object3D, ShaderMaterial, WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { traceRenderOrder } from '../shared/render-order.ts';
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

/** Frames run on the microtask queue, so `await chart.ready` resolves on its own. */
const scheduler: FrameScheduler = {
  request(cb) {
    queueMicrotask(() => cb(0));
    return 1;
  },
  cancel() {},
  now: () => 0,
};

let container: HTMLElement;
let charts: Chart[] = [];

function chart(figure: Parameters<typeof createChart>[1]): Chart {
  const c = createChart(container, figure, {
    registry: createChartRegistry().register(scatter),
    renderRoot: { scheduler, createRenderer: fakeRenderer },
  });
  charts.push(c);
  return c;
}

beforeEach(() => {
  container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 640 });
  Object.defineProperty(container, 'clientHeight', { value: 400 });
  document.body.appendChild(container);
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  container.remove();
});

type FillMesh = Mesh<BufferGeometry, ShaderMaterial>;

/** A trace's drawn fill mesh (the only material with the gradient uniform). */
function fillOf(c: Chart, index: number): FillMesh | undefined {
  return c
    .getTraceObjects(index)
    .find((o: Object3D) => (o as FillMesh).material?.uniforms?.['uGradient'] !== undefined) as
    FillMesh | undefined;
}

describe('lazy fill code', () => {
  it('is not loaded by scatter charts without fills', async () => {
    const c = chart({ data: [{ x: [0, 1, 2], y: [1, 3, 2], mode: 'lines+markers' }] });
    await c.ready;
    expect(c.getTraceObjects(0).length).toBeGreaterThan(0);
    expect(fillOf(c, 0)).toBeUndefined();
    expect(fillPrimitiveLoaded()).toBe(false);
  });

  it('loads with the first fill; chart.ready resolves once the fill is drawn', async () => {
    const c = chart({ data: [{ x: [0, 1, 2], y: [1, 3, 2], fill: 'tozeroy' }] });
    await c.ready;
    expect(fillPrimitiveLoaded()).toBe(true);
    const fill = fillOf(c, 0)!;
    expect(fill).toBeDefined();
    expect(fill.visible).toBe(true);
    expect(fill.geometry.drawRange.count).toBeGreaterThan(0);
    expect(fill.renderOrder).toBeCloseTo(traceRenderOrder(c.fullData[0]!, 0) + 0.05);
  });

  it('draws later fills at once, including ones added by an update', async () => {
    const c = chart({ data: [{ x: [0, 1, 2], y: [1, 3, 2] }] });
    await c.ready;
    expect(fillOf(c, 0)).toBeUndefined();
    await c.restyle({ fill: 'toself' }, [0]);
    const fill = fillOf(c, 0)!;
    expect(fill.visible).toBe(true);
    expect(fill.geometry.drawRange.count).toBeGreaterThan(0);
  });
});
