import { describe, expect, it, vi } from 'vitest';
import type { BufferAttribute } from 'three';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { UNIT_QUAD_KEY } from './common.ts';
import { createImagePrimitive, fitImage, type ImageSourceLike } from './image.ts';

const fake = (width: number, height: number) => ({ width, height }) as unknown as ImageSourceLike;

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

/** A loader whose loads are settled by hand. */
function deferredLoader() {
  const calls: {
    source: string;
    resolve(v: ImageSourceLike): void;
    reject(e: unknown): void;
  }[] = [];
  const load = vi.fn(
    (source: string) =>
      new Promise<ImageSourceLike>((resolve, reject) => calls.push({ source, resolve, reject })),
  );
  return { load, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('fitImage', () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 200 }; // portrait box

  it('contains a landscape image in a portrait box, aligned vertically', () => {
    const natural = { width: 200, height: 100 };
    expect(fitImage(box, natural, 'contain', 0.5, 0.5)).toEqual({
      rect: [0, 75, 100, 125],
      uv: [0, 0, 1, 1],
    });
    // alignY 0 = top = max world y.
    expect(fitImage(box, natural, 'contain', 0.5, 0)?.rect).toEqual([0, 150, 100, 200]);
    expect(fitImage(box, natural, 'contain', 0.5, 1)?.rect).toEqual([0, 0, 100, 50]);
  });

  it('contains a portrait image in a landscape box, aligned horizontally', () => {
    const land = { x0: 0, y0: 0, x1: 200, y1: 100 };
    const natural = { width: 50, height: 100 };
    expect(fitImage(land, natural, 'contain', 0.5, 0.5)?.rect).toEqual([75, 0, 125, 100]);
    expect(fitImage(land, natural, 'contain', 0, 0.5)?.rect).toEqual([0, 0, 50, 100]);
    expect(fitImage(land, natural, 'contain', 1, 0.5)?.rect).toEqual([150, 0, 200, 100]);
  });

  it('covers by cropping the uv rect according to alignment', () => {
    const land = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const natural = { width: 200, height: 100 }; // half the width is visible
    expect(fitImage(land, natural, 'cover', 0, 0.5)).toEqual({
      rect: [0, 0, 100, 100],
      uv: [0, 0, 0.5, 1],
    });
    expect(fitImage(land, natural, 'cover', 0.5, 0.5)?.uv).toEqual([0.25, 0, 0.75, 1]);
    expect(fitImage(land, natural, 'cover', 1, 0.5)?.uv).toEqual([0.5, 0, 1, 1]);
    // Tall image: alignY 0 keeps the image top (v = 1).
    const tall = { width: 100, height: 400 };
    expect(fitImage(land, tall, 'cover', 0.5, 0)?.uv).toEqual([0, 0.75, 1, 1]);
    expect(fitImage(land, tall, 'cover', 0.5, 1)?.uv).toEqual([0, 0, 1, 0.25]);
  });

  it('stretches to the box with the full uv rect', () => {
    expect(fitImage(box, { width: 7, height: 3 }, 'stretch', 0, 0)).toEqual({
      rect: [0, 0, 100, 200],
      uv: [0, 0, 1, 1],
    });
  });

  it('normalizes reversed box corners', () => {
    const reversed = { x0: 100, y0: 200, x1: 0, y1: 0 };
    expect(fitImage(reversed, { width: 1, height: 1 }, 'stretch', 0.5, 0.5)?.rect).toEqual([
      0, 0, 100, 200,
    ]);
  });

  it('returns undefined for degenerate boxes or natural sizes', () => {
    const one = { width: 1, height: 1 };
    expect(fitImage({ x0: 0, y0: 0, x1: 0, y1: 10 }, one, 'contain', 0.5, 0.5)).toBeUndefined();
    expect(fitImage({ x0: 0, y0: 0, x1: NaN, y1: 10 }, one, 'contain', 0.5, 0.5)).toBeUndefined();
    expect(fitImage(box, { width: 0, height: 5 }, 'cover', 0.5, 0.5)).toBeUndefined();
  });
});

describe('ImagePrimitive', () => {
  const data = { x0: 0, y0: 0, x1: 10, y1: 10 };

  it('loads a URL: status, visibility and ready', async () => {
    const ctx = context();
    const { load, calls } = deferredLoader();
    const image = createImagePrimitive(ctx, { ...data, source: 'a.png' }, { load });
    expect(image.status).toBe('loading');
    expect(image.object.visible).toBe(false);
    expect(image.object.frustumCulled).toBe(false);
    let ready = false;
    void image.ready.then(() => (ready = true));
    await flush();
    expect(ready).toBe(false);
    calls[0]!.resolve(fake(20, 10));
    await image.ready;
    expect(image.status).toBe('loaded');
    expect(image.object.visible).toBe(true);
    expect([image.naturalWidth, image.naturalHeight]).toEqual([20, 10]);
    expect(ctx.invalidations).toBeGreaterThan(0);
    image.dispose();
  });

  it('draws decoded sources immediately and moves the quad on setTransform via uniforms only', async () => {
    const ctx = context();
    const image = createImagePrimitive(ctx, { ...data, source: fake(10, 10), fit: 'stretch' });
    await image.ready;
    expect(image.status).toBe('loaded');
    const material = image.object.material;
    const rect = material.uniforms.uRect!.value as { toArray(): number[] };
    expect(rect.toArray()).toEqual([0, 0, 10, 10]);
    const geometry = image.object.geometry;
    const version = (geometry.getAttribute('position') as BufferAttribute).version;
    image.setTransform({ scaleX: 2, scaleY: -3, offsetX: 5, offsetY: 100 });
    expect(rect.toArray()).toEqual([5, 70, 25, 100]);
    expect(image.object.geometry).toBe(geometry);
    expect((geometry.getAttribute('position') as BufferAttribute).version).toBe(version);
    image.update({ opacity: 0.25 });
    expect(material.uniforms.uOpacity!.value).toBe(0.25);
    image.dispose();
  });

  it('warns once per source across primitives on failure and still resolves ready', async () => {
    const warn = vi.fn();
    const load = () => Promise.reject(new Error('404'));
    const a = createImagePrimitive(context(), { ...data, source: 'missing.png' }, { load, warn });
    const b = createImagePrimitive(context(), { ...data, source: 'missing.png' }, { load, warn });
    await Promise.all([a.ready, b.ready]);
    expect(a.status).toBe('error');
    expect(b.status).toBe('error');
    expect(a.object.visible).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe('[holochart] image failed to load: missing.png');
  });

  it('ignores a superseded source whose load finishes late', async () => {
    const ctx = context();
    const { load, calls } = deferredLoader();
    const image = createImagePrimitive(ctx, { ...data, source: 'old.png' }, { load });
    image.update({ source: 'new.png' });
    expect(calls.map((c) => c.source)).toEqual(['old.png', 'new.png']);
    calls[1]!.resolve(fake(4, 2));
    await image.ready;
    const texture = image.object.material.uniforms.uTex!.value as unknown;
    calls[0]!.resolve(fake(8, 8));
    await flush();
    expect(image.object.material.uniforms.uTex!.value).toBe(texture);
    expect([image.naturalWidth, image.naturalHeight]).toEqual([4, 2]);
    // Same source again: no reload.
    image.update({ source: 'new.png', x1: 20 });
    expect(calls).toHaveLength(2);
    image.dispose();
  });

  it('disposes before load completes without drawing or leaking', async () => {
    const ctx = context();
    const { load, calls } = deferredLoader();
    const image = createImagePrimitive(ctx, { ...data, source: 'slow.png' }, { load });
    expect(ctx.resources.stats().find((s) => s.key === UNIT_QUAD_KEY)?.refs).toBe(1);
    image.dispose();
    image.dispose();
    expect(ctx.resources.stats()).toEqual([]);
    calls[0]!.resolve(fake(10, 10));
    await image.ready;
    expect(image.object.material.uniforms.uTex!.value).toBeNull();
    expect(image.object.visible).toBe(false);
  });
});
