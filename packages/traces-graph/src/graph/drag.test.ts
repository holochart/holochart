import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type ComponentPointerEvent,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { forceLayout } from '../layout/force/index.ts';
import type { GraphCalc } from './calc.ts';
import {
  axisSnap,
  axisValue,
  DRAG_TOLERANCE,
  dragKind,
  GraphDrag,
  pinnedNodes,
  positionUpdate,
  roundUnit,
  startUpdate,
  TOUCH_TOLERANCE,
  type GraphDragHost,
} from './drag.ts';
import { graph } from './index.ts';
import { forceRunOf, forceStartOf, REHEAT_ALPHA, warmForceLayout, warmForceRun } from './warm.ts';

const registry = createChartRegistry().register(graph);

function build(input: Record<string, unknown>): { trace: FullTrace; calc: GraphCalc } {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'graph', ...input }], layout: { template: 'none' } },
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
  return { trace, calc: graph.calc!(trace, ctx) };
}

/** Two triangles joined by a link. */
const LINKS = { source: [0, 1, 2, 3, 4, 5, 2], target: [1, 2, 0, 4, 5, 3, 3] };

function event(
  type: ComponentPointerEvent['type'],
  x: number,
  y: number,
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

/**
 * A host with one node at container (100, 100), drawn 10 px wide, in a plot where a px is a
 * linear unit: it logs what the gesture asks for.
 */
function host(options: { pinned?: boolean } = {}) {
  const log: string[] = [];
  const node = { x: 100, y: 100 };
  const h: GraphDragHost = {
    pick: (e) => (Math.hypot(e.x - node.x, e.y - node.y) <= 5 ? 7 : -1),
    locate: (e) => [e.x, e.y],
    position: () => [node.x, node.y],
    begin: (i) => log.push(`begin ${i}`),
    move: (i, x, y) => log.push(`move ${i} ${x} ${y}`),
    drop: (i, x, y) => {
      node.x = x;
      node.y = y;
      log.push(`drop ${i} ${x} ${y}`);
    },
    cancel: (i) => log.push(`cancel ${i}`),
    pinned: () => options.pinned === true,
    release: (i) => log.push(`release ${i}`),
  };
  return { host: h, log, drag: new GraphDrag(h) };
}

describe('the drag gesture', () => {
  it('press, move past the tolerance, release: the node is dropped where the pointer took it', () => {
    const { drag, log } = host();
    // Pressed 2 px off the node's center: the node keeps that offset, it does not jump.
    expect(drag.handle(event('down', 102, 99))).toBe(true);
    expect(drag.active).toBe(true);
    expect(drag.dragging).toBe(false);
    expect(drag.node).toBe(7);
    expect(drag.handle(event('move', 104, 100))).toBe(true);
    expect(log).toEqual([]);
    const move = event('move', 132, 109);
    expect(drag.handle(move)).toBe(true);
    expect(move.cursor).toBe('grabbing');
    expect(drag.dragging).toBe(true);
    expect(log).toEqual(['begin 7', 'move 7 130 110']);
    expect(drag.handle(event('move', 152, 119))).toBe(true);
    expect(drag.handle(event('up', 162, 129))).toBe(true);
    expect(log).toEqual(['begin 7', 'move 7 130 110', 'move 7 150 120', 'drop 7 160 130']);
    expect(drag.active).toBe(false);
    expect(drag.node).toBe(-1);
  });

  it('the release of a drag is not a click', () => {
    const { drag } = host();
    drag.handle(event('down', 100, 100));
    drag.handle(event('move', 120, 100));
    drag.handle(event('up', 120, 100));
    // The runtime's click after the release, if its own tolerance let one through: taken.
    expect(drag.handle(event('click', 120, 100))).toBe(true);
    // Once: the next click is a click.
    expect(drag.handle(event('click', 120, 100))).toBe(false);
  });

  it('a press that does not move is a click, left to the chart', () => {
    const { drag, log } = host();
    expect(drag.handle(event('down', 100, 100))).toBe(true);
    expect(drag.handle(event('move', 100 + DRAG_TOLERANCE, 100))).toBe(true);
    expect(drag.handle(event('up', 100 + DRAG_TOLERANCE, 100))).toBe(true);
    expect(log).toEqual([]);
    expect(drag.active).toBe(false);
    expect(drag.handle(event('click', 100, 100))).toBe(false);
  });

  it('a finger may wobble more than a mouse', () => {
    const touch = { native: { pointerType: 'touch' } as unknown as Event };
    const { drag, log } = host();
    drag.handle(event('down', 100, 100, touch));
    drag.handle(event('move', 100 + TOUCH_TOLERANCE, 100, touch));
    expect(log).toEqual([]);
    drag.handle(event('move', 101 + TOUCH_TOLERANCE, 100, touch));
    expect(log).toEqual(['begin 7', `move 7 ${101 + TOUCH_TOLERANCE} 100`]);
  });

  it('leaves alone a press on empty space, a press with another button, and plain moves', () => {
    const { drag, log } = host();
    expect(drag.handle(event('down', 300, 300))).toBe(false);
    expect(drag.active).toBe(false);
    expect(drag.handle(event('down', 100, 100, { button: 2 }))).toBe(false);
    expect(drag.handle(event('move', 100, 100))).toBe(false);
    expect(drag.handle(event('wheel', 100, 100))).toBe(false);
    expect(drag.handle(event('leave', 100, 100))).toBe(false);
    expect(log).toEqual([]);
  });

  it('a cancelled gesture puts the node back, and one that had not moved does nothing', () => {
    const moved = host();
    moved.drag.handle(event('down', 100, 100));
    moved.drag.handle(event('move', 140, 100));
    expect(moved.drag.handle(event('leave', 140, 100))).toBe(true);
    expect(moved.log).toEqual(['begin 7', 'move 7 140 100', 'cancel 7']);
    expect(moved.drag.active).toBe(false);
    const still = host();
    still.drag.handle(event('down', 100, 100));
    expect(still.drag.handle(event('leave', 100, 100))).toBe(true);
    expect(still.log).toEqual([]);
  });

  it('a double click releases a pinned node, and is left alone on any other', () => {
    const pinned = host({ pinned: true });
    expect(pinned.drag.handle(event('dblclick', 100, 100))).toBe(true);
    expect(pinned.log).toEqual(['release 7']);
    expect(pinned.drag.handle(event('dblclick', 300, 300))).toBe(false);
    const free = host();
    expect(free.drag.handle(event('dblclick', 100, 100))).toBe(false);
    expect(free.log).toEqual([]);
  });

  it('can be reset under a gesture', () => {
    const { drag, log } = host();
    drag.handle(event('down', 100, 100));
    drag.handle(event('move', 140, 100));
    drag.reset();
    expect(drag.active).toBe(false);
    // What follows is no longer the gesture's.
    expect(drag.handle(event('move', 150, 100))).toBe(false);
    expect(drag.handle(event('up', 150, 100))).toBe(false);
    expect(log).toEqual(['begin 7', 'move 7 140 100']);
  });
});

describe('which nodes drag', () => {
  it('those at given positions and those of a force layout, by default', () => {
    const preset = build({
      node: { x: [0, 1, 2], y: [0, 1, 0] },
      link: { source: [0], target: [1] },
    });
    expect(preset.trace['arrangement']).toBe('preset');
    expect(dragKind(preset.trace, preset.calc)).toBe('preset');
    const force = build({ link: LINKS });
    expect(dragKind(force.trace, force.calc)).toBe('force');
    const off = build({ link: LINKS, node: { draggable: false } });
    expect(dragKind(off.trace, off.calc)).toBe('none');
  });

  it('not those of a timeline, nor of a layout that places every node itself', () => {
    const timeline = build({
      arrangement: 'force',
      node: { x: [1, 2, 3, 4, 5, 6] },
      link: LINKS,
    });
    expect(timeline.calc.real).toBeDefined();
    expect((timeline.trace['node'] as Record<string, unknown>)['draggable']).toBe(false);
    expect(dragKind(timeline.trace, timeline.calc)).toBe('none');
    // Even when asked for.
    const asked = build({
      arrangement: 'force',
      node: { x: [1, 2, 3, 4, 5, 6], draggable: true },
      link: LINKS,
    });
    expect(dragKind(asked.trace, asked.calc)).toBe('none');
    for (const arrangement of ['layered', 'tree', 'radial', 'circular', 'grid', 'arc', 'hive']) {
      const built = build({ arrangement, link: LINKS, node: { draggable: true } });
      expect(dragKind(built.trace, built.calc), arrangement).toBe('none');
      expect((built.trace['node'] as Record<string, unknown>)['draggable']).toBeUndefined();
    }
  });

  it('pinned nodes are those of a force layout with both positions given', () => {
    const none = build({ link: LINKS });
    expect(pinnedNodes(none.trace, none.calc)).toBeUndefined();
    const some = build({
      arrangement: 'force',
      node: { x: [null, 40, null, 10, null, null], y: [null, -20, 5, null, null, null] },
      link: LINKS,
    });
    expect(Array.from(pinnedNodes(some.trace, some.calc)!)).toEqual([0, 1, 0, 0, 0, 0]);
    // Without dragging there is nothing to release, so nothing is marked.
    const off = build({
      arrangement: 'force',
      node: { x: [null, 40], y: [null, -20], draggable: false },
      link: LINKS,
    });
    expect(pinnedNodes(off.trace, off.calc)).toBeUndefined();
  });

  it('a force layout stays one when its position arrays are as long as its nodes', () => {
    // What a drop writes: an entry per node, all but the pinned one empty.
    const { trace, calc } = build({
      node: { x: [null, null, null, null, null, 12.5], y: [null, null, null, null, null, -3] },
      link: LINKS,
    });
    expect(trace['arrangement']).toBe('force');
    expect(calc.x[5]).toBe(12.5);
    expect(calc.y[5]).toBe(-3);
    expect(calc.hidden.includes(1)).toBe(false);
  });
});

describe('what a release writes', () => {
  it('positions that are data, in the units of each axis', () => {
    const axis = (type: string, options: Record<string, unknown> = {}) =>
      ({ type, scale: createScale({ type, ...options } as never) }) as never;
    expect(axisValue(undefined, 1.5)).toBe(1.5);
    expect(axisValue(axis('linear'), 1.5)).toBe(1.5);
    expect(axisValue(axis('log'), 2)).toBeCloseTo(100, 9);
    expect(axisValue(axis('date'), Date.UTC(2024, 2, 1, 12))).toBe('2024-03-01 12:00');
    const category = axis('category', { categories: ['low', 'mid', 'high'] });
    expect(axisValue(category, 1.2)).toBe('mid');
    expect(axisSnap(category, 1.6, 0)).toBe(2);
    expect(axisSnap(category, 7, 0)).toBe(2);
    expect(axisSnap(category, -3, 1)).toBe(0);
    expect(axisSnap(axis('linear'), 1.6, 0)).toBe(1.6);
    // Along a multicategory axis a node stays where it is, and its entry is left alone.
    const multi = axis('multicategory');
    expect(axisSnap(multi, 4.2, 1)).toBe(1);
    expect(axisValue(multi, 1)).toBeUndefined();
  });

  it('`node.x` / `node.y` with the entries of the node replaced and the others as they were', () => {
    const trace = { node: { x: ['2024-01-01', '2024-02-01', '2024-03-01'], y: [1, 2, 3] } };
    expect(positionUpdate(trace, 3, 1, '2024-02-15', 2.5)).toEqual({
      'node.x': [['2024-01-01', '2024-02-15', '2024-03-01']],
      'node.y': [[1, 2.5, 3]],
    });
    // The trace's arrays are not touched.
    expect(trace.node.x[1]).toBe('2024-02-01');
    // An entry that is left alone (`undefined`) keeps its value.
    expect(positionUpdate(trace, 3, 1, undefined, 9)).toEqual({
      'node.x': [['2024-01-01', '2024-02-01', '2024-03-01']],
      'node.y': [[1, 9, 3]],
    });
  });

  it('for a pin: the node, the others unset, and the picture as `force.start`', () => {
    const start = {
      x: Float64Array.of(1.004, 2.006, 3),
      y: Float64Array.of(0, -1.999, 4),
      alpha: 0,
    };
    expect(positionUpdate({ node: {} }, 3, 2, 3, 4, start)).toEqual({
      'node.x': [[null, null, 3]],
      'node.y': [[null, null, 4]],
      'force.start.x': [[1, 2.01, 3]],
      'force.start.y': [[0, -2, 4]],
      'force.start.alpha': [0],
    });
    // A pin that was there stays; typed arrays and holes read as plain entries.
    const pinned = { node: { x: Float64Array.of(NaN, 7, NaN), y: [undefined, 8] } };
    expect(positionUpdate(pinned, 3, 0, 1, 2)).toEqual({
      'node.x': [[1, 7, null]],
      'node.y': [[2, 8, null]],
    });
    // Releasing: the two entries are unset.
    expect(positionUpdate(pinned, 3, 1, null, null)).toEqual({
      'node.x': [[null, null, null]],
      'node.y': [[null, null, null]],
    });
    // Every node of the trace gets an entry: a trace counts its nodes by these arrays.
    expect(positionUpdate({ node: {} }, 4, 1, 5, 6)).toEqual({
      'node.x': [[null, 5, null, null]],
      'node.y': [[null, 6, null, null]],
    });
    expect(startUpdate({ x: [1.23456], y: [2], alpha: REHEAT_ALPHA })).toEqual({
      'force.start.x': [[1.23]],
      'force.start.y': [[2]],
      'force.start.alpha': [0.3],
    });
    expect(roundUnit(-0.005)).toBe(-0);
    expect(roundUnit(NaN)).toBeNaN();
  });
});

describe('a force layout that goes on from a picture', () => {
  it('reads `force.start`', () => {
    expect(forceStartOf({}, 3)).toBeUndefined();
    expect(forceStartOf({ force: { start: { x: [1, 2] } } }, 3)).toBeUndefined();
    expect(forceStartOf({ force: { start: { x: [], y: [] } } }, 3)).toBeUndefined();
    const start = forceStartOf(
      { force: { start: { x: [1, null, 3, 4], y: [5, 6], alpha: 0 } } },
      3,
    )!;
    expect(Array.from(start.x)).toEqual([1, NaN, 3]);
    expect(Array.from(start.y)).toEqual([5, 6, NaN]);
    expect(start.alpha).toBe(0);
    // Without an `alpha`, or with one out of range: a full run.
    expect(forceStartOf({ force: { start: { x: [1], y: [2] } } }, 1)!.alpha).toBe(1);
    expect(forceStartOf({ force: { start: { x: [1], y: [2], alpha: 7 } } }, 1)!.alpha).toBe(1);
  });

  it('at rest is the picture itself, with the pinned nodes where the figure says', () => {
    const cold = build({ arrangement: 'force', link: LINKS });
    const x = Array.from(cold.calc.x, roundUnit);
    const y = Array.from(cold.calc.y, roundUnit);
    const same = build({ arrangement: 'force', link: LINKS, force: { start: { x, y, alpha: 0 } } });
    expect(Array.from(same.calc.x)).toEqual(x);
    expect(Array.from(same.calc.y)).toEqual(y);
    expect(same.calc.layoutKey).not.toBe(cold.calc.layoutKey);
    expect(same.calc.force!.start).toMatchObject({ alpha: 0 });
    // One node dragged 40 units away and dropped: only that node is elsewhere.
    const pin = build({
      arrangement: 'force',
      link: LINKS,
      node: {
        x: [null, null, x[2]! + 40, null, null, null],
        y: [null, null, y[2]! - 10, null, null, null],
      },
      force: { start: { x, y, alpha: 0 } },
    });
    expect(pin.trace['arrangement']).toBe('force');
    for (let i = 0; i < 6; i++) {
      expect(pin.calc.x[i]).toBe(i === 2 ? x[2]! + 40 : x[i]);
      expect(pin.calc.y[i]).toBe(i === 2 ? y[2]! - 10 : y[i]);
    }
    expect(Array.from(pinnedNodes(pin.trace, pin.calc)!)).toEqual([0, 0, 1, 0, 0, 0]);
  });

  it('warm, goes on from the picture: the released node moves most, nothing starts over', () => {
    const cold = build({ arrangement: 'force', link: LINKS });
    const x = Array.from(cold.calc.x, roundUnit);
    const y = Array.from(cold.calc.y, roundUnit);
    // Node 0 was dropped 80 units away; now it is released.
    x[0] = x[0]! + 80;
    const warm = build({
      arrangement: 'force',
      link: LINKS,
      force: { start: { x, y, alpha: REHEAT_ALPHA } },
    });
    const moved = (i: number): number =>
      Math.hypot(warm.calc.x[i]! - x[i]!, warm.calc.y[i]! - y[i]!);
    // It came most of the way back to its two neighbours.
    expect(moved(0)).toBeGreaterThan(30);
    for (let i = 1; i < 6; i++) expect(moved(i)).toBeLessThan(moved(0));
    // The far end of the other triangle moved far less.
    for (const i of [4, 5]) expect(moved(i)).toBeLessThan(moved(0) / 2);
  });

  it('is not centered afterwards, and is centered on the picture while it runs', () => {
    const { calc } = build({ arrangement: 'force', link: LINKS });
    const { graph: g, options } = calc.force!;
    // The picture, moved 500 units to the right.
    const start = { x: calc.x.map((v) => v + 500), y: Float64Array.from(calc.y), alpha: 0.2 };
    const result = warmForceLayout(g, options, start);
    const mean = (values: Float64Array): number =>
      values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean(result.x)).toBeGreaterThan(480);
    expect(mean(result.x)).toBeLessThan(520);
    // A cold layout of the same graph is centered on the origin.
    expect(Math.abs(mean(forceLayout(g, options).x))).toBeLessThan(20);
  });

  it('cools from its alpha: at 0 no tick runs, warmer runs are longer, none longer than a full one', () => {
    const { calc } = build({ arrangement: 'force', link: LINKS });
    const { graph: g, options } = calc.force!;
    const ticks = (alpha: number): number => {
      const run = warmForceRun(g, options, { x: calc.x, y: calc.y, alpha });
      expect(run.simulation.alpha).toBe(alpha);
      let count = 0;
      while (run.simulation.tick(1)) count++;
      return count;
    };
    expect(ticks(0)).toBe(0);
    const warm = ticks(REHEAT_ALPHA);
    expect(warm).toBeGreaterThan(0);
    expect(warm).toBeLessThan(options.ticks);
    expect(ticks(1)).toBeGreaterThan(warm);
    expect(ticks(1)).toBeLessThanOrEqual(options.ticks);
  });

  it('`forceRunOf` starts from the spiral without a start', () => {
    const { calc } = build({ arrangement: 'force', link: LINKS });
    const { graph: g, options } = calc.force!;
    const run = forceRunOf(g, options, undefined);
    run.simulation.tick(run.ticks);
    const done = run.finish();
    expect(Array.from(done.x)).toEqual(Array.from(calc.x));
    const warm = forceRunOf(g, options, { x: calc.x, y: calc.y, alpha: 0 });
    const x = new Float64Array(6);
    const y = new Float64Array(6);
    warm.frame(x, y);
    expect(Array.from(x)).toEqual(Array.from(calc.x));
    expect(warm.simulation.tick()).toBe(false);
  });

  it('a start is not read for another arrangement', () => {
    const { trace, calc } = build({
      arrangement: 'circular',
      link: LINKS,
      force: { start: { x: [0, 0, 0, 0, 0, 0], y: [0, 0, 0, 0, 0, 0], alpha: 0 } },
    });
    expect(trace['force']).toBeUndefined();
    expect(calc.force).toBeUndefined();
    expect(new Set(Array.from(calc.x)).size).toBeGreaterThan(1);
  });
});
