import { describe, expect, it } from 'vitest';
import type { LayoutResult, LayoutSimulation } from '../types.ts';
import {
  allFinite,
  cliqueLinks,
  distance,
  makeGraph,
  meanDistance,
  pathLinks,
  plantedPartition,
  radiusAround,
  type LinkSpec,
} from './__testing__/graphs.ts';
import { createForceSimulation, forceLayout, type ForceOptions } from './index.ts';

type Positions = Pick<LayoutResult | LayoutSimulation, 'x' | 'y' | 'z'>;

const ATLAS: ForceOptions = { algorithm: 'forceatlas2' };

/** Mean distance within the groups over mean distance between them: lower is better separated. */
function separation(p: Positions, group: readonly number[]): number {
  const same = (a: number, b: number): boolean => group[a] === group[b];
  return meanDistance(p, same) / meanDistance(p, (a, b) => !same(a, b));
}

describe('ForceAtlas2 layout', () => {
  it('lays a path out straight', () => {
    for (const n of [5, 12]) {
      const r = forceLayout(makeGraph(n, pathLinks(n)), ATLAS);
      let length = 0;
      for (let i = 0; i + 1 < n; i++) length += distance(r, i, i + 1);
      expect(distance(r, 0, n - 1) / length).toBeGreaterThan(0.98);
    }
  });

  it('separates two cliques joined by one link into two clusters', () => {
    const r = forceLayout(
      makeGraph(12, [...cliqueLinks(0, 6), ...cliqueLinks(6, 6), [0, 6]]),
      ATLAS,
    );
    expect(separation(r, [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1])).toBeLessThan(0.3);
  });

  it.each([1, 2, 3, 4, 5])(
    'separates planted communities at least as well as the spring layout (seed %i)',
    (seed) => {
      // Four groups of 25; a pair is linked with probability 0.3 inside a group, 0.02 across.
      const { nodes, links, group } = plantedPartition(4, 25, 0.3, 0.02, seed);
      const graph = makeGraph(nodes, links);
      const spring = separation(forceLayout(graph), group);
      const atlas = separation(forceLayout(graph, ATLAS), group);
      // Measured over these seeds: spring 0.35 to 0.39, ForceAtlas2 0.32 to 0.36, LinLog 0.29
      // to 0.33.
      expect(atlas).toBeLessThanOrEqual(spring);
      expect(atlas).toBeLessThan(0.4);
      // LinLog draws the groups tighter still.
      expect(separation(forceLayout(graph, { ...ATLAS, linLog: true }), group)).toBeLessThan(atlas);
    },
  );

  it('separates communities around hubs, where degrees are far from even', () => {
    // Three hubs, each with 30 leaves of its own, the hubs linked in a triangle, and a few
    // leaves linked across.
    const links: LinkSpec[] = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];
    const group = [0, 1, 2];
    for (let leaf = 0; leaf < 90; leaf++) {
      links.push([leaf % 3, 3 + leaf]);
      group.push(leaf % 3);
      if (leaf % 15 === 0) links.push([3 + leaf, 3 + ((leaf + 1) % 90)]);
    }
    const graph = makeGraph(93, links);
    const spring = separation(forceLayout(graph), group);
    const atlas = separation(forceLayout(graph, ATLAS), group);
    expect(atlas).toBeLessThan(spring);
  });

  it('scales the layout with scalingRatio', () => {
    const { nodes, links } = plantedPartition(3, 20, 0.3, 0.03, 4);
    const graph = makeGraph(nodes, links);
    const size = (scalingRatio: number): number =>
      radiusAround(forceLayout(graph, { ...ATLAS, scalingRatio, collide: false }));
    // Four times the repulsion against attraction alone would be twice the size; gravity, which
    // does not grow with distance, holds less of a larger layout, so it is a little more.
    const ratio = size(40) / size(10);
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(4.2);
  });

  it('holds unconnected nodes at the edge of the layout', () => {
    // A hundred linked nodes and five with no link at all.
    const { nodes, links } = plantedPartition(4, 25, 0.3, 0.02, 1);
    const graph = makeGraph(nodes + 5, links);
    const farthest = (r: Positions, from: number, to: number): number => {
      let most = 0;
      for (let i = from; i < to; i++) most = Math.max(most, Math.hypot(r.x[i]!, r.y[i]!));
      return most;
    };
    const r = forceLayout(graph, ATLAS);
    const linked = farthest(r, 0, nodes);
    const loose = farthest(r, nodes, nodes + 5);
    // Measured: 276 and 450.
    expect(loose).toBeLessThan(2 * linked);
    // And they stay there, however long it runs.
    const long = forceLayout(graph, { ...ATLAS, ticks: 3000 });
    expect(farthest(long, nodes, nodes + 5)).toBeLessThan(1.2 * loose);

    // Gravity alone, as in the paper, lets them go: bounded, but by
    // scalingRatio × the summed masses / gravity, 10,000 here.
    const paper = { ...ATLAS, centerStrength: 0 };
    const drifting = farthest(forceLayout(graph, { ...paper, ticks: 3000 }), nodes, nodes + 5);
    expect(drifting).toBeGreaterThan(3 * loose);
    expect(drifting).toBeLessThan(10 * (nodes + 5 + 2 * links.length));
    // The pull is on the part as a whole: the linked hundred lie as they do without it.
    const alone = forceLayout(graph, paper);
    expect(Math.abs(farthest(alone, 0, nodes) / linked - 1)).toBeLessThan(0.15);
  });

  it('packs tighter with more gravity, tighter still with strong gravity', () => {
    const { nodes, links } = plantedPartition(4, 25, 0.3, 0.02, 2);
    const graph = makeGraph(nodes, links);
    const normal = radiusAround(forceLayout(graph, ATLAS));
    expect(radiusAround(forceLayout(graph, { ...ATLAS, gravity: 30 }))).toBeLessThan(0.8 * normal);
    expect(radiusAround(forceLayout(graph, { ...ATLAS, strongGravity: true }))).toBeLessThan(
      0.5 * normal,
    );
    const none = forceLayout(graph, { ...ATLAS, gravity: 0, centerStrength: 0 });
    expect(allFinite(none)).toBe(true);
    expect(radiusAround(none)).toBeGreaterThan(normal);
  });

  it('pulls a heavier link shorter, and ignores weights with linkWeight none', () => {
    const lengths = (weight: number, options: ForceOptions = {}): number[] => {
      const links = Array.from(
        { length: 8 },
        (_, i) => [i, (i + 1) % 8, i === 0 ? weight : 1] as const,
      );
      const r = forceLayout(makeGraph(8, links), { ...ATLAS, ...options });
      return Array.from({ length: 8 }, (_, i) => distance(r, i, (i + 1) % 8));
    };
    const even = lengths(1);
    expect(Math.max(...even) - Math.min(...even)).toBeLessThan(0.5);
    // Measured: 19.9 for every link when even; 12.1 for a link four times as heavy.
    expect(lengths(4)[0]!).toBeLessThan(0.75 * even[0]!);
    expect(lengths(0.2)[0]!).toBeGreaterThan(1.5 * even[0]!);
    expect(lengths(4, { linkWeight: 'none' })).toEqual(even);
    expect(lengths(4, { linkWeight: 'distance' })).toEqual(lengths(4));
  });

  it('measures a link between the outlines of sized nodes: touching nodes are not pulled', () => {
    // Two large linked nodes: with collision on they end apart by their radii, not on each other.
    const graph = makeGraph(2, [[0, 1]], { size: 30 });
    const sized = forceLayout(graph, ATLAS);
    expect(distance(sized, 0, 1)).toBeGreaterThanOrEqual(60);
    const points = forceLayout(graph, { ...ATLAS, collide: false });
    expect(distance(points, 0, 1)).toBeLessThan(20);
  });

  it('adapts its speed: fast while the layout travels, slow once it swings', () => {
    const { nodes, links } = plantedPartition(4, 25, 0.3, 0.02, 1);
    const simulation = createForceSimulation(makeGraph(nodes, links), ATLAS);
    const step = (): number => {
      const x = Float64Array.from(simulation.x);
      const y = Float64Array.from(simulation.y);
      simulation.tick();
      let most = 0;
      for (let i = 0; i < nodes; i++) {
        most = Math.max(most, Math.hypot(simulation.x[i]! - x[i]!, simulation.y[i]! - y[i]!));
      }
      return most;
    };
    simulation.tick(5);
    const early = step();
    simulation.tick(100);
    const settled = step();
    simulation.tick(190);
    const cooled = step();
    // Measured: tens of units a tick, then a few, then none to speak of.
    expect(early).toBeGreaterThan(5);
    expect(settled).toBeLessThan(0.5 * early);
    expect(cooled).toBeLessThan(0.01);
    expect(allFinite(simulation)).toBe(true);
  });

  it('tolerates more swinging with a higher jitterTolerance', () => {
    const { nodes, links } = plantedPartition(4, 25, 0.3, 0.02, 1);
    const graph = makeGraph(nodes, links);
    const travelled = (jitterTolerance: number): number => {
      const simulation = createForceSimulation(graph, { ...ATLAS, jitterTolerance });
      const x = Float64Array.from(simulation.x);
      const y = Float64Array.from(simulation.y);
      simulation.tick(3);
      let sum = 0;
      for (let i = 0; i < nodes; i++)
        sum += Math.hypot(simulation.x[i]! - x[i]!, simulation.y[i]! - y[i]!);
      return sum;
    };
    expect(travelled(5)).toBeGreaterThan(travelled(0.2));
  });

  it('lays out in three dimensions, pins included', () => {
    const { nodes, links, group } = plantedPartition(3, 20, 0.3, 0.02, 2);
    const graph = makeGraph(nodes, links, {
      z: [-200, ...Array.from({ length: 19 }, () => NaN), 200],
    });
    const r = forceLayout(graph, { ...ATLAS, dimensions: 3 });
    // Nodes 0 and 20 are held on their planes; the layout spreads between and around them.
    expect([r.z![0], r.z![20]]).toEqual([-200, 200]);
    expect(allFinite(r)).toBe(true);
    expect(separation(r, group)).toBeLessThan(0.6);
  });
});
