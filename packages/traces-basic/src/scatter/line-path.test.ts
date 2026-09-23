import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  buildLinePath,
  needsRebuild,
  pathDependsOnScale,
  type LinePath,
  type LinePathOptions,
  type LineShape,
} from './line-path.ts';

function opts(partial: Partial<LinePathOptions> = {}): LinePathOptions {
  return {
    shape: 'linear',
    smoothing: 1,
    connectgaps: false,
    scaleX: 1,
    scaleY: 1,
    simplify: false,
    ...partial,
  };
}

/** Output as `[x, y]` pairs (NaN kept) for readable assertions. */
function pairs(p: LinePath): [number, number][] {
  return Array.from(p.x, (x, i) => [x, p.y[i] as number]);
}

/** Split the output into runs of finite vertices. */
function runsOf(p: LinePath): { x: number[]; y: number[] }[] {
  const runs: { x: number[]; y: number[] }[] = [];
  let cur = { x: [] as number[], y: [] as number[] };
  for (let i = 0; i < p.x.length; i++) {
    const x = p.x[i] as number;
    const y = p.y[i] as number;
    if (Number.isNaN(x)) {
      runs.push(cur);
      cur = { x: [], y: [] };
    } else {
      cur.x.push(x);
      cur.y.push(y);
    }
  }
  runs.push(cur);
  return runs;
}

/** Linear interpolation of y at `x` along a polyline with increasing x. */
function yAt(p: LinePath, x: number): number {
  for (let i = 1; i < p.x.length; i++) {
    const x0 = p.x[i - 1] as number;
    const x1 = p.x[i] as number;
    if (x >= x0 && x <= x1) {
      const y0 = p.y[i - 1] as number;
      const y1 = p.y[i] as number;
      return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  throw new Error(`x=${x} outside path`);
}

describe('gaps', () => {
  it('passes a gap-free linear trace through unchanged', () => {
    const p = buildLinePath([0, 1, 2], [3, 4, 5], opts());
    expect(pairs(p)).toEqual([
      [0, 3],
      [1, 4],
      [2, 5],
    ]);
    expect(p.decimated).toBe(false);
  });

  it('splits runs with a single NaN separator, collapsing leading/trailing/multiple gaps', () => {
    const x = [NaN, 0, 1, NaN, NaN, 2, 3, NaN, 4, NaN];
    const y = [0, 0, 1, 0, 0, 2, 3, 0, 4, 0];
    const p = buildLinePath(x, y, opts());
    expect(pairs(p)).toEqual([
      [0, 0],
      [1, 1],
      [NaN, NaN],
      [2, 2],
      [3, 3],
      [NaN, NaN],
      [4, 4],
    ]);
  });

  it('treats a non-finite y (or Infinity) as a gap too', () => {
    const p = buildLinePath([0, 1, 2, 3], [0, NaN, Infinity, 3], opts());
    expect(pairs(p)).toEqual([
      [0, 0],
      [NaN, NaN],
      [3, 3],
    ]);
  });

  it('with connectgaps drops non-finite points into one run', () => {
    const x = [NaN, 0, 1, NaN, NaN, 2, NaN];
    const y = [0, 0, 1, 0, 0, 2, 0];
    const p = buildLinePath(x, y, opts({ connectgaps: true }));
    expect(pairs(p)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });

  it('handles empty and all-missing input', () => {
    expect(buildLinePath([], [], opts()).x.length).toBe(0);
    expect(buildLinePath([NaN, NaN], [1, 2], opts()).x.length).toBe(0);
    expect(buildLinePath([NaN, NaN], [1, 2], opts({ connectgaps: true })).x.length).toBe(0);
  });

  it('uses the shorter of x and y', () => {
    expect(buildLinePath([0, 1, 2], [5, 6], opts()).x.length).toBe(2);
  });

  it('shapes each run independently (steps do not bridge a gap)', () => {
    const p = buildLinePath([0, 1, NaN, 2, 3], [0, 1, 0, 2, 3], opts({ shape: 'hv' }));
    expect(pairs(p)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [NaN, NaN],
      [2, 2],
      [3, 2],
      [3, 3],
    ]);
  });

  it('emits a single-point run alone', () => {
    const p = buildLinePath([0, NaN, 5], [0, 0, 5], opts({ shape: 'spline' }));
    expect(pairs(p)).toEqual([
      [0, 0],
      [NaN, NaN],
      [5, 5],
    ]);
  });
});

describe('step shapes', () => {
  const x = [0, 2, 4];
  const y = [1, 3, 0];

  it('hv', () => {
    expect(pairs(buildLinePath(x, y, opts({ shape: 'hv' })))).toEqual([
      [0, 1],
      [2, 1],
      [2, 3],
      [4, 3],
      [4, 0],
    ]);
  });

  it('vh', () => {
    expect(pairs(buildLinePath(x, y, opts({ shape: 'vh' })))).toEqual([
      [0, 1],
      [0, 3],
      [2, 3],
      [2, 0],
      [4, 0],
    ]);
  });

  it('hvh', () => {
    expect(pairs(buildLinePath(x, y, opts({ shape: 'hvh' })))).toEqual([
      [0, 1],
      [1, 1],
      [1, 3],
      [2, 3],
      [3, 3],
      [3, 0],
      [4, 0],
    ]);
  });

  it('vhv', () => {
    expect(pairs(buildLinePath(x, y, opts({ shape: 'vhv' })))).toEqual([
      [0, 1],
      [0, 2],
      [2, 2],
      [2, 3],
      [2, 1.5],
      [4, 1.5],
      [4, 0],
    ]);
  });

  it('do not depend on scale', () => {
    for (const shape of ['hv', 'vh', 'hvh', 'vhv'] as const) {
      const a = buildLinePath(x, y, opts({ shape, scaleX: 1, scaleY: 1 }));
      const b = buildLinePath(x, y, opts({ shape, scaleX: 37, scaleY: -0.01 }));
      expect(pairs(b)).toEqual(pairs(a));
    }
  });

  it('keep every vertex within its run x-range (property)', () => {
    const shapes: LineShape[] = ['hv', 'vh', 'hvh', 'vhv'];
    const value = fc.oneof(fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.constant(NaN));
    fc.assert(
      fc.property(
        fc.array(fc.tuple(value, value), { maxLength: 40 }),
        fc.constantFrom(...shapes),
        fc.boolean(),
        (pts, shape, connectgaps) => {
          const x = pts.map((p) => p[0]);
          const y = pts.map((p) => p[1]);
          const p = buildLinePath(x, y, opts({ shape, connectgaps }));
          // Input runs, split the same way the module does.
          const inputRuns: number[][] = [];
          let cur: number[] = [];
          for (let i = 0; i < x.length; i++) {
            if (Number.isFinite(x[i]) && Number.isFinite(y[i])) cur.push(x[i] as number);
            else if (!connectgaps && cur.length) {
              inputRuns.push(cur);
              cur = [];
            }
          }
          if (cur.length) inputRuns.push(cur);
          const outRuns = p.x.length ? runsOf(p) : [];
          expect(outRuns.length).toBe(inputRuns.length);
          outRuns.forEach((run, r) => {
            const src = inputRuns[r] as number[];
            const lo = Math.min(...src);
            const hi = Math.max(...src);
            for (const v of run.x) {
              expect(v).toBeGreaterThanOrEqual(lo);
              expect(v).toBeLessThanOrEqual(hi);
            }
          });
        },
      ),
    );
  });
});

describe('spline', () => {
  const x = [0, 1, 2, 3, 4, 5];
  const y = [0, 2, -1, 3, 0, 1];

  it('passes exactly through every data point, in order', () => {
    const p = buildLinePath(x, y, opts({ shape: 'spline', scaleX: 50, scaleY: 30 }));
    expect(p.x.length).toBeGreaterThan(x.length);
    let j = 0;
    for (let i = 0; i < p.x.length && j < x.length; i++) {
      if (p.x[i] === x[j] && p.y[i] === y[j]) j++;
    }
    expect(j).toBe(x.length);
    expect(p.x[0]).toBe(0);
    expect(p.x[p.x.length - 1]).toBe(5);
  });

  it('is straight with smoothing 0 or fewer than 3 points', () => {
    expect(pairs(buildLinePath(x, y, opts({ shape: 'spline', smoothing: 0, scaleX: 50 })))).toEqual(
      pairs(buildLinePath(x, y, opts())),
    );
    expect(pairs(buildLinePath([0, 10], [0, 10], opts({ shape: 'spline', scaleX: 50 })))).toEqual([
      [0, 0],
      [10, 10],
    ]);
  });

  it('matches a hand-computed makeTangent example', () => {
    // p0=(0,0), p1=(4,0), p2=(4,1) at scale 1: d1=(-4,0), d2=(0,1), d1a=2, d2a=1,
    // num=(1·d1 − 4·d2)=(-4,-4), denom1=9, denom2=18 → c_in=(4−4/9, −4/9), c_out=(4+2/9, 2/9).
    // First quad: control polygon ≈ 3.58 + 0.63 px → k=2 (one interior sample at t=½).
    // Second quad: ≈ 0.31 + 0.81 px → k=1 (no interior samples).
    const p = buildLinePath([0, 4, 4], [0, 0, 1], opts({ shape: 'spline', smoothing: 1 }));
    const cIn = [4 - 4 / 9, -4 / 9] as const;
    expect(p.x.length).toBe(4);
    expect(p.x[1]).toBeCloseTo(0.25 * 0 + 0.5 * cIn[0] + 0.25 * 4, 12);
    expect(p.y[1]).toBeCloseTo(0.5 * cIn[1], 12);
    expect(pairs(p)[2]).toEqual([4, 0]);
    expect(pairs(p)[3]).toEqual([4, 1]);
  });

  it('scales the tangent offset linearly with smoothing', () => {
    const base = buildLinePath([0, 4, 4], [0, 0, 1], opts({ shape: 'spline', smoothing: 1 }));
    const half = buildLinePath([0, 4, 4], [0, 0, 1], opts({ shape: 'spline', smoothing: 0.5 }));
    // Sample at t=½ is ¼p0 + ½c + ¼p1 and c − p1 ∝ smoothing.
    const mid = 0.25 * 0 + 0.75 * 4;
    expect((half.x[1] as number) - mid).toBeCloseTo(((base.x[1] as number) - mid) / 2, 12);
    expect(half.y[1]).toBeCloseTo((base.y[1] as number) / 2, 12);
  });

  it('gives a mirror-symmetric curve for mirror-symmetric data', () => {
    const p = buildLinePath(
      [0, 1, 2, 3, 4],
      [0, 2, 3, 2, 0],
      opts({ shape: 'spline', scaleX: 40, scaleY: 25 }),
    );
    const n = p.x.length;
    for (let i = 0; i < n; i++) {
      expect((p.x[i] as number) + (p.x[n - 1 - i] as number)).toBeCloseTo(4, 9);
      expect(p.y[i]).toBeCloseTo(p.y[n - 1 - i] as number, 9);
    }
  });

  it('is invariant under uniform scaling (up to tessellation density)', () => {
    // Large spans saturate the subdivision cap at both scales → identical sampling.
    const bx = [0, 1000, 2000, 3000];
    const by = [0, 1000, 0, 1000];
    const a = buildLinePath(bx, by, opts({ shape: 'spline', scaleX: 1, scaleY: 1 }));
    const b = buildLinePath(bx, by, opts({ shape: 'spline', scaleX: 3, scaleY: 3 }));
    expect(b.x.length).toBe(a.x.length);
    for (let i = 0; i < a.x.length; i++) {
      expect(b.x[i]).toBeCloseTo(a.x[i] as number, 6);
      expect(b.y[i]).toBeCloseTo(a.y[i] as number, 6);
    }

    // Different densities: the curves agree at interpolated points within chord error.
    const sx = [0, 10, 20, 30, 40];
    const sy = [0, 10, 0, 10, 0];
    const c = buildLinePath(sx, sy, opts({ shape: 'spline', scaleX: 1, scaleY: 1 }));
    const d = buildLinePath(sx, sy, opts({ shape: 'spline', scaleX: 3, scaleY: 3 }));
    expect(d.x.length).toBeGreaterThan(c.x.length);
    for (const at of [5, 12.5, 20, 27, 35]) {
      expect(Math.abs(yAt(c, at) - yAt(d, at))).toBeLessThan(0.3);
    }
  });

  it('changes shape under anisotropic scaling', () => {
    // Uneven spacing: a symmetric zigzag has horizontal tangents whatever the aspect ratio.
    const sx = [0, 10, 15, 30, 40];
    const sy = [0, 10, 2, 7, 0];
    // Saturate tessellation (k=64) so the difference is the curve, not the sampling.
    const iso = buildLinePath(sx, sy, opts({ shape: 'spline', scaleX: 100, scaleY: 100 }));
    const aniso = buildLinePath(sx, sy, opts({ shape: 'spline', scaleX: 100, scaleY: 10 }));
    const diffs = [5, 12, 20, 35].map((at) => Math.abs(yAt(iso, at) - yAt(aniso, at)));
    expect(Math.max(...diffs)).toBeGreaterThan(0.1);
  });

  it('bounds tessellation: 1..64 subdivisions per segment, ≈3 px chords', () => {
    const n = 20;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = Array.from({ length: n }, (_, i) => (i % 2 ? 1 : 0));

    // Sub-px segments → one subdivision each → exactly the data points.
    const tiny = buildLinePath(x, y, opts({ shape: 'spline', scaleX: 0.1, scaleY: 0.1 }));
    expect(pairs(tiny)).toEqual(x.map((v, i) => [v, y[i]]));

    // Huge zoom → capped at 64 subdivisions per segment.
    const huge = buildLinePath(x, y, opts({ shape: 'spline', scaleX: 1e6, scaleY: 1e6 }));
    expect(huge.x.length).toBe(1 + 64 * (n - 1));

    // In between: chords average ≤ 3 px; any single chord is ≤ 3× that (Bézier speed is bounded
    // by 3× the control-polygon length for cubics).
    const mid = buildLinePath(x, y, opts({ shape: 'spline', scaleX: 40, scaleY: 40 }));
    expect(mid.x.length).toBeGreaterThan(n);
    expect(mid.x.length).toBeLessThan(1 + 64 * (n - 1));
    for (let i = 1; i < mid.x.length; i++) {
      const dx = ((mid.x[i] as number) - (mid.x[i - 1] as number)) * 40;
      const dy = ((mid.y[i] as number) - (mid.y[i - 1] as number)) * 40;
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(9 + 1e-9);
    }
  });

  it('ignores the sign of the scales', () => {
    const a = buildLinePath(x, y, opts({ shape: 'spline', scaleX: 20, scaleY: 30 }));
    const b = buildLinePath(x, y, opts({ shape: 'spline', scaleX: -20, scaleY: -30 }));
    expect(pairs(b)).toEqual(pairs(a));
  });

  it('survives coincident consecutive points without NaN', () => {
    const p = buildLinePath([0, 1, 1, 2], [0, 1, 1, 0], opts({ shape: 'spline', scaleX: 50 }));
    for (let i = 0; i < p.x.length; i++) {
      expect(Number.isFinite(p.x[i])).toBe(true);
      expect(Number.isFinite(p.y[i])).toBe(true);
    }
  });
});

describe('simplify (min/max decimation)', () => {
  // 12800 points over x ∈ [0, 100): 128 points per px column at scaleX = 1. Binary fractions
  // keep x exact, so bucket boundaries are unambiguous (and survive the pan test's offset).
  const N = 12800;
  const dx = Array.from({ length: N }, (_, i) => i / 128);
  const dy = Array.from({ length: N }, (_, i) => Math.sin(i * 0.37) * Math.cos(i * 0.011) * 10);

  function columns(xs: ArrayLike<number>, ys: ArrayLike<number>, sx: number) {
    const x0 = xs[0] as number;
    const cols = new Map<number, { x: number[]; y: number[]; idx: number[] }>();
    for (let i = 0; i < xs.length; i++) {
      const c = Math.floor(((xs[i] as number) - x0) * sx);
      let col = cols.get(c);
      if (!col) cols.set(c, (col = { x: [], y: [], idx: [] }));
      col.x.push(xs[i] as number);
      col.y.push(ys[i] as number);
      col.idx.push(i);
    }
    return cols;
  }

  it('keeps first/last/min/max of each px column, ≤ 4 per column, in order', () => {
    const p = buildLinePath(dx, dy, opts({ simplify: true }));
    expect(p.decimated).toBe(true);

    const inCols = columns(dx, dy, 1);
    const outCols = columns(p.x, p.y, 1);
    expect(p.x.length).toBeLessThanOrEqual(4 * inCols.size);
    expect([...outCols.keys()]).toEqual([...inCols.keys()]);
    for (const [c, col] of inCols) {
      const out = outCols.get(c)!;
      expect(out.x.length).toBeLessThanOrEqual(4);
      const has = (x: number, y: number) => out.x.some((v, k) => v === x && out.y[k] === y);
      const last = col.x.length - 1;
      expect(has(col.x[0]!, col.y[0]!)).toBe(true);
      expect(has(col.x[last]!, col.y[last]!)).toBe(true);
      expect(Math.min(...out.y)).toBe(Math.min(...col.y));
      expect(Math.max(...out.y)).toBe(Math.max(...col.y));
    }
    // Original order preserved: x non-decreasing.
    for (let i = 1; i < p.x.length; i++) {
      expect(p.x[i]).toBeGreaterThanOrEqual(p.x[i - 1] as number);
    }
  });

  it('decimates each run separately with NaN separators, bound ≤ 4 per column + gaps', () => {
    const x = [...dx, NaN, ...dx.map((v) => v + 200)];
    const y = [...dy, NaN, ...dy];
    const p = buildLinePath(x, y, opts({ simplify: true }));
    expect(p.decimated).toBe(true);
    const runs = runsOf(p);
    expect(runs.length).toBe(2);
    expect(p.x.length).toBeLessThanOrEqual(2 * 4 * 100 + 1);
    expect(runs[1]!.x[0]).toBe(200);
  });

  it('works for non-increasing x', () => {
    const rx = [...dx].reverse();
    const ry = [...dy].reverse();
    const p = buildLinePath(rx, ry, opts({ simplify: true }));
    expect(p.decimated).toBe(true);
    expect(p.x.length).toBeLessThanOrEqual(4 * 101);
    expect(p.x[0]).toBe(rx[0]);
    expect(p.x[p.x.length - 1]).toBe(rx[N - 1]);
    expect(Math.min(...p.y)).toBe(Math.min(...dy));
    expect(Math.max(...p.y)).toBe(Math.max(...dy));
  });

  it('is disabled without simplify, for step shapes, and for sparse runs', () => {
    expect(buildLinePath(dx, dy, opts()).x.length).toBe(N);
    const hv = buildLinePath(dx, dy, opts({ simplify: true, shape: 'hv' }));
    expect(hv.decimated).toBe(false);
    expect(hv.x.length).toBe(2 * N - 1);
    // Zoomed in to 50 px per unit: ~2.5 points per px column → not dense.
    const sparse = buildLinePath(dx, dy, opts({ simplify: true, scaleX: 50 }));
    expect(sparse.decimated).toBe(false);
    expect(sparse.x.length).toBe(N);
  });

  it('leaves non-monotonic runs untouched', () => {
    const x = dx.slice();
    x[5000] = -1;
    const p = buildLinePath(x, dy, opts({ simplify: true }));
    expect(p.decimated).toBe(false);
    expect(p.x.length).toBe(N);
  });

  it('decimates before spline smoothing', () => {
    const p = buildLinePath(dx, dy, opts({ simplify: true, shape: 'spline' }));
    expect(p.decimated).toBe(true);
    // The spline passes through the decimated points, which are ≤ 4 per column.
    const lin = buildLinePath(dx, dy, opts({ simplify: true }));
    let j = 0;
    for (let i = 0; i < p.x.length && j < lin.x.length; i++) {
      if (p.x[i] === lin.x[j] && p.y[i] === lin.y[j]) j++;
    }
    expect(j).toBe(lin.x.length);
    expect(p.x.length).toBeLessThan(N);
  });

  it('uses absolute px columns: whole-column shifts and trimmed ends keep the other buckets', () => {
    const a = buildLinePath(dx, dy, opts({ simplify: true }));
    // A shift by whole columns keeps every bucket's points.
    const shifted = dx.map((v) => v + 3);
    const b = buildLinePath(shifted, dy, opts({ simplify: true }));
    expect(Array.from(b.y)).toEqual(Array.from(a.y));
    // Dropping points from the front (a rolling window) only changes the first column.
    const k = 300; // mid-column
    const c = buildLinePath(dx.slice(k), dy.slice(k), opts({ simplify: true }));
    const col = Math.floor(dx[k]!);
    const tail = (p: typeof a) => Array.from(p.x).findIndex((v) => Math.floor(v) > col);
    expect(Array.from(c.y.subarray(tail(c)))).toEqual(Array.from(a.y.subarray(tail(a))));
  });
});

describe('pathDependsOnScale', () => {
  it.each([
    ['linear', 1, false, false, false],
    ['linear', 1, true, false, false],
    ['linear', 1, true, true, true],
    ['hv', 1, false, false, false],
    ['vhv', 1, true, false, false],
    ['spline', 1, false, false, true],
    ['spline', 0, false, false, false],
    ['spline', 0, true, true, true],
    ['spline', 1.3, true, false, true],
  ] as const)(
    '%s smoothing=%d simplify=%s decimated=%s → %s',
    (shape, smoothing, simplify, dec, want) => {
      expect(pathDependsOnScale({ shape, smoothing, simplify }, dec)).toBe(want);
    },
  );
});

describe('needsRebuild', () => {
  it.each([
    [1, 1, 1, 1, false],
    [1, 1, 1.9, 1.9, false], // uniform zoom < 2×
    [1, 1, 2, 2, true], // uniform zoom ≥ 2×
    [2, 2, 1, 1, true], // uniform zoom out ≥ 2×
    [1, 1, 0.6, 0.6, false],
    [1, 1, 1, 1 + 1e-9, false], // aspect change below tolerance
    [1, 1, 1, 1.0001, true], // aspect change
    [3, 5, 3.3, 5.5, false], // same aspect, 1.1×
    [1, -1, 1, 1, false], // sign is irrelevant
    [1, 1, 0, 0, true], // degenerate
  ] as const)('(%d,%d) → (%d,%d): %s', (px, py, nx, ny, want) => {
    expect(needsRebuild({ scaleX: px, scaleY: py }, { scaleX: nx, scaleY: ny })).toBe(want);
  });
});
