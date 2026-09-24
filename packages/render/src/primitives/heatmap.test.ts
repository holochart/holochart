import { describe, expect, it } from 'vitest';
import { Group, RGFormat, RedFormat, type DataTexture, type Vector2, type Vector3 } from 'three';
import { colorscaleKey, type Colorscale } from '../colorscale/lut.ts';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { UNIT_QUAD_KEY } from './common.ts';
import {
  HEATMAP_TEXTURE_WIDTH,
  createHeatmapAxis,
  createHeatmapPrimitive,
  heatmapAxisCell,
  heatmapAxisLerp,
  heatmapCellIndex,
  heatmapColorAt,
  heatmapColorT,
  heatmapTextureSize,
  heatmapZRange,
  isUniformEdges,
  packHeatmapEdges,
  packHeatmapValues,
  sampleHeatmap,
  type HeatmapInput,
  type HeatmapSampleInput,
} from './heatmap.ts';
import { HEATMAP_FRAGMENT_SHADER, HEATMAP_VERTEX_SHADER } from './heatmap.glsl.ts';

function context(): PrimitiveContext & {
  invalidations: number;
  resources: ReturnType<typeof createResourceManager>;
} {
  const ctx = {
    resources: createResourceManager(),
    invalidations: 0,
    invalidate() {
      ctx.invalidations++;
    },
  };
  return ctx;
}

const GRAY: Colorscale = [
  [0, [0, 0, 0, 1]],
  [1, [1, 1, 1, 1]],
];
const RED: Colorscale = [
  [0, [0, 0, 0, 1]],
  [1, [1, 0, 0, 1]],
];

/** 3 × 2 grid, non-uniform x (widths 1, 2, 3), uniform y. */
const grid = (z: number[] = [0, 10, 20, 30, 40, 50]): HeatmapSampleInput => ({
  z,
  nx: 3,
  ny: 2,
  xEdges: [0, 1, 3, 6],
  yEdges: [0, 1, 2],
});

const vec2 = (v: unknown) => (v as Vector2).toArray();
const vec3 = (v: unknown) => (v as Vector3).toArray();

describe('texture layout', () => {
  it('sizes textures to the texel count, wrapping rows at the max width', () => {
    expect(heatmapTextureSize(0)).toEqual({ width: 1, height: 1 });
    expect(heatmapTextureSize(10)).toEqual({ width: 10, height: 1 });
    expect(heatmapTextureSize(HEATMAP_TEXTURE_WIDTH)).toEqual({ width: 4096, height: 1 });
    expect(heatmapTextureSize(5000)).toEqual({ width: 4096, height: 2 });
    expect(heatmapTextureSize(5, 2)).toEqual({ width: 2, height: 3 });
  });

  it('packs values linearly as (value - zOrigin, valid), wrapping past the width', () => {
    const image = packHeatmapValues([1, NaN, 3, Infinity, 5], 5, 1, 2, 1);
    expect([image.width, image.height]).toEqual([2, 3]);
    // Texel k at (k % 2, floor(k / 2)); non-finite and padding texels are (0, 0).
    expect(Array.from(image.data)).toEqual([0, 1, 0, 0, 2, 1, 0, 0, 4, 1, 0, 0]);
    const texel = (x: number, y: number) => {
      const t = (y * image.width + x) * 2;
      return [image.data[t], image.data[t + 1]];
    };
    expect(texel(0, 2)).toEqual([4, 1]); // k = 4
  });

  it('marks values missing from a short z as invalid and reuses a matching output array', () => {
    const out = new Float32Array(8);
    const image = packHeatmapValues([7, 8], 2, 2, undefined, 0, out);
    expect(image.data).toBe(out);
    expect([image.width, image.height]).toEqual([4, 1]);
    expect(Array.from(out)).toEqual([7, 1, 8, 1, 0, 0, 0, 0]);
    const wide = packHeatmapValues(new Float64Array(5000).fill(2), 5000, 1);
    expect([wide.width, wide.height]).toEqual([4096, 2]);
    expect(wide.data[2 * 4999]).toBe(2);
    expect(wide.data[2 * 4999 + 1]).toBe(1);
    expect(wide.data[2 * 5000 + 1]).toBe(0);
  });

  it('packs directed x then y edges into one texture', () => {
    const x = createHeatmapAxis([10, 11, 13, 16])!;
    const y = createHeatmapAxis([2, 1, 0])!; // descending: directed edges 0, 1, 2
    const image = packHeatmapEdges(x, y, 4);
    expect(image.yBase).toBe(4);
    expect([image.width, image.height]).toEqual([4, 2]);
    expect(Array.from(image.data)).toEqual([0, 1, 3, 6, 0, 1, 2, 0]);
  });
});

describe('axes and cell lookup', () => {
  it('detects uniform edges', () => {
    expect(isUniformEdges([0, 1, 2, 3])).toBe(true);
    expect(isUniformEdges([3, 2, 1, 0])).toBe(true);
    expect(isUniformEdges([0, 1])).toBe(true);
    expect(isUniformEdges(Array.from({ length: 11 }, (_, k) => k * 0.1))).toBe(true);
    const t0 = Date.UTC(2026, 0, 1);
    expect(isUniformEdges(Array.from({ length: 50 }, (_, k) => t0 + k * 1000))).toBe(true);
    expect(isUniformEdges([0, 1, 3])).toBe(false);
    expect(isUniformEdges([0, 1, 2 + 1e-6])).toBe(false);
    expect(isUniformEdges([0])).toBe(false);
    expect(isUniformEdges([0, 0, 0])).toBe(false);
    expect(isUniformEdges([0, NaN])).toBe(false);
    // Only the first n + 1 edges count.
    expect(isUniformEdges([0, 1, 2, 10], 2)).toBe(true);
  });

  it('validates axes: directed edges, direction and extent', () => {
    const asc = createHeatmapAxis([10, 11, 13, 16])!;
    expect(asc).toMatchObject({ n: 3, origin: 10, dir: 1, extent: 6, uniform: false });
    expect(Array.from(asc.rel)).toEqual([0, 1, 3, 6]);
    const desc = createHeatmapAxis([4, 2, 0])!;
    expect(desc).toMatchObject({ n: 2, origin: 4, dir: -1, extent: 4, uniform: true });
    expect(Array.from(desc.rel)).toEqual([0, 2, 4]);
    expect(createHeatmapAxis([0, 2, 1])).toBeUndefined();
    expect(createHeatmapAxis([0, 1, 1])).toBeUndefined();
    expect(createHeatmapAxis([0, NaN, 2])).toBeUndefined();
    expect(createHeatmapAxis([0, 1], 3)).toBeUndefined(); // too few edges
    expect(createHeatmapAxis([0], 0)).toBeUndefined();
  });

  it('finds cells: half-open, last edge inclusive, -1 outside', () => {
    expect([0, 0.5, 1, 2.999, 3].map((v) => heatmapCellIndex([0, 1, 2, 3], v))).toEqual([
      0, 0, 1, 2, 2,
    ]);
    expect([-0.01, 3.01, NaN].map((v) => heatmapCellIndex([0, 1, 2, 3], v))).toEqual([-1, -1, -1]);
    // Non-uniform (binary search).
    expect([0, 0.99, 1, 2.999, 3, 5, 6].map((v) => heatmapCellIndex([0, 1, 3, 6], v))).toEqual([
      0, 0, 1, 1, 2, 2, 2,
    ]);
    // Descending: [e_i, e_i+1) in the edges' own direction.
    expect([3, 2.5, 2, 0.5, 0].map((v) => heatmapCellIndex([3, 2, 1, 0], v))).toEqual([
      0, 0, 1, 2, 2,
    ]);
    expect([6, 3.01, 3, 1, 0].map((v) => heatmapCellIndex([6, 3, 1, 0], v))).toEqual([
      0, 0, 1, 2, 2,
    ]);
    expect(heatmapCellIndex([6, 3, 1, 0], 6.5)).toBe(-1);
    expect(heatmapCellIndex([0, 2, 1], 0.5)).toBe(-1); // invalid edges
  });

  it('uniform and searched lookups agree', () => {
    const edges = Array.from({ length: 101 }, (_, k) => -50 + k * 0.5);
    const fast = createHeatmapAxis(edges)!;
    const searched = { ...fast, uniform: false };
    expect(fast.uniform).toBe(true);
    for (let a = 0.01; a < fast.extent; a += 0.37) {
      expect(heatmapAxisCell(fast, a)).toBe(heatmapAxisCell(searched, a));
    }
  });

  it('interpolates in index space (fast) and between cell centers (best)', () => {
    const axis = createHeatmapAxis([0, 1, 3, 6])!;
    // a = 2.5 in cell 1: continuous index 1.75 → between cells 1 and 2 at 0.25.
    expect(heatmapAxisLerp(axis, 2.5, 1, 'fast')).toEqual({ i0: 1, i1: 2, f: 0.25 });
    // Centers 0.5, 2, 4.5: a = 2.5 is 0.5 / 2.5 of the way from center 1 to center 2.
    const best = heatmapAxisLerp(axis, 2.5, 1, 'best');
    expect(best.i0).toBe(1);
    expect(best.i1).toBe(2);
    expect(best.f).toBeCloseTo(0.2, 12);
    // Below a center: previous center to this one.
    expect(heatmapAxisLerp(axis, 1.5, 1, 'best')).toEqual({ i0: 0, i1: 1, f: 2 / 3 });
    // Clamped outside the outermost centers.
    expect(heatmapAxisLerp(axis, 0.2, 0, 'best')).toEqual({ i0: 0, i1: 0, f: 0 });
    expect(heatmapAxisLerp(axis, 5.9, 2, 'best')).toEqual({ i0: 2, i1: 2, f: 0 });
    expect(heatmapAxisLerp(axis, 0.2, 0, 'fast')).toEqual({ i0: 0, i1: 1, f: 0 });
    expect(heatmapAxisLerp(axis, 5.9, 2, 'fast')).toEqual({ i0: 1, i1: 2, f: 1 });
    // A single cell never interpolates.
    const one = createHeatmapAxis([0, 1])!;
    expect(heatmapAxisLerp(one, 0.9, 0, 'fast')).toEqual({ i0: 0, i1: 0, f: 0 });
    expect(heatmapAxisLerp(one, 0.9, 0, 'best')).toEqual({ i0: 0, i1: 0, f: 0 });
  });
});

describe('sampleHeatmap', () => {
  it('returns the nearest cell value without smoothing, NaN outside', () => {
    const d = grid();
    expect(sampleHeatmap(d, 0.5, 0.5)).toBe(0);
    expect(sampleHeatmap(d, 2, 0.5)).toBe(10);
    expect(sampleHeatmap(d, 6, 2)).toBe(50); // last edges inclusive
    expect(sampleHeatmap(d, 4, 1.5)).toBe(50);
    expect(sampleHeatmap(d, -0.1, 0.5)).toBeNaN();
    expect(sampleHeatmap(d, 6.1, 0.5)).toBeNaN();
    expect(sampleHeatmap(d, 1, 2.1)).toBeNaN();
    expect(sampleHeatmap({ ...d, xEdges: [0, 2, 1, 3] }, 0.5, 0.5)).toBeNaN();
  });

  it('supports descending edges', () => {
    const d = { ...grid(), xEdges: [6, 3, 1, 0], yEdges: [2, 1, 0] };
    expect(sampleHeatmap(d, 5, 1.5)).toBe(0); // x cell 0, y cell 0
    expect(sampleHeatmap(d, 0.5, 0.5)).toBe(50);
    expect(sampleHeatmap(d, 2, 1.5)).toBe(10);
  });

  it('makes non-finite cells transparent', () => {
    const d = grid([0, NaN, 20, Infinity, 40, 50]);
    expect(sampleHeatmap(d, 2, 0.5)).toBeNaN();
    expect(sampleHeatmap(d, 0.5, 1.5)).toBeNaN();
    expect(sampleHeatmap(d, 4, 0.5)).toBe(20);
    expect(sampleHeatmap({ ...d, z: [1, 2] }, 4, 1.5)).toBeNaN(); // missing values
  });

  it('distinguishes index-space and data-space bilinear on non-uniform edges', () => {
    const d = grid();
    // Cell centers give the cell value in both modes.
    expect(sampleHeatmap({ ...d, smoothing: 'fast' }, 2, 0.5)).toBe(10);
    expect(sampleHeatmap({ ...d, smoothing: 'best' }, 2, 0.5)).toBe(10);
    expect(sampleHeatmap({ ...d, smoothing: 'fast' }, 2.5, 0.5)).toBeCloseTo(12.5, 12);
    expect(sampleHeatmap({ ...d, smoothing: 'best' }, 2.5, 0.5)).toBeCloseTo(12, 12);
    // Both axes: y = 1 sits halfway between the row centers.
    expect(sampleHeatmap({ ...d, smoothing: 'fast' }, 2.5, 1)).toBeCloseTo(27.5, 12);
    expect(sampleHeatmap({ ...d, smoothing: 'best' }, 2.5, 1)).toBeCloseTo(27, 12);
  });

  it('agrees between modes on uniform edges', () => {
    const d = { ...grid(), xEdges: [0, 2, 4, 6] };
    for (const [x, y] of [
      [0.3, 0.2],
      [2.7, 1.1],
      [5.2, 1.9],
      [3, 1],
    ] as const) {
      expect(sampleHeatmap({ ...d, smoothing: 'fast' }, x, y)).toBeCloseTo(
        sampleHeatmap({ ...d, smoothing: 'best' }, x, y),
        10,
      );
    }
  });

  it('clamps smoothing at the grid borders', () => {
    for (const smoothing of ['fast', 'best'] as const) {
      const d = { ...grid(), smoothing };
      expect(sampleHeatmap(d, 0.1, 0.1)).toBe(0);
      expect(sampleHeatmap(d, 6, 2)).toBe(50);
      expect(sampleHeatmap(d, 5.9, 0.2)).toBe(20);
    }
  });

  it('renormalizes over finite corners and keeps NaN cells transparent', () => {
    const d = { ...grid([0, NaN, 20, 30, 40, 50]), smoothing: 'best' as const };
    expect(sampleHeatmap(d, 2.5, 0.5)).toBeNaN(); // the containing cell is NaN
    // x = 4: cells 1 (NaN, weight 0.2) and 2 (weight 0.8) → only cell 2 counts.
    expect(sampleHeatmap(d, 4, 0.5)).toBeCloseTo(20, 12);
    // Both axes at y = 1 (f = 0.5): (0.4 * 20 + 0.1 * 40 + 0.4 * 50) / 0.9.
    expect(sampleHeatmap(d, 4, 1)).toBeCloseTo(32 / 0.9, 12);
    expect(sampleHeatmap({ ...d, smoothing: 'fast' }, 0.9, 0.5)).toBe(0);
  });

  it('cuts gaps of gap/2 px from each cell edge, scaled by the transform', () => {
    const d = { ...grid(), xgap: 0.4, ygap: 0.2 };
    expect(sampleHeatmap(d, 0.1, 0.5)).toBeNaN();
    expect(sampleHeatmap(d, 0.95, 0.5)).toBeNaN();
    expect(sampleHeatmap(d, 0.5, 0.5)).toBe(0);
    expect(sampleHeatmap(d, 0.5, 0.05)).toBeNaN();
    expect(sampleHeatmap(d, 0.5, 0.15)).toBe(0);
    // 10 px per unit: a 4 px gap cuts 0.2 data units per side; negative scales count by magnitude.
    const px = { ...grid(), xgap: 4 };
    const t = { scaleX: -10, scaleY: 1, offsetX: 0, offsetY: 0 };
    expect(sampleHeatmap(px, 0.1, 0.5, t)).toBeNaN();
    expect(sampleHeatmap(px, 0.3, 0.5, t)).toBe(0);
    expect(sampleHeatmap(px, 5.85, 0.5, t)).toBeNaN();
    // Smoothing ignores gaps.
    expect(sampleHeatmap({ ...d, smoothing: 'fast' }, 0.1, 0.5)).toBe(0);
  });
});

describe('color mapping', () => {
  it('maps values to t like the shader', () => {
    expect(heatmapColorT(5, 0, 10)).toBe(0.5);
    expect(heatmapColorT(-5, 0, 10)).toBe(0);
    expect(heatmapColorT(15, 0, 10)).toBe(1);
    expect(heatmapColorT(2.5, 0, 10, true)).toBe(0.75);
    expect(heatmapColorT(3, 3, 3)).toBe(0.5);
    expect(heatmapColorT(NaN, 0, 1)).toBeNaN();
  });

  it('computes colors with defaults, reversescale and opacity', () => {
    const d: HeatmapInput = {
      z: [0, 10],
      nx: 2,
      ny: 1,
      xEdges: [0, 1, 2],
      yEdges: [0, 1],
      colorscale: GRAY,
    };
    expect(heatmapColorAt(d, 1.5, 0.5)).toEqual([1, 1, 1, 1]);
    expect(heatmapColorAt(d, 0.5, 0.5)).toEqual([0, 0, 0, 1]);
    expect(heatmapColorAt({ ...d, reversescale: true }, 1.5, 0.5)).toEqual([0, 0, 0, 1]);
    expect(heatmapColorAt({ ...d, opacity: 0.5, zmin: 0, zmax: 20 }, 1.5, 0.5)).toEqual([
      0.5, 0.5, 0.5, 0.5,
    ]);
    expect(heatmapColorAt({ ...d, z: [NaN, 3] }, 0.5, 0.5)).toBeUndefined();
    expect(heatmapColorAt({ ...d, z: [3, 3] }, 0.5, 0.5)).toEqual([0.5, 0.5, 0.5, 1]);
  });

  it('defaults zmin / zmax to the finite z range', () => {
    expect(heatmapZRange([3, NaN, -2, Infinity, 7])).toEqual([-2, 7]);
    expect(heatmapZRange([3, 100], 1)).toEqual([3, 3]);
    expect(heatmapZRange([NaN])).toEqual([0, 1]);
  });
});

describe('HeatmapPrimitive', () => {
  const input = (patch: Partial<HeatmapInput> = {}): HeatmapInput => ({
    z: [0, 10, 20, 30, 40, 50],
    nx: 3,
    ny: 2,
    xEdges: [100, 101, 103, 106],
    yEdges: [5, 6, 7],
    colorscale: GRAY,
    ...patch,
  });
  const textures = (h: ReturnType<typeof createHeatmapPrimitive>) => ({
    z: h.uniforms.uZ.value as DataTexture,
    edges: h.uniforms.uEdges.value as DataTexture,
  });

  it('builds one mesh on the shared unit quad with textures and uniforms', () => {
    const ctx = context();
    const h = createHeatmapPrimitive(ctx, input());
    expect(h.object.visible).toBe(true);
    expect(h.object.frustumCulled).toBe(false);
    expect(ctx.resources.stats()).toEqual([
      { key: UNIT_QUAD_KEY, kind: 'geometry', refs: 1 },
      { key: colorscaleKey(GRAY), kind: 'texture', refs: 1 },
    ]);
    const u = h.uniforms;
    expect(vec2(u.uCount.value)).toEqual([3, 2]);
    expect(vec2(u.uExtent.value)).toEqual([6, 2]);
    expect(vec2(u.uUniform.value)).toEqual([0, 1]);
    expect(u.uYBase.value).toBe(4);
    expect(vec2(u.uZRange.value)).toEqual([-25, 25]); // zOrigin = 25
    expect(u.uSmoothing.value).toBe(0);
    expect(u.uOpacity.value).toBe(1);
    expect(u.uReverse.value).toBe(0);
    expect(u.uLutSize.value).toBe(256);
    // RTC: the origin is the first edges.
    expect(vec3(u.uScale.value)).toEqual([1, 1, 1]);
    expect(vec3(u.uOffset.value)).toEqual([100, 5, 0]);
    const { z, edges } = textures(h);
    expect(z.format).toBe(RGFormat);
    expect([z.image.width, z.image.height]).toEqual([6, 1]);
    expect(Array.from(z.image.data as Float32Array)).toEqual([
      -25, 1, -15, 1, -5, 1, 5, 1, 15, 1, 25, 1,
    ]);
    expect(edges.format).toBe(RedFormat);
    expect(Array.from(edges.image.data as Float32Array)).toEqual([0, 1, 3, 6, 0, 1, 2]);
    expect(h.current.zmin).toBe(0);
    expect(h.current.zmax).toBe(50);
    h.dispose();
  });

  it('declares every shader uniform in the material', () => {
    const h = createHeatmapPrimitive(context(), input());
    const names = [
      ...`${HEATMAP_VERTEX_SHADER}\n${HEATMAP_FRAGMENT_SHADER}`.matchAll(
        /^\s*uniform\s+(?:highp\s+)?\w+\s+(\w+);/gm,
      ),
    ].map((m) => m[1]!);
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      if (name === 'projectionMatrix' || name === 'modelViewMatrix') continue;
      expect(h.object.material.uniforms, name).toHaveProperty(name);
    }
    h.dispose();
  });

  it('flags descending edges with a negative extent', () => {
    const h = createHeatmapPrimitive(context(), input({ xEdges: [106, 103, 101, 100] }));
    expect(vec2(h.uniforms.uExtent.value)).toEqual([-6, 2]);
    expect(vec3(h.uniforms.uOffset.value)).toEqual([106, 5, 0]);
    expect(Array.from(textures(h).edges.image.data as Float32Array).slice(0, 4)).toEqual([
      0, 3, 5, 6,
    ]);
    h.dispose();
  });

  it('setTransform only writes uniforms', () => {
    const ctx = context();
    const h = createHeatmapPrimitive(ctx, input());
    const { z, edges } = textures(h);
    const versions = [z.version, edges.version];
    const before = ctx.invalidations;
    h.setTransform({ scaleX: 2, scaleY: -3, offsetX: 10, offsetY: 20 });
    expect(vec3(h.uniforms.uScale.value)).toEqual([2, -3, 1]);
    expect(vec3(h.uniforms.uOffset.value)).toEqual([210, 5, 0]);
    expect([z.version, edges.version]).toEqual(versions);
    expect(textures(h).z).toBe(z);
    expect(ctx.invalidations).toBe(before + 1);
    h.setViewport({ width: 100, height: 100, pixelRatio: 2 });
    h.dispose();
  });

  it('style updates touch uniforms only', () => {
    const ctx = context();
    const h = createHeatmapPrimitive(ctx, input());
    const { z, edges } = textures(h);
    const versions = [z.version, edges.version];
    const stats = ctx.resources.stats();
    h.update({
      zmin: -10,
      zmax: 10,
      reversescale: true,
      smoothing: 'best',
      xgap: 2,
      ygap: 3,
      opacity: 0.5,
    });
    const u = h.uniforms;
    expect(vec2(u.uZRange.value)).toEqual([-35, -15]);
    expect(u.uReverse.value).toBe(1);
    expect(u.uSmoothing.value).toBe(2);
    expect(vec2(u.uGap.value)).toEqual([2, 3]);
    expect(u.uOpacity.value).toBe(0.5);
    h.update({ smoothing: 'fast' });
    expect(u.uSmoothing.value).toBe(1);
    h.update({ smoothing: false });
    expect(u.uSmoothing.value).toBe(0);
    expect([z.version, edges.version]).toEqual(versions);
    expect(textures(h).z).toBe(z);
    expect(textures(h).edges).toBe(edges);
    expect(ctx.resources.stats()).toEqual(stats);
    expect(ctx.invalidations).toBeGreaterThanOrEqual(3);
    h.dispose();
  });

  it('reuses the value texture for same-size z updates and follows auto zmin / zmax', () => {
    const h = createHeatmapPrimitive(context(), input());
    const { z, edges } = textures(h);
    const [zv, ev] = [z.version, edges.version];
    h.update({ z: [1, 2, 3, 4, 5, NaN] });
    expect(textures(h).z).toBe(z);
    expect(z.version).toBe(zv + 1);
    expect(edges.version).toBe(ev);
    expect(h.current.zmin).toBe(1);
    expect(h.current.zmax).toBe(5);
    expect(Array.from(z.image.data as Float32Array)).toEqual([
      -2, 1, -1, 1, 0, 1, 1, 1, 2, 1, 0, 0,
    ]);
    expect(vec2(h.uniforms.uZRange.value)).toEqual([-2, 2]);
    // Explicit limits stick.
    h.update({ zmin: 0, zmax: 100 });
    h.update({ z: [7, 7, 7, 7, 7, 7] });
    expect([h.current.zmin, h.current.zmax]).toEqual([0, 100]);
    expect(vec2(h.uniforms.uZRange.value)).toEqual([-7, 93]);
    h.dispose();
  });

  it('recreates textures when the grid size changes and disposes the old ones', () => {
    const h = createHeatmapPrimitive(context(), input());
    const { z, edges } = textures(h);
    let disposed = 0;
    z.addEventListener('dispose', () => disposed++);
    edges.addEventListener('dispose', () => disposed++);
    h.update({ z: [1, 2, 3, 4], nx: 2, xEdges: [0, 1, 2] });
    expect(disposed).toBe(2);
    expect(textures(h).z).not.toBe(z);
    expect([textures(h).z.image.width, textures(h).z.image.height]).toEqual([4, 1]);
    expect(vec2(h.uniforms.uCount.value)).toEqual([2, 2]);
    expect(vec2(h.uniforms.uUniform.value)).toEqual([1, 1]);
    expect(h.uniforms.uYBase.value).toBe(3);
    expect(h.object.visible).toBe(true);
    h.dispose();
  });

  it('re-uploads same-size edges in place and moves the origin', () => {
    const h = createHeatmapPrimitive(context(), input());
    const { z, edges } = textures(h);
    const [zv, ev] = [z.version, edges.version];
    h.setTransform({ scaleX: 2, scaleY: 1, offsetX: 0, offsetY: 0 });
    h.update({ xEdges: [200, 202, 204, 206] });
    expect(textures(h).edges).toBe(edges);
    expect(edges.version).toBe(ev + 1);
    expect(z.version).toBe(zv);
    expect(vec3(h.uniforms.uOffset.value)).toEqual([400, 5, 0]);
    expect(vec2(h.uniforms.uExtent.value)).toEqual([6, 2]);
    expect(vec2(h.uniforms.uUniform.value)).toEqual([1, 1]);
    h.dispose();
  });

  it('hides for empty grids and invalid edges', () => {
    const ctx = context();
    expect(createHeatmapPrimitive(ctx, input({ nx: 0, z: [], xEdges: [0] })).object.visible).toBe(
      false,
    );
    expect(createHeatmapPrimitive(ctx, input({ xEdges: [0, 1, NaN, 3] })).object.visible).toBe(
      false,
    );
    const h = createHeatmapPrimitive(ctx, input({ yEdges: [0, 2, 1] }));
    expect(h.object.visible).toBe(false);
    h.update({ yEdges: [0, 1, 2] });
    expect(h.object.visible).toBe(true);
    h.update({ nx: 4 }); // edges no longer match
    expect(h.object.visible).toBe(false);
  });

  it('swaps the shared LUT on colorscale change', () => {
    const ctx = context();
    const a = createHeatmapPrimitive(ctx, input());
    const b = createHeatmapPrimitive(ctx, input());
    const lut = (key: string) => ctx.resources.stats().find((s) => s.key === key)?.refs;
    expect(lut(colorscaleKey(GRAY))).toBe(2);
    const z = textures(a).z;
    const zv = z.version;
    a.update({ colorscale: RED });
    expect(lut(colorscaleKey(GRAY))).toBe(1);
    expect(lut(colorscaleKey(RED))).toBe(1);
    expect(a.uniforms.uLut.value).not.toBe(b.uniforms.uLut.value);
    expect(z.version).toBe(zv);
    a.update({ interpolation: 'oklab' });
    expect(lut(colorscaleKey(RED))).toBeUndefined();
    expect(lut(colorscaleKey(RED, 'oklab'))).toBe(1);
    b.dispose();
    expect(lut(colorscaleKey(GRAY))).toBeUndefined();
    a.dispose();
  });

  it('dispose releases everything and is idempotent', () => {
    const ctx = context();
    const h = createHeatmapPrimitive(ctx, input());
    const parent = new Group();
    parent.add(h.object);
    const { z, edges } = textures(h);
    let disposed = 0;
    z.addEventListener('dispose', () => disposed++);
    edges.addEventListener('dispose', () => disposed++);
    h.object.material.addEventListener('dispose', () => disposed++);
    h.dispose();
    h.dispose();
    expect(disposed).toBe(3);
    expect(ctx.resources.stats()).toEqual([]);
    expect(h.object.parent).toBeNull();
    expect(h.uniforms.uZ.value).toBeNull();
    h.update({ opacity: 0.1 }); // ignored after dispose
    expect(h.uniforms.uOpacity.value).toBe(1);
  });
});
