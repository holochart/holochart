import { describe, expect, it } from 'vitest';
import {
  buildAdjacency,
  neighborCounts,
  neighborhood,
  shortestPath,
  type Adjacency,
} from './neighbors.ts';

function graphOf(nodes: number, links: readonly (readonly [number, number])[]): Adjacency {
  return buildAdjacency(
    nodes,
    Int32Array.from(links, (l) => l[0]),
    Int32Array.from(links, (l) => l[1]),
  );
}

const flags = (mask: Uint8Array): number[] => {
  const out: number[] = [];
  mask.forEach((v, i) => v === 1 && out.push(i));
  return out;
};

/**
 * A chain 0 → 1 → 2 → 3 → 4 with a branch 1 → 5 and a link back 6 → 2:
 * link 0: 0 → 1, 1: 1 → 2, 2: 2 → 3, 3: 3 → 4, 4: 1 → 5, 5: 6 → 2.
 */
const CHAIN = graphOf(7, [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [1, 5],
  [6, 2],
]);

describe('adjacency', () => {
  it('lists the links that leave and that end at every node, in link order', () => {
    const a = graphOf(3, [
      [0, 1],
      [2, 1],
      [0, 2],
      [1, 1],
    ]);
    const row = (start: Uint32Array, values: Int32Array, i: number): number[] =>
      Array.from(values.subarray(start[i]!, start[i + 1]!));
    expect(row(a.outStart, a.outNode, 0)).toEqual([1, 2]);
    expect(row(a.outStart, a.outLink, 0)).toEqual([0, 2]);
    expect(row(a.outStart, a.outNode, 1)).toEqual([1]);
    expect(row(a.inStart, a.inNode, 1)).toEqual([0, 2, 1]);
    expect(row(a.inStart, a.inLink, 1)).toEqual([0, 1, 3]);
    expect(row(a.inStart, a.inNode, 0)).toEqual([]);
    expect(a.nodes).toBe(3);
    expect(a.links).toBe(4);
  });

  it('counts the nodes a node is linked to, once each and not itself', () => {
    const a = graphOf(4, [
      [0, 1],
      [0, 1],
      [1, 0],
      [0, 0],
      [2, 0],
    ]);
    expect(Array.from(neighborCounts(a))).toEqual([2, 1, 1, 0]);
  });
});

describe('neighbourhood', () => {
  it('one hop is the node, its links and its neighbours', () => {
    const n = neighborhood(CHAIN, [2], 1);
    expect(flags(n.node)).toEqual([1, 2, 3, 6]);
    expect(flags(n.link)).toEqual([1, 2, 5]);
  });

  it('no hops is the node alone', () => {
    const n = neighborhood(CHAIN, [2], 0);
    expect(flags(n.node)).toEqual([2]);
    expect(flags(n.link)).toEqual([]);
  });

  it('two hops reach the neighbours of the neighbours', () => {
    const n = neighborhood(CHAIN, [2], 2);
    expect(flags(n.node)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(flags(n.link)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('leaves out the links between two nodes at the last hop', () => {
    // A triangle 0, 1, 2: from 0, the link 1 – 2 joins two neighbours.
    const triangle = graphOf(3, [
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
    const one = neighborhood(triangle, [0], 1);
    expect(flags(one.node)).toEqual([0, 1, 2]);
    expect(flags(one.link)).toEqual([0, 1]);
    expect(flags(neighborhood(triangle, [0], 2).link)).toEqual([0, 1, 2]);
  });

  it('follows links one way only when told to', () => {
    const out = neighborhood(CHAIN, [1], 2, 'out');
    expect(flags(out.node)).toEqual([1, 2, 3, 5]);
    expect(flags(out.link)).toEqual([1, 2, 4]);
    const into = neighborhood(CHAIN, [2], 2, 'in');
    expect(flags(into.node)).toEqual([0, 1, 2, 6]);
    expect(flags(into.link)).toEqual([0, 1, 5]);
    // Everything a node leads to, and everything that leads to it.
    expect(flags(neighborhood(CHAIN, [1], Infinity, 'out').node)).toEqual([1, 2, 3, 4, 5]);
    expect(flags(neighborhood(CHAIN, [4], Infinity, 'in').node)).toEqual([0, 1, 2, 3, 4, 6]);
  });

  it('includes a loop of the node and every parallel link', () => {
    const a = graphOf(2, [
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    const n = neighborhood(a, [0], 1);
    expect(flags(n.node)).toEqual([0, 1]);
    expect(flags(n.link)).toEqual([0, 1, 2]);
  });

  it('does not pass through nodes and links that are not there', () => {
    const hiddenNodes = Uint8Array.from([0, 0, 0, 1, 0, 0, 0]);
    const n = neighborhood(CHAIN, [2], 3, 'both', { hiddenNodes });
    expect(flags(n.node)).toEqual([0, 1, 2, 5, 6]);
    expect(n.link[2]).toBe(0);
    const hiddenLinks = Uint8Array.from([0, 1, 0, 0, 0, 0]);
    expect(flags(neighborhood(CHAIN, [2], 1, 'both', { hiddenLinks }).node)).toEqual([2, 3, 6]);
    // A seed that is not there is no seed.
    expect(flags(neighborhood(CHAIN, [3], 2, 'both', { hiddenNodes }).node)).toEqual([]);
  });

  it('takes several seeds, and ignores those that are no nodes', () => {
    const n = neighborhood(CHAIN, [0, 4, 99, -1], 1);
    expect(flags(n.node)).toEqual([0, 1, 3, 4]);
    expect(flags(n.link)).toEqual([0, 3]);
  });
});

describe('shortest path', () => {
  it('has the fewest links, either way along them', () => {
    expect(shortestPath(CHAIN, 0, 4)).toEqual({
      nodes: [0, 1, 2, 3, 4],
      links: [0, 1, 2, 3],
      length: 4,
    });
    expect(shortestPath(CHAIN, 4, 0)).toEqual({
      nodes: [4, 3, 2, 1, 0],
      links: [3, 2, 1, 0],
      length: 4,
    });
    expect(shortestPath(CHAIN, 5, 6)).toEqual({ nodes: [5, 1, 2, 6], links: [4, 1, 5], length: 3 });
  });

  it('from a node to itself is the node', () => {
    expect(shortestPath(CHAIN, 3, 3)).toEqual({ nodes: [3], links: [], length: 0 });
  });

  it('follows the direction of the links when directed', () => {
    expect(shortestPath(CHAIN, 0, 4, { directed: true })?.nodes).toEqual([0, 1, 2, 3, 4]);
    expect(shortestPath(CHAIN, 4, 0, { directed: true })).toBeUndefined();
    expect(shortestPath(CHAIN, 6, 4, { directed: true })?.links).toEqual([5, 2, 3]);
    expect(shortestPath(CHAIN, 5, 6, { directed: true })).toBeUndefined();
  });

  it('is undefined between parts that are not linked, and for ends that are no nodes', () => {
    const two = graphOf(4, [
      [0, 1],
      [2, 3],
    ]);
    expect(shortestPath(two, 0, 3)).toBeUndefined();
    expect(shortestPath(two, 0, 9)).toBeUndefined();
    expect(shortestPath(two, -1, 1)).toBeUndefined();
    expect(shortestPath(two, 0.5, 1)).toBeUndefined();
  });

  it('takes the first of several equally short paths: lowest link indices', () => {
    // A square 0 – 1 – 3 and 0 – 2 – 3.
    const square = graphOf(4, [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
    ]);
    expect(shortestPath(square, 0, 3)).toEqual({ nodes: [0, 1, 3], links: [0, 2], length: 2 });
    // And of two parallel links the first.
    const parallel = graphOf(2, [
      [1, 0],
      [0, 1],
    ]);
    expect(shortestPath(parallel, 0, 1)?.links).toEqual([1]);
    expect(shortestPath(parallel, 0, 1, { directed: true })?.links).toEqual([1]);
    expect(shortestPath(parallel, 1, 0, { directed: true })?.links).toEqual([0]);
  });

  it('with costs has the smallest sum, not the fewest links', () => {
    // 0 – 3 directly costs 10; 0 – 1 – 2 – 3 costs 3.
    const a = graphOf(4, [
      [0, 3],
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    const cost = [10, 1, 1, 1];
    expect(shortestPath(a, 0, 3)).toEqual({ nodes: [0, 3], links: [0], length: 1 });
    expect(shortestPath(a, 0, 3, { cost })).toEqual({
      nodes: [0, 1, 2, 3],
      links: [1, 2, 3],
      length: 3,
    });
    expect(shortestPath(a, 3, 0, { cost })?.links).toEqual([3, 2, 1]);
    // Directed, only the direct link leads back.
    expect(shortestPath(a, 3, 0, { cost, directed: true })).toBeUndefined();
    expect(shortestPath(a, 0, 3, { cost: [2.5, 1, 1, 1] })).toEqual({
      nodes: [0, 3],
      links: [0],
      length: 2.5,
    });
  });

  it('counts a cost that is not a positive number as 1', () => {
    const a = graphOf(3, [
      [0, 1],
      [1, 2],
    ]);
    expect(shortestPath(a, 0, 2, { cost: [NaN, -4] })?.length).toBe(2);
    expect(shortestPath(a, 0, 2, { cost: [0, Infinity] })?.length).toBe(2);
  });

  it('goes around nodes and links that are not there', () => {
    const square = graphOf(4, [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
    ]);
    const hiddenNodes = Uint8Array.from([0, 1, 0, 0]);
    expect(shortestPath(square, 0, 3, { hiddenNodes })?.nodes).toEqual([0, 2, 3]);
    expect(shortestPath(square, 0, 1, { hiddenNodes })).toBeUndefined();
    const hiddenLinks = Uint8Array.from([1, 0, 0, 0]);
    expect(shortestPath(square, 0, 1, { hiddenLinks })?.nodes).toEqual([0, 2, 3, 1]);
    expect(shortestPath(square, 0, 3, { hiddenLinks, cost: [1, 5, 1, 5] })?.length).toBe(10);
  });

  it('finds its way through a larger graph as a breadth-first search would', () => {
    // A grid of 30 × 30, linked right and down: the path between two corners has 58 links.
    const size = 30;
    const links: [number, number][] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        if (c + 1 < size) links.push([i, i + 1]);
        if (r + 1 < size) links.push([i, i + size]);
      }
    }
    const grid = graphOf(size * size, links);
    const path = shortestPath(grid, 0, size * size - 1, { directed: true })!;
    expect(path.length).toBe(2 * (size - 1));
    expect(path.nodes).toHaveLength(2 * (size - 1) + 1);
    // The same by weights of 1.
    const weighted = shortestPath(grid, 0, size * size - 1, {
      cost: new Float64Array(links.length).fill(1),
    })!;
    expect(weighted.length).toBe(path.length);
    for (let s = 0; s < path.links.length; s++) {
      const [a, b] = links[path.links[s]!]!;
      expect([a, b]).toEqual([path.nodes[s], path.nodes[s + 1]]);
    }
  });
});
