import { describe, expect, it } from 'vitest';
import {
  adjacencyMatrix,
  connectedComponents,
  degrees,
  fromAdjacencyMatrix,
  fromDot,
  fromEdgeList,
  fromNodeLink,
  louvain,
  modularity,
  type GraphData,
} from './index.ts';

/** Two cliques of `size` nodes joined by one link. */
function barbell(size: number): GraphData {
  const edges: [number, number][] = [];
  for (const offset of [0, size]) {
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) edges.push([offset + i, offset + j]);
    }
  }
  edges.push([size - 1, size]);
  return fromEdgeList(edges, { directed: false });
}

describe('fromEdgeList', () => {
  it('reads tuples, numbering nodes in the order they are first seen', () => {
    const g = fromEdgeList([
      ['a', 'b'],
      ['b', 'c', 3],
      ['a', 'c', '2.5'],
    ]);
    expect(g.node.label).toEqual(['a', 'b', 'c']);
    expect(g.link).toEqual({ source: [0, 1, 0], target: [1, 2, 2], value: [1, 3, 2.5] });
    expect(g.directed).toBe(true);
  });

  it('reads objects with custom keys and keeps other fields as customdata', () => {
    const g = fromEdgeList(
      [
        { from: 1, to: 2, w: 4, label: 'calls', since: 2020 },
        { from: 2, to: 1 },
        { from: null, to: 2 },
      ],
      { source: 'from', target: 'to', value: 'w', directed: false },
    );
    expect(g.node.label).toEqual(['1', '2']);
    expect(g.link.source).toEqual([0, 1]);
    expect(g.link.value).toEqual([4, 1]);
    expect(g.link.label).toEqual(['calls', null]);
    expect(g.link.customdata).toEqual([{ since: 2020 }, null]);
    expect(g.directed).toBe(false);
  });

  it('takes a node table: its order first, its labels and groups, and unlinked nodes', () => {
    const g = fromEdgeList([['x', 'y']], {
      nodes: [
        { key: 'lonely', name: 'Lonely', group: 'A' },
        { key: 'y', name: 'Why', size: 3 },
      ],
      id: 'key',
    });
    expect(g.node.label).toEqual(['Lonely', 'Why', 'x']);
    expect(g.node.group).toEqual(['A', null, null]);
    expect(g.node.value).toEqual([NaN, 3, NaN]);
    expect(g.link).toEqual({ source: [2], target: [1] });
  });

  it('gives no optional arrays when nothing has a value for them', () => {
    const g = fromEdgeList([]);
    expect(g).toEqual({ node: { label: [] }, link: { source: [], target: [] }, directed: true });
  });
});

describe('fromAdjacencyMatrix', () => {
  it('reads a symmetric matrix as undirected, one link per pair', () => {
    const g = fromAdjacencyMatrix(
      [
        [0, 2, 0],
        [2, 0, 1],
        [0, 1, 5],
      ],
      { labels: ['a', 'b', 'c'] },
    );
    expect(g.directed).toBe(false);
    expect(g.node.label).toEqual(['a', 'b', 'c']);
    expect(g.link).toEqual({ source: [0, 1, 2], target: [1, 2, 2], value: [2, 1, 5] });
  });

  it('reads an asymmetric matrix as directed and applies the threshold', () => {
    const g = fromAdjacencyMatrix(
      [
        [0, 1, 0.1],
        [0, 0, NaN],
        [3, 0, 0],
      ],
      { threshold: 0.5 },
    );
    expect(g.directed).toBe(true);
    expect(g.node.label).toEqual(['0', '1', '2']);
    expect(g.link).toEqual({ source: [0, 2], target: [1, 0], value: [1, 3] });
  });

  it('takes typed rows and an explicit direction', () => {
    const g = fromAdjacencyMatrix([Float64Array.of(0, 1), Float64Array.of(1, 0)], {
      directed: true,
    });
    expect(g.link.source).toEqual([0, 1]);
    expect(g.link.target).toEqual([1, 0]);
  });
});

describe('fromNodeLink', () => {
  it('reads networkx node-link data with `links`', () => {
    const g = fromNodeLink({
      directed: true,
      multigraph: false,
      graph: {},
      nodes: [
        { id: 'a', community: 1, x: 0, y: 1 },
        { id: 'b', label: 'Bee', role: 'hub' },
      ],
      links: [
        { source: 'a', target: 'b', weight: 2.5 },
        { source: 'a', target: 'missing' },
      ],
    });
    expect(g.directed).toBe(true);
    expect(g.node.label).toEqual(['a', 'Bee']);
    expect(g.node.group).toEqual([1, null]);
    expect(g.node.x).toEqual([0, NaN]);
    expect(g.node.y).toEqual([1, NaN]);
    expect(g.node.customdata).toEqual([null, { role: 'hub' }]);
    expect(g.link).toEqual({ source: [0], target: [1], value: [2.5] });
  });

  it('reads networkx 3.4 `edges`, and is undirected unless told otherwise', () => {
    const g = fromNodeLink({ nodes: [{ id: 1 }, { id: 2 }], edges: [{ source: 1, target: 2 }] });
    expect(g.directed).toBe(false);
    expect(g.link).toEqual({ source: [0], target: [1] });
  });

  it('reads d3 data: links by index when nodes have no ids, or by node object', () => {
    const byIndex = fromNodeLink({
      nodes: [
        { name: 'Myriel', group: 1 },
        { name: 'Napoleon', group: 1 },
      ],
      links: [{ source: 1, target: 0, value: 1 }],
    });
    expect(byIndex.node.label).toEqual(['Myriel', 'Napoleon']);
    expect(byIndex.link).toEqual({ source: [1], target: [0], value: [1] });

    const a = { id: 'a' };
    const b = { id: 'b' };
    const byObject = fromNodeLink({ nodes: [a, b], links: [{ source: a, target: b }] });
    expect(byObject.link).toEqual({ source: [0], target: [1] });
  });

  it('reads a graphology export', () => {
    const g = fromNodeLink({
      attributes: { name: 'g' },
      options: { type: 'mixed', multi: false, allowSelfLoops: true },
      nodes: [{ key: 'n1', attributes: { label: 'One', size: 4, color: '#f00' } }, { key: 'n2' }],
      edges: [
        { key: 'e1', source: 'n1', target: 'n2', attributes: { weight: 3 }, undirected: true },
      ],
    });
    expect(g.node.label).toEqual(['One', 'n2']);
    expect(g.node.value).toEqual([4, NaN]);
    expect(g.node.color).toEqual(['#f00', null]);
    expect(g.link.value).toEqual([3]);
    // Every edge of the mixed graph is undirected.
    expect(g.directed).toBe(false);
    expect(
      fromNodeLink({ options: { type: 'directed' }, nodes: [{ key: 'a' }], edges: [] }).directed,
    ).toBe(true);
  });

  it('reads Cytoscape elements: grouped, flat, with compound parents and positions', () => {
    const grouped = fromNodeLink({
      elements: {
        nodes: [
          { data: { id: 'p', name: 'Parent' } },
          { data: { id: 'a', parent: 'p' }, position: { x: 10, y: 20 } },
          { data: { id: 'b', label: 'B', weight: 2 } },
        ],
        edges: [{ data: { id: 'ab', source: 'a', target: 'b', weight: 7 } }],
      },
    });
    expect(grouped.node.label).toEqual(['a', 'B']);
    expect(grouped.node.group).toEqual(['Parent', null]);
    expect(grouped.node.x).toEqual([10, NaN]);
    // Cytoscape's y points down.
    expect(grouped.node.y).toEqual([-20, NaN]);
    expect(grouped.link).toEqual({ source: [0], target: [1], value: [7] });

    const flat = fromNodeLink([
      { group: 'nodes', data: { id: 'a' } },
      { data: { id: 'b' } },
      { data: { id: 'e', source: 'a', target: 'b' } },
    ]);
    expect(flat.node.label).toEqual(['a', 'b']);
    expect(flat.link).toEqual({ source: [0], target: [1] });
    expect(fromNodeLink({ elements: flat ? [{ data: { id: 'z' } }] : [] }).node.label).toEqual([
      'z',
    ]);
  });

  it('throws for anything that is not node-link data', () => {
    expect(() => fromNodeLink('graph')).toThrow(TypeError);
    expect(() => fromNodeLink({ nodes: [] })).toThrow(/links/);
  });
});

describe('fromDot', () => {
  it('reads a digraph with chains, attributes and defaults', () => {
    const g = fromDot(`
      // a pipeline
      digraph pipeline {
        rankdir = LR;
        node [shape=box, color="#888"];
        edge [color=gray]
        extract -> transform -> load [weight=2, label="rows"];
        extract [label="Extract\\nraw", fillcolor=tomato];
        audit; /* not linked */
        load -> audit [style=dashed, penwidth=3]
      }
    `);
    expect(g.directed).toBe(true);
    expect(g.node.label).toEqual(['Extract\\nraw', 'transform', 'load', 'audit']);
    expect(g.node.color).toEqual(['tomato', '#888', '#888', '#888']);
    expect(g.link.source).toEqual([0, 1, 2]);
    expect(g.link.target).toEqual([1, 2, 3]);
    expect(g.link.value).toEqual([2, 2, 3]);
    expect(g.link.label).toEqual(['rows', 'rows', null]);
    expect(g.link.color).toEqual(['gray', 'gray', 'gray']);
    expect(g.link.customdata?.[2]).toEqual({ color: 'gray', style: 'dashed', penwidth: '3' });
  });

  it('reads an undirected strict graph, quoted ids, ports and node sets', () => {
    const g = fromDot(`strict graph "my graph" {
      "node one":out:e -- b;
      {b c} -- d
      -1.5 -- "con" + "cat"
    }`);
    expect(g.directed).toBe(false);
    expect(g.node.label).toEqual(['node one', 'b', 'c', 'd', '-1.5', 'concat']);
    expect(g.link.source).toEqual([0, 1, 2, 4]);
    expect(g.link.target).toEqual([1, 3, 3, 5]);
  });

  it('turns clusters into groups, named by their label wherever it is', () => {
    const g = fromDot(`digraph {
      subgraph cluster_ingest { a; b; label = "Ingest" }
      subgraph cluster_1 { graph [label="Serve"]; c -> d }
      subgraph cluster_plain { e }
      subgraph notacluster { f }
      a -> c; e -> f
      subgraph cluster_late { a }
    }`);
    expect(g.node.label).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    // A node keeps the first cluster that names it.
    expect(g.node.group).toEqual(['Ingest', 'Ingest', 'Serve', 'Serve', 'cluster_plain', null]);
    expect(g.link.source).toEqual([2, 0, 4]);
  });

  it('applies defaults only from where they are set, and scopes them to their subgraph', () => {
    const g = fromDot(`digraph {
      first;
      node [color=red];
      second;
      { node [color=blue]; third }
      fourth;
    }`);
    expect(g.node.color).toEqual([null, 'red', 'blue', 'red']);
  });

  it('reads positions, HTML labels and `#` lines', () => {
    const g = fromDot(`# preprocessed
graph {
  a [pos="10,20!", label=<<b>bold</b>>];
  b [pos="1.5,-2"]
}`);
    expect(g.node.x).toEqual([10, 1.5]);
    expect(g.node.y).toEqual([20, -2]);
    expect(g.node.label).toEqual(['<b>bold</b>', 'b']);
    expect(g.link.source).toEqual([]);
  });

  it('names the offset of a syntax error', () => {
    expect(() => fromDot('flowchart { a -> b }')).toThrow(/expected 'graph' or 'digraph'/);
    expect(() => fromDot('digraph { a -> }')).toThrow(SyntaxError);
    expect(() => fromDot('digraph { a [color=red }')).toThrow(/offset/);
    expect(() => fromDot('digraph { a ? b }')).toThrow(/unexpected '\?'/);
    expect(() => fromDot('digraph { a -> b')).toThrow(/expected '}'/);
  });
});

describe('degrees', () => {
  it('counts links in and out, a self-link twice', () => {
    const g = fromEdgeList([
      ['a', 'b', 2],
      ['a', 'c', 3],
      ['c', 'c', 4],
    ]);
    const d = degrees(g);
    expect([...d.outdegree]).toEqual([2, 0, 1]);
    expect([...d.indegree]).toEqual([0, 1, 2]);
    expect([...d.degree]).toEqual([2, 1, 3]);
    expect([...degrees(g, { weighted: true }).degree]).toEqual([5, 2, 11]);
  });

  it('skips links to nodes that do not exist and takes a node count', () => {
    const d = degrees({ link: { source: [0, 5, -1], target: [1, 0, 0] } }, { nodes: 3 });
    expect([...d.degree]).toEqual([1, 1, 0]);
    // Without labels or a count, the largest index decides.
    expect(degrees({ link: { source: [0], target: [4] } }).degree).toHaveLength(5);
  });
});

describe('connectedComponents', () => {
  it('numbers components by their first node and counts their sizes', () => {
    const g = fromEdgeList(
      [
        ['a', 'b'],
        ['c', 'd'],
        ['d', 'e'],
        ['b', 'f'],
      ],
      { nodes: [{ id: 'a' }, { id: 'lonely' }] },
    );
    // Nodes: a, lonely, b, c, d, e, f.
    const c = connectedComponents(g);
    expect([...c.component]).toEqual([0, 1, 0, 2, 2, 2, 0]);
    expect(c.count).toBe(3);
    expect([...c.sizes]).toEqual([3, 1, 3]);
  });

  it('handles an empty graph', () => {
    expect(connectedComponents({ link: { source: [], target: [] } }).count).toBe(0);
  });
});

describe('louvain', () => {
  it('finds the two cliques of a barbell', () => {
    const g = barbell(5);
    const c = louvain(g);
    expect([...c]).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
    expect(modularity(g, c)).toBeGreaterThan(0.4);
    expect(modularity(g, new Int32Array(10))).toBeCloseTo(0, 12);
  });

  it('finds the rings of cliques that need the aggregation step', () => {
    // Eight triangles in a ring: single moves give triangles, aggregation may merge pairs.
    const edges: [number, number][] = [];
    for (let t = 0; t < 8; t++) {
      const o = t * 3;
      edges.push([o, o + 1], [o + 1, o + 2], [o, o + 2], [o + 2, ((t + 1) % 8) * 3]);
    }
    const g = fromEdgeList(edges, { directed: false });
    const c = louvain(g);
    // Every triangle stays whole.
    for (let t = 0; t < 8; t++) {
      expect(c[t * 3 + 1]).toBe(c[t * 3]);
      expect(c[t * 3 + 2]).toBe(c[t * 3]);
    }
    const count = new Set(c).size;
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(8);
    // No single-node move improves on what it returns.
    const q = modularity(g, c);
    for (let i = 0; i < c.length; i++) {
      for (const other of new Set(c)) {
        const moved = Int32Array.from(c);
        moved[i] = other;
        expect(modularity(g, moved)).toBeLessThanOrEqual(q + 1e-12);
      }
    }
  });

  it('weights links by value', () => {
    // A path a–b–c–d: the heavy middle link pulls b and c together.
    const g: GraphData = {
      node: { label: ['a', 'b', 'c', 'd'] },
      link: { source: [0, 1, 2], target: [1, 2, 3], value: [1, 10, 1] },
      directed: false,
    };
    const c = louvain(g);
    expect(c[1]).toBe(c[2]);
  });

  it('gives more communities at a higher resolution', () => {
    const g = barbell(4);
    expect(new Set(louvain(g, { resolution: 0.01 })).size).toBe(1);
    expect(new Set(louvain(g, { resolution: 1 })).size).toBe(2);
  });

  it('is deterministic and handles graphs without links, self-links and isolated nodes', () => {
    const g = barbell(6);
    expect(louvain(g)).toEqual(louvain(g));
    expect([...louvain({ link: { source: [], target: [] } }, { nodes: 3 })]).toEqual([0, 1, 2]);
    // A self-link adds to its node's degree: two nodes that each have one stay apart, where a
    // node with one and a plain neighbour join.
    const apart = { link: { source: [0, 1, 0], target: [0, 1, 1] } };
    expect([...louvain(apart, { nodes: 3 })]).toEqual([0, 1, 2]);
    const joined = { link: { source: [0, 0], target: [0, 1] } };
    expect([...louvain(joined, { nodes: 3 })]).toEqual([0, 0, 1]);
    expect(modularity({ link: { source: [], target: [] } }, [0, 0], { nodes: 2 })).toBe(0);
  });

  it('agrees with the definition of modularity on a known partition', () => {
    // Two triangles joined by one link, split into the triangles: Q = 2·(6/14 − (7/14)²) = 5/14.
    const g = barbell(3);
    expect(modularity(g, [0, 0, 0, 1, 1, 1])).toBeCloseTo(5 / 14, 12);
  });
});

describe('adjacencyMatrix', () => {
  const g: GraphData = {
    node: { label: ['a', 'b', 'c', 'd'], group: ['x', 'y', 'x', 'y'] },
    link: { source: [0, 0, 1, 3], target: [2, 2, 3, 3], value: [1, 2, 5, 1] },
    directed: true,
  };

  it('sums parallel links, in input order', () => {
    const m = adjacencyMatrix(g, { order: 'input' });
    expect(m.x).toEqual(['a', 'b', 'c', 'd']);
    expect(m.y).toEqual(m.x);
    expect(m.z).toEqual([
      [0, 0, 3, 0],
      [0, 0, 0, 5],
      [0, 0, 0, 0],
      [0, 0, 0, 1],
    ]);
  });

  it('orders by degree, by group and by a given list', () => {
    // Weighted degrees: a 3, b 5, c 3, d 7.
    expect(adjacencyMatrix(g, { order: 'degree' }).order).toEqual([3, 1, 0, 2]);
    expect(adjacencyMatrix(g, { order: 'group' }).order).toEqual([0, 2, 3, 1]);
    const m = adjacencyMatrix(g, { order: [2, 0, 2, 9] });
    expect(m.order).toEqual([2, 0]);
    expect(m.z).toEqual([
      [0, 0],
      [3, 0],
    ]);
  });

  it('orders by community by default, the largest first, and mirrors undirected graphs', () => {
    // A triangle (0–2) and a clique of five (3–7), joined by one link.
    const edges: [number, number][] = [
      [0, 1],
      [1, 2],
      [0, 2],
      [2, 3],
    ];
    for (let i = 3; i < 8; i++) for (let j = i + 1; j < 8; j++) edges.push([i, j]);
    const m = adjacencyMatrix(fromEdgeList(edges, { directed: false }));
    // The larger community leads, its best-connected node first.
    expect(m.order).toEqual([3, 4, 5, 6, 7, 2, 0, 1]);
    for (let r = 0; r < m.z.length; r++) {
      for (let c = 0; c < m.z.length; c++) expect(m.z[r]?.[c]).toBe(m.z[c]?.[r]);
    }
  });
});
