import { Mesh, ShaderMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { FillPrimitive } from './fill.ts';
import {
  createLazyFillPrimitive,
  fillPrimitiveLoaded,
  preloadFillPrimitive,
  type LazyFillPrimitive,
} from './fill-loader.ts';

/**
 * Lazy fill primitive (plan E21.6). The tests run in order and share the loader's module state
 * (vitest isolates it per file): the first test sees the fill code not loaded yet.
 */

function context(): PrimitiveContext & { invalidate: ReturnType<typeof vi.fn<() => void>> } {
  return { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
}

const SQUARE = {
  x: [0, 1, 1, 0],
  y: [0, 0, 1, 1],
  color: [1, 0, 0, 1] as [number, number, number, number],
};

const TRANSFORM = { scaleX: 2, scaleY: 3, scaleZ: 1, offsetX: 5, offsetY: 7, offsetZ: 0 };

function triangles(p: LazyFillPrimitive): number {
  return (p.fill?.triangulation.indices.length ?? 0) / 3;
}

describe('LazyFillPrimitive', () => {
  it('loads the fill code on first use, and ready covers the load', async () => {
    expect(fillPrimitiveLoaded()).toBe(false);
    const ctx = context();
    const p = createLazyFillPrimitive(ctx, SQUARE);
    // Until the code arrives: a hidden placeholder mesh, nothing drawn.
    expect(p.fill).toBeNull();
    expect(p.object).toBeInstanceOf(Mesh);
    expect(p.object.visible).toBe(false);
    // Everything received meanwhile applies once loaded.
    p.object.renderOrder = 4.5;
    p.setTransform(TRANSFORM);
    p.setViewport({ width: 300, height: 200, pixelRatio: 2 });
    p.update({ color: [0, 0, 1, 1], opacity: 0.5 });

    await p.ready;
    expect(fillPrimitiveLoaded()).toBe(true);
    const fill = p.fill!;
    expect(fill).toBeInstanceOf(FillPrimitive);
    // The fill draws into the object callers already hold.
    expect(fill.object).toBe(p.object);
    expect(p.object.visible).toBe(true);
    expect(p.object.renderOrder).toBe(4.5);
    expect(p.object.material).toBeInstanceOf(ShaderMaterial);
    const uniforms = (p.object.material as ShaderMaterial).uniforms;
    expect(uniforms['uOpacity']!.value).toBe(0.5);
    expect(triangles(p)).toBe(2);
    const color = p.object.geometry.getAttribute('aColor').array;
    expect(Array.from(color.slice(0, 4))).toEqual([0, 0, 1, 1]);
    expect(ctx.invalidate).toHaveBeenCalled();

    // The same transform as a FillPrimitive given it directly.
    const direct = new FillPrimitive(context(), { ...SQUARE, color: [0, 0, 1, 1], opacity: 0.5 });
    direct.setTransform(TRANSFORM);
    const uniformsOf = (m: FillPrimitive): Record<string, unknown> =>
      Object.fromEntries(
        Object.entries(m.object.material.uniforms).map(([k, u]) => [k, u.value as unknown]),
      );
    expect(uniformsOf(fill)).toEqual(uniformsOf(direct));
    direct.dispose();
    p.dispose();
  });

  it('draws at once once the code has loaded, and forwards updates', async () => {
    const p = createLazyFillPrimitive(context(), SQUARE);
    expect(p.fill).not.toBeNull();
    expect(p.object.visible).toBe(true);
    await expect(p.ready).resolves.toBeUndefined();
    // A stable promise: the runtime waits for each `ready` promise once.
    expect(p.ready).toBe(p.ready);

    p.update({ x: [0, 2, 2, 1, 0], y: [0, 0, 2, 3, 2] });
    expect(triangles(p)).toBe(3);
    p.object.renderOrder = 7;
    expect(p.fill!.object.renderOrder).toBe(7);
    p.dispose();
    expect(p.object.parent).toBeNull();
  });

  it('preloads', async () => {
    await expect(preloadFillPrimitive()).resolves.toBeUndefined();
    expect(fillPrimitiveLoaded()).toBe(true);
  });
});

describe('LazyFillPrimitive before the code has loaded', () => {
  it('disposed before the load: nothing is created', async () => {
    vi.resetModules();
    const loader = await import('./fill-loader.ts');
    expect(loader.fillPrimitiveLoaded()).toBe(false);
    const p = loader.createLazyFillPrimitive(context(), SQUARE);
    p.dispose();
    await p.ready;
    expect(loader.fillPrimitiveLoaded()).toBe(true);
    expect(p.fill).toBeNull();
    expect(p.object.visible).toBe(false);
  });

  it('a failed load resolves ready (undrawn) and the next update retries', async () => {
    vi.resetModules();
    let fail = true;
    vi.doMock('./fill-lazy.ts', async (importOriginal) => {
      if (fail) throw new Error('offline');
      return importOriginal();
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const loader = await import('./fill-loader.ts');
      const p = loader.createLazyFillPrimitive(context(), SQUARE);
      await p.ready;
      expect(p.fill).toBeNull();
      expect(loader.fillPrimitiveLoaded()).toBe(false);
      expect(error).toHaveBeenCalledTimes(1);

      fail = false;
      p.update({ opacity: 0.25 });
      await p.ready;
      expect(p.fill).not.toBeNull();
      expect(p.object.visible).toBe(true);
      expect((p.object.material as ShaderMaterial).uniforms['uOpacity']!.value).toBe(0.25);
      p.dispose();
    } finally {
      error.mockRestore();
      vi.doUnmock('./fill-lazy.ts');
    }
  });
});
