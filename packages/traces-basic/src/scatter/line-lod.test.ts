import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildLinePath, type LinePathOptions, type LineShape } from './line-path.ts';
import { covers, LineLod, type LodView } from './line-lod.ts';

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

/** A random walk with non-decreasing x (repeats allowed), and missing points at `gapRate`. */
function series(
  seed: number,
  n: number,
  gapRate: number,
  x0 = 0,
): { x: Float64Array; y: Float64Array } {
  const random = rng(seed);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let xv = x0;
  let yv = 0;
  for (let i = 0; i < n; i++) {
    xv += random() < 0.1 ? 0 : random() * 2;
    yv += random() - 0.5;
    x[i] = xv;
    y[i] = random() < gapRate ? NaN : yv;
  }
  return { x, y };
}

function opts(shape: LineShape = 'linear', connectgaps = false): LinePathOptions {
  return { shape, smoothing: 1, connectgaps, scaleX: 1, scaleY: 1, simplify: true };
}

/** Runs of finite points (split at gaps unless `connectgaps`), as point index lists. */
function runs(x: Float64Array, y: Float64Array, connectgaps: boolean): number[][] {
  const out: number[][] = [];
  let run: number[] = [];
  for (let i = 0; i < x.length; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) run.push(i);
    else if (!connectgaps && run.length > 0) {
      out.push(run);
      run = [];
    }
  }
  if (run.length > 0) out.push(run);
  return out;
}

/** Polylines of a path (split at NaN vertices). */
function polylines(path: { x: Float64Array; y: Float64Array }): [number, number][][] {
  const out: [number, number][][] = [];
  let line: [number, number][] = [];
  for (let i = 0; i < path.x.length; i++) {
    if (Number.isNaN(path.x[i])) {
      out.push(line);
      line = [];
    } else line.push([path.x[i]!, path.y[i]!]);
  }
  out.push(line);
  return out;
}

/**
 * The decimation contract over the covered window `[lo, hi]`: the path is made of original
 * points, in order, breaking exactly at gaps; per run and per `2^q` bucket inside the window it
 * keeps the lowest and highest y, and every run's first and last point in the window.
 */
function checkEnvelope(
  x: Float64Array,
  y: Float64Array,
  path: { x: Float64Array; y: Float64Array },
  view: LodView,
  connectgaps: boolean,
): void {
  const width = view.hi - view.lo;
  const lo = view.lo - width;
  const hi = view.hi + width;
  const inWindow = (i: number): boolean => x[i]! >= lo && x[i]! <= hi;
  const expected = runs(x, y, connectgaps).filter((run) => run.some(inWindow));
  // Each drawn polyline covers one run's window part: match them by their points.
  const drawn = polylines(path).map((line) => line.filter(([px]) => px >= lo && px <= hi));
  const lines = drawn.filter((line) => line.length > 0);
  expect(lines.length).toBe(expected.length);
  expected.forEach((run, r) => {
    const line = lines[r]!;
    for (let k = 1; k < line.length; k++)
      expect(line[k]![0]).toBeGreaterThanOrEqual(line[k - 1]![0]);
    // A run's first and last point are kept (when in the window).
    const first = run[0]!;
    const last = run[run.length - 1]!;
    if (inWindow(first)) expect(line[0]).toEqual([x[first], y[first]]);
    if (inWindow(last)) expect(line[line.length - 1]).toEqual([x[last], y[last]]);
    // Per px column (inside the window): the same vertical extent, first and last point.
    const col = (v: number): number => Math.floor(v * view.scaleX);
    const w = 1 / view.scaleX;
    const inner = (c: number): boolean => c * w >= lo && (c + 1) * w <= hi;
    const summary = (points: [number, number][]) => {
      const m = new Map<number, { min: number; max: number; first: number[]; last: number[] }>();
      for (const [px, py] of points) {
        const c = col(px);
        if (!inner(c)) continue;
        const e = m.get(c);
        if (!e) m.set(c, { min: py, max: py, first: [px, py], last: [px, py] });
        else {
          e.min = Math.min(e.min, py);
          e.max = Math.max(e.max, py);
          e.last = [px, py];
        }
      }
      return m;
    };
    const raw = summary(run.map((i) => [x[i]!, y[i]!] as [number, number]));
    expect(summary(line)).toEqual(raw);
  });
}

const originals = (x: Float64Array, y: Float64Array): Set<string> => {
  const s = new Set<string>();
  for (let i = 0; i < x.length; i++) s.add(`${x[i]},${y[i]}`);
  return s;
};

describe('LineLod', () => {
  it('keeps the per-bucket envelope, run ends and gaps of the view (property)', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: 1, max: 60_000 }),
        fc.constantFrom(0, 0, 0.0005, 0.05),
        fc.boolean(),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.001, max: 1, noNaN: true }),
        fc.double({ min: -12, max: 4, noNaN: true }),
        (seed, n, gapRate, connectgaps, start, span, logScale) => {
          const { x, y } = series(seed, n, gapRate);
          const extent = x[n - 1]! - x[0]!;
          const lo = x[0]! + start * extent;
          const width = span * extent + 1e-9;
          // At least 10 px wide.
          const view = { lo, hi: lo + width, scaleX: Math.max(2 ** logScale, 10 / width) };
          const lod = new LineLod(x, y, connectgaps);
          expect(lod.valid).toBe(true);
          const path = lod.path(view);
          const known = originals(x, y);
          for (let i = 0; i < path.x.length; i++) {
            if (!Number.isNaN(path.x[i])) expect(known.has(`${path.x[i]},${path.y[i]}`)).toBe(true);
          }
          checkEnvelope(x, y, path, view, connectgaps);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('draws the whole line exactly like buildLinePath decimates it', () => {
    for (const [seed, gapRate] of [
      [11, 0],
      [12, 0.0001],
    ] as const) {
      const { x, y } = series(seed, 300_000, gapRate);
      const extent = x[x.length - 1]! - x[0]!;
      const scaleX = 640 / extent;
      const expected = buildLinePath(x, y, { ...opts(), scaleX });
      expect(expected.decimated).toBe(true);
      const got = new LineLod(x, y, false).path({ lo: x[0]!, hi: x[x.length - 1]!, scaleX });
      expect(Array.from(got.x)).toEqual(Array.from(expected.x));
      expect(Array.from(got.y)).toEqual(Array.from(expected.y));
    }
  });

  it('decimates a dense view to a few vertices per pixel, windowed around the view', () => {
    const { x, y } = series(3, 1_000_000, 0);
    const lod = new LineLod(x, y, false);
    const extent = x[x.length - 1]! - x[0]!;
    // The whole series on 800 px.
    const full = lod.path({ lo: x[0]!, hi: x[x.length - 1]!, scaleX: 800 / extent });
    // ≤ 4 points per px column.
    expect(full.x.length).toBeLessThanOrEqual(4 * 801);
    // A 1% view: only it and one view width on each side are read.
    const lo = x[0]! + extent / 2;
    const view = { lo, hi: lo + extent / 100, scaleX: 80_000 / extent };
    const part = lod.path(view);
    expect(part.x[0]!).toBeLessThan(lo - extent / 100);
    expect(part.x[0]!).toBeGreaterThan(lo - extent / 50 - 10);
    expect(part.x.length).toBeLessThanOrEqual(3 * 4 * 801 + 8);
  });

  it('knows when a path still covers a view', () => {
    const { x, y } = series(4, 200_000, 0);
    const lod = new LineLod(x, y, false);
    const extent = x[x.length - 1]! - x[0]!;
    const lo = x[0]! + extent / 4;
    const scaleX = 8000 / extent;
    const view = { lo, hi: lo + extent / 10, scaleX };
    const { window } = lod.path(view);
    expect(covers(window, view)).toBe(true);
    // Panning within one view width keeps it.
    const shift = extent / 20;
    expect(covers(window, { ...view, lo: lo + shift, hi: view.hi + shift })).toBe(true);
    // Leaving the window, or any zoom (px columns move), does not.
    const far = extent / 5;
    expect(covers(window, { ...view, lo: lo + far, hi: view.hi + far })).toBe(false);
    expect(covers(window, { ...view, scaleX: scaleX * 1.01 })).toBe(false);
    // A path of every point covers any pan at its zoom.
    const all = { lo: x[0]!, hi: x[x.length - 1]!, scaleX: 800 / extent };
    const whole = lod.path(all).window;
    expect(covers(whole, { ...all, lo: all.lo + extent * 3, hi: all.hi + extent * 3 })).toBe(true);
  });

  it('is not valid for decreasing x', () => {
    const x = Float64Array.from({ length: 50_000 }, (_, i) => i);
    const y = Float64Array.from({ length: 50_000 }, (_, i) => Math.sin(i));
    expect(new LineLod(x, y, false).valid).toBe(true);
    x[30_000] = 5;
    expect(new LineLod(x, y, false).valid).toBe(false);
    // Across a chunk boundary too.
    x[30_000] = 30_000;
    x[16_384] = 16_000;
    expect(new LineLod(x, y, false).valid).toBe(false);
    // Missing points do not count.
    x[16_384] = NaN;
    expect(new LineLod(x, y, false).valid).toBe(true);
  });

  it('matches a fresh pyramid after streaming edits (property)', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: 1, max: 40_000 }),
        fc.array(
          fc.record({
            frontRemoved: fc.nat(20_000),
            frontAdded: fc.nat(20_000),
            endRemoved: fc.nat(20_000),
            endAdded: fc.nat(20_000),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        fc.boolean(),
        (seed, n0, edits, connectgaps) => {
          // One long monotonic stream; the window is a slice of it.
          const total = 200_000;
          const stream = series(seed, total, 0.001);
          let a = 80_000;
          let b = a + n0;
          const slice = (): { x: Float64Array; y: Float64Array } => ({
            x: stream.x.slice(a, b),
            y: stream.y.slice(a, b),
          });
          let data = slice();
          const lod = new LineLod(data.x, data.y, connectgaps, a);
          for (const e of edits) {
            const fr = Math.min(e.frontRemoved, b - a);
            const er = Math.min(e.endRemoved, b - a - fr);
            const fa = Math.min(e.frontAdded, a + fr);
            const ea = Math.min(e.endAdded, total - (b - er));
            const change = { frontRemoved: fr, frontAdded: fa, endRemoved: er, endAdded: ea };
            a = a + fr - fa;
            b = b - er + ea;
            if (b <= a) return;
            data = slice();
            expect(lod.edit(data.x, data.y, change)).toBe(true);
          }
          const fresh = new LineLod(data.x, data.y, connectgaps, lod.start);
          const extent = data.x[data.x.length - 1]! - data.x[0]!;
          for (const f of [1, 0.01]) {
            const view = {
              lo: data.x[0]!,
              hi: data.x[0]! + extent * f,
              scaleX: 700 / (extent * f),
            };
            const got = lod.path(view);
            const want = fresh.path(view);
            expect(Array.from(got.x)).toEqual(Array.from(want.x));
            expect(Array.from(got.y)).toEqual(Array.from(want.y));
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
