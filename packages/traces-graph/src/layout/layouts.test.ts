import { afterEach, describe, expect, it, vi } from 'vitest';
import { circularLayout } from './circular.ts';
import { gridLayout } from './grid.ts';
import { GRAPH_ARRANGEMENTS, registerGraphLayout, resolveGraphLayout } from './index.ts';
import { degrees, maxExtent, nodeOrder } from './order.ts';
import { presetLayout } from './preset.ts';
import type { GraphLayout, LayoutGraph } from './types.ts';

/** A graph of `n` nodes of radius `r`, with the given links. */
function graphOf(
  n: number,
  links: readonly (readonly [number, number])[] = [],
  extra: Partial<LayoutGraph> = {},
  r = 5,
): LayoutGraph {
  return {
    nodes: n,
    source: Int32Array.from(links, (l) => l[0]),
    target: Int32Array.from(links, (l) => l[1]),
    weight: new Float64Array(links.length).fill(1),
    halfWidth: new Float64Array(n).fill(r),
    halfHeight: new Float64Array(n).fill(r),
    x: new Float64Array(n).fill(NaN),
    y: new Float64Array(n).fill(NaN),
    ...extra,
  };
}

describe('node order of the simple layouts', () => {
  it('counts link ends, a self-link twice', () => {
    expect(
      Array.from(
        degrees(
          graphOf(3, [
            [0, 1],
            [1, 2],
            [2, 2],
          ]),
        ),
      ),
    ).toEqual([1, 2, 3]);
  });

  it('keeps index order without groups, and groups together with them', () => {
    expect(Array.from(nodeOrder(graphOf(4)))).toEqual([0, 1, 2, 3]);
    const grouped = graphOf(5, [], { group: Int32Array.of(1, 0, -1, 1, 0), groups: 2 });
    // Group 0, then group 1, then the node without a group; index order inside each.
    expect(Array.from(nodeOrder(grouped))).toEqual([1, 4, 0, 3, 2]);
    expect(Array.from(nodeOrder(grouped, 'index'))).toEqual([0, 1, 2, 3, 4]);
  });

  it('sorts by degree, ties by index', () => {
    const g = graphOf(4, [
      [0, 3],
      [1, 3],
      [2, 3],
      [0, 1],
    ]);
    expect(Array.from(nodeOrder(g, 'degree'))).toEqual([3, 0, 1, 2]);
  });

  it('measures the largest node', () => {
    expect(maxExtent(graphOf(0))).toBe(0);
    const g = graphOf(2, [], {
      halfWidth: Float64Array.of(4, 10),
      halfHeight: Float64Array.of(12, 3),
    });
    expect(maxExtent(g)).toBe(24);
  });
});

describe('preset layout', () => {
  it('returns the given positions and hides nodes without one', () => {
    const g = graphOf(3, [], { x: Float64Array.of(1, NaN, 3), y: Float64Array.of(4, 5, NaN) });
    const out = presetLayout(g, undefined);
    expect(Array.from(out.x)).toEqual([1, 0, 0]);
    expect(Array.from(out.y)).toEqual([4, 0, 0]);
    expect(Array.from(out.hidden!)).toEqual([0, 1, 1]);
  });

  it('has no hidden mask when every node is placed', () => {
    const g = graphOf(2, [], { x: Float64Array.of(1, 2), y: Float64Array.of(3, 4) });
    expect(presetLayout(g, undefined).hidden).toBeUndefined();
  });
});

describe('circular layout', () => {
  it('puts nodes evenly on a circle, from the top, clockwise', () => {
    const out = circularLayout(graphOf(4), { radius: 100 });
    // `+ 0` turns a rounded -0 into 0.
    const at = (i: number) => [Math.round(out.x[i]!) + 0, Math.round(out.y[i]!) + 0];
    expect(at(0)).toEqual([0, 100]);
    expect(at(1)).toEqual([100, 0]);
    expect(at(2)).toEqual([0, -100]);
    expect(at(3)).toEqual([-100, 0]);
  });

  it('turns the other way and starts elsewhere when asked', () => {
    const out = circularLayout(graphOf(4), {
      radius: 10,
      startAngle: 0,
      direction: 'counterclockwise',
    });
    expect([Math.round(out.x[0]!), Math.round(out.y[0]!)]).toEqual([10, 0]);
    expect([Math.round(out.x[1]!), Math.round(out.y[1]!)]).toEqual([0, 10]);
  });

  it('sizes the circle so that neighbours are `spacing` apart', () => {
    // 10 nodes 10 wide with 20 between them: a circumference of 300.
    const out = circularLayout(graphOf(10), { spacing: 20 });
    expect(Math.hypot(out.x[0]!, out.y[0]!)).toBeCloseTo(300 / (2 * Math.PI), 6);
    // Two nodes sit a diameter apart: one node and one gap.
    const two = circularLayout(graphOf(2), { spacing: 20 });
    expect(Math.hypot(two.x[0]! - two.x[1]!, two.y[0]! - two.y[1]!)).toBeCloseTo(30, 6);
  });

  it('keeps the nodes of a group next to each other', () => {
    const g = graphOf(4, [], { group: Int32Array.of(0, 1, 0, 1), groups: 2 });
    const out = circularLayout(g, { radius: 10 });
    const angle = (i: number) => Math.round((Math.atan2(out.y[i]!, out.x[i]!) * 180) / Math.PI);
    // Clockwise from the top: 0 and 2 (group 0), then 1 and 3.
    expect([0, 2, 1].map(angle)).toEqual([90, 0, -90]);
    expect(Math.abs(angle(3))).toBe(180);
  });

  it('centers one node, and is finite for an empty graph and bad options', () => {
    const one = circularLayout(graphOf(1), undefined);
    expect([one.x[0], one.y[0]]).toEqual([0, 0]);
    expect(circularLayout(graphOf(0), undefined).x).toHaveLength(0);
    const bad = circularLayout(graphOf(3), { radius: NaN, spacing: -4 });
    expect(Array.from(bad.x).every(Number.isFinite)).toBe(true);
  });
});

describe('grid layout', () => {
  it('fills rows left to right, top to bottom, centered on the origin', () => {
    const out = gridLayout(graphOf(5), { spacing: 10 });
    // 3 columns, 2 rows, 20 apart (a node of 10 and a gap of 10).
    expect(Array.from(out.x)).toEqual([-20, 0, 20, -20, 0]);
    expect(Array.from(out.y)).toEqual([10, 10, 10, -10, -10]);
  });

  it('takes a column count and a sort order', () => {
    const g = graphOf(4, [
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
    const out = gridLayout(g, { columns: 4, sort: 'degree', spacing: 0 });
    expect(Array.from(out.y)).toEqual([0, 0, 0, 0]);
    // Node 3 has the most links: first in the row.
    expect(out.x[3]).toBe(-15);
    expect(out.x[0]).toBe(-5);
    // More columns than nodes is one row of all of them.
    const wide = gridLayout(graphOf(2), { columns: 9 });
    expect(wide.y[0]).toBe(wide.y[1]);
  });

  it('handles the empty graph and the defaults', () => {
    expect(gridLayout(graphOf(0), undefined).x).toHaveLength(0);
    const out = gridLayout(graphOf(4), undefined);
    expect(out.x[1]! - out.x[0]!).toBe(34);
  });
});

describe('the layout table', () => {
  afterEach(() => vi.restoreAllMocks());

  it('finds the built-in layouts', () => {
    expect(resolveGraphLayout('preset')).toMatchObject({ layout: presetLayout, fallback: false });
    expect(resolveGraphLayout('circular').layout).toBe(circularLayout);
    expect(resolveGraphLayout('grid')).toMatchObject({ arrangement: 'grid', fallback: false });
    expect(GRAPH_ARRANGEMENTS).toContain('custom');
  });

  it('runs a registered layout for custom, until it is removed', () => {
    const layout: GraphLayout<{ at: number }> = (g, o) => ({
      x: new Float64Array(g.nodes).fill(o.at),
      y: new Float64Array(g.nodes),
    });
    const remove = registerGraphLayout('test-line', layout);
    const found = resolveGraphLayout('custom', 'test-line');
    expect(found).toMatchObject({ arrangement: 'custom', fallback: false });
    expect(Array.from(found.layout(graphOf(2), { at: 7 }).x)).toEqual([7, 7]);
    // Registering the name again replaces it, and the first remover then removes nothing.
    const other: GraphLayout = (g) => ({
      x: new Float64Array(g.nodes),
      y: new Float64Array(g.nodes),
    });
    const removeOther = registerGraphLayout('test-line', other);
    remove();
    expect(resolveGraphLayout('custom', 'test-line').layout).toBe(other);
    removeOther();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveGraphLayout('custom', 'test-line').fallback).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back to circular for a missing layout, warning once per name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = resolveGraphLayout('custom', 'test-nobody');
    expect(missing).toMatchObject({
      layout: circularLayout,
      arrangement: 'circular',
      fallback: true,
    });
    resolveGraphLayout('custom', 'test-nobody');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("no layout is registered as 'test-nobody'");
    expect(resolveGraphLayout('custom').fallback).toBe(true);
    expect(warn.mock.calls[1]![0]).toContain('custom.name');
  });
});
