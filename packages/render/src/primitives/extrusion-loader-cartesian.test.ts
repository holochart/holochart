import { Object3D, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { DataTransform, Primitive } from '../types.ts';
import { UNCLIPPED, type ExtrusionHost } from './extrusion.ts';
import {
  extrudeFills,
  extrudeHeatmap,
  extrudeRects,
  extrusionModuleLoaded,
} from './extrusion-loader.ts';
import { createLazyFillPrimitive, fillPrimitiveLoaded } from './fill-loader.ts';
import type { HeatmapPrimitive } from './heatmap.ts';
import { meshModuleLoaded } from './mesh-loader.ts';

/**
 * Lazy loading of heatmap columns and area slabs (plan E8.9), and bar-like traces' extra lifted
 * primitives. The tests run in order and share the loaders' module state (vitest isolates it per
 * file): the first tests see nothing loaded.
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

const heatmap = {
  object: new Object3D(),
  current: {
    z: [1, 2],
    nx: 2,
    ny: 1,
    xEdges: [0, 1, 2],
    yEdges: [0, 1],
    colorscale: [
      [0, [0, 0, 0, 1]],
      [1, [1, 1, 1, 1]],
    ],
    interpolation: 'rgb',
    zmin: 1,
    zmax: 2,
    reversescale: false,
    smoothing: false,
    xgap: 0,
    ygap: 0,
    opacity: 1,
  },
} as unknown as HeatmapPrimitive;

type Ready = Primitive<unknown> & { ready: Promise<void> };

describe('extrudeHeatmap', () => {
  it('loads nothing for a flat heatmap', async () => {
    const h = host({ depth: 0 });
    extrudeHeatmap(h, {}, heatmap, []);
    await Promise.resolve();
    expect(extrusionModuleLoaded()).toBeNull();
    expect(meshModuleLoaded()).toBeNull();
    expect(h.added).toEqual([]);
  });

  it('loads the 2.5D code for a heatmap with depth, then draws its columns per view', async () => {
    const h = host({ depth: 30 });
    const view = {};
    extrudeHeatmap(h, view, heatmap, []);
    expect(h.added).toHaveLength(1);
    await (h.added[0] as Ready).ready;
    const p = h.added[0]!;
    expect(p).toBeInstanceOf(extrusionModuleLoaded()!.ExtrusionPrimitive);
    // Synchronous from now on, the same primitive for the view; none without a heatmap.
    extrudeHeatmap(h, view, heatmap, []);
    expect(h.added).toEqual([p]);
    extrudeHeatmap(h, view, undefined, []);
    expect(h.added).toEqual([]);
  });
});

describe('extrudeFills', () => {
  it("finds the view's fill and waits for its own code before drawing the slab", async () => {
    const h = host({ depth: 12 });
    const fill = createLazyFillPrimitive(h.primitives, {
      x: [0, 1, 1],
      y: [0, 0, 1],
      color: [0, 0, 1, 1],
    });
    new Scene().add(fill.object);
    const view = {};
    extrudeFills(h, view, [fill]);
    expect(fillPrimitiveLoaded()).toBe(false);
    expect(h.added).toHaveLength(1);
    await (h.added[0] as Ready).ready;
    expect(fillPrimitiveLoaded()).toBe(true);
    expect(h.added).toHaveLength(1);
    expect(h.added[0]).toBeInstanceOf(extrusionModuleLoaded()!.ExtrusionPrimitive);
    expect(fill.object.visible).toBe(false);
    // A removed fill (out of the scene) is not extruded.
    fill.object.removeFromParent();
    extrudeFills(h, view, [fill]);
    expect(h.added).toEqual([]);
  });
});

describe('extrudeRects', () => {
  it("lifts the host's extra primitives (connectors) with the trace's own", () => {
    const connector = {
      object: new Object3D(),
      setTransform: vi.fn<(t: DataTransform) => void>(),
    };
    const h = { ...host({ depth: 20 }), lift: [connector] };
    const rects = { object: new Object3D() };
    const data = { x0: [0], x1: [1], y0: [0], y1: [2] };
    extrudeRects(h, rects, data, []);
    expect(connector.setTransform).toHaveBeenLastCalledWith(
      expect.objectContaining({ offsetZ: 20.5 }),
    );
    expect(connector.object.userData[UNCLIPPED]).toBe(true);
  });
});
