import type { DataTexture } from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import {
  CUSTOM_CODE_BASE,
  CUSTOM_IMAGE_KIND,
  customMarkersReady,
  customShader,
  isCustomSymbol,
} from './custom.ts';
import { isMask, premultiply, textures } from './custom-markers.ts';
import { MARKER_FRAGMENT, MARKER_VERTEX } from './markers.glsl.ts';
import { createMarkers } from './markers.ts';
import { createMarkerMatrix } from './matrix.ts';
import { markerDefines, normalizeSymbolCode, summarizeStyle } from './specialize.ts';
import { resolveSymbol, symbols } from './symbols.ts';

const CELL = 128;

/** A 2D context that paints a centered square for fills, images and text (no real canvas in node). */
class FakeContext {
  readonly data = new Uint8ClampedArray(CELL * CELL * 4);
  fillStyle = '';
  font = '';
  imageSmoothingQuality = 'low';
  setTransform(): void {}
  #paint(rgba: [number, number, number, number]): void {
    for (let y = 32; y < 96; y++) {
      for (let x = 32; x < 96; x++) this.data.set(rgba, (y * CELL + x) * 4);
    }
  }
  fill(): void {
    this.#paint([255, 255, 255, 255]);
  }
  fillText(): void {
    this.#paint([255, 255, 255, 255]);
  }
  drawImage(): void {
    this.#paint([200, 0, 0, 128]);
  }
  measureText(): Record<string, number> {
    return {
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 50,
      actualBoundingBoxAscent: 40,
      actualBoundingBoxDescent: 10,
    };
  }
  getImageData(): { data: Uint8ClampedArray } {
    return { data: this.data };
  }
}

class FakeCanvas {
  getContext(): FakeContext {
    return new FakeContext();
  }
}

class FakeImage {
  crossOrigin: string | null = null;
  src = '';
  naturalWidth = 10;
  naturalHeight = 20;
  decode(): Promise<void> {
    return this.src.startsWith('bad:') ? Promise.reject(new Error('404')) : Promise.resolve();
  }
}

function context() {
  const ctx = { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
  return ctx satisfies PrimitiveContext;
}

const PIN = 'M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z';
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeAll(() => {
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  vi.stubGlobal('Path2D', class {});
  vi.stubGlobal('Image', FakeImage);
});
afterAll(() => {
  vi.unstubAllGlobals();
  warn.mockRestore();
});

describe('symbols.register', () => {
  it('rejects reserved and invalid names and definitions', () => {
    for (const name of ['', 'circle', 'Diamond-Open', '102', 'pin-open', 'star-dot', 'text:x']) {
      expect(() => symbols.register(name, { path: PIN })).toThrow(TypeError);
    }
    expect(() => symbols.register('empty', { path: ' ' })).toThrow(TypeError);
    expect(() => symbols.register('nopath', {} as never)).toThrow(TypeError);
  });

  it('resolves registered names and their variants to custom codes', () => {
    expect(isCustomSymbol('t-pin')).toBe(false);
    expect(resolveSymbol('t-pin')).toBe(0);
    symbols.register('T-Pin', { path: PIN, anchor: [12, 22] });
    const code = resolveSymbol('t-pin');
    expect(code).toBeGreaterThanOrEqual(CUSTOM_CODE_BASE);
    expect((code - CUSTOM_CODE_BASE) % 8).toBe(0);
    expect(resolveSymbol(' T-PIN-open ')).toBe(code + 1);
    expect(resolveSymbol('t-pin-dot')).toBe(code + 2);
    expect(resolveSymbol('t-pin-open-dot')).toBe(code + 3);
    expect(['t-pin', 'T-PIN-OPEN', 't-pin-open-dot'].every(isCustomSymbol)).toBe(true);
    expect(isCustomSymbol('t-pins')).toBe(false);
    expect(symbols.names()).toContain('t-pin');
    // Registering again keeps the slot (charts using it redraw with the new shape).
    symbols.register('t-pin', { path: 'M0 0H24V24H0Z' });
    expect(resolveSymbol('t-pin')).toBe(code);
    // Plotly codes are unaffected.
    expect(resolveSymbol('diamond-open')).toBe(102);
    expect(resolveSymbol(1000)).toBe(0);
  });

  it('resolves text glyphs to image codes', () => {
    expect(isCustomSymbol('text:🚀')).toBe(true);
    expect(isCustomSymbol('text:')).toBe(false);
    const code = resolveSymbol('text:🚀');
    expect((code - CUSTOM_CODE_BASE) % 8).toBe(CUSTOM_IMAGE_KIND);
    expect(resolveSymbol('text:🚀')).toBe(code);
    expect(resolveSymbol('text:★')).not.toBe(code);
  });
});

describe('custom codes in the shader specialization', () => {
  it('keeps custom codes and never bakes them as a single symbol', () => {
    const code = resolveSymbol('t-pin-open');
    expect(normalizeSymbolCode(code)).toBe(code);
    const style = new Float32Array([0, code, 1, 0, 0, code, 1, 0]);
    const summary = summarizeStyle(style, 0, 2);
    expect(summary).toMatchObject({ symbol: code, anyCustom: true, anyOpen: true });
    const defines = markerDefines(summary);
    expect(defines['MARKER_SYMBOL']).toBeUndefined();
    expect(defines['NO_STROKE']).toBeUndefined();
  });
});

describe('MarkerSet with custom symbols and images', () => {
  it('waits for the SDF, then redraws with the injected shaders', async () => {
    const ctx = context();
    const m = createMarkers(ctx, { x: [0, 1], y: [0, 1], symbol: ['t-pin', 'circle'], size: 20 });
    const ready = m.ready;
    expect(ready).toBeInstanceOf(Promise);
    await ready;
    expect(ctx.invalidate).toHaveBeenCalled();
    expect(m.material.vertexShader).toBe(customShader(MARKER_VERTEX, false));
    expect(m.material.vertexShader).toContain('uCustomMeta');
    expect(m.material.fragmentShader).toContain('customSdf');
    const t = textures();
    expect(m.material.uniforms['uCustomSdf']!.value).toBe(t.sdf);
    expect(m.material.uniforms['uCustomMeta']!.value).toBe(t.meta);
    // Meta row 0 of the pin's slot: extent, cell half, ready.
    const slot = (resolveSymbol('t-pin') - CUSTOM_CODE_BASE) / 8;
    const meta = t.meta.image.data as Float32Array;
    expect(meta[slot * 4 + 2]).toBe(1);
    // The SDF cell reads inside (< 128) at the painted square and outside at the cell corner.
    const sdf = t.sdf.image.data as Uint8Array;
    const width = t.sdf.image.width;
    const x0 = (slot % 8) * CELL;
    const y0 = Math.floor(slot / 8) * CELL;
    expect(sdf[(y0 + 64) * width + x0 + 64]!).toBeLessThan(128);
    expect(sdf[y0 * width + x0]!).toBe(255);
    m.dispose();
  });

  it('builtin-only sets keep the plain shaders and resolve ready at once', async () => {
    const m = createMarkers(context(), { x: [0], y: [0], symbol: 'square' });
    expect(m.material.vertexShader).toBe(MARKER_VERTEX);
    expect(m.material.fragmentShader).toBe(MARKER_FRAGMENT);
    await expect(m.ready).resolves.toBeUndefined();
    m.dispose();
  });

  it('draws images instead of symbols and fills the image atlas premultiplied', async () => {
    const ctx = context();
    const url = 'data:image/png;base64,AAAA';
    const m = createMarkers(ctx, {
      x: [0, 1, 2],
      y: [0, 1, 2],
      symbol: 'square',
      image: [url, '', url],
    });
    const style = m.geometry.getAttribute('aStyle').array as Float32Array;
    const code = style[1]!;
    expect((code - CUSTOM_CODE_BASE) % 8).toBe(CUSTOM_IMAGE_KIND);
    expect(style[5]).toBe(1); // no image: the symbol
    expect(style[9]).toBe(code);
    await m.ready;
    const slot = (code - CUSTOM_CODE_BASE - CUSTOM_IMAGE_KIND) / 8;
    const t = textures();
    const meta = t.meta.image.data as Float32Array;
    expect(meta[(256 + slot) * 4 + 2]).toBe(1);
    expect(meta[(256 + slot) * 4 + 3]).toBe(0); // a color image, not a tinted mask
    const images = t.images.image.data as Uint8Array;
    const width = t.images.image.width;
    const k = ((Math.floor(slot / 8) * CELL + 64) * width + (slot % 8) * CELL + 64) * 4;
    expect(Array.from(images.subarray(k, k + 4))).toEqual([100, 0, 0, 128]);
    expect(m.material.uniforms['uCustomImages']!.value).toBe(t.images);
    m.dispose();
  });

  it('flags monochrome text glyphs as tinted masks', async () => {
    const m = createMarkers(context(), { x: [0], y: [0], symbol: 'text:★' });
    await m.ready;
    const code = resolveSymbol('text:★');
    const slot = (code - CUSTOM_CODE_BASE - CUSTOM_IMAGE_KIND) / 8;
    const meta = (textures().meta as DataTexture).image.data as Float32Array;
    expect(meta[(256 + slot) * 4 + 3]).toBe(1);
    m.dispose();
  });

  it('resolves ready even when an image fails to load', async () => {
    const m = createMarkers(context(), { x: [0], y: [0], image: 'bad:missing.png' });
    await expect(m.ready).resolves.toBeUndefined();
    await expect(customMarkersReady()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    m.dispose();
  });

  it('shares custom symbols with scatter-matrix cells', async () => {
    const matrix = createMarkerMatrix(
      context(),
      [
        [0, 1],
        [1, 2],
      ],
      { symbol: 't-pin-open' },
    );
    const cell = matrix.createCell(0, 1);
    await cell.ready;
    cell.relink(); // what every render does first
    expect(cell.material.vertexShader).toContain('uCustomMeta');
    expect(cell.material.vertexShader).toContain('in float aX;');
    expect(cell.material.fragmentShader).toContain('customSdf');
    matrix.dispose();
  });
});

describe('image pixels', () => {
  it('premultiplies alpha and detects single-colored masks', () => {
    const px = new Uint8ClampedArray([255, 128, 0, 128, 10, 20, 30, 0]);
    premultiply(px);
    expect(Array.from(px)).toEqual([128, 64, 0, 128, 0, 0, 0, 0]);
    expect(isMask([255, 255, 255, 200, 0, 0, 0, 0])).toBe(true);
    expect(isMask([255, 40, 40, 200])).toBe(false);
    expect(isMask([0, 0, 0, 0])).toBe(false);
  });
});
