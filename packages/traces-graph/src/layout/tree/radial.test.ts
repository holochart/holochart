import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LinkRoute } from '../types.ts';
import { radialTreeLayout, type RadialTreeOptions, type RadialTreeResult } from './radial.ts';
import {
  arbitraryForest,
  arbitraryTree,
  linkGraph,
  mirrorParents,
  scrambledTree,
  treeGraph,
} from './testing.ts';

const list = (a: ArrayLike<number>): number[] => Array.from(a);
const EPS = 1e-7;
const RAD = Math.PI / 180;
const round = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Visible nodes by ring (depth, plus one in a forest), each ring in the order of the tree. */
function ringsOf(result: RadialTreeResult): number[][] {
  const { parent, hidden, depth } = result;
  const kids: number[][] = list(parent).map(() => []);
  parent.forEach((p, i) => p >= 0 && kids[p]!.push(i));
  const roots = list(parent).flatMap((p, i) => (p < 0 ? [i] : []));
  const shift = roots.length > 1 ? 1 : 0;
  const rings: number[][] = [];
  const stack = roots.reverse();
  while (stack.length > 0) {
    const v = stack.pop()!;
    if (hidden[v]) continue;
    (rings[depth[v]! + shift] ??= []).push(v);
    for (let c = kids[v]!.length - 1; c >= 0; c--) stack.push(kids[v]![c]!);
  }
  return Array.from(rings, (ring) => ring ?? []);
}

/** The checks every radial tree passes. */
function expectRadial(
  graph: LayoutGraph,
  result: RadialTreeResult,
  options: RadialTreeOptions,
): void {
  const nodesep = options.nodesep ?? 20;
  const subtreesep = options.subtreesep ?? nodesep;
  const ranksep = options.ranksep ?? 50;
  const { x, y, angle, radius, parent } = result;
  const reach = (i: number): number => Math.hypot(graph.halfWidth[i]!, graph.halfHeight[i]!);
  const rings = ringsOf(result);
  let inner = 0;
  let innerReach = 0;
  rings.forEach((ring, d) => {
    let ringReach = 0;
    ring.forEach((v, k) => {
      expect(Number.isFinite(x[v]! + y[v]! + angle[v]! + radius[v]!)).toBe(true);
      // Everyone on the ring at one radius, where the polar position says.
      expect(radius[v]).toBeCloseTo(radius[ring[0]!]!, 9);
      expect(x[v]).toBeCloseTo(radius[v]! * Math.cos(angle[v]! * RAD), 6);
      expect(y[v]).toBeCloseTo(radius[v]! * Math.sin(angle[v]! * RAD), 6);
      ringReach = Math.max(ringReach, reach(v));
      // The next node of the ring in tree order, and the first after the last, are clear.
      const u = ring[k === 0 ? ring.length - 1 : k - 1]!;
      if (u === v) return;
      const sep = parent[u]! >= 0 && parent[u] === parent[v] ? nodesep : subtreesep;
      const apart = Math.hypot(x[v]! - x[u]!, y[v]! - y[u]!);
      expect(apart).toBeGreaterThanOrEqual(reach(u) + reach(v) + sep - EPS);
    });
    if (ring.length === 0) return;
    const r = radius[ring[0]!]!;
    // Radii grow with depth, by `ranksep` and the reach of the largest nodes at least.
    if (d === 0) expect(r).toBe(0);
    else expect(r - inner).toBeGreaterThanOrEqual(innerReach + ranksep + ringReach - EPS);
    inner = r;
    innerReach = ringReach;
  });
}

describe('radial tree: rings and angles', () => {
  it('puts the root in the centre and spreads its children round the circle', () => {
    const r = radialTreeLayout(treeGraph([-1, 0, 0, 0, 0]));
    expect([r.x[0], r.y[0], r.radius[0]]).toEqual([0, 0, 0]);
    // Four leaves and the gap that closes the circle, centred on the start angle.
    expect(list(r.angle).slice(1).map(round)).toEqual([45, 135, 225, 315]);
    expect(list(r.radius).slice(1)).toEqual([50, 50, 50, 50]);
    expect([round(r.x[1]!), round(r.y[1]!)]).toEqual([
      round(50 * Math.SQRT1_2),
      round(50 * Math.SQRT1_2),
    ]);
  });

  it('spaces rings evenly when the tree fits', () => {
    //      0
    //    1   2
    //   3 4  5
    //   6
    const graph = treeGraph([-1, 0, 0, 1, 1, 2, 3], { halfWidth: 3, halfHeight: 4 });
    const r = radialTreeLayout(graph, { ranksep: 60, nodesep: 5 });
    // A node's reach is half its diagonal, 5: rings are 60 + 5 + 5 apart.
    expect(list(r.radius)).toEqual([0, 70, 70, 140, 140, 140, 210]);
    expectRadial(graph, r, { ranksep: 60, nodesep: 5 });
  });

  it('keeps each subtree in one stretch of every ring, parents centred over their children', () => {
    fc.assert(
      fc.property(arbitraryTree(50), (parents) => {
        const r = radialTreeLayout(treeGraph(parents, { halfWidth: 4, halfHeight: 4 }));
        for (const ring of ringsOf(r)) {
          // In tree order the angles only grow, and stay within one turn.
          for (let k = 1; k < ring.length; k++) {
            expect(r.angle[ring[k]!]!).toBeGreaterThan(r.angle[ring[k - 1]!]!);
          }
          if (ring.length > 1)
            expect(r.angle[ring.at(-1)!]! - r.angle[ring[0]!]!).toBeLessThan(360);
        }
        const kids: number[][] = parents.map(() => []);
        parents.forEach((p, i) => p >= 0 && kids[p]!.push(i));
        kids.forEach((c, p) => {
          if (p === 0 || c.length === 0) return;
          expect(r.angle[p]).toBeCloseTo((r.angle[c[0]!]! + r.angle[c.at(-1)!]!) / 2, 6);
        });
      }),
    );
  });

  it('pushes a crowded ring out until its nodes clear each other', () => {
    // A hundred leaves of radius 10: far more than a ring of radius 50 + 10·√2 holds.
    const n = 101;
    const graph = treeGraph(
      Array.from({ length: n }, (_, i) => (i === 0 ? -1 : 0)),
      { halfWidth: 10, halfHeight: 10 },
    );
    const r = radialTreeLayout(graph, { nodesep: 6 });
    const room = 2 * Math.hypot(10, 10) + 6;
    expect(r.radius[1]).toBeCloseTo(room / (2 * Math.sin(Math.PI / 100)), 6);
    expect(Math.hypot(r.x[2]! - r.x[1]!, r.y[2]! - r.y[1]!)).toBeCloseTo(room, 6);
    expectRadial(graph, r, { nodesep: 6 });
  });

  it('pushes only the rings that need it', () => {
    // One child, which has sixty: the first ring stays at `ranksep`, the second grows.
    const parents = [-1, 0, ...new Array<number>(60).fill(1)];
    const graph = treeGraph(parents, { halfWidth: 5, halfHeight: 5 });
    const r = radialTreeLayout(graph);
    expect(r.radius[1]).toBeCloseTo(50 + 2 * Math.hypot(5, 5), 9);
    expect(r.radius[2]!).toBeGreaterThan(250);
    expectRadial(graph, r, {});
  });

  it('never lets neighbours overlap, whatever the forest, sizes and sector', () => {
    fc.assert(
      fc.property(
        arbitraryForest().chain((parents) =>
          fc.tuple(
            fc.constant(parents),
            fc.array(fc.double({ min: 0, max: 30, noNaN: true }), {
              minLength: 2 * parents.length,
              maxLength: 2 * parents.length,
            }),
          ),
        ),
        fc.record({
          nodesep: fc.double({ min: 0, max: 30, noNaN: true }),
          subtreesep: fc.double({ min: 0, max: 50, noNaN: true }),
          ranksep: fc.double({ min: 0, max: 80, noNaN: true }),
          // Not the narrowest sectors: a tree in a sliver of a degree is finite but astronomical.
          sector: fc.record({
            start: fc.double({ min: -720, max: 720, noNaN: true }),
            span: fc.oneof(fc.double({ min: 1, max: 400 }), fc.double({ min: -400, max: -1 })),
          }),
        }),
        ([parents, sizes], options) => {
          const n = parents.length;
          const graph = treeGraph(parents, {
            halfWidth: sizes.slice(0, n),
            halfHeight: sizes.slice(n),
          });
          const result = radialTreeLayout(graph, options);
          expectRadial(graph, result, options);
          expect(radialTreeLayout(graph, options)).toEqual(result);
        },
      ),
    );
  });

  it('keeps all nodes of equal size apart, not only neighbours', () => {
    fc.assert(
      fc.property(arbitraryForest(30), (parents) => {
        const r = radialTreeLayout(treeGraph(parents, { halfWidth: 6, halfHeight: 6 }), {
          nodesep: 4,
          ranksep: 10,
        });
        for (let i = 0; i < parents.length; i++) {
          for (let j = 0; j < i; j++) {
            const apart = Math.hypot(r.x[i]! - r.x[j]!, r.y[i]! - r.y[j]!);
            expect(apart).toBeGreaterThanOrEqual(2 * Math.hypot(6, 6) - EPS);
          }
        }
      }),
    );
  });

  it('draws the mirror image of a tree mirrored about the middle of the sector', () => {
    fc.assert(
      fc.property(arbitraryTree(40), (parents) => {
        const n = parents.length;
        const a = radialTreeLayout(treeGraph(parents));
        const b = radialTreeLayout(treeGraph(mirrorParents(parents)));
        // The full circle from 0°: its middle is the −x axis, so y flips.
        for (let i = 0; i < n; i++) {
          expect(b.x[n - 1 - i]).toBeCloseTo(a.x[i]!, 6);
          expect(b.y[n - 1 - i]).toBeCloseTo(-a.y[i]!, 6);
        }
      }),
    );
  });
});

describe('radial tree: sector', () => {
  //      0
  //   1  2  3
  //  4 5    6
  const parents = [-1, 0, 0, 0, 1, 1, 3];

  it('fans the tree out over the sector, from edge to edge', () => {
    const r = radialTreeLayout(treeGraph(parents), { sector: { start: 30, span: 120 } });
    const angles = list(r.angle).slice(1);
    for (const a of angles) {
      expect(a).toBeGreaterThanOrEqual(30 - EPS);
      expect(a).toBeLessThanOrEqual(150 + EPS);
    }
    expect(Math.min(...angles)).toBeCloseTo(30, 9);
    expect(Math.max(...angles)).toBeCloseTo(150, 9);
    // First child first, counter-clockwise.
    expect(r.angle[1]!).toBeLessThan(r.angle[2]!);
    expect(r.angle[2]!).toBeLessThan(r.angle[3]!);
  });

  it('runs clockwise for a negative span', () => {
    const r = radialTreeLayout(treeGraph(parents), { sector: { start: 90, span: -180 } });
    const angles = list(r.angle).slice(1);
    expect(Math.min(...angles)).toBeCloseTo(-90, 9);
    expect(Math.max(...angles)).toBeCloseTo(90, 9);
    expect(r.angle[1]!).toBeGreaterThan(r.angle[3]!);
    // Every node is in the right half plane.
    expect(Math.min(...r.x)).toBeGreaterThanOrEqual(-EPS);
  });

  it('grows the rings when the sector is narrow', () => {
    const graph = treeGraph(parents, { halfWidth: 10, halfHeight: 10 });
    const wide = radialTreeLayout(graph, { sector: { span: 180 } });
    const narrow = radialTreeLayout(graph, { sector: { span: 20 } });
    expect(narrow.radius[4]!).toBeGreaterThan(wide.radius[4]!);
    expectRadial(graph, narrow, {});
    for (const a of list(narrow.angle).slice(1)) {
      expect(a).toBeGreaterThanOrEqual(-EPS);
      expect(a).toBeLessThanOrEqual(20 + EPS);
    }
  });

  it('puts a chain on the middle of the sector', () => {
    const r = radialTreeLayout(treeGraph([-1, 0, 1]), { sector: { start: 0, span: 90 } });
    expect(list(r.angle).map(round)).toEqual([45, 45, 45]);
    expect(list(r.radius)).toEqual([0, 50, 100]);
  });

  it('reads a span of 0, a span beyond a turn and junk as the full circle', () => {
    const full = radialTreeLayout(treeGraph(parents));
    expect(radialTreeLayout(treeGraph(parents), { sector: { span: 0 } })).toEqual(full);
    expect(radialTreeLayout(treeGraph(parents), { sector: { span: 900 } })).toEqual(full);
    expect(radialTreeLayout(treeGraph(parents), { sector: { start: NaN, span: NaN } })).toEqual(
      full,
    );
    expect(radialTreeLayout(treeGraph(parents), { sector: {} })).toEqual(full);
  });

  it('leaves room to close a sector that is almost a full circle', () => {
    // 359° would put the first and last leaf on top of each other; the tree keeps its closing gap.
    const graph = treeGraph([-1, 0, 0, 0, 0], { halfWidth: 8, halfHeight: 8 });
    const r = radialTreeLayout(graph, { sector: { span: 359 } });
    expect(r.radius[1]).toBeCloseTo(50 + 2 * Math.hypot(8, 8), 9);
    expectRadial(graph, r, {});
  });
});

describe('radial tree: forests and graphs', () => {
  it('puts the roots of a forest on the first ring around an empty centre', () => {
    const graph = treeGraph([-1, 0, -1, 2, -1]);
    const r = radialTreeLayout(graph);
    expect([r.radius[0], r.radius[2], r.radius[4]]).toEqual([50, 50, 50]);
    expect([r.radius[1], r.radius[3]]).toEqual([100, 100]);
    expect(r.angle[0]!).toBeLessThan(r.angle[2]!);
    expect(r.angle[2]!).toBeLessThan(r.angle[4]!);
    expectRadial(graph, r, {});
  });

  it('lays out a graph given as links and says which are tree edges', () => {
    const r = radialTreeLayout(
      linkGraph(4, [
        [0, 1],
        [0, 2],
        [1, 2],
        [2, 3],
      ]),
    );
    expect(list(r.parent)).toEqual([-1, 0, 0, 2]);
    expect(list(r.treeLinks)).toEqual([1, 1, 0, 1]);
    expect(list(r.radius)).toEqual([0, 50, 50, 100]);
  });

  it('sorts siblings on request', () => {
    const graph = treeGraph([-1, 0, 0, 2, 2]);
    expect(radialTreeLayout(graph).angle[1]!).toBeLessThan(radialTreeLayout(graph).angle[2]!);
    const sorted = radialTreeLayout(graph, { sort: 'size' });
    expect(sorted.angle[2]!).toBeLessThan(sorted.angle[1]!);
  });
});

describe('radial tree: collapse', () => {
  //      0
  //   1     2
  //  3 4   5 6
  //  7
  const parents = [-1, 0, 0, 1, 1, 2, 2, 3];
  const graph = treeGraph(parents, { halfWidth: 5, halfHeight: 5 });

  it('parks hidden nodes on their collapsed ancestor, polar position included', () => {
    const r = radialTreeLayout(graph, { collapsed: [1] });
    expect(list(r.hidden)).toEqual([0, 0, 0, 1, 1, 0, 0, 1]);
    for (const i of [3, 4, 7]) {
      expect([r.x[i], r.y[i], r.angle[i], r.radius[i]]).toEqual([
        r.x[1],
        r.y[1],
        r.angle[1],
        r.radius[1],
      ]);
    }
    expectRadial(graph, r, {});
  });

  it('lays the rest out as if the subtree were not there', () => {
    const r = radialTreeLayout(graph, { collapsed: [1] });
    const without = radialTreeLayout(treeGraph([-1, 0, 0, 2, 2], { halfWidth: 5, halfHeight: 5 }));
    expect([0, 1, 2, 5, 6].map((i) => r.x[i])).toEqual(list(without.x));
    expect([0, 1, 2, 5, 6].map((i) => r.y[i])).toEqual(list(without.y));
    // One ring fewer.
    expect(Math.max(...r.radius)).toBeLessThan(Math.max(...radialTreeLayout(graph).radius));
  });

  it('collapsing the root leaves everything in the centre', () => {
    const r = radialTreeLayout(graph, { collapsed: new Uint8Array([1]), links: 'curved' });
    expect(list(r.x)).toEqual(new Array(8).fill(0));
    expect(list(r.y)).toEqual(new Array(8).fill(0));
    expect(r.parentRoutes!.every((route) => route === undefined)).toBe(true);
  });
});

/** A point of a cubic Bézier chain: segment `k`, parameter `t`. */
function splinePoint(route: LinkRoute, k: number, t: number): [number, number] {
  const p = route.points;
  const at = (axis: number): number => {
    const [a, b, c, d] = [0, 1, 2, 3].map((i) => p[2 * (3 * k + i) + axis]!) as [
      number,
      number,
      number,
      number,
    ];
    const s = 1 - t;
    return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
  };
  return [at(0), at(1)];
}

describe('radial tree: link routes', () => {
  //      0
  //    1   2
  //  3 4 5
  const parents = [-1, 0, 0, 1, 1, 1];
  const links: [number, number][] = [
    [0, 1],
    [1, 3],
    [5, 1], // drawn child → parent
    [1, 4], // on its parent's radius
    [3, 5], // not a tree edge
  ];
  const graph = treeGraph(parents, { links });
  const polar = (r: RadialTreeResult, i: number, radius = r.radius[i]!): number[] => [
    radius * Math.cos(r.angle[i]! * RAD),
    radius * Math.sin(r.angle[i]! * RAD),
  ];
  const close = (a: readonly number[], b: readonly number[]): void => {
    expect(a).toHaveLength(b.length);
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));
  };

  it('returns none for straight links', () => {
    const r = radialTreeLayout(graph);
    expect(r.routes).toBeUndefined();
    expect(r.parentRoutes).toBeUndefined();
  });

  it('curves along the radii of the two ends', () => {
    const r = radialTreeLayout(graph, { links: 'curved' });
    const route = r.routes![1]!;
    expect(route.kind).toBe('spline');
    const middle = (r.radius[1]! + r.radius[3]!) / 2;
    close(list(route.points), [
      ...polar(r, 1),
      ...polar(r, 1, middle),
      ...polar(r, 3, middle),
      ...polar(r, 3),
    ]);
    // From the link's source, here the child.
    close(list(r.routes![2]!.points).slice(0, 2), polar(r, 5));
    close(list(r.routes![2]!.points).slice(6), polar(r, 1));
    // Links from the centre are straight, and the extra link has no route.
    expect(r.routes![0]).toBeUndefined();
    expect(r.routes![4]).toBeUndefined();
    expect(r.routes).toHaveLength(5);
  });

  it('draws elbows as a radial step, an arc between the rings and a radial step', () => {
    const r = radialTreeLayout(graph, { links: 'elbow' });
    const route = r.parentRoutes![3]!;
    expect(route.kind).toBe('spline');
    // Three cubics: out, round, out.
    expect(route.points).toHaveLength(2 * 10);
    close(list(route.points).slice(0, 2), polar(r, 1));
    close(list(route.points).slice(-2), polar(r, 3));
    const bar = (r.radius[1]! + r.radius[3]!) / 2;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      // The first and last piece stay on the radii of the two ends.
      const out = splinePoint(route, 0, t);
      expect(Math.atan2(out[1], out[0]) / RAD).toBeCloseTo(r.angle[1]!, 6);
      const back = splinePoint(route, 2, t);
      expect(Math.atan2(back[1], back[0]) / RAD).toBeCloseTo(r.angle[3]!, 6);
      // The middle piece is a circle about the centre, to within 0.1 %.
      const round = Math.hypot(...splinePoint(route, 1, t));
      expect(Math.abs(round / bar - 1)).toBeLessThan(1e-3);
    }
    // A child on its parent's radius is a straight link, as are links from the centre.
    expect(r.angle[4]).toBeCloseTo(r.angle[1]!, 9);
    expect(r.parentRoutes![4]).toBeUndefined();
    expect(r.parentRoutes![1]).toBeUndefined();
  });

  it('splits a long arc into pieces of a quarter turn at most', () => {
    // Three children of one node, spread round the circle by their own subtrees: the last is a
    // third of a turn from its parent.
    const leaves = (p: number): number[] => new Array<number>(20).fill(p);
    const wide = [-1, 0, 1, 1, 1, ...leaves(2), ...leaves(3), ...leaves(4)];
    const r = radialTreeLayout(treeGraph(wide), { links: 'elbow' });
    const sweep = Math.abs(r.angle[4]! - r.angle[1]!);
    expect(sweep).toBeGreaterThan(100);
    expect(sweep).toBeLessThan(170);
    const route = r.parentRoutes![4]!;
    const pieces = (route.points.length / 2 - 1) / 3 - 2;
    expect(pieces).toBe(2);
    const bar = (r.radius[1]! + r.radius[4]!) / 2;
    for (let k = 1; k <= pieces; k++) {
      for (const t of [0, 0.3, 0.5, 0.8, 1]) {
        expect(Math.abs(Math.hypot(...splinePoint(route, k, t)) / bar - 1)).toBeLessThan(1e-3);
      }
    }
  });
});

describe('radial tree: sizes of input', () => {
  it('handles no nodes, one node and nodes without size or spacing', () => {
    expect(radialTreeLayout(treeGraph([])).x).toHaveLength(0);
    const one = radialTreeLayout(treeGraph([-1]), { links: 'elbow' });
    expect([one.x[0], one.y[0], one.radius[0]]).toEqual([0, 0, 0]);
    // Nothing to keep apart: everything may sit in the centre, but stays finite.
    const flat = radialTreeLayout(treeGraph([-1, 0, 0, 1]), { nodesep: 0, ranksep: 0 });
    expect(list(flat.x).every(Number.isFinite)).toBe(true);
    expect(list(flat.radius)).toEqual([0, 0, 0, 0]);
  });

  it('lays out 10,000 nodes quickly', () => {
    const graph = treeGraph(scrambledTree(10_000), { halfWidth: 4, halfHeight: 4 });
    radialTreeLayout(graph);
    const start = performance.now();
    const r = radialTreeLayout(graph, { links: 'curved' });
    expect(performance.now() - start).toBeLessThan(500);
    expect(list(r.x).every(Number.isFinite)).toBe(true);
    expect(list(r.radius).every(Number.isFinite)).toBe(true);
  });
});
