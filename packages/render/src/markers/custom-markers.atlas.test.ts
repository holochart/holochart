import type { IUniform, Texture } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attach,
  customShader,
  setImage,
  setSymbol,
  setText,
  textures,
  type CustomMarkerUniforms,
} from './custom-markers.ts';

const CELL = 128;
const COLUMNS = 8;
const META_WIDTH = 256;

/** A 2D context that paints a centered square for fills (no real canvas in node), as in custom.test.ts. */
class FakeContext {
  readonly data = new Uint8ClampedArray(CELL * CELL * 4);
  fillStyle = '';
  font = '';
  imageSmoothingQuality = 'low';
  ink = { left: 0, right: 50, ascent: 40, descent: 10 };
  setTransform(): void {}
  #paint(): void {
    for (let y = 32; y < 96; y++) {
      for (let x = 32; x < 96; x++) this.data.set([255, 255, 255, 255], (y * CELL + x) * 4);
    }
  }
  fill(): void {
    this.#paint();
  }
  fillText(): void {
    this.#paint();
  }
  drawImage(): void {
    this.#paint();
  }
  measureText(text: string): Record<string, number> {
    const blank = text.trim() === '';
    return {
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: blank ? 0 : 50,
      actualBoundingBoxAscent: blank ? 0 : 40,
      actualBoundingBoxDescent: blank ? 0 : 10,
    };
  }
  getImageData(): { data: Uint8ClampedArray } {
    return { data: this.data };
  }
}

class FakeCanvas {
  width: number;
  height: number;
  constructor(width = 0, height = 0) {
    this.width = width;
    this.height = height;
  }
  getContext(): FakeContext | null {
    return new FakeContext();
  }
}

class FakeImage {
  static size: [number, number] = [10, 20];
  crossOrigin: string | null = null;
  src = '';
  naturalWidth = FakeImage.size[0];
  naturalHeight = FakeImage.size[1];
  decode(): Promise<void> {
    return Promise.resolve();
  }
}

const SQUARE_PATH = 'M0 0H24V24H0Z';

function uniforms(): CustomMarkerUniforms {
  const u = (): IUniform<Texture | null> => ({ value: null });
  return { uCustomSdf: u(), uCustomImages: u(), uCustomMeta: u() };
}

/** `(x, cellHalf, ready, tint)` of an SDF slot (row 0) or image slot (row 1) in the meta table. */
function meta(row: 0 | 1, slot: number): number[] {
  const data = textures().meta.image.data as Float32Array;
  const k = (row * META_WIDTH + slot) * 4;
  return Array.from(data.subarray(k, k + 4));
}

/** The SDF byte at pixel `(x, y)` of slot `slot`'s cell. */
function sdfAt(slot: number, x: number, y: number): number {
  const { sdf } = textures();
  const data = sdf.image.data as Uint8Array;
  const x0 = (slot % COLUMNS) * CELL;
  const y0 = Math.floor(slot / COLUMNS) * CELL;
  return data[(y0 + y) * sdf.image.width + x0 + x]!;
}

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  vi.stubGlobal('Path2D', class {});
  vi.stubGlobal('Image', FakeImage);
  FakeImage.size = [10, 20];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('custom marker atlases', () => {
  it('grows the SDF atlas into a new texture that keeps the old cells, and re-points attached materials', () => {
    const u = uniforms();
    const changed = vi.fn();
    const detach = attach(u, changed);
    expect(changed).toHaveBeenCalledTimes(1);
    setSymbol(0, { path: SQUARE_PATH });
    const small = textures().sdf;
    expect([small.image.width, small.image.height]).toEqual([COLUMNS * CELL, CELL]);
    expect(u.uCustomSdf.value).toBe(small);
    const disposed = vi.fn();
    small.addEventListener('dispose', disposed);
    changed.mockClear();

    // Slot 8 is the first cell of a second row.
    setSymbol(8, { path: SQUARE_PATH });

    const grown = textures().sdf;
    expect(grown).not.toBe(small);
    expect([grown.image.width, grown.image.height]).toEqual([COLUMNS * CELL, 2 * CELL]);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(u.uCustomSdf.value).toBe(grown);
    expect(changed).toHaveBeenCalledTimes(1);
    // Both cells read inside at the painted square and far outside at their corner.
    for (const slot of [0, 8]) {
      expect(sdfAt(slot, 64, 64)).toBeLessThan(128);
      expect(sdfAt(slot, 0, 0)).toBe(255);
      expect(meta(0, slot)[2]).toBe(1);
    }
    // A cell nothing was drawn into reads far outside everywhere.
    expect(sdfAt(9, 64, 64)).toBe(255);
    expect(meta(0, 9)[2]).toBe(0);

    // Room for slot 9 already: the texture stays.
    setSymbol(9, { path: SQUARE_PATH });
    expect(textures().sdf).toBe(grown);

    detach();
    changed.mockClear();
    setSymbol(1, { path: SQUARE_PATH });
    expect(changed).not.toHaveBeenCalled();
  });

  it('records where the symbol sits in its cell: the viewBox extent around the anchor', () => {
    // Centered anchor: the larger viewBox side spans ±1 radius; the cell adds the SDF spread (0.75).
    setSymbol(2, { path: SQUARE_PATH, viewBox: '0 0 24 12' });
    expect(meta(0, 2)).toEqual([1, 1.75, 1, 0]);
    // Anchored at a corner: the far corner is 2 radii away.
    setSymbol(3, { path: SQUARE_PATH, viewBox: [0, 0, 24, 24], anchor: [0, 24] });
    expect(meta(0, 3)).toEqual([2, 2.75, 1, 0]);
  });

  it('rejects an invalid viewBox and leaves the slot hidden', () => {
    for (const viewBox of ['0 0 24', '0 0 0 24', 'a b c d'] as const) {
      expect(() => setSymbol(20, { path: SQUARE_PATH, viewBox })).toThrow(TypeError);
    }
    expect(() => setSymbol(20, { path: SQUARE_PATH, viewBox: [0, 0, 24, -1] })).toThrow(
      'invalid viewBox 0,0,24,-1',
    );
    expect(meta(0, 20)[2]).toBe(0);
  });

  it('fails without a 2D canvas and leaves the slot hidden', () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext(): null {
          return null;
        }
      },
    );
    expect(() => setSymbol(21, { path: SQUARE_PATH })).toThrow('no 2D canvas context');
    expect(meta(0, 21)[2]).toBe(0);
  });

  it('rasterizes on a DOM canvas of the cell size where OffscreenCanvas is missing', () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const created: FakeCanvas[] = [];
    vi.stubGlobal('document', {
      createElement(tag: string) {
        expect(tag).toBe('canvas');
        const canvas = new FakeCanvas();
        created.push(canvas);
        return canvas;
      },
    });
    setSymbol(22, { path: SQUARE_PATH });
    expect(created).toHaveLength(1);
    expect([created[0]!.width, created[0]!.height]).toEqual([CELL, CELL]);
    expect(meta(0, 22)[2]).toBe(1);
    expect(sdfAt(22, 64, 64)).toBeLessThan(128);
  });
});

describe('custom marker images', () => {
  it('stores a decoded image as an untinted, ready slot', async () => {
    await setImage(0, 'https://example.test/pin.png');
    // (1, cell half in radius units = 128 / (128 − 2 × 8 px gutter), ready, tint)
    const [extent, cellHalf, ready, tint] = meta(1, 0);
    expect(extent).toBe(1);
    expect(cellHalf).toBeCloseTo(128 / 112, 6);
    expect(ready).toBe(1);
    expect(tint).toBe(0);
  });

  it('rejects an image without pixels and leaves the slot hidden', async () => {
    FakeImage.size = [0, 20];
    await expect(setImage(5, 'https://example.test/empty.png')).rejects.toThrow('is empty');
    FakeImage.size = [10, 0];
    await expect(setImage(5, 'https://example.test/empty.png')).rejects.toThrow('is empty');
    expect(meta(1, 5)[2]).toBe(0);
  });

  it('draws a text glyph as a tinted mask, and rejects one without ink', async () => {
    await setImage(6, 'text:★');
    expect(meta(1, 6).slice(2)).toEqual([1, 1]);
    expect(() => setText(7, ' ')).toThrow('has no ink');
    await expect(setImage(7, 'text: ')).rejects.toThrow('has no ink');
    expect(meta(1, 7)[2]).toBe(0);
  });
});

describe('customShader', () => {
  it('replaces the hook lines it has code for, keeping their indentation', () => {
    const source = [
      'void main() {',
      '  int code = 0; // before',
      '    // @custom-decode',
      '  // @custom-nosuchhook stays',
      '}',
    ].join('\n');
    const out = customShader(source, false).split('\n');
    expect(out[0]).toBe('void main() {');
    expect(out[1]).toBe('  int code = 0; // before');
    expect(out[2]).toBe('    int cSlot = -1;');
    expect(out.join('\n')).toContain('if (code >= 1000) {');
    expect(out.at(-2)).toBe('  // @custom-nosuchhook stays');
    expect(out.at(-1)).toBe('}');
    // The same hook names carry other code in the fragment shader.
    const fragment = customShader('// @custom-area', true);
    expect(fragment).toBe('if (areaKind == 3) dArea = customSdf(p, vCustomSlot, vShape.w) * r;');
    expect(customShader('no hooks here', true)).toBe('no hooks here');
  });
});
