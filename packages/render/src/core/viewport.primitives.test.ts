import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  type OrthographicCamera,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Primitive } from '../types.ts';
import { Viewport, type ViewportHost } from './viewport.ts';

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
  const setViewport = vi.fn();
  const dispose = vi.fn();
  const p: Primitive<unknown> = {
    object: new Object3D(),
    update: vi.fn(),
    setTransform: vi.fn(),
    setViewport,
    dispose,
  };
  return { p, setViewport, dispose };
}

describe('Viewport primitives', () => {
  it('registers a primitive once', () => {
    const h = host();
    const vp = new Viewport(h, { rect: { x: 0, y: 0, width: 100, height: 50 } });
    const { p, setViewport } = fakePrimitive();
    expect(vp.add(p)).toBe(p);
    h.invalidate.mockClear();

    expect(vp.add(p)).toBe(p);

    expect(vp.primitives.size).toBe(1);
    expect(vp.scene.children).toEqual([p.object]);
    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it('removes a primitive without disposing it by default', () => {
    const h = host();
    const vp = new Viewport(h, { rect: { x: 0, y: 0, width: 100, height: 50 } });
    const { p, dispose } = fakePrimitive();
    vp.add(p);
    h.invalidate.mockClear();

    vp.remove(p);

    expect(vp.primitives.has(p)).toBe(false);
    expect(vp.scene.children).toEqual([]);
    expect(dispose).not.toHaveBeenCalled();
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });

  it('ignores the removal of a primitive it does not hold', () => {
    const h = host();
    const vp = new Viewport(h, { rect: { x: 0, y: 0, width: 100, height: 50 } });
    const mine = fakePrimitive();
    const stranger = fakePrimitive();
    vp.add(mine.p);
    h.invalidate.mockClear();

    vp.remove(stranger.p, { dispose: true });

    expect(stranger.dispose).not.toHaveBeenCalled();
    expect(vp.primitives.size).toBe(1);
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it('disposes primitives and what was added to the scene directly, once', () => {
    const vp = new Viewport(host(), { rect: { x: 0, y: 0, width: 100, height: 50 } });
    const { p, dispose } = fakePrimitive();
    vp.add(p);
    const single = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const multi = new Mesh(new BoxGeometry(), [new MeshBasicMaterial(), new MeshBasicMaterial()]);
    const group = new Object3D();
    group.add(multi);
    vp.scene.add(single, group);
    const disposed: string[] = [];
    single.geometry.addEventListener('dispose', () => void disposed.push('single geometry'));
    single.material.addEventListener('dispose', () => void disposed.push('single material'));
    multi.geometry.addEventListener('dispose', () => void disposed.push('multi geometry'));
    multi.material.forEach((m, i) =>
      m.addEventListener('dispose', () => void disposed.push(`multi material ${i}`)),
    );

    vp.dispose();
    vp.dispose();

    expect(vp.disposed).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(disposed.sort()).toEqual([
      'multi geometry',
      'multi material 0',
      'multi material 1',
      'single geometry',
      'single material',
    ]);
    expect(vp.scene.children).toEqual([]);
    expect(vp.primitives.size).toBe(0);
  });
});

describe('Viewport order', () => {
  it('tells the root and schedules a frame when the order changes, not when it is set to the same value', () => {
    const h = host();
    const vp = new Viewport(h, { rect: { x: 0, y: 0, width: 10, height: 10 }, order: 3 });
    const onOrderChange = vi.fn();
    vp.onOrderChange = onOrderChange;
    h.invalidate.mockClear();

    vp.order = 3;
    expect(onOrderChange).not.toHaveBeenCalled();
    expect(h.invalidate).not.toHaveBeenCalled();

    vp.order = 5;
    expect(vp.order).toBe(5);
    expect(onOrderChange).toHaveBeenCalledTimes(1);
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });
});

describe('Viewport clip rect', () => {
  it('scissors to a custom clip rect while drawing into the whole canvas', () => {
    const clip = { x: 50, y: 60, width: 300, height: 200 };
    const vp = new Viewport(host(800, 600), {
      rect: { x: 100, y: 100, width: 200, height: 100 },
      clip,
    });
    expect(vp.scissor).toEqual(clip);
    expect(vp.clip).toEqual(clip);
    // A copy: later changes to the caller's object do not move the scissor.
    clip.x = 999;
    expect(vp.clip).toMatchObject({ x: 50 });
    expect(vp.renderArea).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(vp.size).toEqual({ width: 800, height: 600, pixelRatio: 2 });
    // World (0, 0) stays at the rect's bottom-left: container (100, 200).
    const cam = vp.camera as OrthographicCamera;
    cam.updateMatrixWorld();
    const ndc = new Vector3(0, 0, 0).project(cam);
    expect(ndc.x).toBeCloseTo((100 / 800) * 2 - 1);
    expect(ndc.y).toBeCloseTo(1 - (200 / 600) * 2);
  });

  it('setClip switches between clipped, unclipped and a custom rect', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 };
    const vp = new Viewport(host(800, 600), { rect });
    const { p, setViewport } = fakePrimitive();
    vp.add(p);
    expect(vp.scissor).toEqual(rect);
    expect(vp.renderArea).toEqual(rect);

    vp.setClip(false);
    expect(vp.scissor).toBeNull();
    expect(vp.renderArea).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(setViewport).toHaveBeenLastCalledWith({ width: 800, height: 600, pixelRatio: 2 });

    vp.setClip({ x: 0, y: 0, width: 400, height: 300 });
    expect(vp.scissor).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(vp.renderArea).toEqual({ x: 0, y: 0, width: 800, height: 600 });

    vp.setClip(true);
    expect(vp.scissor).toEqual(rect);
    expect(vp.renderArea).toEqual(rect);
    expect(setViewport).toHaveBeenLastCalledWith({ width: 200, height: 100, pixelRatio: 2 });
  });
});

describe('Viewport orthographic zoom', () => {
  it('setOrthoHalfHeight sets the visible half height, keeping the aspect', () => {
    const h = host();
    const vp = new Viewport(h, {
      kind: '3d',
      projection: 'orthographic',
      rect: { x: 0, y: 0, width: 300, height: 200 },
    });
    const cam = vp.camera as OrthographicCamera;
    expect([cam.left, cam.right, cam.top, cam.bottom]).toEqual([-1.5, 1.5, 1, -1]);
    h.invalidate.mockClear();

    vp.setOrthoHalfHeight(4);

    expect([cam.left, cam.right, cam.top, cam.bottom]).toEqual([-6, 6, 4, -4]);
    expect(h.invalidate).toHaveBeenCalled();
    // The projection matrix was rebuilt: the corner of the new frustum lands on the NDC corner.
    cam.updateMatrixWorld();
    const corner = new Vector3(6, 4, -1).project(cam);
    expect(corner.x).toBeCloseTo(1);
    expect(corner.y).toBeCloseTo(1);
  });
});
