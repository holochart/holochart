import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PointIndex, pointInPolygon } from './point-index.ts';

function bruteNearestDist(xs: number[], ys: number[], qx: number, qy: number): number {
  let best = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] as number;
    const y = ys[i] as number;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    best = Math.min(best, Math.hypot(x - qx, y - qy));
  }
  return best;
}

const coord = fc.oneof(
  { weight: 9, arbitrary: fc.double({ min: -1000, max: 1000, noNaN: true }) },
  { weight: 1, arbitrary: fc.constant(Number.NaN) },
);

describe('pointInPolygon', () => {
  it('handles a concave (L-shaped) polygon', () => {
    const L = [0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2];
    expect(pointInPolygon(0.5, 0.5, L)).toBe(true);
    expect(pointInPolygon(0.5, 1.5, L)).toBe(true);
    expect(pointInPolygon(1.5, 0.5, L)).toBe(true);
    expect(pointInPolygon(1.5, 1.5, L)).toBe(false); // the notch
  });

  it('returns false for fewer than 3 vertices', () => {
    expect(pointInPolygon(0, 0, [])).toBe(false);
    expect(pointInPolygon(0.5, 0, [0, 0, 1, 0])).toBe(false);
  });
});

describe('PointIndex', () => {
  it('nearest matches brute force over random point sets with NaN gaps', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(coord, coord), { maxLength: 200 }),
        fc.double({ min: -1200, max: 1200, noNaN: true }),
        fc.double({ min: -1200, max: 1200, noNaN: true }),
        (pts, qx, qy) => {
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          const index = new PointIndex(Float64Array.from(xs), Float64Array.from(ys), {
            nodeSize: 4,
          });
          const expected = bruteNearestDist(xs, ys, qx, qy);
          const hit = index.nearest(qx, qy);
          if (expected === Infinity) {
            expect(hit).toBe(-1);
          } else {
            // Compare distances, not indices: ties are allowed to resolve either way.
            expect(Number.isFinite(xs[hit]) && Number.isFinite(ys[hit])).toBe(true);
            expect(Math.hypot((xs[hit] as number) - qx, (ys[hit] as number) - qy)).toBeCloseTo(
              expected,
              9,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('respects the maxDistance cutoff', () => {
    const index = new PointIndex([0, 10], [0, 0]);
    expect(index.nearest(3, 0, 2)).toBe(-1);
    expect(index.nearest(3, 0, 3)).toBe(0);
    expect(index.nearest(7, 0, 5)).toBe(1);
  });

  it('skips NaN gaps and reports original indices', () => {
    const x = new Float64Array([NaN, 1, NaN, 5, Infinity, 9]);
    const y = new Float64Array([0, 0, 0, NaN, 0, 0]);
    const index = new PointIndex(x, y);
    expect(index.size).toBe(2);
    expect(index.nearest(0, 0)).toBe(1);
    expect(index.nearest(5, 0)).toBe(1); // index 3 is a gap in y
    expect(index.nearest(8, 0)).toBe(5);
    expect(index.withinRect(-100, -100, 100, 100)).toEqual([1, 5]);
  });

  it('uses the shorter length when x and y differ', () => {
    const index = new PointIndex([0, 1, 2, 3], [0, 0]);
    expect(index.size).toBe(2);
    expect(index.nearest(3, 0)).toBe(1);
  });

  it('handles empty and all-NaN input', () => {
    for (const index of [new PointIndex([], []), new PointIndex([NaN, NaN], [0, NaN])]) {
      expect(index.size).toBe(0);
      expect(index.nearest(0, 0)).toBe(-1);
      expect(index.nearestK(0, 0, 3)).toEqual([]);
      expect(index.withinRect(-1, -1, 1, 1)).toEqual([]);
      expect(index.withinRadius(0, 0, 10)).toEqual([]);
      expect(index.withinPolygon([-1, -1, 1, -1, 0, 1])).toEqual([]);
    }
  });

  it('builds lazily and rebuilds after invalidate', () => {
    const x = new Float64Array([0, 1, 2]);
    const y = new Float64Array([0, 0, 0]);
    const index = new PointIndex(x, y);
    expect(index.built).toBe(false);
    expect(index.nearest(1.9, 0)).toBe(2);
    expect(index.built).toBe(true);

    // In-place mutation is only picked up after invalidate().
    x[2] = 100;
    index.invalidate();
    expect(index.built).toBe(false);
    expect(index.nearest(1.9, 0)).toBe(1);
    expect(index.built).toBe(true);

    // Swapping arrays.
    index.invalidate(new Float64Array([5, NaN]), new Float64Array([5, 5]));
    expect(index.size).toBe(1);
    expect(index.nearest(0, 0)).toBe(0);
  });

  it('withinRect accepts corners in any order and is inclusive', () => {
    const index = new PointIndex([0, 1, 2, 3], [0, 1, 2, 3]);
    const expected = [1, 2];
    expect(index.withinRect(1, 1, 2, 2)).toEqual(expected);
    expect(index.withinRect(2, 2, 1, 1)).toEqual(expected);
    expect(index.withinRect(1, 2, 2, 1)).toEqual(expected);
    expect(index.withinRect(2, 1, 1, 2)).toEqual(expected);
  });

  it('withinRadius is inclusive and sorted ascending', () => {
    const index = new PointIndex([5, 0, 3, 1, 0], [0, 0, 4, 1, 5.01]);
    // Distances from origin: 5, 0, 5, √2, 5.01
    expect(index.withinRadius(0, 0, 5)).toEqual([0, 1, 2, 3]);
    expect(index.withinRadius(0, 0, 1)).toEqual([1]);
    expect(index.withinRadius(0, 0, -1)).toEqual([]);
  });

  it('nearestK returns points ordered by distance', () => {
    const index = new PointIndex([10, 1, NaN, 3, 2], [0, 0, 0, 0, 0]);
    expect(index.nearestK(0, 0, 3)).toEqual([1, 4, 3]);
    expect(index.nearestK(0, 0, 10)).toEqual([1, 4, 3, 0]);
    expect(index.nearestK(0, 0, 10, 2.5)).toEqual([1, 4]);
    expect(index.nearestK(0, 0, 0)).toEqual([]);
  });

  it('withinPolygon handles a concave polygon', () => {
    // Grid points at the centres of the four unit cells of an L-shape's bounding box.
    const index = new PointIndex([0.5, 1.5, 0.5, 1.5, NaN], [0.5, 0.5, 1.5, 1.5, 0.5]);
    const L = [0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2];
    expect(index.withinPolygon(L)).toEqual([0, 1, 2]);
    expect(index.withinPolygon([0, 0, 2, 2])).toEqual([]);
  });

  it('withinPolygon uses the even-odd rule for a self-intersecting bowtie', () => {
    // Bowtie crossing at (1, 1): left and right triangles are inside; above/below the
    // crossing point (inside the bbox but outside both lobes) are outside.
    const bowtie = [0, 0, 2, 2, 2, 0, 0, 2];
    const index = new PointIndex([0.3, 1.7, 1, 1, 5], [1, 1, 0.3, 1.7, 1]);
    expect(index.withinPolygon(bowtie)).toEqual([0, 1]);
  });

  it('withinPolygon excludes doubly-covered regions (pentagram centre) under even-odd', () => {
    // Star drawn by visiting every second vertex of a regular pentagon: the centre pentagon is
    // wound twice, so non-zero would include it but even-odd must not.
    const star: number[] = [];
    for (let k = 0; k < 5; k++) {
      const a = Math.PI / 2 + (k * 2 * (2 * Math.PI)) / 5;
      star.push(Math.cos(a), Math.sin(a));
    }
    const index = new PointIndex([0, 0, 0], [0, 0.8, -0.9]);
    // (0, 0): centre; (0, 0.8): inside the top spike; (0, -0.9): between the two bottom spikes.
    expect(index.withinPolygon(star)).toEqual([1]);
  });

  it('withinPolygon agrees with brute force bbox + pointInPolygon', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(coord, coord), { maxLength: 100 }),
        fc.array(fc.double({ min: -1000, max: 1000, noNaN: true }), {
          minLength: 6,
          maxLength: 20,
        }),
        (pts, poly) => {
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          // Points exactly on an edge are numerically ambiguous for the crossing test (it can
          // even claim points a denormal outside the bbox); the index's bbox prefilter settles
          // those, so the oracle applies the same prefilter.
          const vx = poly.filter((_, i) => i % 2 === 0 && i + 1 < poly.length);
          const vy = poly.filter((_, i) => i % 2 === 1);
          const [x0, x1] = [Math.min(...vx), Math.max(...vx)];
          const [y0, y1] = [Math.min(...vy), Math.max(...vy)];
          const expected: number[] = [];
          for (let i = 0; i < xs.length; i++) {
            const x = xs[i] as number;
            const y = ys[i] as number;
            const inBox = x >= x0 && x <= x1 && y >= y0 && y <= y1;
            if (Number.isFinite(x) && Number.isFinite(y) && inBox && pointInPolygon(x, y, poly)) {
              expected.push(i);
            }
          }
          expect(new PointIndex(xs, ys).withinPolygon(poly)).toEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});
