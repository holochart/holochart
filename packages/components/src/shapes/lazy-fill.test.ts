// @vitest-environment jsdom
/**
 * Shapes and annotation boxes draw with the lazily loaded fill code (plan E21.6): charts whose
 * shapes and annotations need no fill never load it, and `chart.ready` waits for it when they do,
 * so the fills are drawn when it resolves. Tests run in order and share the loader's module state
 * (vitest isolates it per file).
 */
import { fillPrimitiveLoaded, type FrameScheduler } from '@mk7s/holochart-render';
import { createChart, createChartRegistry, type Chart } from '@mk7s/holochart-runtime';
import type { Mesh, Object3D, Scene, ShaderMaterial, WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { annotationsComponent } from '../annotations/annotations.ts';
import { shapesComponent } from './shapes.ts';

/** Scenes the fake renderer was asked to draw. */
const drawn = new Set<Scene>();

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
    render: (scene: Scene) => drawn.add(scene),
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

function chart(layout: Record<string, unknown>): Chart {
  const c = createChart(
    container,
    { data: [], layout },
    {
      registry: createChartRegistry().register(shapesComponent, annotationsComponent),
      renderRoot: { scheduler, createRenderer: fakeRenderer },
    },
  );
  charts.push(c);
  return c;
}

/** Fill meshes (the only material with the gradient uniform) in the drawn scenes. */
function fills(): Mesh[] {
  const out: Mesh[] = [];
  for (const scene of drawn) {
    scene.traverse((o: Object3D) => {
      const material = (o as Mesh).material as ShaderMaterial | undefined;
      if (material?.uniforms?.['uGradient'] !== undefined) out.push(o as Mesh);
    });
  }
  return out;
}

beforeEach(() => {
  drawn.clear();
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

const paper = { xref: 'paper', yref: 'paper' };

describe('lazy fill code in components', () => {
  it('is not loaded when no shape or annotation fills', async () => {
    const c = chart({
      shapes: [{ type: 'line', ...paper, x0: 0.1, x1: 0.9, y0: 0.1, y1: 0.9 }],
      annotations: [{ text: '', showarrow: false, ...paper, x: 0.5, y: 0.5 }],
    });
    await c.ready;
    expect(drawn.size).toBeGreaterThan(0);
    expect(fills()).toEqual([]);
    expect(fillPrimitiveLoaded()).toBe(false);
  });

  it('shape fills and annotation boxes are drawn when chart.ready resolves', async () => {
    const c = chart({
      shapes: [{ type: 'rect', ...paper, x0: 0.1, x1: 0.5, y0: 0.1, y1: 0.5, fillcolor: 'red' }],
      annotations: [{ text: '', showarrow: false, bgcolor: 'blue', ...paper, x: 0.5, y: 0.5 }],
    });
    await c.ready;
    expect(fillPrimitiveLoaded()).toBe(true);
    const meshes = fills();
    expect(meshes).toHaveLength(2);
    for (const m of meshes) {
      expect(m.visible).toBe(true);
      expect(m.geometry.drawRange.count).toBeGreaterThan(0);
    }
  });
});
