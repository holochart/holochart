// @vitest-environment jsdom
import { Object3D, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Primitive } from '../types.ts';
import { createRenderRoot, type RenderRootOptions } from './render-root.ts';
import { presentedCanvas } from './shared-renderer.ts';
import { createFakeScheduler } from './test-utils.ts';

/** Records the renderer calls the root makes; no WebGL involved (as in render-root.test.ts). */
function createFakeRenderer() {
  const canvas = document.createElement('canvas');
  const calls: string[] = [];
  const renderer = {
    domElement: canvas,
    autoClear: true,
    info: { autoReset: true, reset: vi.fn() },
    renderLists: { dispose: vi.fn() },
    pixelRatio: 1,
    setPixelRatio(v: number) {
      this.pixelRatio = v;
      calls.push(`pixelRatio ${v}`);
    },
    setSize: (w: number, h: number) => void calls.push(`size ${w}x${h}`),
    setDrawingBufferSize(w: number, h: number, pixelRatio: number) {
      this.pixelRatio = pixelRatio;
      // What three does: floor the logical size times the ratio.
      calls.push(
        `buffer ${Math.floor(w * pixelRatio)}x${Math.floor(h * pixelRatio)}@${pixelRatio}`,
      );
    },
    setRenderTarget: vi.fn(),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    setViewport: vi.fn(),
    render: () => void calls.push('render'),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  };
  return { renderer, calls, canvas };
}

function setup(options: RenderRootOptions = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const fake = createFakeRenderer();
  const scheduler = createFakeScheduler();
  const root = createRenderRoot(container, {
    width: 800,
    height: 600,
    pixelRatio: 2,
    responsive: false,
    scheduler,
    createRenderer: () => fake.renderer as unknown as WebGLRenderer,
    ...options,
  });
  return { container, root, scheduler, ...fake };
}

function fakePrimitive() {
  const setViewport = vi.fn();
  const p: Primitive<unknown> = {
    object: new Object3D(),
    update: vi.fn(),
    setTransform: vi.fn(),
    setViewport,
    dispose: vi.fn(),
  };
  return { p, setViewport };
}

/** A `MediaQueryList` whose `change` event the test fires. */
class FakeMediaQuery {
  readonly listeners = new Set<() => void>();
  readonly media: string;
  constructor(media: string) {
    this.media = media;
  }
  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener);
  }
  fire() {
    for (const listener of [...this.listeners]) listener();
  }
}

function stubMatchMedia(): FakeMediaQuery[] {
  const queries: FakeMediaQuery[] = [];
  vi.stubGlobal('matchMedia', (media: string) => {
    const query = new FakeMediaQuery(media);
    queries.push(query);
    return query;
  });
  return queries;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('RenderRoot.setPixelRatio', () => {
  it('re-sizes the backing store, relayouts the viewports and emits resize', () => {
    const { root, renderer, calls } = setup();
    const vp = root.addViewport({ rect: { x: 10, y: 10, width: 50, height: 40 } });
    const { p, setViewport } = fakePrimitive();
    vp.add(p);
    const sizes: unknown[] = [];
    root.on('resize', (size) => void sizes.push({ ...size }));
    calls.length = 0;

    root.setPixelRatio(3);

    expect(root.pixelRatio).toBe(3);
    expect(root.size).toEqual({ width: 800, height: 600, pixelRatio: 3 });
    expect(renderer.pixelRatio).toBe(3);
    // The CSS size is unchanged; three reallocates the drawing buffer for the new ratio.
    expect(calls).toEqual(['pixelRatio 3', 'size 800x600']);
    expect(sizes).toEqual([{ width: 800, height: 600, pixelRatio: 3 }]);
    expect(setViewport).toHaveBeenLastCalledWith({ width: 50, height: 40, pixelRatio: 3 });
    expect(vp.size.pixelRatio).toBe(3);
    expect(root.overlay!.size.pixelRatio).toBe(3);
    expect(root.loop.pending).toBe(true);
  });

  it('does nothing for the ratio it already has, or once destroyed', () => {
    const { root, renderer, calls, scheduler } = setup();
    const onResize = vi.fn();
    root.on('resize', onResize);
    scheduler.step();
    calls.length = 0;

    root.setPixelRatio(2);
    expect(calls).toEqual([]);
    expect(onResize).not.toHaveBeenCalled();
    expect(root.loop.pending).toBe(false);

    root.destroy();
    root.setPixelRatio(1);
    expect(root.pixelRatio).toBe(2);
    expect(renderer.pixelRatio).toBe(2);
    expect(calls).toEqual([]);
  });
});

describe('RenderRoot: automatic device pixel ratio', () => {
  it('follows the device pixel ratio when the window moves to another screen', () => {
    const queries = stubMatchMedia();
    vi.stubGlobal('devicePixelRatio', 1);
    const { root, renderer } = setup({ pixelRatio: undefined });
    const onResize = vi.fn();
    root.on('resize', onResize);
    expect(root.pixelRatio).toBe(1);
    expect(queries.map((q) => q.media)).toEqual(['(resolution: 1dppx)']);
    expect(queries[0]!.listeners.size).toBe(1);

    // The query stops matching: the ratio is now 2.
    vi.stubGlobal('devicePixelRatio', 2);
    queries[0]!.fire();
    expect(root.pixelRatio).toBe(2);
    expect(renderer.pixelRatio).toBe(2);
    expect(onResize).toHaveBeenCalledTimes(1);
    // It watches the new ratio and lets go of the old query.
    expect(queries.map((q) => q.media)).toEqual(['(resolution: 1dppx)', '(resolution: 2dppx)']);
    expect(queries[0]!.listeners.size).toBe(0);
    expect(queries[1]!.listeners.size).toBe(1);
  });

  it('keeps the ratio under maxPixelRatio, and still watches for the next change', () => {
    const queries = stubMatchMedia();
    vi.stubGlobal('devicePixelRatio', 2);
    const { root } = setup({ pixelRatio: undefined, maxPixelRatio: 2 });
    const onResize = vi.fn();
    root.on('resize', onResize);

    vi.stubGlobal('devicePixelRatio', 3);
    queries[0]!.fire();
    // Capped at 2, which it already had: nothing to resize.
    expect(root.pixelRatio).toBe(2);
    expect(onResize).not.toHaveBeenCalled();
    expect(queries.at(-1)!.media).toBe('(resolution: 3dppx)');

    vi.stubGlobal('devicePixelRatio', 1.5);
    queries.at(-1)!.fire();
    expect(root.pixelRatio).toBe(1.5);
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it('stops watching when destroyed', () => {
    const queries = stubMatchMedia();
    vi.stubGlobal('devicePixelRatio', 1);
    const { root } = setup({ pixelRatio: undefined });
    expect(queries[0]!.listeners.size).toBe(1);
    root.destroy();
    expect(queries[0]!.listeners.size).toBe(0);
  });

  it('does not watch the device pixel ratio when the ratio is fixed', () => {
    const queries = stubMatchMedia();
    vi.stubGlobal('devicePixelRatio', 3);
    const { root } = setup({ pixelRatio: 1.25 });
    expect(root.pixelRatio).toBe(1.25);
    expect(queries).toEqual([]);
  });

  it('assumes a ratio of 1 when the window reports none', () => {
    const queries = stubMatchMedia();
    vi.stubGlobal('devicePixelRatio', undefined);
    const { root, renderer } = setup({ pixelRatio: undefined });
    expect(root.pixelRatio).toBe(1);
    expect(renderer.pixelRatio).toBe(1);
    expect(queries.map((q) => q.media)).toEqual(['(resolution: 1dppx)']);
  });
});

describe('RenderRoot on a shared renderer: pixel ratio', () => {
  /** Roots that share one fake renderer (as in render-root.test.ts). */
  function shared() {
    const fakes: ReturnType<typeof createFakeRenderer>[] = [];
    const createRenderer = () => {
      const fake = createFakeRenderer();
      fakes.push(fake);
      return fake.renderer as unknown as WebGLRenderer;
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      return { canvas: this, drawImage: vi.fn(), globalCompositeOperation: 'source-over' } as never;
    });
    const scheduler = createFakeScheduler();
    const mount = (options: RenderRootOptions = {}) => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      return createRenderRoot(container, {
        width: 400,
        height: 300,
        pixelRatio: 2,
        responsive: false,
        scheduler,
        createRenderer,
        shared: true,
        ...options,
      });
    };
    return { fakes, scheduler, mount };
  }

  it('setPixelRatio resizes the root’s own canvas and leaves the shared renderer for the next frame', () => {
    const { fakes, mount } = shared();
    const root = mount();
    const { calls } = fakes[0]!;
    calls.length = 0;

    root.setPixelRatio(3);

    expect([root.canvas.width, root.canvas.height]).toEqual([1200, 900]);
    expect([root.canvas.style.width, root.canvas.style.height]).toEqual(['400px', '300px']);
    // Other roots may draw with the renderer before this one does: its ratio is set per frame.
    expect(calls).toEqual([]);
    root.renderNow();
    expect(calls[0]).toBe('buffer 1200x900@3');
  });

  it('activate points the shared renderer at the root: its pixel ratio and its canvas', () => {
    const { fakes, mount } = shared();
    const a = mount();
    const b = mount({ width: 100, height: 100, pixelRatio: 3 });
    const { calls, renderer } = fakes[0]!;
    b.renderNow();
    // The buffer fits the larger root (400×300 at 2); b draws at its own ratio.
    expect(calls.at(0)).toBe('buffer 800x600@3');
    expect(presentedCanvas(renderer as unknown as WebGLRenderer)).toBe(b.canvas);
    calls.length = 0;

    a.activate();

    expect(calls).toEqual(['buffer 800x600@2']);
    expect(renderer.pixelRatio).toBe(2);
    expect(presentedCanvas(renderer as unknown as WebGLRenderer)).toBe(a.canvas);
    // Already set up for a: nothing to do.
    a.activate();
    expect(calls).toEqual(['buffer 800x600@2']);
  });

  it('activate does nothing on a destroyed root', () => {
    const { fakes, mount } = shared();
    const a = mount();
    const b = mount({ width: 100, height: 100, pixelRatio: 3 });
    const { calls, renderer } = fakes[0]!;
    b.renderNow();
    a.destroy();
    calls.length = 0;
    a.activate();
    expect(calls).toEqual([]);
    expect(presentedCanvas(renderer as unknown as WebGLRenderer)).toBe(b.canvas);
  });

  it('activate does nothing on a root with its own context', () => {
    const { root, renderer, calls, canvas } = setup();
    calls.length = 0;
    root.activate();
    expect(calls).toEqual([]);
    expect(presentedCanvas(renderer as unknown as WebGLRenderer)).toBe(canvas);
  });
});
