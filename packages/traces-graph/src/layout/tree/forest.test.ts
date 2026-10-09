import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildForest, viewForest } from './forest.ts';
import { arbitraryForest, linkGraph, treeGraph } from './testing.ts';

const list = (a: ArrayLike<number>): number[] => Array.from(a);

/** Children of every node, as plain lists. */
function childLists(f: ReturnType<typeof buildForest>): number[][] {
  return Array.from({ length: f.nodes }, (_, i) =>
    list(f.children.subarray(f.childStart[i], f.childStart[i + 1])),
  );
}

describe('forest: tree input', () => {
  //        0
  //      1   2
  //     3 4   5
  const PARENTS = [-1, 0, 0, 1, 1, 2];

  it('takes the parents as given', () => {
    const f = buildForest(treeGraph(PARENTS));
    expect(list(f.parent)).toEqual(PARENTS);
    expect(list(f.roots)).toEqual([0]);
    expect(childLists(f)).toEqual([[1, 2], [3, 4], [5], [], [], []]);
    expect(list(f.depth)).toEqual([0, 1, 1, 2, 2, 2]);
    expect(list(f.order)).toEqual([0, 1, 3, 4, 2, 5]);
    expect(list(f.size)).toEqual([6, 3, 2, 1, 1, 1]);
  });

  it('keeps siblings in node order whatever the order of the parents', () => {
    const f = buildForest(treeGraph([3, 3, 3, -1, 0, 0]));
    expect(list(f.roots)).toEqual([3]);
    expect(childLists(f)[3]).toEqual([0, 1, 2]);
    expect(list(f.order)).toEqual([3, 0, 4, 5, 1, 2]);
  });

  it('makes a root of a node whose parent is itself, out of range or missing', () => {
    const graph = { ...treeGraph([0, 7, -5, 1]), parent: Int32Array.of(0, 7, -5, 1) };
    expect(list(buildForest(graph).parent)).toEqual([-1, -1, -1, 1]);
    // A parent array shorter than the node count: the rest are roots.
    const short = { ...treeGraph([-1, 0, 0]), parent: Int32Array.of(-1, 0) };
    expect(list(buildForest(short).parent)).toEqual([-1, 0, -1]);
  });

  it('cuts a cycle of parents at its lowest node', () => {
    // 0 → 1 → 2 → 0 (each the parent of the next): no root.
    expect(list(buildForest(treeGraph([1, 2, 0])).parent)).toEqual([-1, 2, 0]);
    // 1 ↔ 2, with 0 hanging off 1 and 3 off 2, and a separate tree 4 ← 5.
    const f = buildForest(treeGraph([1, 2, 1, 2, -1, 4]));
    expect(list(f.parent)).toEqual([1, -1, 1, 2, -1, 4]);
    expect(list(f.roots)).toEqual([1, 4]);
    expect(list(f.order)).toEqual([1, 0, 2, 3, 4, 5]);
  });

  it('finds the link of each parent-child pair, either way round, first one wins', () => {
    const f = buildForest(
      treeGraph(PARENTS, {
        links: [
          [0, 1], // tree edge
          [2, 0], // tree edge, drawn child → parent
          [0, 1], // repeats link 0
          [3, 4], // siblings: not a tree edge
          [1, 3], // tree edge
          [0, 2], // parent → child: preferred over link 1
          [5, 5], // self-link
        ],
      }),
    );
    expect(list(f.parentLink)).toEqual([-1, 0, 5, 4, -1, -1]);
    expect(list(f.treeLinks)).toEqual([1, 0, 0, 0, 1, 1, 0]);
  });
});

describe('forest: from links', () => {
  it('spans a tree from the node without incoming links, in link order', () => {
    const f = buildForest(
      linkGraph(5, [
        [0, 2],
        [0, 1],
        [2, 4],
        [2, 3],
      ]),
    );
    expect(list(f.parent)).toEqual([-1, 0, 0, 2, 2]);
    expect(childLists(f)[0]).toEqual([2, 1]);
    expect(childLists(f)[2]).toEqual([4, 3]);
    expect(list(f.treeLinks)).toEqual([1, 1, 1, 1]);
  });

  it('leaves extra links out of the tree: a diamond and a shortcut', () => {
    // 0 → 1 → 3, 0 → 2 → 3, and 0 → 3 last.
    const f = buildForest(
      linkGraph(4, [
        [0, 1],
        [0, 2],
        [1, 3],
        [2, 3],
        [0, 3],
      ]),
    );
    // Breadth first: 3 is one link from 0, so the shortcut is its tree edge.
    expect(list(f.parent)).toEqual([-1, 0, 0, 0]);
    expect(list(f.parentLink)).toEqual([-1, 0, 1, 4]);
    expect(list(f.treeLinks)).toEqual([1, 1, 0, 0, 1]);
  });

  it('ignores the link that closes a cycle', () => {
    // 3 → 0 → 1 → 2 → 0.
    const f = buildForest(
      linkGraph(4, [
        [0, 1],
        [1, 2],
        [2, 0],
        [3, 0],
      ]),
    );
    expect(list(f.roots)).toEqual([3]);
    expect(list(f.parent)).toEqual([3, 0, 1, -1]);
    expect(list(f.treeLinks)).toEqual([1, 1, 0, 1]);
  });

  it('roots a graph with no source node at its lowest node', () => {
    const cycle = buildForest(
      linkGraph(3, [
        [1, 2],
        [2, 0],
        [0, 1],
      ]),
    );
    expect(list(cycle.roots)).toEqual([0]);
    expect(list(cycle.parent)).toEqual([-1, 0, 1]);
    expect(list(cycle.treeLinks)).toEqual([1, 0, 1]);
    // Two separate cycles, and a third component with a source.
    const f = buildForest(
      linkGraph(6, [
        [3, 2],
        [2, 3],
        [5, 4],
        [4, 5],
        [0, 1],
      ]),
    );
    expect(list(f.roots)).toEqual([0, 2, 4]);
    expect(list(f.parent)).toEqual([-1, 0, -1, 2, -1, 4]);
  });

  it('goes against the links for nodes that only point at the tree', () => {
    // 0 → 1 ← 2 ⇄ 3: the cycle 2, 3 has no source of its own and hangs off 1.
    const f = buildForest(
      linkGraph(4, [
        [0, 1],
        [2, 1],
        [2, 3],
        [3, 2],
      ]),
    );
    expect(list(f.roots)).toEqual([0]);
    expect(list(f.parent)).toEqual([-1, 0, 1, 2]);
    expect(list(f.parentLink)).toEqual([-1, 0, 1, 2]);
  });

  it('makes every isolated node and every source a root, nearest root first', () => {
    // Sources 0 and 3 both reach 2: at one link from 3, two from 0. Node 4 is alone.
    const f = buildForest(
      linkGraph(5, [
        [0, 1],
        [1, 2],
        [3, 2],
      ]),
    );
    expect(list(f.roots)).toEqual([0, 3, 4]);
    expect(list(f.parent)).toEqual([-1, 0, 3, -1, -1]);
    // Equally near: the earlier root wins.
    const tie = buildForest(
      linkGraph(3, [
        [1, 2],
        [0, 2],
      ]),
    );
    expect(list(tie.parent)).toEqual([-1, -1, 0]);
  });

  it('skips self-links and repeats', () => {
    const f = buildForest(
      linkGraph(2, [
        [0, 0],
        [1, 1],
        [0, 1],
        [0, 1],
      ]),
    );
    // The self-link on 1 is not an incoming link, but the link from 0 is.
    expect(list(f.roots)).toEqual([0]);
    expect(list(f.treeLinks)).toEqual([0, 0, 1, 0]);
  });

  it('handles no nodes, one node and no links', () => {
    expect(buildForest(linkGraph(0, [])).roots).toHaveLength(0);
    expect(list(buildForest(linkGraph(1, [])).roots)).toEqual([0]);
    expect(list(buildForest(linkGraph(3, [])).roots)).toEqual([0, 1, 2]);
    expect(list(buildForest(treeGraph([])).order)).toEqual([]);
  });

  it('puts every node of any graph in exactly one tree', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 12 })
          .chain((n) =>
            fc.tuple(
              fc.constant(n),
              fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { maxLength: 30 }),
            ),
          ),
        ([n, links]) => {
          const graph = linkGraph(n, links);
          const f = buildForest(graph);
          // The preorder visits every node once, parents first.
          expect(list(f.order).sort((a, b) => a - b)).toEqual(
            Array.from({ length: n }, (_, i) => i),
          );
          const seen = new Set<number>();
          for (const v of f.order) {
            const p = f.parent[v]!;
            if (p >= 0) expect(seen.has(p)).toBe(true);
            seen.add(v);
            // A tree edge is a link between the node and its parent.
            const k = f.parentLink[v]!;
            expect(k >= 0).toBe(p >= 0);
            if (k >= 0) {
              expect([graph.source[k], graph.target[k]].sort()).toEqual([p, v].sort());
            }
          }
          expect(list(f.treeLinks).reduce((a, b) => a + b, 0)).toBe(n - f.roots.length);
          // A node without incoming links is always a root.
          const incoming = new Set(links.filter(([s, t]) => s !== t).map(([, t]) => t));
          for (let i = 0; i < n; i++) if (!incoming.has(i)) expect(f.parent[i]).toBe(-1);
          // The same graph gives the same forest.
          expect(buildForest(graph)).toEqual(f);
        },
      ),
    );
  });

  it('does not recurse: a path of 200,000 nodes', () => {
    const n = 200_000;
    const byLinks = buildForest(
      linkGraph(
        n,
        Array.from({ length: n - 1 }, (_, i) => [i, i + 1] as const),
      ),
    );
    expect(byLinks.depth[n - 1]).toBe(n - 1);
    const byParents = buildForest(treeGraph(Array.from({ length: n }, (_, i) => i - 1)));
    expect(byParents.size[0]).toBe(n);
  });
});

describe('forest: the view a layout draws', () => {
  //          0
  //      1   2    3
  //     4 5      6 7 8
  //                  9
  const PARENTS = [-1, 0, 0, 0, 1, 1, 3, 3, 3, 8];
  const visibleChildren = (v: ReturnType<typeof viewForest>, i: number): number[] =>
    list(v.children.subarray(v.childStart[i], v.childEnd[i]));

  it('is the forest itself by default', () => {
    const graph = treeGraph(PARENTS);
    const view = viewForest(buildForest(graph), graph);
    expect(list(view.order)).toEqual([0, 1, 4, 5, 2, 3, 6, 7, 8, 9]);
    expect(list(view.hidden)).toEqual(new Array(10).fill(0));
  });

  it('sorts siblings by subtree size, largest first, ties in input order', () => {
    const graph = treeGraph(PARENTS);
    const view = viewForest(buildForest(graph), graph, { sort: 'size' });
    expect(visibleChildren(view, 0)).toEqual([3, 1, 2]);
    expect(visibleChildren(view, 3)).toEqual([8, 6, 7]);
    const ascending = viewForest(buildForest(graph), graph, {
      sort: 'size',
      sortOrder: 'ascending',
    });
    expect(visibleChildren(ascending, 0)).toEqual([2, 1, 3]);
    expect(visibleChildren(ascending, 3)).toEqual([6, 7, 8]);
  });

  it('sorts siblings and roots by value, nodes without one last', () => {
    const graph = treeGraph([-1, -1, -1, 0, 0, 0], { value: [1, 5, NaN, 2, NaN, 9] });
    const forest = buildForest(graph);
    const view = viewForest(forest, graph, { sort: 'value' });
    expect(list(view.roots)).toEqual([1, 0, 2]);
    expect(visibleChildren(view, 0)).toEqual([5, 3, 4]);
    const ascending = viewForest(forest, graph, { sort: 'value', sortOrder: 'ascending' });
    expect(list(ascending.roots)).toEqual([0, 1, 2]);
    expect(visibleChildren(ascending, 0)).toEqual([3, 5, 4]);
    // Without values there is nothing to sort by: input order.
    const plain = treeGraph(PARENTS);
    expect(visibleChildren(viewForest(buildForest(plain), plain, { sort: 'value' }), 0)).toEqual([
      1, 2, 3,
    ]);
  });

  it('hides what is below a collapsed node, given as indices or as a mask', () => {
    const graph = treeGraph(PARENTS);
    const forest = buildForest(graph);
    const byIndex = viewForest(forest, graph, { collapsed: new Set([3]) });
    expect(list(byIndex.hidden)).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
    expect(list(byIndex.order)).toEqual([0, 1, 4, 5, 2, 3]);
    expect(visibleChildren(byIndex, 3)).toEqual([]);
    const mask = new Uint8Array(10);
    mask[3] = 1;
    expect(viewForest(forest, graph, { collapsed: mask })).toEqual(byIndex);
    // A collapsed node inside a collapsed subtree, a collapsed leaf and junk change nothing.
    const more = viewForest(forest, graph, { collapsed: [3, 8, 2, -1, 99, 1.5] });
    expect(list(more.hidden)).toEqual(list(byIndex.hidden));
    // Nothing collapsed, or nothing that can be read.
    for (const junk of [null, 7, {}]) {
      const view = viewForest(forest, graph, { collapsed: junk as unknown as number[] });
      expect(list(view.hidden)).toEqual(new Array(10).fill(0));
    }
    expect(list(viewForest(forest, graph, { collapsed: [] }).hidden)).toEqual(
      new Array(10).fill(0),
    );
    expect(list(viewForest(forest, graph, { collapsed: new Uint8Array(3) }).order)).toHaveLength(
      10,
    );
  });

  it('does not reorder siblings when one of them is collapsed', () => {
    const graph = treeGraph(PARENTS);
    const view = viewForest(buildForest(graph), graph, { sort: 'size', collapsed: [3] });
    expect(visibleChildren(view, 0)).toEqual([3, 1, 2]);
  });

  it('keeps every visible node of a random forest once, parents first', () => {
    fc.assert(
      fc.property(arbitraryForest(), fc.array(fc.nat(39)), (parents, collapsed) => {
        const graph = treeGraph(parents);
        const view = viewForest(buildForest(graph), graph, { collapsed, sort: 'size' });
        const folded = new Set(collapsed);
        const seen = new Set<number>();
        for (const v of view.order) {
          expect(seen.has(v)).toBe(false);
          seen.add(v);
          const p = parents[v]!;
          if (p >= 0) expect(seen.has(p) && !folded.has(p)).toBe(true);
        }
        for (let i = 0; i < parents.length; i++) expect(view.hidden[i]).toBe(seen.has(i) ? 0 : 1);
      }),
    );
  });
});
