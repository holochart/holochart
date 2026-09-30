import { supplyDefaults } from '@mk7s/holochart-core';
import { createResourceManager, type PrimitiveContext } from '@mk7s/holochart-render';
import { createChartRegistry, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcIso } from '../isosurface/calc.ts';
import { processIsoGrid } from '../isosurface/grid.ts';
import { volume } from './index.ts';
import { rayMarchData } from './plot.ts';
import {
  axisTable,
  AXIS_TABLE_SIZE,
  isUniformAxis,
  packVolume,
  VolumeRayMarchPrimitive,
} from './raymarch.ts';
import { HOVER_OPACITY, rayMarchHit, sampleGrid } from './raymarch-hover.ts';
import {
  buildTransferFunction,
  packValue,
  transferAt,
  transferValue,
  unpackValue,
  TRANSFER_SIZE,
  type TransferSpec,
} from './transfer.ts';

const registry = createChartRegistry().register(volume, sceneComponent);

function defaults(trace: Record<string, unknown>) {
  const r = supplyDefaults(
    { data: [{ type: 'volume', ...trace }], layout: { template: 'none' } },
    registry.core,
  );
  return { trace: r.fullData[0]!, fullLayout: r.fullLayout };
}

function context(): PrimitiveContext {
  return { resources: createResourceManager(), invalidate: () => {} };
}

const range = (lo: number, hi: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

/** x fastest; `f` gives the value. */
function field(
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

const GRAY: TransferSpec = { domain: [0, 10], mapping: null, opacity: 1, opacityscale: null };

describe('volume defaults (plotly.js volume/defaults.js)', () => {
  const g = range(0, 1, 3);
  const f = field(g, g, g, (x) => x);

  it('isosurface’s defaults, with a full space frame', () => {
    const t = defaults({ ...f, spaceframe: { show: true } }).trace;
    expect(t['spaceframe']).toEqual({ show: true, fill: 1 });
    expect(t['surface']).toEqual({ show: true, count: 2, fill: 1, pattern: 'all' });
    expect(t['flatshading']).toBe(true);
    expect(t['showlegend']).toBe(false);
    expect(t['render']).toBe('isosurfaces');
    expect(t['raymarch']).toBeUndefined();
  });

  it('expands named opacity scales; uniform and invalid ones are dropped', () => {
    expect(defaults({ ...f, opacityscale: 'max' }).trace['opacityscale']).toEqual([
      [0, 0.1],
      [1, 1],
    ]);
    expect(defaults({ ...f, opacityscale: 'min' }).trace['opacityscale']).toEqual([
      [0, 1],
      [1, 0.1],
    ]);
    expect(
      (defaults({ ...f, opacityscale: 'extremes' }).trace['opacityscale'] as unknown[]).length,
    ).toBe(32);
    const stops = [
      [0, 0],
      [0.5, 1],
      [1, 0.2],
    ];
    expect(defaults({ ...f, opacityscale: stops }).trace['opacityscale']).toEqual(stops);
    expect(defaults({ ...f, opacityscale: 'uniform' }).trace['opacityscale']).toBeUndefined();
    expect(defaults({ ...f, opacityscale: [[0.2, 1]] }).trace['opacityscale']).toBeUndefined();
  });

  it('ray-march options only with render: raymarch', () => {
    const t = defaults({ ...f, render: 'raymarch' }).trace;
    expect(t['raymarch']).toEqual({ step: 0.5, shading: false });
  });

  it('calc skips the mesh when ray marching', () => {
    const d = defaults({ ...f, render: 'raymarch' });
    const calc = calcIso(d.trace, { fullLayout: d.fullLayout } as CalcContext, false);
    expect(calc.mesh).toBe(null);
    expect(calc.grid.len).toBe(27);
  });
});

describe('transfer function', () => {
  it('maps the value domain to color and opacity', () => {
    expect(transferValue([0, 10], 0)).toBe(0);
    expect(transferValue([0, 10], TRANSFER_SIZE - 1)).toBe(10);
    expect(transferAt(GRAY, 5)).toEqual([0.5, 0.5, 0.5, 1]);
    const faded = {
      ...GRAY,
      opacity: 0.5,
      opacityscale: [
        [0, 0],
        [1, 1],
      ] as [number, number][],
    };
    expect(transferAt(faded, 0)[3]).toBe(0);
    expect(transferAt(faded, 5)[3]).toBeCloseTo(0.25, 9);
    expect(transferAt(faded, 10)[3]).toBe(0.5);
    const table = buildTransferFunction(faded);
    expect(table.length).toBe(TRANSFER_SIZE * 4);
    expect([...table.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...table.slice(-4)]).toEqual([255, 255, 255, 128]);
  });

  it('uses the colorscale mapping and its domain', () => {
    const spec: TransferSpec = {
      domain: [0, 10],
      mapping: {
        colorscale: [
          [0, [1, 0, 0, 1]],
          [1, [0, 0, 1, 1]],
        ],
        cmin: 2,
        cmax: 4,
        reversescale: false,
        interpolation: 'rgb',
      },
      opacity: 1,
      opacityscale: [
        [0, 0.2],
        [1, 1],
      ],
    };
    expect(transferAt(spec, 2)).toEqual([1, 0, 0, 0.2]);
    expect(transferAt(spec, 9)).toEqual([0, 0, 1, 1]);
  });

  it('packs values in 8 bits, 0 for missing', () => {
    expect(packValue(0, [0, 10])).toBe(1);
    expect(packValue(10, [0, 10])).toBe(255);
    expect(packValue(NaN, [0, 10])).toBe(0);
    expect(unpackValue(0, [0, 10])).toBeNaN();
    expect(unpackValue(128, [0, 10])).toBeCloseTo(5, 9);
  });
});

describe('ray-march primitive', () => {
  it('packs the grid x-fastest and ascending, whatever the column order', () => {
    const xs = [0, 1];
    const ys = [0, 1, 2];
    const zs = [5, 6];
    const f = (x: number, y: number, z: number) => x + 2 * y + 10 * (z - 5);
    // Columns z fastest, x descending.
    const cols = { x: [] as number[], y: [] as number[], z: [] as number[], v: [] as number[] };
    for (const x of [1, 0]) {
      for (const y of ys) {
        for (const z of zs) {
          cols.x.push(x);
          cols.y.push(y);
          cols.z.push(z);
          cols.v.push(f(x, y, z));
        }
      }
    }
    const grid = processIsoGrid(cols.x, cols.y, cols.z, cols.v);
    const bytes = packVolume(grid, [0, 15]);
    let o = 0;
    for (const z of zs) {
      for (const y of ys) {
        for (const x of xs) expect(bytes[o++]).toBe(packValue(f(x, y, z), [0, 15]));
      }
    }
  });

  it('maps non-uniform axes through a lookup table', () => {
    expect(isUniformAxis(Float64Array.from([0, 1, 2, 3]))).toBe(true);
    expect(isUniformAxis(Float64Array.from([0, 1, 3]))).toBe(false);
    const table = axisTable(Float64Array.from([0, 1, 3]), new Float32Array(AXIS_TABLE_SIZE));
    expect(table[0]).toBe(0);
    expect(table[AXIS_TABLE_SIZE - 1]).toBe(1);
    // Position 1 of [0, 3] (a third of the box) is grid index 1 of 2.
    const at = Math.round((AXIS_TABLE_SIZE - 1) / 3);
    expect(table[at]).toBeCloseTo(0.5, 2);
  });

  it('sizes its box and loop from the grid; shading and non-uniform grids are defines', () => {
    const g = range(0, 1, 9);
    const f = field(g, g, [0, 0.5, 2], (x) => x);
    const grid = processIsoGrid(f.x, f.y, f.z, f.value);
    const p = new VolumeRayMarchPrimitive(context(), {
      grid,
      transfer: { ...GRAY, domain: [0, 1] },
      isomin: 0.2,
      isomax: 0.8,
      step: 0.5,
    });
    p.setTransform({ scaleX: 2, scaleY: 1, offsetX: 0, offsetY: 0, scaleZ: 1, offsetZ: -1 });
    expect(p.object.visible).toBe(true);
    expect(p.object.scale.toArray()).toEqual([2, 1, 2]);
    expect(p.object.position.toArray()).toEqual([0, 0, -1]);
    expect(p.defines['HC_NONUNIFORM']).toBe('');
    expect(p.defines['HC_SHADE']).toBeUndefined();
    // ⌈√(9² + 9² + 3²) / 0.5⌉ + 2 = 28 → 32.
    expect(p.defines['HC_MAX_STEPS']).toBe(32);
    p.update({ shading: true });
    expect(p.defines['HC_SHADE']).toBe('');
    expect(p.transferTable.length).toBe(TRANSFER_SIZE * 4);
    p.update({ grid: null });
    expect(p.object.visible).toBe(false);
    p.dispose();
  });

  it('reads the trace: domain, range, opacity, step', () => {
    const g = range(0, 1, 3);
    const d = defaults({
      ...field(g, g, g, (x, y) => x + y),
      render: 'raymarch',
      isomin: 0.5,
      opacity: 0.3,
      opacityscale: 'max',
      raymarch: { step: 0.25, shading: true },
    });
    const calc = calcIso(d.trace, { fullLayout: d.fullLayout } as CalcContext, false);
    const data = rayMarchData(d, calc, null);
    expect(data.transfer.domain).toEqual([0, 2]);
    expect([data.isomin, data.isomax]).toEqual([0.5, 2]);
    expect(data.transfer.opacity).toBe(0.3);
    expect(data.transfer.opacityscale).toEqual([
      [0, 0.1],
      [1, 1],
    ]);
    expect(data.transfer.mapping?.cmin).toBe(0.5);
    expect(data.step).toBe(0.25);
    expect(data.shading).toBe(true);
  });
});

describe('ray-march hover (CPU ray cast)', () => {
  const g = range(-1, 1, 21);
  const sphere = field(g, g, g, (x, y, z) => Math.hypot(x, y, z));
  const grid = processIsoGrid(sphere.x, sphere.y, sphere.z, sphere.value);
  const spec = {
    transfer: { ...GRAY, domain: [0, 2] as [number, number] },
    isomin: 0,
    isomax: 0.5,
    step: 1,
  };

  it('samples the grid trilinearly', () => {
    expect(sampleGrid(grid, [0, 0, 0])).toBeCloseTo(0, 9);
    expect(sampleGrid(grid, [0.05, 0, 0])).toBeCloseTo(0.05, 9);
    expect(sampleGrid(grid, [2, 0, 0])).toBeNaN();
  });

  it('stops where the volume shows: an opaque ball, entered along x', () => {
    const ray = { origin: [-3, 0.01, 0.02] as const, dir: [1, 0, 0] as const };
    const hit = rayMarchHit(grid, spec, ray, null)!;
    expect(hit[0]).toBeGreaterThan(-0.56);
    expect(hit[0]).toBeLessThan(-0.44);
    // Missing the ball, or clipped away: nothing.
    expect(rayMarchHit(grid, spec, { origin: [-3, 0.9, 0.9], dir: [1, 0, 0] }, null)).toBe(null);
    const clip = {
      min: [0.6, -1, -1] as [number, number, number],
      max: [1, 1, 1] as [number, number, number],
    };
    expect(rayMarchHit(grid, spec, ray, clip)).toBe(null);
  });

  it('goes deeper into a faint volume (accumulated opacity)', () => {
    const faint = { ...spec, transfer: { ...spec.transfer, opacity: 0.02 } };
    const ray = { origin: [-3, 0, 0] as const, dir: [1, 0, 0] as const };
    const hit = rayMarchHit(grid, faint, ray, null)!;
    // 1 − 0.98ⁿ ≥ 0.1 after ~5.2 cells (0.1 each) of material: past the ball's center.
    expect(hit[0]).toBeGreaterThan(-0.05);
    expect(hit[0]).toBeLessThan(0.1);
    expect(HOVER_OPACITY).toBe(0.1);
  });
});
