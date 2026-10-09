import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ARC_KAPPA, arcLayout, type ArcLayoutOptions, type ArcLayoutResult } from './arc.ts';
import type { GraphLayout, LayoutGraph } from './types.ts';

type Link = readonly [source: number, target: number, weight?: number];

/** A graph of `nodes` round nodes of radius 5 unless `extra` says otherwise. */
function graphOf(
  nodes: number,
  links: readonly Link[],
  extra: Partial<LayoutGraph> = {},
): LayoutGraph {
  return {
    nodes,
    source: Int32Array.from(links, (l) => l[0]),
    target: Int32Array.from(links, (l) => l[1]),
    weight: Float64Array.from(links, (l) => l[2] ?? 1),
    halfWidth: new Float64Array(nodes).fill(5),
    halfHeight: new Float64Array(nodes).fill(5),
    x: new Float64Array(nodes).fill(NaN),
    y: new Float64Array(nodes).fill(NaN),
    ...extra,
  };
}

/** The points of link `k`'s route as `[x, y]` pairs. */
function pointsOf(result: ArcLayoutResult, k: number): [number, number][] {
  const flat = result.routes[k]!.points;
  const out: [number, number][] = [];
  for (let j = 0; j < flat.length; j += 2) out.push([flat[j]!, flat[j + 1]!]);
  return out;
}

/** The point at `t` on cubic segment `segment` of a route. */
function at(
  points: readonly (readonly [number, number])[],
  segment: number,
  t: number,
): [number, number] {
  const u = 1 - t;
  const basis = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  let x = 0;
  let y = 0;
  basis.forEach((b, j) => {
    x += b * points[3 * segment + j]![0];
    y += b * points[3 * segment + j]![1];
  });
  return [x, y];
}

/** Σ weight · |rank(source) − rank(target)|, from the result alone. */
function spanOf(graph: LayoutGraph, rank: Int32Array): number {
  let sum = 0;
  for (let k = 0; k < graph.source.length; k++) {
    sum += graph.weight[k]! * Math.abs(rank[graph.source[k]!]! - rank[graph.target[k]!]!);
  }
  return sum;
}

/** A path 0 – 3 – 1 – 4 – 2: in input order every link jumps two or three places. */
const ZIGZAG: readonly Link[] = [
  [0, 3],
  [3, 1],
  [1, 4],
  [4, 2],
];

/** A random small graph with its node sizes: `[nodes, links, halfWidth, halfHeight]`. */
const graphs = fc.integer({ min: 0, max: 14 }).chain((n) =>
  fc.tuple(
    fc.constant(n),
    n === 0
      ? fc.constant<[number, number, number][]>([])
      : fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1), fc.integer({ min: 1, max: 9 })), {
          maxLength: 30,
        }),
    fc.array(fc.integer({ min: 0, max: 30 }), { minLength: n, maxLength: n }),
    fc.array(fc.integer({ min: 0, max: 30 }), { minLength: n, maxLength: n }),
  ),
);

const ORDERS = ['input', 'group', 'degree', 'barycenter'] as const;

describe('arc layout: order', () => {
  it('keeps input order by default, and is a GraphLayout', () => {
    const layout: GraphLayout<ArcLayoutOptions> = arcLayout;
    expect(layout(graphOf(4, ZIGZAG.slice(0, 1)), {}).x).toEqual(arcLayout(graphOf(4, [[0, 3]])).x);
    const r = arcLayout(graphOf(4, [[3, 0]]));
    expect([...r.order]).toEqual([0, 1, 2, 3]);
    expect([...r.rank]).toEqual([0, 1, 2, 3]);
    expect([...arcLayout(graphOf(4, [[3, 0]]), { order: 'input' }).order]).toEqual([0, 1, 2, 3]);
  });

  it('orders by group, ungrouped nodes last, index order within a group', () => {
    const graph = graphOf(5, [], { group: Int32Array.of(1, -1, 0, 1, 0), groups: 2 });
    const r = arcLayout(graph, { order: 'group' });
    expect([...r.order]).toEqual([2, 4, 0, 3, 1]);
    expect([...r.rank]).toEqual([2, 4, 0, 3, 1]);
    // No groups: input order.
    expect([...arcLayout(graphOf(3, []), { order: 'group' }).order]).toEqual([0, 1, 2]);
  });

  it('orders by degree, highest first, ties by index, a self-link counting twice', () => {
    // Degrees: 0 → 1, 1 → 3, 2 → 1, 3 → 3 (one link and a self-link).
    const r = arcLayout(
      graphOf(4, [
        [0, 1],
        [1, 2],
        [1, 3],
        [3, 3],
      ]),
      { order: 'degree' },
    );
    expect([...r.order]).toEqual([1, 3, 0, 2]);
    expect([...r.rank]).toEqual([2, 0, 3, 1]);
  });

  it('untangles a zigzag path with barycenter sweeps', () => {
    const graph = graphOf(5, ZIGZAG);
    const input = arcLayout(graph);
    const r = arcLayout(graph, { order: 'barycenter' });
    expect(input.span).toBe(10);
    // The path laid out end to end: every link joins neighbours, which is the minimum.
    expect([...r.order]).toEqual([0, 3, 1, 4, 2]);
    expect(r.span).toBe(4);
    expect([...r.order].map((i) => r.rank[i])).toEqual([0, 1, 2, 3, 4]);
  });

  it('is strictly better than a bad input order', () => {
    // Two groups of four, each fully linked, dealt alternately along the input order, and a
    // weighted chain whose heavy links are the long ones.
    const cliques: Link[] = [];
    for (let a = 0; a < 8; a++) for (let b = a + 2; b < 8; b += 2) cliques.push([a, b]);
    cliques.push([6, 1]);
    const chain: Link[] = [
      [0, 5, 9],
      [5, 1, 9],
      [1, 4, 9],
      [4, 2, 1],
      [2, 3, 1],
    ];
    for (const [nodes, links] of [
      [8, cliques],
      [6, chain],
    ] as const) {
      const graph = graphOf(nodes, links);
      const r = arcLayout(graph, { order: 'barycenter' });
      expect(r.span).toBeLessThan(arcLayout(graph).span);
      expect(r.span).toBe(spanOf(graph, r.rank));
    }
  });

  it('reports the span of every order, by weight', () => {
    const graph = graphOf(4, [
      [0, 3, 2.5],
      [1, 2, 4],
      [2, 2, 7],
    ]);
    expect(arcLayout(graph).span).toBe(2.5 * 3 + 4);
    // By degree: 2 (3 link ends), then 0, 1, 3.
    const r = arcLayout(graph, { order: 'degree' });
    expect([...r.order]).toEqual([2, 0, 1, 3]);
    expect(r.span).toBe(2.5 * 2 + 4 * 2);
  });

  it('keeps input order with no sweeps, and stops when nothing moves', () => {
    const graph = graphOf(5, ZIGZAG);
    expect([...arcLayout(graph, { order: 'barycenter', sweeps: 0 }).order]).toEqual([
      0, 1, 2, 3, 4,
    ]);
    const settled = arcLayout(graph, { order: 'barycenter', sweeps: 1000 });
    expect([...settled.order]).toEqual([0, 3, 1, 4, 2]);
  });

  it('is never worse than input order and returns a permutation (property)', () => {
    fc.assert(
      fc.property(graphs, fc.integer({ min: 0, max: 12 }), ([n, links], sweeps) => {
        const graph = graphOf(n, links);
        const r = arcLayout(graph, { order: 'barycenter', sweeps });
        expect(r.span).toBeLessThanOrEqual(arcLayout(graph).span);
        expect(r.span).toBeCloseTo(spanOf(graph, r.rank), 9);
        expect([...r.order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
        r.order.forEach((i, p) => expect(r.rank[i]).toBe(p));
      }),
    );
  });
});

describe('arc layout: nodes', () => {
  it('spaces nodes by their extents plus nodesep and centres the line', () => {
    const graph = graphOf(4, [], { halfWidth: Float64Array.of(5, 10, 0, 20) });
    const r = arcLayout(graph);
    // Edges at 0 … 130: centres at 5, 40, 70 and 110, then moved by −65.
    expect([...r.x]).toEqual([-60, -25, 5, 45]);
    expect([...r.y]).toEqual([0, 0, 0, 0]);
    expect([...arcLayout(graph, { nodesep: 0 }).x]).toEqual([-30, -15, -5, 15]);
  });

  it('adds groupsep where the group changes, only when ordering by group', () => {
    const graph = graphOf(4, [], { group: Int32Array.of(0, 0, 1, -1), groups: 2 });
    const r = arcLayout(graph, { order: 'group', groupsep: 30 });
    expect([...r.x]).toEqual([-75, -45, 15, 75]);
    expect([...arcLayout(graph, { groupsep: 30 }).x]).toEqual([-45, -15, 15, 45]);
    expect([...arcLayout(graph, { order: 'group' }).x]).toEqual([-45, -15, 15, 45]);
  });

  it('falls back to the defaults for options that are not usable numbers', () => {
    const graph = graphOf(2, [[0, 1]]);
    const dflt = arcLayout(graph);
    expect([...dflt.x]).toEqual([-15, 15]);
    expect([...arcLayout(graph, { nodesep: NaN, maxHeight: NaN, loopSize: Infinity }).x]).toEqual([
      -15, 15,
    ]);
    expect(arcLayout(graph, { maxHeight: NaN }).routes).toEqual(dflt.routes);
    // A negative gap would let nodes overlap: it is no gap.
    expect([...arcLayout(graph, { nodesep: -50 }).x]).toEqual([-5, 5]);
    // Sizes that are not sizes count as nothing.
    const broken = graphOf(2, [], { halfWidth: Float64Array.of(NaN, -3) });
    expect([...arcLayout(broken).x]).toEqual([-10, 10]);
  });

  it('never overlaps nodes, whatever their sizes, and stays centred (property)', () => {
    fc.assert(
      fc.property(
        graphs,
        fc.constantFrom(...ORDERS),
        fc.constantFrom('h', 'v'),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 40 }),
        ([n, links, halfWidth, halfHeight], order, orientation, nodesep, groupsep) => {
          const graph = graphOf(n, links, {
            halfWidth: Float64Array.from(halfWidth),
            halfHeight: Float64Array.from(halfHeight),
            group: Int32Array.from({ length: n }, (_, i) => (i % 4) - 1),
            groups: 3,
          });
          const r = arcLayout(graph, { order, orientation, nodesep, groupsep });
          const vertical = orientation === 'v';
          const half = vertical ? halfHeight : halfWidth;
          // Along the line, first node to last: +x, or −y.
          const along = (i: number): number => (vertical ? -r.y[i]! : r.x[i]!);
          for (let p = 1; p < n; p++) {
            const a = r.order[p - 1]!;
            const b = r.order[p]!;
            expect(along(b) - along(a)).toBeGreaterThanOrEqual(
              half[a]! + half[b]! + nodesep - 1e-9,
            );
          }
          if (n > 0) {
            const first = r.order[0]!;
            const last = r.order[n - 1]!;
            expect(along(first) - half[first]!).toBeCloseTo(-(along(last) + half[last]!), 9);
          }
          for (let i = 0; i < n; i++) expect(vertical ? r.x[i] : r.y[i]).toBe(0);
          for (const v of [...r.x, ...r.y]) expect(Number.isFinite(v)).toBe(true);
          for (const route of r.routes) {
            for (const v of route?.points ?? []) expect(Number.isFinite(v)).toBe(true);
          }
        },
      ),
    );
  });
});

describe('arc layout: arcs', () => {
  // Nodes at x = −45, −15, 15, 45.
  const GRAPH = graphOf(4, [
    [0, 3],
    [2, 1],
    [1, 2],
  ]);

  it('draws each link as a half circle above the line, from its source to its target', () => {
    const r = arcLayout(GRAPH);
    expect(r.routes).toHaveLength(3);
    for (let k = 0; k < 3; k++) {
      const s = GRAPH.source[k]!;
      const t = GRAPH.target[k]!;
      const route = r.routes[k]!;
      const points = pointsOf(r, k);
      expect(route.kind).toBe('spline');
      expect(points).toHaveLength(7);
      expect(points[0]).toEqual([r.x[s], 0]);
      expect(points[6]).toEqual([r.x[t], 0]);
      for (const [, y] of points.slice(1, 6)) expect(y).toBeGreaterThan(0);
      // The top is over the middle, half the node distance up.
      const radius = Math.abs(r.x[t]! - r.x[s]!) / 2;
      expect(points[3]![0]).toBeCloseTo((r.x[s]! + r.x[t]!) / 2, 12);
      expect(points[3]![1]).toBeCloseTo(radius, 12);
      // Along the line the points never turn back: source → target.
      const sign = Math.sign(r.x[t]! - r.x[s]!);
      for (let j = 1; j < 7; j++) {
        expect(sign * (points[j]![0] - points[j - 1]![0])).toBeGreaterThanOrEqual(0);
      }
      // The control points of a quarter circle: straight up from the ends, level at the top.
      expect(points[1]).toEqual([r.x[s], expect.closeTo(ARC_KAPPA * radius, 12)]);
      expect(points[2]![1]).toBeCloseTo(radius, 12);
      expect(points[4]![1]).toBeCloseTo(radius, 12);
    }
    expect(pointsOf(r, 0)[3]).toEqual([0, 45]);
  });

  it('stays within 0.1 % of the circle', () => {
    const r = arcLayout(GRAPH);
    expect(ARC_KAPPA).toBeCloseTo(0.5522847498, 9);
    for (let k = 0; k < 3; k++) {
      const points = pointsOf(r, k);
      const cx = (points[0]![0] + points[6]![0]) / 2;
      const radius = Math.abs(points[6]![0] - points[0]![0]) / 2;
      for (const segment of [0, 1]) {
        for (let t = 0; t <= 1; t += 0.05) {
          const [x, y] = at(points, segment, t);
          expect(Math.abs(Math.hypot(x - cx, y) - radius) / radius).toBeLessThan(1e-3);
        }
      }
    }
  });

  it('puts arcs below with sides: below, and backward links below with sides: direction', () => {
    const below = arcLayout(GRAPH, { sides: 'below' });
    const above = arcLayout(GRAPH, { sides: 'above' });
    expect(above.routes).toEqual(arcLayout(GRAPH).routes);
    for (let k = 0; k < 3; k++) {
      for (const [, y] of pointsOf(below, k).slice(1, 6)) expect(y).toBeLessThan(0);
      // The mirror image of the arc above.
      expect(pointsOf(below, k)).toEqual(pointsOf(above, k).map(([x, y]) => [x, y === 0 ? 0 : -y]));
    }
    const directed = arcLayout(GRAPH, { sides: 'direction' });
    for (const [, y] of pointsOf(directed, 0).slice(1, 6)) expect(y).toBeGreaterThan(0);
    // 2 → 1 points back along the line.
    for (const [, y] of pointsOf(directed, 1).slice(1, 6)) expect(y).toBeLessThan(0);
    for (const [, y] of pointsOf(directed, 2).slice(1, 6)) expect(y).toBeGreaterThan(0);
    // "Backward" is by the order, not by node index.
    const reordered = arcLayout(
      graphOf(3, [[0, 2]], { group: Int32Array.of(1, 0, 0), groups: 2 }),
      { order: 'group', sides: 'direction' },
    );
    expect([...reordered.order]).toEqual([1, 2, 0]);
    for (const [, y] of pointsOf(reordered, 0).slice(1, 6)) expect(y).toBeLessThan(0);
  });

  it('caps arcs at maxHeight as half ellipses', () => {
    const r = arcLayout(GRAPH, { maxHeight: 20 });
    // 0 → 3 would rise 45: capped. 2 → 1 rises 15: a half circle still.
    const capped = pointsOf(r, 0);
    expect(capped[0]).toEqual([-45, 0]);
    expect(capped[6]).toEqual([45, 0]);
    expect(capped[3]).toEqual([0, 20]);
    for (const segment of [0, 1]) {
      for (let t = 0; t <= 1; t += 0.05) {
        const [x, y] = at(capped, segment, t);
        expect(y).toBeLessThanOrEqual(20 + 1e-12);
        expect(Math.abs(Math.hypot(x / 45, y / 20) - 1)).toBeLessThan(1e-3);
      }
    }
    expect(pointsOf(r, 1)).toEqual(pointsOf(arcLayout(GRAPH), 1));
    expect(pointsOf(r, 1)[3]![1]).toBeCloseTo(15, 12);
    // Below the line the cap is the same distance the other way.
    expect(pointsOf(arcLayout(GRAPH, { maxHeight: 20, sides: 'below' }), 0)[3]).toEqual([0, -20]);
    // A cap of nothing flattens the arcs onto the line.
    for (const [, y] of pointsOf(arcLayout(GRAPH, { maxHeight: 0 }), 0)) expect(y).toBe(0);
  });

  it('gives parallel links the same arc and a reversed link the same arc backwards', () => {
    const r = arcLayout(
      graphOf(3, [
        [0, 2],
        [0, 2, 5],
        [2, 0],
      ]),
    );
    expect(r.routes[1]).toEqual(r.routes[0]);
    expect(r.routes[1]!.points).not.toBe(r.routes[0]!.points);
    expect(pointsOf(r, 2)).toEqual(pointsOf(r, 0).reverse());
  });

  it('ignores a link whose end is not a node', () => {
    const graph = graphOf(2, [
      [0, 7],
      [-1, 1],
      [0, 1],
    ]);
    for (const order of ORDERS) {
      const r = arcLayout(graph, { order });
      expect(r.routes.map((route) => route !== undefined)).toEqual([false, false, true]);
      expect([...r.x]).toEqual([-15, 15]);
      expect(r.span).toBe(1);
    }
  });
});

describe('arc layout: self-links', () => {
  // A box node of 40 × 16 at the origin, alone.
  const SELF = graphOf(1, [[0, 0]], {
    halfWidth: Float64Array.of(20),
    halfHeight: Float64Array.of(8),
  });

  it('draws a self-link as a small loop over its node', () => {
    const r = arcLayout(SELF);
    const points = pointsOf(r, 0);
    expect(r.routes[0]!.kind).toBe('spline');
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual([0, 0]);
    expect(points[3]).toEqual([0, 0]);
    // The loop rises 12 beyond the node's edge and is half as wide as it is tall.
    const top = 8 + 12;
    expect(at(points, 0, 0.5)[0]).toBeCloseTo(0, 12);
    expect(at(points, 0, 0.5)[1]).toBeCloseTo(top, 12);
    let width = 0;
    let height = 0;
    for (let t = 0; t <= 1; t += 0.001) {
      const [x, y] = at(points, 0, t);
      width = Math.max(width, Math.abs(x));
      height = Math.max(height, y);
      expect(y).toBeGreaterThanOrEqual(0);
    }
    expect(width).toBeCloseTo(top / 2, 3);
    expect(height).toBeCloseTo(top, 3);
    // It leaves to the left and comes back from the right: clockwise, as the arcs above.
    expect(points[1]![0]).toBeLessThan(0);
    expect(points[2]![0]).toBeGreaterThan(0);
  });

  it('follows sides and loopSize, and loopSize: 0 leaves the self-link without a route', () => {
    const below = pointsOf(arcLayout(SELF, { sides: 'below', loopSize: 30 }), 0);
    expect(at(below, 0, 0.5)[1]).toBeCloseTo(-38, 12);
    // Clockwise below as well: out to the right, back from the left.
    expect(below[1]![0]).toBeGreaterThan(0);
    expect(below[2]![0]).toBeLessThan(0);
    // A self-link points neither forward nor back: above.
    expect(at(pointsOf(arcLayout(SELF, { sides: 'direction' }), 0), 0, 0.5)[1]).toBeCloseTo(20, 12);
    // maxHeight is about arcs.
    expect(arcLayout(SELF, { maxHeight: 2 }).routes).toEqual(arcLayout(SELF).routes);
    const none = arcLayout(SELF, { loopSize: 0 });
    expect(none.routes).toEqual([undefined]);
    expect([...none.x, ...none.y]).toEqual([0, 0]);
  });

  it('leaves self-links out of the span and of the barycenter order', () => {
    const plain = graphOf(5, ZIGZAG);
    const loops = graphOf(5, [...ZIGZAG, [0, 0, 50], [4, 4, 50]]);
    const r = arcLayout(loops, { order: 'barycenter' });
    expect([...r.order]).toEqual([...arcLayout(plain, { order: 'barycenter' }).order]);
    expect(r.span).toBe(4);
    // The loop sits at its node, wherever the order put it.
    expect(pointsOf(r, 5)[0]).toEqual([r.x[4], 0]);
    expect(pointsOf(r, 5)[3]).toEqual([r.x[4], 0]);
  });
});

describe('arc layout: vertical', () => {
  it('is the horizontal drawing turned a quarter turn clockwise', () => {
    fc.assert(
      fc.property(
        graphs,
        fc.constantFrom(...ORDERS),
        fc.constantFrom('above', 'below', 'direction'),
        ([n, links, a, b], order, sides) => {
          const halfA = Float64Array.from(a);
          const halfB = Float64Array.from(b);
          const options = { order, sides, maxHeight: 60 } as const;
          // The same sizes along and across the line in both drawings.
          const h = arcLayout(graphOf(n, links, { halfWidth: halfA, halfHeight: halfB }), options);
          const v = arcLayout(graphOf(n, links, { halfWidth: halfB, halfHeight: halfA }), {
            ...options,
            orientation: 'v',
          });
          expect([...v.order]).toEqual([...h.order]);
          expect(v.span).toBe(h.span);
          // (x, y) → (y, −x).
          for (let i = 0; i < n; i++) {
            expect(v.x[i]).toBeCloseTo(h.y[i]!, 12);
            expect(v.y[i]).toBeCloseTo(-h.x[i]!, 12);
          }
          expect(v.routes).toHaveLength(h.routes.length);
          h.routes.forEach((route, k) => {
            const turned = pointsOf(v, k);
            pointsOf(h, k).forEach(([x, y], j) => {
              expect(turned[j]![0]).toBeCloseTo(y, 12);
              expect(turned[j]![1]).toBeCloseTo(-x, 12);
            });
            expect(v.routes[k]!.kind).toBe(route!.kind);
          });
        },
      ),
    );
  });

  it('puts the first node at the top and the arcs on the right', () => {
    const graph = graphOf(
      3,
      [
        [0, 2],
        [2, 1],
      ],
      { halfWidth: Float64Array.of(50, 50, 50), halfHeight: Float64Array.of(5, 10, 5) },
    );
    const r = arcLayout(graph, { orientation: 'v' });
    // Spaced by the heights: edges at 0 … 80 down the line.
    expect([...r.y]).toEqual([35, 0, -35]);
    expect([...r.x]).toEqual([0, 0, 0]);
    const down = pointsOf(r, 0);
    expect(down[0]).toEqual([0, 35]);
    expect(down[6]).toEqual([0, -35]);
    expect(down[3]).toEqual([35, 0]);
    for (const [x] of down.slice(1, 6)) expect(x).toBeGreaterThan(0);
    for (const [x] of pointsOf(r, 1).slice(1, 6)) expect(x).toBeGreaterThan(0);
    // By direction, a link up the line goes on the left.
    const directed = arcLayout(graph, { orientation: 'v', sides: 'direction' });
    for (const [x] of pointsOf(directed, 0).slice(1, 6)) expect(x).toBeGreaterThan(0);
    for (const [x] of pointsOf(directed, 1).slice(1, 6)) expect(x).toBeLessThan(0);
  });
});

describe('arc layout: edge cases', () => {
  it('lays out no nodes and one node', () => {
    for (const order of ORDERS) {
      for (const orientation of ['h', 'v'] as const) {
        const empty = arcLayout(graphOf(0, []), { order, orientation });
        expect(empty.x).toEqual(new Float64Array(0));
        expect(empty.y).toEqual(new Float64Array(0));
        expect(empty.order).toEqual(new Int32Array(0));
        expect(empty.rank).toEqual(new Int32Array(0));
        expect(empty.routes).toEqual([]);
        expect(empty.span).toBe(0);
        const one = arcLayout(graphOf(1, []), { order, orientation });
        expect([...one.x, ...one.y]).toEqual([0, 0]);
        expect([...one.order, ...one.rank]).toEqual([0, 0]);
        expect(one.span).toBe(0);
      }
    }
  });

  it('gives the same arrays for the same input', () => {
    fc.assert(
      fc.property(
        graphs,
        fc.constantFrom(...ORDERS),
        fc.constantFrom('h', 'v'),
        ([n, links, halfWidth, halfHeight], order, orientation) => {
          const make = (): ArcLayoutResult =>
            arcLayout(
              graphOf(n, links, {
                halfWidth: Float64Array.from(halfWidth),
                halfHeight: Float64Array.from(halfHeight),
              }),
              { order, orientation, sides: 'direction' },
            );
          expect(make()).toEqual(make());
        },
      ),
    );
  });

  it('lays out a hundred thousand nodes without recursion', () => {
    const n = 100_000;
    const links: Link[] = [];
    // A long chain, dealt out of order, and some long-range links.
    for (let i = 0; i + 1 < n; i++) links.push([(i * 7919) % n, ((i + 1) * 7919) % n]);
    for (let i = 0; i < n; i += 10) links.push([i, (i * 31 + 17) % n, 3]);
    const graph = graphOf(n, links);
    const input = arcLayout(graph);
    const r = arcLayout(graph, { order: 'barycenter' });
    expect(r.span).toBeLessThan(input.span);
    expect(r.x.every((v) => Number.isFinite(v))).toBe(true);
    expect(r.routes).toHaveLength(links.length);
    expect(r.routes.every((route) => route!.points.every((v) => Number.isFinite(v)))).toBe(true);
    // 100 000 nodes of 10 with 20 between them.
    expect(r.x[r.order[n - 1]!]! - r.x[r.order[0]!]!).toBeCloseTo((n - 1) * 30, 3);
  });
});
