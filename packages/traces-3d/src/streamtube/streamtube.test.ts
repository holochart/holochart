import { supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry, type CalcContext } from '@mk7s/holochart-runtime';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcStreamtube } from './calc.ts';
import { detectStreamGrid, distinctValues, sampleStreamGrid, type StreamGrid } from './grid.ts';
import { streamtubeHoverFlags, nearestSample } from './hover.ts';
import { streamtube } from './index.ts';
import {
  defaultStreamStarts,
  integrateStreams,
  minStartSeparation,
  streamBounds,
  streamStepSize,
  streamTubeRadii,
  streamTubeScale,
  type StreamStop,
} from './integrate.ts';
import { streamtubeStyle, tubeIntensity } from './plot.ts';
import { tubeGeometry, TUBE_FACETS } from './tube.ts';

type Field = (x: number, y: number, z: number) => [number, number, number];
type Order = readonly ['x' | 'y' | 'z', 'x' | 'y' | 'z', 'x' | 'y' | 'z'];

/** Flattened columns of a grid, `order[0]` fastest; `reverse` lists descending axes. */
function columns(
  axes: { x: number[]; y: number[]; z: number[] },
  field: Field,
  order: Order = ['x', 'y', 'z'],
  reverse: readonly string[] = [],
) {
  const out = { x: [] as number[], y: [] as number[], z: [] as number[] };
  const vec = { u: [] as number[], v: [] as number[], w: [] as number[] };
  const nodes = (a: 'x' | 'y' | 'z') => (reverse.includes(a) ? [...axes[a]].reverse() : axes[a]);
  const [a, b, c] = order;
  for (const vc of nodes(c)) {
    for (const vb of nodes(b)) {
      for (const va of nodes(a)) {
        const p = { [a]: va, [b]: vb, [c]: vc } as Record<'x' | 'y' | 'z', number>;
        out.x.push(p.x);
        out.y.push(p.y);
        out.z.push(p.z);
        const [u, v, w] = field(p.x, p.y, p.z);
        vec.u.push(u);
        vec.v.push(v);
        vec.w.push(w);
      }
    }
  }
  return { ...out, ...vec };
}

function gridOf(cols: ReturnType<typeof columns>): StreamGrid {
  const d = detectStreamGrid(cols.x, cols.y, cols.z, cols.u, cols.v, cols.w, cols.x.length);
  if (!d.grid) throw new Error(`no grid: ${d.reason}`);
  return d.grid;
}

const range = (n: number, lo: number, hi: number) =>
  Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

const affine: Field = (x, y, z) => [1 + 2 * x - y, 0.5 * y + 3 * z, -x + z - 2];

const registry = createChartRegistry().register(streamtube, sceneComponent);

function defaults(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const r = supplyDefaults(
    { data: [{ type: 'streamtube', ...trace }], layout: { template: 'none', ...layout } },
    registry.core,
  );
  return { trace: r.fullData[0]!, fullLayout: r.fullLayout };
}

function calcOf(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const d = defaults(trace, layout);
  return { ...d, calc: calcStreamtube(d.trace, { fullLayout: d.fullLayout } as CalcContext) };
}

/** A uniform field along +y on [0, 2]³ (3 nodes per axis). */
const UNIFORM = columns({ x: [0, 1, 2], y: [0, 1, 2], z: [0, 1, 2] }, () => [0, 1, 0]);

describe('streamtube defaults (plotly.js streamtube/defaults.js)', () => {
  it('needs all six arrays, non-empty', () => {
    expect(defaults(UNIFORM).trace.visible).toBe(true);
    expect(defaults({ ...UNIFORM, w: [] }).trace.visible).toBe(false);
    expect(defaults({ ...UNIFORM, x: undefined }).trace.visible).toBe(false);
  });

  it('defaults like Plotly', () => {
    const t = defaults(UNIFORM).trace;
    expect(t['maxdisplayed']).toBe(1000);
    expect(t['sizeref']).toBe(1);
    expect(t['showscale']).toBe(true);
    expect(t['autocolorscale']).toBe(true);
    expect(t['hoverinfo']).toBe('x+y+z+norm+text+name');
    expect(t['lightposition']).toEqual({ x: 1e5, y: 1e5, z: 0 });
    expect(t['lighting']).toMatchObject({ ambient: 0.8, diffuse: 0.8, specular: 0.05 });
    expect(t['showlegend']).toBe(false);
    const s = defaults({ ...UNIFORM, starts: { x: [1], y: [0], z: [1] } }).trace;
    expect(s['starts']).toEqual({ x: [1], y: [0], z: [1] });
  });
});

describe('grid detection (plotly.js processGrid)', () => {
  const axes = { x: [0, 1, 3], y: [-1, 0.5], z: [2, 4, 5, 9] };
  const orders: Order[] = [
    ['x', 'y', 'z'],
    ['x', 'z', 'y'],
    ['y', 'x', 'z'],
    ['y', 'z', 'x'],
    ['z', 'x', 'y'],
    ['z', 'y', 'x'],
  ];

  it('reads all six fill orders and both directions into one x-fastest grid', () => {
    const reference = gridOf(columns(axes, affine));
    for (const order of orders) {
      for (const reverse of [[], ['x'], ['y', 'z'], ['x', 'y', 'z']]) {
        const cols = columns(axes, affine, order, reverse);
        const d = detectStreamGrid(cols.x, cols.y, cols.z, cols.u, cols.v, cols.w, cols.x.length);
        const fill = order.map((a) => (reverse.includes(a) ? '-' : '+') + a).join('');
        expect(d.fill).toBe(fill);
        expect(d.grid).not.toBeNull();
        expect([...d.grid!.xs]).toEqual(axes.x);
        expect([...d.grid!.ys]).toEqual(axes.y);
        expect([...d.grid!.zs]).toEqual(axes.z);
        expect([...d.grid!.u]).toEqual([...reference.u]);
        expect([...d.grid!.w]).toEqual([...reference.w]);
      }
    }
  });

  it('handles single-node axes (a flat slab)', () => {
    const cols = columns({ x: [0, 1], y: [5], z: [0, 1, 2] }, affine, ['y', 'x', 'z']);
    const d = detectStreamGrid(cols.x, cols.y, cols.z, cols.u, cols.v, cols.w, cols.x.length);
    expect(d.fill).toBe('+x+z+y');
    expect(d.grid!.ys.length).toBe(1);
  });

  it('rejects over-specified meshes, arbitrary points and non-finite coordinates', () => {
    const cols = columns(axes, affine);
    const n = cols.x.length;
    const cut = detectStreamGrid(cols.x, cols.y, cols.z, cols.u, cols.v, cols.w, n - 1);
    expect(cut.grid).toBeNull();
    expect(cut.reason).toBe('over-specified');
    const x = [...cols.x];
    [x[1], x[2]] = [x[2]!, x[1]!];
    expect(detectStreamGrid(x, cols.y, cols.z, cols.u, cols.v, cols.w, n).reason).toBe('arbitrary');
    const y = [...cols.y];
    y[4] = NaN;
    expect(detectStreamGrid(cols.x, y, cols.z, cols.u, cols.v, cols.w, n).grid).toBeNull();
    expect(detectStreamGrid([], [], [], [], [], [], 0).reason).toBe('empty');
  });

  it('merges near-duplicate node values (plotly.js distinctVals)', () => {
    expect([...distinctValues([1, 0, 1 + 1e-9, 2, 0])]).toEqual([0, 1, 2]);
  });
});

describe('trilinear sampling', () => {
  const grid = gridOf(columns({ x: [0, 1, 3], y: [-1, 0.5, 2], z: [2, 4, 9] }, affine));
  const out = new Float64Array(3);
  const jac = new Float64Array(9);

  it('reproduces affine fields and their Jacobian exactly inside the grid', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 3, noNaN: true }),
        fc.double({ min: -1, max: 2, noNaN: true }),
        fc.double({ min: 2, max: 9, noNaN: true }),
        (x, y, z) => {
          sampleStreamGrid(grid, x, y, z, out, jac);
          const want = affine(x, y, z);
          for (let c = 0; c < 3; c++) expect(out[c]).toBeCloseTo(want[c]!, 10);
          // The Jacobian inside cells (at the top faces the forward derivative is 0).
          if (x < 3 && y < 2 && z < 9) {
            expect([...jac].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([
              2, -1, 0, 0, 0.5, 3, -1, 0, 1,
            ]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('clamps outside the grid (the nearest node values; no derivative across)', () => {
    sampleStreamGrid(grid, -5, 0.5, 4, out, jac);
    expect([...out]).toEqual(affine(0, 0.5, 4));
    expect(jac[0]).toBe(0);
    sampleStreamGrid(grid, 10, 10, 10, out);
    expect([...out]).toEqual(affine(3, 2, 9));
  });
});

describe('starts, bounds and step (plotly.js convert.js, gl-streamtube3d)', () => {
  const grid = gridOf(columns({ x: [0, 1, 2, 3], y: [5, 6], z: [0, 2] }, affine));

  it('starts on the x–z plane at the lowest y, inner nodes (midpoint of two)', () => {
    expect([...defaultStreamStarts(grid)]).toEqual([1, 5, 1, 2, 5, 1]);
    const single = gridOf(columns({ x: [4], y: [0, 1], z: [0, 1, 2] }, affine));
    expect([...defaultStreamStarts(single)]).toEqual([4, 0, 1]);
  });

  it('pads the box by the first and last cell, and steps 10 diagonals per maxLength', () => {
    const b = streamBounds(grid, Float64Array.of(10, 5, 1));
    expect(b).toEqual([
      [-1, 4, -2],
      [11, 7, 4],
    ]);
    expect(streamStepSize(b, 1000)).toBeCloseTo((10 * Math.hypot(12, 3, 6)) / 1000, 12);
  });

  it('minDistance: the smallest separation of distinct start coordinates', () => {
    expect(minStartSeparation(Float64Array.of(0, 0, 0, 0.5, 0, 3, 2, 0, 0.2))).toBe(0.2);
    expect(minStartSeparation(Float64Array.of(1, 2, 3))).toBe(1);
    expect(minStartSeparation(Float64Array.of(1, 2, 3, 1, 2, 3))).toBe(1);
    // Rounding noise is not a separation.
    expect(minStartSeparation(Float64Array.of(0, 0, 0, 0, 1e-17, 0, 0, 0.3, 0.5))).toBe(0.3);
  });
});

describe('RK4 integration and stopping rules', () => {
  it('draws straight lines, one sample per step, in a uniform field', () => {
    const grid = gridOf(UNIFORM);
    const stops: StreamStop[] = [];
    const s = integrateStreams(grid, Float64Array.of(1, 0, 1, 0.5, 0, 2), {
      maxLength: 1000,
      onStop: (_t, r) => stops.push(r),
    });
    const h = streamStepSize(streamBounds(grid, Float64Array.of(1, 0, 1, 0.5, 0, 2)), 1000);
    expect(stops).toEqual(['bounds', 'bounds']);
    for (let t = 0; t < 2; t++) {
      const first = s.offsets[t]!;
      const last = s.offsets[t + 1]!;
      for (let i = first; i < last; i++) {
        expect(s.position[i * 3]).toBe(t === 0 ? 1 : 0.5);
        expect(s.position[i * 3 + 2]).toBe(t === 0 ? 1 : 2);
        if (i > first) {
          expect(s.position[i * 3 + 1]! - s.position[(i - 1) * 3 + 1]!).toBeCloseTo(h, 12);
        }
      }
      // Up to one step past the box (y ≤ 2 + 1 cell pad), as in Plotly.
      expect(s.position[(last - 1) * 3 + 1]).toBeGreaterThan(3);
      expect(s.position[(last - 1) * 3 + 1]).toBeLessThanOrEqual(3 + h + 1e-9);
    }
    // No divergence anywhere.
    expect(s.maxDivergence).toBe(0);
  });

  it('follows circles in a rotation field', () => {
    const axes = { x: range(21, -1, 1), y: range(21, -1, 1), z: [-1, 1] };
    const grid = gridOf(columns(axes, (x, y) => [-y, x, 0]));
    for (const r of [0.3, 0.6, 0.9]) {
      const s = integrateStreams(grid, Float64Array.of(r, 0, 0), { maxLength: 300 });
      const n = s.offsets[1]!;
      expect(n).toBe(300);
      let turned = 0;
      for (let i = 0; i < n; i++) {
        const [x, y, z] = [s.position[i * 3]!, s.position[i * 3 + 1]!, s.position[i * 3 + 2]!];
        expect(Math.hypot(x, y)).toBeCloseTo(r, 4);
        expect(z).toBe(0);
        if (i > 0) {
          const [px, py] = [s.position[i * 3 - 3]!, s.position[i * 3 - 2]!];
          turned += Math.atan2(px * y - py * x, px * x + py * y);
        }
      }
      // Counter-clockwise, (n − 1) steps of h along the circle.
      const h = streamStepSize(streamBounds(grid, Float64Array.of(r, 0, 0)), 300);
      expect(Math.abs(turned / (((n - 1) * h) / r) - 1)).toBeLessThan(1e-3);
      // The rotation's |Σ ∂V/∂Xⱼ| is |(−1, 1, 0)| = √2 everywhere.
      expect(s.divergence[0]).toBeCloseTo(Math.SQRT2, 12);
    }
  });

  it('stops at zero vectors, stalls, the length cap and the step budget', () => {
    const axes = { x: [0, 1], y: [0, 1], z: [0, 1] };
    const stop = (field: Field, start: number[], maxLength = 50): StreamStop => {
      let reason: StreamStop | undefined;
      integrateStreams(gridOf(columns(axes, field)), Float64Array.from(start), {
        maxLength,
        onStop: (_t, r) => (reason = r),
      });
      return reason!;
    };
    expect(stop(() => [0, 0, 0], [0.5, 0.5, 0.5])).toBe('zero');
    // A sink at the center: the flow converges and stalls.
    expect(stop((x, y, z) => [0.5 - x, 0.5 - y, 0.5 - z], [0.1, 0.2, 0.3])).toBe('stall');
    // Rotation around the z axis never leaves: the length cap.
    expect(stop((x, y) => [0.5 - y, x - 0.5, 0], [0.9, 0.5, 0.5], 200)).toBe('length');
    // Plotly's semantics: with a coarse step (few samples) a small circle never gets `h` away
    // from its start, so it only runs out of steps.
    expect(stop((x, y) => [0.5 - y, x - 0.5, 0], [0.9, 0.5, 0.5], 20)).toBe('budget');
    // Slow but steady: records rarely and runs out of steps (100 · maxLength).
    expect(stop(() => [1e-5, 0, 0], [0.5, 0.5, 0.5], 1000)).toBe('budget');
    // A start outside the box draws a single sample.
    const s = integrateStreams(gridOf(columns(axes, () => [1, 0, 0])), Float64Array.of(9, 9, 9), {
      maxLength: 10,
    });
    expect(s.offsets[1]).toBe(1);
  });

  it('never exceeds maxLength samples, and starts each tube at its start', () => {
    const grid = gridOf(
      columns({ x: range(5, 0, 1), y: range(5, 0, 1), z: range(5, 0, 1) }, affine),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 60 }),
        fc.array(
          fc.tuple(
            fc.double({ min: 0, max: 1, noNaN: true }),
            fc.double({ min: 0, max: 1, noNaN: true }),
            fc.double({ min: 0, max: 1, noNaN: true }),
          ),
          { minLength: 1, maxLength: 5 },
        ),
        (maxLength, starts) => {
          const s = integrateStreams(grid, Float64Array.from(starts.flat()), { maxLength });
          for (let t = 0; t < starts.length; t++) {
            const n = s.offsets[t + 1]! - s.offsets[t]!;
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(maxLength);
            expect(s.position[s.offsets[t]! * 3]).toBe(starts[t]![0]);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('tube radius (gl-streamtube3d divergence sizing)', () => {
  it('tubeScale = sizeref · 0.5 · minDistance / maxDivergence', () => {
    expect(streamTubeScale(1, 0.2, 4)).toBeCloseTo(0.025, 15);
    expect(streamTubeScale(2, 0.2, 0)).toBeCloseTo(0.2, 15);
  });

  it('radius ∝ divergence; the thickest tube gets sizeref · minDistance / 2', () => {
    const radii = streamTubeRadii(
      {
        offsets: Uint32Array.of(0, 3),
        position: new Float64Array(9),
        velocity: new Float64Array(9),
        divergence: Float64Array.of(1, 2, 4),
        maxDivergence: 4,
        steps: 0,
      },
      1.5,
      0.4,
    );
    expect([...radii.radius].map((r) => +r.toFixed(12))).toEqual([0.075, 0.15, 0.3]);
  });

  it('without divergence: 0.05 · minDistance · tubeScale everywhere', () => {
    const radii = streamTubeRadii(
      {
        offsets: Uint32Array.of(0, 2),
        position: new Float64Array(6),
        velocity: new Float64Array(6),
        divergence: Float64Array.of(0, 0),
        maxDivergence: 0,
        steps: 0,
      },
      1,
      0.5,
    );
    expect([...radii.radius]).toEqual([0.00625, 0.00625]);
  });

  it('a source field grows thicker tubes where the divergence is larger', () => {
    // v = (x², y, z)·: |Σ ∂V/∂Xⱼ| = |(2x, 1, 1)| grows with x.
    const axes = { x: range(9, 0, 2), y: range(3, 0, 1), z: range(3, 0, 1) };
    const { calc } = calcOf({
      ...columns(axes, (x) => [x * x + 0.1, 0, 0]),
      starts: { x: [0.1], y: [0.5], z: [0.5] },
    });
    const r = calc.radius;
    expect(calc.count).toBeGreaterThan(5);
    // Inside the grid (beyond it the field is extended flat: no divergence, as in Plotly).
    for (let i = 1; i < calc.count && calc.x[i]! < 2; i++) {
      expect(r[i]!).toBeGreaterThanOrEqual(r[i - 1]!);
    }
    expect(r[calc.count - 1]).toBe(0);
  });
});

describe('streamtube calc', () => {
  it('integrates from the default starts with Plotly’s scaled step', () => {
    const { calc } = calcOf(UNIFORM);
    // Starts: x = 1, z = 1 (inner nodes) at y = 0.
    expect(calc.streams.offsets.length).toBe(2);
    expect([calc.x[0], calc.y[0], calc.z[0]]).toEqual([1, 0, 1]);
    expect(calc.fill).toBe('+x+y+z');
    expect(calc.dataScale).toEqual([0.5, 0.5, 0.5]);
    expect([calc.normMin, calc.normMax]).toEqual([1, 1]);
    for (let i = 0; i < calc.count; i++) {
      expect(calc.norm[i]).toBe(1);
      expect([calc.u[i], calc.v[i], calc.w[i]]).toEqual([0, 1, 0]);
    }
    // One start: minDistance 1; no divergence → radius 0.025 (scaled) → 0.05 in data units.
    expect(calc.radius[0]).toBeCloseTo(0.025, 15);
    expect(calc.sceneExtremes.x).toEqual([0.95, 1.05]);
    expect(calc.sceneExtremes.y![0]).toBeCloseTo(-0.05, 12);
  });

  it('takes explicit starts (the shortest of starts.x / y / z), in data coordinates', () => {
    const { calc } = calcOf({ ...UNIFORM, starts: { x: [0.5, 1.5, 9], y: [0, 1], z: [1, 1] } });
    expect(calc.streams.offsets.length).toBe(3);
    expect([calc.x[0], calc.z[0]]).toEqual([0.5, 1]);
    const t1 = calc.streams.offsets[1]!;
    expect([calc.x[t1], calc.y[t1]]).toEqual([1.5, 1]);
  });

  it('draws nothing without a grid', () => {
    const { calc } = calcOf({
      x: [0, 1, 0],
      y: [0, 0, 1],
      z: [0, 0, 0],
      u: [1, 1, 1],
      v: [0, 0, 0],
      w: [0, 0, 0],
    });
    expect(calc.grid).toBeNull();
    expect(calc.count).toBe(0);
    expect(calc.sceneExtremes.x).toEqual([0, 1]);
  });

  it('maxdisplayed caps the samples and coarsens the step', () => {
    // h = 10 · |box| / 50 = 0.69 (scaled; the box is [−0.5, 1.5]³), |v| = 0.5 scaled: every
    // second unit time step is recorded (scaled 1, 2 in data units), until the box is left.
    const a = calcOf({ ...UNIFORM, maxdisplayed: 50 }).calc;
    expect([...a.y]).toEqual([0, 2, 4]);
    // Coarser than the flow can cover: a single sample, nothing drawn (Plotly).
    expect(calcOf({ ...UNIFORM, maxdisplayed: 5 }).calc.count).toBe(1);
    // Fine: steps of h = 10 · √12 / 2000 until y leaves the box at 1.5 (scaled).
    const h = (10 * Math.sqrt(12)) / 2000;
    expect(calcOf({ ...UNIFORM, maxdisplayed: 2000 }).calc.count).toBe(Math.floor(1.5 / h) + 2);
  });

  it('maps norms through the colorscale over the grid’s norm range (or cmin / cmax)', () => {
    const cols = columns({ x: [0, 1, 2], y: [0, 1, 2], z: [0, 1] }, (x) => [0, 1 + x, 0]);
    const d = calcOf(cols);
    const style = streamtubeStyle(d, d.calc);
    expect([style.cmin, style.cmax]).toEqual([1, 3]);
    const e = calcOf({ ...cols, cmin: 0, cmax: 10, colorscale: 'Viridis' });
    const s2 = streamtubeStyle(e, e.calc);
    expect([s2.cmin, s2.cmax]).toEqual([0, 10]);
    expect(tubeIntensity(d.calc).length).toBe(d.calc.count * TUBE_FACETS);
    expect(tubeIntensity(d.calc)[TUBE_FACETS]).toBeCloseTo(d.calc.norm[1]!, 6);
    // The colorbar spans the grid's norms.
    const bar = streamtube.colorbar!(d.trace, { fullLayout: d.fullLayout } as never);
    expect([bar?.cmin, bar?.cmax]).toEqual([1, 3]);
  });

  it('computes a 32³ field with 100 starts quickly (ABC flow)', () => {
    const [A, B, C] = [1, Math.sqrt(2 / 3), Math.sqrt(1 / 3)];
    const n = 32;
    const ax = range(n, 0, 2 * Math.PI);
    const cols = columns({ x: ax, y: ax, z: ax }, (x, y, z) => [
      A * Math.sin(z) + C * Math.cos(y),
      B * Math.sin(x) + A * Math.cos(z),
      C * Math.sin(y) + B * Math.cos(x),
    ]);
    const starts = { x: [] as number[], y: [] as number[], z: [] as number[] };
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        starts.x.push(0.3 + (i * 5.6) / 9);
        starts.y.push(Math.PI);
        starts.z.push(0.3 + (j * 5.6) / 9);
      }
    }
    const d = defaults({ ...cols, starts });
    const t0 = performance.now();
    const calc = calcStreamtube(d.trace, { fullLayout: d.fullLayout } as CalcContext);
    const t1 = performance.now();
    const g = tubeGeometry(calc.streams, calc.radius, calc.dataScale, [0.16, 0.16, 0.16]);
    const t2 = performance.now();
    console.info(
      `streamtube 32³, 100 starts: calc ${(t1 - t0).toFixed(1)} ms (${calc.count} samples, ${calc.streams.steps} steps), geometry ${(t2 - t1).toFixed(1)} ms (${g.indices.length / 3} triangles)`,
    );
    expect(calc.streams.offsets.length).toBe(101);
    expect(t1 - t0).toBeLessThan(2000);
  });
});

describe('tube geometry', () => {
  it('builds round rings in scene units, across the flow, with outward normals', () => {
    const streams = {
      offsets: Uint32Array.of(0, 3),
      // Scaled units (s = 0.5 on x, 1 on y and z): along x.
      position: Float64Array.of(0, 0, 0, 0.5, 0, 0, 1, 0, 0),
      velocity: Float64Array.of(0.5, 0, 0, 0.5, 0, 0, 0.5, 0, 0),
    };
    const scale = [0.5, 1, 1] as [number, number, number];
    const world = [1, 2, 4] as [number, number, number];
    const g = tubeGeometry(streams, [0.1, 0.1, 0.2], scale, world);
    expect(g.origin).toEqual([1, 0, 0]);
    expect(g.positions.length).toBe(3 * TUBE_FACETS * 3);
    expect(g.indices.length).toBe(2 * TUBE_FACETS * 2 * 3);
    // Radius ρ · |W ⊙ u| / |s ⊙ u| = ρ · (1 · 1) / (0.5 · 1) = 2ρ in scene units.
    for (let i = 0; i < 3; i++) {
      const cx = i; // linear x: 0, 1, 2
      for (let a = 0; a < TUBE_FACETS; a++) {
        const o = (i * TUBE_FACETS + a) * 3;
        const p = [g.positions[o]! + 1, g.positions[o + 1]!, g.positions[o + 2]!];
        const w = [(p[0]! - cx) * world[0], p[1]! * world[1], p[2]! * world[2]];
        expect(w[0]).toBeCloseTo(0, 6);
        expect(Math.hypot(w[1]!, w[2]!)).toBeCloseTo(2 * [0.1, 0.1, 0.2][i]!, 6);
        // Normal (data space W ⊙ n) → scene units n: along the ring offset.
        const n = [
          g.normals[o]! / world[0],
          g.normals[o + 1]! / world[1],
          g.normals[o + 2]! / world[2],
        ];
        const r = Math.hypot(w[1]!, w[2]!);
        expect(n[1]).toBeCloseTo(w[1]! / r, 5);
        expect(n[2]).toBeCloseTo(w[2]! / r, 5);
      }
    }
    // Rings don't twist along a straight tube.
    expect(g.positions[1]).toBeCloseTo(g.positions[TUBE_FACETS * 3 + 1]!, 6);
  });

  it('skips single-sample tubes', () => {
    const g = tubeGeometry(
      {
        offsets: Uint32Array.of(0, 1),
        position: new Float64Array(3),
        velocity: Float64Array.of(1, 0, 0),
      },
      [0.1],
      [1, 1, 1],
      [1, 1, 1],
    );
    expect(g.indices.length).toBe(0);
  });
});

describe('streamtube hover', () => {
  it('flags: all, or the listed ones', () => {
    expect([...streamtubeHoverFlags('all')]).toContain('divergence');
    expect([...streamtubeHoverFlags('x+divergence')]).toEqual(['x', 'divergence']);
  });

  it('picks the vertex’s sample or a neighbour on the same tube nearest to the pointer', () => {
    const { calc } = calcOf({ ...UNIFORM, starts: { x: [0.5, 1.5], y: [0, 0], z: [1, 1] } });
    const project = (i: number) => ({ x: calc.x[i]! * 100, y: calc.y[i]! * 100 });
    const first = calc.streams.offsets[1]! - 1; // the last sample of tube 0
    // Pointer at tube 0's last sample: the next sample (tube 1's first) is never chosen.
    const at = project(first);
    expect(nearestSample(calc, (first + 1) * TUBE_FACETS - 1, project, at.x, at.y)).toBe(first);
    const mid = project(3);
    expect(nearestSample(calc, 2 * TUBE_FACETS, project, mid.x, mid.y + 1)).toBe(3);
    expect(nearestSample(calc, -1, project, 0, 0)).toBe(-1);
  });
});
