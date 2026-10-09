import { describe, expect, it } from 'vitest';
import { bend, closest, cubicAt, wellFormed } from './__testing__/curves.ts';
import { bsplineToBezier } from './bspline.ts';
import {
  buildHierarchy,
  controlPolygon,
  hasGroups,
  hierarchicalBundle,
  hierarchyPath,
} from './hierarchical.ts';

const RADIUS = 100;

/** Nodes on a circle of radius 100 around the origin, at these angles in degrees. */
function circle(degrees: number[]): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(degrees.length);
  const y = new Float64Array(degrees.length);
  degrees.forEach((d, i) => {
    x[i] = RADIUS * Math.cos((d * Math.PI) / 180);
    y[i] = RADIUS * Math.sin((d * Math.PI) / 180);
  });
  return { x, y };
}

/**
 * Two groups of three nodes facing each other across the circle: nodes 0 1 2 around 0°, nodes
 * 3 4 5 around 180°. Node 1 and node 4 are opposite each other.
 */
const OPPOSITE = circle([-20, 0, 20, 160, 180, 200]);
const TWO_GROUPS = { group: new Int32Array([0, 0, 0, 1, 1, 1]), groups: 2 };
const links = (pairs: [number, number][]) => ({
  source: Int32Array.from(pairs, (p) => p[0]),
  target: Int32Array.from(pairs, (p) => p[1]),
});

describe('hierarchical bundling: the hierarchy', () => {
  it('hangs nodes under their group and groups under one root, at the centroids', () => {
    const h = buildHierarchy(OPPOSITE, { ...links([]), ...TWO_GROUPS })!;
    expect(h.nodes).toBe(6);
    // Tree nodes: 0…5 the nodes, 6 and 7 the groups, 8 the root.
    expect(Array.from(h.parent)).toEqual([6, 6, 6, 7, 7, 7, 8, 8, -1]);
    expect(Array.from(h.depth)).toEqual([2, 2, 2, 2, 2, 2, 1, 1, 0]);
    const cos20 = Math.cos((20 * Math.PI) / 180);
    expect(h.x[6]).toBeCloseTo((RADIUS * (1 + 2 * cos20)) / 3, 10);
    expect(h.y[6]).toBeCloseTo(0, 10);
    expect(h.x[7]).toBeCloseTo((-RADIUS * (1 + 2 * cos20)) / 3, 10);
    expect(h.x[8]).toBeCloseTo(0, 10);
    expect(h.y[8]).toBeCloseTo(0, 10);
    expect(Array.from(h.x.subarray(0, 6))).toEqual(Array.from(OPPOSITE.x));
  });

  it('is undefined without groups and without parents, or without the kind asked for', () => {
    const none = links([[0, 3]]);
    expect(buildHierarchy(OPPOSITE, none)).toBeUndefined();
    expect(buildHierarchy(OPPOSITE, { ...none, ...TWO_GROUPS }, { hierarchy: 'parents' })).toBe(
      undefined,
    );
    const parent = new Int32Array([-1, 0, 0, 0, 0, 0]);
    expect(buildHierarchy(OPPOSITE, { ...none, parent }, { hierarchy: 'groups' })).toBeUndefined();
    // Groups that no node is in are no groups.
    const empty = { group: new Int32Array(6).fill(-1), groups: 2 };
    expect(hasGroups({ ...none, ...empty }, 6)).toBe(false);
    expect(hasGroups({ ...none, group: new Int32Array([5, 9, 2, 2, 2, 2]), groups: 2 }, 6)).toBe(
      false,
    );
    expect(hasGroups({ ...none, group: TWO_GROUPS.group, groups: 0 }, 6)).toBe(false);
    expect(hasGroups({ ...none, ...TWO_GROUPS }, 6)).toBe(true);
    expect(buildHierarchy(OPPOSITE, { ...none, ...empty })).toBeUndefined();
  });

  it('gives the path between two nodes: up to the common ancestor and down', () => {
    const h = buildHierarchy(OPPOSITE, { ...links([]), ...TWO_GROUPS })!;
    expect(hierarchyPath(h, 0, 4)).toEqual([0, 6, 8, 7, 4]);
    expect(hierarchyPath(h, 4, 0)).toEqual([4, 7, 8, 6, 0]);
    expect(hierarchyPath(h, 0, 2)).toEqual([0, 6, 2]);
    expect(hierarchyPath(h, 3, 3)).toEqual([3]);
    // Only the graph's nodes are ends.
    expect(hierarchyPath(h, 0, 6)).toEqual([]);
    expect(hierarchyPath(h, -1, 2)).toEqual([]);
  });

  it('puts a node without a group directly under the root', () => {
    const graph = { ...links([]), group: new Int32Array([0, 0, -1, 1, 7, -1]), groups: 2 };
    const h = buildHierarchy(OPPOSITE, graph)!;
    expect(Array.from(h.parent)).toEqual([6, 6, 8, 7, 8, 8, 8, 8, -1]);
    expect(hierarchyPath(h, 2, 5)).toEqual([2, 8, 5]);
    expect(hierarchyPath(h, 2, 3)).toEqual([2, 8, 7, 3]);
    expect(hierarchyPath(h, 0, 4)).toEqual([0, 6, 8, 4]);
  });

  it('leaves nodes without a position out of the centroids', () => {
    const x = Float64Array.from(OPPOSITE.x);
    const y = Float64Array.from(OPPOSITE.y);
    x[0] = NaN;
    y[5] = Infinity;
    const h = buildHierarchy({ x, y }, { ...links([]), ...TWO_GROUPS })!;
    expect(h.x[6]).toBeCloseTo((x[1]! + x[2]!) / 2, 10);
    expect(h.y[7]).toBeCloseTo((y[3]! + y[4]!) / 2, 10);
    expect(h.x[8]).toBeCloseTo((x[1]! + x[2]! + x[3]! + x[4]!) / 4, 10);
    expect(Number.isNaN(h.x[0]!)).toBe(true);
    expect(Number.isNaN(h.y[5]!)).toBe(true);
    // A group whose nodes all lack a position has no point.
    const lost = buildHierarchy(
      { x: new Float64Array([NaN, 1, 2]), y: new Float64Array([0, 1, 2]) },
      { ...links([]), group: new Int32Array([0, 1, 1]), groups: 2 },
    )!;
    expect(Number.isNaN(lost.x[3]!)).toBe(true);
    expect(lost.x[4]).toBe(1.5);
  });
});

describe('hierarchical bundling: the curve', () => {
  it('leaves every link straight at strength 0', () => {
    const graph = {
      ...links([
        [0, 4],
        [0, 2],
        [1, 3],
      ]),
      ...TWO_GROUPS,
    };
    expect(hierarchicalBundle(OPPOSITE, graph, { strength: 0 })).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(hierarchicalBundle(OPPOSITE, graph, { strength: -3 })).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('follows the hierarchy path at strength 1: the control polygon is the path', () => {
    const graph = { ...links([[0, 4]]), ...TWO_GROUPS };
    const h = buildHierarchy(OPPOSITE, graph)!;
    const path = hierarchyPath(h, 0, 4);
    const polygon = controlPolygon(h, path, 1);
    expect(Array.from(polygon)).toEqual(path.flatMap((a) => [h.x[a]!, h.y[a]!]));
    const [route] = hierarchicalBundle(OPPOSITE, graph, { strength: 1 });
    expect(route!.kind).toBe('spline');
    // 5 points: two cubic pieces, 7 control points.
    expect(route!.points).toHaveLength(14);
    expect(Array.from(route!.points)).toEqual(Array.from(bsplineToBezier(polygon)));
  });

  it('straightens the polygon toward the link as the strength falls', () => {
    const graph = { ...links([[0, 4]]), ...TWO_GROUPS };
    const h = buildHierarchy(OPPOSITE, graph)!;
    const path = hierarchyPath(h, 0, 4);
    const straight = controlPolygon(h, path, 0);
    for (let i = 0; i < 5; i++) {
      expect(straight[2 * i]).toBeCloseTo(h.x[0]! + (i / 4) * (h.x[4]! - h.x[0]!), 10);
      expect(straight[2 * i + 1]).toBeCloseTo(h.y[0]! + (i / 4) * (h.y[4]! - h.y[0]!), 10);
    }
    const full = controlPolygon(h, path, 1);
    const half = controlPolygon(h, path, 0.5);
    for (let i = 0; i < 10; i++) expect(half[i]).toBeCloseTo((straight[i]! + full[i]!) / 2, 10);
    // The ends are the nodes at every strength, bit for bit.
    for (const polygon of [straight, half, full]) {
      expect(polygon[0]).toBe(h.x[0]);
      expect(polygon[1]).toBe(h.y[0]);
      expect(polygon[8]).toBe(h.x[4]);
      expect(polygon[9]).toBe(h.y[4]);
    }
    // No points, no polygon.
    expect(controlPolygon(h, [], 1)).toHaveLength(0);
  });

  it('passes through the centre of the circle between two opposite groups', () => {
    const pairs: [number, number][] = [
      [1, 4],
      [0, 3],
      [2, 5],
      [0, 5],
      [2, 4],
    ];
    const graph = { ...links(pairs), ...TWO_GROUPS };
    // At full strength every link between the groups goes through the centre: the joint of its
    // two pieces is (centroid + 2 · centre + centroid) / 4, and the centroids are opposite.
    for (const route of hierarchicalBundle(OPPOSITE, graph, { strength: 1 })) {
      expect(Math.hypot(route!.points[6]!, route!.points[7]!)).toBeLessThan(1e-9);
    }
    // Links between opposite nodes do at every strength.
    for (const strength of [0.1, 0.35, 0.6, 0.85]) {
      const routes = hierarchicalBundle(OPPOSITE, graph, { strength });
      for (const k of [0, 1, 2]) {
        expect(Math.hypot(routes[k]!.points[6]!, routes[k]!.points[7]!)).toBeLessThan(1e-9);
      }
    }
  });

  it('comes closer to the group centroid as the strength grows', () => {
    const graph = { ...links([[0, 4]]), ...TWO_GROUPS };
    const h = buildHierarchy(OPPOSITE, graph)!;
    let previous = Infinity;
    for (const strength of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
      const [route] = hierarchicalBundle(OPPOSITE, graph, { strength });
      const distance = closest(route!, h.x[6]!, h.y[6]!);
      expect(distance).toBeLessThan(previous);
      previous = distance;
    }
    // The default strength is 0.85.
    expect(Array.from(hierarchicalBundle(OPPOSITE, graph)[0]!.points)).toEqual(
      Array.from(hierarchicalBundle(OPPOSITE, graph, { strength: 0.85 })[0]!.points),
    );
    expect(Array.from(hierarchicalBundle(OPPOSITE, graph, { strength: 7 })[0]!.points)).toEqual(
      Array.from(hierarchicalBundle(OPPOSITE, graph, { strength: 1 })[0]!.points),
    );
  });

  it('ends every route exactly on its two nodes, with finite control points', () => {
    const pairs: [number, number][] = [];
    for (let s = 0; s < 6; s++) for (let t = 0; t < 6; t++) if (s !== t) pairs.push([s, t]);
    const graph = { ...links(pairs), ...TWO_GROUPS };
    const routes = hierarchicalBundle(OPPOSITE, graph);
    expect(routes).toHaveLength(pairs.length);
    pairs.forEach(([s, t], k) => {
      const route = routes[k]!;
      expect(wellFormed(route)).toBe(true);
      expect(route.kind).toBe('spline');
      const p = route.points;
      expect(p[0]).toBe(OPPOSITE.x[s]);
      expect(p[1]).toBe(OPPOSITE.y[s]);
      expect(p[p.length - 2]).toBe(OPPOSITE.x[t]);
      expect(p[p.length - 1]).toBe(OPPOSITE.y[t]);
      // Same group: one piece. Two groups: two pieces.
      expect(p.length).toBe(TWO_GROUPS.group[s] === TWO_GROUPS.group[t] ? 8 : 14);
    });
  });

  it('bends links inside a group less than links between groups', () => {
    const graph = {
      ...links([
        [0, 2],
        [0, 4],
      ]),
      ...TWO_GROUPS,
    };
    const h = buildHierarchy(OPPOSITE, graph)!;
    const [inside, between] = hierarchicalBundle(OPPOSITE, graph, { strength: 1 });
    // The link inside the group is a quadratic curve toward the centroid at half strength: its
    // middle is a quarter of the way from the chord's middle to the centroid.
    const [mx, my] = cubicAt(inside!.points, 0, 0.5);
    const chordX = (OPPOSITE.x[0]! + OPPOSITE.x[2]!) / 2;
    const chordY = (OPPOSITE.y[0]! + OPPOSITE.y[2]!) / 2;
    expect(mx).toBeCloseTo(chordX + (h.x[6]! - chordX) / 4, 10);
    expect(my).toBeCloseTo(chordY + (h.y[6]! - chordY) / 4, 10);
    // With the factor at 1 it bends twice as much; at 0 it stays straight.
    const [full] = hierarchicalBundle(OPPOSITE, graph, { strength: 1, sameGroupStrength: 1 });
    expect(bend(full!)).toBeCloseTo(2 * bend(inside!), 9);
    expect(bend(inside!)).toBeGreaterThan(0);
    const [none, still] = hierarchicalBundle(OPPOSITE, graph, { sameGroupStrength: 0 });
    expect(none).toBeUndefined();
    expect(Array.from(still!.points)).toEqual(
      Array.from(hierarchicalBundle(OPPOSITE, graph)[1]!.points),
    );
    // The link between the groups is pulled all the way: it bends more, relative to its length.
    const insideLength = Math.hypot(
      OPPOSITE.x[2]! - OPPOSITE.x[0]!,
      OPPOSITE.y[2]! - OPPOSITE.y[0]!,
    );
    const betweenLength = Math.hypot(
      OPPOSITE.x[4]! - OPPOSITE.x[0]!,
      OPPOSITE.y[4]! - OPPOSITE.y[0]!,
    );
    expect(bend(between!) / betweenLength).toBeGreaterThan(bend(inside!) / insideLength);
  });

  it('leaves self-links and links without two placed nodes straight', () => {
    const x = Float64Array.from(OPPOSITE.x);
    x[5] = NaN;
    const graph = {
      ...links([
        [1, 1],
        [0, 6],
        [-1, 2],
        [0, 5],
        [5, 3],
        [0, 3],
      ]),
      ...TWO_GROUPS,
    };
    const routes = hierarchicalBundle({ x, y: OPPOSITE.y }, graph);
    expect(routes.slice(0, 5)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(wellFormed(routes[5]!)).toBe(true);
    // No links, no routes; no hierarchy, no routes.
    expect(hierarchicalBundle(OPPOSITE, { ...links([]), ...TWO_GROUPS })).toEqual([]);
    expect(hierarchicalBundle(OPPOSITE, links([[0, 3]]))).toEqual([undefined]);
  });

  it('routes links between ungrouped nodes through the centre', () => {
    const graph = {
      ...links([
        [2, 5],
        [2, 3],
      ]),
      group: new Int32Array([0, 0, -1, 1, 1, -1]),
      groups: 2,
    };
    const h = buildHierarchy(OPPOSITE, graph)!;
    const routes = hierarchicalBundle(OPPOSITE, graph, { strength: 1 });
    // Node, root, node: a path of 3 points, bent at half strength.
    expect(routes[0]!.points).toHaveLength(8);
    expect(Array.from(routes[0]!.points)).toEqual(
      Array.from(bsplineToBezier(controlPolygon(h, [2, 8, 5], 0.5))),
    );
    // Node, root, group, node: 4 points are one cubic with those control points.
    expect(Array.from(routes[1]!.points)).toEqual(Array.from(controlPolygon(h, [2, 8, 7, 3], 1)));
  });
});

describe('hierarchical bundling: deeper hierarchies', () => {
  /** Eight nodes on the circle in four groups of two; groups 0 1 are under 4, groups 2 3 under 5. */
  const positions = circle([0, 20, 60, 80, 180, 200, 240, 260]);
  const graph = {
    ...links([
      [0, 1],
      [0, 2],
      [0, 5],
    ]),
    group: new Int32Array([0, 0, 1, 1, 2, 2, 3, 3]),
    groups: 6,
  };
  const groupParent = new Int32Array([4, 4, 5, 5, -1, -1]);

  it('follows groups of groups given by groupParent', () => {
    const h = buildHierarchy(positions, graph, { groupParent })!;
    // Tree nodes: 0…7 nodes, 8…13 groups, 14 the root.
    expect(Array.from(h.parent)).toEqual([8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, -1]);
    expect(Array.from(h.depth)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 0]);
    // The point of an outer group is the centroid of all the nodes below it.
    const mean = (values: Float64Array, from: number, to: number): number =>
      values.subarray(from, to).reduce((sum, v) => sum + v, 0) / (to - from);
    expect(h.x[12]).toBeCloseTo(mean(positions.x, 0, 4), 10);
    expect(h.y[12]).toBeCloseTo(mean(positions.y, 0, 4), 10);
    expect(h.x[13]).toBeCloseTo(mean(positions.x, 4, 8), 10);
    expect(h.x[14]).toBeCloseTo(mean(positions.x, 0, 8), 10);
    expect(hierarchyPath(h, 0, 1)).toEqual([0, 8, 1]);
    expect(hierarchyPath(h, 0, 2)).toEqual([0, 8, 12, 9, 2]);
    expect(hierarchyPath(h, 0, 5)).toEqual([0, 8, 12, 14, 13, 10, 5]);

    const routes = hierarchicalBundle(positions, graph, { groupParent, strength: 1 });
    // 3, 5 and 7 path points: 1, 2 and 4 cubic pieces.
    expect(routes.map((route) => route!.points.length / 2)).toEqual([4, 7, 13]);
    expect(routes.every((route) => wellFormed(route!))).toBe(true);
    expect(Array.from(routes[2]!.points)).toEqual(
      Array.from(bsplineToBezier(controlPolygon(h, [0, 8, 12, 14, 13, 10, 5], 1))),
    );
    // Without groupParent the same graph is one level deep.
    const flat = hierarchicalBundle(positions, graph, { strength: 1 });
    expect(flat.map((route) => route!.points.length / 2)).toEqual([4, 7, 7]);
  });

  it('cuts a cycle in groupParent and ignores entries that are not groups', () => {
    const cyclic = new Int32Array([1, 2, 0, 3, 99, -5]);
    const h = buildHierarchy(positions, graph, { groupParent: cyclic })!;
    // Walking from group 0: 0 → 1 → 2 → 0 closes at group 2, which becomes top level.
    expect(Array.from(h.parent.subarray(8))).toEqual([9, 10, 14, 14, 14, 14, -1]);
    expect(Array.from(h.depth.subarray(8))).toEqual([3, 2, 1, 1, 1, 1, 0]);
    const routes = hierarchicalBundle(positions, graph, { groupParent: cyclic });
    expect(routes.every((route) => route !== undefined && wellFormed(route))).toBe(true);
  });

  it('routes along the nodes themselves with a parent hierarchy', () => {
    // 0 is the root; 1 and 2 are its children; 3 and 4 are under 1; 5 is under 2.
    const tree = {
      x: new Float64Array([0, -40, 40, -60, -20, 40]),
      y: new Float64Array([100, 50, 50, 0, 0, 0]),
    };
    const parent = new Int32Array([-1, 0, 0, 1, 1, 2]);
    const treeLinks = links([
      [3, 5],
      [3, 4],
      [3, 1],
      [3, 0],
      [5, 4],
    ]);
    // Only parents: the hierarchy defaults to them.
    const h = buildHierarchy(tree, { ...treeLinks, parent })!;
    expect(Array.from(h.parent)).toEqual([-1, 0, 0, 1, 1, 2, -1]);
    expect(Array.from(h.depth.subarray(0, 6))).toEqual([0, 1, 1, 2, 2, 2]);
    expect(hierarchyPath(h, 3, 5)).toEqual([3, 1, 0, 2, 5]);
    expect(hierarchyPath(h, 3, 4)).toEqual([3, 1, 4]);
    expect(hierarchyPath(h, 3, 1)).toEqual([3, 1]);
    expect(hierarchyPath(h, 1, 3)).toEqual([1, 3]);
    expect(hierarchyPath(h, 3, 0)).toEqual([3, 1, 0]);
    expect(hierarchyPath(h, 0, 4)).toEqual([0, 1, 4]);

    const routes = hierarchicalBundle(tree, { ...treeLinks, parent }, { strength: 1 });
    // The control points are the ancestors' own positions.
    expect(Array.from(routes[0]!.points)).toEqual(
      Array.from(bsplineToBezier(new Float64Array([-60, 0, -40, 50, 0, 100, 40, 50, 40, 0]))),
    );
    expect(routes[1]!.points).toHaveLength(8);
    // A node and its own parent: nothing between them to bend around.
    expect(routes[2]).toBeUndefined();
    expect(routes[3]!.points).toHaveLength(8);
    expect(routes[4]!.points).toHaveLength(14);
    // Groups win when the graph has both, unless parents are asked for.
    const both = { ...treeLinks, parent, group: new Int32Array([0, 0, 0, 1, 1, 1]), groups: 2 };
    expect(buildHierarchy(tree, both)!.parent).toHaveLength(9);
    expect(buildHierarchy(tree, both, { hierarchy: 'parents' })!.parent).toHaveLength(7);
  });

  it('joins several roots under a virtual root at their centroid', () => {
    const forestPositions = {
      x: new Float64Array([0, 100, 0, 100, 50]),
      y: new Float64Array([0, 0, -50, -50, 80]),
    };
    // Roots 0, 1 and 4 (an entry that is not a node, and one that is the node itself, are roots).
    const parent = new Int32Array([-1, 9, 0, 1, 4]);
    const graph = { ...links([[2, 3]]), parent };
    const h = buildHierarchy(forestPositions, graph)!;
    expect(Array.from(h.parent)).toEqual([5, 5, 0, 1, 5, -1]);
    expect(h.x[5]).toBe(50);
    expect(h.y[5]).toBeCloseTo(80 / 3, 12);
    expect(hierarchyPath(h, 2, 3)).toEqual([2, 0, 5, 1, 3]);
    const [route] = hierarchicalBundle(forestPositions, graph, { strength: 1 });
    expect(route!.points).toHaveLength(14);
    expect(wellFormed(route!)).toBe(true);
  });

  it('cuts a cycle of parents and leaves out ancestors without a position', () => {
    const positions5 = {
      x: new Float64Array([0, NaN, 100, 0, 100]),
      y: new Float64Array([0, 50, 0, -50, -50]),
    };
    // 0 ↔ 1 is a cycle, cut at node 1; 3 is under 1, 4 under 2, 2 under 0.
    const parent = new Int32Array([1, 0, 0, 1, 2]);
    const graph = {
      ...links([
        [3, 4],
        [3, 0],
      ]),
      parent,
    };
    const h = buildHierarchy(positions5, graph)!;
    expect(Array.from(h.parent.subarray(0, 5))).toEqual([1, -1, 0, 1, 2]);
    // Node 1 has no position: it is the common ancestor but not a control point.
    expect(hierarchyPath(h, 3, 4)).toEqual([3, 0, 2, 4]);
    const routes = hierarchicalBundle(positions5, graph, { strength: 1 });
    expect(wellFormed(routes[0]!)).toBe(true);
    expect(Array.from(routes[0]!.points)).toEqual([0, -50, 0, 0, 100, 0, 100, -50]);
    // Between 3 and 0 only node 1 lies: without it the path has 2 points, a straight link.
    expect(hierarchyPath(h, 3, 0)).toEqual([3, 0]);
    expect(routes[1]).toBeUndefined();
  });
});
