import type { InstancedBufferAttribute } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { createMarkers, type MarkerSet } from './markers.ts';
import { HIDDEN_POSITION } from '../precision.ts';
import { SYMBOL_TEXTURE_KEY } from './symbols.ts';

const HIDDEN = Math.fround(HIDDEN_POSITION);
const VIRIDIS_ISH = [
  [0, [0.27, 0.0, 0.33, 1]],
  [1, [0.99, 0.91, 0.14, 1]],
] as const;

function context() {
  const ctx = { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
  return ctx satisfies PrimitiveContext;
}

function attr(m: MarkerSet, name: string): InstancedBufferAttribute {
  return m.geometry.getAttribute(name) as InstancedBufferAttribute;
}

function items(m: MarkerSet, name: string, count = m.count): number[] {
  const a = attr(m, name);
  return Array.from(a.array as ArrayLike<number>).slice(0, count * a.itemSize);
}

describe('MarkerSet', () => {
  it('packs per-instance attributes with RTC positions', () => {
    const ctx = context();
    const m = createMarkers(ctx, {
      x: new Float64Array([10, 20, 30]),
      y: new Float64Array([100, 200, 300]),
      size: new Float32Array([4, 8, 12]),
      color: [1, 0, 0, 1],
      lineColor: new Float32Array([0, 0, 1, 1, 0, 1, 0, 0.5]),
      lineWidth: 2,
      symbol: ['circle', 'square-open', 202],
      opacity: 0.5,
      angle: new Float32Array([0, 45, 90]),
    });
    expect(m.count).toBe(3);
    expect(m.geometry.instanceCount).toBe(3);
    expect(m.origin).toEqual([20, 200, 0]);
    expect(items(m, 'aPos')).toEqual([-10, -100, 0, 0, 0, 0, 10, 100, 0]);
    expect(items(m, 'aSize')).toEqual([4, 8, 12]);
    expect(items(m, 'aFill')).toEqual([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]);
    // Short color arrays are padded with their last color.
    expect(items(m, 'aLine')).toEqual([0, 0, 255, 255, 0, 255, 0, 128, 0, 255, 0, 128]);
    expect(attr(m, 'aFill').normalized).toBe(true);
    expect(items(m, 'aStyle')).toEqual([2, 0, 0.5, 0, 2, 101, 0.5, 45, 2, 202, 0.5, 90]);
    expect(ctx.invalidate).toHaveBeenCalled();
    expect(m.object.frustumCulled).toBe(false);
  });

  it('draws with a single instanced mesh', () => {
    const m = createMarkers(context(), { x: [0, 1], y: [0, 1] });
    expect(m.object.isMesh).toBe(true);
    expect(m.object.children.length).toBe(0);
    expect(m.geometry.getIndex()?.count).toBe(6);
  });

  it('applies the transform relative to the origin in float64', () => {
    const t0 = Date.UTC(2026, 0, 1);
    const m = createMarkers(context(), { x: [t0, t0 + 1000], y: [0, 1] });
    m.setTransform({ scaleX: 1, scaleY: 1, offsetX: -t0, offsetY: 0 });
    const u = m.material.uniforms;
    // offsetRTC = -t0 + origin = 500 exactly, representable in float32.
    expect(u.uOffset!.value.x).toBe(500);
    expect(u.uScale!.value.x).toBe(1);
  });

  it('hides NaN gaps and sanitizes sizes and styles', () => {
    const m = createMarkers(context(), {
      x: [0, NaN, 2],
      y: [0, 1, Infinity],
      size: new Float32Array([NaN, -1, 3]),
      opacity: new Float32Array([NaN, -2, 5]),
    });
    expect(items(m, 'aPos').slice(3)).toEqual([HIDDEN, HIDDEN, HIDDEN, HIDDEN, HIDDEN, HIDDEN]);
    expect(items(m, 'aSize')).toEqual([0, 0, 3]);
    expect(items(m, 'aStyle').filter((_, i) => i % 4 === 2)).toEqual([1, 0, 1]);
  });

  it('re-uploads only the attributes touched by a style update', () => {
    const m = createMarkers(context(), { x: [0, 1, 2, 3], y: [0, 1, 2, 3] });
    const versions = () =>
      Object.fromEntries(
        ['aPos', 'aSize', 'aFill', 'aLine', 'aStyle'].map((n) => [n, attr(m, n).version]),
      );
    const before = versions();
    const geometry = m.geometry;
    m.update({ color: [0, 1, 0, 1] });
    const after = versions();
    expect(m.geometry).toBe(geometry);
    expect(after.aFill).toBe(before.aFill! + 1);
    for (const n of ['aPos', 'aSize', 'aLine', 'aStyle']) expect(after[n]).toBe(before[n]);
    expect(attr(m, 'aFill').updateRanges).toEqual([{ start: 0, count: 16 }]);
  });

  it('patches a sub-range and uploads just that range', () => {
    const m = createMarkers(context(), { x: [0, 1, 2, 3], y: [0, 1, 2, 3], size: 5 });
    m.patch(1, 2, { size: new Float32Array([9, 10]), symbol: 'x' });
    expect(items(m, 'aSize')).toEqual([5, 9, 10, 5]);
    expect(attr(m, 'aSize').updateRanges).toEqual([{ start: 1, count: 2 }]);
    expect(attr(m, 'aStyle').updateRanges).toEqual([{ start: 4, count: 8 }]);
    expect(items(m, 'aStyle').filter((_, i) => i % 4 === 1)).toEqual([0, 4, 4, 0]);
    expect(attr(m, 'aPos').updateRanges).toEqual([]);
  });

  it('streams appends through patch, growing capacity geometrically', () => {
    const ctx = context();
    const m = createMarkers(ctx, { x: [0, 1], y: [0, 1], size: 7 });
    expect(m.capacity).toBe(2);
    m.patch(2, 2, { x: [2, 3], y: [2, 3] });
    expect(m.count).toBe(4);
    expect(m.capacity).toBeGreaterThanOrEqual(4);
    expect(items(m, 'aPos')).toEqual([-0.5, -0.5, 0, 0.5, 0.5, 0, 1.5, 1.5, 0, 2.5, 2.5, 0]);
    // Unpatched fields of appended items come from the update inputs.
    expect(items(m, 'aSize')).toEqual([7, 7, 7, 7]);
    const cap = m.capacity;
    const geometry = m.geometry;
    if (cap > 4) {
      m.patch(4, 1, { x: [4], y: [4] });
      expect(m.geometry).toBe(geometry);
      expect(attr(m, 'aPos').updateRanges).toEqual([{ start: 12, count: 3 }]);
    }
    expect(() => m.patch(99, 1, { size: 1 })).toThrow(RangeError);
  });

  it('frees the old geometry when growing', () => {
    const m = createMarkers(context(), { x: [0], y: [0] });
    const old = m.geometry;
    const dispose = vi.spyOn(old, 'dispose');
    m.update({ x: [0, 1, 2], y: [0, 1, 2] });
    expect(m.geometry).not.toBe(old);
    expect(m.object.geometry).toBe(m.geometry);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(m.count).toBe(3);
  });

  it('shrinks count without reallocating', () => {
    const m = createMarkers(context(), { x: [0, 1, 2], y: [0, 1, 2] });
    const g = m.geometry;
    m.update({ x: [5], y: [5] });
    expect(m.count).toBe(1);
    expect(m.geometry).toBe(g);
    expect(m.geometry.instanceCount).toBe(1);
  });

  it('switches to colorscale mode with a shared LUT and value uniforms', () => {
    const ctx = context();
    const m = createMarkers(ctx, { x: [0, 1, 2], y: [0, 1, 2] });
    expect(m.colorscaleMode).toBe(false);
    m.update({
      colorValues: new Float64Array([1e12, 1e12 + 5, NaN]),
      colorscale: VIRIDIS_ISH,
      cmin: 1e12,
      cmax: 1e12 + 10,
      reversescale: true,
    });
    expect(m.colorscaleMode).toBe(true);
    expect('USE_COLORSCALE' in m.material.defines).toBe(true);
    expect(m.geometry.getAttribute('aFill')).toBeUndefined();
    // Values are stored relative to their own origin so large magnitudes keep precision.
    expect(items(m, 'aValue')).toEqual([-2.5, 2.5, HIDDEN]);
    const u = m.material.uniforms;
    expect([u.uCRange!.value.x, u.uCRange!.value.y]).toEqual([-2.5, 7.5]);
    expect(u.uReverse!.value).toBe(1);
    expect(u.uColorscale!.value).not.toBeNull();
    const lutKeys = () => ctx.resources.stats().filter((s) => s.key.startsWith('colorscale:'));
    expect(lutKeys()).toHaveLength(1);

    // A second set with the same colorscale shares the texture.
    const n = createMarkers(ctx, {
      x: [0],
      y: [0],
      colorValues: [1],
      colorscale: [...VIRIDIS_ISH],
    });
    expect(n.material.uniforms.uColorscale!.value).toBe(u.uColorscale!.value);
    expect(lutKeys()[0]!.refs).toBe(2);

    // cmin/cmax changes touch uniforms only.
    const version = attr(m, 'aValue').version;
    m.update({ cmin: 1e12 - 10, cmid: 1e12 });
    expect(attr(m, 'aValue').version).toBe(version);
    expect([u.uCRange!.value.x, u.uCRange!.value.y]).toEqual([-12.5, 7.5]);

    // Back to explicit colors releases the LUT reference.
    m.update({ colorValues: null });
    expect(m.colorscaleMode).toBe(false);
    expect(m.geometry.getAttribute('aValue')).toBeUndefined();
    expect(lutKeys()[0]!.refs).toBe(1);
    n.dispose();
    expect(lutKeys()).toHaveLength(0);
  });

  it('keeps previous inputs for omitted fields when the count grows', () => {
    const m = createMarkers(context(), { x: [0], y: [0], color: [0, 0, 1, 1], size: 3 });
    m.update({ x: [0, 1, 2], y: [0, 1, 2] });
    expect(items(m, 'aFill')).toEqual([0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255]);
    expect(items(m, 'aSize')).toEqual([3, 3, 3]);
  });

  it('supports 3D positions', () => {
    const m = createMarkers(context(), { x: [0, 2], y: [0, 2], z: [10, 20] });
    expect(m.origin).toEqual([1, 1, 15]);
    expect(items(m, 'aPos')).toEqual([-1, -1, -5, 1, 1, 5]);
  });

  it('updates viewport uniforms', () => {
    const m = createMarkers(context());
    m.setViewport({ width: 640, height: 400, pixelRatio: 2 });
    expect(m.material.uniforms.uResolution!.value.toArray()).toEqual([640, 400]);
    expect(m.material.uniforms.uPixelRatio!.value).toBe(2);
  });

  it('releases every resource on dispose', () => {
    const ctx = context();
    const m = createMarkers(ctx, { x: [0], y: [0], colorValues: [0], colorscale: VIRIDIS_ISH });
    expect(ctx.resources.stats().map((s) => s.key)).toContain(SYMBOL_TEXTURE_KEY);
    const geometryDispose = vi.spyOn(m.geometry, 'dispose');
    const materialDispose = vi.spyOn(m.material, 'dispose');
    m.dispose();
    m.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(ctx.resources.stats()).toEqual([]);
    expect(() => m.update({ size: 1 })).toThrow();
  });
});
