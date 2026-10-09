import { describe, expect, it } from 'vitest';
import { bytes, lcg, wellFormed } from './__testing__/curves.ts';
import { edgeCompatibility, forceBundle, linkCompatibility } from './force.ts';

interface Fixture {
  x: Float64Array;
  y: Float64Array;
  source: Int32Array;
  target: Int32Array;
}

/** Links given as segments `[x0, y0, x1, y1]`: two nodes per link. */
function fromSegments(segments: [number, number, number, number][]): Fixture {
  const n = segments.length;
  const x = new Float64Array(2 * n);
  const y = new Float64Array(2 * n);
  const source = new Int32Array(n);
  const target = new Int32Array(n);
  segments.forEach(([x0, y0, x1, y1], k) => {
    x[2 * k] = x0;
    y[2 * k] = y0;
    x[2 * k + 1] = x1;
    y[2 * k + 1] = y1;
    source[k] = 2 * k;
    target[k] = 2 * k + 1;
  });
  return { x, y, source, target };
}

/** Six parallel links, 200 long and 10 apart, all left to right. */
const PARALLEL: [number, number, number, number][] = [0, 10, 20, 30, 40, 50].map((y) => [
  0,
  y,
  200,
  y,
]);

/** The y of a route at its middle: its middle point, or the mean of the two around the middle. */
function middleY(points: Float64Array): number {
  const count = points.length / 2;
  const before = Math.floor((count - 1) / 2);
  const after = Math.ceil((count - 1) / 2);
  return (points[2 * before + 1]! + points[2 * after + 1]!) / 2;
}

const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);

/** Two clusters of nodes with links between them, and some links inside each: seeded. */
function clustered(links: number, seed: number): Fixture {
  const next = lcg(seed);
  const nodes = 40;
  const x = new Float64Array(nodes);
  const y = new Float64Array(nodes);
  for (let i = 0; i < nodes; i++) {
    x[i] = (i % 2 === 0 ? 0 : 400) + 80 * next();
    y[i] = 300 * next();
  }
  const source = new Int32Array(links);
  const target = new Int32Array(links);
  for (let k = 0; k < links; k++) {
    source[k] = Math.floor(next() * nodes);
    target[k] = Math.floor(next() * nodes);
  }
  return { x, y, source, target };
}

describe('edge compatibility', () => {
  it('is 1 for a link and itself, in either direction', () => {
    expect(edgeCompatibility([0, 0, 10, 0], [0, 0, 10, 0])).toBe(1);
    expect(edgeCompatibility([0, 0, 10, 0], [10, 0, 0, 0])).toBe(1);
    expect(edgeCompatibility([3, 4, 9, 12], [9, 12, 3, 4])).toBeCloseTo(1, 12);
  });

  it('is the product of the angle, scale, position and visibility measures', () => {
    // Parallel, the same length, 10 apart, fully facing each other: only position counts.
    expect(edgeCompatibility([0, 0, 200, 0], [0, 10, 200, 10])).toBeCloseTo(200 / 210, 12);
    // Twice as long around the same middle: scale 2 / (1.5 + 2 / 1.5), nothing else.
    expect(edgeCompatibility([-50, 0, 50, 0], [-100, 0, 100, 0])).toBeCloseTo(
      2 / (1.5 + 2 / 1.5),
      12,
    );
    // At 60 degrees through the same middle: angle 0.5, and each sees the other's whole shadow.
    const c = 50 * Math.cos(Math.PI / 3);
    const s = 50 * Math.sin(Math.PI / 3);
    expect(edgeCompatibility([-50, 0, 50, 0], [-c, -s, c, s])).toBeCloseTo(0.5, 10);
    // Shifted along itself by half its length: position 100 / 150, visibility 0 (the middle of
    // each lies at the end of the other).
    expect(edgeCompatibility([0, 0, 100, 0], [50, 5, 150, 5])).toBeCloseTo(0, 12);
    // Shifted by a quarter: position 100 / (100 + √(25² + 5²)), visibility 0.5.
    expect(edgeCompatibility([0, 0, 100, 0], [25, 5, 125, 5])).toBeCloseTo(
      (100 / (100 + Math.hypot(25, 5))) * 0.5,
      12,
    );
  });

  it('is 0 for perpendicular links and for links without length', () => {
    expect(edgeCompatibility([0, 0, 10, 0], [5, -5, 5, 5])).toBe(0);
    expect(edgeCompatibility([0, 0, 0, 0], [0, 0, 10, 0])).toBe(0);
    expect(edgeCompatibility([0, 0, 10, 0], [4, 4, 4, 4])).toBe(0);
    expect(edgeCompatibility([0, 0, NaN, 0], [0, 0, 10, 0])).toBe(0);
  });

  it('is symmetric and does not change when a link is reversed', () => {
    const next = lcg(5);
    for (let trial = 0; trial < 200; trial++) {
      const a = [next(), next(), next(), next()] as [number, number, number, number];
      const b = [next(), next(), next(), next()] as [number, number, number, number];
      const value = edgeCompatibility(a, b);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(edgeCompatibility(b, a)).toBeCloseTo(value, 12);
      expect(edgeCompatibility(a, [b[2], b[3], b[0], b[1]])).toBeCloseTo(value, 12);
    }
  });
});

describe('compatibility lists', () => {
  it('lists the compatible links of each link, the most compatible first', () => {
    const graph = fromSegments([...PARALLEL, [100, -100, 100, 100], [0, 5000, 200, 5000]]);
    const lists = linkCompatibility(graph, graph);
    expect(lists.bundleable).toBe(8);
    expect(lists.meanLength).toBe(200);
    expect(lists.start).toHaveLength(9);
    // Each parallel link has the five others; the crossing link and the far link have none.
    const counts = Array.from({ length: 8 }, (_, k) => lists.start[k + 1]! - lists.start[k]!);
    expect(counts).toEqual([5, 5, 5, 5, 5, 5, 0, 0]);
    // Link 0: the nearest first.
    expect(Array.from(lists.neighbour.subarray(0, 5))).toEqual([1, 2, 3, 4, 5]);
    expect(lists.compatibility[0]).toBeCloseTo(200 / 210, 12);
    expect(lists.compatibility[4]).toBeCloseTo(200 / 250, 12);
    // Link 2 is as close to 1 as to 3: the lower index first.
    expect(Array.from(lists.neighbour.subarray(10, 15))).toEqual([1, 3, 0, 4, 5]);
    expect(Array.from(lists.opposite)).toEqual(new Array(30).fill(0));
    for (let e = 0; e < 30; e++) expect(lists.compatibility[e]).toBeGreaterThanOrEqual(0.6);
  });

  it('marks neighbours that run the other way', () => {
    const graph = fromSegments([
      [0, 0, 200, 0],
      [200, 10, 0, 10],
      [0, 20, 200, 20],
    ]);
    const lists = linkCompatibility(graph, graph);
    expect(Array.from(lists.neighbour)).toEqual([1, 2, 0, 2, 1, 0]);
    expect(Array.from(lists.opposite)).toEqual([1, 0, 1, 1, 1, 0]);
  });

  it('keeps at most maxNeighbours per link and examines at most `candidates`', () => {
    const graph = fromSegments(PARALLEL);
    const two = linkCompatibility(graph, graph, { maxNeighbours: 2 });
    expect(Array.from(two.start)).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(Array.from(two.neighbour)).toEqual([1, 2, 0, 2, 1, 3, 2, 4, 3, 5, 4, 3]);
    // One candidate each: the first other link met in the search order.
    const one = linkCompatibility(graph, graph, { candidates: 1 });
    expect(one.neighbour).toHaveLength(6);
    for (let k = 0; k < 6; k++) expect(one.neighbour[k]).not.toBe(k);
    // More neighbours asked for than there are links is no trouble.
    const all = linkCompatibility(graph, graph, { maxNeighbours: 1e9, candidates: 1e9 });
    expect(all.neighbour).toHaveLength(30);
  });

  it('applies the threshold', () => {
    const graph = fromSegments(PARALLEL);
    // 0.9: only links at most 20 apart (200 / 220 = 0.909).
    const strict = linkCompatibility(graph, graph, { compatibility: 0.9 });
    expect(Array.from(strict.neighbour.subarray(0, strict.start[1]))).toEqual([1, 2]);
    // 0: every link with any compatibility at all (the crossing link has none with the others).
    const cross = fromSegments([...PARALLEL, [100, -100, 100, 100]]);
    const loose = linkCompatibility(cross, cross, { compatibility: 0 });
    expect(loose.start[1]).toBe(5);
    expect(loose.neighbour).toHaveLength(30);
  });

  it('finds the same lists on a large graph whatever the grid, when nothing is capped', () => {
    const graph = clustered(300, 3);
    const lists = linkCompatibility(graph, graph, { maxNeighbours: 300, candidates: 300 });
    const segment = (k: number): [number, number, number, number] => [
      graph.x[graph.source[k]!]!,
      graph.y[graph.source[k]!]!,
      graph.x[graph.target[k]!]!,
      graph.y[graph.target[k]!]!,
    ];
    let total = 0;
    for (let k = 0; k < 300; k++) {
      const found = Array.from(lists.neighbour.subarray(lists.start[k]!, lists.start[k + 1]!));
      const want: number[] = [];
      for (let q = 0; q < 300; q++) {
        if (q !== k && edgeCompatibility(segment(k), segment(q)) >= 0.6) want.push(q);
      }
      expect(found.sort((a, b) => a - b)).toEqual(want);
      total += want.length;
    }
    expect(total).toBeGreaterThan(1000);
  });

  it('handles no links, one link and links that are all on one point', () => {
    const none = linkCompatibility(
      { x: new Float64Array(3), y: new Float64Array(3) },
      fromSegments([]),
    );
    expect(none.bundleable).toBe(0);
    expect(Array.from(none.start)).toEqual([0]);
    const single = fromSegments([[0, 0, 10, 0]]);
    expect(linkCompatibility(single, single).neighbour).toHaveLength(0);
    // The same segment four times: one grid cell, all compatible.
    const same = fromSegments([
      [0, 0, 10, 0],
      [0, 0, 10, 0],
      [10, 0, 0, 0],
      [0, 0, 10, 0],
    ]);
    const lists = linkCompatibility(same, same);
    expect(Array.from(lists.neighbour)).toEqual([1, 2, 3, 0, 2, 3, 0, 1, 3, 0, 1, 2]);
    expect(Array.from(lists.compatibility)).toEqual(new Array(12).fill(1));
    // Midpoints on one line: a grid of one row.
    const line = fromSegments(PARALLEL.map(([x0, y0, x1]) => [x0, 0, x1 + y0, 0]));
    expect(linkCompatibility(line, line).neighbour.length).toBeGreaterThan(0);
  });
});

describe('force bundling', () => {
  it('leaves every link straight at strength 0', () => {
    const graph = fromSegments(PARALLEL);
    const result = forceBundle(graph, graph, { strength: 0 });
    expect(result).toEqual({
      routes: new Array(6).fill(undefined),
      method: 'none',
      refused: false,
    });
    expect(forceBundle(graph, graph, { strength: -1 }).method).toBe('none');
  });

  it('pulls parallel links together and leaves a crossing and a far link straight', () => {
    const graph = fromSegments([...PARALLEL, [100, -100, 100, 100], [0, 5000, 200, 5000]]);
    const result = forceBundle(graph, graph, { tolerance: 0 });
    expect(result.method).toBe('force');
    expect(result.refused).toBe(false);
    expect(result.routes).toHaveLength(8);
    // Not compatible with anything: the link across (angle) and the link far away (position).
    expect(result.routes[6]).toBeUndefined();
    expect(result.routes[7]).toBeUndefined();
    const middles = result.routes.slice(0, 6).map((route) => {
      expect(route!.kind).toBe('polyline');
      // 32 subdivision points and the two ends.
      expect(route!.points).toHaveLength(68);
      expect(wellFormed(route!)).toBe(true);
      return middleY(route!.points);
    });
    // The middles started 50 apart.
    expect(spread(middles)).toBeLessThan(15);
    expect(spread(middles)).toBeGreaterThan(0);
    // The bundle is around the middle of the six, and the links keep their order.
    expect((middles[0]! + middles[5]!) / 2).toBeCloseTo(25, 6);
    for (let k = 1; k < 6; k++) expect(middles[k]!).toBeGreaterThan(middles[k - 1]!);
    // Ends exactly on the nodes; points run left to right; nothing leaves the band of the links.
    result.routes.slice(0, 6).forEach((route, k) => {
      const p = route!.points;
      expect([p[0], p[1], p[66], p[67]]).toEqual([0, 10 * k, 200, 10 * k]);
      for (let i = 2; i < p.length; i += 2) {
        expect(p[i]!).toBeGreaterThan(p[i - 2]!);
        expect(p[i + 1]!).toBeGreaterThanOrEqual(0);
        expect(p[i + 1]!).toBeLessThanOrEqual(50);
      }
    });
  });

  it('bundles links that run in opposite directions: matching points are mirrored', () => {
    const segments = PARALLEL.map(([x0, y0, x1, y1], k): [number, number, number, number] =>
      k % 2 === 1 ? [x1, y1, x0, y0] : [x0, y0, x1, y1],
    );
    const graph = fromSegments(segments);
    const result = forceBundle(graph, graph, { tolerance: 0 });
    const middles = result.routes.map((route) => middleY(route!.points));
    expect(spread(middles)).toBeLessThan(15);
    // The same shapes as when all run the same way: a reversed link's route is the reverse.
    const sameWay = fromSegments(PARALLEL);
    const reference = forceBundle(sameWay, sameWay, { tolerance: 0 });
    result.routes.forEach((route, k) => {
      const p = route!.points;
      const want = reference.routes[k]!.points;
      const count = p.length / 2;
      for (let i = 0; i < count; i++) {
        const j = k % 2 === 1 ? count - 1 - i : i;
        expect(p[2 * i]).toBeCloseTo(want[2 * j]!, 9);
        expect(p[2 * i + 1]).toBeCloseTo(want[2 * j + 1]!, 9);
      }
    });
    // Each point of a link that runs right to left is near the bundle, not at its mirror image.
    const reversed = result.routes[1]!.points;
    for (let i = 2; i < reversed.length; i += 2)
      expect(reversed[i]!).toBeLessThan(reversed[i - 2]!);
  });

  it('bundles more with more strength and less with more stiffness', () => {
    const graph = fromSegments(PARALLEL);
    const at = (options: object): number =>
      spread(
        forceBundle(graph, graph, { tolerance: 0, ...options }).routes.map((route) =>
          middleY(route!.points),
        ),
      );
    expect(at({ strength: 1 })).toBeLessThan(at({ strength: 0.5 }));
    expect(at({ strength: 0.5 })).toBeLessThan(at({ strength: 0.1 }));
    expect(at({ strength: 0.1 })).toBeLessThan(50);
    expect(at({ stiffness: 0.02 })).toBeLessThan(at({ stiffness: 0.1 }));
    expect(at({ stiffness: 0.1 })).toBeLessThan(at({ stiffness: 0.5 }));
    // Stiffness is capped at 0.5; a value that is no number is the default.
    expect(at({ stiffness: 9 })).toBe(at({ stiffness: 0.5 }));
    expect(at({ stiffness: NaN })).toBe(at({}));
  });

  it('does not depend on the unit of the coordinates', () => {
    const graph = fromSegments(PARALLEL);
    const scaled = fromSegments(
      PARALLEL.map(([x0, y0, x1, y1]) => [1024 * x0, 1024 * y0, 1024 * x1, 1024 * y1]),
    );
    const a = forceBundle(graph, graph, { tolerance: 0 });
    const b = forceBundle(scaled, scaled, { tolerance: 0 });
    a.routes.forEach((route, k) => {
      const p = route!.points;
      const q = b.routes[k]!.points;
      for (let i = 0; i < p.length; i++) expect(q[i]! / 1024).toBeCloseTo(p[i]!, 8);
    });
  });

  it('thins the routes within the tolerance', () => {
    const graph = clustered(120, 9);
    const full = forceBundle(graph, graph, { tolerance: 0 });
    const thin = forceBundle(graph, graph);
    const coarse = forceBundle(graph, graph, { tolerance: 2 });
    let fullPoints = 0;
    let thinPoints = 0;
    let coarsePoints = 0;
    full.routes.forEach((route, k) => {
      if (!route) {
        expect(thin.routes[k]).toBeUndefined();
        return;
      }
      fullPoints += route.points.length / 2;
      const kept = thin.routes[k];
      // A route that is straight within the tolerance is dropped altogether.
      const p = kept
        ? kept.points
        : new Float64Array([
            route.points[0]!,
            route.points[1]!,
            route.points[66]!,
            route.points[67]!,
          ]);
      thinPoints += p.length / 2;
      coarsePoints += (coarse.routes[k]?.points.length ?? 4) / 2;
      expect([p[0], p[1], p[p.length - 2], p[p.length - 1]]).toEqual([
        route.points[0],
        route.points[1],
        route.points[66],
        route.points[67],
      ]);
      // Every point of the full route is within the tolerance of the thinned one.
      for (let i = 0; i < route.points.length; i += 2) {
        let best = Infinity;
        for (let j = 0; j + 3 < p.length; j += 2) {
          const ux = p[j + 2]! - p[j]!;
          const uy = p[j + 3]! - p[j + 1]!;
          const vx = route.points[i]! - p[j]!;
          const vy = route.points[i + 1]! - p[j + 1]!;
          const t = Math.min(1, Math.max(0, (vx * ux + vy * uy) / (ux * ux + uy * uy)));
          best = Math.min(best, Math.hypot(vx - t * ux, vy - t * uy));
        }
        expect(best).toBeLessThanOrEqual(0.25 + 1e-9);
      }
    });
    expect(thinPoints).toBeLessThan(fullPoints);
    expect(coarsePoints).toBeLessThan(thinPoints);
  });

  it('runs the cycles asked for: 2^(cycles − 1) points per link', () => {
    const graph = fromSegments(PARALLEL);
    for (const [cycles, points] of [
      [1, 3],
      [2, 4],
      [4, 10],
      [7, 66],
      [99, 66],
      [0, 3],
    ] as const) {
      const result = forceBundle(graph, graph, { cycles, tolerance: 0 });
      expect(result.routes[0]!.points).toHaveLength(2 * points);
      expect(wellFormed(result.routes[0]!)).toBe(true);
    }
    // No iterations: the links are subdivided and smoothed but nothing has moved them.
    const still = forceBundle(graph, graph, { iterations: 0 });
    expect(still).toEqual({ routes: new Array(6).fill(undefined), method: 'none', refused: false });
    // More smoothing only flattens.
    const rough = forceBundle(graph, graph, { smoothing: 0, tolerance: 0 });
    const smooth = forceBundle(graph, graph, { smoothing: 8, tolerance: 0 });
    expect(wellFormed(rough.routes[0]!)).toBe(true);
    const flattened = middleY(rough.routes[0]!.points) - middleY(smooth.routes[0]!.points);
    expect(flattened).toBeGreaterThan(0);
    expect(flattened).toBeLessThan(0.5);
  });

  it('gives the same bytes on every run', () => {
    const graph = clustered(150, 21);
    const a = forceBundle(graph, graph);
    const b = forceBundle(graph, graph);
    expect(a.method).toBe('force');
    expect(a.routes.filter((route) => route !== undefined).length).toBeGreaterThan(50);
    a.routes.forEach((route, k) => {
      const other = b.routes[k];
      expect(other === undefined).toBe(route === undefined);
      if (route && other) expect(bytes(other)).toEqual(bytes(route));
    });
  });

  it('gives the same routes whatever the order and the direction of the links', () => {
    // 30 links: fewer than maxNeighbours and than the candidate budget, so no bound applies and
    // only the order of the sums differs.
    const graph = clustered(30, 4);
    const reference = forceBundle(graph, graph, { tolerance: 0 });
    expect(reference.routes.filter((route) => route !== undefined).length).toBeGreaterThan(10);
    // Link k of the shuffled graph is link order[k] of the original, every third one reversed.
    const order = Array.from({ length: 30 }, (_, k) => (7 * k + 3) % 30);
    const shuffled = {
      source: Int32Array.from(order, (k, i) => (i % 3 === 0 ? graph.target[k]! : graph.source[k]!)),
      target: Int32Array.from(order, (k, i) => (i % 3 === 0 ? graph.source[k]! : graph.target[k]!)),
    };
    const result = forceBundle(graph, shuffled, { tolerance: 0 });
    order.forEach((k, i) => {
      const want = reference.routes[k];
      const got = result.routes[i];
      expect(got === undefined).toBe(want === undefined);
      if (!want || !got) return;
      const count = want.points.length / 2;
      expect(got.points).toHaveLength(2 * count);
      for (let p = 0; p < count; p++) {
        const q = i % 3 === 0 ? count - 1 - p : p;
        expect(got.points[2 * p]).toBeCloseTo(want.points[2 * q]!, 9);
        expect(got.points[2 * p + 1]).toBeCloseTo(want.points[2 * q + 1]!, 9);
      }
    });
  });

  it('keeps every route inside the box of the nodes, finite, with its ends on the nodes', () => {
    const graph = clustered(200, 33);
    const result = forceBundle(graph, graph);
    const minX = Math.min(...graph.x);
    const maxX = Math.max(...graph.x);
    const minY = Math.min(...graph.y);
    const maxY = Math.max(...graph.y);
    let bundled = 0;
    result.routes.forEach((route, k) => {
      if (!route) return;
      bundled++;
      expect(wellFormed(route)).toBe(true);
      const p = route.points;
      expect(p.length).toBeGreaterThanOrEqual(6);
      expect(p.length).toBeLessThanOrEqual(68);
      expect(p[0]).toBe(graph.x[graph.source[k]!]);
      expect(p[1]).toBe(graph.y[graph.source[k]!]);
      expect(p[p.length - 2]).toBe(graph.x[graph.target[k]!]);
      expect(p[p.length - 1]).toBe(graph.y[graph.target[k]!]);
      for (let i = 0; i < p.length; i += 2) {
        expect(p[i]!).toBeGreaterThanOrEqual(minX - 1e-9);
        expect(p[i]!).toBeLessThanOrEqual(maxX + 1e-9);
        expect(p[i + 1]!).toBeGreaterThanOrEqual(minY - 1e-9);
        expect(p[i + 1]!).toBeLessThanOrEqual(maxY + 1e-9);
      }
    });
    expect(bundled).toBeGreaterThan(100);
  });

  it('handles no links, a single link, self-links and nodes without a position', () => {
    const positions = {
      x: new Float64Array([0, 200, 0, 200]),
      y: new Float64Array([0, 0, 10, 10]),
    };
    const empty = { source: new Int32Array(0), target: new Int32Array(0) };
    expect(forceBundle(positions, empty)).toEqual({ routes: [], method: 'none', refused: false });
    const single = { source: new Int32Array([0]), target: new Int32Array([1]) };
    expect(forceBundle(positions, single)).toEqual({
      routes: [undefined],
      method: 'none',
      refused: false,
    });
    // A self-link, an end that is no node, a missing position and a link of length 0 are skipped;
    // the two good links still bundle.
    const x = new Float64Array([0, 200, 0, 200, NaN, 50, 50]);
    const y = new Float64Array([0, 0, 10, 10, 5, 7, 7]);
    const graph = {
      source: new Int32Array([0, 1, 0, 2, 4, 5, 2, -1]),
      target: new Int32Array([1, 1, 9, 3, 1, 6, 4, 2]),
    };
    const result = forceBundle({ x, y }, graph, { tolerance: 0 });
    expect(result.method).toBe('force');
    expect(result.routes.map((route) => route !== undefined)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(wellFormed(result.routes[0]!)).toBe(true);
    expect(middleY(result.routes[0]!.points)).toBeGreaterThan(0);
    expect(middleY(result.routes[3]!.points)).toBeLessThan(10);
    // Coordinates too large to square are no position either.
    const huge = fromSegments([
      [0, 0, 1e200, 0],
      [0, 1e199, 1e200, 1e199],
    ]);
    expect(forceBundle(huge, huge).routes).toEqual([undefined, undefined]);
  });

  it('refuses a graph over the size cap', () => {
    const graph = fromSegments(PARALLEL);
    expect(forceBundle(graph, graph, { maxLinks: 5 })).toEqual({
      routes: new Array(6).fill(undefined),
      method: 'none',
      refused: true,
    });
    // At the cap it runs; links that cannot be bundled do not count.
    expect(forceBundle(graph, graph, { maxLinks: 6 }).method).toBe('force');
    const padded = {
      x: graph.x,
      y: graph.y,
      source: Int32Array.from([...graph.source, 0, 1, 2]),
      target: Int32Array.from([...graph.target, 0, 1, 99]),
    };
    const result = forceBundle(padded, padded, { maxLinks: 6 });
    expect(result.refused).toBe(false);
    expect(result.routes).toHaveLength(9);
    expect(forceBundle(graph, graph, { maxLinks: 0 }).refused).toBe(true);
  });
});
