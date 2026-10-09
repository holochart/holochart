import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type ComponentPointerEvent,
  type SubplotInfo,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import type { GraphCalc } from './calc.ts';
import { frameOf, showFrame } from './frame.ts';
import { graph } from './index.ts';
import { GLIDE_MS, GraphInteraction, type InteractionHost } from './interact.ts';
import { ForceAnimation } from './simulate.ts';

const registry = createChartRegistry().register(graph);

type Ctx = TracePlotContext<GraphCalc>;
type AxisType = 'linear' | 'date' | 'category';

/** A 400 × 200 plot area at (50, 20) of the container, a px per linear unit unless told. */
const RECT = { x: 50, y: 20, width: 400, height: 200 };
const UNIT = { scaleX: 1, scaleY: 1, offsetX: 200, offsetY: 100 };

function context(
  input: Record<string, unknown>,
  options: {
    transform?: typeof UNIT;
    x?: AxisType;
    categories?: string[];
    selected?: number[] | null;
    layout?: Record<string, unknown>;
  } = {},
): Ctx {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'graph', ...input }], layout: { template: 'none', ...options.layout } },
    registry.core,
    { onIssue: () => {} },
  );
  const axis = (type: AxisType): AxisInfo =>
    ({
      type,
      scale: createScale({
        type,
        ...(options.categories ? { categories: options.categories } : {}),
      }),
      full: {},
    }) as unknown as AxisInfo;
  const xaxis = axis(options.x ?? 'linear');
  const yaxis = axis('linear');
  const calcCtx: CalcContext = { fullLayout, index: 0, xaxis, yaxis };
  const trace = fullData[0] as FullTrace;
  return {
    trace,
    calc: graph.calc!(trace, calcCtx),
    fullLayout,
    index: 0,
    subplot: { rect: RECT } as unknown as SubplotInfo,
    xaxis,
    yaxis,
    transform: options.transform ?? UNIT,
    selectedPoints: options.selected ?? null,
  } as unknown as Ctx;
}

/** The container position of a linear point under a transform. */
function at(x: number, y: number, t = UNIT): [number, number] {
  return [RECT.x + x * t.scaleX + t.offsetX, RECT.y + RECT.height - (y * t.scaleY + t.offsetY)];
}

function event(
  type: ComponentPointerEvent['type'],
  [x, y]: readonly [number, number],
  more: Partial<ComponentPointerEvent> = {},
): ComponentPointerEvent {
  return {
    type,
    x,
    y,
    button: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    native: undefined,
    cursor: undefined,
    ...more,
  };
}

/** A view stand-in: it keeps what it is asked to draw, and runs animation frames by hand. */
function setup(ctx: Ctx, options: { motion?: boolean; chart?: boolean } = {}) {
  const state = { ctx, time: 0 };
  const log: string[] = [];
  const restyles: { update: Record<string, unknown>; traces: number[]; gui: boolean }[] = [];
  const queue = new Map<number, () => void>();
  let ids = 0;
  const requestFrame = (callback: () => void): number => {
    queue.set(++ids, callback);
    return ids;
  };
  const cancelFrame = (id: number): void => void queue.delete(id);
  // The animation and the interaction know each other, as in the view.
  const view: { interaction?: GraphInteraction } = {};
  const animation = new ForceAnimation({
    show: (positions, ended) => {
      const interaction = view.interaction!;
      if (!positions) {
        if (interaction.rest(frameOf(state.ctx.calc), ended)) {
          log.push('rest: kept');
          return;
        }
        showFrame(state.ctx.calc, undefined);
        log.push('rest');
        return;
      }
      const at = interaction.through(positions);
      showFrame(state.ctx.calc, {
        x: at.x,
        y: at.y,
        hidden: state.ctx.calc.hidden,
        routes: undefined,
      });
      log.push('frame');
    },
    requestFrame,
    cancelFrame,
  });
  const chart = {
    destroyed: false,
    restyle: (update: Record<string, unknown>, traces: number[], o: { gui: boolean }) => {
      restyles.push({ update, traces, gui: o.gui });
      return Promise.resolve();
    },
    unhover: () => log.push('unhover'),
  };
  const host: InteractionHost = {
    ctx: () => state.ctx,
    chart: () => (options.chart === false ? undefined : chart),
    motion: () => options.motion !== false,
    animation,
    draw: (rest) => log.push(rest ? 'draw rest' : 'draw'),
    recolor: () => log.push('recolor'),
    requestFrame,
    cancelFrame,
    now: () => state.time,
  };
  const interaction = new GraphInteraction(host);
  view.interaction = interaction;
  animation.sync(ctx.calc, options.motion !== false);
  interaction.seen(ctx);
  /** Run the animation frames that are waiting; how many there were. */
  const frames = (max = 1): number => {
    let ran = 0;
    while (ran < max) {
      const next = queue.entries().next().value;
      if (!next) break;
      queue.delete(next[0]);
      next[1]();
      ran++;
    }
    return ran;
  };
  /** The view's part when a context arrives. */
  const arrive = (next: Ctx, calcChanged = true): void => {
    state.ctx = next;
    interaction.arrive(next, calcChanged);
    animation.sync(next.calc, options.motion !== false);
    interaction.settle(next);
    interaction.seen(next);
  };
  return { state, log, restyles, interaction, animation, frames, arrive, queue, chart };
}

const flags = (mask: Uint8Array | undefined): number[] => {
  const out: number[] = [];
  mask?.forEach((v, i) => v === 1 && out.push(i));
  return out;
};

/** A chain a – b – c – d at y = 0, 40 units apart, and e apart from it. */
const CHAIN = {
  node: { x: [-60, -20, 20, 60, 0], y: [0, 0, 0, 0, 60], size: 10 },
  link: { source: [0, 1, 2], target: [1, 2, 3] },
};

/** Two triangles joined by a link, laid out by the force layout. */
const FORCE = {
  arrangement: 'force',
  link: { source: [0, 1, 2, 3, 4, 5, 2], target: [1, 2, 0, 4, 5, 3, 3] },
};

describe('hover highlighting', () => {
  it('emphasizes the neighbourhood of the node under the pointer, until the pointer leaves it', () => {
    const ctx = context(CHAIN);
    const { interaction, log } = setup(ctx);
    expect(interaction.emphasis(ctx)).toBeUndefined();
    const move = event('move', at(-20, 0));
    expect(interaction.handlePointer(move)).toBe(false);
    expect(log).toEqual(['recolor']);
    const lit = interaction.emphasis(ctx)!;
    expect(flags(lit.node)).toEqual([0, 1, 2]);
    expect(flags(lit.link)).toEqual([0, 1]);
    // A node that drags shows it.
    expect(move.cursor).toBe('grab');
    // Still on it: nothing is done again.
    interaction.handlePointer(event('move', at(-18, 1)));
    expect(log).toEqual(['recolor']);
    expect(interaction.emphasis(ctx)).toBe(lit);
    // On to the next node, then off every node and link.
    interaction.handlePointer(event('move', at(60, 0)));
    expect(flags(interaction.emphasis(ctx)!.node)).toEqual([2, 3]);
    const off = event('move', at(-60, 60));
    interaction.handlePointer(off);
    expect(off.cursor).toBeUndefined();
    expect(interaction.emphasis(ctx)).toBeUndefined();
    expect(log).toEqual(['recolor', 'recolor', 'recolor']);
  });

  it('emphasizes a link and its two ends', () => {
    const ctx = context(CHAIN);
    const { interaction } = setup(ctx);
    interaction.handlePointer(event('move', at(0, 1)));
    const lit = interaction.emphasis(ctx)!;
    expect(flags(lit.node)).toEqual([1, 2]);
    expect(flags(lit.link)).toEqual([1]);
  });

  it('is restored when the pointer leaves the chart, and outside the plot area', () => {
    const ctx = context(CHAIN);
    const { interaction, log } = setup(ctx);
    interaction.handlePointer(event('move', at(-20, 0)));
    expect(interaction.handlePointer(event('leave', [0, 0]))).toBe(false);
    expect(interaction.emphasis(ctx)).toBeUndefined();
    expect(log).toEqual(['recolor', 'recolor']);
    interaction.handlePointer(event('move', [RECT.x - 5, RECT.y + 100]));
    expect(interaction.emphasis(ctx)).toBeUndefined();
  });

  it('does nothing with `highlight.mode` without neighbours, but the cursor still shows the drag', () => {
    const ctx = context({ ...CHAIN, highlight: { mode: 'path' } });
    const { interaction, log } = setup(ctx);
    const move = event('move', at(-20, 0));
    interaction.handlePointer(move);
    expect(log).toEqual([]);
    expect(interaction.emphasis(ctx)).toBeUndefined();
    expect(move.cursor).toBe('grab');
  });

  it('is forgotten with a new calc', () => {
    const ctx = context(CHAIN);
    const { interaction, arrive } = setup(ctx);
    interaction.handlePointer(event('move', at(-20, 0)));
    const next = context(CHAIN);
    arrive(next);
    expect(interaction.emphasis(next)).toBeUndefined();
  });
});

describe('a highlight the figure gives', () => {
  it('`highlight.nodes` is the emphasis without a pointer; a hover takes its place', () => {
    const ctx = context({ ...CHAIN, highlight: { nodes: [3] } });
    const { interaction } = setup(ctx);
    expect(flags(interaction.emphasis(ctx)!.node)).toEqual([2, 3]);
    interaction.handlePointer(event('move', at(-60, 0)));
    expect(flags(interaction.emphasis(ctx)!.node)).toEqual([0, 1]);
    interaction.handlePointer(event('leave', [0, 0]));
    expect(flags(interaction.emphasis(ctx)!.node)).toEqual([2, 3]);
    // It comes before a path.
    const both = context({ ...CHAIN, highlight: { nodes: [3] } }, { selected: [0, 2] });
    expect(flags(interaction.emphasis(both)!.node)).toEqual([2, 3]);
  });
});

describe('the highlighted path', () => {
  it('is the emphasis while exactly two nodes are selected, and a hover takes its place', () => {
    const ctx = context(CHAIN, { selected: [0, 3] });
    const { interaction } = setup(ctx);
    expect(interaction.path(ctx)).toEqual({ nodes: [0, 1, 2, 3], links: [0, 1, 2], length: 3 });
    const lit = interaction.emphasis(ctx)!;
    expect(flags(lit.node)).toEqual([0, 1, 2, 3]);
    expect(flags(lit.link)).toEqual([0, 1, 2]);
    interaction.handlePointer(event('move', at(60, 0)));
    expect(flags(interaction.emphasis(ctx)!.node)).toEqual([2, 3]);
    interaction.handlePointer(event('leave', [0, 0]));
    expect(flags(interaction.emphasis(ctx)!.node)).toEqual([0, 1, 2, 3]);
  });

  it('follows the selection, and is nothing between nodes that are not linked', () => {
    const { interaction } = setup(context(CHAIN));
    const three = context(CHAIN, { selected: [0, 1, 3] });
    expect(interaction.emphasis(three)).toBeUndefined();
    const apart = context(CHAIN, { selected: [0, 4] });
    expect(interaction.path(apart)).toBeUndefined();
    expect(interaction.emphasis(apart)).toBeUndefined();
    const given = context({ ...CHAIN, highlight: { path: [1, 3] } }, { selected: [0, 4] });
    expect(interaction.path(given)?.nodes).toEqual([1, 2, 3]);
  });
});

describe('dragging a node whose position is data', () => {
  it('moves it with the pointer and restyles its position on release', () => {
    const ctx = context(CHAIN);
    const { interaction, log, restyles, frames, state } = setup(ctx);
    interaction.handlePointer(event('move', at(-20, 0)));
    log.length = 0;
    expect(interaction.handlePointer(event('down', at(-20, 0)))).toBe(true);
    expect(interaction.moving).toBe(false);
    expect(interaction.handlePointer(event('move', at(-10, 12)))).toBe(true);
    // The hover is dropped when the drag starts: the label would stay behind.
    expect(log).toEqual(['recolor', 'unhover']);
    expect(interaction.emphasis(ctx)).toBeUndefined();
    expect(interaction.moving).toBe(true);
    // Drawn once per animation frame, however many moves came in.
    interaction.handlePointer(event('move', at(-5, 20)));
    expect(frames(5)).toBe(1);
    expect(log).toEqual(['recolor', 'unhover', 'draw']);
    const frame = frameOf(state.ctx.calc);
    expect([frame.x[1], frame.y[1]]).toEqual([-5, 20]);
    expect([frame.x[0], frame.x[2]]).toEqual([-60, 20]);
    expect(interaction.handlePointer(event('up', at(0, 30)))).toBe(true);
    expect(restyles).toEqual([
      {
        update: { 'node.x': [[-60, 0, 20, 60, 0]], 'node.y': [[0, 30, 0, 0, 60]] },
        traces: [0],
        gui: true,
      },
    ]);
    // The node stays where it was dropped until the calc arrives.
    expect(frameOf(state.ctx.calc).x[1]).toBe(0);
    expect(interaction.moving).toBe(false);
    // The trace's own arrays are as they were.
    expect((ctx.trace['node'] as { x: number[] }).x).toEqual([-60, -20, 20, 60, 0]);
  });

  it('keeps the node inside the plot area', () => {
    const ctx = context(CHAIN);
    const { interaction, restyles } = setup(ctx);
    interaction.handlePointer(event('down', at(-20, 0)));
    interaction.handlePointer(event('move', at(-10, 0)));
    interaction.handlePointer(event('up', [RECT.x + RECT.width + 300, RECT.y - 80]));
    // The edges of the plot area: x = 200, y = 100 under this transform.
    expect(restyles[0]!.update).toEqual({
      'node.x': [[-60, 200, 20, 60, 0]],
      'node.y': [[0, 100, 0, 0, 60]],
    });
  });

  it('writes dates on a date axis', () => {
    const day = 86_400_000;
    const t = {
      scaleX: 100 / day,
      scaleY: 1,
      offsetX: -(Date.UTC(2024, 0, 1) / day) * 100,
      offsetY: 100,
    };
    const ctx = context(
      {
        node: { x: ['2024-01-02', '2024-01-03'], y: [0, 0], size: 10 },
        link: { source: [0], target: [1] },
      },
      { x: 'date', transform: t },
    );
    const { interaction, restyles } = setup(ctx);
    const from = at(Date.UTC(2024, 0, 2), 0, t);
    interaction.handlePointer(event('down', from));
    interaction.handlePointer(event('move', [from[0] + 20, from[1]]));
    // Half a day to the right, 10 units up.
    interaction.handlePointer(event('up', [from[0] + 50, from[1] - 10]));
    expect(restyles[0]!.update).toEqual({
      'node.x': [['2024-01-02 12:00', '2024-01-03']],
      'node.y': [[10, 0]],
    });
  });

  it('snaps to the categories of a category axis', () => {
    const t = { scaleX: 100, scaleY: 1, offsetX: 50, offsetY: 100 };
    const ctx = context(
      {
        node: { x: ['low', 'mid', 'high'], y: [0, 0, 0], size: 10 },
        link: { source: [0, 1], target: [1, 2] },
      },
      { x: 'category', categories: ['low', 'mid', 'high'], transform: t },
    );
    const { interaction, restyles, frames, state } = setup(ctx);
    const from = at(0, 0, t);
    interaction.handlePointer(event('down', from));
    // 130 px to the right is 1.3 categories on: drawn on the second.
    interaction.handlePointer(event('move', [from[0] + 130, from[1] - 15]));
    frames();
    expect(frameOf(state.ctx.calc).x[0]).toBe(1);
    // Far to the right: the last category.
    interaction.handlePointer(event('up', [from[0] + 340, from[1] - 15]));
    expect(restyles[0]!.update).toEqual({
      'node.x': [['high', 'mid', 'high']],
      'node.y': [[15, 0, 0]],
    });
  });

  it('a press without a move is left to the chart as a click', () => {
    const ctx = context(CHAIN);
    const { interaction, restyles, log } = setup(ctx);
    expect(interaction.handlePointer(event('down', at(-20, 0)))).toBe(true);
    expect(interaction.handlePointer(event('up', at(-20, 0)))).toBe(true);
    expect(interaction.handlePointer(event('click', at(-20, 0)))).toBe(false);
    expect(restyles).toEqual([]);
    expect(log).toEqual([]);
  });

  it("a press on empty space, or on a node that does not drag, is the chart's", () => {
    const ctx = context(CHAIN);
    const free = setup(ctx);
    expect(free.interaction.handlePointer(event('down', at(-60, 60)))).toBe(false);
    // On a link.
    expect(free.interaction.handlePointer(event('down', at(0, 1)))).toBe(false);
    const fixed = setup(context({ ...CHAIN, node: { ...CHAIN.node, draggable: false } }));
    expect(fixed.interaction.handlePointer(event('down', at(-20, 0)))).toBe(false);
    const move = event('move', at(-20, 0));
    fixed.interaction.handlePointer(move);
    expect(move.cursor).toBeUndefined();
    // Without a chart to restyle, nothing is dragged.
    const lost = setup(ctx, { chart: false });
    expect(lost.interaction.handlePointer(event('down', at(-20, 0)))).toBe(false);
  });

  it('a cancelled drag puts the node back', () => {
    const ctx = context(CHAIN);
    const { interaction, log, frames, state, restyles } = setup(ctx);
    interaction.handlePointer(event('down', at(-20, 0)));
    interaction.handlePointer(event('move', at(0, 30)));
    frames();
    expect(frameOf(state.ctx.calc).y[1]).toBe(30);
    log.length = 0;
    expect(interaction.handlePointer(event('leave', at(0, 30)))).toBe(true);
    expect(frameOf(state.ctx.calc).y[1]).toBe(0);
    expect(log).toEqual(['draw rest']);
    expect(interaction.moving).toBe(false);
    expect(restyles).toEqual([]);
  });

  it('glides to the calc that comes back when the axes moved under it', () => {
    const ctx = context(CHAIN);
    const { interaction, log, frames, state, arrive, restyles } = setup(ctx);
    interaction.handlePointer(event('down', at(60, 0)));
    interaction.handlePointer(event('move', at(100, 0)));
    interaction.handlePointer(event('up', at(160, 0)));
    const update = restyles[0]!.update as { 'node.x': number[][]; 'node.y': number[][] };
    // The figure with the node at its new place, and autorange zoomed out to fit it.
    const half = { scaleX: 0.5, scaleY: 0.5, offsetX: 200, offsetY: 100 };
    const next = context(
      { ...CHAIN, node: { ...CHAIN.node, x: update['node.x'][0], y: update['node.y'][0] } },
      { transform: half },
    );
    log.length = 0;
    arrive(next);
    // First where everything was on screen: node 0 was at px 140, which is −120 at half scale.
    const start = frameOf(next.calc);
    expect(start.x[0]).toBe(-120);
    expect(start.x[3]).toBe(320);
    expect(interaction.moving).toBe(true);
    state.time = 1000;
    frames();
    state.time = 1000 + GLIDE_MS / 2;
    frames();
    const mid = frameOf(next.calc);
    expect(mid.x[0]).toBeCloseTo(-90, 6);
    expect(mid.x[3]).toBeCloseTo(240, 6);
    state.time = 1000 + GLIDE_MS + 1;
    frames();
    expect(frameOf(next.calc).x[0]).toBe(-60);
    expect(frameOf(next.calc).x[3]).toBe(160);
    expect(log).toEqual(['draw', 'draw', 'draw rest']);
    expect(interaction.moving).toBe(false);
    expect(frames(3)).toBe(0);
  });

  it('does not glide when nothing moved on screen, nor without motion', () => {
    const ctx = context(CHAIN);
    const still = setup(ctx);
    still.interaction.handlePointer(event('down', at(60, 0)));
    still.interaction.handlePointer(event('move', at(70, 10)));
    still.interaction.handlePointer(event('up', at(80, 20)));
    const moved = {
      ...CHAIN,
      node: { ...CHAIN.node, x: [-60, -20, 20, 80, 0], y: [0, 0, 0, 20, 60] },
    };
    const next = context(moved);
    still.arrive(next);
    expect(still.interaction.moving).toBe(false);
    expect(still.queue.size).toBe(0);
    expect(frameOf(next.calc).x[3]).toBe(80);
    const reduced = setup(ctx, { motion: false });
    reduced.interaction.handlePointer(event('down', at(60, 0)));
    reduced.interaction.handlePointer(event('move', at(100, 0)));
    reduced.interaction.handlePointer(event('up', at(160, 0)));
    reduced.arrive(context(moved, { transform: { ...UNIT, scaleX: 0.5 } }));
    expect(reduced.interaction.moving).toBe(false);
    expect(reduced.queue.size).toBe(0);
  });
});

describe('dragging a node of a force layout shown at rest', () => {
  /** A px per unit, the origin in the middle: the layout is some tens of units wide. */
  const ctxOf = (input: Record<string, unknown> = FORCE): Ctx => context(input);

  it('pins it where it is dropped and writes the picture, at rest', () => {
    const ctx = ctxOf();
    const { calc } = ctx;
    const { interaction, restyles, frames, state } = setup(ctx);
    const [x0, y0] = [calc.x[0]!, calc.y[0]!];
    interaction.handlePointer(event('down', at(x0, y0)));
    interaction.handlePointer(event('move', at(x0 + 30, y0 + 10)));
    // The node is ringed as pinned while it is held, before the figure says so.
    expect(interaction.pinning).toBe(0);
    frames();
    // Nothing else moves.
    const frame = frameOf(state.ctx.calc);
    for (let i = 1; i < 6; i++) expect(frame.x[i]).toBe(calc.x[i]);
    interaction.handlePointer(event('up', at(x0 + 50, y0 + 20)));
    expect(interaction.pinning).toBe(-1);
    const round = (v: number): number => Math.round(v * 100) / 100;
    const px = round(x0 + 50);
    const py = round(y0 + 20);
    expect(restyles).toHaveLength(1);
    expect(restyles[0]!.gui).toBe(true);
    expect(restyles[0]!.update).toEqual({
      'node.x': [[px, null, null, null, null, null]],
      'node.y': [[py, null, null, null, null, null]],
      'force.start.x': [[px, ...Array.from(calc.x.subarray(1), round)]],
      'force.start.y': [[py, ...Array.from(calc.y.subarray(1), round)]],
      'force.start.alpha': [0],
    });
  });

  it('the calc that comes back is the picture: nothing glides', () => {
    const ctx = ctxOf();
    const { calc } = ctx;
    const { interaction, restyles, arrive, queue } = setup(ctx);
    interaction.handlePointer(event('down', at(calc.x[0]!, calc.y[0]!)));
    interaction.handlePointer(event('move', at(calc.x[0]! + 30, calc.y[0]!)));
    interaction.handlePointer(event('up', at(calc.x[0]! + 50, calc.y[0]!)));
    const u = restyles[0]!.update as Record<string, unknown[][]>;
    const next = ctxOf({
      ...FORCE,
      node: { x: u['node.x']![0], y: u['node.y']![0] },
      force: { start: { x: u['force.start.x']![0], y: u['force.start.y']![0], alpha: 0 } },
    });
    arrive(next);
    expect(next.calc.x[0]).toBeCloseTo(calc.x[0]! + 50, 1);
    for (let i = 1; i < 6; i++) expect(next.calc.x[i]).toBeCloseTo(calc.x[i]!, 1);
    expect(interaction.moving).toBe(false);
    expect(queue.size).toBe(0);
  });

  it('a double click on a pinned node releases it, and the layout warms up again', () => {
    const cold = ctxOf();
    const x = Array.from(cold.calc.x, (v) => Math.round(v * 100) / 100);
    const y = Array.from(cold.calc.y, (v) => Math.round(v * 100) / 100);
    const ctx = ctxOf({
      ...FORCE,
      node: {
        x: [x[0]! + 50, null, null, null, null, null],
        y: [y[0], null, null, null, null, null],
      },
      force: { start: { x: [x[0]! + 50, ...x.slice(1)], y, alpha: 0 } },
    });
    const { interaction, restyles } = setup(ctx);
    const px = Math.round((x[0]! + 50) * 100) / 100;
    // A double click on a node that is not pinned is not taken.
    expect(interaction.handlePointer(event('dblclick', at(x[3]!, y[3]!)))).toBe(false);
    expect(interaction.handlePointer(event('dblclick', at(x[0]! + 50, y[0]!)))).toBe(true);
    expect(restyles[0]!.update).toEqual({
      'node.x': [[null, null, null, null, null, null]],
      'node.y': [[null, null, null, null, null, null]],
      'force.start.x': [[px, ...x.slice(1)]],
      'force.start.y': [y],
      'force.start.alpha': [0.3],
    });
  });
});

describe('dragging a node under `force.simulate`', () => {
  const SIMULATE = { ...FORCE, force: { simulate: true } };

  /** A view with its first animation run to rest. */
  function settled() {
    const ctx = context(SIMULATE);
    const s = setup(ctx);
    expect(s.animation.running).toBe(true);
    while (s.frames(1000) > 0);
    expect(s.animation.running).toBe(false);
    s.log.length = 0;
    return { ctx, ...s };
  }

  it('runs a simulation from the picture with the node held: the others give way', () => {
    const { ctx, interaction, animation, frames, restyles, log } = settled();
    const { calc } = ctx;
    const [x0, y0] = [calc.x[0]!, calc.y[0]!];
    interaction.handlePointer(event('down', at(x0, y0)));
    expect(animation.running).toBe(false);
    interaction.handlePointer(event('move', at(x0 - 40, y0)));
    // The simulation is the drag's own, started from what is on screen.
    expect(animation.running).toBe(true);
    const sim = animation.simulation!;
    expect(sim.alpha).toBeCloseTo(0.3, 6);
    expect([sim.x[0], sim.y[0]]).toEqual([x0 - 40, y0]);
    for (let i = 1; i < 6; i++) expect(sim.x[i]).toBe(calc.x[i]);
    frames(20);
    expect(log.filter((l) => l === 'frame')).toHaveLength(20);
    // Held at the pointer, whatever the forces; its neighbours 1 and 2 follow it to the left.
    expect([sim.x[0], sim.y[0]]).toEqual([x0 - 40, y0]);
    expect(sim.x[1]).toBeLessThan(calc.x[1]!);
    expect(sim.x[2]).toBeLessThan(calc.x[2]!);
    // A move keeps it warm.
    interaction.handlePointer(event('move', at(x0 - 60, y0 + 5)));
    expect(sim.alpha).toBeCloseTo(0.3, 6);
    expect([sim.x[0], sim.y[0]]).toEqual([x0 - 60, y0 + 5]);
    expect(restyles).toEqual([]);
  });

  it('the release pins the node and writes the picture as it is; the simulation goes on', () => {
    const view = settled();
    const { ctx, interaction, animation, frames, restyles, arrive, log } = view;
    const { calc } = ctx;
    const [x0, y0] = [calc.x[0]!, calc.y[0]!];
    interaction.handlePointer(event('down', at(x0, y0)));
    interaction.handlePointer(event('move', at(x0 - 40, y0)));
    frames(10);
    interaction.handlePointer(event('up', at(x0 - 60, y0)));
    expect(restyles).toHaveLength(1);
    const u = restyles[0]!.update as Record<string, (number | null)[][]>;
    const round = (v: number): number => Math.round(v * 100) / 100;
    expect(u['node.x']![0]).toEqual([round(x0 - 60), null, null, null, null, null]);
    expect(u['node.y']![0]).toEqual([round(y0), null, null, null, null, null]);
    expect(u['force.start.alpha']).toEqual([0]);
    expect(u['force.start.x']![0]![0]).toBe(round(x0 - 60));
    // Its neighbours are where the simulation has them now, not where they were.
    expect(u['force.start.x']![0]![1]).toBeLessThan(round(calc.x[1]!));
    // The calc that comes back does not start the animation over: the same simulation goes on.
    const sim = animation.simulation;
    const next = context({
      ...SIMULATE,
      node: { x: u['node.x']![0], y: u['node.y']![0] },
      force: {
        simulate: true,
        start: { x: u['force.start.x']![0], y: u['force.start.y']![0], alpha: 0 },
      },
    });
    arrive(next);
    expect(animation.running).toBe(true);
    expect(animation.simulation).toBe(sim);
    // At rest, the figure gets where the layout ended, and the frame stays until it answers.
    log.length = 0;
    const { state } = view;
    for (let more = 1; more > 0; state.time += 16) more = frames(1);
    expect(log.at(-1)).toBe('rest: kept');
    expect(restyles).toHaveLength(2);
    const settledAt = restyles[1]!.update as Record<string, number[][]>;
    expect(Object.keys(settledAt)).toEqual(['force.start.x', 'force.start.y', 'force.start.alpha']);
    expect(settledAt['force.start.alpha']).toEqual([0]);
    expect(settledAt['force.start.x']![0]![0]).toBe(round(x0 - 60));
    expect(settledAt['force.start.x']![0]).toEqual(Array.from(sim!.x, round));
    // That calc is the picture on screen: shown as it is, no animation, nothing more to write.
    const last = context({
      ...SIMULATE,
      node: { x: u['node.x']![0], y: u['node.y']![0] },
      force: {
        simulate: true,
        start: {
          x: settledAt['force.start.x']![0],
          y: settledAt['force.start.y']![0],
          alpha: 0,
        },
      },
    });
    arrive(last);
    expect(animation.running).toBe(false);
    expect(interaction.moving).toBe(false);
    expect(Array.from(last.calc.x)).toEqual(settledAt['force.start.x']![0]);
    expect(restyles).toHaveLength(2);
  });

  it('a node held still lets the simulation rest without letting go of the picture', () => {
    const { ctx, interaction, animation, frames, log, restyles } = settled();
    const { calc } = ctx;
    interaction.handlePointer(event('down', at(calc.x[0]!, calc.y[0]!)));
    interaction.handlePointer(event('move', at(calc.x[0]! - 40, calc.y[0]!)));
    while (frames(1000) > 0);
    expect(animation.running).toBe(false);
    expect(log.at(-1)).toBe('rest: kept');
    expect(interaction.moving).toBe(true);
    expect(restyles).toEqual([]);
    // The next move starts it again, from where it was.
    interaction.handlePointer(event('move', at(calc.x[0]! - 50, calc.y[0]!)));
    expect(animation.running).toBe(true);
    expect(animation.simulation!.x[0]).toBe(calc.x[0]! - 50);
  });

  it('a cancelled drag lets the node go again', () => {
    const { ctx, interaction, animation, frames, restyles } = settled();
    const { calc } = ctx;
    interaction.handlePointer(event('down', at(calc.x[0]!, calc.y[0]!)));
    interaction.handlePointer(event('move', at(calc.x[0]! - 40, calc.y[0]!)));
    frames(5);
    const sim = animation.simulation!;
    interaction.handlePointer(event('leave', [0, 0]));
    expect(interaction.moving).toBe(false);
    frames(30);
    // Free again: the springs pull it back towards its neighbours.
    expect(sim.x[0]).toBeGreaterThan(calc.x[0]! - 40);
    expect(restyles).toEqual([]);
  });

  it('a double click releases a pinned node on screen', () => {
    const cold = context(SIMULATE);
    const x = Array.from(cold.calc.x, (v) => Math.round(v * 100) / 100);
    const y = Array.from(cold.calc.y, (v) => Math.round(v * 100) / 100);
    const ctx = context({
      ...SIMULATE,
      node: {
        x: [x[0]! - 60, null, null, null, null, null],
        y: [y[0], null, null, null, null, null],
      },
      force: { simulate: true, start: { x: [x[0]! - 60, ...x.slice(1)], y, alpha: 0 } },
    });
    const { interaction, animation, frames, restyles } = setup(ctx);
    // At rest from the start: nothing to animate.
    frames(5);
    expect(animation.running).toBe(false);
    expect(interaction.handlePointer(event('dblclick', at(x[0]! - 60, y[0]!)))).toBe(true);
    expect(animation.running).toBe(true);
    const sim = animation.simulation!;
    expect(sim.alpha).toBeCloseTo(0.3, 6);
    // The figure: the pin unset, the picture as it is (the simulation shows the rest).
    expect(restyles[0]!.update).toMatchObject({
      'node.x': [[null, null, null, null, null, null]],
      'force.start.alpha': [0],
    });
    frames(40);
    // No longer held: it moves back towards its neighbours.
    expect(sim.x[0]).toBeGreaterThan(x[0]! - 60);
  });

  it('without motion a drag is the one of a layout at rest', () => {
    const ctx = context(SIMULATE);
    const { interaction, animation, restyles } = setup(ctx, { motion: false });
    expect(animation.running).toBe(false);
    interaction.handlePointer(event('down', at(ctx.calc.x[0]!, ctx.calc.y[0]!)));
    interaction.handlePointer(event('move', at(ctx.calc.x[0]! - 40, ctx.calc.y[0]!)));
    expect(animation.running).toBe(false);
    interaction.handlePointer(event('up', at(ctx.calc.x[0]! - 40, ctx.calc.y[0]!)));
    expect(restyles).toHaveLength(1);
    expect((restyles[0]!.update as Record<string, unknown[]>)['force.start.alpha']).toEqual([0]);
  });
});
