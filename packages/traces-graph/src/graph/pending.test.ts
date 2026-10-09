import { afterEach, describe, expect, it } from 'vitest';
import type { LinkRoute } from '../layout/types.ts';
import {
  bundleAskOf,
  bundledRoutes,
  bundlerNow,
  BUNDLES,
  bundleThread,
  clearPending,
  dataSpace,
  KEPT,
  LAYOUTS,
  layoutThread,
  loadLayoutCode,
  movingRoutes,
  toSpace,
  UNIT_SPACE,
  WORKER_BUNDLE_LINKS,
  WORKER_FORCE_LINKS,
  WORKER_FORCE_NODES,
  WORKER_LAYERED_LINKS,
  WORKER_LAYERED_NODES,
  workerOf,
  type LayoutLoad,
} from './pending.ts';

afterEach(() => clearPending());

const load = (over: Partial<LayoutLoad>): LayoutLoad => ({
  arrangement: 'force',
  nodes: 10,
  links: 10,
  real: false,
  atRest: false,
  ...over,
});

describe('workerOf', () => {
  it("reads the trace's worker, false for anything else", () => {
    expect(workerOf({ worker: true })).toBe(true);
    expect(workerOf({ worker: 'auto' })).toBe('auto');
    expect(workerOf({ worker: false })).toBe(false);
    expect(workerOf({})).toBe(false);
    expect(workerOf({ worker: 'yes' })).toBe(false);
  });
});

describe('layoutThread', () => {
  it('false keeps every layout on the main thread', () => {
    expect(layoutThread(false, load({ nodes: 1e6, links: 1e6 }))).toBe('main');
  });

  it("'auto' sends a force layout off from 1,000 nodes or 5,000 links", () => {
    expect(layoutThread('auto', load({ nodes: WORKER_FORCE_NODES - 1, links: 10 }))).toBe('main');
    expect(layoutThread('auto', load({ nodes: WORKER_FORCE_NODES, links: 10 }))).toBe('worker');
    expect(layoutThread('auto', load({ nodes: 10, links: WORKER_FORCE_LINKS - 1 }))).toBe('main');
    expect(layoutThread('auto', load({ nodes: 10, links: WORKER_FORCE_LINKS }))).toBe('worker');
  });

  it("'auto' sends a layered layout off from 3,000 nodes or 6,000 links", () => {
    const layered = (nodes: number, links: number) =>
      layoutThread('auto', load({ arrangement: 'layered', nodes, links }));
    expect(layered(WORKER_LAYERED_NODES - 1, 10)).toBe('main');
    expect(layered(WORKER_LAYERED_NODES, 10)).toBe('worker');
    expect(layered(10, WORKER_LAYERED_LINKS - 1)).toBe('main');
    expect(layered(10, WORKER_LAYERED_LINKS)).toBe('worker');
  });

  it("'auto' leaves the layouts that take no time where they are, at any size", () => {
    for (const arrangement of ['tree', 'radial', 'dendrogram', 'arc', 'hive']) {
      expect(layoutThread('auto', load({ arrangement, nodes: 1e5, links: 1e5 }))).toBe('main');
    }
  });

  it('true sends off every layout that can run in the worker, at any size', () => {
    for (const arrangement of ['force', 'layered', 'tree', 'radial', 'dendrogram', 'arc', 'hive']) {
      expect(layoutThread(true, load({ arrangement, nodes: 3, links: 2 }))).toBe('worker');
    }
  });

  it('never sends off a custom layout, nor one there is nothing to wait for', () => {
    for (const arrangement of ['custom', 'preset', 'circular', 'grid']) {
      expect(layoutThread(true, load({ arrangement, nodes: 1e5, links: 1e5 }))).toBe('main');
    }
  });

  it('never sends off an arrangement with a real axis, nor a layout that is at rest', () => {
    expect(layoutThread(true, load({ real: true, nodes: 1e5 }))).toBe('main');
    expect(layoutThread('auto', load({ real: true, nodes: 1e5 }))).toBe('main');
    expect(layoutThread(true, load({ atRest: true, nodes: 1e5 }))).toBe('main');
  });
});

describe('bundleThread', () => {
  it('sends force-directed bundling off from 1,000 links under auto, always under true', () => {
    expect(bundleThread('auto', 'force', WORKER_BUNDLE_LINKS - 1)).toBe('main');
    expect(bundleThread('auto', 'force', WORKER_BUNDLE_LINKS)).toBe('worker');
    expect(bundleThread(true, 'force', 3)).toBe('worker');
    expect(bundleThread(false, 'force', 1e5)).toBe('main');
  });

  it('keeps hierarchical bundling on the main thread', () => {
    expect(bundleThread(true, 'hierarchical', 1e5)).toBe('main');
    expect(bundleThread('auto', 'hierarchical', 1e5)).toBe('main');
  });
});

describe('bundleAskOf', () => {
  const trace = (bundle: unknown) => ({ link: { bundle } });

  it('is undefined without a method, with none, and at strength 0', () => {
    expect(bundleAskOf({})).toBeUndefined();
    expect(bundleAskOf(trace({ method: 'none' }))).toBeUndefined();
    expect(bundleAskOf(trace({ method: 'force', strength: 0 }))).toBeUndefined();
  });

  it('reads the method and the two numbers, with their defaults', () => {
    expect(bundleAskOf(trace({ method: 'auto' }))).toEqual({
      method: 'auto',
      strength: 0.85,
      compatibility: 0.6,
    });
    expect(bundleAskOf(trace({ method: 'force', strength: 0.5, compatibility: 0.3 }))).toEqual({
      method: 'force',
      strength: 0.5,
      compatibility: 0.3,
    });
    // Out of range: the default.
    expect(bundleAskOf(trace({ method: 'hierarchical', strength: 7 }))?.strength).toBe(0.85);
  });
});

describe('the bundling space', () => {
  it('maps positions that are data onto the px of the plot area, each axis by itself', () => {
    const x = Float64Array.of(1000, 3000, 2000);
    const y = Float64Array.of(0.1, 0.2, 0.5);
    const space = dataSpace(x, y, 400, 200);
    expect(space.originX).toBe(1000);
    expect(space.originY).toBe(0.1);
    expect(space.scaleX).toBeCloseTo(0.2, 12);
    expect(space.scaleY).toBeCloseTo(500, 12);
    expect(Array.from(toSpace(x, space.originX, space.scaleX))).toEqual([0, 400, 200]);
    const ys = toSpace(y, space.originY, space.scaleY);
    expect(ys[2]).toBeCloseTo(200, 9);
  });

  it('gives an axis without an extent the scale of the other, and never a zero', () => {
    const flat = dataSpace(Float64Array.of(5, 5), Float64Array.of(0, 10), 300, 100);
    expect(flat.scaleY).toBe(10);
    expect(flat.scaleX).toBe(10);
    const point = dataSpace(Float64Array.of(2), Float64Array.of(3), 300, 100);
    expect(point.scaleX).toBe(1);
    expect(point.scaleY).toBe(1);
  });

  it('ignores positions that are not numbers', () => {
    const space = dataSpace(Float64Array.of(NaN, 0, 10), Float64Array.of(1, NaN, 3), 100, 100);
    expect(space.originX).toBe(0);
    expect(space.scaleX).toBe(10);
    expect(space.scaleY).toBe(50);
  });

  it('leaves layout units as they are (the same array)', () => {
    const x = Float64Array.of(1, 2);
    expect(toSpace(x, UNIT_SPACE.originX, UNIT_SPACE.scaleX)).toBe(x);
  });
});

describe('bundledRoutes', () => {
  const route = (...points: number[]): LinkRoute => ({
    points: Float64Array.from(points),
    kind: 'polyline',
  });

  it('puts the routes of the bundled links at their links, back in linear coordinates', () => {
    const space = { originX: 100, originY: 10, scaleX: 2, scaleY: 0.5 };
    const out = bundledRoutes(
      { links: Int32Array.of(1, 3), space },
      [route(0, 0, 20, 5), undefined],
      4,
      undefined,
    )!;
    expect(out).toHaveLength(4);
    expect(out[0]).toBeUndefined();
    expect(Array.from(out[1]!.points)).toEqual([100, 10, 110, 20]);
    expect(out[1]!.kind).toBe('polyline');
    expect(out[3]).toBeUndefined();
  });

  it("keeps the arrangement's own routes, which win over a bundled one", () => {
    const own = route(1, 1, 2, 2);
    const made = route(5, 5, 6, 6);
    const out = bundledRoutes({ links: undefined, space: UNIT_SPACE }, [made, made], 2, [
      own,
      undefined,
    ])!;
    expect(out[0]).toBe(own);
    // In layout units a route is used as it is.
    expect(out[1]).toBe(made);
  });

  it('is undefined when no link has a route', () => {
    expect(
      bundledRoutes({ links: undefined, space: UNIT_SPACE }, [undefined], 1, undefined),
    ).toBeUndefined();
  });
});

describe('what is kept', () => {
  it('keeps the last few answers, the one used last longest', () => {
    for (let i = 0; i < KEPT; i++) LAYOUTS.set(`k${i}`, { failed: true });
    // Used: now the newest.
    expect(LAYOUTS.get('k0')).toEqual({ failed: true });
    LAYOUTS.set('more', { failed: true });
    expect(LAYOUTS.get('k1')).toBeUndefined();
    expect(LAYOUTS.get('k0')).toBeDefined();
    expect(LAYOUTS.get('more')).toBeDefined();
  });

  it('forgets everything on clearPending', () => {
    LAYOUTS.set('a', { failed: true });
    BUNDLES.set('b', { routes: [], method: 'none', refused: false });
    clearPending();
    expect(LAYOUTS.get('a')).toBeUndefined();
    expect(BUNDLES.get('b')).toBeUndefined();
  });
});

describe('the layout code', () => {
  it('is one lazy module with the client of the worker and the bundling', async () => {
    const code = await loadLayoutCode();
    expect(typeof code.bundleLinks).toBe('function');
    expect(typeof code.graphLayoutWorker).toBe('function');
    expect(await loadLayoutCode()).toBe(code);
    expect(bundlerNow()).toBe(code.bundleLinks);
  });

  it('makes hierarchical bundles again for other positions, and no others', async () => {
    await loadLayoutCode();
    // Two groups of two nodes, one link from each node of the first to one of the second.
    const graph = {
      source: Int32Array.of(0, 1),
      target: Int32Array.of(2, 3),
      group: Int32Array.of(0, 0, 1, 1),
      groups: 2,
    };
    const model = { links: 2 } as never;
    const at = { x: Float64Array.of(0, 0, 100, 100), y: Float64Array.of(0, 20, 0, 20) };
    const bundle = {
      options: { method: 'hierarchical' as const, strength: 0.85, hierarchy: 'groups' as const },
      links: undefined,
      graph,
      space: UNIT_SPACE,
      key: '',
      method: 'hierarchical' as const,
    };
    const routes = movingRoutes({ bundle, model }, at, undefined)!;
    expect(routes).toHaveLength(2);
    expect(routes[0]!.kind).toBe('spline');
    // The route starts and ends on its nodes.
    expect(routes[0]!.points[0]).toBe(0);
    expect(routes[0]!.points.at(-2)).toBe(100);
    // Other positions, other routes.
    const moved = movingRoutes(
      { bundle, model },
      { x: Float64Array.of(0, 0, 200, 200), y: at.y },
      undefined,
    )!;
    expect(moved[0]!.points.at(-2)).toBe(200);
    // Force-directed bundles, and bundles that have not arrived, are not made for a frame.
    const base = [undefined, undefined];
    expect(movingRoutes({ bundle: { ...bundle, method: 'force' }, model }, at, base)).toBe(base);
    expect(movingRoutes({ bundle: { ...bundle, method: undefined }, model }, at, base)).toBe(base);
    expect(movingRoutes({ bundle: undefined, model }, at, base)).toBe(base);
  });
});
