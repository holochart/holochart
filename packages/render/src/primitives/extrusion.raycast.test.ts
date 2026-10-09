import { Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { DataTransform, PrimitiveContext } from '../types.ts';
import { createExtrusionPrimitive } from './extrusion.ts';
import { rectPrismVertexCount } from './extrusion-geometry.ts';
import { loadMeshModule } from './mesh-loader.ts';

/**
 * Pointer rays against extruded rects (plan E8.9, hover): the nearest prism wins whatever the
 * order of the rects, hits on a side are moved to the middle across that side, rays beside a prism
 * miss it, and rects that draw no prism (missing corners, no size, no depth, outside the plot area)
 * are never hit. Also what a disposed primitive ignores.
 */

function context() {
  return { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
}

/** 10 px per data unit. */
const T: DataTransform = { scaleX: 10, scaleY: 10, offsetX: 0, offsetY: 0 };
const DOWN = new Vector3(0, 0, -1);

describe('ExtrusionPrimitive.raycast', () => {
  it('returns the prism the ray reaches first, in either order of the rects', async () => {
    const mesh = await loadMeshModule();
    // World px: a low slab 0…20 × 0…30 (5 deep) and a tall post 10…30 × 10…20 (12 deep) in it.
    const slab = { x0: 0, x1: 2, y0: 0, y1: 3, depth: 5 };
    const post = { x0: 1, x1: 3, y0: 1, y1: 2, depth: 12 };
    for (const [first, second] of [
      [slab, post],
      [post, slab],
    ] as const) {
      const p = createExtrusionPrimitive(
        context(),
        {
          x0: [first.x0, second.x0],
          x1: [first.x1, second.x1],
          y0: [first.y0, second.y0],
          y1: [first.y1, second.y1],
          depth: new Float32Array([first.depth, second.depth]),
        },
        mesh,
      );
      p.setTransform(T);
      const postIndex = first === post ? 0 : 1;
      // Over both: the post's front face (z = 12) is reached before the slab's (z = 5).
      expect(p.raycast(new Vector3(15, 15, 100), DOWN)).toEqual({
        t: 88,
        x: 15,
        y: 15,
        index: postIndex,
      });
      // Over the slab only.
      expect(p.raycast(new Vector3(5, 5, 100), DOWN)).toEqual({
        t: 95,
        x: 5,
        y: 5,
        index: 1 - postIndex,
      });
      p.dispose();
    }
  });

  it('moves a hit on a bottom or top side to the middle across it, and keeps hits from inside', async () => {
    const mesh = await loadMeshModule();
    // World px: 0…20 × 0…30, 10 deep.
    const p = createExtrusionPrimitive(
      context(),
      { x0: [0], x1: [2], y0: [0], y1: [3], depth: 10 },
      mesh,
    );
    p.setTransform(T);
    // From below into the side at y = 0: x stays, y becomes the middle (15).
    expect(p.raycast(new Vector3(12, -50, 3), new Vector3(0, 1, 0))).toEqual({
      t: 50,
      x: 12,
      y: 15,
      index: 0,
    });
    // From above into the side at y = 30.
    expect(p.raycast(new Vector3(4, 70, 3), new Vector3(0, -1, 0))).toEqual({
      t: 40,
      x: 4,
      y: 15,
      index: 0,
    });
    // A ray starting inside the prism hits it where it starts.
    expect(p.raycast(new Vector3(5, 7, 5), DOWN)).toEqual({ t: 0, x: 5, y: 7, index: 0 });
    p.dispose();
  });

  it('misses a prism the ray passes beside, behind or level with', async () => {
    const mesh = await loadMeshModule();
    const p = createExtrusionPrimitive(
      context(),
      { x0: [0], x1: [2], y0: [0], y1: [3], depth: 10 },
      mesh,
    );
    p.setTransform(T);
    // Level with the prism, crossing x = 0 at y = 50 (the prism ends at y = 30).
    expect(p.raycast(new Vector3(-10, 40, 5), new Vector3(1, 1, 0))).toBeUndefined();
    // The same ray lower down crosses x = 0 at y = 15: into the left side.
    expect(p.raycast(new Vector3(-10, 5, 5), new Vector3(1, 1, 0))).toMatchObject({
      t: 10,
      x: 10,
      y: 15,
    });
    // Pointing away from it.
    expect(p.raycast(new Vector3(10, 15, 100), new Vector3(0, 0, 1))).toBeUndefined();
    // Passing over its front face.
    expect(p.raycast(new Vector3(-10, 15, 11), new Vector3(1, 0, 0))).toBeUndefined();
    p.dispose();
  });

  it('never hits rects that draw no prism: missing corners, no size, no depth, clipped away', async () => {
    const mesh = await loadMeshModule();
    const p = createExtrusionPrimitive(
      context(),
      {
        // Drawn; a missing corner; no width; no depth; beyond the x range; no height.
        x0: [0, NaN, 4, 6, 8, 10],
        x1: [1, 3, 4, 7, 9, 11],
        y0: [0, 0, 0, 0, 0, 0.5],
        y1: [1, 1, 1, 1, 1, 0.5],
        depth: new Float32Array([5, 5, 5, 0, 5, 5]),
        clip: { x: [0, 7.5], y: [0, 10] },
      },
      mesh,
    );
    p.setTransform(T);
    expect(p.raycast(new Vector3(5, 5, 100), DOWN)).toMatchObject({ t: 95, index: 0 });
    for (const x of [25, 40, 65, 85, 105]) {
      expect(p.raycast(new Vector3(x, 5, 100), DOWN)).toBeUndefined();
    }
    // Prisms are built for the rects with a size and a depth (the clip box cuts them when drawn).
    expect(p.mesh.layout.vertexCount).toBe(2 * rectPrismVertexCount(0));
    p.dispose();
  });
});

describe('ExtrusionPrimitive.dispose', () => {
  it('leaves the scene, frees its mesh once, and ignores updates and transforms afterwards', async () => {
    const mesh = await loadMeshModule();
    const ctx: PrimitiveContext & { invalidate: ReturnType<typeof vi.fn<() => void>> } = context();
    const p = createExtrusionPrimitive(
      ctx,
      { x0: [0], x1: [1], y0: [0], y1: [1], depth: 5, material: { type: 'standard' } },
      mesh,
    );
    const scene = new Scene();
    scene.add(p.object);
    // The prisms and the lights of three.js material types.
    expect(p.object.children).toHaveLength(2);
    const freed = vi.spyOn(p.mesh, 'dispose');
    p.dispose();
    expect(scene.children).toEqual([]);
    expect(p.object.children).toEqual([]);
    expect(freed).toHaveBeenCalledTimes(1);

    const frames = ctx.invalidate.mock.calls.length;
    const positions = p.mesh.data.positions;
    p.update({ depth: 20, material: { type: 'phong' } });
    p.setTransform({ ...T, scaleX: 40 });
    // Nothing is rebuilt, no lights come back, no frame is requested.
    expect(p.data.depth).toBe(5);
    expect(p.maxDepth).toBe(5);
    expect(p.mesh.data.positions).toBe(positions);
    expect(p.object.children).toEqual([]);
    expect(ctx.invalidate).toHaveBeenCalledTimes(frames);
    p.dispose();
    expect(freed).toHaveBeenCalledTimes(1);
  });
});
