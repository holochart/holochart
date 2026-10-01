import { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { Primitive } from '../types.ts';
import type { DomainHost } from './extrusion-domain.ts';
import { extrudeDomain, extrusionModuleLoaded } from './extrusion-loader.ts';
import { meshModuleLoaded } from './mesh-loader.ts';

/**
 * Lazy loading of domain traces' 2.5D code (plan E8.9, E9.12): `extrudeDomain` loads nothing for a
 * flat trace, and for a tilted one loads the 2.5D and mesh chunks behind a placeholder whose
 * `ready` covers the load, then draws. The tests run in order and share the loaders' state (vitest
 * isolates it per file): the first sees nothing loaded.
 */

function host(trace: Record<string, unknown>) {
  const added: Primitive<unknown>[] = [];
  const live = new Set<Primitive<unknown>>();
  const h: DomainHost & { added: Primitive<unknown>[]; live: Set<Primitive<unknown>> } = {
    primitives: { resources: createResourceManager(), invalidate: vi.fn<() => void>() },
    trace,
    calc: {},
    domain: { rect: { x: 0, y: 0, width: 400, height: 300 } },
    viewport: { size: { width: 400, height: 300, pixelRatio: 1 }, primitives: live },
    add: (p) => void added.push(p),
    remove: (p) => void added.splice(added.indexOf(p), 1),
    added,
    live,
  };
  return h;
}

function flatRects(): Primitive<unknown> {
  return {
    object: new Object3D(),
    update: vi.fn(),
    setTransform: vi.fn(),
    setViewport: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('extrudeDomain', () => {
  it('loads nothing for flat traces', async () => {
    const h = host({ depth: 0, tilt: 0 });
    extrudeDomain(h, { update: vi.fn() }, []);
    await Promise.resolve();
    expect(extrusionModuleLoaded()).toBeNull();
    expect(meshModuleLoaded()).toBeNull();
    expect(h.added).toEqual([]);
  });

  it('loads the 2.5D and mesh code for a tilted trace; ready covers the load', async () => {
    const h = host({ tilt: 30 });
    const rects = flatRects();
    h.live.add(rects);
    const tile = { x0: [10], y0: [10], x1: [200], y1: [150], fill: [1, 0, 0, 1] };
    // The view draws again once its primitives are captured.
    const view = { update: vi.fn(() => rects.update(tile)) };
    extrudeDomain(h, view, [rects]);
    expect(h.added).toHaveLength(1);
    const wait = h.added[0] as Primitive<unknown> & { ready: Promise<void> };
    await wait.ready;
    expect(extrusionModuleLoaded()).not.toBeNull();
    expect(meshModuleLoaded()).not.toBeNull();
    expect(view.update).toHaveBeenCalledTimes(1);
    // Replaced by the prisms; the flat rects hide.
    expect(h.added).toHaveLength(1);
    expect(h.added[0]).toBeInstanceOf(extrusionModuleLoaded()!.ExtrusionPrimitive);
    expect(rects.object.visible).toBe(false);
  });
});
