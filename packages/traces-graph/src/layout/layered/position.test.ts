import { describe, expect, it } from 'vitest';
import { separateClusters } from './clusters.ts';
import { buildLayers, REAL, type LayerGraph } from './layers.ts';
import { orderLayers } from './order.ts';
import { packShelves } from './pack.ts';
import { assignCross } from './position.ts';
import { longestPathRanks } from './rank.ts';
import { ends, randomDagLinks, seeded, type LinkList } from './testing.ts';

const EPS = 1e-9;

function layered(rank: readonly number[], links: LinkList, group?: readonly number[]): LayerGraph {
  const { source, target } = ends(links);
  const g = buildLayers({
    nodes: rank.length,
    rank: Int32Array.from(rank),
    edgeTail: source,
    edgeHead: target,
    group: group ? Int32Array.from(group) : undefined,
    groups: group ? Math.max(-1, ...group) + 1 : 0,
  });
  orderLayers(g, 24);
  return g;
}

interface Sizes {
  readonly before: Float64Array;
  readonly after: Float64Array;
  readonly gap: Float64Array;
}

/** Extents (real nodes `half(v)` wide to either side, dummies 0) and the gaps they ask for. */
function sizes(
  g: LayerGraph,
  half: (v: number) => number,
  nodesep = 30,
  edgesep = 12,
  padding = 0,
): Sizes {
  const before = new Float64Array(g.count);
  const after = new Float64Array(g.count);
  for (let v = 0; v < g.real; v++) before[v] = after[v] = half(v);
  const gap = new Float64Array(g.count);
  for (const layer of g.layers) {
    for (let i = 1; i < layer.length; i++) {
      const a = layer[i - 1]!;
      const b = layer[i]!;
      let free =
        ((g.kind[a] === REAL ? nodesep : edgesep) + (g.kind[b] === REAL ? nodesep : edgesep)) / 2;
      if (g.group[a] !== g.group[b]) {
        free += (g.group[a]! >= 0 ? padding : 0) + (g.group[b]! >= 0 ? padding : 0);
      }
      gap[b] = after[a]! + free + before[b]!;
    }
  }
  return { before, after, gap };
}

/** The least `x[b] − x[a] − gap[b]` over the neighbours of every layer: ≥ 0 when none overlap. */
function slack(g: LayerGraph, x: Float64Array, gap: Float64Array): number {
  let least = Infinity;
  for (const layer of g.layers) {
    for (let i = 1; i < layer.length; i++) {
      least = Math.min(least, x[layer[i]!]! - x[layer[i - 1]!]! - gap[layer[i]!]!);
    }
  }
  return least;
}

describe('layered layout: coordinates across the layers', () => {
  it('puts a chain in one line', () => {
    const g = layered(
      [0, 1, 2, 3],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    );
    const { before, after, gap } = sizes(g, (v) => 10 + 5 * v);
    const x = assignCross(g, gap, before, after);
    expect(new Set(x).size).toBe(1);
  });

  it('centers a parent over its children and children under their parent', () => {
    const g = layered(
      [0, 1, 1, 2, 2, 2, 2],
      [
        [0, 1],
        [0, 2],
        [1, 3],
        [1, 4],
        [2, 5],
        [2, 6],
      ],
    );
    const { before, after, gap } = sizes(g, () => 20);
    const x = assignCross(g, gap, before, after);
    expect(slack(g, x, gap)).toBeGreaterThanOrEqual(-EPS);
    expect(x[0]).toBeCloseTo((x[1]! + x[2]!) / 2, 9);
    expect(x[1]).toBeCloseTo((x[3]! + x[4]!) / 2, 9);
    expect(x[2]).toBeCloseTo((x[5]! + x[6]!) / 2, 9);
    // The leaves are as close as their sizes allow: 40 wide, 30 apart.
    const leaves = [x[3]!, x[4]!, x[5]!, x[6]!].sort((a, b) => a - b);
    expect(leaves[3]! - leaves[0]!).toBeCloseTo(3 * 70, 9);
  });

  it('keeps a long link straight next to a chain', () => {
    // 0 → 1 → 2 → 3 → 4 and 0 → 4: the three dummies of the long link share one coordinate.
    const g = layered(
      [0, 1, 2, 3, 4],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [0, 4],
      ],
    );
    const { before, after, gap } = sizes(g, () => 25);
    const x = assignCross(g, gap, before, after);
    expect(slack(g, x, gap)).toBeGreaterThanOrEqual(-EPS);
    expect(x[6]).toBe(x[5]);
    expect(x[7]).toBe(x[5]);
    expect(x[1]).toBe(x[2]);
    expect(x[2]).toBe(x[3]);
  });

  it('never puts two neighbours closer than their sizes and separations ask', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const nodes = 20 + 4 * seed;
      const list = randomDagLinks(nodes, 2 * nodes, seed, 6 + (seed % 9));
      const { source, target } = ends(list);
      const g = layered(Array.from(longestPathRanks(nodes, source, target)), list);
      const next = seeded(seed + 77);
      const half = Array.from({ length: nodes }, () => 4 + 60 * next());
      const { before, after, gap } = sizes(g, (v) => half[v]!, 10 + (seed % 30), seed % 13);
      const x = assignCross(g, gap, before, after);
      expect(x.every(Number.isFinite)).toBe(true);
      expect(slack(g, x, gap)).toBeGreaterThanOrEqual(-EPS);
      expect(assignCross(g, gap, before, after)).toEqual(x);
    }
  });

  it('handles a single layer, a single node and no node', () => {
    const row = layered([0, 0, 0], []);
    const { before, after, gap } = sizes(row, () => 10);
    const x = assignCross(row, gap, before, after);
    expect(slack(row, x, gap)).toBeCloseTo(0, 9);
    const one = layered([0], []);
    expect(
      Array.from(assignCross(one, new Float64Array(1), new Float64Array(1), new Float64Array(1))),
    ).toEqual([0]);
    const none = layered([], []);
    expect(
      assignCross(none, new Float64Array(0), new Float64Array(0), new Float64Array(0)),
    ).toHaveLength(0);
  });
});

describe('layered layout: cluster frames across the layers', () => {
  it('clears every frame of foreign nodes and of other frames, and keeps the gaps', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const nodes = 16 + 2 * seed;
      const list = randomDagLinks(nodes, Math.round(1.6 * nodes), seed, 7);
      const { source, target } = ends(list);
      const next = seeded(seed + 900);
      const group = Array.from({ length: nodes }, () => Math.floor(next() * 5) - 1);
      const g = layered(Array.from(longestPathRanks(nodes, source, target)), list, group);
      const padding = 8;
      const { before, after, gap } = sizes(g, () => 15, 30, 12, padding);
      const x = assignCross(g, gap, before, after);
      const frames = separateClusters(g, x, gap, before, after, padding, padding);
      expect(slack(g, x, gap)).toBeGreaterThanOrEqual(-EPS);

      const first = new Array<number>(g.groups).fill(Infinity);
      const last = new Array<number>(g.groups).fill(-Infinity);
      for (let v = 0; v < g.count; v++) {
        const k = g.group[v]!;
        if (k < 0) continue;
        first[k] = Math.min(first[k]!, g.rank[v]!);
        last[k] = Math.max(last[k]!, g.rank[v]!);
        // A frame holds its own nodes, with the padding.
        expect(x[v]! - before[v]! - padding).toBeGreaterThanOrEqual(frames.start[k]! - EPS);
        expect(x[v]! + after[v]! + padding).toBeLessThanOrEqual(frames.end[k]! + EPS);
      }
      for (let k = 0; k < g.groups; k++) {
        if (Number.isNaN(frames.start[k]!)) continue;
        for (let v = 0; v < g.count; v++) {
          // Any other node in the ranks the frame spans is outside it.
          if (g.group[v] === k || g.rank[v]! < first[k]! || g.rank[v]! > last[k]!) continue;
          const outside =
            x[v]! + after[v]! <= frames.start[k]! + EPS ||
            x[v]! - before[v]! >= frames.end[k]! - EPS;
          expect(outside).toBe(true);
        }
        for (let j = k + 1; j < g.groups; j++) {
          // Two frames that share a rank do not overlap.
          if (Number.isNaN(frames.start[j]!) || first[j]! > last[k]! || first[k]! > last[j]!) {
            continue;
          }
          const apart =
            frames.end[k]! <= frames.start[j]! + EPS || frames.end[j]! <= frames.start[k]! + EPS;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it('leaves the coordinates alone when no frame is in the way, and without groups', () => {
    // Two groups side by side under a common source.
    const g = layered(
      [0, 1, 1, 2, 2],
      [
        [0, 1],
        [0, 2],
        [1, 3],
        [2, 4],
      ],
      [-1, 0, 1, 0, 1],
    );
    const { before, after, gap } = sizes(g, () => 15, 30, 12, 8);
    const x = assignCross(g, gap, before, after);
    const kept = x.slice();
    const frames = separateClusters(g, x, gap, before, after, 8, 8);
    expect(x).toEqual(kept);
    expect(frames.end[0]! - frames.start[0]!).toBeCloseTo(2 * (15 + 8), 9);
    const plain = layered([0, 1], [[0, 1]]);
    const none = separateClusters(
      plain,
      new Float64Array(2),
      new Float64Array(2),
      new Float64Array(2),
      new Float64Array(2),
      8,
      8,
    );
    expect(none.start).toHaveLength(0);
  });
});

describe('layered layout: packing', () => {
  it('puts boxes on shelves without overlap, in the order given', () => {
    const widths = Float64Array.of(300, 100, 100, 100, 50, 50);
    const heights = Float64Array.of(200, 80, 60, 40, 20, 20);
    const p = packShelves(widths, heights, 10, 1.5);
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        const apartAcross =
          p.across[i]! + widths[i]! + 10 <= p.across[j]! + EPS ||
          p.across[j]! + widths[j]! + 10 <= p.across[i]! + EPS;
        const apartAlong =
          p.along[i]! + heights[i]! + 10 <= p.along[j]! + EPS ||
          p.along[j]! + heights[j]! + 10 <= p.along[i]! + EPS;
        expect(apartAcross || apartAlong).toBe(true);
      }
      expect(p.across[i]! + widths[i]!).toBeLessThanOrEqual(p.width + EPS);
      expect(p.along[i]! + heights[i]!).toBeLessThanOrEqual(p.height + EPS);
    }
    expect(p.across[0]).toBe(0);
    expect(p.along[0]).toBe(0);
    // More than one shelf, and never narrower than the widest box.
    expect(Math.max(...p.along)).toBeGreaterThan(0);
    expect(p.width).toBeGreaterThanOrEqual(300);
    expect(packShelves(new Float64Array(0), new Float64Array(0), 10, 1).width).toBe(0);
  });
});
