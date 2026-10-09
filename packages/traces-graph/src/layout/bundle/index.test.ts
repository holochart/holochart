import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LinkRoute } from '../types.ts';
import { wellFormed } from './__testing__/curves.ts';
import { bundleLinks, forceBundle, hierarchicalBundle, type BundleOptions } from './index.ts';

/** Two rows of four nodes: links between the rows are parallel, 200 long and 10 apart. */
const positions = {
  x: new Float64Array([0, 0, 0, 0, 200, 200, 200, 200]),
  y: new Float64Array([0, 10, 20, 30, 0, 10, 20, 30]),
};
const links = { source: new Int32Array([0, 1, 2, 3]), target: new Int32Array([4, 5, 6, 7]) };
const groups = { group: new Int32Array([0, 0, 0, 0, 1, 1, 1, 1]), groups: 2 };
const parent = new Int32Array([-1, 0, 0, 0, 0, 4, 4, 4]);

const kinds = (routes: (LinkRoute | undefined)[]): (string | undefined)[] =>
  routes.map((route) => route?.kind);

describe('bundleLinks', () => {
  it('bundles along the hierarchy when the graph has groups', () => {
    const result = bundleLinks(positions, { ...links, ...groups });
    expect(result.method).toBe('hierarchical');
    expect(result.refused).toBe(false);
    expect(kinds(result.routes)).toEqual(['spline', 'spline', 'spline', 'spline']);
    expect(result.routes).toEqual(hierarchicalBundle(positions, { ...links, ...groups }));
  });

  it('bundles by force when the graph has no groups', () => {
    const result = bundleLinks(positions, links);
    expect(result.method).toBe('force');
    expect(kinds(result.routes)).toEqual(['polyline', 'polyline', 'polyline', 'polyline']);
    expect(result).toEqual(forceBundle(positions, links));
    // Groups that no node is in are no groups; parents alone do not make it hierarchical.
    const empty = { group: new Int32Array(8).fill(-1), groups: 2 };
    expect(bundleLinks(positions, { ...links, ...empty }).method).toBe('force');
    expect(bundleLinks(positions, { ...links, group: groups.group, groups: 0 }).method).toBe(
      'force',
    );
    expect(bundleLinks(positions, { ...links, parent }).method).toBe('force');
    expect(bundleLinks(positions, links, { method: 'auto' }).method).toBe('force');
  });

  it('bundles along the parents when that hierarchy is asked for', () => {
    const result = bundleLinks(positions, { ...links, parent }, { hierarchy: 'parents' });
    expect(result.method).toBe('hierarchical');
    // 0 → 4 is a node and its parent (straight); the others go through their parents.
    expect(kinds(result.routes)).toEqual([undefined, 'spline', 'spline', 'spline']);
    // Asked for without parents: there is no hierarchy, so the links bundle by force.
    expect(bundleLinks(positions, links, { hierarchy: 'parents' }).method).toBe('force');
  });

  it('runs the method that is named, and never the other', () => {
    const forced = bundleLinks(positions, { ...links, ...groups }, { method: 'force' });
    expect(forced.method).toBe('force');
    expect(kinds(forced.routes)).toEqual(['polyline', 'polyline', 'polyline', 'polyline']);
    const none = bundleLinks(positions, links, { method: 'hierarchical' });
    expect(none).toEqual({ routes: new Array(4).fill(undefined), method: 'none', refused: false });
    const tree = bundleLinks(positions, { ...links, parent }, { method: 'hierarchical' });
    expect(tree.method).toBe('hierarchical');
  });

  it('shares the strength: 0 bundles nothing with either method', () => {
    const straight = { routes: new Array(4).fill(undefined), method: 'none', refused: false };
    expect(bundleLinks(positions, links, { strength: 0 })).toEqual(straight);
    expect(bundleLinks(positions, { ...links, ...groups }, { strength: 0 })).toEqual(straight);
    // More strength bends both more.
    for (const graph of [links, { ...links, ...groups }]) {
      const weak = bundleLinks(positions, graph, { strength: 0.2, tolerance: 0 });
      const strong = bundleLinks(positions, graph, { strength: 1, tolerance: 0 });
      // Link 0 runs along y = 0 and is pulled up, toward the others.
      const rise = (routes: (LinkRoute | undefined)[]): number =>
        Math.max(...Array.from(routes[0]!.points).filter((_, i) => i % 2 === 1));
      expect(rise(strong.routes)).toBeGreaterThan(rise(weak.routes));
      expect(rise(weak.routes)).toBeGreaterThan(0);
    }
  });

  it('reports nothing bundled for no links, and a refusal over the size cap', () => {
    const empty = { source: new Int32Array(0), target: new Int32Array(0) };
    expect(bundleLinks(positions, empty)).toEqual({ routes: [], method: 'none', refused: false });
    expect(bundleLinks(positions, { ...empty, ...groups })).toEqual({
      routes: [],
      method: 'none',
      refused: false,
    });
    expect(bundleLinks(positions, links, { maxLinks: 3 })).toEqual({
      routes: new Array(4).fill(undefined),
      method: 'none',
      refused: true,
    });
    // The cap is the force method's: the hierarchical one is linear and takes any size.
    expect(bundleLinks(positions, { ...links, ...groups }, { maxLinks: 3 }).method).toBe(
      'hierarchical',
    );
  });
});

describe('bundling: any input', () => {
  const coordinate = fc.oneof(
    { weight: 8, arbitrary: fc.integer({ min: -50, max: 50 }) },
    { weight: 4, arbitrary: fc.double({ min: -1e6, max: 1e6, noNaN: true }) },
    { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, -0, 1e-300, 1e300) },
  );
  const input = fc.integer({ min: 0, max: 12 }).chain((nodes) =>
    fc.record({
      x: fc.array(coordinate, { minLength: nodes, maxLength: nodes }),
      y: fc.array(coordinate, { minLength: nodes, maxLength: nodes }),
      // Ends may be outside the nodes, and equal.
      pairs: fc.array(
        fc.tuple(fc.integer({ min: -1, max: nodes + 1 }), fc.integer({ min: -1, max: nodes + 1 })),
        { maxLength: 40 },
      ),
      group: fc.array(fc.integer({ min: -1, max: 4 }), { minLength: nodes, maxLength: nodes }),
      parent: fc.array(fc.integer({ min: -1, max: nodes }), {
        minLength: nodes,
        maxLength: nodes,
      }),
      groupParent: fc.array(fc.integer({ min: -1, max: 4 }), { minLength: 4, maxLength: 4 }),
      strength: fc.double({ min: 0, max: 1, noNaN: true }),
      compatibility: fc.double({ min: 0, max: 1, noNaN: true }),
      tolerance: fc.constantFrom(0, 0.25, 3),
    }),
  );

  type Input = typeof input extends fc.Arbitrary<infer T> ? T : never;

  function check(
    data: Input,
    routes: (LinkRoute | undefined)[],
    kind: 'spline' | 'polyline',
  ): void {
    const { x, y, pairs } = data;
    const nodes = x.length;
    expect(routes).toHaveLength(pairs.length);
    pairs.forEach(([s, t], k) => {
      const route = routes[k];
      const placed =
        s >= 0 &&
        s < nodes &&
        t >= 0 &&
        t < nodes &&
        s !== t &&
        Number.isFinite(x[s]! + y[s]! + x[t]! + y[t]!);
      if (!placed) expect(route).toBeUndefined();
      if (!route) return;
      expect(route.kind).toBe(kind);
      expect(wellFormed(route)).toBe(true);
      const p = route.points;
      // `toBe` is Object.is: the ends are the node positions bit for bit.
      expect(p[0]).toBe(x[s]);
      expect(p[1]).toBe(y[s]);
      expect(p[p.length - 2]).toBe(x[t]);
      expect(p[p.length - 1]).toBe(y[t]);
    });
  }

  const graphOf = (data: Input) => ({
    source: Int32Array.from(data.pairs, (pair) => pair[0]),
    target: Int32Array.from(data.pairs, (pair) => pair[1]),
  });
  const positionsOf = (data: Input) => ({
    x: Float64Array.from(data.x),
    y: Float64Array.from(data.y),
  });

  it('force: every route is finite, well formed and ends on its nodes', () => {
    fc.assert(
      fc.property(input, (data) => {
        const options: BundleOptions = {
          strength: data.strength,
          compatibility: data.compatibility,
          tolerance: data.tolerance,
        };
        const result = forceBundle(positionsOf(data), graphOf(data), options);
        expect(result.refused).toBe(false);
        check(data, result.routes, 'polyline');
        expect(result.method).toBe(result.routes.some((route) => route) ? 'force' : 'none');
      }),
    );
  });

  it('hierarchical, by groups: every route is finite, well formed and ends on its nodes', () => {
    fc.assert(
      fc.property(input, (data) => {
        const graph = { ...graphOf(data), group: Int32Array.from(data.group), groups: 4 };
        const options = {
          strength: data.strength,
          groupParent: Int32Array.from(data.groupParent),
        };
        check(data, hierarchicalBundle(positionsOf(data), graph, options), 'spline');
        const result = bundleLinks(positionsOf(data), graph, options);
        expect(['hierarchical', 'force', 'none']).toContain(result.method);
        check(data, result.routes, result.method === 'force' ? 'polyline' : 'spline');
      }),
    );
  });

  it('hierarchical, by parents: every route is finite, well formed and ends on its nodes', () => {
    fc.assert(
      fc.property(input, (data) => {
        const graph = { ...graphOf(data), parent: Int32Array.from(data.parent) };
        const routes = hierarchicalBundle(positionsOf(data), graph, { strength: data.strength });
        check(data, routes, 'spline');
      }),
    );
  });
});
