/**
 * Large graphs (backlog G7) through the trace itself: a calc that waits for its layout or for its
 * bundles and the calc that follows, against the synchronous one; the view that asks for them;
 * the level of detail in the view; link hover through the spatial index.
 */
import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  LinePrimitive,
  MarkerSet,
  TextPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type SubplotInfo,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forceRunOf } from '../layout/force/warm.ts';
import { registerGraphLayout } from '../layout/index.ts';
import type { LayoutResult } from '../layout/types.ts';
import type { GraphCalc } from './calc.ts';
import { dragKind } from './drag.ts';
import { frameOf } from './frame.ts';
import { distanceToLink } from './geometry.ts';
import { graphHitAt, LINK_INDEX_MIN, LINK_REACH } from './hover.ts';
import { graph } from './index.ts';
import { drawnLinks } from './links.ts';
import { LOD, lodOf } from './lod.ts';
import { SETTLE_MS } from './plot.ts';
import {
  BUNDLES,
  clearPending,
  LAYOUTS,
  loadLayoutCode,
  WORKER_FORCE_NODES,
  type GraphPending,
} from './pending.ts';
import { linkColors, linkVertexColors } from './style.ts';

// troika typesets in a worker with browser globals; the view test only needs its object graph.
vi.mock('../../../render/node_modules/troika-three-text', async () => {
  const { Object3D } = await import('three');
  type Node = InstanceType<typeof Object3D>;
  const noopDispose = (o: object): void => {
    Object.assign(o, { dispose: (): void => {} });
  };
  class Text extends Object3D {
    constructor() {
      super();
      noopDispose(this);
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    addText(text: Node): void {
      this.add(text);
    }
    removeText(text: Node): void {
      this.remove(text);
    }
    constructor() {
      super();
      noopDispose(this);
    }
    sync(callback?: () => void): void {
      callback?.();
    }
  }
  return { Text, BatchedText, configureTextBuilder: () => {}, preloadFont: () => {} };
});

const registry = createChartRegistry().register(graph);
const IDENTITY = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
const FULL = { calc: true, plot: true, style: true, transform: true };

function build(
  input: Record<string, unknown>,
  layout: Record<string, unknown> = {},
  config: Record<string, unknown> = {},
) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'graph', ...input }], layout: { template: 'none', ...layout }, config },
    registry.core,
    { onIssue: () => {} },
  );
  const axis = { scale: createScale({ type: 'linear' }), type: 'linear', full: {} };
  const ctx: CalcContext = {
    fullLayout,
    index: 0,
    xaxis: axis as unknown as AxisInfo,
    yaxis: axis as unknown as AxisInfo,
  };
  const trace = fullData[0] as FullTrace;
  return { trace, calc: graph.calc!(trace, ctx), fullLayout };
}

function plotCtx(
  built: ReturnType<typeof build>,
  transform = IDENTITY,
  added: Primitive<unknown>[] = [],
) {
  const ctx: TracePlotContext<GraphCalc> = {
    ...built,
    index: 0,
    subplot: { rect: { x: 0, y: 0, width: 800, height: 600 } } as unknown as SubplotInfo,
    xaxis: undefined,
    yaxis: undefined,
    transform,
    viewport: { size: { width: 800, height: 600 } } as Viewport,
    primitives: { resources: createResourceManager(), invalidate: vi.fn() },
    add: (p) => {
      added.push(p as Primitive<unknown>);
      return p;
    },
    remove: (p) => {
      added.splice(added.indexOf(p as Primitive<unknown>), 1);
      p.dispose();
    },
    invalidate: vi.fn(),
    recalc: vi.fn(),
  };
  return { ctx, added };
}

const markerData = new WeakMap<MarkerSet, Record<string, unknown>>();
const dataOf = <T>(p: Primitive<unknown> | undefined) =>
  (p instanceof MarkerSet ? markerData.get(p) : (p as unknown as { data: T }).data) as T;
const byOrder = (added: Primitive<unknown>[]) =>
  [...added].sort((a, b) => a.object.renderOrder - b.object.renderOrder);
const lines = (added: Primitive<unknown>[]) =>
  byOrder(added).filter((p): p is LinePrimitive => p instanceof LinePrimitive);
const markers = (added: Primitive<unknown>[]) =>
  byOrder(added).filter((p): p is MarkerSet => p instanceof MarkerSet);
/** The primitive that keeps the chart waiting: it has a `ready` and draws nothing. */
const holds = (added: Primitive<unknown>[]) =>
  added.filter((p) => p.constructor.name === 'PendingLayout');

beforeEach(() => {
  const update = MarkerSet.prototype.update;
  vi.spyOn(MarkerSet.prototype, 'update').mockImplementation(function (
    this: MarkerSet,
    data: Parameters<MarkerSet['update']>[0],
  ) {
    markerData.set(this, { ...markerData.get(this), ...data });
    update.call(this, data);
  });
});

afterEach(() => {
  clearPending();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A ring of `n` nodes with a chord every `step` nodes. */
function ring(n: number, step = 7) {
  const source: number[] = [];
  const target: number[] = [];
  for (let i = 0; i < n; i++) {
    source.push(i, i);
    target.push((i + 1) % n, (i + step) % n);
  }
  return { source, target };
}

/** Do what the view does for a calc that waits: run the request on the main thread, keep it. */
async function answer(pending: GraphPending): Promise<LayoutResult> {
  const code = await loadLayoutCode();
  let bundle: { method: 'hierarchical' | 'force' | 'none'; refused: boolean } | undefined;
  const result = await code
    .graphLayoutWorker()
    .run(pending.graph, pending.arrangement, pending.options, {
      thread: 'main',
      ...(pending.start ? { start: pending.start } : {}),
      ...(pending.bundle ? { bundle: pending.bundle } : {}),
      onDone: (info) => {
        bundle = info.bundle;
      },
    });
  if (pending.what === 'layout') LAYOUTS.set(pending.key, { result });
  else {
    BUNDLES.set(pending.key, {
      routes: result.routes ?? [],
      method: bundle?.method ?? 'none',
      refused: bundle?.refused === true,
    });
  }
  return result;
}

const sameRoutes = (a: GraphCalc['routes'], b: GraphCalc['routes']): void => {
  expect(a?.length).toBe(b?.length);
  a?.forEach((route, k) => {
    expect(route?.kind).toBe(b![k]?.kind);
    expect(route ? Array.from(route.points) : undefined).toEqual(
      b![k] ? Array.from(b![k].points) : undefined,
    );
  });
};

describe('graph defaults: worker, lod, link.bundle', () => {
  const NET = { node: { label: ['a', 'b', 'c'] }, link: { source: [0, 1], target: [1, 2] } };

  it('worker defaults to config.worker, which is false', () => {
    expect(build(NET).trace['worker']).toBe(false);
    expect(build(NET, {}, { worker: 'auto' }).trace['worker']).toBe('auto');
    expect(build(NET, {}, { worker: true }).trace['worker']).toBe(true);
    // The trace's own value wins.
    expect(build({ ...NET, worker: false }, {}, { worker: true }).trace['worker']).toBe(false);
  });

  it('a custom arrangement has no worker', () => {
    const { trace } = build({ ...NET, arrangement: 'custom', custom: { name: 'x' }, worker: true });
    expect(trace['worker']).toBeUndefined();
  });

  it("lod defaults to 'auto'", () => {
    expect(build(NET).trace['lod']).toBe('auto');
    expect(build({ ...NET, lod: false }).trace['lod']).toBe(false);
  });

  it('link.bundle is off by default, and coerces what its method reads', () => {
    const link = (input: Record<string, unknown>) =>
      (
        build({ ...NET, link: { ...NET.link, bundle: input } }).trace['link'] as {
          bundle: Record<string, unknown>;
        }
      ).bundle;
    expect(link({})).toEqual({ method: 'none' });
    expect(link({ method: 'hierarchical' })).toEqual({ method: 'hierarchical', strength: 0.85 });
    expect(link({ method: 'force', strength: 0.5 })).toEqual({
      method: 'force',
      strength: 0.5,
      compatibility: 0.6,
    });
    expect(link({ method: 'auto' })['compatibility']).toBe(0.6);
  });
});

describe('graph calc: a layout off the main thread', () => {
  const NET = { arrangement: 'force', node: { size: 8 }, link: ring(60) };
  const nodes = { node: { ...NET.node, label: Array.from({ length: 60 }, (_, i) => `n${i}`) } };

  it('returns at once with the nodes where the layout starts, and says what it waits for', () => {
    const { calc, trace } = build({ ...NET, ...nodes, worker: true });
    const pending = calc.pending!;
    expect(pending.what).toBe('layout');
    expect(pending.arrangement).toBe('force');
    expect(pending.streams).toBe(true);
    expect(pending.thread).toBe('worker');
    expect(pending.key).toBe(calc.layoutKey);
    // The start of the very simulation the worker will run.
    const x = new Float64Array(60);
    const y = new Float64Array(60);
    forceRunOf(pending.graph, pending.options as never, undefined).frame(x, y);
    expect(Array.from(calc.x)).toEqual(Array.from(x));
    expect(Array.from(calc.y)).toEqual(Array.from(y));
    expect(calc.arrangement).toBe('force');
    expect(calc.units).toBe(true);
    // Not a layout yet: nothing to simulate again, no node to drag.
    expect(calc.force).toBeUndefined();
    expect(dragKind(trace, calc)).toBe('none');
    // Autorange has something to fit.
    expect(graph.extremes!(calc, trace, {} as CalcContext).x!.min.length).toBeGreaterThan(0);
  });

  it('is the synchronous calc once the layout has arrived', async () => {
    const waiting = build({ ...NET, ...nodes, worker: true });
    await answer(waiting.calc.pending!);
    const after = build({ ...NET, ...nodes, worker: true }).calc;
    const sync = build({ ...NET, ...nodes, worker: false }).calc;
    expect(after.pending).toBeUndefined();
    // Bit for bit: the layouts are the same code on any thread.
    expect(Array.from(after.x)).toEqual(Array.from(sync.x));
    expect(Array.from(after.y)).toEqual(Array.from(sync.y));
    expect(after.layoutKey).toBe(sync.layoutKey);
    expect(after.force).toBeDefined();
    expect(after.force!.options).toEqual(sync.force!.options);
    expect(after.units).toBe(sync.units);
    expect(after.equal).toBe(sync.equal);
  });

  it('honours force.start: the layout goes on from the given positions in the worker too', async () => {
    const start = {
      x: Array.from({ length: 60 }, (_, i) => Math.cos(i) * 80),
      y: Array.from({ length: 60 }, (_, i) => Math.sin(i * 1.7) * 80),
      alpha: 0.3,
    };
    const input = { ...NET, force: { start } };
    const waiting = build({ ...input, worker: true }).calc;
    expect(waiting.pending!.start).toBeDefined();
    // The stand-in is the start itself.
    expect(Array.from(waiting.x)).toEqual(start.x);
    await answer(waiting.pending!);
    const after = build({ ...input, worker: true }).calc;
    const sync = build({ ...input, worker: false }).calc;
    expect(Array.from(after.x)).toEqual(Array.from(sync.x));
    expect(Array.from(after.y)).toEqual(Array.from(sync.y));
    // It moved from the start.
    expect(Array.from(after.x)).not.toEqual(start.x);
  });

  it('holds pinned nodes where the figure says, in the stand-in and in the result', async () => {
    const x: (number | null)[] = new Array<number | null>(60).fill(null);
    const y: (number | null)[] = new Array<number | null>(60).fill(null);
    x[3] = 120;
    y[3] = -40;
    x[10] = -90;
    y[10] = 15;
    const input = { ...NET, node: { ...NET.node, x, y } };
    const waiting = build({ ...input, worker: true }).calc;
    expect([waiting.x[3], waiting.y[3]]).toEqual([120, -40]);
    await answer(waiting.pending!);
    const after = build({ ...input, worker: true }).calc;
    const sync = build({ ...input, worker: false }).calc;
    expect([after.x[3], after.y[3], after.x[10], after.y[10]]).toEqual([120, -40, -90, 15]);
    expect(Array.from(after.x)).toEqual(Array.from(sync.x));
    expect(Array.from(after.y)).toEqual(Array.from(sync.y));
  });

  it('a layout that is at rest is not sent anywhere', () => {
    const start = {
      x: Array.from({ length: 60 }, (_, i) => i),
      y: new Array(60).fill(0),
      alpha: 0,
    };
    const { calc } = build({ ...NET, force: { start }, worker: true });
    expect(calc.pending).toBeUndefined();
    expect(Array.from(calc.x)).toEqual(start.x);
  });

  it("'auto' sends a force layout off from 1,000 nodes, and not below", () => {
    const big = { arrangement: 'force', link: ring(WORKER_FORCE_NODES), force: { ticks: 2 } };
    const off = build({
      ...big,
      node: { size: new Array(WORKER_FORCE_NODES).fill(6) },
      worker: 'auto',
    }).calc;
    expect(off.pending?.what).toBe('layout');
    const small = build({
      arrangement: 'force',
      link: ring(WORKER_FORCE_NODES - 1),
      force: { ticks: 2 },
      node: { size: new Array(WORKER_FORCE_NODES - 1).fill(6) },
      worker: 'auto',
    }).calc;
    expect(small.pending).toBeUndefined();
    expect(small.force).toBeDefined();
    // And never with `false`, the default.
    const never = build({ ...big, node: { size: new Array(WORKER_FORCE_NODES).fill(6) } }).calc;
    expect(never.pending).toBeUndefined();
  });

  it('a layered layout waits with its nodes on a circle and no links, then is the synchronous one', async () => {
    const input = {
      arrangement: 'layered',
      layered: { clusters: true },
      node: { label: ['a', 'b', 'c', 'd', 'e'], group: ['x', 'x', 'y', 'y', 'y'] },
      link: { source: [0, 0, 1, 2, 3, 4], target: [1, 2, 3, 3, 4, 0] },
    };
    const waiting = build({ ...input, worker: true });
    const pending = waiting.calc.pending!;
    expect(pending.arrangement).toBe('layered');
    expect(pending.streams).toBe(false);
    // Nothing of the layout yet: no routes, no frames, no links drawn.
    expect(waiting.calc.routes).toBeUndefined();
    expect(waiting.calc.clusters).toBeUndefined();
    expect(Array.from(waiting.calc.omitted!)).toEqual([1, 1, 1, 1, 1, 1]);
    const drawn = drawnLinks(waiting.calc, waiting.trace, 1, 1);
    expect(drawn.geometry.x).toHaveLength(0);
    await answer(pending);
    const after = build({ ...input, worker: true }).calc;
    const sync = build({ ...input, worker: false }).calc;
    expect(after.pending).toBeUndefined();
    expect(Array.from(after.x)).toEqual(Array.from(sync.x));
    expect(Array.from(after.y)).toEqual(Array.from(sync.y));
    sameRoutes(after.routes, sync.routes);
    expect(after.clusters).toEqual(sync.clusters);
    expect(Array.from(after.secondary!)).toEqual(Array.from(sync.secondary!));
    expect(after.omitted).toBeUndefined();
  });

  it('a tree comes back with everything a click needs to fold it', async () => {
    const input = {
      arrangement: 'radial',
      ids: ['r', 'a', 'b', 'a1', 'a2', 'b1'],
      labels: ['Root', 'A', 'B', 'A one', 'A two', 'B one'],
      parents: ['', 'r', 'r', 'a', 'a', 'b'],
      tree: { collapsed: ['b'] },
    };
    const waiting = build({ ...input, worker: true }).calc;
    expect(waiting.tree).toBeUndefined();
    await answer(waiting.pending!);
    const after = build({ ...input, worker: true }).calc;
    const sync = build({ ...input, worker: false }).calc;
    expect(Array.from(after.x)).toEqual(Array.from(sync.x));
    expect(Array.from(after.hidden)).toEqual(Array.from(sync.hidden));
    expect(Array.from(after.tree!.parent)).toEqual(Array.from(sync.tree!.parent));
    expect(Array.from(after.tree!.collapsed)).toEqual(Array.from(sync.tree!.collapsed));
    expect(after.labelRule?.kind).toBe('radial');
    sameRoutes(after.routes, sync.routes);
  });

  it('never sends off positions that are data, a custom layout or a timeline', () => {
    const preset = build({
      node: { x: [0, 1, 2], y: [0, 1, 0] },
      link: { source: [0, 1], target: [1, 2] },
      worker: true,
    }).calc;
    expect(preset.pending).toBeUndefined();
    const timeline = build({
      arrangement: 'force',
      node: { x: [1, 2, 3, 4] },
      link: { source: [0, 1, 2], target: [1, 2, 3] },
      worker: true,
    }).calc;
    expect(timeline.real?.kind).toBe('position');
    expect(timeline.pending).toBeUndefined();
    const circular = build({ arrangement: 'circular', link: ring(20), worker: true }).calc;
    expect(circular.pending).toBeUndefined();
  });

  it('waits for the same thing after a change the layout does not read, for another after one it reads', () => {
    const key = (more: Record<string, unknown>, node: Record<string, unknown> = {}) =>
      build({ ...NET, node: { ...NET.node, ...node }, worker: true, ...more }).calc.pending!.key;
    const first = key({});
    expect(key({ link: { ...NET.link, color: 'red', width: 3 } })).toBe(first);
    expect(key({}, { label: Array.from({ length: 60 }, (_, i) => `x${i}`), color: 'blue' })).toBe(
      first,
    );
    expect(key({ lod: false })).toBe(first);
    // What the layout reads.
    expect(key({ force: { linkdistance: 80 } })).not.toBe(first);
    expect(key({}, { size: 20 })).not.toBe(first);
    expect(key({ link: ring(60, 11) })).not.toBe(first);
  });

  it('runs a layout that failed off the main thread itself', () => {
    const waiting = build({ ...NET, worker: true }).calc;
    LAYOUTS.set(waiting.pending!.key, { failed: true });
    const after = build({ ...NET, worker: true }).calc;
    const sync = build({ ...NET, worker: false }).calc;
    expect(after.pending).toBeUndefined();
    expect(Array.from(after.x)).toEqual(Array.from(sync.x));
  });
});

describe('graph calc: bundled links', () => {
  const groups = Array.from({ length: 40 }, (_, i) => `g${i % 4}`);
  const GROUPED = { arrangement: 'circular', node: { group: groups }, link: ring(40, 13) };

  it('draws the links straight until the bundles arrive, then along their routes', async () => {
    const input = { ...GROUPED, link: { ...GROUPED.link, bundle: { method: 'hierarchical' } } };
    const waiting = build(input).calc;
    const pending = waiting.pending!;
    expect(pending.what).toBe('bundle');
    expect(pending.arrangement).toBe('preset');
    // Hierarchical bundling is cheap: on the main thread, also with a worker.
    expect(pending.thread).toBe('main');
    expect(build({ ...input, worker: true }).calc.pending!.thread).toBe('main');
    expect(waiting.routes).toBeUndefined();
    // The nodes are placed: this calc has the layout already.
    const plain = build(GROUPED).calc;
    expect(Array.from(waiting.x)).toEqual(Array.from(plain.x));
    await answer(pending);
    const after = build(input);
    expect(after.calc.pending).toBeUndefined();
    expect(after.calc.bundle?.method).toBe('hierarchical');
    const routes = after.calc.routes!;
    expect(routes).toHaveLength(80);
    for (let k = 0; k < 80; k++) {
      const route = routes[k]!;
      expect(route.kind).toBe('spline');
      // From the source to the target.
      const a = after.calc.model.source[k]!;
      const b = after.calc.model.target[k]!;
      expect(route.points[0]).toBeCloseTo(after.calc.x[a]!, 9);
      expect(route.points[1]).toBeCloseTo(after.calc.y[a]!, 9);
      expect(route.points.at(-2)).toBeCloseTo(after.calc.x[b]!, 9);
      expect(route.points.at(-1)).toBeCloseTo(after.calc.y[b]!, 9);
    }
    // The nodes did not move.
    expect(Array.from(after.calc.x)).toEqual(Array.from(plain.x));
  });

  it('makes hierarchical bundles in calc once their code is loaded: nothing to wait for', async () => {
    const input = { ...GROUPED, link: { ...GROUPED.link, bundle: { method: 'hierarchical' } } };
    const first = build(input).calc;
    expect(first.pending?.what).toBe('bundle');
    await answer(first.pending!);
    const arrived = build(input).calc;
    // Another graph, another layout key: bundled at once, with the same code.
    const other = { ...input, link: { ...ring(40, 9), bundle: { method: 'hierarchical' } } };
    const calc = build(other).calc;
    expect(calc.pending).toBeUndefined();
    expect(calc.bundle?.method).toBe('hierarchical');
    expect(calc.routes!.filter(Boolean)).toHaveLength(80);
    // And the first graph again: the same routes as the ones that arrived.
    BUNDLES.clear();
    sameRoutes(build(input).calc.routes, arrived.routes);
    // Force-directed bundles are never made in calc.
    const force = build({ ...input, link: { ...ring(40, 9), bundle: { method: 'force' } } }).calc;
    expect(force.pending?.what).toBe('bundle');
  });

  it('keeps one range of vertices per link, so colors and hover still go by link', async () => {
    const input = {
      ...GROUPED,
      link: {
        ...GROUPED.link,
        color: Array.from({ length: 80 }, (_, k) => (k % 2 ? '#ff0000' : '#0000ff')),
        bundle: { method: 'hierarchical' },
      },
    };
    await answer(build(input).calc.pending!);
    const { calc, trace } = build(input);
    const { geometry } = drawnLinks(calc, trace, 1, 1);
    expect(geometry.offsets).toHaveLength(81);
    for (let k = 0; k < 80; k++) {
      // A bundled link is a curve of many vertices, all its own.
      expect(geometry.offsets[k + 1]! - geometry.offsets[k]!).toBeGreaterThan(2);
    }
    expect(geometry.starts).toHaveLength(79);
    // Per-vertex colors follow the ranges: every vertex of a link has the link's color.
    const emphasis = {
      node: new Uint8Array(40),
      link: Uint8Array.from({ length: 80 }, (_, k) => (k === 5 ? 1 : 0)),
      dim: 0.25,
      color: null,
    };
    const colors = linkColors(calc, trace, null, undefined, emphasis) as Float32Array;
    const perVertex = linkVertexColors(geometry, colors) as Float32Array;
    expect(perVertex).toHaveLength(4 * geometry.x.length);
    for (const k of [0, 5, 79]) {
      for (let v = geometry.offsets[k]!; v < geometry.offsets[k + 1]!; v++) {
        expect(Array.from(perVertex.subarray(4 * v, 4 * v + 4))).toEqual(
          Array.from(colors.subarray(4 * k, 4 * k + 4)),
        );
      }
    }
    // The emphasized link is drawn in full, the others dimmed.
    expect(colors[4 * 5 + 3]).toBe(1);
    expect(colors[4 * 4 + 3]).toBeCloseTo(0.25, 6);
    // And hover finds a bundled link on its curve, not on the straight line between its ends.
    const mid = Math.floor((geometry.offsets[10]! + geometry.offsets[11]!) / 2);
    const hit = graphHitAt(
      calc,
      trace,
      {
        xl: geometry.x[mid]!,
        yl: geometry.y[mid]!,
        px: geometry.x[mid]!,
        py: geometry.y[mid]!,
        distance: 4,
      },
      { transform: IDENTITY },
    );
    expect(hit?.kind).toBe('link');
  });

  it('bundles a graph without groups by the links themselves', async () => {
    const input = {
      arrangement: 'circular',
      link: { ...ring(40, 13), bundle: { method: 'auto', strength: 0.9 } },
    };
    const waiting = build(input).calc;
    expect(waiting.pending!.bundle).toEqual({ method: 'force', strength: 0.9, compatibility: 0.6 });
    await answer(waiting.pending!);
    const after = build(input).calc;
    expect(after.pending).toBeUndefined();
    expect(after.bundle?.method).toBe('force');
    expect(after.routes!.some((route) => route?.kind === 'polyline')).toBe(true);
  });

  it('sends force-directed bundling of many links to the worker under auto', () => {
    const n = 600;
    const input = (worker: unknown) => ({
      arrangement: 'circular',
      link: { ...ring(n, 13), bundle: { method: 'force' } },
      worker,
    });
    expect(build(input('auto')).calc.pending!.thread).toBe('worker');
    expect(build(input(false)).calc.pending!.thread).toBe('main');
    expect(
      build({
        arrangement: 'circular',
        link: { ...ring(40), bundle: { method: 'force' } },
        worker: 'auto',
      }).calc.pending!.thread,
    ).toBe('main');
  });

  it('bundles positions that are data in the px they are drawn at', async () => {
    // Dates against small numbers: the two axes have nothing in common.
    const n = 30;
    const input = {
      node: {
        x: Array.from({ length: n }, (_, i) => 1.6e12 + (i % 6) * 86_400_000),
        y: Array.from({ length: n }, (_, i) => Math.floor(i / 6) * 0.001),
        group: Array.from({ length: n }, (_, i) => `g${i % 3}`),
      },
      link: { ...ring(n, 11), bundle: { method: 'hierarchical' } },
    };
    const waiting = build(input).calc;
    const { graph: sent } = waiting.pending!;
    // In px of the plot area: a few hundred, not 1e12.
    expect(Math.max(...sent.x)).toBeLessThan(2000);
    expect(Math.max(...sent.x)).toBeGreaterThan(100);
    expect(Math.max(...sent.y)).toBeGreaterThan(100);
    await answer(waiting.pending!);
    const after = build(input).calc;
    const [x0, x1] = [Math.min(...after.x), Math.max(...after.x)];
    const [y0, y1] = [Math.min(...after.y), Math.max(...after.y)];
    for (const route of after.routes!) {
      if (!route) continue;
      for (let j = 0; j < route.points.length; j += 2) {
        // Back on the axes, inside the box of the nodes (a bundle never leaves their hull).
        expect(route.points[j]).toBeGreaterThanOrEqual(x0 - 1);
        expect(route.points[j]).toBeLessThanOrEqual(x1 + 1);
        expect(route.points[j + 1]).toBeGreaterThanOrEqual(y0 - 1e-9);
        expect(route.points[j + 1]).toBeLessThanOrEqual(y1 + 1e-9);
      }
    }
    expect(after.routes!.filter(Boolean).length).toBeGreaterThan(n);
  });

  it('bundles the links of a tree that are not its edges along the tree', async () => {
    const input = {
      arrangement: 'radial',
      node: { label: ['r', 'a', 'b', 'a1', 'a2', 'b1', 'b2'] },
      link: {
        // The tree, then two links between leaves of different branches.
        source: [0, 0, 1, 1, 2, 2, 3, 4],
        target: [1, 2, 3, 4, 5, 6, 5, 6],
        bundle: { method: 'auto' },
      },
    };
    const waiting = build(input).calc;
    expect(waiting.pending!.bundle).toMatchObject({ method: 'hierarchical', hierarchy: 'parents' });
    // Only the links the tree did not route (it draws the two from its root straight).
    expect(Array.from(waiting.bundle!.links!)).toEqual([0, 1, 6, 7]);
    await answer(waiting.pending!);
    const after = build(input).calc;
    const sync = build({ ...input, link: { ...input.link, bundle: { method: 'none' } } }).calc;
    // The edges of the tree keep their routes.
    for (let k = 2; k < 6; k++) {
      expect(Array.from(after.routes![k]!.points)).toEqual(Array.from(sync.routes![k]!.points));
    }
    expect(after.routes![6]?.kind).toBe('spline');
    expect(sync.routes![6]).toBeUndefined();
    expect(after.bundle!.base![6]).toBeUndefined();
  });

  it('does not bundle the links of a custom layout whose options cannot be written down', () => {
    const remove = registerGraphLayout('cyclic', (g) => ({
      x: Float64Array.from({ length: g.nodes }, (_, i) => i * 10),
      y: new Float64Array(g.nodes),
    }));
    try {
      const options: Record<string, unknown> = { gap: 10 };
      options['self'] = options;
      const input = {
        arrangement: 'custom',
        custom: { name: 'cyclic', options },
        node: { group: groups },
        link: { ...ring(40, 13), bundle: { method: 'hierarchical' } },
      };
      // No key that holds from one calc to the next: nothing to wait for, again and again.
      const calc = build(input).calc;
      expect(calc.pending).toBeUndefined();
      expect(calc.bundle).toBeUndefined();
      expect(build(input).calc.layoutKey).not.toBe(calc.layoutKey);
      // With options that can be written down, a custom layout's links are bundled like any.
      const plain = build({ ...input, custom: { name: 'cyclic', options: { gap: 10 } } }).calc;
      expect(plain.pending?.what).toBe('bundle');
    } finally {
      remove();
    }
  });

  it('has nothing to bundle hierarchically without groups or a tree', () => {
    const { calc } = build({
      arrangement: 'circular',
      link: { ...ring(20), bundle: { method: 'hierarchical' } },
    });
    expect(calc.pending).toBeUndefined();
    expect(calc.bundle).toBeUndefined();
  });

  it('does not lay the graph out again for a change of the bundling', async () => {
    const input = (strength: number) => ({
      arrangement: 'force',
      node: { group: groups },
      link: { ...ring(40, 13), bundle: { method: 'hierarchical', strength } },
    });
    const first = build(input(0.85)).calc;
    // The layout the calc ran is kept under its key.
    expect(LAYOUTS.get(first.layoutKey!)?.result).toBeDefined();
    await answer(first.pending!);
    // Count the layouts from here on: another strength must not run one.
    const kept = LAYOUTS.get(first.layoutKey!)!.result!;
    const other = build(input(0.4)).calc;
    // Other bundles (made at once: their code is loaded by now), the same layout.
    expect(other.pending).toBeUndefined();
    expect(other.bundle!.key).not.toBe(first.bundle!.key);
    expect(other.layoutKey).toBe(first.layoutKey);
    expect(Array.from(other.x)).toEqual(Array.from(first.x));
    // The very result that was kept: nothing was laid out again.
    expect(LAYOUTS.get(first.layoutKey!)!.result).toBe(kept);
    expect(other.routes).not.toEqual(build(input(0.85)).calc.routes);
  });

  it('warns once when force-directed bundling was refused, and draws the links straight', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const input = { arrangement: 'circular', link: { ...ring(40), bundle: { method: 'force' } } };
    const waiting = build(input).calc;
    BUNDLES.set(waiting.pending!.key, { routes: [], method: 'none', refused: true });
    const after = build(input).calc;
    expect(after.pending).toBeUndefined();
    expect(after.routes).toBeUndefined();
    expect(after.bundle?.refused).toBe(true);
    build(input);
    const said = warn.mock.calls.filter((c) => String(c[0]).includes('bundling'));
    expect(said).toHaveLength(1);
    expect(String(said[0]![0])).toContain('20,000');
  });
});

describe('graph view: what is still to come', () => {
  /** `requestAnimationFrame` by hand. */
  function frames() {
    const queue = new Map<number, FrameRequestCallback>();
    let ids = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queue.set(++ids, callback);
      return ids;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      queue.delete(id);
    });
    return queue;
  }

  const NET = { arrangement: 'force', node: { size: 8 }, link: ring(60), worker: true };

  it('holds the chart, asks for the layout, has calc run again and draws the synchronous picture', async () => {
    // No `Worker` in Node: the client says so once and runs the same code here.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = frames();
    const built = build(NET);
    const { ctx, added } = plotCtx(built);
    const view = graph.plot!.create(ctx);
    const [hold] = holds(added);
    expect(hold).toBeDefined();
    expect(hold!.object.visible).toBe(false);
    expect(ctx.recalc).not.toHaveBeenCalled();
    await (hold as unknown as { ready: Promise<void> }).ready;
    expect(ctx.recalc).toHaveBeenCalledTimes(1);
    // The run that follows: calc finds the layout, and the view draws it.
    const next = build(NET);
    expect(next.calc.pending).toBeUndefined();
    let time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (time += 100));
    view.update(plotCtx(next, IDENTITY, added).ctx, FULL);
    const sync = build({ ...NET, worker: false }).calc;
    expect(Array.from(next.calc.x)).toEqual(Array.from(sync.x));
    // The view glides there from the stand-in that was on screen, and the chart waits for that
    // too: it is ready when the layout is where it stays.
    expect(frameOf(next.calc).stamp).not.toBe(0);
    const [gliding] = holds(added);
    expect(gliding).toBeDefined();
    expect(gliding).not.toBe(hold);
    let arrived = false;
    void (gliding as unknown as { ready: Promise<void> }).ready.then(() => (arrived = true));
    await Promise.resolve();
    expect(arrived).toBe(false);
    for (let i = 0; i < 20 && queue.size > 0; i++) {
      const [id, callback] = queue.entries().next().value!;
      queue.delete(id);
      callback(0);
    }
    expect(frameOf(next.calc).stamp).toBe(0);
    expect(holds(added)).toHaveLength(0);
    await Promise.resolve();
    expect(arrived).toBe(true);
    const nodes = dataOf<{ x: Float64Array }>(markers(added).at(-1));
    expect(Array.from(nodes.x)).toEqual(Array.from(sync.x));
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('layout worker'))).not.toHaveLength(
      2,
    );
    view.dispose?.();
  });

  it('does not ask twice for a restyle of what the layout does not read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    frames();
    const built = build(NET);
    const { ctx, added } = plotCtx(built);
    const view = graph.plot!.create(ctx);
    const [hold] = holds(added);
    const restyled = build({ ...NET, link: { ...NET.link, color: 'red' } });
    expect(restyled.calc.pending!.key).toBe(built.calc.pending!.key);
    const again = plotCtx(restyled, IDENTITY, added).ctx;
    view.update(again, FULL);
    // The same request, the same hold.
    expect(holds(added)).toEqual([hold]);
    await (hold as unknown as { ready: Promise<void> }).ready;
    // Calc is asked to run again once, through the context of the last update.
    expect(again.recalc).toHaveBeenCalledTimes(1);
    expect(ctx.recalc).not.toHaveBeenCalled();
    view.dispose?.();
  });

  it('asks again for a restyle of what the layout reads, and lets the first request go', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    frames();
    const built = build(NET);
    const { ctx, added } = plotCtx(built);
    const view = graph.plot!.create(ctx);
    const [first] = holds(added);
    const other = build({ ...NET, force: { linkdistance: 90 } });
    const next = plotCtx(other, IDENTITY, added).ctx;
    view.update(next, FULL);
    const [second] = holds(added);
    expect(second).not.toBe(first);
    await (second as unknown as { ready: Promise<void> }).ready;
    await (first as unknown as { ready: Promise<void> }).ready;
    // Only the layout that is still wanted was kept.
    expect(LAYOUTS.get(other.calc.pending!.key)?.result).toBeDefined();
    expect(LAYOUTS.get(built.calc.pending!.key)).toBeUndefined();
    expect(next.recalc).toHaveBeenCalledTimes(1);
    view.dispose?.();
  });

  it('cancels when the trace is removed: nothing is kept and calc is not asked for', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = frames();
    const built = build(NET);
    const { ctx, added } = plotCtx(built);
    const view = graph.plot!.create(ctx);
    const [hold] = holds(added);
    view.dispose?.();
    await (hold as unknown as { ready: Promise<void> }).ready;
    // Let a layout that was not cancelled finish, if there were one.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(LAYOUTS.get(built.calc.pending!.key)).toBeUndefined();
    expect(ctx.recalc).not.toHaveBeenCalled();
    expect(queue.size).toBe(0);
    const code = await loadLayoutCode();
    expect(code.graphLayoutWorker().pending).toBe(0);
  });

  it('draws nothing in between on a static plot, and nothing moves', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = frames();
    const built = build(NET);
    built.fullLayout._staticPlot = true;
    const { ctx, added } = plotCtx(built);
    const view = graph.plot!.create(ctx);
    const [hold] = holds(added);
    await (hold as unknown as { ready: Promise<void> }).ready;
    // No frame was ever asked for: the layout reported no positions.
    expect(queue.size).toBe(0);
    expect(frameOf(built.calc).stamp).toBe(0);
    const next = build(NET);
    next.fullLayout._staticPlot = true;
    view.update(plotCtx(next, IDENTITY, added).ctx, FULL);
    // No glide to the result either.
    expect(queue.size).toBe(0);
    expect(frameOf(next.calc).stamp).toBe(0);
    view.dispose?.();
  });

  it('a static plot shows force.simulate settled: an image export is not a frame of the animation', () => {
    const queue = frames();
    const built = build({
      arrangement: 'force',
      force: { simulate: true },
      node: { label: ['a', 'b', 'c', 'd', 'e', 'f'] },
      link: { source: [0, 1, 2, 3, 4, 5, 2], target: [1, 2, 0, 4, 5, 3, 3] },
    });
    expect(built.calc.force?.simulate).toBe(true);
    built.fullLayout._staticPlot = true;
    const { ctx, added } = plotCtx(built);
    graph.plot!.create(ctx);
    expect(queue.size).toBe(0);
    const nodes = dataOf<{ x: Float64Array; y: Float64Array }>(markers(added).at(-1));
    expect(Array.from(nodes.x)).toEqual(Array.from(built.calc.x));
    expect(Array.from(nodes.y)).toEqual(Array.from(built.calc.y));
  });

  it('core tells the trace when the plot is static', () => {
    expect(
      build({ node: { x: [0], y: [0] } }, {}, { staticPlot: true }).fullLayout._staticPlot,
    ).toBe(true);
    expect(build({ node: { x: [0], y: [0] } }).fullLayout._staticPlot).toBe(false);
  });
});

describe('graph view: level of detail', () => {
  /** A grid of `side`² nodes 10 apart, each linked to the next and to the one below, labelled. */
  function grid(side: number, more: Record<string, unknown> = {}) {
    const n = side * side;
    const source: number[] = [];
    const target: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i % side < side - 1) {
        source.push(i);
        target.push(i + 1);
      }
      if (i + side < n) {
        source.push(i);
        target.push(i + side);
      }
    }
    return {
      node: {
        x: Array.from({ length: n }, (_, i) => (i % side) * 10),
        y: Array.from({ length: n }, (_, i) => Math.floor(i / side) * 10),
        label: Array.from({ length: n }, (_, i) => `n${i}`),
        size: 10,
      },
      link: { source, target, arrow: { end: true } },
      ...more,
    };
  }
  const at = (scale: number) => ({ scaleX: scale, scaleY: scale, offsetX: 0, offsetY: 0 });
  const kinds = (added: Primitive<unknown>[]) => ({
    text: added.some((p) => p instanceof TextPrimitive),
    markers: markers(added).length,
  });

  it('leaves a small graph alone, also where a large one would lose detail', () => {
    // 20 px apart: under both thresholds for a graph that starts there.
    const built = build(grid(20));
    const { ctx, added } = plotCtx(built, at(2));
    graph.plot!.create(ctx);
    expect(lodOf(built.calc).labels).toBe(true);
    // Arrowheads and nodes, and the labels.
    expect(kinds(added)).toEqual({ text: true, markers: 2 });
    const nodes = dataOf<{ size: Float32Array | number }>(markers(added).at(-1));
    expect(nodes.size instanceof Float32Array ? nodes.size[0] : nodes.size).toBe(10);
  });

  it('draws a large graph that is small on screen without labels and arrowheads, its nodes as dots', () => {
    // 3,600 nodes, 1 px apart: spacing 1 px, links 1 px long.
    const built = build(grid(60));
    const { ctx, added } = plotCtx(built, at(0.1));
    graph.plot!.create(ctx);
    const lod = lodOf(built.calc);
    expect(lod).toMatchObject({ labels: false, arrows: false, outlines: false, points: true });
    // The text and the arrowheads are not built at all.
    expect(kinds(added)).toEqual({ text: false, markers: 1 });
    const nodes = dataOf<{ size: number; lineWidth: number }>(markers(added)[0]);
    expect(nodes.size).toBe(LOD.point);
    expect(nodes.lineWidth).toBe(0);
    // Without arrowheads the links are plain segments that no zoom rebuilds.
    const { geometry } = drawnLinks(built.calc, built.trace, 0.1, 0.1);
    expect(geometry.depends).toBe('none');
    expect(geometry.arrows.count).toBe(0);
  });

  it('brings them back on a zoom, and takes them away again on the way out', () => {
    vi.useFakeTimers();
    try {
      const built = build(grid(60));
      const { ctx, added } = plotCtx(built, at(0.1));
      const view = graph.plot!.create(ctx);
      const zoom = (scale: number) =>
        view.update(plotCtx(built, at(scale), added).ctx, {
          calc: false,
          plot: false,
          style: false,
          transform: true,
        });
      // Nodes 30 px apart: everything.
      zoom(3);
      expect(lodOf(built.calc)).toMatchObject({
        labels: true,
        arrows: true,
        outlines: true,
        nodeScale: 1,
        points: false,
      });
      // Sizes and arrowheads at once; the labels of a graph this size once the zoom has settled.
      expect(kinds(added)).toEqual({ text: false, markers: 2 });
      vi.advanceTimersByTime(SETTLE_MS);
      expect(kinds(added)).toEqual({ text: true, markers: 2 });
      const nodes = dataOf<{ size: Float32Array | number; lineWidth: unknown }>(
        markers(added).at(-1),
      );
      expect(nodes.size instanceof Float32Array ? nodes.size[0] : nodes.size).toBe(10);
      expect(nodes.lineWidth).not.toBe(0);
      expect(drawnLinks(built.calc, built.trace, 3, 3).geometry.arrows.count).toBeGreaterThan(0);
      // Between the two sides of the thresholds (20 px): as it was.
      zoom(2);
      vi.advanceTimersByTime(SETTLE_MS);
      expect(lodOf(built.calc)).toMatchObject({ labels: true, arrows: true });
      expect(kinds(added)).toEqual({ text: true, markers: 2 });
      // Below them: gone, at once.
      zoom(1);
      expect(lodOf(built.calc)).toMatchObject({ labels: false, arrows: false });
      expect(kinds(added)).toEqual({ text: false, markers: 1 });
      // Back in between, from below: still gone. No flicker around a threshold.
      zoom(2);
      vi.advanceTimersByTime(SETTLE_MS);
      expect(kinds(added)).toEqual({ text: false, markers: 1 });
      view.dispose?.();
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws nodes smaller where they are close, with outlines down to 4 px', () => {
    const built = build(grid(60));
    // 9 px apart: 10 px nodes drawn at 6 px.
    const { ctx, added } = plotCtx(built, at(0.9));
    graph.plot!.create(ctx);
    const lod = lodOf(built.calc);
    expect(lod.nodeScale).toBeCloseTo(0.59, 6);
    expect(lod.outlines).toBe(true);
    const nodes = dataOf<{ size: Float32Array }>(markers(added).at(-1));
    expect(nodes.size[0]).toBeCloseTo(5.9, 5);
  });

  it('fades links that cover the plot, and not the ones a zoom has spread out', () => {
    // 3,600 nodes with 20 links each way: a hairball.
    const n = 3600;
    const source: number[] = [];
    const target: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 1; j <= 10; j++) {
        source.push(i);
        target.push((i * 31 + j * 577) % n);
      }
    }
    const built = build({
      node: {
        x: Array.from({ length: n }, (_, i) => (i % 60) * 10),
        y: Array.from({ length: n }, (_, i) => Math.floor(i / 60) * 10),
      },
      link: { source, target, opacity: 0.8 },
    });
    const { ctx, added } = plotCtx(built, at(1));
    const view = graph.plot!.create(ctx);
    const faint = lodOf(built.calc).linkAlpha;
    expect(faint).toBeLessThan(0.2);
    expect(faint).toBeGreaterThanOrEqual(LOD.alphaMin);
    // One number on the line: `link.opacity` times the factor.
    expect(dataOf<{ opacity: number }>(lines(added)[0]).opacity).toBeCloseTo(0.8 * faint, 6);
    view.update(plotCtx(built, at(40), added).ctx, {
      calc: false,
      plot: false,
      style: false,
      transform: true,
    });
    expect(lodOf(built.calc).linkAlpha).toBeGreaterThan(faint * 10);
    expect(dataOf<{ opacity: number }>(lines(added)[0]).opacity).toBeCloseTo(
      0.8 * lodOf(built.calc).linkAlpha,
      6,
    );
    view.dispose?.();
  });

  it('draws what a highlight emphasizes in full, and fades the rest by both factors', () => {
    const n = 3600;
    const source: number[] = [];
    const target: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 1; j <= 6; j++) {
        source.push(i);
        target.push((i * 31 + j * 577) % n);
      }
    }
    const built = build({
      node: {
        x: Array.from({ length: n }, (_, i) => (i % 60) * 10),
        y: Array.from({ length: n }, (_, i) => Math.floor(i / 60) * 10),
      },
      link: { source, target, color: 'rgba(0, 0, 0, 1)' },
      highlight: { nodes: [0], dim: 0.5 },
    });
    const { ctx, added } = plotCtx(built, at(1));
    graph.plot!.create(ctx);
    const faint = lodOf(built.calc).linkAlpha;
    expect(faint).toBeLessThan(0.5);
    const line = dataOf<{ opacity: number; color: Float32Array }>(lines(added)[0]);
    // The line is not faded as a whole: the links that are not emphasized are, in their colors.
    expect(line.opacity).toBe(1);
    const alphas = new Set<number>();
    for (let v = 3; v < line.color.length; v += 4) alphas.add(Math.fround(line.color[v]!));
    expect([...alphas].sort()).toEqual([Math.fround(0.5 * faint), 1].sort());
  });

  it('lod: false draws everything, lod: true applies to a small graph', () => {
    // 20 px apart: a large graph that starts there has neither labels nor arrowheads.
    const auto = plotCtx(build(grid(60)), at(2));
    graph.plot!.create(auto.ctx);
    expect(kinds(auto.added)).toEqual({ text: false, markers: 1 });
    const off = plotCtx(build(grid(60, { lod: false })), at(2));
    graph.plot!.create(off.ctx);
    expect(kinds(off.added)).toEqual({ text: true, markers: 2 });
    const on = plotCtx(build(grid(10, { lod: true })), at(2));
    graph.plot!.create(on.ctx);
    expect(kinds(on.added)).toEqual({ text: false, markers: 1 });
  });

  it('hits a node as large as it is drawn', () => {
    const built = build(grid(60));
    const { ctx } = plotCtx(built, at(0.9));
    graph.plot!.create(ctx);
    // 10 px nodes drawn at 6 px: 4 px from a center is outside, 2.5 px inside.
    const query = (px: number) => ({ xl: px / 0.9, yl: 0, px, py: 0, distance: 0 });
    const hit = (px: number) =>
      graphHitAt(built.calc, built.trace, query(px), { transform: at(0.9) }, false);
    expect(hit(2.5)?.kind).toBe('node');
    expect(hit(4)).toBeUndefined();
  });
});

describe('graph hover: links through the spatial index', () => {
  it('finds the link measuring every link finds, on a graph large enough for the index', () => {
    let state = 12345;
    const next = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const n = 400;
    const links = 2 * LINK_INDEX_MIN;
    const built = build({
      node: {
        x: Array.from({ length: n }, () => next() * 700),
        y: Array.from({ length: n }, () => next() * 500),
        size: 6,
      },
      link: {
        source: Array.from({ length: links }, () => Math.floor(next() * n)),
        target: Array.from({ length: links }, () => Math.floor(next() * n)),
        width: Array.from({ length: links }, () => 1 + Math.floor(next() * 4)),
      },
    });
    const { calc, trace } = built;
    expect(calc.model.links).toBeGreaterThanOrEqual(LINK_INDEX_MIN);
    const transform = { scaleX: 1.3, scaleY: -0.8, offsetX: 20, offsetY: 480 };
    const { geometry, widths } = drawnLinks(calc, trace, transform.scaleX, transform.scaleY);
    let found = 0;
    for (let q = 0; q < 500; q++) {
      const xl = next() * 700;
      const yl = next() * 500;
      const px = xl * transform.scaleX + transform.offsetX;
      const py = yl * transform.scaleY + transform.offsetY;
      // The scan the index replaces.
      let best = -1;
      let bestD = Infinity;
      for (let k = 0; k < calc.model.links; k++) {
        if (geometry.offsets[k] === geometry.offsets[k + 1]) continue;
        const reach = widths[k]! / 2 + LINK_REACH;
        const d2 = distanceToLink(geometry, k, px, py, transform);
        if (d2 > reach * reach) continue;
        const d = Math.max(0, Math.sqrt(d2) - widths[k]! / 2);
        if (d <= bestD) {
          bestD = d;
          best = k;
        }
      }
      const hit = graphHitAt(calc, trace, { xl, yl, px, py, distance: LINK_REACH }, { transform });
      if (hit?.kind === 'node') continue;
      expect(hit ? (hit as { k: number }).k : -1).toBe(best);
      if (best >= 0) {
        found++;
        expect(hit!.distance).toBe(bestD);
      }
    }
    expect(found).toBeGreaterThan(50);
  });
});
