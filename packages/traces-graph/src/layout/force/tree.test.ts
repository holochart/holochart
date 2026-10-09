import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { seeded } from './__testing__/graphs.ts';
import { Lcg } from './math.ts';
import { BarnesHutTree } from './tree.ts';

interface Cloud {
  readonly n: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  readonly mass: Float64Array;
}

/** `n` points in a few clumps (so cells differ in size and depth), masses of −1 to −5. */
function cloud(n: number, seed: number, three: boolean): Cloud {
  const next = seeded(seed);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = new Float64Array(n);
  const mass = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const clump = i % 5;
    const spread = 20 + 60 * clump;
    x[i] = clump * 300 + (next() - 0.5) * spread;
    y[i] = (clump % 2) * 200 + (next() - 0.5) * spread;
    z[i] = three ? (next() - 0.5) * spread : 0;
    mass[i] = -1 - Math.floor(next() * 5);
  }
  return { n, x, y, z, mass };
}

/** The sum the tree approximates, pair by pair: `Σ mass[j] × (p[j] − p[i]) / d²`. */
function exact(c: Cloud, distanceMin = 0, distanceMax = Infinity): Float64Array[] {
  const out = [new Float64Array(c.n), new Float64Array(c.n), new Float64Array(c.n)];
  for (let i = 0; i < c.n; i++) {
    for (let j = 0; j < c.n; j++) {
      if (i === j) continue;
      const dx = c.x[j]! - c.x[i]!;
      const dy = c.y[j]! - c.y[i]!;
      const dz = c.z[j]! - c.z[i]!;
      let l = dx * dx + dy * dy + dz * dz;
      if (l >= distanceMax * distanceMax) continue;
      if (l < distanceMin * distanceMin) l = Math.sqrt(distanceMin * distanceMin * l);
      out[0]![i]! += (c.mass[j]! * dx) / l;
      out[1]![i]! += (c.mass[j]! * dy) / l;
      out[2]![i]! += (c.mass[j]! * dz) / l;
    }
  }
  return out;
}

function approximate(
  c: Cloud,
  three: boolean,
  theta: number,
  distanceMin = 0,
  distanceMax = Infinity,
  leafSize?: number,
): Float64Array[] {
  const tree = new BarnesHutTree(three ? 3 : 2, leafSize);
  tree.build(c.n, c.x, c.y, c.z, c.mass, null);
  const out = [new Float64Array(c.n), new Float64Array(c.n), new Float64Array(c.n)];
  tree.accumulate(
    out[0]!,
    out[1]!,
    out[2]!,
    theta * theta,
    distanceMin * distanceMin,
    distanceMax * distanceMax,
    new Lcg(1),
  );
  return out;
}

/**
 * The error of each node's sum, `|approximate − exact|`, as a share of the mean size of the exact
 * sums (not of the node's own: where pushes cancel, a node's sum is near zero and any error is
 * large beside it). The mean over the nodes and the largest.
 */
function relativeError(a: Float64Array[], b: Float64Array[]): { mean: number; max: number } {
  const n = a[0]!.length;
  let scale = 0;
  for (let i = 0; i < n; i++) scale += Math.hypot(b[0]![i]!, b[1]![i]!, b[2]![i]!) / n;
  let sum = 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const error = Math.hypot(a[0]![i]! - b[0]![i]!, a[1]![i]! - b[1]![i]!, a[2]![i]! - b[2]![i]!);
    const relative = scale > 0 ? error / scale : error;
    sum += relative;
    if (relative > max) max = relative;
  }
  return { mean: sum / n, max };
}

describe('Barnes–Hut tree: the far-field sum', () => {
  it.each([
    ['quadtree', false],
    ['octree', true],
  ] as const)('%s: theta 0 is the exact sum', (_, three) => {
    const c = cloud(400, 7, three);
    expect(relativeError(approximate(c, three, 0), exact(c)).max).toBeLessThan(1e-10);
  });

  it.each([
    ['quadtree', false],
    ['octree', true],
  ] as const)('%s: theta 0.9 stays close to the exact sum', (_, three) => {
    const c = cloud(600, 11, three);
    const error = relativeError(approximate(c, three, 0.9), exact(c));
    // Measured: a mean of 2.2% (2D) and 3.5% (3D), a worst node at 21% and 23%.
    expect(error.mean).toBeLessThan(0.05);
    expect(error.max).toBeLessThan(0.35);
  });

  it('gets more accurate as theta falls', () => {
    const c = cloud(600, 3, false);
    const truth = exact(c);
    const errors = [1.5, 0.9, 0.5, 0.2].map((t) => relativeError(approximate(c, false, t), truth));
    for (let k = 1; k < errors.length; k++) {
      expect(errors[k]!.mean).toBeLessThan(errors[k - 1]!.mean);
    }
  });

  it('gives the same sum whatever the leaf size at theta 0', () => {
    const c = cloud(300, 5, true);
    const truth = exact(c);
    for (const leafSize of [1, 2, 8, 64, 1000]) {
      expect(relativeError(approximate(c, true, 0, 0, Infinity, leafSize), truth).max).toBeLessThan(
        1e-10,
      );
    }
  });

  it('softens pairs closer than distanceMin and leaves out those beyond distanceMax', () => {
    const c = cloud(300, 9, false);
    const got = approximate(c, false, 0, 40, 250);
    expect(relativeError(got, exact(c, 40, 250)).max).toBeLessThan(1e-10);
    // And the cut-off does something: the unbounded sum differs.
    expect(relativeError(got, exact(c)).max).toBeGreaterThan(0.01);
  });

  it('leaves z alone in a quadtree', () => {
    const c = cloud(50, 2, false);
    const tree = new BarnesHutTree(2);
    tree.build(c.n, c.x, c.y, c.z, c.mass, null);
    const outZ = new Float64Array(c.n).fill(123);
    tree.accumulate(
      new Float64Array(c.n),
      new Float64Array(c.n),
      outZ,
      0.81,
      1,
      Infinity,
      new Lcg(1),
    );
    expect([...outZ].every((v) => v === 123)).toBe(true);
  });

  it('handles no points, one point and attracting masses', () => {
    const tree = new BarnesHutTree(2);
    const none = new Float64Array(0);
    tree.build(0, none, none, none, none, null);
    expect(tree.count).toBe(0);
    tree.accumulate(none, none, none, 0.81, 1, Infinity, new Lcg(1));

    const one = Float64Array.of(5);
    const out = Float64Array.of(99);
    tree.build(1, one, one, one, Float64Array.of(-30), null);
    tree.accumulate(out, new Float64Array(1), new Float64Array(1), 0.81, 1, Infinity, new Lcg(1));
    expect(out[0]).toBe(0);

    // Two points, positive mass: each is pulled toward the other.
    const x = Float64Array.of(0, 10);
    const zero = new Float64Array(2);
    const pull = new Float64Array(2);
    tree.build(2, x, zero, zero, Float64Array.of(2, 2), null);
    tree.accumulate(pull, new Float64Array(2), new Float64Array(2), 0.81, 0, Infinity, new Lcg(1));
    expect(pull[0]).toBeCloseTo(0.2, 12);
    expect(pull[1]).toBeCloseTo(-0.2, 12);
  });

  it('parts coincident points in a seeded direction, finitely', () => {
    // 40 points on one spot (more than a leaf holds) and one apart.
    const n = 41;
    const x = new Float64Array(n).fill(3);
    const y = new Float64Array(n).fill(-2);
    const z = new Float64Array(n);
    x[40] = 50;
    const mass = new Float64Array(n).fill(-30);
    const run = (seed: number): Float64Array[] => {
      const tree = new BarnesHutTree(2);
      tree.build(n, x, y, z, mass, null);
      const out = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
      tree.accumulate(out[0]!, out[1]!, out[2]!, 0.81, 1, Infinity, new Lcg(seed));
      return out;
    };
    const a = run(1);
    expect(a[0]!.every(Number.isFinite) && a[1]!.every(Number.isFinite)).toBe(true);
    expect(a[0]!.slice(0, 40).some((v) => v !== a[0]![0])).toBe(true);
    expect(run(1)).toEqual(a);
    expect(run(2)).not.toEqual(a);
  });

  it('survives coordinates no box can be split around', () => {
    const x = Float64Array.of(1e300, -1e300, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
    const y = new Float64Array(12);
    const tree = new BarnesHutTree(2, 2);
    tree.build(12, x, y, y, new Float64Array(12).fill(-1), null);
    const out = [new Float64Array(12), new Float64Array(12)];
    tree.accumulate(out[0]!, out[1]!, new Float64Array(12), 0.81, 1, Infinity, new Lcg(1));
    expect(out[0]!.every(Number.isFinite) && out[1]!.every(Number.isFinite)).toBe(true);
  });

  it('property: theta 0 equals the pairwise sum for any points, duplicates included', () => {
    const coordinate = fc.integer({ min: -50, max: 50 });
    fc.assert(
      fc.property(
        fc.array(fc.tuple(coordinate, coordinate, coordinate), { minLength: 2, maxLength: 60 }),
        fc.boolean(),
        fc.integer({ min: 1, max: 9 }),
        (list, three, leafSize) => {
          // Distinct points only: coincident ones part at random, which no closed form predicts.
          const seen = new Set<string>();
          const points = list.filter(([px, py, pz]) => {
            const key = three ? `${px},${py},${pz}` : `${px},${py}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          const c: Cloud = {
            n: points.length,
            x: Float64Array.from(points, (p) => p[0]),
            y: Float64Array.from(points, (p) => p[1]),
            z: Float64Array.from(points, (p) => (three ? p[2] : 0)),
            mass: Float64Array.from(points, (_, i) => -1 - (i % 3)),
          };
          const error = relativeError(approximate(c, three, 0, 0, Infinity, leafSize), exact(c));
          expect(error.max).toBeLessThan(1e-9);
        },
      ),
    );
  });
});

describe('Barnes–Hut tree: collision', () => {
  /** Moves from one collision pass over points of the given radii. */
  function separate(
    x: number[],
    y: number[],
    radius: number[],
    pinned: number[] = [],
    three = false,
    z: number[] = [],
  ): Float64Array[] {
    const n = x.length;
    const tree = new BarnesHutTree(three ? 3 : 2, 2);
    const zs = Float64Array.from({ length: n }, (_, i) => z[i] ?? 0);
    tree.build(n, Float64Array.from(x), Float64Array.from(y), zs, null, Float64Array.from(radius));
    const out = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    const pins = Uint8Array.from({ length: n }, (_, i) => pinned[i] ?? 0);
    tree.separate(out[0]!, out[1]!, out[2]!, pins, 1, new Lcg(1));
    return out;
  }

  it('pushes two equal overlapping circles apart until they touch', () => {
    const [dx, dy] = separate([0, 6], [0, 0], [5, 5]);
    expect([...dx!]).toEqual([-2, 2]);
    expect([...dy!]).toEqual([0, 0]);
  });

  it('moves the smaller circle more, by the squared radii', () => {
    const [dx] = separate([0, 9], [0, 0], [9, 3]);
    // Overlap 3; shares 9 / 90 and 81 / 90.
    expect(dx![0]).toBeCloseTo(-0.3, 12);
    expect(dx![1]).toBeCloseTo(2.7, 12);
  });

  it('leaves circles that only touch, or are apart, alone', () => {
    const [dx, dy] = separate([0, 10, 30], [0, 0, 0], [5, 5, 5]);
    expect([...dx!, ...dy!]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('gives the whole push to the free one of a pinned pair, and none to two pinned', () => {
    expect([...separate([0, 6], [0, 0], [5, 5], [1, 0])[0]!]).toEqual([0, 4]);
    expect([...separate([0, 6], [0, 0], [5, 5], [0, 1])[0]!]).toEqual([-4, 0]);
    expect([...separate([0, 6], [0, 0], [5, 5], [1, 1])[0]!]).toEqual([0, 0]);
  });

  it('separates along z in an octree', () => {
    const out = separate([0, 0], [0, 0], [5, 5], [], true, [0, 6]);
    expect([...out[2]!]).toEqual([-2, 2]);
  });

  it('parts coincident circles by their whole overlap', () => {
    const [dx, dy] = separate([1, 1], [1, 1], [4, 4]);
    expect(Math.hypot(dx![0]! - dx![1]!, dy![0]! - dy![1]!)).toBeCloseTo(8, 6);
  });

  it('finds every overlapping pair, large and small radii mixed', () => {
    // Pairs scattered over a wide field, each far from the others: some overlap, some do not,
    // and every eighth pair is far larger than the rest.
    const next = seeded(4);
    const x: number[] = [];
    const y: number[] = [];
    const radius: number[] = [];
    const expected: number[] = [];
    for (let p = 0; p < 150; p++) {
      const big = p % 8 === 0;
      const ra = big ? 150 + next() * 100 : 2 + next() * 8;
      const rb = big ? 2 + next() * 8 : 2 + next() * 8;
      const gap = (ra + rb) * (0.5 + next());
      const angle = next() * 2 * Math.PI;
      const cx = (p % 15) * 2000 + next() * 300;
      const cy = Math.floor(p / 15) * 2000 + next() * 300;
      x.push(cx, cx + gap * Math.cos(angle));
      y.push(cy, cy + gap * Math.sin(angle));
      radius.push(ra, rb);
      if (gap < ra + rb) expected.push(2 * p, 2 * p + 1);
    }
    const [dx, dy] = separate(x, y, radius);
    const moved: number[] = [];
    for (let i = 0; i < x.length; i++) if (dx![i] !== 0 || dy![i] !== 0) moved.push(i);
    expect(expected.length).toBeGreaterThan(100);
    expect(expected.length).toBeLessThan(250);
    expect(moved).toEqual(expected);
    // Each overlapping pair ends exactly touching.
    for (let k = 0; k < expected.length; k += 2) {
      const a = expected[k]!;
      const b = a + 1;
      const apart = Math.hypot(
        x[a]! + dx![a]! - x[b]! - dx![b]!,
        y[a]! + dy![a]! - y[b]! - dy![b]!,
      );
      expect(apart).toBeCloseTo(radius[a]! + radius[b]!, 9);
    }
  });

  it('clears a clump of overlapping circles, pass by pass', () => {
    const next = seeded(8);
    const n = 200;
    const x = Float64Array.from({ length: n }, () => next() * 300);
    const y = Float64Array.from({ length: n }, () => next() * 300);
    const z = new Float64Array(n);
    const radius = Float64Array.from({ length: n }, () => 3 + next() * 9);
    const overlap = (): number => {
      let worst = 0;
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          const depth = radius[a]! + radius[b]! - Math.hypot(x[a]! - x[b]!, y[a]! - y[b]!);
          if (depth > worst) worst = depth;
        }
      }
      return worst;
    };
    const tree = new BarnesHutTree(2);
    const pins = new Uint8Array(n);
    const dx = new Float64Array(n);
    const dy = new Float64Array(n);
    const rng = new Lcg(1);
    const before = overlap();
    expect(before).toBeGreaterThan(10);
    let passes = 0;
    let reported = Infinity;
    while (reported > 1e-3 && passes < 500) {
      dx.fill(0);
      dy.fill(0);
      tree.build(n, x, y, z, null, radius);
      reported = tree.separate(dx, dy, new Float64Array(n), pins, 1, rng);
      for (let i = 0; i < n; i++) {
        x[i]! += dx[i]!;
        y[i]! += dy[i]!;
      }
      passes++;
    }
    // Measured: 58 passes to a thousandth of a unit, from overlaps of more than 10.
    expect(passes).toBeLessThan(120);
    expect(overlap()).toBeLessThan(0.01);
  });
});
