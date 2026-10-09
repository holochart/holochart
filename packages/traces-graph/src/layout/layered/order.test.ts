import { describe, expect, it } from 'vitest';
import { buildLayers, DUMMY, SPACER, type LayerGraph } from './layers.ts';
import { countCrossings, orderLayers } from './order.ts';
import { longestPathRanks } from './rank.ts';
import { ends, randomDagLinks, seeded, type LinkList } from './testing.ts';

/** A layered graph from ranks and links (tail in the earlier rank). */
function layered(rank: readonly number[], links: LinkList, group?: readonly number[]): LayerGraph {
  const { source, target } = ends(links);
  return buildLayers({
    nodes: rank.length,
    rank: Int32Array.from(rank),
    edgeTail: source,
    edgeHead: target,
    group: group ? Int32Array.from(group) : undefined,
    groups: group ? Math.max(-1, ...group) + 1 : 0,
  });
}

/** A layered graph of a random acyclic link list, ranked by longest path. */
function randomLayered(nodes: number, links: number, seed: number, window = nodes): LayerGraph {
  const list = randomDagLinks(nodes, links, seed, window);
  const { source, target } = ends(list);
  return layered(Array.from(longestPathRanks(nodes, source, target)), list);
}

/** Crossings counted pair by pair. */
function naiveCrossings(g: LayerGraph): number {
  let count = 0;
  for (let a = 0; a < g.segments; a++) {
    for (let b = a + 1; b < g.segments; b++) {
      if (g.rank[g.segTop[a]!] !== g.rank[g.segTop[b]!]) continue;
      const top = g.pos[g.segTop[a]!]! - g.pos[g.segTop[b]!]!;
      const bottom = g.pos[g.segBot[a]!]! - g.pos[g.segBot[b]!]!;
      if (top * bottom < 0) count++;
    }
  }
  return count;
}

/** Sets the order of a layer. */
function setLayer(g: LayerGraph, r: number, order: readonly number[]): void {
  order.forEach((v, i) => {
    g.layers[r]![i] = v;
    g.pos[v] = i;
  });
}

/** The fewest crossings over every order of every layer (tiny graphs only). */
function bruteForce(g: LayerGraph): number {
  let best = Infinity;
  const permute = (r: number): void => {
    if (r === g.ranks) {
      best = Math.min(best, naiveCrossings(g));
      return;
    }
    const nodes = Array.from(g.layers[r]!);
    const visit = (prefix: number[], rest: number[]): void => {
      if (rest.length === 0) {
        setLayer(g, r, prefix);
        permute(r + 1);
        return;
      }
      for (let i = 0; i < rest.length; i++) {
        visit([...prefix, rest[i]!], [...rest.slice(0, i), ...rest.slice(i + 1)]);
      }
    };
    visit([], nodes);
  };
  permute(0);
  return best;
}

describe('layered layout: layers', () => {
  it('cuts a long link into segments through dummies', () => {
    const g = layered(
      [0, 1, 2, 3],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [0, 3],
      ],
    );
    expect(g.count).toBe(6);
    expect(g.real).toBe(4);
    expect(Array.from(g.kind)).toEqual([0, 0, 0, 0, DUMMY, DUMMY]);
    expect(Array.from(g.rank)).toEqual([0, 1, 2, 3, 1, 2]);
    expect(g.segments).toBe(6);
    expect(g.edgeSeg[3]).toBe(3);
    expect(g.edgeDummy[3]).toBe(4);
    expect([g.segTop[3], g.segBot[3], g.segTop[4], g.segBot[4], g.segTop[5], g.segBot[5]]).toEqual([
      0, 4, 4, 5, 5, 3,
    ]);
    expect(g.layers.map((l) => Array.from(l))).toEqual([[0], [1, 4], [2, 5], [3]]);
  });

  it('gives a group a spacer in every rank it spans without a node', () => {
    // Group 0 has nodes in ranks 0 and 3 only, tied by a path through foreign nodes.
    const g = layered(
      [0, 1, 2, 3],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      [0, -1, -1, 0],
    );
    expect(g.count).toBe(6);
    expect(Array.from(g.kind.subarray(4))).toEqual([SPACER, SPACER]);
    expect(Array.from(g.group)).toEqual([0, -1, -1, 0, 0, 0]);
    expect(Array.from(g.rank.subarray(4))).toEqual([1, 2]);
    // Three virtual segments: 0 → spacer → spacer → 3.
    expect(Array.from(g.segVirtual)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(Array.from(g.segTop.subarray(3))).toEqual([0, 4, 5]);
    expect(Array.from(g.segBot.subarray(3))).toEqual([4, 5, 3]);
  });

  it("puts the dummies of a group's own long link into the group", () => {
    const g = layered(
      [0, 1, 2],
      [
        [0, 1],
        [1, 2],
        [0, 2],
      ],
      [0, -1, 0],
    );
    expect(g.count).toBe(4);
    expect(g.kind[3]).toBe(DUMMY);
    expect(g.group[3]).toBe(0);
    expect(g.segVirtual.some((v) => v === 1)).toBe(false);
  });
});

describe('layered layout: crossing reduction', () => {
  it('counts crossings as a pair-by-pair count does', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = randomLayered(30, 70, seed, 10);
      expect(countCrossings(g)).toBe(naiveCrossings(g));
      orderLayers(g, 4);
      expect(countCrossings(g)).toBe(naiveCrossings(g));
    }
  });

  it('draws a tree without crossings', () => {
    // A binary tree given with its children in an awkward node order.
    const g = layered(
      [0, 1, 1, 2, 2, 2, 2],
      [
        [0, 2],
        [0, 1],
        [2, 3],
        [1, 4],
        [2, 5],
        [1, 6],
      ],
    );
    expect(orderLayers(g, 24)).toBe(0);
    expect(naiveCrossings(g)).toBe(0);
  });

  it('untangles a graph that has a drawing without crossings', () => {
    // Two layers of five, node i tied to node 9 − i and to its neighbour: a ladder turned over.
    const links: [number, number][] = [];
    for (let i = 0; i < 5; i++) {
      links.push([i, 9 - i]);
      if (i < 4) links.push([i, 8 - i]);
    }
    const g = layered([0, 0, 0, 0, 0, 1, 1, 1, 1, 1], links);
    // Scrambled start: sorting the lower layer by barycenter turns it over.
    expect(orderLayers(g, 24)).toBe(0);
    // A grid three wide and four deep, ranked by depth, with the links listed in a random order.
    const next = seeded(11);
    const grid: [number, number][] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        grid.push([row * 3 + col, (row + 1) * 3 + col]);
        if (col < 2) grid.push([row * 3 + col, (row + 1) * 3 + col + 1]);
      }
    }
    grid.sort(() => next() - 0.5);
    const rank = Array.from({ length: 12 }, (_, v) => Math.floor(v / 3));
    expect(orderLayers(layered(rank, grid), 24)).toBe(0);
  });

  it('reaches the known minimum of complete two-layer graphs', () => {
    const complete = (a: number, b: number): LayerGraph => {
      const links: [number, number][] = [];
      for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) links.push([i, a + j]);
      const rank = Array.from({ length: a + b }, (_, v) => (v < a ? 0 : 1));
      return layered(rank, links);
    };
    // Every order of K(m, n) in two layers has C(m, 2) × C(n, 2) crossings.
    expect(orderLayers(complete(2, 2), 24)).toBe(1);
    expect(orderLayers(complete(3, 3), 24)).toBe(9);
    // K(3, 3) less one link: 6 at best.
    const g = complete(3, 3);
    const less = layered(
      Array.from(g.rank.subarray(0, 6)),
      Array.from({ length: 8 }, (_, e) => [g.edgeTail[e]!, g.edgeHead[e]!] as [number, number]),
    );
    expect(orderLayers(less, 24)).toBe(bruteForce(less));
  });

  it('is at or close to the optimum on small random graphs and never worse than the start', () => {
    let total = 0;
    let optimum = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const next = seeded(seed);
      // Three layers of three or four nodes, random links between neighbouring layers.
      const sizes = [3 + (seed % 2), 4, 3 + ((seed >> 1) % 2)];
      const rank: number[] = [];
      sizes.forEach((size, r) => {
        for (let i = 0; i < size; i++) rank.push(r);
      });
      const links: [number, number][] = [];
      let offset = 0;
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < sizes[r]!; i++) {
          for (let j = 0; j < sizes[r + 1]!; j++) {
            if (next() < 0.4) links.push([offset + i, offset + sizes[r]! + j]);
          }
        }
        offset += sizes[r]!;
      }
      const start = orderLayers(layered(rank, links), 0);
      const g = layered(rank, links);
      const found = orderLayers(g, 24);
      expect(found).toBe(naiveCrossings(g));
      expect(found).toBeLessThanOrEqual(start);
      const least = bruteForce(layered(rank, links));
      expect(found).toBeLessThanOrEqual(least + 2);
      total += found;
      optimum += least;
    }
    // Over the whole set the heuristic stays within a few crossings of the optimum.
    expect(total).toBeLessThanOrEqual(optimum + 6);
  });

  it('keeps the best order of larger random graphs and is the same on every run', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const start = orderLayers(randomLayered(120, 260, seed, 15), 0);
      const a = randomLayered(120, 260, seed, 15);
      const b = randomLayered(120, 260, seed, 15);
      const found = orderLayers(a, 24);
      expect(found).toBeLessThan(start);
      expect(orderLayers(b, 24)).toBe(found);
      expect(a.layers).toEqual(b.layers);
      // Every layer is a permutation of its nodes and `pos` agrees with it.
      for (const layer of a.layers) layer.forEach((v, i) => expect(a.pos[v]).toBe(i));
    }
  });

  it('keeps each group together and all groups the same way round in every layer', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const nodes = 30;
      const list = randomDagLinks(nodes, 55, seed, 8);
      const { source, target } = ends(list);
      const next = seeded(seed + 500);
      const group = Array.from({ length: nodes }, () => Math.floor(next() * 5) - 1);
      const g = layered(Array.from(longestPathRanks(nodes, source, target)), list, group);
      orderLayers(g, 24);
      const before = new Map<string, boolean>();
      for (const layer of g.layers) {
        const seen: number[] = [];
        let last = -2;
        for (const v of layer) {
          const k = g.group[v]!;
          if (k !== last && k >= 0) {
            // A group that comes back after another node was between its nodes is split.
            expect(seen).not.toContain(k);
            for (const earlier of seen) {
              expect(before.get(`${k},${earlier}`)).toBeUndefined();
              before.set(`${earlier},${k}`, true);
            }
            seen.push(k);
          }
          last = k;
        }
      }
      // A group is in every rank between its first and its last.
      for (let k = 0; k < g.groups; k++) {
        const ranks = new Set<number>();
        for (let v = 0; v < g.count; v++) if (g.group[v] === k) ranks.add(g.rank[v]!);
        if (ranks.size > 0) expect(Math.max(...ranks) - Math.min(...ranks) + 1).toBe(ranks.size);
      }
    }
  });
});
