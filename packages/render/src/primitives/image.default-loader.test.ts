import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { createImagePrimitive, type ImageSourceLike } from './image.ts';

function context() {
  const ctx = { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
  return ctx satisfies PrimitiveContext;
}

/** What the default loader uses of `HTMLImageElement`; decoding fails for `bad:` sources. */
class FakeImage {
  static instances: FakeImage[] = [];
  crossOrigin: string | null = null;
  src = '';
  // The CSS size of an <img> can differ from the bitmap's.
  width = 300;
  height = 150;
  naturalWidth = 40;
  naturalHeight = 10;
  constructor() {
    FakeImage.instances.push(this);
  }
  decode(): Promise<void> {
    return this.src.startsWith('bad:') ? Promise.reject(new Error('decode')) : Promise.resolve();
  }
}

const BOX = { x0: 0, y0: 0, x1: 100, y1: 100 };
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal('Image', FakeImage);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ImagePrimitive default loader', () => {
  it('decodes a URL with CORS enabled and fits the bitmap by its natural size', async () => {
    const image = createImagePrimitive(context(), {
      ...BOX,
      source: 'https://example.test/logo.png',
    });
    expect(image.status).toBe('loading');
    await image.ready;
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe('https://example.test/logo.png');
    // Without it a cross-origin image could not be uploaded as a texture.
    expect(FakeImage.instances[0]!.crossOrigin).toBe('anonymous');
    expect(image.status).toBe('loaded');
    expect([image.naturalWidth, image.naturalHeight]).toEqual([40, 10]);
    expect(image.object.material.uniforms.uTex!.value.image).toBe(FakeImage.instances[0]);
    // 4:1 contained in a 100 × 100 box, centered: 100 × 25.
    const rect = image.object.material.uniforms.uRect!.value as { toArray(): number[] };
    expect(rect.toArray()).toEqual([0, 37.5, 100, 62.5]);
    image.dispose();
  });

  it('leaves crossOrigin alone for data: and blob: URLs', async () => {
    const sources = ['data:image/png;base64,AAAA', 'BLOB:https://example.test/1234'];
    for (const source of sources) {
      const image = createImagePrimitive(context(), { ...BOX, source });
      await image.ready;
      expect(image.status).toBe('loaded');
      image.dispose();
    }
    expect(FakeImage.instances.map((i) => i.crossOrigin)).toEqual([null, null]);
  });

  it('warns on the console when the image cannot be decoded, and draws nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const image = createImagePrimitive(context(), { ...BOX, source: 'bad:default-warn.png' });
    await image.ready;
    expect(image.status).toBe('error');
    expect(image.object.visible).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[holochart] image failed to load: bad:default-warn.png');
    image.dispose();
  });
});

describe('ImagePrimitive source changes', () => {
  it('ignores the failure of a source that was replaced meanwhile', async () => {
    const warn = vi.fn();
    const rejects: ((e: unknown) => void)[] = [];
    const load = (source: string) =>
      source === 'old.png'
        ? new Promise<ImageSourceLike>((_, reject) => rejects.push(reject))
        : Promise.resolve({ width: 8, height: 4 } as unknown as ImageSourceLike);
    const image = createImagePrimitive(context(), { ...BOX, source: 'old.png' }, { load, warn });
    image.update({ source: 'new.png' });
    await image.ready;
    expect(image.status).toBe('loaded');

    rejects[0]!(new Error('404'));
    await flush();

    expect(image.status).toBe('loaded');
    expect(image.object.visible).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    image.dispose();
  });

  it('takes the size of a decoded bitmap from width and height', async () => {
    const image = createImagePrimitive(context(), {
      ...BOX,
      source: { width: 64, height: 32 } as unknown as ImageSourceLike,
    });
    await image.ready;
    expect([image.naturalWidth, image.naturalHeight]).toEqual([64, 32]);
    image.dispose();
  });

  it('ignores updates after dispose', async () => {
    const ctx = context();
    const load = vi.fn(() =>
      Promise.resolve({ width: 8, height: 4 } as unknown as ImageSourceLike),
    );
    const image = createImagePrimitive(ctx, { ...BOX, source: 'a.png', opacity: 0.5 }, { load });
    await image.ready;
    image.dispose();
    ctx.invalidate.mockClear();

    image.update({ source: 'b.png', opacity: 1 });

    expect(load).toHaveBeenCalledTimes(1);
    expect(image.object.material.uniforms.uOpacity!.value).toBe(0.5);
    expect(ctx.invalidate).not.toHaveBeenCalled();
    expect(ctx.resources.stats()).toEqual([]);
  });
});
