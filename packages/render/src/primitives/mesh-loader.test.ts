import { Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { createLazyMeshPrimitive, loadMeshModule, meshModuleLoaded } from './mesh-loader.ts';
import { MeshPrimitive } from './mesh.ts';

/**
 * Lazy mesh primitive (plan E2.11). The tests run in order and share the loader's module state
 * (vitest isolates it per file): the first test sees the mesh code not loaded yet.
 */

function context(): PrimitiveContext & { invalidate: ReturnType<typeof vi.fn<() => void>> } {
  return { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
}

const TRIANGLE = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) };

describe('LazyMeshPrimitive', () => {
  it('loads the mesh code on first use, and ready covers the load', async () => {
    expect(meshModuleLoaded()).toBeNull();
    const ctx = context();
    const p = createLazyMeshPrimitive(ctx, TRIANGLE);
    expect(p.mesh).toBeNull();
    expect(p.object).toBeInstanceOf(Mesh);
    expect(p.object.visible).toBe(false);
    expect(p.pickCount).toBe(0);
    expect(() => p.createPickMaterial()).toThrow();
    // Everything received meanwhile applies once loaded.
    p.object.renderOrder = 3;
    p.setTransform({ scaleX: 2, scaleY: 1, scaleZ: 1, offsetX: 1, offsetY: 0, offsetZ: 0 });
    p.setViewport({ width: 300, height: 200, pixelRatio: 2 });
    p.update({ opacity: 0.5 });
    const { createLightRig } = await loadMeshModule();
    const rig = createLightRig();
    p.setLightRig(rig);

    await p.ready;
    expect(meshModuleLoaded()).not.toBeNull();
    const mesh = p.mesh!;
    expect(mesh).toBeInstanceOf(MeshPrimitive);
    expect(mesh.object).toBe(p.object);
    expect(p.object.visible).toBe(true);
    expect(p.object.renderOrder).toBe(3);
    expect(p.object.scale.x).toBe(2);
    expect(mesh.data.opacity).toBe(0.5);
    expect(mesh.translucent).toBe(true);
    expect(p.pickCount).toBe(3);
    expect(p.pickKind).toBe('vertex');
    expect(p.createPickMaterial().material).toBeDefined();
    expect(ctx.invalidate).toHaveBeenCalled();
  });

  it('draws at once when the code has loaded; dispose releases the mesh', () => {
    const ctx = context();
    const p = createLazyMeshPrimitive(ctx, { ...TRIANGLE, intensity: [0, 1, 2] });
    expect(p.mesh).not.toBeNull();
    expect(ctx.resources.stats()).toHaveLength(1);
    p.update({ opacity: 0.2 });
    expect(p.mesh!.data.opacity).toBe(0.2);
    p.dispose();
    expect(p.mesh).toBeNull();
    expect(ctx.resources.stats()).toHaveLength(0);
    p.update({ opacity: 1 }); // ignored after dispose
  });
});
