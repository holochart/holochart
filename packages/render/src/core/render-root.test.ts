// @vitest-environment jsdom
import type { WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRenderRoot, type RenderRootOptions } from './render-root.ts';
import { createFakeScheduler } from './test-utils.ts';
import type { Primitive } from '../types.ts';
import { Object3D, Texture } from 'three';

/** Records the renderer calls the root makes; no WebGL involved. */
function createFakeRenderer() {
  const canvas = document.createElement('canvas');
  const calls: string[] = [];
  const renderer = {
    domElement: canvas,
    autoClear: true,
    info: { autoReset: true, reset: vi.fn() },
    renderLists: { dispose: vi.fn() },
    pixelRatio: 1,
    width: 0,
    height: 0,
    setPixelRatio(v: number) {
      this.pixelRatio = v;
    },
    setSize(w: number, h: number) {
      this.width = w;
      this.height = h;
      calls.push(`size ${w}x${h}`);
    },
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
  observed: Element[] = [];
  disconnected = false;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
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

beforeEach(() => {
  FakeResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('RenderRoot', () => {
  it('mounts the canvas and sizes it with the pixel ratio', () => {
    const { root, container, canvas, renderer } = setup();
    expect(container.contains(canvas)).toBe(true);
    expect(root.size).toEqual({ width: 800, height: 600, pixelRatio: 2 });
    expect(renderer.pixelRatio).toBe(2);
    expect(renderer.autoClear).toBe(false);
    expect(renderer.info.autoReset).toBe(false);
    expect(root.overlay?.rect).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('renders viewports scissored, in order, overlay last', () => {
    const { root, scheduler, calls } = setup();
    const a = root.addViewport({ rect: { x: 0, y: 0, width: 400, height: 300 }, order: 1 });
    const b = root.addViewport({ rect: { x: 400, y: 300, width: 400, height: 300 }, order: 0 });
    for (const vp of [a, b, root.overlay!]) vp.scene.add(new Object3D());
    const empty = root.addViewport({ rect: { x: 0, y: 0, width: 10, height: 10 }, order: 2 });
    expect(root.viewports.map((v) => v.name)).toEqual([b.name, a.name, empty.name, 'overlay']);
    calls.length = 0;
    scheduler.step();
    expect(calls).toEqual([
      'scissorTest false',
      'clear 11',
      // b: bottom-right quadrant → GL y = 0
      'scissor 400,0,400,300',
      'scissorTest true',
      'viewport 400,0,400,300',
      'render',
      // a: top-left quadrant → GL y = 300
      'scissor 0,300,400,300',
      'scissorTest true',
      'viewport 0,300,400,300',
      'render',
      // overlay
      'scissor 0,0,800,600',
      'scissorTest true',
      'viewport 0,0,800,600',
      'render',
      'scissorTest false',
    ]);
  });

  it('clears backgrounds and depth per viewport', () => {
    const { root, scheduler, calls } = setup({ overlay: false });
    root.addViewport({ kind: '3d', rect: { x: 0, y: 0, width: 100, height: 100 } });
    root.addViewport({ rect: { x: 100, y: 0, width: 100, height: 100 }, background: [1, 0, 0, 1] });
    calls.length = 0;
    scheduler.step();
    const clears = calls.filter((c) => c.startsWith('clear'));
    // Backgrounds are cleared even when a viewport has nothing to draw.
    expect(clears).toEqual(['clear 11', 'clear 01', 'clear 11']);
    expect(calls).not.toContain('render');
  });

  it('coalesces invalidations and emits frame events', () => {
    const { root, scheduler } = setup();
    const before = vi.fn();
    const after = vi.fn();
    root.on('beforerender', before);
    root.on('afterrender', after);
    scheduler.step(); // initial frame
    root.invalidate();
    root.context.invalidate();
    root.invalidate();
    expect(scheduler.queued).toBe(1);
    scheduler.step();
    expect(before).toHaveBeenCalledTimes(2);
    expect(after).toHaveBeenCalledTimes(2);
  });

  it('resizes responsively, relayouts viewports, and renders synchronously', () => {
    const { root, calls, container } = setup({ width: undefined, height: undefined });
    const ro = FakeResizeObserver.instances[0]!;
    expect(ro.observed).toEqual([container]);
    const setViewport = vi.fn();
    const p: Primitive<unknown> = {
      object: new Object3D(),
      update: vi.fn(),
      setTransform: vi.fn(),
      setViewport,
      dispose: vi.fn(),
    };
    const vp = root.addViewport({ clip: false, rect: { x: 10, y: 10, width: 50, height: 50 } });
    vp.add(p);
    root.overlay!.scene.add(new Object3D());
    const onResize = vi.fn();
    root.on('resize', onResize);
    calls.length = 0;
    ro.fire(1000, 500);
    expect(root.size).toMatchObject({ width: 1000, height: 500 });
    expect(calls[0]).toBe('size 1000x500');
    expect(calls).toContain('render'); // flushed inside the observer callback
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(setViewport).toHaveBeenLastCalledWith({ width: 1000, height: 500, pixelRatio: 2 });
    expect(root.overlay?.rect).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
  });

  it('does not observe when not responsive', () => {
    setup({ responsive: false });
    expect(FakeResizeObserver.instances.length).toBe(0);
  });

  it('pauses on context loss and resumes on restore', () => {
    const { root, scheduler, canvas, calls } = setup();
    root.overlay!.scene.add(new Object3D());
    scheduler.step();
    const lost = vi.fn();
    const restored = vi.fn();
    root.on('contextlost', lost);
    root.on('contextrestored', restored);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(root.contextLost).toBe(true);
    expect(lost).toHaveBeenCalledTimes(1);
    root.invalidate();
    calls.length = 0;
    scheduler.step();
    expect(calls).not.toContain('render');
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(restored).toHaveBeenCalledTimes(1);
    expect(root.contextLost).toBe(false);
    scheduler.step();
    expect(calls).toContain('render');
  });

  it('routes points to the topmost viewport', () => {
    const { root } = setup();
    const a = root.addViewport({ rect: { x: 0, y: 0, width: 100, height: 100 } });
    const b = root.addViewport({ rect: { x: 50, y: 50, width: 100, height: 100 }, order: 1 });
    expect(root.viewportAt(10, 10)).toBe(a);
    expect(root.viewportAt(75, 75)).toBe(b);
    expect(root.viewportAt(500, 500)).toBeNull();
  });

  it('destroy disposes everything and removes listeners', () => {
    const { root, renderer, canvas, container, scheduler } = setup();
    const dispose = vi.fn();
    const vp = root.addViewport({ rect: { x: 0, y: 0, width: 10, height: 10 } });
    vp.add({
      object: new Object3D(),
      update: vi.fn(),
      setTransform: vi.fn(),
      setViewport: vi.fn(),
      dispose,
    });
    const texture = root.resources.acquire('t', () => new Texture());
    const textureDispose = vi.spyOn(texture, 'dispose');
    const ro = FakeResizeObserver.instances[0]!;
    const lost = vi.fn();
    root.on('contextlost', lost);

    root.destroy();
    root.destroy(); // idempotent

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(root.resources.stats()).toEqual([]);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(ro.disconnected).toBe(true);
    expect(container.contains(canvas)).toBe(false);
    expect(root.viewports.length).toBe(0);
    expect(scheduler.queued).toBe(0);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(lost).not.toHaveBeenCalled();
    expect(() => root.addViewport()).toThrow();
  });
});
