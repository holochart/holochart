import { describe, expect, it } from 'vitest';
import {
  assignRanks,
  longestPathRanks,
  networkSimplexRanks,
  rankLength,
  WORK_LIMIT,
  type RankStats,
} from './rank.ts';
import { ends, randomDagLinks, seeded, type LinkList } from './testing.ts';

const ones = (n: number): Float64Array => new Float64Array(n).fill(1);

/** Every link points at least one rank down. */
function feasible(tail: Int32Array, head: Int32Array, rank: Int32Array): boolean {
  for (let k = 0; k < tail.length; k++) if (rank[head[k]!]! - rank[tail[k]!]! < 1) return false;
  return true;
}

/** The least `Σ weight × length` over every ranking with ranks below `nodes` (small graphs only). */
function bruteForce(nodes: number, tail: Int32Array, head: Int32Array, weight: Float64Array) {
  const rank = new Int32Array(nodes);
  // The links whose later end (by index) is `v`: checked as soon as `v` has a rank.
  const closing: number[][] = Array.from({ length: nodes }, () => []);
  for (let k = 0; k < tail.length; k++) closing[Math.max(tail[k]!, head[k]!)]!.push(k);
  let best = Infinity;
  const visit = (v: number): void => {
    if (v === nodes) {
      best = Math.min(best, rankLength(tail, head, weight, rank));
      return;
    }
    for (let r = 0; r < nodes; r++) {
      rank[v] = r;
      if (closing[v]!.every((k) => rank[head[k]!]! - rank[tail[k]!]! >= 1)) visit(v + 1);
    }
  };
  visit(0);
  return best;
}

describe('layered layout: ranks', () => {
  // The example of Gansner et al. (figure 2-1): a → b → c → d → h, a → e → g → h, a → f → g.
  const PAPER: LinkList = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 7],
    [0, 4],
    [0, 5],
    [4, 6],
    [5, 6],
    [6, 7],
  ];

  it('longest path puts every node one past its latest predecessor', () => {
    const { source, target } = ends(PAPER);
    expect(Array.from(longestPathRanks(8, source, target))).toEqual([0, 1, 2, 3, 1, 1, 2, 4]);
    expect(Array.from(longestPathRanks(3, new Int32Array(0), new Int32Array(0)))).toEqual([
      0, 0, 0,
    ]);
  });

  it('network simplex reaches the optimum of the textbook example', () => {
    const { source, target } = ends(PAPER);
    const rank = networkSimplexRanks(8, source, target, ones(9));
    expect(feasible(source, target, rank)).toBe(true);
    expect(rankLength(source, target, ones(9), rank)).toBe(10);
    expect(rankLength(source, target, ones(9), rank)).toBe(bruteForce(8, source, target, ones(9)));
  });

  it('moves a late source next to its target', () => {
    // 0 → 1 → 2 → 3 and 4 → 3: longest path leaves 4 in rank 0, three ranks from its target.
    const { source, target } = ends([
      [0, 1],
      [1, 2],
      [2, 3],
      [4, 3],
    ]);
    expect(Array.from(longestPathRanks(5, source, target))).toEqual([0, 1, 2, 3, 0]);
    expect(Array.from(assignRanks(5, source, target, ones(4), 'tight-tree'))).toEqual([
      0, 1, 2, 3, 2,
    ]);
    expect(Array.from(assignRanks(5, source, target, ones(4), 'network-simplex'))).toEqual([
      0, 1, 2, 3, 2,
    ]);
    expect(Array.from(assignRanks(5, source, target, ones(4), 'longest-path'))).toEqual([
      0, 1, 2, 3, 0,
    ]);
  });

  it('exchanges tree links when the tight tree is not the optimum', () => {
    // 0 → 1 → 2 → 3 → 4 with three links from 5 into the chain and one out of it: the tight tree
    // hangs 5 on one link; the optimum weighs all four.
    const links: LinkList = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [0, 5],
      [5, 2],
      [5, 3],
      [5, 4],
      [0, 6],
      [6, 4],
      [6, 4],
      [6, 4],
    ];
    const { source, target } = ends(links);
    const weight = ones(links.length);
    const stats: RankStats = { exchanges: 0 };
    const rank = assignRanks(7, source, target, weight, 'network-simplex', stats);
    expect(feasible(source, target, rank)).toBe(true);
    expect(rankLength(source, target, weight, rank)).toBe(bruteForce(7, source, target, weight));
    expect(stats.exchanges).toBeGreaterThan(0);
    const tight = assignRanks(7, source, target, weight, 'tight-tree');
    expect(rankLength(source, target, weight, rank)).toBeLessThan(
      rankLength(source, target, weight, tight),
    );
  });

  it('is optimal on small random graphs, with and without weights', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const nodes = 4 + (seed % 3);
      const links = randomDagLinks(nodes, 3 + (seed % 7), seed);
      const { source, target } = ends(links);
      const next = seeded(seed + 1000);
      const weight =
        seed % 2 === 0 ? ones(links.length) : Float64Array.from(links, () => 0.25 + 3 * next());
      const rank = networkSimplexRanks(nodes, source, target, weight);
      expect(feasible(source, target, rank)).toBe(true);
      expect(rankLength(source, target, weight, rank)).toBeCloseTo(
        bruteForce(nodes, source, target, weight),
        9,
      );
    }
  });

  it('is never longer than the tight tree, which is never longer than the longest path', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const nodes = 60 + 20 * seed;
      const links = randomDagLinks(nodes, 2 * nodes, seed, 12);
      const { source, target } = ends(links);
      const weight = ones(links.length);
      const longest = assignRanks(nodes, source, target, weight, 'longest-path');
      const tight = assignRanks(nodes, source, target, weight, 'tight-tree');
      const simplex = assignRanks(nodes, source, target, weight, 'network-simplex');
      for (const rank of [longest, tight, simplex]) {
        expect(feasible(source, target, rank)).toBe(true);
        expect(Math.min(...rank)).toBe(0);
      }
      const length = (rank: Int32Array): number => rankLength(source, target, weight, rank);
      expect(length(tight)).toBeLessThanOrEqual(length(longest));
      expect(length(simplex)).toBeLessThanOrEqual(length(tight));
    }
  });

  it('ranks each connected part from 0 and leaves isolated nodes there', () => {
    // 0 → 1 → 2, 3 → 4, and 5 alone.
    const { source, target } = ends([
      [0, 1],
      [1, 2],
      [3, 4],
    ]);
    for (const ranker of ['longest-path', 'tight-tree', 'network-simplex'] as const) {
      expect(Array.from(assignRanks(6, source, target, ones(3), ranker))).toEqual([
        0, 1, 2, 0, 1, 0,
      ]);
    }
  });

  it('stops when its work limit is spent, with a feasible ranking between tight tree and optimum', () => {
    const links = randomDagLinks(300, 700, 3, 20);
    const { source, target } = ends(links);
    const weight = ones(links.length);
    const length = (rank: Int32Array): number => rankLength(source, target, weight, rank);
    const stats: RankStats = { exchanges: 0 };
    const limited = networkSimplexRanks(300, source, target, weight, true, 1, stats);
    expect(stats.exchanges).toBe(1);
    expect(feasible(source, target, limited)).toBe(true);
    const full = networkSimplexRanks(300, source, target, weight, true, WORK_LIMIT, stats);
    expect(stats.exchanges).toBeGreaterThan(1);
    expect(length(limited)).toBeGreaterThan(length(full));
    expect(length(limited)).toBeLessThanOrEqual(
      length(networkSimplexRanks(300, source, target, weight, false)),
    );
    expect(networkSimplexRanks(300, source, target, weight)).toEqual(
      networkSimplexRanks(300, source, target, weight),
    );
    expect(
      Array.from(networkSimplexRanks(0, new Int32Array(0), new Int32Array(0), ones(0))),
    ).toEqual([]);
  });
});
