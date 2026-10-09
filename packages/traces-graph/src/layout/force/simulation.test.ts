import { describe, expect, it } from 'vitest';
import type { GraphLayout, LayoutResult, LayoutSimulation } from '../types.ts';
import {
  allFinite,
  cliqueLinks,
  deepestOverlap,
  distance,
  makeGraph,
  meanDistance,
  pathLinks,
  plantedPartition,
  radiusAround,
  randomLinks,
  seeded,
  type LinkSpec,
} from './__testing__/graphs.ts';
import {
  createForceSimulation,
  defaultTicks,
  forceLayout,
  type ForceAlgorithm,
  type ForceOptions,
} from './index.ts';

// The layout is a `GraphLayout`, callable without options too.
const asLayout: GraphLayout<ForceOptions> = forceLayout;
void asLayout;

type Positions = Pick<LayoutResult | LayoutSimulation, 'x' | 'y' | 'z'>;

/** The exact bits of every coordinate, so `-0`, `0` and the last bit of a double all count. */
function bits(p: Positions): string[] {
  const of = (a: Float64Array | undefined): string =>
    a ? [...new BigUint64Array(Float64Array.from(a).buffer)].join(',') : '-';
  return [of(p.x), of(p.y), of(p.z)];
}

const ALGORITHMS: readonly ForceAlgorithm[] = ['spring', 'forceatlas2'];
const CASES = ALGORITHMS.flatMap((algorithm) =>
  ([2, 3] as const).map((dimensions) => ({ algorithm, dimensions })),
);

/** A graph with some structure: four planted groups of 15 and a few stray nodes. */
function sample(extra = 5): { nodes: number; links: LinkSpec[]; group: number[] } {
  const base = plantedPartition(4, 15, 0.35, 0.02, 9);
  return {
    nodes: base.nodes + extra,
    links: base.links,
    group: [...base.group, ...Array.from({ length: extra }, () => -1)],
  };
}

describe.each(CASES)('force layout ($algorithm, $dimensions-D): determinism', (options) => {
  it('gives bit-identical positions for the same input', () => {
    const { nodes, links } = sample();
    const a = forceLayout(makeGraph(nodes, links), options);
    const b = forceLayout(makeGraph(nodes, links), options);
    expect(bits(b)).toEqual(bits(a));
    expect(allFinite(a)).toBe(true);
  });

  it('steps the same whether ticked one at a time or all at once', () => {
    const { nodes, links } = sample();
    const a = createForceSimulation(makeGraph(nodes, links), options);
    const b = createForceSimulation(makeGraph(nodes, links), options);
    a.tick(120);
    for (let k = 0; k < 120; k++) b.tick();
    expect(bits(b)).toEqual(bits(a));
    expect(b.alpha).toBe(a.alpha);
  });

  it('does not depend on the order or the direction the links are listed in', () => {
    const { nodes, links } = sample();
    const shuffled = [...links].reverse().map(([s, t], k) => (k % 2 ? [s, t] : [t, s]) as LinkSpec);
    const a = forceLayout(makeGraph(nodes, links), options);
    const b = forceLayout(makeGraph(nodes, shuffled), options);
    expect(bits(b)).toEqual(bits(a));
  });

  it('ignores the seed unless nodes coincide, and then follows it', () => {
    const { nodes, links } = sample();
    const graph = makeGraph(nodes, links);
    expect(bits(forceLayout(graph, { ...options, seed: 99 }))).toEqual(
      bits(forceLayout(graph, { ...options, seed: 1 })),
    );

    // Node 1 is pinned exactly where node 0 starts: the two part in a drawn direction.
    const start = createForceSimulation(makeGraph(4, [[2, 3]]), options);
    const pin = (v: number): number[] => [NaN, v];
    const stacked = makeGraph(4, [[2, 3]], {
      x: pin(start.x[0]!),
      y: pin(start.y[0]!),
      ...(options.dimensions === 3 ? { z: pin(start.z![0]!) } : {}),
    });
    // The pin moves the default center; keep the start where the first simulation had it.
    const fixed = { ...options, center: [0, 0, 0] };
    const one = forceLayout(stacked, { ...fixed, seed: 1 });
    expect(bits(forceLayout(stacked, { ...fixed, seed: 1 }))).toEqual(bits(one));
    expect(bits(forceLayout(stacked, { ...fixed, seed: 2 }))).not.toEqual(bits(one));
    expect(allFinite(one)).toBe(true);
    expect(distance(one, 0, 1)).toBeGreaterThan(1);
  });
});

describe.each(CASES)('force layout ($algorithm, $dimensions-D): shape of the result', (options) => {
  const three = options.dimensions === 3;

  it(three ? 'uses the third dimension' : 'has no z', () => {
    const { nodes, links } = sample();
    const result = forceLayout(makeGraph(nodes, links), options);
    const simulation = createForceSimulation(makeGraph(nodes, links), options);
    expect(result.x).toHaveLength(nodes);
    expect(result.y).toHaveLength(nodes);
    if (!three) {
      expect('z' in result).toBe(false);
      expect('z' in simulation).toBe(false);
      return;
    }
    expect(result.z).toHaveLength(nodes);
    expect(simulation.z).toHaveLength(nodes);
    // Not flat: the spread along z is of the order of the spread along x and y.
    const spread = (a: Float64Array): number => Math.max(...a) - Math.min(...a);
    expect(spread(result.z!)).toBeGreaterThan(0.3 * spread(result.x));
    expect(spread(result.z!)).toBeGreaterThan(0.3 * spread(result.y));
  });

  it('centers the box around the nodes on the origin, or on `center`', () => {
    const { nodes, links } = sample();
    const sizes = Array.from({ length: nodes }, (_, i) => 3 + (i % 7));
    const graph = makeGraph(nodes, links, { size: sizes });
    const middle = (p: Float64Array, e: (i: number) => number): number => {
      let lo = Infinity;
      let hi = -Infinity;
      p.forEach((v, i) => {
        lo = Math.min(lo, v - e(i));
        hi = Math.max(hi, v + e(i));
      });
      return (lo + hi) / 2;
    };
    const a = forceLayout(graph, options);
    expect(middle(a.x, (i) => sizes[i]!)).toBeCloseTo(0, 9);
    expect(middle(a.y, (i) => sizes[i]!)).toBeCloseTo(0, 9);
    if (three) expect(middle(a.z!, () => 0)).toBeCloseTo(0, 9);

    const b = forceLayout(graph, { ...options, center: [500, -200, 40] });
    expect(middle(b.x, (i) => sizes[i]!)).toBeCloseTo(500, 9);
    expect(middle(b.y, (i) => sizes[i]!)).toBeCloseTo(-200, 9);
    if (three) expect(middle(b.z!, () => 0)).toBeCloseTo(40, 9);
    // The same layout, moved (to within what rounding at another place grows into).
    expect(Math.abs(distance(b, 0, 7) / distance(a, 0, 7) - 1)).toBeLessThan(0.05);
  });

  it('keeps disconnected parts within a bounded radius', () => {
    // A clique, a path, a pair and 25 nodes with no link at all.
    const links = [
      ...cliqueLinks(0, 5),
      ...pathLinks(8).map(([s, t]) => [s + 5, t + 5] as const),
      [13, 14] as const,
    ];
    const graph = makeGraph(40, links);
    const rest = forceLayout(graph, options);
    expect(allFinite(rest)).toBe(true);
    // Measured: 115 to 205 depending on the algorithm and the dimensions.
    expect(radiusAround(rest)).toBeLessThan(700);
    // And it has stopped spreading: ten times the ticks changes the radius by a bounded factor,
    // where free drift would grow with the ticks.
    const long = forceLayout(graph, { ...options, ticks: 3000 });
    expect(radiusAround(long)).toBeLessThan(2 * radiusAround(rest));
  });

  it('leaves no overlapping nodes, with or without padding', () => {
    const next = seeded(3);
    const n = 80;
    const sizes = Array.from({ length: n }, () => 6 + next() * 14);
    const graph = makeGraph(n, randomLinks(n, 160, 5), { size: sizes });
    const free = forceLayout(graph, { ...options, collide: false });
    expect(deepestOverlap(free, (i) => sizes[i]!)).toBeGreaterThan(5);

    const packed = forceLayout(graph, options);
    expect(deepestOverlap(packed, (i) => sizes[i]!)).toBeLessThanOrEqual(0);
    const padded = forceLayout(graph, { ...options, collidePadding: 6 });
    expect(deepestOverlap(padded, (i) => sizes[i]! + 3)).toBeLessThanOrEqual(0);
  });

  it('opens a clique of nodes far larger than its links are long', () => {
    const result = forceLayout(makeGraph(30, cliqueLinks(0, 30), { size: 20 }), options);
    expect(deepestOverlap(result, () => 20)).toBeLessThanOrEqual(0);
  });

  it('pulls groups together with groupStrength', () => {
    const n = 60;
    const group = Array.from({ length: n }, (_, i) => i % 3);
    const graph = makeGraph(n, randomLinks(n, 90, 11), { group });
    const same = (a: number, b: number): boolean => group[a] === group[b];
    const ratio = (groupStrength: number): number => {
      const r = forceLayout(graph, { ...options, groupStrength });
      return meanDistance(r, same) / meanDistance(r, (a, b) => !same(a, b));
    };
    // Groups are dealt at random over the links, so without the force they do not show.
    const off = ratio(0);
    expect(off).toBeGreaterThan(0.9);
    // In ForceAtlas2 the force is a link of that weight, beside links of weight 1 and repulsion.
    const strong = ratio(options.algorithm === 'spring' ? 0.3 : 3);
    expect(strong).toBeLessThan(0.75 * off);
  });

  it('pulls nodes toward per-node targets along one axis', () => {
    const n = 30;
    const target = Array.from({ length: n }, (_, i) => i * 20);
    const graph = makeGraph(n, randomLinks(n, 40, 3));
    const error = (xStrength: number): number => {
      const r = forceLayout(graph, { ...options, xTarget: target, xStrength, yTarget: 0 });
      let sum = 0;
      for (let i = 0; i < n; i++) sum += Math.abs(r.x[i]! - target[i]!) / n;
      return sum;
    };
    // The targets are absolute: the result is not re-centered along x. Stronger is closer.
    const weak = error(0.1);
    const strong = error(3);
    expect(strong).toBeLessThan(0.6 * weak);
    expect(strong).toBeLessThan(80);
  });
});

describe.each(CASES)('force layout ($algorithm, $dimensions-D): pinned nodes', (options) => {
  const three = options.dimensions === 3;

  it('leaves a pinned node where it is and lets it act on the others', () => {
    const graph = makeGraph(6, pathLinks(6), {
      x: [100, NaN, NaN, NaN, NaN, 400],
      y: [50, NaN, NaN, NaN, NaN, 50],
      z: [10, NaN, NaN, NaN, NaN, 10],
    });
    const r = forceLayout(graph, options);
    expect([r.x[0], r.y[0], r.x[5], r.y[5]]).toEqual([100, 50, 400, 50]);
    if (three) expect([r.z![0], r.z![5]]).toEqual([10, 10]);
    // The path hangs between its two pinned ends, in order.
    for (let i = 1; i < 5; i++) {
      expect(r.x[i]!).toBeGreaterThan(r.x[i - 1]!);
      expect(r.x[i]!).toBeLessThan(400);
    }
  });

  it('holds a node with one coordinate given on that axis only', () => {
    const graph = makeGraph(5, pathLinks(5), { y: [NaN, NaN, 77, NaN, NaN] });
    const simulation = createForceSimulation(graph, options);
    const startX = simulation.x[2]!;
    simulation.tick(100);
    expect(simulation.y[2]).toBe(77);
    expect(simulation.x[2]).not.toBe(startX);
    const r = forceLayout(graph, options);
    // Held along y: the layout is centered along x only.
    expect(r.y[2]).toBe(77);
    expect(allFinite(r)).toBe(true);
  });

  it('returns the given positions when every node is pinned', () => {
    const x = [0, 10, 10, 300];
    const y = [0, 0, 0, -40];
    const z = [1, 2, 2, 3];
    // Nodes 1 and 2 are pinned on the same spot.
    const graph = makeGraph(4, [...pathLinks(4), [0, 3]], { x, y, z });
    const r = forceLayout(graph, options);
    expect([...r.x]).toEqual(x);
    expect([...r.y]).toEqual(y);
    if (three) expect([...r.z!]).toEqual(z);
  });

  it('pins, moves and releases a node while running', () => {
    const graph = makeGraph(8, pathLinks(8));
    const simulation = createForceSimulation(graph, options);
    simulation.tick(100);

    // Drag node 0 far away: it is there at once and stays; its neighbour follows.
    simulation.pin(0, 2000, 1000, 500);
    expect([simulation.x[0], simulation.y[0]]).toEqual([2000, 1000]);
    if (three) expect(simulation.z![0]).toBe(500);
    const before = distance(simulation, 0, 1);
    simulation.reheat(1);
    simulation.tick(100);
    expect([simulation.x[0], simulation.y[0]]).toEqual([2000, 1000]);
    expect(distance(simulation, 0, 1)).toBeLessThan(0.5 * before);

    // Free along y only: x stays, y moves.
    simulation.pin(0, 2000, NaN, 500);
    simulation.reheat(1);
    simulation.tick(20);
    expect(simulation.x[0]).toBe(2000);
    expect(simulation.y[0]).not.toBe(1000);

    // Released: it moves along x too.
    simulation.unpin(0);
    simulation.reheat(1);
    simulation.tick(20);
    expect(simulation.x[0]).not.toBe(2000);
    expect(allFinite(simulation)).toBe(true);
  });

  it('ignores a pin on a node that does not exist, and a pin at infinity frees', () => {
    const simulation = createForceSimulation(makeGraph(3, pathLinks(3)), options);
    const before = bits(simulation);
    simulation.pin(-1, 5, 5);
    simulation.pin(3, 5, 5);
    simulation.pin(0.5, 5, 5);
    simulation.unpin(17);
    expect(bits(simulation)).toEqual(before);
    simulation.pin(1, Infinity, 3);
    expect(Number.isFinite(simulation.x[1]!)).toBe(true);
    expect(simulation.y[1]).toBe(3);
    simulation.tick(50);
    expect(simulation.y[1]).toBe(3);
    expect(allFinite(simulation)).toBe(true);
  });
});

describe.each(ALGORITHMS)('force simulation (%s): alpha, rest and reheat', (algorithm) => {
  const graph = makeGraph(12, [...cliqueLinks(0, 6), ...cliqueLinks(6, 6), [0, 6]]);

  it('cools from 1 and is at rest after `ticks` ticks', () => {
    const simulation = createForceSimulation(graph, { algorithm, ticks: 40 });
    expect(simulation.alpha).toBe(1);
    let steps = 0;
    let last = 1;
    while (simulation.tick()) {
      expect(simulation.alpha).toBeLessThan(last);
      last = simulation.alpha;
      steps++;
    }
    // The tick that reaches rest also ran.
    expect(steps + 1).toBe(40);
    expect(simulation.alpha).toBeLessThan(0.001);

    // At rest nothing moves.
    const rest = bits(simulation);
    expect(simulation.tick(10)).toBe(false);
    expect(bits(simulation)).toEqual(rest);
  });

  it('reports rest from a multi-step tick, and stops there', () => {
    const simulation = createForceSimulation(graph, { algorithm, ticks: 40 });
    expect(simulation.tick(39)).toBe(true);
    expect(simulation.tick(5)).toBe(false);
    const twin = createForceSimulation(graph, { algorithm, ticks: 40 });
    twin.tick(40);
    expect(bits(twin)).toEqual(bits(simulation));
    expect(simulation.tick(0)).toBe(false);
  });

  it('moves less and less as it cools', () => {
    const simulation = createForceSimulation(graph, { algorithm });
    const step = (): number => {
      const x = Float64Array.from(simulation.x);
      const y = Float64Array.from(simulation.y);
      simulation.tick();
      let most = 0;
      for (let i = 0; i < x.length; i++) {
        most = Math.max(most, Math.hypot(simulation.x[i]! - x[i]!, simulation.y[i]! - y[i]!));
      }
      return most;
    };
    const early = step();
    simulation.tick(297);
    const late = step();
    expect(early).toBeGreaterThan(1);
    // A twentieth of a layout unit per tick or less when it stops.
    expect(late).toBeLessThan(0.05);
  });

  it('reheats to at least the given alpha, 0.3 by default, 1 at most', () => {
    const simulation = createForceSimulation(graph, { algorithm, ticks: 40 });
    simulation.tick(40);
    expect(simulation.tick()).toBe(false);
    simulation.reheat();
    expect(simulation.alpha).toBe(0.3);
    expect(simulation.tick()).toBe(true);
    // Never cools it.
    simulation.reheat(0.1);
    expect(simulation.alpha).toBeGreaterThan(0.2);
    simulation.reheat(5);
    expect(simulation.alpha).toBe(1);
    simulation.reheat(NaN);
    expect(simulation.alpha).toBe(1);
  });

  it('takes alphaDecay and alphaMin', () => {
    const simulation = createForceSimulation(graph, { algorithm, alphaDecay: 0.5, alphaMin: 0.1 });
    simulation.tick();
    expect(simulation.alpha).toBe(0.5);
    // 0.5, 0.25, 0.125, 0.0625: at rest after the fourth.
    expect(simulation.tick(2)).toBe(true);
    expect(simulation.tick()).toBe(false);
    // And `forceLayout` stops there although `ticks` would go on.
    const result = forceLayout(graph, { algorithm, alphaDecay: 0.5, alphaMin: 0.1, ticks: 300 });
    const twin = createForceSimulation(graph, { algorithm, alphaDecay: 0.5, alphaMin: 0.1 });
    twin.tick(4);
    expect(distance(result, 0, 6)).toBeCloseTo(distance(twin, 0, 6), 0);
  });
});

describe.each(CASES)('force layout ($algorithm, $dimensions-D): edge cases', (options) => {
  it('lays out no nodes', () => {
    const r = forceLayout(makeGraph(0), options);
    expect(r.x).toHaveLength(0);
    expect(r.y).toHaveLength(0);
    const simulation = createForceSimulation(makeGraph(0), options);
    expect(simulation.tick(5)).toBe(true);
  });

  it('puts a single node on the center', () => {
    const r = forceLayout(makeGraph(1), options);
    expect(Math.hypot(r.x[0]!, r.y[0]!, r.z?.[0] ?? 0)).toBeLessThan(1e-12);
    const moved = forceLayout(makeGraph(1), { ...options, center: [30, 40, 50] });
    expect(Math.hypot(moved.x[0]! - 30, moved.y[0]! - 40)).toBeLessThan(1e-12);
  });

  it('lays out nodes without links', () => {
    const r = forceLayout(makeGraph(25), options);
    expect(allFinite(r)).toBe(true);
    expect(deepestOverlap(r, () => 4)).toBeLessThanOrEqual(0);
    expect(radiusAround(r)).toBeLessThan(500);
  });

  it('skips self-links and treats repeated links as one', () => {
    const plain = pathLinks(6);
    const noisy: LinkSpec[] = [
      [2, 2],
      ...plain,
      [0, 0, 50],
      ...plain.map(([s, t]) => [t, s] as const),
      ...plain,
    ];
    const a = forceLayout(makeGraph(6, plain), options);
    const b = forceLayout(makeGraph(6, noisy), options);
    // Every link three times over: the same relative weights, so the same layout.
    expect(bits(b)).toEqual(bits(a));
  });

  it('skips links to nodes that do not exist', () => {
    const a = forceLayout(makeGraph(4, pathLinks(4)), options);
    const b = forceLayout(
      makeGraph(4, [...pathLinks(4), [1, 9], [-2, 3], [NaN, 0] as unknown as LinkSpec]),
      options,
    );
    expect(bits(b)).toEqual(bits(a));
  });

  it('stays finite with huge, tiny and invalid weights', () => {
    const r = forceLayout(
      makeGraph(7, [
        [0, 1, 1e300],
        [1, 2, 1e-300],
        [2, 3, 5],
        [3, 4, Number.MAX_VALUE],
        [4, 5, NaN],
        [5, 6, -1],
        [6, 0, Infinity],
      ]),
      options,
    );
    expect(allFinite(r)).toBe(true);
    expect(radiusAround(r)).toBeLessThan(2000);
  });

  it('stays finite with pins far beyond any layout, and with sizes that are not numbers', () => {
    const far = makeGraph(5, pathLinks(5), {
      x: [1e200, NaN, NaN, NaN, -1e200],
      y: [0, NaN, NaN, NaN, 0],
    });
    expect(allFinite(forceLayout(far, options))).toBe(true);
    const sized = makeGraph(5, pathLinks(5), { size: [NaN, Infinity, -4, 0, 1e9] });
    expect(allFinite(forceLayout(sized, options))).toBe(true);
  });

  it('falls back to the defaults for options that make no sense', () => {
    const graph = makeGraph(10, pathLinks(10));
    const nonsense: ForceOptions = {
      ...options,
      ticks: NaN,
      alphaMin: -1,
      alphaDecay: 7,
      linkDistance: -5,
      linkStrength: NaN,
      linkIterations: 0,
      chargeStrength: Infinity,
      theta: -1,
      distanceMin: NaN,
      distanceMax: -3,
      velocityDecay: 2,
      centerStrength: -1,
      collidePadding: -1,
      collideStrength: 9,
      collideIterations: -2,
      scalingRatio: NaN,
      gravity: -1,
      jitterTolerance: 0,
      seed: NaN,
      initialRadius: -1,
      center: [NaN, Infinity],
      xStrength: -1,
      groupStrength: NaN,
      linkWeight: 'heavy' as never,
      algorithm: options.algorithm,
    };
    expect(bits(forceLayout(graph, nonsense))).toEqual(bits(forceLayout(graph, options)));
  });
});

describe('force layout: default ticks', () => {
  it('is 300 up to 3,000 nodes, then falls with the node count, never below 50', () => {
    expect(defaultTicks(0)).toBe(300);
    expect(defaultTicks(3000)).toBe(300);
    expect(defaultTicks(5000)).toBe(180);
    expect(defaultTicks(10000)).toBe(90);
    expect(defaultTicks(18000)).toBe(50);
    expect(defaultTicks(1e6)).toBe(50);
    expect(defaultTicks(NaN)).toBe(300);
  });

  it('is what forceLayout runs: the same as a simulation ticked that often', () => {
    const { nodes, links } = sample();
    const graph = makeGraph(nodes, links);
    const result = forceLayout(graph, { collide: false });
    const simulation = createForceSimulation(graph, { collide: false });
    expect(simulation.tick(defaultTicks(nodes) - 1)).toBe(true);
    expect(simulation.tick()).toBe(false);
    // The same shape; the result is only moved to the origin.
    expect(distance(result, 3, 40)).toBeCloseTo(distance(simulation, 3, 40), 9);
  });
});
