import { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { Primitive } from '../types.ts';
import type { ExtrusionHost } from './extrusion.ts';
import { extrudeRects, extrusionModuleLoaded, loadExtrusionModule } from './extrusion-loader.ts';
import { meshModuleLoaded } from './mesh-loader.ts';

/**
 * Lazy loading of the 2.5D code (plan E8.9). The tests run in order and share the loaders' module
 * state (vitest isolates it per file): the first tests see nothing loaded.
 */

function host(trace: Record<string, unknown>) {
  const added: Primitive<unknown>[] = [];
  const h: ExtrusionHost & { added: Primitive<unknown>[] } = {
    primitives: { resources: createResourceManager(), invalidate: vi.fn<() => void>() },
    trace,
    transform: { scaleX: 10, scaleY: 10, offsetX: 0, offsetY: 0 },
    add: (p) => void added.push(p),
    remove: (p) => void added.splice(added.indexOf(p), 1),
    added,
  };
  return h;
}

const DATA = {
  x0: new Float64Array([0]),
  x1: new Float64Array([1]),
  y0: new Float64Array([0]),
  y1: new Float64Array([2]),
};

describe('extrudeRects', () => {
  it('loads nothing for flat traces', async () => {
    const h = host({ depth: 0 });
    const rects = { object: new Object3D() };
    extrudeRects(h, rects, DATA, []);
    await Promise.resolve();
    expect(extrusionModuleLoaded()).toBeNull();
    expect(meshModuleLoaded()).toBeNull();
    expect(h.added).toEqual([]);
    expect(rects.object.visible).toBe(true);
  });

  it('loads the 2.5D and mesh code for a trace with depth; ready covers the load', async () => {
    const h = host({ depth: 20 });
    const rects = { object: new Object3D() };
    extrudeRects(h, rects, DATA, []);
    // A placeholder that draws nothing, whose `ready` chart.ready waits for.
    expect(h.added).toHaveLength(1);
    const wait = h.added[0] as Primitive<unknown> & { ready: Promise<void> };
    expect(wait.object.children).toEqual([]);
    await wait.ready;
    expect(extrusionModuleLoaded()).not.toBeNull();
    expect(meshModuleLoaded()).not.toBeNull();
    // Replaced by the extrusion primitive; the flat rects hide.
    expect(h.added).toHaveLength(1);
    const p = h.added[0]!;
    expect(p).toBeInstanceOf(extrusionModuleLoaded()!.ExtrusionPrimitive);
    expect(rects.object.visible).toBe(false);
    // Loaded: synchronous from now on, the same primitive per flat rect primitive.
    extrudeRects(h, rects, DATA, []);
    expect(h.added).toEqual([p]);
    extrudeRects({ ...h, trace: { depth: 0 } }, rects, DATA, []);
    expect(h.added).toEqual([]);
    expect(rects.object.visible).toBe(true);
    await expect(loadExtrusionModule()).resolves.toBe(extrusionModuleLoaded());
  });
});
