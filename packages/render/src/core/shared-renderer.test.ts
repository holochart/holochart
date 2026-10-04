// @vitest-environment jsdom
import type { WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireSharedRenderer,
  dedicatedContextCount,
  presentedCanvas,
  SharedRenderer,
  trackDedicatedContext,
  type SharedClient,
} from './shared-renderer.ts';

/** The part of a `WebGLRenderer` a shared renderer drives; no WebGL involved. */
function createFakeRenderer() {
  const canvas = document.createElement('canvas');
  const buffers: string[] = [];
  const renderer = {
    domElement: canvas,
    autoClear: true,
    info: { autoReset: true },
    renderLists: { dispose: vi.fn() },
    setDrawingBufferSize(w: number, h: number, pixelRatio: number) {
      // What three does: floor the logical size times the ratio.
      buffers.push(`${Math.floor(w * pixelRatio)}x${Math.floor(h * pixelRatio)}@${pixelRatio}`);
    },
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  };
  return { renderer, canvas, buffers, three: renderer as unknown as WebGLRenderer };
}

function client(width: number, height: number, pixelRatio: number): SharedClient {
  return { size: { width, height, pixelRatio }, contextLost: vi.fn(), contextRestored: vi.fn() };
}

/** A 2D context of a `width`×`height` canvas that records `drawImage` calls. */
function target(width: number, height: number) {
  const drawImage = vi.fn();
  const context = {
    canvas: { width, height },
    globalCompositeOperation: 'source-over',
    drawImage,
  };
  return { drawImage, context, ctx: context as unknown as CanvasRenderingContext2D };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SharedRenderer', () => {
  it('takes over clearing and counts its clients', () => {
    const { renderer, three, canvas } = createFakeRenderer();
    const shared = new SharedRenderer(three, () => undefined);
    expect(shared.canvas).toBe(canvas);
    expect(renderer.autoClear).toBe(false);
    expect(renderer.info.autoReset).toBe(false);
    expect(shared.clients).toBe(0);
    const a = client(100, 100, 1);
    shared.add(a);
    shared.add(a);
    shared.add(client(50, 50, 1));
    expect(shared.clients).toBe(2);
  });

  it('sizes the drawing buffer to the largest client, in device px', () => {
    const { three, buffers } = createFakeRenderer();
    const shared = new SharedRenderer(three, () => undefined);
    const wide = client(300, 100, 2);
    const tall = client(100.5, 250, 1);
    shared.add(wide);
    shared.add(tall);
    const canvas = document.createElement('canvas');

    shared.begin(tall, canvas);
    // 300×2 wide, 250×1 tall; fractional device sizes round up (100.5 → 101 < 600).
    expect(buffers).toEqual(['600x250@1']);
    shared.begin(tall, canvas);
    expect(buffers).toHaveLength(1);
    shared.begin(wide, canvas);
    expect(buffers).toEqual(['600x250@1', '600x250@2']);
  });

  it('presentedCanvas is the canvas of the root being drawn, or the renderer’s own', () => {
    const { three, canvas } = createFakeRenderer();
    expect(presentedCanvas(three)).toBe(canvas);
    const shared = new SharedRenderer(three, () => undefined);
    const a = client(10, 10, 1);
    const b = client(10, 10, 1);
    shared.add(a);
    shared.add(b);
    const canvasA = document.createElement('canvas');
    const canvasB = document.createElement('canvas');
    shared.begin(a, canvasA);
    expect(presentedCanvas(three)).toBe(canvasA);
    shared.begin(b, canvasB);
    expect(presentedCanvas(three)).toBe(canvasB);
  });

  it('copies the bottom-left corner of the buffer into a figure’s canvas, replacing its pixels', () => {
    const { three, canvas } = createFakeRenderer();
    const shared = new SharedRenderer(three, () => undefined);
    const big = client(400, 300, 1);
    const small = client(200, 100, 1);
    shared.add(big);
    shared.add(small);
    shared.begin(small, document.createElement('canvas'));
    const { drawImage, context, ctx } = target(200, 100);

    shared.present(ctx);

    // GL's origin is bottom-left: the frame is the last 100 of the buffer's 300 rows.
    expect(drawImage).toHaveBeenCalledWith(canvas, 0, 200, 200, 100, 0, 0, 200, 100);
    expect(context.globalCompositeOperation).toBe('copy');
  });

  it('presents nothing into a canvas without area', () => {
    const { three } = createFakeRenderer();
    const shared = new SharedRenderer(three, () => undefined);
    const c = client(100, 100, 1);
    shared.add(c);
    shared.begin(c, document.createElement('canvas'));
    for (const [w, h] of [
      [0, 100],
      [100, 0],
    ] as const) {
      const { drawImage, context, ctx } = target(w, h);
      shared.present(ctx);
      expect(drawImage).not.toHaveBeenCalled();
      expect(context.globalCompositeOperation).toBe('source-over');
    }
  });

  it('releases the context with its last client, and only for clients it has', () => {
    const { renderer, three, canvas } = createFakeRenderer();
    const onEmpty = vi.fn();
    const shared = new SharedRenderer(three, onEmpty);
    const a = client(10, 10, 1);
    const b = client(10, 10, 1);
    shared.add(a);
    shared.add(b);

    shared.remove(client(10, 10, 1));
    shared.remove(a);
    shared.remove(a);
    expect(shared.clients).toBe(1);
    expect(onEmpty).not.toHaveBeenCalled();
    expect(renderer.dispose).not.toHaveBeenCalled();

    shared.remove(b);
    expect(onEmpty).toHaveBeenCalledTimes(1);
    expect(renderer.renderLists.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    // It no longer listens to the canvas.
    shared.add(a);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(a.contextLost).not.toHaveBeenCalled();
  });

  it('still drops the context when disposing the renderer fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { renderer, three } = createFakeRenderer();
    const failure = new Error('dispose failed');
    renderer.dispose.mockImplementation(() => {
      throw failure;
    });
    const onEmpty = vi.fn();
    const shared = new SharedRenderer(three, onEmpty);
    const a = client(10, 10, 1);
    shared.add(a);

    shared.remove(a);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![1]).toBe(failure);
    expect(onEmpty).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  });
});

describe('acquireSharedRenderer', () => {
  it('pools one renderer per factory and context attributes, until its last client leaves', () => {
    const made: ReturnType<typeof createFakeRenderer>[] = [];
    const factory = vi.fn(() => {
      const fake = createFakeRenderer();
      made.push(fake);
      return fake.three;
    });
    const smooth = acquireSharedRenderer({ antialias: true }, factory);
    // The default power preference is the same pool as an explicit 'default'.
    expect(acquireSharedRenderer({ antialias: true, powerPreference: 'default' }, factory)).toBe(
      smooth,
    );
    const crisp = acquireSharedRenderer({ antialias: false }, factory);
    const fast = acquireSharedRenderer(
      { antialias: true, powerPreference: 'high-performance' },
      factory,
    );
    expect(new Set([smooth, crisp, fast]).size).toBe(3);
    expect(factory).toHaveBeenCalledTimes(3);
    expect(factory.mock.calls[2]).toEqual([
      { antialias: true, powerPreference: 'high-performance' },
    ]);
    // Another factory has its own pool.
    const other = acquireSharedRenderer({ antialias: true }, () => createFakeRenderer().three);
    expect(other).not.toBe(smooth);

    const a = client(10, 10, 1);
    smooth.add(a);
    smooth.remove(a);
    expect(made[0]!.renderer.dispose).toHaveBeenCalledTimes(1);
    const next = acquireSharedRenderer({ antialias: true }, factory);
    expect(next).not.toBe(smooth);
    expect(factory).toHaveBeenCalledTimes(4);
  });
});

describe('dedicated context count', () => {
  it('counts roots with their own context and never goes below zero', () => {
    const before = dedicatedContextCount();
    trackDedicatedContext(1);
    trackDedicatedContext(1);
    expect(dedicatedContextCount()).toBe(before + 2);
    trackDedicatedContext(-1);
    trackDedicatedContext(-1);
    expect(dedicatedContextCount()).toBe(before);
    for (let i = 0; i <= before; i++) trackDedicatedContext(-1);
    expect(dedicatedContextCount()).toBe(0);
    // Leave the module as it was found.
    for (let i = 0; i < before; i++) trackDedicatedContext(1);
    expect(dedicatedContextCount()).toBe(before);
  });
});
