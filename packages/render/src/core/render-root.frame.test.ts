// @vitest-environment jsdom
import { Object3D, type WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Primitive } from '../types.ts';
import { createRenderRoot, type RenderRootOptions } from './render-root.ts';
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
    setPixelRatio: vi.fn(),
    setSize: (w: number, h: number) => void calls.push(`size ${w}x${h}`),
    setRenderTarget: vi.fn(),
    setClearColor: vi.fn(),
    clear: (c: boolean, d: boolean) => void calls.push(`clear ${+c}${+d}`),
    setScissor: (x: number, y: number, w: number, h: number) =>
      void calls.push(`scissor ${x},${y},${w},${h}`),
    setScissorTest: (on: boolean) => void calls.push(`scissorTest ${on}`),
    setViewport: (x: number, y: number, w: number, h: number) =>
      void calls.push(`viewport ${x},${y},${w},${h}`),
    render: (_scene: unknown, _camera: unknown) => void calls.push('render'),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  };
  return { renderer, calls, canvas };
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  fire(width: number, height: number) {
    this.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
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
    scheduler,
    createRenderer: () => fake.renderer as unknown as WebGLRenderer,
    ...options,
  });
  return { container, root, scheduler, ...fake };
}

function fakePrimitive(dispose: () => void = () => undefined) {
  const p: Primitive<unknown> = {
    object: new Object3D(),
    update: vi.fn(),
    setTransform: vi.fn(),
    setViewport: vi.fn(),
    dispose: vi.fn(dispose),
  };
  return p;
}

/** What a frame with nothing to draw does: clear the whole canvas, unscissored. */
const EMPTY_FRAME = ['scissorTest false', 'clear 11', 'scissorTest false'];

beforeEach(() => {
  FakeResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('RenderRoot frame', () => {
  it('neither clears nor draws a hidden viewport', () => {
    const { root, scheduler, calls } = setup({ overlay: false });
    const vp = root.addViewport({
      rect: { x: 0, y: 0, width: 100, height: 100 },
      background: [1, 0, 0, 1],
    });
    vp.scene.add(new Object3D());
    vp.visible = false;
    calls.length = 0;
    scheduler.step();
    expect(calls).toEqual(EMPTY_FRAME);

    vp.visible = true;
    root.invalidate();
    calls.length = 0;
    scheduler.step();
    expect(calls).toEqual([
      'scissorTest false',
      'clear 11',
      // Background clear of the rect (GL y = 600 − 100), then the draw.
      'scissor 0,500,100,100',
      'scissorTest true',
      'clear 11',
      'scissor 0,500,100,100',
      'scissorTest true',
      'viewport 0,500,100,100',
      'render',
      'scissorTest false',
    ]);
  });

  it('skips a viewport whose rect is empty', () => {
    const { root, scheduler, calls } = setup({ overlay: false });
    const flat = root.addViewport({
      rect: { x: 10, y: 10, width: 0, height: 100 },
      background: [0, 0, 1, 1],
    });
    const thin = root.addViewport({ rect: { x: 10, y: 10, width: 100, height: 0 } });
    flat.scene.add(new Object3D());
    thin.scene.add(new Object3D());
    calls.length = 0;
    scheduler.step();
    expect(calls).toEqual(EMPTY_FRAME);
  });

  it('renders continuously while an animation token is held', () => {
    const { root, scheduler } = setup();
    const continuous: boolean[] = [];
    root.on('afterrender', (info) => void continuous.push(info.continuous));
    scheduler.step(); // the frame the constructor scheduled
    const release = root.requestAnimation();
    scheduler.step();
    scheduler.step();
    expect(scheduler.queued).toBe(1);
    release();
    scheduler.step(); // the final frame
    expect(continuous).toEqual([false, true, true, false]);
    expect(scheduler.queued).toBe(0);
  });
});

describe('RenderRoot.removeViewport', () => {
  it('disposes the viewport, stops drawing it and schedules a frame', () => {
    const { root, scheduler, calls } = setup({ overlay: false });
    const vp = root.addViewport({ rect: { x: 0, y: 0, width: 100, height: 100 } });
    const p = fakePrimitive();
    vp.add(p);
    scheduler.step();

    root.removeViewport(vp);

    expect(p.dispose).toHaveBeenCalledTimes(1);
    expect(vp.disposed).toBe(true);
    expect(root.viewports).toEqual([]);
    expect(scheduler.queued).toBe(1);
    calls.length = 0;
    scheduler.step();
    expect(calls).toEqual(EMPTY_FRAME);
  });

  it('keeps the viewport’s primitives alive with dispose: false', () => {
    const { root } = setup({ overlay: false });
    const vp = root.addViewport({ rect: { x: 0, y: 0, width: 100, height: 100 } });
    const p = fakePrimitive();
    vp.add(p);

    root.removeViewport(vp, { dispose: false });

    expect(root.viewports).toEqual([]);
    expect(p.dispose).not.toHaveBeenCalled();
    expect(vp.disposed).toBe(false);
    expect(vp.primitives.has(p)).toBe(true);
    // The root no longer re-sorts for it.
    expect(vp.onOrderChange).toBeNull();
  });

  it('ignores a viewport it does not hold', () => {
    const { root, scheduler } = setup({ overlay: false });
    const other = setup({ overlay: false });
    const foreign = other.root.addViewport({ rect: { x: 0, y: 0, width: 10, height: 10 } });
    const p = fakePrimitive();
    foreign.add(p);
    const own = root.addViewport({ rect: { x: 0, y: 0, width: 10, height: 10 } });
    scheduler.step();

    root.removeViewport(foreign);

    expect(p.dispose).not.toHaveBeenCalled();
    expect(foreign.disposed).toBe(false);
    expect(root.viewports).toEqual([own]);
    expect(other.root.viewports).toEqual([foreign]);
    expect(scheduler.queued).toBe(0);
  });
});

describe('RenderRoot.resize', () => {
  it('rounds to whole CSS px and keeps at least 1×1', () => {
    const { root, calls } = setup();
    calls.length = 0;
    root.resize(640.4, 479.6);
    expect(root.size).toMatchObject({ width: 640, height: 480 });
    root.resize(0, -20);
    expect(root.size).toMatchObject({ width: 1, height: 1 });
    expect(calls).toEqual(['size 640x480', 'size 1x1']);
  });

  it('does nothing when the size is unchanged', () => {
    const { root, scheduler, calls } = setup();
    const onResize = vi.fn();
    root.on('resize', onResize);
    scheduler.step();
    calls.length = 0;
    // Rounds to the size it has.
    root.resize(800.3, 599.7);
    expect(calls).toEqual([]);
    expect(onResize).not.toHaveBeenCalled();
    expect(scheduler.queued).toBe(0);
  });

  it('does nothing once destroyed', () => {
    const { root, calls } = setup();
    root.destroy();
    calls.length = 0;
    root.resize(100, 100);
    expect(root.size).toMatchObject({ width: 800, height: 600 });
    expect(calls).toEqual([]);
  });

  it('draws nothing for an observer notification that leaves the size unchanged', () => {
    const { root, scheduler, calls } = setup();
    root.overlay!.scene.add(new Object3D());
    scheduler.step();
    const observer = FakeResizeObserver.instances[0]!;
    calls.length = 0;
    observer.fire(800, 600);
    expect(calls).toEqual([]);
    expect(root.loop.frameCount).toBe(1);

    // With a real change it sizes and draws within the notification.
    observer.fire(400, 300);
    expect(calls[0]).toBe('size 400x300');
    expect(calls).toContain('render');
    expect(root.loop.frameCount).toBe(2);
    expect(scheduler.queued).toBe(0);
  });
});

describe('RenderRoot.destroy', () => {
  it('releases the context even when a primitive fails to dispose', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { root, renderer, canvas, container } = setup({ overlay: false });
    const failure = new Error('dispose failed');
    const broken = fakePrimitive(() => {
      throw failure;
    });
    const healthy = fakePrimitive();
    root.addViewport({ rect: { x: 0, y: 0, width: 10, height: 10 } }).add(broken);
    root.addViewport({ rect: { x: 0, y: 0, width: 10, height: 10 } }).add(healthy);

    root.destroy();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![1]).toBe(failure);
    // The next viewport is still disposed, and so is the renderer.
    expect(healthy.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(container.contains(canvas)).toBe(false);
    expect(root.destroyed).toBe(true);
  });

  it('finishes when the context cannot be force-lost', () => {
    const { root, renderer, canvas, container } = setup();
    renderer.forceContextLoss.mockImplementation(() => {
      throw new Error('WEBGL_lose_context unavailable');
    });
    root.destroy();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(container.contains(canvas)).toBe(false);
    expect(root.destroyed).toBe(true);
  });
});
