import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dendrogramLayout, type DendrogramOptions, type DendrogramResult } from './dendrogram.ts';
import { arbitraryForest, linkGraph, scrambledTree, treeGraph } from './testing.ts';

const list = (a: ArrayLike<number>): number[] => Array.from(a);
const EPS = 1e-9;

/** Positions shifted so the smallest is 0 (the layout centres its drawing). */
const fromZero = (a: ArrayLike<number>): number[] => {
  const min = Math.min(...list(a));
  return list(a).map((v) => Math.round((v - min) * 1e9) / 1e9);
};

/** Children of every node, in input order. */
function childrenOf(parent: ArrayLike<number>): number[][] {
  const out: number[][] = list(parent).map(() => []);
  list(parent).forEach((p, i) => p >= 0 && out[p]!.push(i));
  return out;
}

/**
 * A scipy linkage matrix as a tree: row `i` of `Z` merges clusters `Z[i][0]` and `Z[i][1]` at
 * distance `Z[i][2]` into cluster `n + i`. Leaves have no value.
 */
function linkageTree(
  n: number,
  Z: readonly (readonly [number, number, number])[],
): {
  parents: number[];
  value: number[];
} {
  const parents = new Array<number>(n + Z.length).fill(-1);
  const value = new Array<number>(n + Z.length).fill(NaN);
  Z.forEach(([a, b, distance], i) => {
    parents[a] = n + i;
    parents[b] = n + i;
    value[n + i] = distance;
  });
  return { parents, value };
}

describe('dendrogram: leaves and levels', () => {
  //        0
  //     1     2
  //    3 4   5 6
  //    7 8
  const parents = [-1, 0, 0, 1, 1, 2, 2, 3, 3];

  it('lines the leaves up, evenly spaced in tree order', () => {
    const r = dendrogramLayout(treeGraph(parents), { nodesep: 10, ranksep: 30 });
    const leaves = [7, 8, 4, 5, 6];
    expect(leaves.map((i) => r.y[i])).toEqual(new Array(5).fill(r.y[7]));
    expect(fromZero(r.x).filter((_, i) => leaves.includes(i))).toEqual([20, 30, 40, 0, 10]);
    expect(r.heights).toBe('level');
  });

  it('puts each inner node over the mean of its children, as many levels up as its deepest leaf', () => {
    const r = dendrogramLayout(treeGraph(parents), { nodesep: 10, ranksep: 30 });
    //   x: 7 → 0, 8 → 10, 4 → 20, 5 → 30, 6 → 40; 3 → 5, 1 → 12.5, 2 → 35, 0 → 23.75.
    expect(fromZero(r.x)).toEqual([23.75, 12.5, 35, 5, 20, 30, 40, 0, 10]);
    // Levels above the leaves: 3 and 2 are one up, 1 two, the root three.
    expect(fromZero(r.y)).toEqual([90, 60, 30, 30, 0, 0, 0, 0, 0]);
  });

  it('takes the mean over all children, not the middle of the outer two', () => {
    // Leaves at 0, 10 and 20, the last two under one node at 15: the root is at (0 + 15) / 2.
    const r = dendrogramLayout(treeGraph([-1, 0, 0, 2, 2, 0]), { nodesep: 10 });
    expect(fromZero(r.x)).toEqual([15, 0, 15, 10, 20, 30]);
  });

  it('spaces leaves by the widest node', () => {
    const graph = treeGraph([-1, 0, 0, 0], { halfWidth: [30, 5, 12, 5], halfHeight: 3 });
    const r = dendrogramLayout(graph, { nodesep: 8 });
    expect(r.x[2]! - r.x[1]!).toBe(2 * 30 + 8);
    expect(r.x[3]! - r.x[2]!).toBe(2 * 30 + 8);
    // The bounding box with the nodes' extents is centred.
    expect(Math.max(...r.y) + 3).toBeCloseTo(-(Math.min(...r.y) - 3), 9);
    expect(r.x[3]! + 5).toBeCloseTo(-(r.x[1]! - 5), 9);
  });

  it('stands the trees of a forest side by side on the same line of leaves', () => {
    const r = dendrogramLayout(treeGraph([-1, 0, 0, -1, 3, 3, -1]), { nodesep: 10, ranksep: 20 });
    expect(fromZero(r.x)).toEqual([5, 0, 10, 25, 20, 30, 40]);
    expect(fromZero(r.y)).toEqual([20, 0, 0, 20, 0, 0, 0]);
  });

  it('builds the tree from links when there is no tree input', () => {
    const r = dendrogramLayout(
      linkGraph(4, [
        [0, 1],
        [0, 2],
        [2, 3],
        [1, 3],
      ]),
      { nodesep: 10, ranksep: 20 },
    );
    // Breadth first, 3 is found from 1, the first of the two nodes that point at it.
    expect(list(r.parent)).toEqual([-1, 0, 0, 1]);
    expect(list(r.treeLinks)).toEqual([1, 1, 0, 1]);
    expect(fromZero(r.x)).toEqual([5, 0, 10, 0]);
    expect(fromZero(r.y)).toEqual([40, 20, 0, 0]);
  });

  it('holds its shape for any forest', () => {
    fc.assert(
      fc.property(arbitraryForest(), fc.array(fc.nat(39), { maxLength: 5 }), (p, collapsed) => {
        const graph = treeGraph(p, { halfWidth: 4, halfHeight: 2 });
        const r = dendrogramLayout(graph, { collapsed });
        const kids = childrenOf(p).map((c) => c.filter((i) => !r.hidden[i]));
        const visible = p.map((_, i) => i).filter((i) => !r.hidden[i]);
        const leaves = visible.filter((i) => kids[i]!.length === 0);
        // Leaves on one line, a constant step apart.
        const xs = leaves.map((i) => r.x[i]!).sort((a, b) => a - b);
        for (const i of leaves) expect(r.y[i]).toBeCloseTo(r.y[leaves[0]!]!, 9);
        for (let k = 1; k < xs.length; k++) expect(xs[k]! - xs[k - 1]!).toBeCloseTo(28, 9);
        for (const i of visible) {
          expect(Number.isFinite(r.x[i]! + r.y[i]!)).toBe(true);
          if (kids[i]!.length === 0) continue;
          const mean = kids[i]!.reduce((s, c) => s + r.x[c]!, 0) / kids[i]!.length;
          expect(r.x[i]).toBeCloseTo(mean, 9);
          // One level above its highest child.
          expect(r.y[i]).toBeCloseTo(Math.max(...kids[i]!.map((c) => r.y[c]!)) + 50, 9);
        }
        expect(dendrogramLayout(graph, { collapsed })).toEqual(r);
      }),
    );
  });
});

describe('dendrogram: heights from values', () => {
  //        4 (h = 10)
  //    2 (h = 4)   3
  //   0   1
  const parents = [2, 2, 4, 4, -1];
  const value = [NaN, NaN, 4, NaN, 10];

  it('draws each inner node at its value', () => {
    const r = dendrogramLayout(treeGraph(parents, { value }), { nodesep: 10, valueScale: 3 });
    expect(r.heights).toBe('value');
    expect(fromZero(r.y)).toEqual([0, 0, 12, 0, 30]);
    expect(fromZero(r.x)).toEqual([0, 10, 5, 20, 12.5]);
  });

  it('fits the full height to `ranksep` per level by default', () => {
    const r = dendrogramLayout(treeGraph(parents, { value }), { ranksep: 40 });
    // Two levels, so 80 for the root's 10: 8 per unit.
    expect(fromZero(r.y)).toEqual([0, 0, 32, 0, 80]);
    expect(r.valueAxis.scale).toBe(8);
  });

  it('says where a value is on the page, in every orientation', () => {
    for (const orientation of ['TB', 'BT', 'LR', 'RL'] as const) {
      const r = dendrogramLayout(treeGraph(parents, { value, halfWidth: 3, halfHeight: 7 }), {
        orientation,
        valueScale: 2.5,
      });
      const { axis, offset, scale } = r.valueAxis;
      expect(axis).toBe(orientation === 'TB' || orientation === 'BT' ? 'y' : 'x');
      expect(Math.abs(scale)).toBe(2.5);
      const at = axis === 'y' ? r.y : r.x;
      [0, 0, 4, 0, 10].forEach((h, i) => expect(at[i]).toBeCloseTo(offset + scale * h, 9));
    }
    // Without values the scale is in levels.
    const levels = dendrogramLayout(treeGraph(parents), { ranksep: 25 });
    expect(levels.valueAxis.scale).toBe(25);
    [0, 0, 1, 0, 2].forEach((h, i) =>
      expect(levels.y[i]).toBeCloseTo(levels.valueAxis.offset + 25 * h, 9),
    );
  });

  it('gives a leaf its value when it has one, and an inner node without one its highest child', () => {
    //      5 (no value)
    //   3 (h 6)   4 (h 2)
    //  0   1       2 (h 1: a leaf above the baseline)
    const r = dendrogramLayout(
      treeGraph([3, 3, 4, 5, 5, -1], { value: [NaN, NaN, 1, 6, 2, NaN] }),
      { valueScale: 1 },
    );
    expect(fromZero(r.y)).toEqual([0, 0, 1, 6, 2, 6]);
  });

  it('allows a merge below its children (an inversion)', () => {
    const r = dendrogramLayout(treeGraph(parents, { value: [NaN, NaN, 9, NaN, 5] }), {
      valueScale: 1,
    });
    expect(fromZero(r.y)).toEqual([0, 0, 9, 0, 5]);
    expect(r.y[2]!).toBeGreaterThan(r.y[4]!);
  });

  it('falls back to levels when no inner node has a value, and is flat when all are equal', () => {
    const leavesOnly = dendrogramLayout(treeGraph(parents, { value: [1, 2, NaN, 3, Infinity] }));
    expect(leavesOnly.heights).toBe('level');
    const equal = dendrogramLayout(treeGraph([-1, 0, 0], { value: [0, 0, 0] }));
    expect(equal.heights).toBe('value');
    expect(list(equal.y)).toEqual([0, 0, 0]);
    expect(equal.valueAxis.scale).toBe(0);
    // A junk scale is ignored.
    const junk = dendrogramLayout(treeGraph(parents, { value }), { valueScale: -2, ranksep: 40 });
    expect(junk.valueAxis.scale).toBe(8);
  });
});

describe('dendrogram: a scipy linkage', () => {
  // Five observations and their linkage matrix, columns: cluster, cluster, distance.
  //   5 = (0, 1) at 1.0    6 = (3, 4) at 1.5    7 = (2, 5) at 2.0    8 = (6, 7) at 4.0
  // scipy.cluster.hierarchy.dendrogram draws it with the leaves in the order 3 4 2 0 1 at
  // x = 5, 15, 25, 35, 45 and returns one bracket per merge:
  //   icoord = [[35, 35, 45, 45], [5, 5, 15, 15], [25, 25, 40, 40], [10, 10, 32.5, 32.5]]
  //   dcoord = [[0, 1, 1, 0], [0, 1.5, 1.5, 0], [0, 2, 2, 1], [1.5, 4, 4, 2]]
  const Z = [
    [0, 1, 1.0],
    [3, 4, 1.5],
    [2, 5, 2.0],
    [6, 7, 4.0],
  ] as const;
  const ICOORD = [
    [35, 35, 45, 45],
    [5, 5, 15, 15],
    [25, 25, 40, 40],
    [10, 10, 32.5, 32.5],
  ];
  const DCOORD = [
    [0, 1, 1, 0],
    [0, 1.5, 1.5, 0],
    [0, 2, 2, 1],
    [1.5, 4, 4, 2],
  ];
  const { parents, value } = linkageTree(5, Z);
  // scipy's leaf pitch is 10 and its heights are the distances: no node size, a gap of 10, scale 1.
  const r = dendrogramLayout(treeGraph(parents, { value }), { nodesep: 10, valueScale: 1 });
  // scipy's frame: the first leaf at x = 5, the leaves at height 0.
  const sx = (i: number): number => r.x[i]! - Math.min(...r.x) + 5;
  const sy = (i: number): number => r.y[i]! - Math.min(...r.y);

  it('orders and places the leaves as scipy does', () => {
    expect([3, 4, 2, 0, 1].map(sx)).toEqual([5, 15, 25, 35, 45]);
    expect([0, 1, 2, 3, 4].map(sy)).toEqual([0, 0, 0, 0, 0]);
  });

  it('places the merges at the middle of their brackets, at their distance', () => {
    Z.forEach(([, , distance], i) => {
      expect(sx(5 + i)).toBeCloseTo((ICOORD[i]![1]! + ICOORD[i]![2]!) / 2, 9);
      expect(sy(5 + i)).toBeCloseTo(distance, 9);
    });
    expect(r.valueAxis).toEqual({ axis: 'y', offset: Math.min(...r.y), scale: 1 });
  });

  it('draws each bracket with the elbows of its two links', () => {
    const x0 = Math.min(...r.x) - 5;
    const y0 = Math.min(...r.y);
    Z.forEach(([a, b], i) => {
      // The left arm is the link to the first cluster read backwards, the right arm the second.
      const left = list(r.parentRoutes![a]!.points);
      const right = list(r.parentRoutes![b]!.points);
      const bracket = [
        [left[4], left[5]],
        [left[2], left[3]],
        [right[2], right[3]],
        [right[4], right[5]],
      ];
      expect(bracket.map(([x]) => x! - x0)).toEqual(ICOORD[i]);
      expect(bracket.map(([, y]) => y! - y0)).toEqual(DCOORD[i]);
      // Both links start at the merge.
      expect(left.slice(0, 2)).toEqual([r.x[5 + i], r.y[5 + i]]);
      expect(right.slice(0, 2)).toEqual([r.x[5 + i], r.y[5 + i]]);
    });
  });
});

describe('dendrogram: link routes', () => {
  //        0
  //    1   2   3       2 is straight below 0
  //   4 5     6 7
  const parents = [-1, 0, 0, 0, 1, 1, 3, 3];
  const links: [number, number][] = [
    [0, 1],
    [4, 1], // drawn child → parent
    [0, 2],
    [4, 5], // not a tree edge
  ];
  const graph = treeGraph(parents, { links, halfWidth: 4, halfHeight: 6 });

  it('routes elbows by default: along the leaf axis, then down to the child', () => {
    const r = dendrogramLayout(graph);
    const route = r.routes![0]!;
    expect(route.kind).toBe('polyline');
    expect(list(route.points)).toEqual([r.x[0], r.y[0], r.x[1], r.y[0], r.x[1], r.y[1]]);
    // From the link's source: up from the child, then along to the parent.
    expect(list(r.routes![1]!.points)).toEqual([r.x[4], r.y[4], r.x[4], r.y[1], r.x[1], r.y[1]]);
    // Straight down is a straight link; the extra link has no route.
    expect(r.routes![2]).toBeUndefined();
    expect(r.routes![3]).toBeUndefined();
  });

  it('keeps elbows axis-aligned and joined to both nodes in every orientation', () => {
    for (const orientation of ['TB', 'BT', 'LR', 'RL'] as const) {
      const r = dendrogramLayout(graph, { orientation });
      for (const v of [1, 3, 4, 5, 6, 7]) {
        const p = list(r.parentRoutes![v]!.points);
        const from = parents[v]!;
        expect(p).toHaveLength(6);
        expect(p.slice(0, 2)).toEqual([r.x[from], r.y[from]]);
        expect(p.slice(4)).toEqual([r.x[v], r.y[v]]);
        const across = orientation === 'TB' || orientation === 'BT' ? 0 : 1;
        // First along the leaf axis, then along the height axis.
        expect(p[2 + (1 - across)]).toBe(p[1 - across]);
        expect(p[4 + across]).toBe(p[2 + across]);
      }
    }
  });

  it('returns no routes for straight links', () => {
    const r = dendrogramLayout(graph, { links: 'straight' });
    expect(r.routes).toBeUndefined();
    expect(r.parentRoutes).toBeUndefined();
    expect(list(r.treeLinks)).toEqual([1, 1, 1, 0]);
  });

  it('needs no elbow for a child at the height of its parent', () => {
    const r = dendrogramLayout(treeGraph([-1, 0, 0], { value: [3, 3, NaN] }), { valueScale: 1 });
    expect(r.y[1]).toBe(r.y[0]);
    expect(r.parentRoutes![1]).toBeUndefined();
    expect(r.parentRoutes![2]).toBeDefined();
  });
});

describe('dendrogram: orientations', () => {
  const parents = [-1, 0, 0, 1, 1, 2];
  const value = [9, 4, 2, NaN, NaN, NaN];
  const sizes = { halfWidth: [1, 5, 2, 7, 3, 4], halfHeight: [6, 2, 8, 1, 5, 3] };
  const turned = { halfWidth: sizes.halfHeight, halfHeight: sizes.halfWidth };
  const options: DendrogramOptions = { nodesep: 6, valueScale: 4 };
  const tb = dendrogramLayout(treeGraph(parents, { value, ...sizes }), options);

  it('has the root at the top and the leaves on a line at the bottom by default', () => {
    expect(tb.y[0]).toBe(Math.max(...tb.y));
    expect([tb.y[3], tb.y[4], tb.y[5]]).toEqual(new Array(3).fill(Math.min(...tb.y)));
  });

  it("flips for 'BT', and turns for 'LR' and 'RL' with the first leaf at the top", () => {
    const of = (orientation: DendrogramOptions['orientation'], s: typeof sizes): DendrogramResult =>
      dendrogramLayout(treeGraph(parents, { value, ...s }), { ...options, orientation });
    const bt = of('BT', sizes);
    const lr = of('LR', turned);
    const rl = of('RL', turned);
    for (let i = 0; i < parents.length; i++) {
      expect([bt.x[i], bt.y[i]]).toEqual([tb.x[i], -tb.y[i]! + 0]);
      expect(lr.x[i]).toBeCloseTo(-tb.y[i]!, 9);
      expect(lr.y[i]).toBeCloseTo(-tb.x[i]!, 9);
      expect([rl.x[i], rl.y[i]]).toEqual([-lr.x[i]! + 0, lr.y[i]]);
    }
    expect(lr.x[0]).toBe(Math.min(...lr.x));
    expect(lr.y[3]!).toBeGreaterThan(lr.y[5]!);
  });
});

describe('dendrogram: collapse and sorting', () => {
  //         6 (h 9)
  //    4 (h 3)    5 (h 5)
  //   0   1      2   3
  const parents = [4, 4, 5, 5, 6, 6, -1];
  const value = [NaN, NaN, NaN, NaN, 3, 5, 9];
  const options: DendrogramOptions = { nodesep: 10, valueScale: 1 };

  it('makes a leaf of a collapsed node, at its own height, and closes the gap', () => {
    const r = dendrogramLayout(treeGraph(parents, { value }), { ...options, collapsed: [5] });
    expect(list(r.hidden)).toEqual([0, 0, 1, 1, 0, 0, 0]);
    // Three slots instead of four: leaves 0 and 1, and the folded node 5.
    expect([0, 1, 5].map((i) => r.x[i]! - r.x[0]!)).toEqual([0, 10, 20]);
    expect(r.y[5]! - r.y[0]!).toBe(5);
    expect(r.y[6]! - r.y[0]!).toBe(9);
    // The hidden leaves wait on the folded node.
    expect([r.x[2], r.y[2], r.x[3], r.y[3]]).toEqual([r.x[5], r.y[5], r.x[5], r.y[5]]);
    expect(r.parentRoutes![2]).toBeUndefined();
    expect(r.parentRoutes![5]).toBeDefined();
  });

  it('counts levels from the visible leaves when there are no values', () => {
    const open = dendrogramLayout(treeGraph([-1, 0, 0, 1, 3]), { ranksep: 10 });
    expect(fromZero(open.y)).toEqual([30, 20, 0, 10, 0]);
    const folded = dendrogramLayout(treeGraph([-1, 0, 0, 1, 3]), { ranksep: 10, collapsed: [1] });
    expect(fromZero(folded.y)).toEqual([10, 0, 0, 0, 0]);
  });

  it('sorts siblings by subtree size or value', () => {
    const graph = treeGraph([-1, 0, 0, 2, 2], { value: [9, 7, 3, NaN, NaN] });
    const order = (o: DendrogramOptions): number[] => {
      const r = dendrogramLayout(graph, o);
      return [1, 3, 4].sort((a, b) => r.x[a]! - r.x[b]!);
    };
    expect(order({})).toEqual([1, 3, 4]);
    expect(order({ sort: 'size' })).toEqual([3, 4, 1]);
    expect(order({ sort: 'value', sortOrder: 'ascending' })).toEqual([3, 4, 1]);
    expect(order({ sort: 'value' })).toEqual([1, 3, 4]);
  });
});

describe('dendrogram: sizes of input', () => {
  it('handles no nodes and one node', () => {
    const none = dendrogramLayout(treeGraph([]));
    expect(none.x).toHaveLength(0);
    expect(none.routes).toEqual([]);
    expect(none.valueAxis).toEqual({ axis: 'y', offset: 0, scale: 50 });
    const one = dendrogramLayout(treeGraph([-1], { halfWidth: 9, halfHeight: 2, value: [5] }));
    expect([one.x[0], one.y[0]]).toEqual([0, 0]);
    expect(one.heights).toBe('level');
  });

  it('lays out 10,000 nodes quickly, and a chain of 100,000 without recursing', () => {
    const graph = treeGraph(scrambledTree(10_000), { halfWidth: 4, halfHeight: 4 });
    dendrogramLayout(graph);
    const start = performance.now();
    const r = dendrogramLayout(graph);
    expect(performance.now() - start).toBeLessThan(500);
    expect(list(r.x).every(Number.isFinite)).toBe(true);
    const n = 100_000;
    const chain = dendrogramLayout(treeGraph(Array.from({ length: n }, (_, i) => i - 1)), {
      ranksep: 1,
      links: 'straight',
    });
    expect(chain.y[0]! - chain.y[n - 1]!).toBe(n - 1);
    expect(Math.abs(chain.y[0]! + chain.y[n - 1]!)).toBeLessThan(EPS);
  });
});
