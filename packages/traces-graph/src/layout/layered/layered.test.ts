import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutResult, LinkRoute } from '../types.ts';
import { layeredLayout } from './index.ts';
import { emptyStats, runLayered } from './layered.ts';
import { LAYERED_DEFAULTS, resolveLayeredOptions, type LayeredOptions } from './options.ts';
import { LOOP_REACH, LOOP_STEP } from './route.ts';
import { graphOf, randomLinks, seeded, type GraphExtras, type LinkList } from './testing.ts';

const EPS = 1e-6;

/** A connected random acyclic graph: every node but the first hangs on an earlier one. */
function connectedDag(nodes: number, extra: number, seed: number, window = 6): [number, number][] {
  const next = seeded(seed);
  const links: [number, number][] = [];
  for (let v = 1; v < nodes; v++) {
    links.push([Math.max(0, v - 1 - Math.floor(next() * window)), v]);
  }
  for (let k = 0; k < extra; k++) {
    const i = Math.floor(next() * (nodes - 1));
    links.push([i, Math.min(nodes - 1, i + 1 + Math.floor(next() * window))]);
  }
  return links;
}

/** Random half extents for `nodes` nodes. */
function randomSizes(nodes: number, seed: number): GraphExtras {
  const next = seeded(seed);
  return {
    halfWidth: Array.from({ length: nodes }, () => 5 + 50 * next()),
    halfHeight: Array.from({ length: nodes }, () => 5 + 20 * next()),
  };
}

const route = (result: LayoutResult, k: number): LinkRoute => {
  const found = result.routes?.[k];
  if (!found) throw new Error(`link ${k} has no route`);
  return found;
};

/** A point of a Bézier chain or polyline at `t` in [0, 1] of piece `piece`. */
function sample(r: LinkRoute, piece: number, t: number): [number, number] {
  const p = r.points;
  if (r.kind === 'polyline') {
    const i = 2 * piece;
    return [p[i]! + t * (p[i + 2]! - p[i]!), p[i + 1]! + t * (p[i + 3]! - p[i + 1]!)];
  }
  const i = 6 * piece;
  const u = 1 - t;
  const b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [
    b[0]! * p[i]! + b[1]! * p[i + 2]! + b[2]! * p[i + 4]! + b[3]! * p[i + 6]!,
    b[0]! * p[i + 1]! + b[1]! * p[i + 3]! + b[2]! * p[i + 5]! + b[3]! * p[i + 7]!,
  ];
}

const pieces = (r: LinkRoute): number =>
  r.kind === 'spline' ? (r.points.length / 2 - 1) / 3 : r.points.length / 2 - 1;

/** Every number of the result is finite. */
function expectFinite(result: LayoutResult): void {
  expect(result.x.every(Number.isFinite)).toBe(true);
  expect(result.y.every(Number.isFinite)).toBe(true);
  for (const r of result.routes ?? []) if (r) expect(r.points.every(Number.isFinite)).toBe(true);
  for (const c of result.clusters ?? []) {
    expect([c.x0, c.y0, c.x1, c.y1].every(Number.isFinite)).toBe(true);
  }
}

describe('layered layout: ranks and spacing', () => {
  it('puts every link one rank or more down, top to bottom', () => {
    const links = connectedDag(40, 30, 3);
    const g = graphOf(40, links);
    const result = layeredLayout(g, {});
    expectFinite(result);
    links.forEach(([s, t], k) => {
      expect(result.reversed![k]).toBe(0);
      // Rank spacing: the two boxes are at least `ranksep` apart along y.
      expect(
        result.y[s]! - g.halfHeight[s]! - (result.y[t]! + g.halfHeight[t]!),
      ).toBeGreaterThanOrEqual(LAYERED_DEFAULTS.ranksep - EPS);
    });
  });

  it('keeps the nodes of a rank and the ranks apart, whatever the node sizes', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const nodes = 30 + 3 * seed;
      const g = graphOf(
        nodes,
        connectedDag(nodes, nodes, seed, 4 + (seed % 7)),
        randomSizes(nodes, seed),
      );
      const options = { nodesep: 10 + seed, ranksep: 20 + 2 * seed, edgesep: 5 };
      const result = layeredLayout(g, options);
      expectFinite(result);
      // Ranks are the distinct values of y, top first.
      const ranks = Array.from(new Set(result.y)).sort((a, b) => b - a);
      const members = ranks.map((y) =>
        Array.from({ length: nodes }, (_, v) => v).filter((v) => result.y[v] === y),
      );
      let above = Infinity;
      for (const rank of members) {
        rank.sort((a, b) => result.x[a]! - result.x[b]!);
        for (let i = 1; i < rank.length; i++) {
          const a = rank[i - 1]!;
          const b = rank[i]!;
          expect(
            result.x[b]! - g.halfWidth[b]! - (result.x[a]! + g.halfWidth[a]!),
          ).toBeGreaterThanOrEqual(options.nodesep - EPS);
        }
        const top = Math.max(...rank.map((v) => result.y[v]! + g.halfHeight[v]!));
        const bottom = Math.min(...rank.map((v) => result.y[v]! - g.halfHeight[v]!));
        expect(above - top).toBeGreaterThanOrEqual(options.ranksep - EPS);
        above = bottom;
      }
    }
  });

  it('follows the ranker asked for', () => {
    // 0 → 1 → 2 → 3 and 4 → 3: longest path leaves 4 in the top rank.
    const g = graphOf(5, [
      [0, 1],
      [1, 2],
      [2, 3],
      [4, 3],
    ]);
    const early = layeredLayout(g, { ranker: 'longest-path' });
    const late = layeredLayout(g, { ranker: 'network-simplex' });
    expect(early.y[4]).toBe(early.y[0]);
    expect(late.y[4]).toBe(late.y[2]);
    expect(layeredLayout(g, { ranker: 'tight-tree' }).y).toEqual(late.y);
  });

  it('centers the drawing on the origin', () => {
    const g = graphOf(30, connectedDag(30, 20, 9), randomSizes(30, 9));
    const result = layeredLayout(g, {});
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let v = 0; v < g.nodes; v++) {
      x0 = Math.min(x0, result.x[v]! - g.halfWidth[v]!);
      x1 = Math.max(x1, result.x[v]! + g.halfWidth[v]!);
      y0 = Math.min(y0, result.y[v]! - g.halfHeight[v]!);
      y1 = Math.max(y1, result.y[v]! + g.halfHeight[v]!);
    }
    expect(y0 + y1).toBeCloseTo(0, 6);
    // Across the layers the box also holds the long links' dummies, so the nodes are inside it.
    expect(Math.abs(x0 + x1)).toBeLessThanOrEqual(x1 - x0);
    for (const r of result.routes!) {
      for (let i = 0; i < r!.points.length; i += 2) {
        expect(Math.abs(r!.points[i]!)).toBeLessThanOrEqual(Math.max(-x0, x1) * 2 + EPS);
      }
    }
  });
});

describe('layered layout: routes', () => {
  const ROUTINGS = ['spline', 'polyline', 'orthogonal'] as const;

  it.each(ROUTINGS)('%s routes start and end on the outlines and run down the ranks', (routing) => {
    for (let seed = 1; seed <= 12; seed++) {
      const nodes = 30 + 2 * seed;
      const links = connectedDag(nodes, nodes, seed, 5);
      const g = graphOf(nodes, links, randomSizes(nodes, seed + 40));
      const result = layeredLayout(g, { routing });
      expectFinite(result);
      links.forEach(([s, t], k) => {
        const r = route(result, k);
        const p = r.points;
        const n = p.length / 2;
        expect(r.kind).toBe(routing === 'spline' ? 'spline' : 'polyline');
        if (routing === 'spline') expect((n - 1) % 3).toBe(0);
        expect(n).toBeGreaterThanOrEqual(2);
        // Start: the source's bottom side. End: the target's top side.
        expect(p[1]).toBeCloseTo(result.y[s]! - g.halfHeight[s]!, 9);
        expect(Math.abs(p[0]! - result.x[s]!)).toBeLessThanOrEqual(g.halfWidth[s]! + EPS);
        expect(p[2 * n - 1]).toBeCloseTo(result.y[t]! + g.halfHeight[t]!, 9);
        expect(Math.abs(p[2 * n - 2]! - result.x[t]!)).toBeLessThanOrEqual(g.halfWidth[t]! + EPS);
        for (let i = 1; i < n; i++) {
          // Monotone along the ranks: y never increases from one point to the next.
          expect(p[2 * i + 1]!).toBeLessThanOrEqual(p[2 * i - 1]! + EPS);
          if (routing === 'orthogonal') {
            const dx = Math.abs(p[2 * i]! - p[2 * i - 2]!);
            const dy = Math.abs(p[2 * i + 1]! - p[2 * i - 1]!);
            expect(Math.min(dx, dy)).toBeLessThanOrEqual(EPS);
          }
        }
      });
    }
  });

  it.each(ROUTINGS)('%s routes stay out of the boxes of other nodes', (routing) => {
    for (let seed = 1; seed <= 10; seed++) {
      const nodes = 36;
      const links = connectedDag(nodes, 30, seed, 9);
      const g = graphOf(nodes, links, randomSizes(nodes, seed + 80));
      const result = layeredLayout(g, { routing });
      let inside = 0;
      links.forEach(([s, t], k) => {
        const r = route(result, k);
        for (let piece = 0; piece < pieces(r); piece++) {
          for (let step = 0; step <= 8; step++) {
            const [px, py] = sample(r, piece, step / 8);
            for (let v = 0; v < nodes; v++) {
              if (v === s || v === t) continue;
              if (
                Math.abs(px - result.x[v]!) < g.halfWidth[v]! - EPS &&
                Math.abs(py - result.y[v]!) < g.halfHeight[v]! - EPS
              ) {
                inside++;
              }
            }
          }
        }
      });
      expect(inside).toBe(0);
    }
  });

  it('splines are smooth where two pieces meet and straight where the dummies are aligned', () => {
    // 0 → 1 → 2 → 3 → 4 with 0 → 4 beside it: the long link is one straight run in the middle.
    const g = graphOf(5, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [0, 4],
    ]);
    const result = layeredLayout(g, {});
    const p = route(result, 4).points;
    const n = p.length / 2;
    expect(n).toBe(3 * 7 + 1);
    for (let i = 3; i < n - 1; i += 3) {
      // The control points on either side of a joint are in line with it.
      const ax = p[2 * i]! - p[2 * i - 2]!;
      const ay = p[2 * i + 1]! - p[2 * i - 1]!;
      const bx = p[2 * i + 2]! - p[2 * i]!;
      const by = p[2 * i + 3]! - p[2 * i + 1]!;
      expect(ax * by - ay * bx).toBeCloseTo(0, 9);
      expect(ax * bx + ay * by).toBeGreaterThan(0);
    }
    const middle = Array.from({ length: n - 8 }, (_, i) => p[2 * (i + 4)]!);
    expect(new Set(middle).size).toBe(1);
  });

  it('gives each parallel link its own route', () => {
    // Small nodes: the ports alone are too close, so the routes bow apart.
    for (const routing of ['spline', 'polyline'] as const) {
      const g = graphOf(
        2,
        [
          [0, 1],
          [0, 1],
          [0, 1],
        ],
        { halfWidth: 4, halfHeight: 4 },
      );
      const result = layeredLayout(g, { routing });
      const middles = [0, 1, 2].map((k) => {
        const r = route(result, k);
        const half = pieces(r) / 2;
        return half % 1 === 0 ? sample(r, half, 0)[0] : sample(r, Math.floor(half), 0.5)[0];
      });
      expect(middles[1]! - middles[0]!).toBeGreaterThan(5);
      expect(middles[2]! - middles[1]!).toBeGreaterThan(5);
    }
    // Wide nodes: neighbouring ports, `edgesep` apart, for every routing; and over several ranks.
    for (const routing of ['spline', 'polyline', 'orthogonal'] as const) {
      const g = graphOf(
        4,
        [
          [0, 1],
          [0, 1],
          [1, 2],
          [2, 3],
          [0, 3],
          [0, 3],
        ],
        { halfWidth: 40 },
      );
      const result = layeredLayout(g, { routing, edgesep: 10 });
      expect(Math.abs(route(result, 0).points[0]! - route(result, 1).points[0]!)).toBeCloseTo(
        10,
        9,
      );
      const a = route(result, 4).points;
      const b = route(result, 5).points;
      expect(Math.abs(a[0]! - b[0]!)).toBeCloseTo(10, 9);
      // Half way down the long links are still apart.
      const y = (result.y[1]! + result.y[2]!) / 2;
      const at = (p: Float64Array): number => {
        for (let i = 2; i < p.length; i += 2) if (p[i + 1]! <= y) return p[i]!;
        return NaN;
      };
      expect(Math.abs(at(a) - at(b))).toBeGreaterThanOrEqual(10 - EPS);
    }
  });

  it('draws a reversed link from its real source up to its real target', () => {
    // 0 → 1 → 2 → 0: the link 2 → 0 is turned for the layout.
    const g = graphOf(3, [
      [0, 1],
      [1, 2],
      [2, 0],
    ]);
    for (const routing of ROUTINGS) {
      const result = layeredLayout(g, { routing });
      expect(Array.from(result.reversed!)).toEqual([0, 0, 1]);
      expect(result.y[0]!).toBeGreaterThan(result.y[1]!);
      expect(result.y[1]!).toBeGreaterThan(result.y[2]!);
      const p = route(result, 2).points;
      const n = p.length / 2;
      if (routing === 'spline') expect((n - 1) % 3).toBe(0);
      // From the top side of 2 to the bottom side of 0, going up all the way.
      expect(p[1]).toBeCloseTo(result.y[2]! + 10, 9);
      expect(p[2 * n - 1]).toBeCloseTo(result.y[0]! - 10, 9);
      for (let i = 1; i < n; i++) expect(p[2 * i + 1]!).toBeGreaterThanOrEqual(p[2 * i - 1]! - EPS);
    }
  });

  it('draws self-links as loops beside the node, each further out', () => {
    const g = graphOf(
      3,
      [
        [0, 0],
        [0, 1],
        [0, 0],
        [0, 2],
      ],
      { halfWidth: 20, halfHeight: 10 },
    );
    for (const routing of ROUTINGS) {
      const result = layeredLayout(g, { routing });
      expect(Array.from(result.reversed!)).toEqual([0, 0, 0, 0]);
      const reach = [0, 2].map((k, index) => {
        const r = route(result, k);
        const p = r.points;
        expect(p).toHaveLength(8);
        // Both ends on the right side of the node, the start above the end.
        expect(p[0]).toBeCloseTo(result.x[0]! + 20, 9);
        expect(p[6]).toBeCloseTo(result.x[0]! + 20, 9);
        expect(p[1]!).toBeGreaterThan(p[7]!);
        expect(Math.abs(p[1]! - result.y[0]!)).toBeLessThanOrEqual(10);
        let far = -Infinity;
        for (let step = 0; step <= 16; step++) {
          for (let piece = 0; piece < pieces(r); piece++) {
            far = Math.max(far, sample(r, piece, step / 16)[0]);
          }
        }
        expect(far - (result.x[0]! + 20)).toBeCloseTo(LOOP_REACH + LOOP_STEP * index, 6);
        return far;
      });
      expect(reach[1]!).toBeGreaterThan(reach[0]!);
    }
    // A node next to one with loops keeps clear of them.
    const row = graphOf(
      3,
      [
        [0, 1],
        [0, 2],
        [1, 1],
      ],
      { halfWidth: 20 },
    );
    const result = layeredLayout(row, {});
    const [left, right] = result.x[1]! < result.x[2]! ? [1, 2] : [2, 1];
    const room = left === 1 ? LOOP_REACH : 0;
    expect(result.x[right]! - result.x[left]!).toBeGreaterThanOrEqual(40 + room + 30 - EPS);
  });
});

describe('layered layout: direction', () => {
  /** The same graph with widths and heights exchanged. */
  const turned = (g: LayoutGraph): LayoutGraph => ({
    ...g,
    halfWidth: g.halfHeight,
    halfHeight: g.halfWidth,
  });

  it.each([
    ['one connected part', {}],
    ['several parts, packed square', { aspect: 1 }],
  ] as const)('the four directions are the same drawing turned or mirrored: %s', (name, extra) => {
    const nodes = 28;
    const links: [number, number][] =
      name === 'one connected part'
        ? [...connectedDag(nodes, 24, 5), [9, 2], [4, 4]]
        : randomLinks(nodes, 30, 5);
    const g = graphOf(nodes, links, randomSizes(nodes, 6));
    for (const routing of ['spline', 'orthogonal'] as const) {
      const tb = layeredLayout(g, { ...extra, routing, rankdir: 'TB' });
      const bt = layeredLayout(g, { ...extra, routing, rankdir: 'BT' });
      const lr = layeredLayout(turned(g), { ...extra, routing, rankdir: 'LR' });
      const rl = layeredLayout(turned(g), { ...extra, routing, rankdir: 'RL' });
      const maps: [LayoutResult, (x: number, y: number) => [number, number]][] = [
        [bt, (x, y) => [x, 0 - y]],
        [lr, (x, y) => [0 - y, 0 - x]],
        [rl, (x, y) => [y, 0 - x]],
      ];
      for (const [other, map] of maps) {
        expect(other.reversed).toEqual(tb.reversed);
        for (let v = 0; v < nodes; v++) {
          expect([other.x[v], other.y[v]]).toEqual(map(tb.x[v]!, tb.y[v]!));
        }
        links.forEach((_, k) => {
          const a = route(tb, k).points;
          const b = route(other, k).points;
          expect(b).toHaveLength(a.length);
          for (let i = 0; i < a.length; i += 2) {
            expect([b[i], b[i + 1]]).toEqual(map(a[i]!, a[i + 1]!));
          }
        });
      }
    }
  });

  it('runs the ranks the way `rankdir` says', () => {
    const g = graphOf(2, [[0, 1]]);
    const at = (rankdir: LayeredOptions['rankdir']): number[] => {
      const result = layeredLayout(g, { rankdir });
      return [result.x[0]!, result.y[0]!, result.x[1]!, result.y[1]!];
    };
    // Boxes 20 high (or wide, sideways) and 50 apart: the centers are 70 apart.
    expect(at('TB')).toEqual([0, 35, 0, -35]);
    expect(at('BT')).toEqual([0, -35, 0, 35]);
    expect(at('LR')).toEqual([-45, 0, 45, 0]);
    expect(at('RL')).toEqual([45, 0, -45, 0]);
    // Sideways, a route leaves the source's right side and enters the target's left side.
    const lr = layeredLayout(g, { rankdir: 'LR' });
    expect(Array.from(route(lr, 0).points.filter((_, i) => i === 0 || i === 6))).toEqual([-25, 25]);
  });
});

describe('layered layout: clusters', () => {
  // A pipeline: ingest (group 0), transform (group 1), publish (group 2), with a monitor that
  // every stage reports to and a config node that feeds two stages.
  const PIPELINE: LinkList = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
    [3, 4],
    [3, 5],
    [4, 6],
    [5, 6],
    [6, 7],
    [6, 8],
    [7, 9],
    [8, 9],
    [3, 10],
    [6, 10],
    [9, 10],
    [11, 4],
    [11, 7],
    [1, 6],
  ];
  const GROUP = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, -1, -1];

  /** Checks what the layout promises about frames; returns them by group. */
  function expectFrames(
    g: LayoutGraph,
    result: LayoutResult,
    padding: number,
    label: number,
  ): Map<number, { x0: number; y0: number; x1: number; y1: number }> {
    const frames = new Map(result.clusters!.map((c) => [c.group, c]));
    const groups = new Set(Array.from(g.group!).filter((k) => k >= 0));
    expect(frames.size).toBe(groups.size);
    for (let v = 0; v < g.nodes; v++) {
      const k = g.group![v]!;
      for (const [group, c] of frames) {
        const left = result.x[v]! - g.halfWidth[v]!;
        const right = result.x[v]! + g.halfWidth[v]!;
        const bottom = result.y[v]! - g.halfHeight[v]!;
        const top = result.y[v]! + g.halfHeight[v]!;
        if (group === k) {
          // Inside, with the padding all round and room for the title on top.
          expect(left - c.x0).toBeGreaterThanOrEqual(padding - EPS);
          expect(c.x1 - right).toBeGreaterThanOrEqual(padding - EPS);
          expect(bottom - c.y0).toBeGreaterThanOrEqual(padding - EPS);
          expect(c.y1 - top).toBeGreaterThanOrEqual(padding + label - EPS);
        } else {
          const outside =
            right <= c.x0 + EPS || left >= c.x1 - EPS || top <= c.y0 + EPS || bottom >= c.y1 - EPS;
          expect(outside).toBe(true);
        }
      }
    }
    const list = [...frames.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const apart =
          a.x1 <= b.x0 + EPS || b.x1 <= a.x0 + EPS || a.y1 <= b.y0 + EPS || b.y1 <= a.y0 + EPS;
        expect(apart).toBe(true);
      }
    }
    return frames;
  }

  it.each(['TB', 'BT', 'LR', 'RL'] as const)('frames a pipeline without overlap, %s', (rankdir) => {
    const g = graphOf(12, PIPELINE, { group: GROUP });
    const result = layeredLayout(g, { clusters: true, rankdir });
    expectFinite(result);
    const frames = expectFrames(g, result, 12, 18);
    expect([...frames.keys()]).toEqual([0, 1, 2]);
    // The stages follow each other along the ranks.
    const along = (k: number): number => {
      const c = frames.get(k)!;
      const mid = rankdir === 'TB' || rankdir === 'BT' ? (c.y0 + c.y1) / 2 : (c.x0 + c.x1) / 2;
      return rankdir === 'TB' || rankdir === 'RL' ? -mid : mid;
    };
    expect(along(0)).toBeLessThan(along(1));
    expect(along(1)).toBeLessThan(along(2));
  });

  it('keeps the nodes of a group next to each other in every rank', () => {
    const g = graphOf(12, PIPELINE, { group: GROUP });
    const result = layeredLayout(g, { clusters: true });
    for (const y of new Set(result.y)) {
      const rank = Array.from({ length: 12 }, (_, v) => v)
        .filter((v) => result.y[v] === y)
        .sort((a, b) => result.x[a]! - result.x[b]!);
      const closed = new Set<number>();
      rank.forEach((v, i) => {
        const k = GROUP[v]!;
        if (i > 0 && GROUP[rank[i - 1]!] !== k) closed.add(GROUP[rank[i - 1]!]!);
        if (k >= 0) expect(closed.has(k)).toBe(false);
      });
    }
  });

  it('holds its promises on random graphs with random groups', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const nodes = 20 + 2 * seed;
      const next = seeded(seed + 300);
      const links =
        seed % 3 === 0
          ? randomLinks(nodes, 2 * nodes, seed)
          : connectedDag(nodes, nodes >> 1, seed);
      const group = Array.from({ length: nodes }, () => Math.floor(next() * 6) - 1);
      const g = graphOf(nodes, links, { ...randomSizes(nodes, seed), group });
      const padding = seed % 5;
      const label = seed % 4 === 0 ? 0 : 14;
      for (const rankdir of ['TB', 'LR'] as const) {
        const result = layeredLayout(g, {
          clusters: true,
          rankdir,
          clusterPadding: padding,
          clusterLabelHeight: label,
        });
        expectFinite(result);
        expectFrames(g, result, padding, label);
      }
    }
  });

  it('frames nothing unless asked, and frames a group of one', () => {
    const g = graphOf(12, PIPELINE, { group: GROUP });
    expect(layeredLayout(g, {}).clusters).toBeUndefined();
    expect(layeredLayout(graphOf(3, [[0, 1]]), { clusters: true }).clusters).toBeUndefined();
    const one = layeredLayout(graphOf(2, [], { group: [3, -1] }), { clusters: true });
    expect(one.clusters).toEqual([
      { group: 3, x0: one.x[0]! - 32, x1: one.x[0]! + 32, y0: one.y[0]! - 22, y1: one.y[0]! + 40 },
    ]);
  });
});

describe('layered layout: parts, edge cases and determinism', () => {
  it('lays out disconnected parts side by side without overlap', () => {
    // Three chains, a triangle and four nodes on their own.
    const links: LinkList = [
      [0, 1],
      [1, 2],
      [2, 3],
      [4, 5],
      [5, 6],
      [7, 8],
      [9, 10],
      [10, 11],
      [11, 9],
    ];
    const parts = [[0, 1, 2, 3], [4, 5, 6], [7, 8], [9, 10, 11], [12], [13], [14], [15]];
    const g = graphOf(16, links, randomSizes(16, 2));
    const result = layeredLayout(g, {});
    expectFinite(result);
    const box = (part: number[]): number[] => [
      Math.min(...part.map((v) => result.x[v]! - g.halfWidth[v]!)),
      Math.max(...part.map((v) => result.x[v]! + g.halfWidth[v]!)),
      Math.min(...part.map((v) => result.y[v]! - g.halfHeight[v]!)),
      Math.max(...part.map((v) => result.y[v]! + g.halfHeight[v]!)),
    ];
    const gap = LAYERED_DEFAULTS.componentsep;
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = box(parts[i]!);
        const b = box(parts[j]!);
        const apart =
          a[1]! + gap <= b[0]! + EPS ||
          b[1]! + gap <= a[0]! + EPS ||
          a[3]! + gap <= b[2]! + EPS ||
          b[3]! + gap <= a[2]! + EPS;
        expect(apart).toBe(true);
      }
    }
    // The largest part comes first: top left.
    expect(box(parts[0]!)[0]).toBeLessThanOrEqual(box(parts[1]!)[0]!);
    const stats = emptyStats();
    runLayered(g, {}, stats);
    expect(stats.parts).toBe(8);
    expect(stats.reversed).toBe(1);
  });

  it('wraps many small parts onto shelves', () => {
    const result = layeredLayout(graphOf(200, []), {});
    const width = Math.max(...result.x) - Math.min(...result.x);
    const height = Math.max(...result.y) - Math.min(...result.y);
    expect(new Set(result.y).size).toBeGreaterThan(5);
    expect(width / height).toBeGreaterThan(0.8);
    expect(width / height).toBeLessThan(3.2);
    // Sideways the shelves stand next to each other.
    const lr = layeredLayout(graphOf(200, []), { rankdir: 'LR' });
    expect(new Set(lr.x).size).toBeGreaterThan(5);
  });

  it('handles no node, one node and a graph of self-links', () => {
    const none = layeredLayout(graphOf(0, []), {});
    expect(none.x).toHaveLength(0);
    expect(none.routes).toEqual([]);
    expect(none.reversed).toHaveLength(0);
    expect(layeredLayout(graphOf(0, []), { clusters: true }).clusters).toBeUndefined();

    const one = layeredLayout(graphOf(1, []), {});
    expect([one.x[0], one.y[0]]).toEqual([0, 0]);

    const loops = layeredLayout(
      graphOf(2, [
        [0, 0],
        [1, 1],
        [1, 1],
      ]),
      {},
    );
    expectFinite(loops);
    expect(loops.routes!.every((r) => r !== undefined && r.points.length === 8)).toBe(true);
    expect(Array.from(loops.reversed!)).toEqual([0, 0, 0]);
  });

  it('opens a full cycle with one reversed link', () => {
    const n = 12;
    const links = Array.from({ length: n }, (_, i) => [i, (i + 1) % n] as [number, number]);
    const result = layeredLayout(graphOf(n, links), {});
    expectFinite(result);
    expect(Array.from(result.reversed!).reduce((a, b) => a + b, 0)).toBe(1);
    expect(result.reversed![n - 1]).toBe(1);
    // A chain down the ranks, the closing link routed back up beside it; the two ends of the
    // chain sit between the chain and that link.
    expect(new Set(result.y).size).toBe(n);
    expect(new Set(result.x.subarray(1, n - 1)).size).toBe(1);
    expect(result.x[0]).toBe(result.x[n - 1]);
    expect(result.x[0]!).toBeGreaterThan(result.x[1]!);
    const back = route(result, n - 1).points;
    expect(back[1]!).toBeLessThan(back[back.length - 1]!);
  });

  it('lays out a complete acyclic graph and a very wide rank', () => {
    const n = 9;
    const all: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) all.push([i, j]);
    const complete = layeredLayout(graphOf(n, all), {});
    expectFinite(complete);
    expect(new Set(complete.y).size).toBe(n);
    expect(Array.from(complete.reversed!).every((v) => v === 0)).toBe(true);

    const fan = Array.from({ length: 400 }, (_, i) => [0, i + 1] as [number, number]);
    const g = graphOf(401, fan, { halfWidth: 8, halfHeight: 8 });
    const wide = layeredLayout(g, {});
    expectFinite(wide);
    const row = Array.from(wide.x.subarray(1)).sort((a, b) => a - b);
    for (let i = 1; i < row.length; i++)
      expect(row[i]! - row[i - 1]!).toBeGreaterThanOrEqual(46 - EPS);
    // The source sits over the middle of its targets.
    expect(wide.x[0]).toBeCloseTo((row[0]! + row[row.length - 1]!) / 2, 6);
  });

  it('gives the same result on every run and leaves its input alone', () => {
    for (const options of [{}, { clusters: true, routing: 'orthogonal', rankdir: 'LR' }] as const) {
      const nodes = 80;
      const make = (): LayoutGraph =>
        graphOf(nodes, randomLinks(nodes, 170, 21), {
          ...randomSizes(nodes, 21),
          group: Array.from({ length: nodes }, (_, v) => (v % 6) - 1),
        });
      const g = make();
      const copy = structuredClone(g);
      const a = layeredLayout(g, options);
      expect(g).toEqual(copy);
      const b = layeredLayout(make(), options);
      expect(b).toEqual(a);
      expectFinite(a);
      expect(a.routes).toHaveLength(170);
      expect(a.routes!.every((r) => r !== undefined)).toBe(true);
    }
  });

  it('survives sizes and weights that are not numbers it can use', () => {
    const g: LayoutGraph = {
      ...graphOf(4, [
        [0, 1],
        [1, 2],
        [0, 3],
      ]),
      halfWidth: Float64Array.of(NaN, -5, Infinity, 20),
      halfHeight: Float64Array.of(10, NaN, 0, 10),
      weight: Float64Array.of(NaN, 0, -1),
    };
    expectFinite(layeredLayout(g, {}));
    expectFinite(layeredLayout(g, null));
    expectFinite(layeredLayout(g, undefined));
  });
});

describe('layered layout: options', () => {
  it('fills in the defaults and drops what it cannot use', () => {
    expect(resolveLayeredOptions(undefined)).toEqual(LAYERED_DEFAULTS);
    expect(resolveLayeredOptions(null)).toEqual(LAYERED_DEFAULTS);
    const junk = {
      rankdir: 'XY',
      ranksep: -1,
      nodesep: NaN,
      edgesep: '4',
      ranker: 'best',
      routing: 'curvy',
      clusters: 'yes',
      clusterPadding: Infinity,
      clusterLabelHeight: null,
      componentsep: undefined,
      aspect: 0,
      orderRounds: -3,
    } as unknown as LayeredOptions;
    expect(resolveLayeredOptions(junk)).toEqual(LAYERED_DEFAULTS);
    expect(
      resolveLayeredOptions({
        rankdir: 'RL',
        ranksep: 0,
        nodesep: 5,
        edgesep: 1,
        ranker: 'tight-tree',
        routing: 'orthogonal',
        clusters: true,
        clusterPadding: 0,
        clusterLabelHeight: 0,
        componentsep: 3,
        aspect: 2,
        orderRounds: 2.4,
      }),
    ).toEqual({
      rankdir: 'RL',
      ranksep: 0,
      nodesep: 5,
      edgesep: 1,
      ranker: 'tight-tree',
      routing: 'orthogonal',
      clusters: true,
      clusterPadding: 0,
      clusterLabelHeight: 0,
      componentsep: 3,
      aspect: 2,
      orderRounds: 2,
    });
  });

  it('lays out with zero separations and without any sweep', () => {
    const g = graphOf(20, connectedDag(20, 14, 2), { halfWidth: 0, halfHeight: 0 });
    for (const routing of ['spline', 'polyline', 'orthogonal'] as const) {
      const result = layeredLayout(g, {
        ranksep: 0,
        nodesep: 0,
        edgesep: 0,
        orderRounds: 0,
        routing,
      });
      expectFinite(result);
    }
  });
});
