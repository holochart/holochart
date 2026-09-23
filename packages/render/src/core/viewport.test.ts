import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Primitive, ViewportSize } from '../types.ts';
import { Object3D } from 'three';
import {
  intersectRect,
  orthoFrustum,
  renderAreaFor,
  scissorFor,
  toGLRect,
  Viewport,
  type ViewportHost,
} from './viewport.ts';

function host(width = 800, height = 600, pixelRatio = 2) {
  const h = {
    canvasWidth: width,
    canvasHeight: height,
    pixelRatio,
    invalidate: vi.fn<() => void>(),
  };
  return h satisfies ViewportHost;
}

function fakePrimitive() {
  const sizes: ViewportSize[] = [];
  const p: Primitive<unknown> = {
    object: new Object3D(),
    update: vi.fn(),
    setTransform: vi.fn(),
    setViewport: (s) => void sizes.push({ ...s }),
    dispose: vi.fn(),
  };
  return { p, sizes };
}

describe('viewport math', () => {
  it('converts top-left rects to GL bottom-left rects', () => {
    expect(toGLRect({ x: 10, y: 20, width: 100, height: 50 }, 600)).toEqual({
      x: 10,
      y: 530,
      width: 100,
      height: 50,
    });
  });

  it('intersects rects', () => {
    expect(
      intersectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }),
    ).toEqual({
      x: 5,
      y: 5,
      width: 5,
      height: 5,
    });
    expect(
      intersectRect({ x: 0, y: 0, width: 1, height: 1 }, { x: 5, y: 5, width: 1, height: 1 }).width,
    ).toBe(0);
  });

  it('puts the 2D world origin at the rect bottom-left', () => {
    const rect = { x: 100, y: 50, width: 200, height: 100 };
    expect(orthoFrustum(rect, rect)).toEqual({ left: 0, right: 200, top: 100, bottom: 0 });
    // Rendering into the whole canvas (unclipped) keeps the same world origin.
    const canvas = { x: 0, y: 0, width: 800, height: 600 };
    expect(orthoFrustum(rect, canvas)).toEqual({ left: -100, right: 700, top: 150, bottom: -450 });
  });

  it('chooses render areas and scissors from the clip mode', () => {
    const rect = { x: 10, y: 10, width: 50, height: 40 };
    expect(renderAreaFor('2d', rect, true, 800, 600)).toEqual(rect);
    expect(renderAreaFor('2d', rect, false, 800, 600)).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    expect(renderAreaFor('3d', rect, false, 800, 600)).toEqual(rect);
    expect(scissorFor(rect, true)).toEqual(rect);
    expect(scissorFor(rect, false)).toBeNull();
    const custom = { x: 0, y: 0, width: 5, height: 5 };
    expect(scissorFor(rect, custom)).toEqual(custom);
  });
});

describe('Viewport', () => {
  it('maps world pixels of a 2D viewport onto its rect', () => {
    const vp = new Viewport(host(), { rect: { x: 100, y: 50, width: 200, height: 100 } });
    const cam = vp.camera as OrthographicCamera;
    cam.updateMatrixWorld();
    // World (0,0) → NDC (-1,-1): bottom-left of the render area (= rect when clipped).
    const p = new Vector3(0, 0, 0).project(cam);
    expect(p.x).toBeCloseTo(-1);
    expect(p.y).toBeCloseTo(-1);
    const q = new Vector3(200, 100, 0).project(cam);
    expect(q.x).toBeCloseTo(1);
    expect(q.y).toBeCloseTo(1);
    expect(vp.size).toEqual({ width: 200, height: 100, pixelRatio: 2 });
    expect(vp.toWorld(110, 140)).toEqual({ x: 10, y: 10 });
    expect(vp.contains(110, 140)).toBe(true);
    expect(vp.contains(99, 140)).toBe(false);
  });

  it('calls setViewport on registered primitives when the rect changes', () => {
    const h = host();
    const vp = new Viewport(h, { rect: { x: 0, y: 0, width: 100, height: 100 } });
    const { p, sizes } = fakePrimitive();
    vp.add(p);
    expect(vp.scene.children).toContain(p.object);
    expect(sizes).toEqual([{ width: 100, height: 100, pixelRatio: 2 }]);
    vp.setRect({ x: 0, y: 0, width: 300, height: 150 });
    expect(sizes.at(-1)).toEqual({ width: 300, height: 150, pixelRatio: 2 });
    const n = sizes.length;
    vp.setRect({ x: 0, y: 0, width: 300, height: 150 }); // unchanged → no call
    vp.setRect({ x: 10, y: 10, width: 300, height: 150 }); // moved, same size → no call
    expect(sizes.length).toBe(n);
    expect(h.invalidate).toHaveBeenCalled();
  });

  it('hands unclipped 2D primitives the canvas-sized render area', () => {
    const vp = new Viewport(host(800, 600), {
      rect: { x: 100, y: 100, width: 200, height: 100 },
      clip: false,
    });
    const { p, sizes } = fakePrimitive();
    vp.add(p);
    expect(vp.scissor).toBeNull();
    expect(sizes[0]).toEqual({ width: 800, height: 600, pixelRatio: 2 });
    const cam = vp.camera as OrthographicCamera;
    cam.updateMatrixWorld();
    // World (0,0) must land at container (100, 200) → NDC x = 100/800*2-1, y = 1 - 200/600*2.
    const ndc = new Vector3(0, 0, 0).project(cam);
    expect(ndc.x).toBeCloseTo(-0.75);
    expect(ndc.y).toBeCloseTo(1 - 400 / 600);
  });

  it('keeps 3D perspective aspect in sync', () => {
    const vp = new Viewport(host(), { kind: '3d', rect: { x: 0, y: 0, width: 400, height: 200 } });
    expect(vp.camera).toBeInstanceOf(PerspectiveCamera);
    expect((vp.camera as PerspectiveCamera).aspect).toBe(2);
    expect(vp.clearDepth).toBe(true);
    vp.setRect({ x: 0, y: 0, width: 100, height: 200 });
    expect((vp.camera as PerspectiveCamera).aspect).toBe(0.5);
  });

  it('supports 3D orthographic cameras', () => {
    const vp = new Viewport(host(), {
      kind: '3d',
      projection: 'orthographic',
      orthoHalfHeight: 2,
      rect: { x: 0, y: 0, width: 400, height: 200 },
    });
    const cam = vp.camera as OrthographicCamera;
    expect([cam.left, cam.right, cam.top, cam.bottom]).toEqual([-4, 4, 2, -2]);
  });

  it('fits the canvas when fit is set', () => {
    const vp = new Viewport(host(640, 480), { fit: true });
    expect(vp.rect).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });

  it('removes and disposes primitives', () => {
    const vp = new Viewport(host(), { rect: { x: 0, y: 0, width: 10, height: 10 } });
    const a = fakePrimitive().p;
    const b = fakePrimitive().p;
    vp.add(a);
    vp.add(b);
    vp.remove(a, { dispose: true });
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(vp.scene.children).not.toContain(a.object);
    vp.dispose();
    expect(b.dispose).toHaveBeenCalledTimes(1);
    expect(vp.primitives.size).toBe(0);
    expect(vp.scene.children.length).toBe(0);
  });
});
