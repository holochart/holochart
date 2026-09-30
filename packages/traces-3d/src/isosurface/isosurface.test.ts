import { supplyDefaults } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import { calcIso, isoMeshOptions, isoRange } from './calc.ts';
import { extractIsoMesh, type IsoMesh, type IsoMeshOptions } from './extract.ts';
import {
  distinctValues,
  findNearestOnAxis,
  gridCoordinate,
  gridIndex,
  nearestGridIndex,
  processIsoGrid,
} from './grid.ts';
import { isoValueText } from './hover.ts';
import { isosurface } from './index.ts';
import { isoOpacityscaleAlpha, isoPositions } from './plot.ts';

const registry = createChartRegistry().register(isosurface, sceneComponent);

function defaults(trace: Record<string, unknown>) {
  const r = supplyDefaults(
    { data: [{ type: 'isosurface', ...trace }], layout: { template: 'none' } },
    registry.core,
  );
  return { trace: r.fullData[0]!, fullLayout: r.fullLayout };
}

type Axis = 'x' | 'y' | 'z';

/**
 * Flattened grid columns over `axes` (values per axis), nested in `order` (the first letter
 * changes fastest), with `f(x, y, z)` as the value.
 */
function columns(
  axes: Record<Axis, readonly number[]>,
  f: (x: number, y: number, z: number) => number,
  order = 'xyz',
) {
  const [a, b, c] = order.split('') as [Axis, Axis, Axis];
  const out = { x: [] as number[], y: [] as number[], z: [] as number[], value: [] as number[] };
  for (const vc of axes[c]) {
    for (const vb of axes[b]) {
      for (const va of axes[a]) {
        const p = { [a]: va, [b]: vb, [c]: vc } as Record<Axis, number>;
        out.x.push(p.x);
        out.y.push(p.y);
        out.z.push(p.z);
        out.value.push(f(p.x, p.y, p.z));
      }
    }
  }
  return out;
}

const range = (lo: number, hi: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

const NONE = { show: false, fill: 1 };
const NO_SLICE = { show: false, fill: 1, locations: [] };

function options(o: Partial<IsoMeshOptions> & Pick<IsoMeshOptions, 'isomin' | 'isomax'>) {
  return {
    surface: { show: true, count: 2, fill: 1, pattern: 'all' },
    spaceframe: { show: false, fill: 0.15 },
    caps: { x: NONE, y: NONE, z: NONE },
    slices: { x: NO_SLICE, y: NO_SLICE, z: NO_SLICE },
    ...o,
  } as IsoMeshOptions;
}

function extract(cols: ReturnType<typeof columns>, o: IsoMeshOptions): IsoMesh {
  return extractIsoMesh(processIsoGrid(cols.x, cols.y, cols.z, cols.value), o);
}

function area(mesh: IsoMesh): number {
  let sum = 0;
  const t = mesh.triangles;
  for (let k = 0; k < t.length; k += 3) {
    const [a, b, c] = [t[k]!, t[k + 1]!, t[k + 2]!];
    const u = [mesh.x[b]! - mesh.x[a]!, mesh.y[b]! - mesh.y[a]!, mesh.z[b]! - mesh.z[a]!];
    const v = [mesh.x[c]! - mesh.x[a]!, mesh.y[c]! - mesh.y[a]!, mesh.z[c]! - mesh.z[a]!];
    sum +=
      Math.hypot(
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ) / 2;
  }
  return sum;
}

/** Edges (by rounded end positions) used by exactly one triangle: none for a closed surface. */
function openEdges(mesh: IsoMesh): number {
  const key = (v: number) =>
    [mesh.x[v]!, mesh.y[v]!, mesh.z[v]!].map((c) => Math.round(c * 1e6)).join(',');
  const count = new Map<string, number>();
  const t = mesh.triangles;
  for (let k = 0; k < t.length; k += 3) {
    for (let e = 0; e < 3; e++) {
      const a = key(t[k + e]!);
      const b = key(t[k + ((e + 1) % 3)]!);
      if (a === b) continue;
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      count.set(edge, (count.get(edge) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const c of count.values()) if (c % 2 === 1) open++;
  return open;
}

describe('isosurface grid (plotly.js processGrid)', () => {
  const axes = { x: [0, 1, 2], y: [10, 20], z: [-1, 0, 1, 2] };

  it('reads any nesting order and direction', () => {
    for (const order of ['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx']) {
      const c = columns(axes, (x, y, z) => x + y * 10 + z * 100, order);
      const g = processIsoGrid(c.x, c.y, c.z, c.value);
      expect(g.len).toBe(24);
      expect([...g.xs]).toEqual(axes.x);
      expect([...g.ys]).toEqual(axes.y);
      expect([...g.zs]).toEqual(axes.z);
      expect(g.fill.replace(/[+-]/g, '')).toBe(order);
      // Grid point (i, j, k) is the column entry at its strides.
      const q = gridIndex(g, 2, 1, 3);
      expect([c.x[q], c.y[q], c.z[q]]).toEqual([2, 20, 2]);
      expect(g.value[q]).toBe(2 + 200 + 200);
    }
    const down = columns({ ...axes, x: [2, 1, 0] }, (x) => x, 'zyx');
    const g = processIsoGrid(down.x, down.y, down.z, down.value);
    expect(g.fill).toBe('+z+y-x');
    expect(g.descending).toEqual([true, false, false]);
    expect([...g.xs]).toEqual([0, 1, 2]);
    expect(gridCoordinate(g, 0, 0)).toBe(2);
  });

  it('rejects arbitrary coordinates and missing points, as Plotly (nothing drawn)', () => {
    const c = columns(axes, () => 1);
    // x not increasing along its axis in one row.
    const swapped = [...c.x];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(processIsoGrid(swapped, c.y, c.z, c.value).len).toBe(0);
    // A whole column reversed is a descending axis, which is fine.
    expect(processIsoGrid([...c.x].reverse(), c.y, c.z, c.value).len).toBe(24);
    expect(processIsoGrid(c.x.slice(0, 20), c.y, c.z, c.value).len).toBe(0);
    // A point off its axis falls back to Plotly's distinct values: more values than points.
    const jitter = [...c.x];
    jitter[4] = 1.5;
    expect(processIsoGrid(jitter, c.y, c.z, c.value).len).toBe(0);
  });

  it('merges near-equal values like Plotly’s distinctVals', () => {
    expect([...distinctValues([3, 1, 2, 1 + 1e-9, NaN, 2])]).toEqual([1, 2, 3]);
  });

  it('snaps to the nearest grid value; findNearestOnAxis takes the one at or above', () => {
    const c = columns(axes, () => 0);
    const g = processIsoGrid(c.x, c.y, c.z, c.value);
    expect(nearestGridIndex(g, 2, 0.4)).toBe(1);
    expect(nearestGridIndex(g, 2, 0.6)).toBe(2);
    expect(nearestGridIndex(g, 2, 99)).toBe(3);
    expect(findNearestOnAxis(0.4, axes.z)).toEqual({ id: 2, distRatio: 0.6 });
    expect(findNearestOnAxis(1, axes.z)).toEqual({ id: 2, distRatio: 0 });
    expect(findNearestOnAxis(-5, axes.z)).toEqual({ id: 0, distRatio: 0 });
  });

  it('round-trips random grids in any order and direction (property)', () => {
    const axis = fc
      .uniqueArray(fc.integer({ min: -50, max: 50 }), { minLength: 2, maxLength: 5 })
      .map((v) => v.sort((a, b) => a - b));
    fc.assert(
      fc.property(
        axis,
        axis,
        axis,
        fc.constantFrom('xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx'),
        fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
        (x, y, z, order, flip) => {
          const a = {
            x: flip[0] ? [...x].reverse() : x,
            y: flip[1] ? [...y].reverse() : y,
            z: flip[2] ? [...z].reverse() : z,
          };
          const c = columns(a, (px, py, pz) => px * 1e4 + py * 100 + pz, order);
          const g = processIsoGrid(c.x, c.y, c.z, c.value);
          expect(g.len).toBe(x.length * y.length * z.length);
          expect([...g.xs]).toEqual(x);
          for (let i = 0; i < a.x.length; i++) {
            for (let k = 0; k < a.z.length; k++) {
              const q = gridIndex(g, i, 0, k);
              expect(c.x[q]).toBe(a.x[i]);
              expect(c.z[q]).toBe(a.z[k]);
              expect(gridCoordinate(g, 0, i)).toBe(a.x[i]);
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('isosurface extraction (plotly.js generateIsoMeshes)', () => {
  const cube = range(-1.5, 1.5, 31);
  const sphere = columns({ x: cube, y: cube, z: cube }, (x, y, z) => Math.hypot(x, y, z));

  it('a sphere field gives a closed sphere of the right area', () => {
    const mesh = extract(
      sphere,
      options({
        isomin: 0.5,
        isomax: 1.5,
        surface: { show: true, count: 1, fill: 1, pattern: 'all' },
      }),
    );
    expect(mesh.triangles.length).toBeGreaterThan(1000);
    // Every vertex on the level (the middle of [0.5, 1.5]).
    for (let v = 0; v < mesh.count; v++) expect(mesh.value[v]).toBeCloseTo(1, 6);
    expect(area(mesh)).toBeGreaterThan(4 * Math.PI * 0.97);
    expect(area(mesh)).toBeLessThan(4 * Math.PI * 1.01);
    expect(openEdges(mesh)).toBe(0);
  });

  it('a plane field gives a flat surface over the whole grid', () => {
    const g = range(0, 1, 5);
    const plane = columns({ x: g, y: g, z: g }, (_x, _y, z) => z);
    const mesh = extract(
      plane,
      options({
        isomin: 0.3,
        isomax: 0.3,
        surface: { show: true, count: 1, fill: 1, pattern: 'all' },
      }),
    );
    for (let v = 0; v < mesh.count; v++) expect(mesh.z[v]).toBeCloseTo(0.3, 6);
    expect(area(mesh)).toBeCloseTo(1, 6);
  });

  it('spreads surface.count levels over [isomin, isomax] (one: the middle)', () => {
    const g = range(-1, 2, 7);
    const plane = columns({ x: g, y: g, z: g }, (_x, _y, z) => z);
    const levels = (count: number) => {
      const mesh = extract(
        plane,
        options({ isomin: 0, isomax: 1, surface: { show: true, count, fill: 1, pattern: 'all' } }),
      );
      return [...new Set(Array.from(mesh.z, (z) => Math.round(z * 1e6) / 1e6))].sort();
    };
    expect(levels(3)).toEqual([0, 0.5, 1]);
    expect(levels(1)).toEqual([0.5]);
  });

  it('fill draws that share of every triangle; patterns pick tetrahedra', () => {
    const o = (fill: number, pattern: string) =>
      options({ isomin: 0.5, isomax: 1.5, surface: { show: true, count: 1, fill, pattern } });
    const full = area(extract(sphere, o(1, 'all')));
    expect(area(extract(sphere, o(0.5, 'all'))) / full).toBeCloseTo(0.5, 6);
    expect(area(extract(sphere, o(0, 'all')))).toBe(0);
    const odd = area(extract(sphere, o(1, 'odd')));
    const even = area(extract(sphere, o(1, 'even')));
    expect(odd).toBeGreaterThan(0);
    expect(even).toBeGreaterThan(0);
    expect(odd + even).toBeCloseTo(full, 6);
    expect(area(extract(sphere, o(1, 'A+B+C+D+E')))).toBeCloseTo(full, 6);
    const parts = ['A', 'B', 'C', 'D', 'E'].map((p) => area(extract(sphere, o(1, p))));
    expect(parts.reduce((a, b) => a + b)).toBeCloseTo(full, 6);
    expect(parts.every((p) => p > 0)).toBe(true);
  });

  it('caps cover the grid boundary where the values are in range', () => {
    const g = range(0, 1, 5);
    const ramp = columns({ x: g, y: g, z: g }, (x) => x);
    const caps = {
      x: { show: true, fill: 1 },
      y: { show: true, fill: 1 },
      z: { show: true, fill: 1 },
    };
    const mesh = extract(
      ramp,
      options({
        isomin: 0.25,
        isomax: 0.75,
        surface: { show: false, count: 2, fill: 1, pattern: 'all' },
        caps,
      }),
    );
    // x ∈ [0.25, 0.75] on the four faces of constant y and z; the x faces (0 and 1) are out of range.
    expect(area(mesh)).toBeCloseTo(4 * 0.5, 6);
    for (let v = 0; v < mesh.count; v++) {
      expect(mesh.x[v]).toBeGreaterThanOrEqual(0.25 - 1e-6);
      expect(mesh.x[v]).toBeLessThanOrEqual(0.75 + 1e-6);
    }
    // Caps and surfaces together close the slab.
    const closed = extract(ramp, options({ isomin: 0.25, isomax: 0.75, caps }));
    expect(openEdges(closed)).toBe(0);
  });

  it('slices: at every inner plane, at grid planes, and between them', () => {
    const g = range(0, 1, 5);
    const ramp = columns({ x: g, y: g, z: g }, (x) => x);
    const off = { show: false, count: 2, fill: 1, pattern: 'all' };
    const slice = (locations: number[]) =>
      extract(
        ramp,
        options({
          isomin: 0.25,
          isomax: 0.75,
          surface: off,
          slices: { x: NO_SLICE, y: NO_SLICE, z: { show: true, fill: 1, locations } },
        }),
      );
    // Default: the three inner z planes.
    expect(area(slice([]))).toBeCloseTo(3 * 0.5, 6);
    const exact = slice([0.5]);
    expect(area(exact)).toBeCloseTo(0.5, 6);
    for (let v = 0; v < exact.count; v++) expect(exact.z[v]).toBe(0.5);
    // Between grid planes Plotly interpolates, and draws the slice once per setup range.
    const between = slice([0.4]);
    for (let v = 0; v < between.count; v++) expect(between.z[v]).toBeCloseTo(0.4, 9);
    expect(area(between)).toBeCloseTo(2 * 0.5, 6);
  });

  it('the space frame draws the central tetrahedra in range', () => {
    const g = range(0, 1, 3);
    const inside = columns({ x: g, y: g, z: g }, () => 1);
    const frame = (fill: number) =>
      extract(
        inside,
        options({
          isomin: 0,
          isomax: 2,
          surface: { show: false, count: 2, fill: 1, pattern: 'all' },
          spaceframe: { show: true, fill },
        }),
      );
    // 8 cells × 4 faces.
    expect(frame(1).triangles.length / 3).toBe(32);
    // Grid corners are shared: one vertex per distinct grid point used.
    const m = frame(1);
    const distinct = new Set(
      Array.from({ length: m.count }, (_, v) => `${m.x[v]},${m.y[v]},${m.z[v]}`),
    );
    expect(m.count).toBe(distinct.size);
    expect(m.count).toBeLessThan(32);
    // A frame of three quads per face.
    expect(frame(0.15).triangles.length / 3).toBe(32 * 6);
    expect(area(frame(0.15)) / area(frame(1))).toBeCloseTo(0.15, 6);
  });

  it('keeps vertices in the grid box and the value range (property)', () => {
    const n = 4;
    const g = range(0, 1, n);
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1, max: 1, noNaN: true }), {
          minLength: n ** 3,
          maxLength: n ** 3,
        }),
        fc.double({ min: -0.8, max: 0.8, noNaN: true }),
        fc.double({ min: 0, max: 0.8, noNaN: true }),
        fc.integer({ min: 1, max: 4 }),
        (values, lo, width, count) => {
          const c = columns({ x: g, y: g, z: g }, () => 0);
          c.value = values;
          const all = { show: true, fill: 1 };
          const mesh = extract(
            c,
            options({
              isomin: lo,
              isomax: lo + width,
              surface: { show: true, count, fill: 1, pattern: 'all' },
              caps: { x: all, y: all, z: all },
            }),
          );
          const err = 0.001 * width + 1e-6;
          for (let v = 0; v < mesh.count; v++) {
            for (const p of [mesh.x[v]!, mesh.y[v]!, mesh.z[v]!]) {
              expect(p).toBeGreaterThanOrEqual(0);
              expect(p).toBeLessThanOrEqual(1);
            }
            // Surfaces and caps are cut to the range (caps to within Plotly's 0.1 % margin).
            expect(mesh.value[v]).toBeGreaterThanOrEqual(Math.min(lo, ...values) - err);
            expect(mesh.value[v]).toBeLessThanOrEqual(Math.max(lo + width, ...values) + err);
          }
          for (let k = 0; k < mesh.triangles.length; k++) {
            expect(mesh.triangles[k]).toBeLessThan(mesh.count);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('isosurface trace', () => {
  const g = range(0, 1, 4);
  const field = columns({ x: g, y: g, z: g }, (x, y, z) => x + y + z);

  it('defaults like plotly.js supplyIsoDefaults', () => {
    const t = defaults(field).trace;
    expect(t.visible).toBe(true);
    expect(t['surface']).toEqual({ show: true, count: 2, fill: 1, pattern: 'all' });
    expect(t['caps']).toEqual({
      x: { show: true, fill: 1 },
      y: { show: true, fill: 1 },
      z: { show: true, fill: 1 },
    });
    expect(t['slices']).toMatchObject({
      x: { show: false },
      y: { show: false },
      z: { show: false },
    });
    expect(t['spaceframe']).toEqual({ show: false });
    expect(defaults({ ...field, spaceframe: { show: true } }).trace['spaceframe']).toEqual({
      show: true,
      fill: 0.15,
    });
    expect(t['flatshading']).toBe(true);
    expect(t['lighting']).toMatchObject({ facenormalsepsilon: 0, vertexnormalsepsilon: 1e-12 });
    expect(t['showlegend']).toBe(false);
    expect(t['showscale']).toBe(true);
    // isomin above isomax: both dropped.
    const swapped = defaults({ ...field, isomin: 2, isomax: 1 }).trace;
    expect(swapped['isomin']).toBeUndefined();
    expect(swapped['isomax']).toBeUndefined();
    expect(defaults({ ...field, value: [] }).trace.visible).toBe(false);
  });

  it('calc: the grid, the value range (the color domain), the mesh and the scene extent', () => {
    const d = defaults({ ...field, isomin: 1 });
    const calc = calcIso(d.trace, { fullLayout: d.fullLayout } as CalcContext);
    expect(calc.grid.len).toBe(64);
    expect([calc.isomin, calc.isomax]).toEqual([1, 3]);
    expect(isoRange(d.trace)).toEqual([1, 3]);
    expect(calc.mesh!.triangles.length).toBeGreaterThan(0);
    expect(calc.sceneExtremes).toEqual({ x: [0, 1], y: [0, 1], z: [0, 1] });
    expect(calc.dataScale).toEqual([1, 1, 1]);
    const scales = { x: {}, y: {}, z: {} } as never;
    expect(isoMeshOptions(d.trace, 1, 3, scales).caps.x).toEqual({ show: true, fill: 1 });
    // Typed arrays on linear axes are used as given.
    const typed = defaults({
      x: Float32Array.from(field.x),
      y: Float32Array.from(field.y),
      z: Float32Array.from(field.z),
      value: Float64Array.from(field.value),
    });
    const tc = calcIso(typed.trace, { fullLayout: typed.fullLayout } as CalcContext);
    expect(tc.grid.value).toBe(typed.trace['value']);
    expect(tc.grid.len).toBe(64);
    expect(calcIso(typed.trace, { fullLayout: typed.fullLayout } as CalcContext, false).mesh).toBe(
      null,
    );
  });

  it('positions relative to the box center; opacityscale alpha as gl-mesh3d draws it', () => {
    const d = defaults(field);
    const mesh = calcIso(d.trace, { fullLayout: d.fullLayout } as CalcContext).mesh!;
    const { positions, origin } = isoPositions(mesh);
    expect(positions.length).toBe(mesh.count * 3);
    expect(positions[0]! + origin[0]).toBeCloseTo(mesh.x[0]!, 5);
    const alpha = isoOpacityscaleAlpha(
      [0, 0.5, 1, NaN],
      [
        [0, 0],
        [1, 1],
      ],
      0,
      1,
    )!;
    expect(alpha[0]).toBe(0);
    expect(alpha[1]).toBeCloseTo(0.25, 2);
    expect(alpha[2]).toBe(1);
    expect(isoOpacityscaleAlpha([1], undefined, 0, 1)).toBe(null);
  });

  it('formats hover values with valuehoverformat or hover precision', () => {
    expect(isoValueText(0.123456, '.2f')).toBe('0.12');
    expect(isoValueText(2, undefined)).toBe('2');
    expect(isoValueText(NaN, undefined)).toBe('');
  });
});
