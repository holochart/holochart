/**
 * `isosurface` calc: what the grid gives the scene (its box as the autorange contribution,
 * Plotly's `dataScale` = 1 / span per axis), what happens to columns that are not a grid (Plotly
 * draws nothing), and slices at given `locations` on a date axis (plotly.js
 * `isosurface/convert.js`: slices are planes of constant x / y / z where the values are in
 * `[isomin, isomax]`; the attribute takes axis data values, here dates).
 */
import { supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { sceneScales } from '../scene/axes.ts';
import { sceneComponent } from '../scene/component.ts';
import { calcIso, isoMeshOptions } from './calc.ts';
import type { IsoMesh } from './extract.ts';
import { isosurface } from './index.ts';

const registry = createChartRegistry().register(isosurface, sceneComponent);

function calcOf(trace: Record<string, unknown>) {
  const r = supplyDefaults(
    { data: [{ type: 'isosurface', ...trace }], layout: { template: 'none' } },
    registry.core,
  );
  const d = { trace: r.fullData[0]!, fullLayout: r.fullLayout };
  return { ...d, calc: calcIso(d.trace, { fullLayout: d.fullLayout } as CalcContext) };
}

/** Flattened grid columns (x fastest) with `f(x, y, z)` as the value. */
function columns(
  xs: readonly number[],
  ys: readonly number[],
  zs: readonly number[],
  f: (x: number, y: number, z: number) => number,
) {
  const out = { x: [] as number[], y: [] as number[], z: [] as number[], value: [] as number[] };
  for (const z of zs) {
    for (const y of ys) {
      for (const x of xs) {
        out.x.push(x);
        out.y.push(y);
        out.z.push(z);
        out.value.push(f(x, y, z));
      }
    }
  }
  return out;
}

/** Summed area of the triangles of `mesh` that `keep` accepts (by their first vertex). */
function area(mesh: IsoMesh, keep: (vertex: number) => boolean): number {
  let sum = 0;
  const t = mesh.triangles;
  for (let k = 0; k < t.length; k += 3) {
    const [a, b, c] = [t[k]!, t[k + 1]!, t[k + 2]!];
    if (!keep(a)) continue;
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

describe('isosurface calc: the grid box', () => {
  it('scales each axis by 1 / its span and gives the scene the grid box', () => {
    // x spans 4 (given descending), y spans 2, z spans 0.5.
    const { calc } = calcOf(columns([4, 3, 2, 1, 0], [10, 11, 12], [7, 7.5], (x) => x));
    expect(calc.grid.len).toBe(30);
    expect(calc.dataScale).toEqual([1 / 4, 1 / 2, 2]);
    expect(calc.sceneExtremes).toEqual({ x: [0, 4], y: [10, 12], z: [7, 7.5] });
  });

  it('keeps a scale of 1 for an axis with a single value (a flat grid)', () => {
    const { calc } = calcOf(columns([0, 1, 2, 3, 4], [10, 12], [7], (x) => x));
    expect(calc.grid.len).toBe(10);
    expect(calc.dataScale).toEqual([1 / 4, 1 / 2, 1]);
    expect(calc.sceneExtremes).toEqual({ x: [0, 4], y: [10, 12], z: [7, 7] });
  });

  it('draws nothing and claims no range for columns that are not a grid', () => {
    const c = columns([0, 1, 2], [10, 20], [-1, 0, 1, 2], (x) => x);
    // x does not increase along its axis in the first row.
    [c.x[0], c.x[1]] = [c.x[1]!, c.x[0]!];
    const { trace, calc } = calcOf(c);
    expect(trace.visible).toBe(true);
    expect(calc.grid.len).toBe(0);
    expect(calc.mesh).toBeNull();
    expect(calc.sceneExtremes).toEqual({});
  });
});

describe('isosurface calc: slices at locations', () => {
  const DAYS = ['2025-01-01', '2025-01-02', '2025-01-03'];
  const cols = columns([0, 1, 2], [0, 1], [0, 1, 2], (_x, y, z) => y + z);
  const hidden = { show: false };
  const trace = {
    ...cols,
    x: cols.x.map((i) => DAYS[i]),
    surface: hidden,
    caps: { x: hidden, y: hidden, z: hidden },
    slices: {
      // On the middle grid plane, not a date, and half a day past the middle plane.
      x: { show: true, locations: ['2025-01-02', 'not a date', '2025-01-02 12:00'] },
    },
  };
  const onPlane = Date.UTC(2025, 0, 2);
  const between = Date.UTC(2025, 0, 2, 12);

  it('reads the locations in axis coordinates (ms for dates) and drops the unreadable ones', () => {
    const { trace: full, fullLayout, calc } = calcOf(trace);
    expect(Array.from(calc.grid.xs)).toEqual(DAYS.map((d) => Date.parse(`${d}T00:00:00Z`)));
    const o = isoMeshOptions(full, calc.isomin, calc.isomax, sceneScales(fullLayout, 'scene'));
    expect(o.slices.x).toEqual({ show: true, fill: 1, locations: [onPlane, between] });
    expect(o.slices.y.show).toBe(false);
    expect(o.surface.show).toBe(false);
    expect(o.caps.x.show).toBe(false);
  });

  it('draws the planes at those x only, over the whole y–z face when every value is in range', () => {
    const { calc } = calcOf(trace);
    // Values are y + z: 0 … 3, all inside the default [isomin, isomax].
    expect([calc.isomin, calc.isomax]).toEqual([0, 3]);
    const mesh = calc.mesh!;
    expect(mesh.triangles.length).toBeGreaterThan(0);
    const at = (v: number, x: number) => Math.abs(mesh.x[v]! - x) < 1;
    let planes = 0;
    let halfDay = 0;
    for (let v = 0; v < mesh.count; v++) {
      if (at(v, onPlane)) planes++;
      else if (at(v, between)) halfDay++;
      else throw new Error(`vertex ${v} at x = ${mesh.x[v]} is on neither slice`);
      // Vertices stay on the face and carry the field's value there.
      expect(mesh.y[v]).toBeGreaterThanOrEqual(0);
      expect(mesh.y[v]).toBeLessThanOrEqual(1);
      expect(mesh.z[v]).toBeGreaterThanOrEqual(0);
      expect(mesh.z[v]).toBeLessThanOrEqual(2);
      expect(mesh.value[v]).toBeCloseTo(mesh.y[v]! + mesh.z[v]!, 9);
    }
    expect(planes).toBeGreaterThan(0);
    expect(halfDay).toBeGreaterThan(0);
    // The slice on the grid plane covers the y–z face: 1 × 2.
    expect(area(mesh, (v) => at(v, onPlane))).toBeCloseTo(2, 9);
  });
});
