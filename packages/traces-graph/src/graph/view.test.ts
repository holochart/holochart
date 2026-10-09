import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  LinePrimitive,
  MarkerSet,
  RectPrimitive,
  TextPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type ComponentPointerEvent,
  type SubplotInfo,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphCalc } from './calc.ts';
import { frameOf } from './frame.ts';
import { graph } from './index.ts';
import { LABELS_MOVING_MAX } from './plot.ts';

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
const NONE = { calc: false, plot: false, style: false, transform: false };

function build(input: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'graph', ...input }], layout: { template: 'none', ...layout } },
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
  input: Record<string, unknown>,
  transform = IDENTITY,
  layout: Record<string, unknown> = {},
) {
  const built = build(input, layout);
  const added: Primitive<unknown>[] = [];
  const ctx: TracePlotContext<GraphCalc> = {
    ...built,
    index: 0,
    subplot: { rect: { x: 0, y: 0, width: 500, height: 300 } } as unknown as SubplotInfo,
    xaxis: undefined,
    yaxis: undefined,
    transform,
    viewport: { size: { width: 500, height: 300 } } as Viewport,
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
  };
  return { ctx, added };
}

const byOrder = (added: Primitive<unknown>[]) =>
  [...added].sort((a, b) => a.object.renderOrder - b.object.renderOrder);
const kinds = (added: Primitive<unknown>[]) => byOrder(added).map((p) => p.constructor);
/** What a marker set was last given, by set: it keeps no readable copy of its data. */
const markerData = new WeakMap<MarkerSet, Record<string, unknown>>();
const dataOf = <T>(p: Primitive<unknown> | undefined) =>
  (p instanceof MarkerSet ? markerData.get(p) : (p as unknown as { data: T }).data) as T;
interface Label {
  text: string;
  x: number;
  y: number;
  angle?: number;
  anchorX?: string;
  font?: { size?: number };
  color?: number[];
  offset?: number[];
}
const labelsOf = (added: Primitive<unknown>[]) =>
  dataOf<{ labels: Label[] }>(added.find((p) => p instanceof TextPrimitive)).labels;
const lines = (added: Primitive<unknown>[]) =>
  byOrder(added).filter((p): p is LinePrimitive => p instanceof LinePrimitive);
const markers = (added: Primitive<unknown>[]) =>
  byOrder(added).filter((p): p is MarkerSet => p instanceof MarkerSet);

const CYCLE = {
  node: { label: ['A', 'B', 'C', 'D'] },
  link: { source: [0, 1, 2, 3], target: [1, 2, 3, 1] },
};
const TREE = {
  ids: ['r', 'a', 'b', 'a1', 'a2'],
  labels: ['Root', 'A', 'B', 'A one', 'A two'],
  parents: ['', 'r', 'r', 'a', 'a'],
};
const GROUPED = {
  node: { label: ['a', 'b', 'c', 'x', 'y', 'z'], group: ['p', 'p', 'p', 'q', 'q', 'q'] },
  link: { source: [0, 1, 0, 3, 4, 2, 0], target: [1, 2, 2, 4, 5, 3, 5] },
};

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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('graph view: what the arrangements add', () => {
  it('draws the links a layered layout turned around as a dashed line of their own', () => {
    const { ctx, added } = plotCtx({ ...CYCLE, arrangement: 'layered' });
    graph.plot!.create(ctx);
    // Links, the secondary links, arrowheads, boxes, text.
    expect(kinds(added)).toEqual([
      LinePrimitive,
      LinePrimitive,
      MarkerSet,
      RectPrimitive,
      TextPrimitive,
    ]);
    const [rest, turned] = lines(added);
    expect(dataOf<{ dash: string }>(rest).dash).toBe('solid');
    expect(dataOf<{ dash: string }>(turned).dash).toBe('dash');
    // One link was turned; the arrowheads are all in one set, one per link.
    const count = (line: LinePrimitive) => dataOf<{ starts: Uint32Array }>(line).starts.length + 1;
    expect([count(rest!), count(turned!)]).toEqual([3, 1]);
    expect(dataOf<{ x: Float64Array }>(markers(added)[0]).x).toHaveLength(4);
  });

  it('follows link.secondary on a restyle, and drops the second line without such links', () => {
    const { ctx, added } = plotCtx({ ...CYCLE, arrangement: 'layered' });
    const view = graph.plot!.create(ctx);
    const turned = lines(added)[1]!;
    const update = vi.spyOn(turned, 'update');
    const dotted = build({
      ...CYCLE,
      arrangement: 'layered',
      link: { ...CYCLE.link, secondary: { dash: 'dot', opacity: 1, color: '#ff0000' } },
    });
    view.update({ ...ctx, trace: dotted.trace }, { ...NONE, style: true });
    const style = update.mock.calls[0]![0] as { dash: string; color: Float32Array };
    expect(style.dash).toBe('dot');
    expect(Array.from(style.color.subarray(0, 4))).toEqual([1, 0, 0, 1]);
    const dag = build({
      ...CYCLE,
      arrangement: 'layered',
      link: { source: [0, 1], target: [1, 2] },
    });
    view.update({ ...ctx, ...dag }, { ...NONE, calc: true });
    expect(lines(added)).toHaveLength(1);
  });

  it('names the frames of clusters, in the strip at their top', () => {
    const { ctx, added } = plotCtx({
      ...GROUPED,
      arrangement: 'layered',
      layered: { clusters: true },
    });
    graph.plot!.create(ctx);
    expect(kinds(added)[0]).toBe(RectPrimitive);
    const labels = labelsOf(added);
    const titles = labels.filter((l) => l.text === 'p' || l.text === 'q');
    expect(titles).toHaveLength(2);
    const frame = ctx.calc.clusters![0]!;
    expect(titles[0]).toMatchObject({ x: frame.x0, y: frame.y1, anchorX: 'left', offset: [8, 4] });
    // The six boxes have their labels too.
    expect(labels).toHaveLength(8);
    // A group the legend hid has neither frame nor title.
    const hidden = build(
      { ...GROUPED, arrangement: 'layered', layered: { clusters: true } },
      { hiddenlabels: ['q'] },
    );
    const { ctx: ctx2, added: added2 } = plotCtx(GROUPED);
    graph.plot!.create({ ...ctx2, ...hidden });
    expect(labelsOf(added2).map((l) => l.text)).not.toContain('q');
    expect(labelsOf(added2).map((l) => l.text)).toContain('p');
  });

  it('draws the axes of a hive plot under everything, with their names', () => {
    const { ctx, added } = plotCtx({
      ...GROUPED,
      arrangement: 'hive',
      node: { ...GROUPED.node, textposition: 'none' },
    });
    graph.plot!.create(ctx);
    expect(kinds(added)).toEqual([LinePrimitive, LinePrimitive, MarkerSet, TextPrimitive]);
    const [guides, links] = lines(added);
    expect(dataOf<{ x: Float64Array }>(guides).x).toHaveLength(4);
    // Only the two links between the axes are drawn.
    expect(dataOf<{ starts: Uint32Array }>(links).starts).toHaveLength(1);
    // Node labels are off: the text is the names of the axes, beyond their ends.
    const labels = labelsOf(added);
    expect(labels.map((l) => l.text)).toEqual(['p', 'q']);
    expect(labels[0]!.offset![1]).toBeLessThan(0);
    expect(labels[0]!.offset![0]).toBeCloseTo(0, 9);
  });

  it('rings the collapsed nodes of a tree', () => {
    const { ctx, added } = plotCtx({ ...TREE, arrangement: 'tree', tree: { collapsed: ['a'] } });
    const view = graph.plot!.create(ctx);
    expect(kinds(added)).toEqual([LinePrimitive, MarkerSet, MarkerSet, TextPrimitive]);
    const [rings, nodes] = markers(added);
    const ring = dataOf<{ x: Float64Array; y: Float64Array; symbol: string; size: Float32Array }>(
      rings,
    );
    expect(ring.symbol).toBe('circle-open');
    expect([ring.x[0], ring.y[0]]).toEqual([ctx.calc.x[1], ctx.calc.y[1]]);
    expect(ring.x).toHaveLength(1);
    expect(ring.size[0]).toBeGreaterThan(ctx.calc.model.size[1]!);
    // The folded nodes are not drawn.
    expect(Number.isNaN(dataOf<{ x: Float64Array }>(nodes).x[3])).toBe(true);
    // Unfolded: no ring.
    view.update({ ...ctx, ...build({ ...TREE, arrangement: 'tree' }) }, { ...NONE, calc: true });
    expect(markers(added)).toHaveLength(1);
  });

  it('turns the labels of a radial tree along the radius, and of an upright tree upright', () => {
    const { ctx, added } = plotCtx(
      { ...TREE, arrangement: 'radial' },
      {
        scaleX: 1,
        scaleY: 1,
        offsetX: 250,
        offsetY: 150,
      },
    );
    graph.plot!.create(ctx);
    const labels = labelsOf(added);
    const leaf = labels.find((l) => l.text === 'A one')!;
    expect(typeof leaf.angle).toBe('number');
    // No label is upside down: every angle is within a quarter turn of level.
    for (const l of labels) {
      const a = (((((l.angle ?? 0) + 180) % 360) + 360) % 360) - 180;
      expect(Math.abs(a)).toBeLessThanOrEqual(90 + 1e-6);
    }
    const down = plotCtx(
      { ...TREE, arrangement: 'dendrogram' },
      {
        scaleX: 1,
        scaleY: 1,
        offsetX: 250,
        offsetY: 150,
      },
    );
    graph.plot!.create(down.ctx);
    expect(labelsOf(down.added).find((l) => l.text === 'B')).toMatchObject({
      angle: -90,
      anchorX: 'right',
    });
  });

  it('draws the boxes of a diagram and their text smaller when the axes shrink it', () => {
    const { ctx, added } = plotCtx({ ...CYCLE, arrangement: 'layered' });
    const view = graph.plot!.create(ctx);
    const boxes = added.find((p) => p instanceof RectPrimitive)!;
    const width = () => {
      const d = dataOf<{ x0: Float64Array; x1: Float64Array }>(boxes);
      return d.x1[0]! - d.x0[0]!;
    };
    const natural = 2 * ctx.calc.model.halfWidth[0]!;
    expect(width()).toBeCloseTo(natural, 9);
    const size = () => labelsOf(added)[0]!.font!.size!;
    const full = size();
    // Half the scale: as wide in layout units as before (half as wide on screen), text halved.
    const half = { scaleX: 0.5, scaleY: 0.5, offsetX: 0, offsetY: 0 };
    view.update({ ...ctx, transform: half }, { ...NONE, transform: true });
    expect(width()).toBeCloseTo(natural, 9);
    expect(size()).toBeCloseTo(full / 2, 9);
    // Twice the scale: the box keeps its size on screen, so half the width in layout units.
    const twice = { scaleX: 2, scaleY: 2, offsetX: 0, offsetY: 0 };
    view.update({ ...ctx, transform: twice }, { ...NONE, transform: true });
    expect(width()).toBeCloseTo(natural / 2, 9);
    expect(size()).toBeCloseTo(full, 9);
    // So small that the text could not be read: boxes without text.
    const tiny = { scaleX: 0.1, scaleY: 0.1, offsetX: 0, offsetY: 0 };
    view.update({ ...ctx, transform: tiny }, { ...NONE, transform: true });
    expect(labelsOf(added)).toHaveLength(0);
  });

  it('shows a hand over a node that can be folded, and takes no event', () => {
    const transform = { scaleX: 1, scaleY: 1, offsetX: 250, offsetY: 150 };
    const { ctx } = plotCtx({ ...TREE, arrangement: 'tree' }, transform);
    const view = graph.plot!.create(ctx);
    const event = (i: number, type: 'move' | 'click' = 'move'): ComponentPointerEvent => ({
      type,
      // Container px, y down, from linear coordinates.
      x: ctx.calc.x[i]! + 250,
      y: 300 - (ctx.calc.y[i]! + 150),
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      native: undefined,
      cursor: undefined,
    });
    const over = event(1);
    expect(view.handlePointer!(over)).toBe(false);
    expect(over.cursor).toBe('pointer');
    // A leaf, and empty space.
    const leaf = event(3);
    view.handlePointer!(leaf);
    expect(leaf.cursor).toBeUndefined();
    const nowhere = { ...event(1), x: 499, y: 1 };
    view.handlePointer!(nowhere);
    expect(nowhere.cursor).toBeUndefined();
    // A click without a chart to restyle does nothing, and is not consumed.
    expect(view.handlePointer!(event(1, 'click'))).toBe(false);
    // `tree.collapsible: false` turns it off.
    const fixed = build({ ...TREE, arrangement: 'tree', tree: { collapsible: false } });
    view.update({ ...ctx, ...fixed }, { ...NONE, calc: true });
    const off = event(1);
    view.handlePointer!(off);
    expect(off.cursor).toBeUndefined();
  });
});

describe('graph view: force.simulate', () => {
  /** `requestAnimationFrame` by hand: the callbacks wait until `frame()` runs them. */
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
    const frame = (): boolean => {
      const next = queue.entries().next().value;
      if (!next) return false;
      queue.delete(next[0]);
      next[1](0);
      return true;
    };
    return { queue, frame };
  }

  const NET = {
    arrangement: 'force',
    force: { simulate: true },
    node: { label: ['a', 'b', 'c', 'd', 'e', 'f'] },
    link: { source: [0, 1, 2, 3, 4, 5, 2], target: [1, 2, 0, 4, 5, 3, 3] },
  };

  it('draws the layout settling, frame by frame, and ends on the settled picture', () => {
    const raf = frames();
    const { ctx, added } = plotCtx(NET);
    const view = graph.plot!.create(ctx);
    const nodes = added.find((p) => p instanceof MarkerSet)!;
    const x = () => Array.from(dataOf<{ x: Float64Array }>(nodes).x);
    // It starts on the start positions, not on the result, and asks for a frame.
    const start = x();
    expect(start).not.toEqual(Array.from(ctx.calc.x));
    expect(raf.queue.size).toBe(1);
    expect(frameOf(ctx.calc).stamp).toBeGreaterThan(0);
    raf.frame();
    expect(x()).not.toEqual(start);
    expect(ctx.invalidate).toHaveBeenCalledTimes(1);
    // The labels follow the nodes of a small graph.
    expect(LABELS_MOVING_MAX).toBeGreaterThan(6);
    expect(labelsOf(added).find((l) => l.text === 'a')!.x).toBe(frameOf(ctx.calc).x[0]);
    let count = 1;
    while (raf.frame()) count++;
    expect(count).toBe(150);
    expect(ctx.invalidate).toHaveBeenCalledTimes(150);
    // At rest: the calc, and no frame waiting.
    expect(x()).toEqual(Array.from(ctx.calc.x));
    expect(frameOf(ctx.calc).stamp).toBe(0);
    expect(raf.queue.size).toBe(0);
    view.dispose!();
  });

  it('goes on through a restyle, and does not replay for a calc that lays out the same', () => {
    const raf = frames();
    const { ctx, added } = plotCtx(NET);
    const view = graph.plot!.create(ctx);
    for (let k = 0; k < 20; k++) raf.frame();
    const nodes = added.find((p) => p instanceof MarkerSet)!;
    const before = Array.from(dataOf<{ x: Float64Array }>(nodes).x);
    // A style edit: the same calc.
    const red = build({ ...NET, node: { ...NET.node, color: 'red' } });
    view.update({ ...ctx, trace: red.trace }, { ...NONE, style: true });
    expect(raf.queue.size).toBe(1);
    // A calc edit that moves nothing (hover data): a new calc, the run goes on from where it is.
    const again = build({ ...NET, node: { ...NET.node, customdata: [1, 2, 3, 4, 5, 6] } });
    view.update({ ...ctx, ...again }, { ...NONE, calc: true });
    expect(raf.queue.size).toBe(1);
    expect(Array.from(dataOf<{ x: Float64Array }>(nodes).x)).toEqual(before);
    let count = 20;
    while (raf.frame()) count++;
    expect(count).toBe(150);
    expect(Array.from(dataOf<{ x: Float64Array }>(nodes).x)).toEqual(Array.from(again.calc.x));
    // Finished: the same layout once more is drawn at once.
    view.update({ ...ctx, ...build(NET) }, { ...NONE, calc: true });
    expect(raf.queue.size).toBe(0);
    view.dispose!();
  });

  it('stops asking for frames when the view is disposed', () => {
    const raf = frames();
    const { ctx } = plotCtx(NET);
    const view = graph.plot!.create(ctx);
    raf.frame();
    expect(raf.queue.size).toBe(1);
    view.dispose!();
    expect(raf.queue.size).toBe(0);
  });

  it('draws the settled layout at once under reduced motion', () => {
    const raf = frames();
    const { ctx, added } = plotCtx(NET);
    const reduced = { ...ctx, fullLayout: { ...ctx.fullLayout, _reducedMotion: true } };
    graph.plot!.create(reduced as typeof ctx);
    expect(raf.queue.size).toBe(0);
    const nodes = added.find((p) => p instanceof MarkerSet)!;
    expect(Array.from(dataOf<{ x: Float64Array }>(nodes).x)).toEqual(Array.from(ctx.calc.x));
    // The system setting, when the config leaves it to it.
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const system = plotCtx(NET);
    graph.plot!.create(system.ctx);
    expect(raf.queue.size).toBe(0);
  });

  it('hides the labels of a larger graph until it is at rest', () => {
    const raf = frames();
    const n = LABELS_MOVING_MAX + 10;
    const { ctx, added } = plotCtx({
      arrangement: 'force',
      force: { simulate: true, ticks: 8 },
      node: { label: Array.from({ length: n }, (_, i) => `n${i}`) },
      link: {
        source: Array.from({ length: n - 1 }, (_, i) => i),
        target: Array.from({ length: n - 1 }, (_, i) => i + 1),
      },
    });
    const view = graph.plot!.create(ctx);
    expect(labelsOf(added)).toHaveLength(0);
    raf.frame();
    expect(labelsOf(added)).toHaveLength(0);
    while (raf.frame());
    expect(labelsOf(added).length).toBeGreaterThan(0);
    view.dispose!();
  });
});

describe('graph view: highlighting and pins (G5)', () => {
  /** Linear (x, y) in the 500 × 300 plot area: 100 px per unit, the origin at (50, 50). */
  const ZOOM = { scaleX: 100, scaleY: 100, offsetX: 50, offsetY: 50 };
  const pointer = (
    x: number,
    y: number,
    type: ComponentPointerEvent['type'] = 'move',
  ): ComponentPointerEvent => ({
    type,
    x: x * 100 + 50,
    y: 300 - (y * 100 + 50),
    button: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    native: undefined,
    cursor: undefined,
  });
  /** A chain a – b – c – d along y = 0 and e above it, apart. */
  const CHAIN = {
    node: { x: [0, 1, 2, 3, 1], y: [0, 0, 0, 0, 1.5], label: ['a', 'b', 'c', 'd', 'e'] },
    link: { source: [0, 1, 2], target: [1, 2, 3], color: 'rgba(0, 0, 0, 0.5)' },
  };
  const opacities = (set: MarkerSet | undefined): number[] | number => {
    const o = dataOf<{ opacity: Float32Array | number }>(set).opacity;
    return typeof o === 'number' ? o : Array.from(o, (v) => +v.toFixed(3));
  };

  it('a hover dims what is not next to the node, with style updates only, and a leave restores it', () => {
    const { ctx, added } = plotCtx(CHAIN, ZOOM);
    const view = graph.plot!.create(ctx);
    const [line] = lines(added);
    const nodes = markers(added).at(-1)!;
    expect(opacities(nodes)).toBe(1);
    const lineUpdate = vi.spyOn(line!, 'update');
    expect(view.handlePointer!(pointer(1, 0))).toBe(false);
    // b, its links and its neighbours a and c; d and e are dimmed.
    expect(opacities(nodes)).toEqual([1, 1, 1, 0.15, 0.15]);
    expect(lineUpdate).toHaveBeenCalledTimes(1);
    const style = lineUpdate.mock.calls[0]![0] as { color: Float32Array };
    expect(style).not.toHaveProperty('x');
    expect(style).not.toHaveProperty('starts');
    // Two vertices per straight link: the first two links opaque, the third dimmed.
    const alpha = Array.from({ length: 6 }, (_, v) => +style.color[4 * v + 3]!.toFixed(3));
    expect(alpha).toEqual([1, 1, 1, 1, 0.075, 0.075]);
    expect(ctx.invalidate).toHaveBeenCalled();
    // The same node again: nothing is uploaded.
    view.handlePointer!(pointer(1.02, 0.01));
    expect(lineUpdate).toHaveBeenCalledTimes(1);
    view.handlePointer!(pointer(0, 0, 'leave'));
    expect(opacities(nodes)).toBe(1);
    // One color for all again.
    const restored = lineUpdate.mock.calls[1]![0] as { color: unknown };
    expect(restored.color).not.toBeInstanceOf(Float32Array);
  });

  it('a hover on a link keeps the link and its two ends', () => {
    const { ctx, added } = plotCtx(CHAIN, ZOOM);
    const view = graph.plot!.create(ctx);
    view.handlePointer!(pointer(2.5, 0.01));
    expect(opacities(markers(added).at(-1))).toEqual([0.15, 0.15, 1, 1, 0.15]);
  });

  it('`highlight.dim` and `highlight.hops` say how much and how far', () => {
    const { ctx, added } = plotCtx({ ...CHAIN, highlight: { dim: 0.5, hops: 2 } }, ZOOM);
    const view = graph.plot!.create(ctx);
    view.handlePointer!(pointer(0, 0));
    expect(opacities(markers(added).at(-1))).toEqual([1, 1, 1, 0.5, 0.5]);
  });

  it('shows the labels of the highlighted nodes where culling had left them out', () => {
    // Two hubs with long labels and a leaf between them: its label has no room.
    const crowded = {
      node: {
        x: [0, 0.3, 0.6, 2, 2, 2],
        y: [0, 0, 0, 0, 1, 2],
        label: ['Hub with a long name', 'Leaf in between', 'Other hub', 'x', 'y', 'z'],
      },
      link: { source: [0, 0, 0, 2, 2, 1], target: [3, 4, 5, 3, 4, 0] },
    };
    const { ctx, added } = plotCtx(crowded, ZOOM);
    const view = graph.plot!.create(ctx);
    const shown = (): string[] => labelsOf(added).map((l) => l.text);
    expect(shown()).toContain('Hub with a long name');
    expect(shown()).not.toContain('Leaf in between');
    // The leaf and its one neighbour are highlighted: its label is placed first.
    view.handlePointer!(pointer(0.3, 0));
    expect(shown()).toContain('Leaf in between');
    const alpha = (text: string): number | undefined =>
      labelsOf(added).find((l) => l.text === text)?.color?.[3];
    expect(alpha('Leaf in between')).toBe(1);
    expect(alpha('z')).toBeCloseTo(0.15, 6);
    view.handlePointer!(pointer(0, 0, 'leave'));
    expect(shown()).not.toContain('Leaf in between');
    expect(alpha('z')).toBe(1);
  });

  it('two selected nodes highlight the path between them, in place of the selection dimming', () => {
    const { ctx, added } = plotCtx(CHAIN, ZOOM);
    const view = graph.plot!.create(ctx);
    const nodes = markers(added).at(-1)!;
    view.update({ ...ctx, selectedPoints: [0, 3] }, { ...NONE, selection: true });
    // The inner nodes of the path show in full; e is off the path.
    expect(opacities(nodes)).toEqual([1, 1, 1, 1, 0.15]);
    // Three nodes: a plain selection.
    view.update({ ...ctx, selectedPoints: [0, 1, 3] }, { ...NONE, selection: true });
    expect(opacities(nodes)).toEqual([1, 1, 0.2, 1, 0.2]);
    // `highlight.path` draws one whatever is selected.
    const given = build({ ...CHAIN, highlight: { path: [1, 3], color: '#ff0000' } });
    const [line] = lines(added);
    const lineUpdate = vi.spyOn(line!, 'update');
    view.update({ ...ctx, trace: given.trace, selectedPoints: null }, { ...NONE, style: true });
    expect(opacities(nodes)).toEqual([0.15, 1, 1, 1, 0.15]);
    const color = (lineUpdate.mock.calls[0]![0] as { color: Float32Array }).color;
    // The first link is dimmed, the last is in the highlight color.
    expect(+color[3]!.toFixed(3)).toBe(0.075);
    expect(Array.from(color.subarray(20, 24))).toEqual([1, 0, 0, 1]);
  });

  it('rings the pinned nodes of a force layout whose nodes drag', () => {
    const pinned = {
      arrangement: 'force',
      node: { x: [null, 30, null, null, null, null], y: [null, -10, null, null, null, null] },
      link: { source: [0, 1, 2, 3, 4, 5, 2], target: [1, 2, 0, 4, 5, 3, 3] },
    };
    const { ctx, added } = plotCtx(pinned);
    const view = graph.plot!.create(ctx);
    // Links, the ring, the nodes.
    expect(kinds(added)).toEqual([LinePrimitive, MarkerSet, MarkerSet]);
    const ring = dataOf<{ x: Float64Array; y: Float64Array; symbol: string }>(markers(added)[0]);
    expect(ring.symbol).toBe('circle-open');
    expect([Array.from(ring.x), Array.from(ring.y)]).toEqual([[30], [-10]]);
    // Nothing to release when the nodes do not drag: no ring.
    const fixed = build({ ...pinned, node: { ...pinned.node, draggable: false } });
    view.update({ ...ctx, ...fixed }, { ...NONE, calc: true });
    expect(kinds(added)).toEqual([LinePrimitive, MarkerSet]);
  });

  it('does not take a press on a node without a chart to restyle, and shows that nodes drag', () => {
    const { ctx } = plotCtx(CHAIN, ZOOM);
    const view = graph.plot!.create(ctx);
    const over = pointer(1, 0);
    view.handlePointer!(over);
    expect(over.cursor).toBe('grab');
    expect(view.handlePointer!(pointer(1, 0, 'down'))).toBe(false);
    expect((view as { clickThrough?: boolean }).clickThrough).toBe(true);
  });
});
