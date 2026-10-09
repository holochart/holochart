import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { GraphLayout, LayoutGraph } from '../types.ts';
import type { TreeLayoutResult } from './common.ts';
import { dendrogramLayout, type DendrogramOptions } from './dendrogram.ts';
import { radialTreeLayout, type RadialTreeOptions } from './radial.ts';
import {
  arbitraryForest,
  arbitraryTree,
  linkGraph,
  mirrorParents,
  scrambledTree,
  treeGraph,
} from './testing.ts';
import { tidyTreeLayout, type TidyTreeOptions } from './tidy.ts';

const list = (a: ArrayLike<number>): number[] => Array.from(a);
const EPS = 1e-9;

/** Points one unit apart, so positions read as slots. */
const UNIT: TidyTreeOptions = { nodesep: 1, ranksep: 1 };

/** x of every node, shifted so the leftmost is at 0 (the layout centres its drawing). */
function slots(result: TreeLayoutResult): number[] {
  const min = Math.min(...result.x);
  return list(result.x).map((v) => Math.round((v - min) * 1e9) / 1e9);
}

/** Children of every node, in input order. */
function childrenOf(parent: readonly number[]): number[][] {
  const out: number[][] = parent.map(() => []);
  parent.forEach((p, i) => p >= 0 && out[p]!.push(i));
  return out;
}

/**
 * The checks every top-down tidy tree passes: levels in rows, neighbours clear of each other in
 * tree order, parents centred, levels clear of each other.
 */
function expectTidy(graph: LayoutGraph, result: TreeLayoutResult, options: TidyTreeOptions): void {
  const nodesep = options.nodesep ?? 20;
  const subtreesep = options.subtreesep ?? nodesep;
  const ranksep = options.ranksep ?? 50;
  const { x, y, parent, depth, hidden } = result;
  for (let i = 0; i < graph.nodes; i++) {
    expect(Number.isFinite(x[i])).toBe(true);
    expect(Number.isFinite(y[i])).toBe(true);
  }
  // Visible nodes by depth, each level in the order of the tree (a preorder walk).
  const kids = childrenOf(list(parent));
  const levels: number[][] = [];
  const stack = list(parent)
    .flatMap((p, i) => (p < 0 ? [i] : []))
    .reverse();
  while (stack.length > 0) {
    const v = stack.pop()!;
    if (hidden[v]) continue;
    (levels[depth[v]!] ??= []).push(v);
    for (let c = kids[v]!.length - 1; c >= 0; c--) stack.push(kids[v]![c]!);
  }

  let floor = Infinity;
  for (const level of levels) {
    let top = -Infinity;
    let bottom = Infinity;
    level.forEach((v, k) => {
      // One row per level.
      expect(y[v]).toBeCloseTo(y[level[0]!]!, 9);
      top = Math.max(top, y[v]! + graph.halfHeight[v]!);
      bottom = Math.min(bottom, y[v]! - graph.halfHeight[v]!);
      if (k === 0) return;
      // The next node of the level in tree order is to the right, clear of this one: subtrees do
      // not interleave and nodes do not overlap.
      const u = level[k - 1]!;
      const sep = parent[u]! >= 0 && parent[u] === parent[v] ? nodesep : subtreesep;
      const room = graph.halfWidth[u]! + graph.halfWidth[v]! + sep;
      expect(x[v]! - x[u]!).toBeGreaterThanOrEqual(room - EPS);
    });
    // Below the level above by at least `ranksep`, edge to edge.
    expect(floor - top).toBeGreaterThanOrEqual(ranksep - EPS);
    floor = bottom;
  }
  // A parent is centred over its first and last visible child.
  for (let p = 0; p < graph.nodes; p++) {
    const visible = kids[p]!.filter((c) => !hidden[c]);
    if (hidden[p] || visible.length === 0) continue;
    const xs = visible.map((c) => x[c]!);
    expect(x[p]).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2, 9);
    expect(depth[visible[0]!]).toBe(depth[p]! + 1);
  }
}

describe('tidy tree: textbook drawings', () => {
  it('draws a complete binary tree on four slots', () => {
    const r = tidyTreeLayout(treeGraph([-1, 0, 0, 1, 1, 2, 2]), UNIT);
    expect(slots(r)).toEqual([1.5, 0.5, 2.5, 0, 1, 2, 3]);
    expect(list(r.y)).toEqual([1, 0, 0, -1, -1, -1, -1]);
  });

  it('tucks a shallow subtree in beside a deep one', () => {
    //        0
    //    1       2
    //    3     7 8 9      ← 3 has room next to 7
    //  4 5 6
    // Six leaves in a row would be five slots wide; Reingold–Tilford needs four.
    const r = tidyTreeLayout(treeGraph([-1, 0, 0, 1, 3, 3, 3, 2, 2, 2]), UNIT);
    expect(slots(r)).toEqual([2, 1, 3, 1, 0, 1, 2, 2, 3, 4]);
  });

  it('follows the outline of the left subtrees through several levels', () => {
    //          0
    //     1    2    3
    //    4 5       6 7
    //    8           9      ← 3's subtree clears 1's at every level
    const parents = [-1, 0, 0, 0, 1, 1, 3, 3, 4, 7];
    const r = tidyTreeLayout(treeGraph(parents), UNIT);
    expect(slots(r)).toEqual([1.5, 0.5, 1.5, 2.5, 0, 1, 2, 3, 0, 3]);
  });

  it('spreads small subtrees evenly between two large ones', () => {
    // 1 and 4 are deep and wide at the bottom; 2 and 3 are leaves between them.
    //            0
    //    1    2    3    4
    //    5              6
    //  7 8 9 10    11 12 13 14
    const parents = [-1, 0, 0, 0, 0, 1, 4, 5, 5, 5, 5, 6, 6, 6, 6];
    const s = slots(tidyTreeLayout(treeGraph(parents), UNIT));
    // The bottom row is packed: eight leaves, seven gaps.
    expect([7, 8, 9, 10, 11, 12, 13, 14].map((i) => s[i])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([s[1], s[4]]).toEqual([1.5, 5.5]);
    // The two leaves share the room between the large subtrees instead of sitting on the left.
    expect(s[2]).toBeCloseTo(1.5 + 4 / 3, 9);
    expect(s[3]).toBeCloseTo(1.5 + 8 / 3, 9);
    expect(s[0]).toBe(3.5);
  });

  it('draws a subtree the same wherever it is', () => {
    // Nodes 1 and 2 carry the same subtree; 3 is a wider one that pushes things around.
    const parents = [-1, 0, 0, 0, 1, 1, 4, 2, 2, 7, 3, 3, 3, 3];
    const r = tidyTreeLayout(treeGraph(parents), UNIT);
    const shape = (root: number, nodes: number[]): number[] =>
      nodes.map((i) => r.x[i]! - r.x[root]!);
    expect(shape(1, [4, 5, 6])).toEqual(shape(2, [7, 8, 9]));
  });
});

describe('tidy tree: node sizes', () => {
  it('separates siblings and subtrees by their real widths', () => {
    // A wide root over a narrow and a wide child.
    const graph = treeGraph([-1, 0, 0], { halfWidth: [50, 5, 30], halfHeight: [10, 4, 8] });
    const r = tidyTreeLayout(graph, { nodesep: 10, ranksep: 40 });
    expect(r.x[2]! - r.x[1]!).toBeCloseTo(5 + 30 + 10, 9);
    // Levels: the root's row is 20 high, the children's row as high as its tallest node, 16.
    expect(r.y[0]! - r.y[1]!).toBeCloseTo(10 + 40 + 8, 9);
    expect(r.y[1]).toBe(r.y[2]);
    expectTidy(graph, r, { nodesep: 10, ranksep: 40 });
  });

  it('keeps subtrees further apart than siblings with `subtreesep`', () => {
    const parents = [-1, 0, 0, 1, 1, 2, 2];
    const r = tidyTreeLayout(treeGraph(parents), { nodesep: 10, subtreesep: 30, ranksep: 1 });
    expect(r.x[4]! - r.x[3]!).toBeCloseTo(10, 9);
    expect(r.x[5]! - r.x[4]!).toBeCloseTo(30, 9);
    expectTidy(treeGraph(parents), r, { nodesep: 10, subtreesep: 30, ranksep: 1 });
  });

  it('centres the bounding box, extents included, on the origin', () => {
    const graph = treeGraph([-1, 0, 0, 2], {
      halfWidth: [3, 40, 6, 9],
      halfHeight: [7, 5, 30, 2],
    });
    const r = tidyTreeLayout(graph);
    const side = (sign: number, at: Float64Array, half: Float64Array): number =>
      Math.max(...list(at).map((v, i) => sign * v + half[i]!));
    expect(side(1, r.x, graph.halfWidth)).toBeCloseTo(side(-1, r.x, graph.halfWidth), 9);
    expect(side(1, r.y, graph.halfHeight)).toBeCloseTo(side(-1, r.y, graph.halfHeight), 9);
  });

  it('is tidy for any forest with any node sizes', () => {
    fc.assert(
      fc.property(
        arbitraryForest().chain((parents) =>
          fc.tuple(
            fc.constant(parents),
            fc.array(fc.double({ min: 0, max: 40, noNaN: true }), {
              minLength: 2 * parents.length,
              maxLength: 2 * parents.length,
            }),
          ),
        ),
        fc.record({
          nodesep: fc.double({ min: 0, max: 30, noNaN: true }),
          subtreesep: fc.double({ min: 0, max: 60, noNaN: true }),
          ranksep: fc.double({ min: 0, max: 80, noNaN: true }),
        }),
        ([parents, sizes], options) => {
          const n = parents.length;
          const graph = treeGraph(parents, {
            halfWidth: sizes.slice(0, n),
            halfHeight: sizes.slice(n),
          });
          const result = tidyTreeLayout(graph, options);
          expectTidy(graph, result, options);
          // The same input gives the same output.
          expect(tidyTreeLayout(graph, options)).toEqual(result);
        },
      ),
    );
  });

  it('reads sizes that are negative or not numbers as 0', () => {
    const graph = treeGraph([-1, 0, 0], { halfWidth: [NaN, -5, Infinity], halfHeight: NaN });
    const r = tidyTreeLayout(graph, { nodesep: NaN, ranksep: -3 });
    expect(list(r.x)).toEqual([0, -10, 10]);
    expect(list(r.y)).toEqual([25, -25, -25]);
  });
});

describe('tidy tree: symmetry', () => {
  it('draws the mirror image of a tree as the mirror image of its drawing', () => {
    fc.assert(
      fc.property(
        arbitraryTree(60),
        fc.array(fc.nat(8), { minLength: 60, maxLength: 60 }),
        fc.constantFrom(1, 2.5),
        (parents, widths, subtreesep) => {
          const n = parents.length;
          const halfWidth = widths.slice(0, n);
          const options = { ...UNIT, subtreesep };
          const a = tidyTreeLayout(treeGraph(parents, { halfWidth }), options);
          const mirrored = treeGraph(mirrorParents(parents), { halfWidth: halfWidth.toReversed() });
          const b = tidyTreeLayout(mirrored, options);
          for (let i = 0; i < n; i++) {
            expect(b.x[n - 1 - i]).toBeCloseTo(-a.x[i]!, 9);
            expect(b.y[n - 1 - i]).toBeCloseTo(a.y[i]!, 9);
          }
        },
      ),
    );
  });

  it('draws a symmetric tree symmetrically', () => {
    //          0
    //    1     2     3
    //   4 5    6    7 8
    const r = tidyTreeLayout(treeGraph([-1, 0, 0, 0, 1, 1, 2, 3, 3]), UNIT);
    expect(slots(r)).toEqual([2, 0.5, 2, 3.5, 0, 1, 2, 3, 4]);
  });
});

describe('tidy tree: forests', () => {
  it('stands the trees side by side with their roots on one level', () => {
    // Two trees and a single node.
    const parents = [-1, 0, 0, -1, 3, -1];
    const graph = treeGraph(parents, { halfWidth: 4, halfHeight: 4 });
    const r = tidyTreeLayout(graph, { nodesep: 10, subtreesep: 25, ranksep: 30 });
    expect(r.y[0]).toBe(r.y[3]);
    expect(r.y[0]).toBe(r.y[5]);
    expect(r.x[0]!).toBeLessThan(r.x[3]!);
    expect(r.x[3]!).toBeLessThan(r.x[5]!);
    // Trees are `subtreesep` apart: the second leaf of the first tree and the leaf of the second.
    expect(r.x[4]! - r.x[2]!).toBeCloseTo(4 + 4 + 25, 9);
    expect(r.x[5]! - r.x[3]!).toBeCloseTo(4 + 4 + 25, 9);
    expectTidy(graph, r, { nodesep: 10, subtreesep: 25, ranksep: 30 });
  });

  it('lays out a graph given as links, cycle and all', () => {
    // 0 → 1 → 2 → 0 and 1 → 3: no source, so 0 is the root.
    const graph = linkGraph(4, [
      [0, 1],
      [1, 2],
      [2, 0],
      [1, 3],
    ]);
    const r = tidyTreeLayout(graph, UNIT);
    expect(list(r.parent)).toEqual([-1, 0, 1, 1]);
    expect(list(r.treeLinks)).toEqual([1, 1, 0, 1]);
    expect(slots(r)).toEqual([0.5, 0.5, 0, 1]);
    expect(list(r.y)).toEqual([1, 0, -1, -1]);
  });
});

describe('tidy tree: orientations', () => {
  const parents = [-1, 0, 0, 1, 1, 1, 2, 6];
  const sizes = { halfWidth: [9, 3, 5, 2, 8, 1, 4, 6], halfHeight: [2, 7, 3, 5, 1, 6, 8, 4] };
  // The same tree with widths and heights swapped: what `'LR'` sees across and along.
  const turned = { halfWidth: sizes.halfHeight, halfHeight: sizes.halfWidth };
  const options = { nodesep: 7, ranksep: 13 };
  const tb = tidyTreeLayout(treeGraph(parents, sizes), { ...options, orientation: 'TB' });

  it("has the root at the top by default, and at the bottom for 'BT'", () => {
    expect(tidyTreeLayout(treeGraph(parents, sizes), options)).toEqual(tb);
    expect(tb.y[0]).toBe(Math.max(...tb.y));
    const bt = tidyTreeLayout(treeGraph(parents, sizes), { ...options, orientation: 'BT' });
    expect(list(bt.x)).toEqual(list(tb.x));
    expect(list(bt.y)).toEqual(list(tb.y).map((v) => -v || 0));
  });

  it("has the root on the left for 'LR', siblings from the top down", () => {
    const lr = tidyTreeLayout(treeGraph(parents, turned), { ...options, orientation: 'LR' });
    expect(lr.x[0]).toBe(Math.min(...lr.x));
    // 'TB' flipped over the falling diagonal: x ← −y, y ← −x.
    for (let i = 0; i < parents.length; i++) {
      expect(lr.x[i]).toBeCloseTo(-tb.y[i]!, 9);
      expect(lr.y[i]).toBeCloseTo(-tb.x[i]!, 9);
    }
    // The first child is above the last.
    expect(lr.y[1]!).toBeGreaterThan(lr.y[2]!);
  });

  it("mirrors 'LR' for 'RL'", () => {
    const lr = tidyTreeLayout(treeGraph(parents, turned), { ...options, orientation: 'LR' });
    const rl = tidyTreeLayout(treeGraph(parents, turned), { ...options, orientation: 'RL' });
    expect(rl.x[0]).toBe(Math.max(...rl.x));
    expect(list(rl.x)).toEqual(list(lr.x).map((v) => -v || 0));
    expect(list(rl.y)).toEqual(list(lr.y));
  });

  it("reads an unknown orientation as 'TB'", () => {
    const odd = tidyTreeLayout(treeGraph(parents, sizes), {
      ...options,
      orientation: 'XX' as 'TB',
    });
    expect(odd).toEqual(tb);
  });
});

describe('tidy tree: sorting', () => {
  it('orders siblings by subtree size or value on request', () => {
    const parents = [-1, 0, 0, 0, 2, 2];
    const graph = treeGraph(parents, { value: [0, 3, 1, 2, 0, 0] });
    const leftToRight = (o: TidyTreeOptions): number[] =>
      [1, 2, 3].sort((a, b) => {
        const r = tidyTreeLayout(graph, { ...UNIT, ...o });
        return r.x[a]! - r.x[b]!;
      });
    expect(leftToRight({})).toEqual([1, 2, 3]);
    expect(leftToRight({ sort: 'size' })).toEqual([2, 1, 3]);
    expect(leftToRight({ sort: 'value' })).toEqual([1, 3, 2]);
    expect(leftToRight({ sort: 'value', sortOrder: 'ascending' })).toEqual([2, 3, 1]);
  });
});

describe('tidy tree: collapse', () => {
  //          0
  //      1       2
  //    3 4 5     6
  //    7
  const parents = [-1, 0, 0, 1, 1, 1, 2, 3];
  const graph = treeGraph(parents, { halfWidth: 5, halfHeight: 5 });
  const options = { nodesep: 10, ranksep: 20 };
  const open = tidyTreeLayout(graph, options);
  const folded = tidyTreeLayout(graph, { ...options, collapsed: [1] });

  it('hides the descendants of a collapsed node and parks them on it', () => {
    expect(list(open.hidden)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(list(folded.hidden)).toEqual([0, 0, 0, 1, 1, 1, 0, 1]);
    for (const i of [3, 4, 5, 7]) {
      expect(folded.x[i]).toBe(folded.x[1]);
      expect(folded.y[i]).toBe(folded.y[1]);
    }
  });

  it('closes the gap: the rest is laid out as if the subtree were not there', () => {
    const without = tidyTreeLayout(
      treeGraph([-1, 0, 0, 2], { halfWidth: 5, halfHeight: 5 }),
      options,
    );
    expect([0, 1, 2, 6].map((i) => folded.x[i])).toEqual(list(without.x));
    expect([0, 1, 2, 6].map((i) => folded.y[i])).toEqual(list(without.y));
    const width = (r: TreeLayoutResult): number => Math.max(...r.x) - Math.min(...r.x);
    expect(width(folded)).toBeLessThan(width(open));
    expectTidy(graph, folded, options);
  });

  it('parks a nested collapsed subtree on the outermost collapsed node', () => {
    const r = tidyTreeLayout(graph, { ...options, collapsed: [3, 1] });
    expect(list(r.hidden)).toEqual(list(folded.hidden));
    expect(r.x[7]).toBe(r.x[1]);
    // Folding only the inner one leaves the outer open.
    const inner = tidyTreeLayout(graph, { ...options, collapsed: new Uint8Array([0, 0, 0, 1]) });
    expect(list(inner.hidden)).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect([inner.x[7], inner.y[7]]).toEqual([inner.x[3], inner.y[3]]);
  });

  it('collapsing a root leaves one node of its tree', () => {
    const r = tidyTreeLayout(graph, { collapsed: [0] });
    expect(list(r.hidden)).toEqual([0, 1, 1, 1, 1, 1, 1, 1]);
    expect(list(r.x)).toEqual(new Array(8).fill(0));
    expect(list(r.y)).toEqual(new Array(8).fill(0));
  });

  it('stays tidy for any forest with any nodes collapsed', () => {
    fc.assert(
      fc.property(arbitraryForest(), fc.array(fc.nat(39), { maxLength: 6 }), (p, collapsed) => {
        const g = treeGraph(p, { halfWidth: 3, halfHeight: 2 });
        const r = tidyTreeLayout(g, { collapsed });
        expectTidy(g, r, {});
        for (let i = 0; i < p.length; i++) {
          if (!r.hidden[i]) continue;
          let a = i;
          while (r.hidden[a]) a = p[a]!;
          expect([r.x[i], r.y[i]]).toEqual([r.x[a], r.y[a]]);
          expect(collapsed).toContain(a);
        }
      }),
    );
  });
});

describe('tidy tree: link routes', () => {
  //     0
  //   1 2 3      2 is straight below 0
  const parents = [-1, 0, 0, 0];
  const sizes = { halfWidth: 6, halfHeight: 4 };
  const links: [number, number][] = [
    [0, 1],
    [2, 0], // drawn child → parent
    [0, 3],
    [1, 3], // not a tree edge
  ];
  const graph = treeGraph(parents, { ...sizes, links });
  const options = { nodesep: 10, ranksep: 30 };

  it('returns no routes for straight links', () => {
    const r = tidyTreeLayout(graph, options);
    expect(r.routes).toBeUndefined();
    expect(r.parentRoutes).toBeUndefined();
    expect(list(r.treeLinks)).toEqual([1, 1, 1, 0]);
  });

  it('curves from the bottom of the parent to the top of the child', () => {
    const r = tidyTreeLayout(graph, { ...options, links: 'curved' });
    const route = r.routes![0]!;
    expect(route.kind).toBe('spline');
    const p = list(route.points);
    expect(p).toHaveLength(8);
    // Ends on the facing sides.
    expect(p.slice(0, 2)).toEqual([r.x[0], r.y[0]! - 4]);
    expect(p.slice(6)).toEqual([r.x[1], r.y[1]! + 4]);
    // Control points straight below the start and straight above the end, halfway down.
    const half = (p[1]! + p[7]!) / 2;
    expect(p.slice(2, 6)).toEqual([r.x[0], half, r.x[1], half]);
    // The link 2 → 0 runs from its source, the child, to the parent.
    const back = list(r.routes![1]!.points);
    expect(back.slice(0, 2)).toEqual([r.x[2], r.y[2]! + 4]);
    expect(back.slice(6)).toEqual([r.x[0], r.y[0]! - 4]);
    // By child node, every route runs parent → child.
    expect(list(r.parentRoutes![2]!.points).slice(0, 2)).toEqual([r.x[0], r.y[0]! - 4]);
    expect(r.parentRoutes![0]).toBeUndefined();
    // The link that is not a tree edge has none.
    expect(r.routes).toHaveLength(4);
    expect(r.routes![3]).toBeUndefined();
  });

  it('draws elbows with their bars halfway between the levels', () => {
    const r = tidyTreeLayout(graph, { ...options, links: 'elbow' });
    const route = r.routes![2]!;
    expect(route.kind).toBe('polyline');
    const bar = (r.y[0]! - 4 + r.y[3]! + 4) / 2;
    expect(list(route.points)).toEqual([
      r.x[0],
      r.y[0]! - 4,
      r.x[0],
      bar,
      r.x[3],
      bar,
      r.x[3],
      r.y[3]! + 4,
    ]);
    // Straight down needs no elbow.
    expect(r.routes![1]).toBeUndefined();
    expect(r.parentRoutes![2]).toBeUndefined();
  });

  it('keeps elbows axis-aligned and joined to their nodes in every orientation', () => {
    for (const orientation of ['TB', 'BT', 'LR', 'RL'] as const) {
      const r = tidyTreeLayout(graph, { ...options, orientation, links: 'elbow' });
      for (const v of [1, 3]) {
        const p = list(r.parentRoutes![v]!.points);
        for (let i = 2; i < p.length; i += 2) {
          const dx = p[i]! - p[i - 2]!;
          const dy = p[i + 1]! - p[i - 1]!;
          expect(dx === 0 || dy === 0).toBe(true);
          expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
        }
        // Starts on the parent's outline and ends on the child's.
        const onOutline = (node: number, px: number, py: number): boolean =>
          Math.abs(px - r.x[node]!) <= 6 + EPS &&
          Math.abs(py - r.y[node]!) <= 4 + EPS &&
          (Math.abs(Math.abs(px - r.x[node]!) - 6) < EPS ||
            Math.abs(Math.abs(py - r.y[node]!) - 4) < EPS);
        expect(onOutline(0, p[0]!, p[1]!)).toBe(true);
        expect(onOutline(v, p.at(-2)!, p.at(-1)!)).toBe(true);
      }
    }
  });

  it('gives hidden nodes no route', () => {
    const r = tidyTreeLayout(treeGraph([-1, 0, 1, 1], { links: [[1, 2]] }), {
      links: 'curved',
      collapsed: [1],
    });
    expect(r.routes![0]).toBeUndefined();
    expect(r.parentRoutes![1]).toBeDefined();
    expect(r.parentRoutes![2]).toBeUndefined();
  });

  it('drops the zero-length steps of an elbow between touching levels', () => {
    // No room between the levels: the bar is on the parent's bottom edge, and on the top edge of
    // the taller child.
    const tight = treeGraph(parents, { halfWidth: 6, halfHeight: [4, 2, 4, 6] });
    const r = tidyTreeLayout(tight, { nodesep: 10, ranksep: 0, links: 'elbow' });
    const bottom = r.y[0]! - 4;
    expect(list(r.parentRoutes![1]!.points)).toEqual([
      r.x[0],
      bottom,
      r.x[1],
      bottom,
      r.x[1],
      r.y[1]! + 2,
    ]);
    // The bar ends on the child: two points are a straight link.
    expect(r.y[3]! + 6).toBe(bottom);
    expect(r.parentRoutes![3]).toBeUndefined();
  });
});

describe('tidy tree: sizes of input', () => {
  it('is a GraphLayout, as are the radial tree and the dendrogram', () => {
    const tidy: GraphLayout<TidyTreeOptions> = tidyTreeLayout;
    const radial: GraphLayout<RadialTreeOptions> = radialTreeLayout;
    const dendrogram: GraphLayout<DendrogramOptions> = dendrogramLayout;
    for (const layout of [tidy, radial, dendrogram]) {
      const r = layout(treeGraph([-1, 0, 0]), { nodesep: 10 });
      expect([r.x.length, r.y.length, r.hidden?.length]).toEqual([3, 3, 3]);
    }
  });

  it('handles no nodes and one node', () => {
    const none = tidyTreeLayout(treeGraph([]), { links: 'curved' });
    expect(none.x).toHaveLength(0);
    expect(none.routes).toEqual([]);
    const one = tidyTreeLayout(treeGraph([-1], { halfWidth: 30, halfHeight: 10 }));
    expect([one.x[0], one.y[0]]).toEqual([0, 0]);
    expect(list(tidyTreeLayout(linkGraph(1, [[0, 0]])).x)).toEqual([0]);
  });

  it('lays out a chain of 100,000 nodes without recursing', () => {
    const n = 100_000;
    const r = tidyTreeLayout(treeGraph(Array.from({ length: n }, (_, i) => i - 1)), UNIT);
    expect(r.x.every((v) => v === 0)).toBe(true);
    expect(r.y[0]! - r.y[n - 1]!).toBe(n - 1);
  });

  it('lays out 10,000 nodes in linear time', () => {
    const time = (n: number): number => {
      const graph = treeGraph(scrambledTree(n), { halfWidth: 4, halfHeight: 4 });
      let best = Infinity;
      for (let run = 0; run < 3; run++) {
        const start = performance.now();
        const r = tidyTreeLayout(graph, { links: 'curved' });
        best = Math.min(best, performance.now() - start);
        expect(Number.isFinite(r.x[n - 1])).toBe(true);
      }
      return best;
    };
    time(2_000); // warm up
    const small = time(10_000);
    const large = time(80_000);
    // Loose bounds, safe on a busy machine: about 3 ms and 35 ms when it is idle. A pass that
    // went quadratic on this tree (it is 190 levels deep) would take far longer at 80,000 nodes.
    expect(small).toBeLessThan(500);
    expect(large).toBeLessThan(4000);
  });
});
