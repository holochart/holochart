import { describe, expect, it } from 'vitest';
import { buildLinePath, type LinePathOptions, type LineShape } from './line-path.ts';
import { LinePathStream } from './line-stream.ts';

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const same = (a: ArrayLike<number>, b: ArrayLike<number>): boolean =>
  a.length === b.length && Array.from(a).every((v, i) => Object.is(v, b[i]));

interface Scenario {
  shape: LineShape;
  smoothing?: number;
  connectgaps: boolean;
  simplify: boolean;
  /** Dense monotonic x (decimation) instead of scattered values. */
  dense: boolean;
}

const scenarios: Scenario[] = [];
for (const shape of ['linear', 'spline', 'hv', 'vh', 'hvh', 'vhv'] as const) {
  for (const connectgaps of [false, true]) {
    scenarios.push({ shape, connectgaps, simplify: false, dense: false });
  }
}
scenarios.push({
  shape: 'spline',
  smoothing: 0.5,
  connectgaps: false,
  simplify: false,
  dense: false,
});
scenarios.push({ shape: 'linear', connectgaps: false, simplify: true, dense: true });
scenarios.push({ shape: 'linear', connectgaps: true, simplify: true, dense: true });
scenarios.push({ shape: 'spline', connectgaps: false, simplify: true, dense: true });
scenarios.push({ shape: 'spline', connectgaps: false, simplify: true, dense: false });

function label(s: Scenario): string {
  return `${s.shape}${s.smoothing !== undefined ? `(${s.smoothing})` : ''}${s.connectgaps ? ' connectgaps' : ''}${s.simplify ? ' simplify' : ''}${s.dense ? ' dense' : ''}`;
}

describe('LinePathStream', () => {
  it.each(scenarios.map((s) => [label(s), s] as const))(
    'matches buildLinePath over random appends, prepends and trims: %s',
    (_, scenario) => {
      const random = rng(label(scenario).length * 7919 + 13);
      const opts: LinePathOptions = {
        shape: scenario.shape,
        smoothing: scenario.smoothing ?? 1,
        connectgaps: scenario.connectgaps,
        simplify: scenario.simplify,
        scaleX: 1,
        scaleY: 1,
      };
      let t = 0; // dense mode: next x for appends
      let t0 = 0; // dense mode: next x for prepends (going down)
      const gap = (): boolean => random() < 0.04;
      const next = (front: boolean): [number, number] => {
        if (gap()) return [NaN, 0];
        if (scenario.dense) {
          const x = front ? (t0 -= 1 / 64) : (t += 1 / 64);
          return [x, Math.round(random() * 40)];
        }
        const r = random();
        if (r < 0.08) return [3, 3]; // exact duplicates
        return [Math.round(random() * 30), Math.round(random() * 30)];
      };
      let xs: number[] = [];
      let ys: number[] = [];
      for (let i = 0; i < 300; i++) {
        const [x, y] = next(false);
        xs.push(x);
        ys.push(y);
      }
      const stream = new LinePathStream();
      stream.rebuild(xs, ys, opts);
      let edits = 0;
      let kept = 0;
      let sawDecimated = false;
      for (let step = 0; step < 120; step++) {
        const prepend = random() < 0.3;
        const count = Math.floor(random() * (random() < 0.2 ? 40 : 8));
        const window = 250 + Math.floor(random() * 100);
        const add: [number, number][] = Array.from({ length: count }, () => next(prepend));
        const oldPath = { x: Float64Array.from(stream.x), y: Float64Array.from(stream.y) };
        let change;
        if (prepend) {
          add.reverse();
          const nx = [...add.map((p) => p[0]), ...xs];
          const ny = [...add.map((p) => p[1]), ...ys];
          const trimmed = Math.max(0, nx.length - window);
          xs = nx.slice(0, nx.length - trimmed);
          ys = ny.slice(0, ny.length - trimmed);
          change = { frontAdded: count, frontRemoved: 0, endAdded: 0, endRemoved: trimmed };
        } else {
          const nx = [...xs, ...add.map((p) => p[0])];
          const ny = [...ys, ...add.map((p) => p[1])];
          const trimmed = Math.max(0, nx.length - window);
          xs = nx.slice(trimmed);
          ys = ny.slice(trimmed);
          change = { frontAdded: 0, frontRemoved: trimmed, endAdded: count, endRemoved: 0 };
        }
        const retain = stream.edit(xs, ys, change);
        const want = buildLinePath(xs, ys, opts);
        expect(same(stream.x, want.x)).toBe(true);
        expect(same(stream.y, want.y)).toBe(true);
        expect(stream.decimated).toBe(want.decimated);
        sawDecimated ||= want.decimated;
        edits++;
        if (retain) {
          kept++;
          const len = retain.to - retain.from;
          expect(
            same(
              stream.x.subarray(retain.at, retain.at + len),
              oldPath.x.subarray(retain.from, retain.to),
            ),
          ).toBe(true);
          expect(
            same(
              stream.y.subarray(retain.at, retain.at + len),
              oldPath.y.subarray(retain.from, retain.to),
            ),
          ).toBe(true);
        }
      }
      expect(sawDecimated).toBe(scenario.dense);
      // Decimated splines always rebuild; everything else mostly edits in place.
      if (!(scenario.shape === 'spline' && scenario.simplify && scenario.dense)) {
        expect(kept).toBeGreaterThan(edits * 0.6);
      }
    },
  );

  it('re-tessellates only the last spline segment on append', () => {
    const opts: LinePathOptions = {
      shape: 'spline',
      smoothing: 1,
      connectgaps: false,
      simplify: false,
      scaleX: 10,
      scaleY: 10,
    };
    const xs = Array.from({ length: 50 }, (_, i) => i);
    const ys = xs.map((v) => Math.sin(v));
    const stream = new LinePathStream();
    stream.rebuild(xs, ys, opts);
    const before = stream.x.length;
    const retain = stream.edit([...xs, 50], [...ys, Math.sin(50)], {
      frontAdded: 0,
      frontRemoved: 0,
      endAdded: 1,
      endRemoved: 0,
    })!;
    expect(retain.from).toBe(0);
    expect(retain.at).toBe(0);
    // Everything up to point 48 is kept; its last segment (48 → 49) is redrawn.
    expect(retain.to).toBeLessThan(before);
    expect(retain.to).toBeGreaterThan(before - 64);
  });
});
