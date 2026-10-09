import { describe, expect, it } from 'vitest';
import type { LayoutResult, LayoutSimulation } from '../types.ts';
import {
  allFinite,
  cliqueLinks,
  distance,
  makeGraph,
  meanDistance,
  pathLinks,
  radiusAround,
  type LinkSpec,
} from './__testing__/graphs.ts';
import { createForceSimulation, forceLayout } from './index.ts';

type Positions = Pick<LayoutResult | LayoutSimulation, 'x' | 'y' | 'z'>;

/** End-to-end distance of the path `0 – 1 – … – (n − 1)` over its length: 1 when straight. */
function straightness(p: Positions, n: number): number {
  let length = 0;
  for (let i = 0; i + 1 < n; i++) length += distance(p, i, i + 1);
  return distance(p, 0, n - 1) / length;
}

const ringLinks = (n: number): LinkSpec[] =>
  Array.from({ length: n }, (_, i) => [i, (i + 1) % n] as const);

describe('spring layout: what the forces do', () => {
  it('ends linked nodes closer than unlinked ones', () => {
    // Three linked pairs and nothing else.
    const r = forceLayout(
      makeGraph(6, [
        [0, 1],
        [2, 3],
        [4, 5],
      ]),
    );
    const linked = (a: number, b: number): boolean => Math.floor(a / 2) === Math.floor(b / 2);
    const near = meanDistance(r, linked);
    const far = meanDistance(r, (a, b) => !linked(a, b));
    expect(near).toBeLessThan(0.6 * far);
    // A star: every leaf is closer to the hub than to the leaf opposite.
    const star = forceLayout(
      makeGraph(
        7,
        Array.from({ length: 6 }, (_, i) => [0, i + 1] as const),
      ),
    );
    for (let leaf = 1; leaf <= 6; leaf++) {
      const farthest = Math.max(...[1, 2, 3, 4, 5, 6].map((other) => distance(star, leaf, other)));
      expect(distance(star, 0, leaf)).toBeLessThan(0.7 * farthest);
    }
  });

  it('keeps links near linkDistance', () => {
    const graph = makeGraph(2, [[0, 1]]);
    // Two nodes: the spring's rest length, stretched a little by their repulsion.
    expect(distance(forceLayout(graph), 0, 1)).toBeGreaterThan(30);
    expect(distance(forceLayout(graph), 0, 1)).toBeLessThan(36);
    expect(distance(forceLayout(graph, { linkDistance: 100 }), 0, 1)).toBeGreaterThan(100);
    expect(distance(forceLayout(graph, { linkDistance: 100 }), 0, 1)).toBeLessThan(104);
    // Without repulsion, the rest length itself.
    expect(distance(forceLayout(graph, { chargeStrength: 0 }), 0, 1)).toBeCloseTo(30, 1);
  });

  it.each([5, 8, 12])('straightens a path of %i nodes', (n) => {
    const graph = makeGraph(n, pathLinks(n));
    const start = straightness(createForceSimulation(graph), n);
    // The start spiral folds the path over itself.
    expect(start).toBeLessThan(0.3);
    // With d3-force's 300 ticks it unfolds only part of the way (measured 0.43, 0.22, 0.70);
    // given the time it comes out straight.
    expect(straightness(forceLayout(graph, { ticks: 1000 }), n)).toBeGreaterThan(0.9);
    expect(straightness(forceLayout(graph, { ticks: 3000 }), n)).toBeGreaterThan(0.98);
    // Stronger repulsion gets most of the way in the default ticks.
    expect(straightness(forceLayout(graph, { chargeStrength: -300 }), n)).toBeGreaterThan(0.85);
  });

  it('straightens a path in three dimensions too', () => {
    const graph = makeGraph(8, pathLinks(8));
    const r = forceLayout(graph, { ticks: 1000, dimensions: 3 });
    expect(straightness(r, 8)).toBeGreaterThan(0.95);
  });

  it('rounds a ring', () => {
    const n = 10;
    const r = forceLayout(makeGraph(n, ringLinks(n)));
    // Every node at about the same distance from the middle.
    const radii = Array.from({ length: n }, (_, i) => Math.hypot(r.x[i]!, r.y[i]!));
    expect(Math.min(...radii) / Math.max(...radii)).toBeGreaterThan(0.85);
    // Neighbours are closer than nodes across.
    expect(distance(r, 0, 1)).toBeLessThan(0.5 * distance(r, 0, 5));
  });

  it('separates two cliques joined by one link into two clusters', () => {
    const r = forceLayout(makeGraph(12, [...cliqueLinks(0, 6), ...cliqueLinks(6, 6), [0, 6]]));
    const same = (a: number, b: number): boolean => a < 6 === b < 6;
    const within = meanDistance(r, same);
    const between = meanDistance(r, (a, b) => !same(a, b));
    // Measured: 37 within, 145 between.
    expect(between).toBeGreaterThan(2.5 * within);
    // Every node is closer to all of its own clique than to any of the other.
    for (let a = 0; a < 12; a++) {
      let farthestOwn = 0;
      let nearestOther = Infinity;
      for (let b = 0; b < 12; b++) {
        if (a === b) continue;
        if (same(a, b)) farthestOwn = Math.max(farthestOwn, distance(r, a, b));
        else nearestOther = Math.min(nearestOther, distance(r, a, b));
      }
      expect(farthestOwn).toBeLessThan(nearestOther);
    }
  });

  it('lets a link weight set strength or length', () => {
    // A ring of 8 whose first link has another weight than the rest.
    const lengths = (weight: number, linkWeight?: 'strength' | 'distance' | 'none'): number[] => {
      const links = ringLinks(8).map(([s, t], k) => [s, t, k === 0 ? weight : 1] as const);
      const r = forceLayout(makeGraph(8, links), { ticks: 1000, linkWeight });
      return Array.from({ length: 8 }, (_, i) => distance(r, i, (i + 1) % 8));
    };
    // Equal weights: every link as long as the next (measured 40.4, stretched by repulsion).
    const even = lengths(1);
    expect(Math.max(...even) - Math.min(...even)).toBeLessThan(0.5);
    const usual = even[4]!;

    // 'strength' (the default): a heavier link is held tighter, a lighter one looser, and the
    // link across the ring stays as it was. Measured 35.5 and 68.9.
    expect(lengths(4)[0]!).toBeLessThan(usual - 3);
    expect(lengths(0.2)[0]!).toBeGreaterThan(usual + 15);
    expect(lengths(4)[4]!).toBeCloseTo(usual, 0);

    // 'distance': the rest length itself changes, by the inverse of the weight.
    expect(lengths(4, 'distance')[0]!).toBeLessThan(0.6 * usual);
    expect(lengths(0.2, 'distance')[0]!).toBeGreaterThan(2.5 * usual);
    // … within a quarter to four times linkDistance: a thousandth of the weight is no longer.
    expect(lengths(0.001, 'distance')[0]!).toBeLessThan(lengths(0.2, 'distance')[0]! + 10);

    // 'none': weights are not read.
    expect(lengths(4, 'none')).toEqual(even);

    // Equal weights, whatever their size, are no weights.
    const scaled = makeGraph(
      4,
      pathLinks(4).map(([s, t]) => [s, t, 1e6] as const),
    );
    const plain = makeGraph(4, pathLinks(4));
    expect([...forceLayout(scaled).x]).toEqual([...forceLayout(plain).x]);
  });

  it('takes one strength for every link', () => {
    const graph = makeGraph(
      7,
      Array.from({ length: 6 }, (_, i) => [0, i + 1] as const),
    );
    // By default a hub's links are as strong as its leaves' (1 / 1); a weak strength lets go.
    const firm = forceLayout(graph);
    const loose = forceLayout(graph, { linkStrength: 0.02 });
    expect(distance(loose, 0, 1)).toBeGreaterThan(1.5 * distance(firm, 0, 1));
    // More passes over the links stiffen them.
    const stiff = forceLayout(graph, { linkStrength: 0.02, linkIterations: 20 });
    expect(distance(stiff, 0, 1)).toBeLessThan(distance(loose, 0, 1));
  });

  it('spreads with repulsion, gathers with attraction, reaches as far as distanceMax', () => {
    const graph = makeGraph(30);
    const options = { collide: false };
    const base = radiusAround(forceLayout(graph, options));
    expect(radiusAround(forceLayout(graph, { ...options, chargeStrength: -120 }))).toBeGreaterThan(
      1.5 * base,
    );
    // No force at all: the nodes stay on the start spiral (radius 10 × √29.5).
    const still = forceLayout(graph, { ...options, chargeStrength: 0, centerStrength: 0 });
    const start = createForceSimulation(graph, options);
    expect(distance(still, 0, 29)).toBeCloseTo(distance(start, 0, 29), 9);
    // Attraction pulls them onto each other (collision off).
    expect(radiusAround(forceLayout(graph, { ...options, chargeStrength: 30 }))).toBeLessThan(15);
    // A short reach: nodes stop pushing once they are 20 apart.
    const short = radiusAround(forceLayout(graph, { ...options, distanceMax: 20 }));
    expect(short).toBeLessThan(0.7 * base);
  });

  it('centers each component as a whole, without squeezing it', () => {
    // Two triangles and nothing between them.
    const graph = makeGraph(6, [...cliqueLinks(0, 3), ...cliqueLinks(3, 3)]);
    const side = (r: Positions): number => distance(r, 0, 1);
    const apart = (r: Positions): number =>
      Math.hypot(
        (r.x[0]! + r.x[1]! + r.x[2]! - r.x[3]! - r.x[4]! - r.x[5]!) / 3,
        (r.y[0]! + r.y[1]! + r.y[2]! - r.y[3]! - r.y[4]! - r.y[5]!) / 3,
      );
    const none = forceLayout(graph, { centerStrength: 0 });
    const weak = forceLayout(graph);
    const strong = forceLayout(graph, { centerStrength: 1 });
    // The stronger the pull, the closer the two triangles …
    expect(apart(weak)).toBeLessThan(apart(none));
    expect(apart(strong)).toBeLessThan(0.8 * apart(weak));
    // … while each keeps its size: a pull twenty times the default brings them four times as
    // close, and shortens a side by an eighth (their repulsion of each other, not the pull).
    expect(Math.abs(side(strong) / side(none) - 1)).toBeLessThan(0.2);
    expect(Math.abs(side(weak) / side(none) - 1)).toBeLessThan(0.1);
  });

  it('does not pull a component that is held by a pin', () => {
    // The pinned pair sits far from the center given; the free pair is pulled to it.
    const graph = makeGraph(
      4,
      [
        [0, 1],
        [2, 3],
      ],
      { x: [1000], y: [1000] },
    );
    const r = forceLayout(graph, { center: [0, 0], centerStrength: 1 });
    expect([r.x[0], r.y[0]]).toEqual([1000, 1000]);
    // Node 1 stays a link's length from its pinned neighbour: gravity did not stretch the link.
    expect(distance(r, 0, 1)).toBeLessThan(40);
    expect(Math.hypot(r.x[2]!, r.y[2]!)).toBeLessThan(100);
  });

  it('damps more with a higher velocityDecay', () => {
    const graph = makeGraph(20, pathLinks(20));
    const moved = (velocityDecay: number): number => {
      const simulation = createForceSimulation(graph, { velocityDecay });
      const x = Float64Array.from(simulation.x);
      const y = Float64Array.from(simulation.y);
      simulation.tick(5);
      let sum = 0;
      for (let i = 0; i < 20; i++)
        sum += Math.hypot(simulation.x[i]! - x[i]!, simulation.y[i]! - y[i]!);
      return sum;
    };
    expect(moved(0.9)).toBeLessThan(0.5 * moved(0.2));
    // Fully damped: nothing moves at all.
    expect(moved(1)).toBe(0);
  });

  it('gives nearly the same layout with the exact sum as with Barnes–Hut', () => {
    const graph = makeGraph(40, [...cliqueLinks(0, 8), ...pathLinks(40)]);
    const exact = forceLayout(graph, { theta: 0 });
    const fast = forceLayout(graph, { theta: 0.9 });
    expect(allFinite(exact)).toBe(true);
    // Not the same numbers, the same picture: sizes within a fifth of each other.
    expect(Math.abs(radiusAround(fast) / radiusAround(exact) - 1)).toBeLessThan(0.2);
  });

  it('starts on the phyllotaxis spiral, a ball in three dimensions', () => {
    const flat = createForceSimulation(makeGraph(200));
    // Node i at radius 10 × √(i + ½) and angle i × the golden angle.
    for (const i of [0, 1, 7, 199]) {
      const radius = 10 * Math.sqrt(i + 0.5);
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      expect(flat.x[i]).toBeCloseTo(radius * Math.cos(angle), 9);
      expect(flat.y[i]).toBeCloseTo(radius * Math.sin(angle), 9);
    }
    const ball = createForceSimulation(makeGraph(200), { dimensions: 3, initialRadius: 5 });
    let closest = Infinity;
    for (let i = 0; i < 200; i++) {
      expect(Math.hypot(ball.x[i]!, ball.y[i]!, ball.z![i]!)).toBeCloseTo(
        5 * Math.cbrt(i + 0.5),
        9,
      );
      for (let j = i + 1; j < 200; j++) closest = Math.min(closest, distance(ball, i, j));
    }
    // Evenly filled: no two nodes start close together, and every octant is used.
    expect(closest).toBeGreaterThan(2.5);
    const octants = new Set<number>();
    for (let i = 0; i < 200; i++) {
      octants.add((ball.x[i]! > 0 ? 1 : 0) | (ball.y[i]! > 0 ? 2 : 0) | (ball.z![i]! > 0 ? 4 : 0));
    }
    expect(octants.size).toBe(8);
  });

  it('starts free nodes around the pinned ones', () => {
    const graph = makeGraph(20, pathLinks(20), { x: [500, 700], y: [300, 300] });
    const simulation = createForceSimulation(graph);
    expect(radiusAround(simulation, 600, 300)).toBeLessThan(150);
  });
});
