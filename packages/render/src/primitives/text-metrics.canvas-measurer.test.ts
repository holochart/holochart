import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FONT_CSS_FAMILY, clearFontRegistry, setDefaultFontURL } from './text-fonts.ts';
import {
  createCanvasTextMeasurer,
  createFontMetricsOracle,
  getDefaultFontMetricsOracle,
  setDefaultFontMetricsOracle,
} from './text-metrics.ts';

/**
 * The canvas measurer (browsers). Node has no canvas, so `OffscreenCanvas` / `document` are
 * replaced by stand-ins exposing only what the measurer uses of the canvas 2D API: the `font`
 * property and `measureText`. The fake measures 0.5 em per character at whatever size `font` says,
 * so a width tells which size the measurer asked for.
 */
interface FakeMetrics {
  width: number;
  fontBoundingBoxAscent?: number;
  fontBoundingBoxDescent?: number;
}

function fakeContext(
  vertical: { ascent?: number; descent?: number } = { ascent: 90, descent: 21 },
) {
  const state = {
    /** Every assignment to `ctx.font`, in order. */
    fonts: [] as string[],
    /** Every measured string. */
    measured: [] as string[],
  };
  let font = '10px sans-serif';
  const ctx = {
    get font(): string {
      return font;
    },
    set font(value: string) {
      state.fonts.push(value);
      font = value;
    },
    measureText(text: string): FakeMetrics {
      state.measured.push(text);
      const px = Number(/(\d+)px/.exec(font)?.[1]);
      const out: FakeMetrics = { width: text.length * 0.5 * px };
      if (vertical.ascent !== undefined) out.fontBoundingBoxAscent = vertical.ascent;
      if (vertical.descent !== undefined) out.fontBoundingBoxDescent = vertical.descent;
      return out;
    },
  };
  return { ctx, state };
}

/** Install an `OffscreenCanvas` whose 2D context is `ctx` (or whatever `getContext` returns). */
function stubOffscreenCanvas(getContext: (kind: string) => unknown) {
  const sizes: [number, number][] = [];
  class FakeOffscreenCanvas {
    constructor(width: number, height: number) {
      sizes.push([width, height]);
    }
    getContext(kind: string): unknown {
      return getContext(kind);
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  return sizes;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setDefaultFontMetricsOracle(null);
  setDefaultFontURL(null);
  clearFontRegistry();
});

describe('createCanvasTextMeasurer', () => {
  it('measures with the CSS font of the face at a reference size, and returns 1 px widths', () => {
    const { ctx, state } = fakeContext();
    stubOffscreenCanvas((kind) => (kind === '2d' ? ctx : null));
    const m = createCanvasTextMeasurer();
    expect(m?.kind).toBe('canvas');
    // 4 characters × 0.5 em: 2 em, i.e. 2 px at a font size of 1 px, whatever the reference size.
    expect(
      m!.width('abcd', { family: 'Open Sans, sans-serif', weight: 'bold', style: 'italic' }),
    ).toBe(2);
    expect(state.fonts).toEqual(['italic 700 100px "Open Sans", sans-serif']);
    expect(state.measured).toEqual(['abcd']);
  });

  it('sets the canvas font only when the face changes', () => {
    const { ctx, state } = fakeContext();
    stubOffscreenCanvas(() => ctx);
    const m = createCanvasTextMeasurer()!;
    const inter = { family: 'Inter' };
    m.width('a', inter);
    m.width('b', inter);
    m.vertical(inter);
    m.width('c', { family: 'Inter', weight: 700 });
    m.width('d', inter);
    expect(state.fonts).toEqual([
      'normal 400 100px "Inter"',
      'normal 700 100px "Inter"',
      'normal 400 100px "Inter"',
    ]);
  });

  it("reports the font's line metrics as fractions of the font size", () => {
    const { ctx } = fakeContext({ ascent: 90, descent: 21 });
    stubOffscreenCanvas(() => ctx);
    expect(createCanvasTextMeasurer()!.vertical({ family: 'Inter' })).toEqual({
      ascent: 0.9,
      descent: 0.21,
    });
  });

  it('never reports a negative descent', () => {
    const { ctx } = fakeContext({ ascent: 80, descent: -5 });
    stubOffscreenCanvas(() => ctx);
    expect(createCanvasTextMeasurer()!.vertical({ family: 'Inter' })).toEqual({
      ascent: 0.8,
      descent: 0,
    });
  });

  it('falls back to Arial-like ratios where the browser reports no usable line metrics', () => {
    const arial = { ascent: 0.905, descent: 0.212 };
    // No fontBoundingBox* at all (older browsers), only one of them, or a zero ascent.
    for (const vertical of [{}, { ascent: 90 }, { descent: 21 }, { ascent: 0, descent: 21 }]) {
      const { ctx } = fakeContext(vertical);
      stubOffscreenCanvas(() => ctx);
      expect(createCanvasTextMeasurer()!.vertical({ family: 'Inter' })).toEqual(arial);
    }
  });

  it('uses a detached <canvas> where OffscreenCanvas is unavailable', () => {
    const { ctx, state } = fakeContext();
    const createElement = vi.fn((_tag: string) => ({
      getContext: (kind: string) => (kind === '2d' ? ctx : null),
    }));
    vi.stubGlobal('document', { createElement });
    const m = createCanvasTextMeasurer();
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(createElement).toHaveBeenCalledWith('canvas');
    expect(m!.width('ab', { family: 'serif' })).toBe(1);
    expect(state.fonts).toEqual(['normal 400 100px serif']);
  });

  it('is null when no 2D context can be had', () => {
    // No context for '2d' (e.g. jsdom without the canvas package).
    stubOffscreenCanvas(() => null);
    expect(createCanvasTextMeasurer()).toBeNull();
    // Creating the context throws.
    stubOffscreenCanvas(() => {
      throw new Error('2d contexts are disabled');
    });
    expect(createCanvasTextMeasurer()).toBeNull();
    // A context that cannot measure text.
    stubOffscreenCanvas(() => ({ font: '' }));
    expect(createCanvasTextMeasurer()).toBeNull();
    // A document whose canvas has no 2D context.
    vi.unstubAllGlobals();
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    expect(createCanvasTextMeasurer()).toBeNull();
  });
});

describe('oracle on a canvas', () => {
  it('picks the canvas measurer by default and measures with the font that is drawn', () => {
    const { ctx, state } = fakeContext();
    stubOffscreenCanvas(() => ctx);
    // Every unregistered family is drawn with the app's default font file, at 400 / upright.
    setDefaultFontURL('/fonts/app.woff');
    const oracle = createFontMetricsOracle();
    expect(oracle.measurer.kind).toBe('canvas');
    // 0.5 em per character: 3 characters at 20 px are 30 px wide.
    expect(oracle.measureWidth('abc', { family: 'Inter', size: 20, weight: 'bold' })).toBe(30);
    expect(state.fonts).toEqual([`normal 400 100px "${DEFAULT_FONT_CSS_FAMILY}", "Inter"`]);
    const m = oracle.measureText('abc', { family: 'Inter', size: 20 });
    expect(m.ascent).toBeCloseTo(18);
    expect(m.descent).toBeCloseTo(4.2);
  });

  it('the default oracle drops its measurements when the document finishes loading fonts', () => {
    const { ctx, state } = fakeContext();
    stubOffscreenCanvas(() => ctx);
    const listeners = new Map<string, () => void>();
    const fonts = {
      addEventListener: vi.fn((type: string, listener: () => void) =>
        listeners.set(type, listener),
      ),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        if (listeners.get(type) === listener) listeners.delete(type);
      }),
    };
    vi.stubGlobal('document', { fonts });
    setDefaultFontURL('/fonts/app.woff');

    const oracle = getDefaultFontMetricsOracle();
    expect(oracle.measurer.kind).toBe('canvas');
    const font = { family: 'Inter', size: 10 };
    oracle.measureWidth('abc', font);
    oracle.measureWidth('abc', font);
    expect(state.measured).toEqual(['abc']); // cached

    // A web font arrived: the cached width was taken with a fallback font.
    expect([...listeners.keys()]).toEqual(['loadingdone']);
    listeners.get('loadingdone')!();
    oracle.measureWidth('abc', font);
    expect(state.measured).toEqual(['abc', 'abc']);

    // Replacing the shared oracle stops listening.
    setDefaultFontMetricsOracle(null);
    expect(fonts.removeEventListener).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });
});
