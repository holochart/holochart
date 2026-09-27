import { describe, expect, it } from 'vitest';
import { DoubleSide, LinearFilter, NearestFilter, type DataTexture, type Vector3 } from 'three';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { UNIT_QUAD_KEY } from './common.ts';
import {
  createRasterPrimitive,
  premultiplyPixels,
  RASTER_FRAGMENT_SHADER,
  RASTER_VERTEX_SHADER,
  type RasterPixels,
} from './raster.ts';

function context(): PrimitiveContext & { invalidations: number } {
  const ctx = {
    resources: createResourceManager(),
    invalidations: 0,
    invalidate() {
      ctx.invalidations++;
    },
  };
  return ctx;
}

/** 2 × 1 pixels: opaque red, half-transparent white. */
const PIXELS: RasterPixels = { data: [255, 0, 0, 255, 255, 255, 255, 128], width: 2, height: 1 };

const texture = (r: ReturnType<typeof createRasterPrimitive>) =>
  r.uniforms.uTex.value as DataTexture;
const vec3 = (v: unknown) => (v as Vector3).toArray();

describe('premultiplyPixels', () => {
  it('multiplies color by alpha and pads missing pixels transparent', () => {
    expect([...premultiplyPixels(PIXELS)]).toEqual([255, 0, 0, 255, 128, 128, 128, 128]);
    expect([...premultiplyPixels({ data: [1, 2, 3, 255], width: 2, height: 1 })]).toEqual([
      1, 2, 3, 255, 0, 0, 0, 0,
    ]);
  });
});

describe('RasterPrimitive', () => {
  it('draws one double-sided quad from (x0, y0) to (x1, y1) with an RGBA8 texture', () => {
    const ctx = context();
    const r = createRasterPrimitive(ctx, { pixels: PIXELS, x0: 10, x1: 12, y0: 5, y1: 4 });
    expect(r.object.visible).toBe(true);
    expect(r.object.material.side).toBe(DoubleSide);
    expect(ctx.resources.stats()).toEqual([{ key: UNIT_QUAD_KEY, kind: 'geometry', refs: 1 }]);
    expect(r.uniforms.uSize.value.toArray()).toEqual([2, -1]);
    // RTC: the origin is (x0, y0).
    expect(vec3(r.uniforms.uOffset.value)).toEqual([10, 5, 0]);
    const t = texture(r);
    expect([t.image.width, t.image.height, t.flipY]).toEqual([2, 1, false]);
    expect([...(t.image.data as Uint8Array)]).toEqual([255, 0, 0, 255, 128, 128, 128, 128]);
    expect(t.magFilter).toBe(NearestFilter);
    r.dispose();
    expect(ctx.resources.stats()).toEqual([]);
  });

  it('declares every shader uniform in the material', () => {
    const r = createRasterPrimitive(context(), { pixels: PIXELS, x0: 0, x1: 1, y0: 0, y1: 1 });
    const names = [
      ...`${RASTER_VERTEX_SHADER}\n${RASTER_FRAGMENT_SHADER}`.matchAll(
        /^\s*uniform\s+(?:highp\s+)?\w+\s+(\w+);/gm,
      ),
    ].map((m) => m[1]!);
    for (const name of names) expect(r.object.material.uniforms, name).toHaveProperty(name);
    r.dispose();
  });

  it('switches filtering and opacity in place, and reuses the texture for same-size pixels', () => {
    const r = createRasterPrimitive(context(), { pixels: PIXELS, x0: 0, x1: 1, y0: 0, y1: 1 });
    const t = texture(r);
    r.update({ smoothing: true, opacity: 0.25 });
    expect([t.magFilter, t.minFilter]).toEqual([LinearFilter, LinearFilter]);
    expect(r.uniforms.uOpacity.value).toBe(0.25);
    r.update({ pixels: { data: [0, 0, 255, 255, 0, 0, 0, 0], width: 2, height: 1 } });
    expect(texture(r)).toBe(t);
    expect([...(t.image.data as Uint8Array)].slice(0, 4)).toEqual([0, 0, 255, 255]);
    r.update({ pixels: { data: [], width: 0, height: 0 } });
    expect(r.object.visible).toBe(false);
    r.dispose();
  });

  it('setTransform only writes uniforms; empty or degenerate boxes hide it', () => {
    const r = createRasterPrimitive(context(), { pixels: PIXELS, x0: 1, x1: 3, y0: 0, y1: 1 });
    const version = texture(r).version;
    r.setTransform({ scaleX: 2, scaleY: -3, offsetX: 10, offsetY: 20 });
    expect(vec3(r.uniforms.uOffset.value)).toEqual([12, 20, 0]);
    expect(texture(r).version).toBe(version);
    r.update({ x1: 1 });
    expect(r.object.visible).toBe(false);
    r.dispose();
  });

  it('loads pixels that arrive later; ready waits for them', async () => {
    const ctx = context();
    const r = createRasterPrimitive(ctx, { pixels: PIXELS, x0: 0, x1: 1, y0: 0, y1: 1 });
    r.load(Promise.resolve({ data: [9, 9, 9, 255], width: 1, height: 1 }));
    await r.ready;
    expect(r.current.pixels.width).toBe(1);
    r.load(Promise.reject(new Error('decode failed')));
    await r.ready;
    expect(r.current.pixels.width).toBe(1);
    // A load finishing after dispose is dropped.
    let resolve!: (p: RasterPixels) => void;
    r.load(new Promise((res) => (resolve = res)));
    r.dispose();
    resolve(PIXELS);
    await r.ready;
    expect(r.current.pixels.width).toBe(1);
  });
});
