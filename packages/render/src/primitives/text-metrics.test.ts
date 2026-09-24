import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FONT_CSS_FAMILY,
  BUILTIN_FONT_CSS_FAMILY,
  clearFontRegistry,
  fonts,
  measurementFace,
  registerFont,
  setDefaultFontURL,
  type TextFont,
} from './text-fonts.ts';
import {
  TEXT_DEFAULT_LINE_HEIGHT,
  TEXT_ELLIPSIS,
  createCanvasTextMeasurer,
  createFallbackTextMeasurer,
  createFontMetricsOracle,
  ellipsize,
  fallbackCharWidth,
  getDefaultFontMetricsOracle,
  measureText,
  renderedTextFace,
  setDefaultFontMetricsOracle,
  textFaceKey,
  wrapText,
  type TextFace,
  type TextMeasurer,
} from './text-metrics.ts';

const font: TextFont = { family: 'sans-serif', size: 10 };
const oracle = createFontMetricsOracle({ measurer: createFallbackTextMeasurer() });

/** A measurer where every character is 1 em wide, counting calls. */
function monospaceMeasurer(): TextMeasurer & { calls: number } {
  const m = {
    kind: 'mono',
    calls: 0,
    width(text: string) {
      m.calls++;
      return Array.from(text).length;
    },
    vertical() {
      return { ascent: 0.8, descent: 0.2 };
    },
  };
  return m;
}

afterEach(() => {
  setDefaultFontMetricsOracle(null);
  clearFontRegistry();
});

describe('fallback measurer', () => {
  it('uses Helvetica-like widths', () => {
    expect(fallbackCharWidth('0'.codePointAt(0)!)).toBeCloseTo(0.556);
    expect(fallbackCharWidth('W'.codePointAt(0)!)).toBeCloseTo(0.944);
    expect(fallbackCharWidth('i'.codePointAt(0)!)).toBeCloseTo(0.222);
    expect(fallbackCharWidth(0x4e2d)).toBe(1); // 中
    expect(fallbackCharWidth(0x0301)).toBe(0); // combining acute
  });

  it('is deterministic and makes bold slightly wider', () => {
    const m = createFallbackTextMeasurer();
    expect(m.width('Hello', { family: 'x' })).toBeCloseTo(0.722 + 0.556 + 0.222 * 2 + 0.556);
    expect(m.width('Hello', { family: 'x', weight: 'bold' })).toBeGreaterThan(
      m.width('Hello', { family: 'x' }),
    );
  });

  it('has no canvas in node', () => {
    expect(createCanvasTextMeasurer()).toBeNull();
  });
});

describe('FontMetricsOracle.measureText', () => {
  it('scales linearly with font size', () => {
    const w10 = oracle.measureWidth('Axis title', font);
    const w20 = oracle.measureWidth('Axis title', { ...font, size: 20 });
    expect(w20).toBeCloseTo(2 * w10, 10);
  });

  it('excludes trailing whitespace and takes the widest line', () => {
    expect(oracle.measureWidth('abc   ', font)).toBeCloseTo(oracle.measureWidth('abc', font));
    expect(oracle.measureWidth('a\nabcd\nab', font)).toBeCloseTo(oracle.measureWidth('abcd', font));
  });

  it('reports vertical metrics and block height', () => {
    const m = oracle.measureText('one\ntwo', { ...font, size: 20 });
    expect(m.lineCount).toBe(2);
    expect(m.lineHeight).toBeCloseTo(20 * TEXT_DEFAULT_LINE_HEIGHT);
    expect(m.height).toBeCloseTo(2 * 20 * TEXT_DEFAULT_LINE_HEIGHT);
    expect(m.ascent).toBeCloseTo(0.905 * 20);
    expect(m.descent).toBeCloseTo(0.212 * 20);
    expect(oracle.measureText('x', font, 1.5).lineHeight).toBeCloseTo(15);
  });
});

describe('FontMetricsOracle cache', () => {
  it('measures each (face, text) once across sizes', () => {
    const m = monospaceMeasurer();
    const o = createFontMetricsOracle({ measurer: m });
    o.measureWidth('hello', font);
    o.measureWidth('hello', { ...font, size: 33 });
    expect(m.calls).toBe(1);
    o.measureWidth('hello', { ...font, weight: 'bold' });
    expect(m.calls).toBe(2);
  });

  it('evicts least-recently-used entries', () => {
    const m = monospaceMeasurer();
    const o = createFontMetricsOracle({ measurer: m, cacheSize: 2 });
    o.measureWidth('a', font);
    o.measureWidth('b', font);
    o.measureWidth('a', font); // refresh 'a'
    o.measureWidth('c', font); // evicts 'b'
    expect(m.calls).toBe(3);
    o.measureWidth('a', font);
    expect(m.calls).toBe(3);
    o.measureWidth('b', font);
    expect(m.calls).toBe(4);
  });

  it('clear() drops cached widths', () => {
    const m = monospaceMeasurer();
    const o = createFontMetricsOracle({ measurer: m });
    o.measureWidth('a', font);
    o.clear();
    o.measureWidth('a', font);
    expect(m.calls).toBe(2);
  });

  it('keys faces by style, weight, and family', () => {
    expect(textFaceKey({ family: 'Inter', weight: 'bold' })).toBe('normal|700|Inter');
  });
});

describe('wrapText', () => {
  const mono = createFontMetricsOracle({ measurer: monospaceMeasurer() });
  const f1: TextFont = { family: 'mono', size: 1 };

  it('wraps greedily at spaces', () => {
    expect(mono.wrapText('the quick brown fox', f1, 10)).toEqual(['the quick', 'brown fox']);
  });

  it('lets a long word overflow on its own line', () => {
    expect(mono.wrapText('a supercalifragilistic b', f1, 5)).toEqual([
      'a',
      'supercalifragilistic',
      'b',
    ]);
  });

  it('breaks after hyphens and honors newlines', () => {
    expect(mono.wrapText('long-term\nx', f1, 6)).toEqual(['long-', 'term', 'x']);
  });

  it('does not wrap with an infinite width', () => {
    expect(mono.wrapText('a b c', f1, Infinity)).toEqual(['a b c']);
  });

  it('works with the default oracle', () => {
    expect(wrapText('alpha beta', { family: 'x', size: 10 }, 30)).toEqual(['alpha', 'beta']);
  });
});

describe('ellipsize', () => {
  const mono = createFontMetricsOracle({ measurer: monospaceMeasurer() });
  const f1: TextFont = { family: 'mono', size: 1 };

  it('leaves fitting text unchanged', () => {
    expect(mono.ellipsize('short', f1, 5)).toBe('short');
  });

  it('truncates to the longest fitting prefix plus an ellipsis', () => {
    expect(mono.ellipsize('abcdefgh', f1, 5)).toBe(`abcd${TEXT_ELLIPSIS}`);
    expect(mono.ellipsize('ab cdefgh', f1, 4)).toBe(`ab${TEXT_ELLIPSIS}`); // trailing space trimmed
  });

  it('returns an empty string when not even the ellipsis fits', () => {
    expect(mono.ellipsize('abc', f1, 0.5)).toBe('');
  });

  it('handles each line separately and supports a custom ellipsis', () => {
    expect(mono.ellipsize('abcdef\nab', f1, 4, '..')).toBe('ab..\nab');
  });

  it('keeps the result within maxWidth with real (fallback) metrics', () => {
    const f: TextFont = { family: 'x', size: 12 };
    const out = ellipsize('A fairly long category label', f, 80);
    expect(out.endsWith(TEXT_ELLIPSIS)).toBe(true);
    expect(measureText(out, f).width).toBeLessThanOrEqual(80);
  });

  it('does not split grapheme clusters', () => {
    // Code-point truncation would keep 'e' + combining mark + 'e' here.
    const out = mono.ellipsize('e\u0301e\u0301e\u0301e\u0301', f1, 4);
    expect(out).toBe(`e\u0301${TEXT_ELLIPSIS}`);
  });
});

describe('default oracle', () => {
  it('falls back to the deterministic measurer in node', () => {
    expect(getDefaultFontMetricsOracle().measurer.kind).toBe('fallback');
  });

  it('clears its cache when fonts change', () => {
    const o = getDefaultFontMetricsOracle();
    const clear = vi.spyOn(o, 'clear');
    registerFont({ family: 'Inter', url: 'inter.woff' });
    expect(clear).toHaveBeenCalled();
  });

  it('can be replaced', () => {
    const custom = createFontMetricsOracle({ measurer: monospaceMeasurer() });
    setDefaultFontMetricsOracle(custom);
    expect(getDefaultFontMetricsOracle()).toBe(custom);
    expect(measureText('abc', { family: 'x', size: 2 }).width).toBe(6);
  });
});

describe('measuring with the rendered font (E2.18)', () => {
  /** A canvas-like measurer recording the faces it is asked to measure. */
  function recordingMeasurer(kind = 'canvas') {
    const faces: TextFace[] = [];
    const m: TextMeasurer = {
      kind,
      width(text, face) {
        faces.push(face);
        // Width depends on the family so a changed resolution is observable.
        return text.length * (face.family.startsWith('"Inter"') ? 0.5 : 0.6);
      },
      vertical(face) {
        faces.push(face);
        return { ascent: 0.9, descent: 0.2 };
      },
    };
    return { m, faces };
  }

  afterEach(() => setDefaultFontURL(null));

  it('measures unregistered families with the default font', () => {
    setDefaultFontURL('default.woff');
    const { m, faces } = recordingMeasurer();
    const o = createFontMetricsOracle({ measurer: m });
    o.measureText('Legend', {
      family: '"Open Sans", verdana, arial, sans-serif',
      size: 12,
      weight: 700,
    });
    expect(faces.map((f) => f.family)).toEqual([
      `${DEFAULT_FONT_CSS_FAMILY}, "Open Sans", "verdana", "arial", sans-serif`,
      `${DEFAULT_FONT_CSS_FAMILY}, "Open Sans", "verdana", "arial", sans-serif`,
    ]);
    // troika draws every weight of an unregistered family with the one default file.
    expect(faces.every((f) => f.weight === 400 && f.style === 'normal')).toBe(true);
  });

  it("measures with the built-in default font's face when no default font URL is set", () => {
    const { m, faces } = recordingMeasurer();
    const o = createFontMetricsOracle({ measurer: m });
    const family = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    o.measureWidth('x', { family, size: 10 });
    o.measureWidth('x', { family, size: 10, weight: 600, style: 'italic' });
    const list = `${BUILTIN_FONT_CSS_FAMILY}, "Helvetica Neue", "Helvetica", "Arial", sans-serif`;
    // The shipped faces: regular, and bold italic for a semibold italic request.
    expect(faces).toEqual([
      { family: list, weight: 400, style: 'normal' },
      { family: list, weight: 700, style: 'italic' },
    ]);
  });

  it('keeps registered families (with the registered face)', () => {
    setDefaultFontURL('default.woff');
    registerFont({ family: 'Inter', url: 'inter.woff' }, { cssFontFace: false });
    registerFont({ family: 'Inter', url: 'bold.woff', weight: 700 }, { cssFontFace: false });
    const { m, faces } = recordingMeasurer();
    const o = createFontMetricsOracle({ measurer: m });
    expect(o.measureWidth('abcd', { family: 'Inter', size: 10, weight: 'bold' })).toBeCloseTo(20);
    expect(faces[0]).toEqual({ family: '"Inter", "Inter"', weight: 700, style: 'normal' });
  });

  it('keys the cache by the resolved face, so registrations take effect without clear()', () => {
    setDefaultFontURL('default.woff');
    const { m } = recordingMeasurer();
    const o = createFontMetricsOracle({ measurer: m });
    const f: TextFont = { family: 'Inter', size: 10 };
    expect(o.measureWidth('abcd', f)).toBeCloseTo(24);
    registerFont({ family: 'Inter', url: 'inter.woff' }, { cssFontFace: false });
    expect(o.measureWidth('abcd', f)).toBeCloseTo(20);
  });

  it('leaves non-canvas measurers (the deterministic fallback) unchanged', () => {
    setDefaultFontURL('default.woff');
    const { m, faces } = recordingMeasurer('fallback');
    createFontMetricsOracle({ measurer: m }).measureWidth('x', {
      family: 'Open Sans',
      size: 10,
      weight: 'bold',
    });
    expect(faces[0]).toEqual({ family: 'Open Sans', size: 10, weight: 'bold' });
    // Bold stays wider in the fallback, as before.
    const fb = createFontMetricsOracle({ measurer: createFallbackTextMeasurer() });
    expect(fb.measureWidth('Hello', { family: 'x', size: 10, weight: 'bold' })).toBeGreaterThan(
      fb.measureWidth('Hello', { family: 'x', size: 10 }),
    );
  });

  it('supports a custom face resolver, or none', () => {
    const { m, faces } = recordingMeasurer();
    createFontMetricsOracle({ measurer: m, resolveFace: null }).measureWidth('x', font);
    createFontMetricsOracle({
      measurer: m,
      resolveFace: (face) => ({ ...face, family: 'Custom' }),
    }).measureWidth('x', font);
    expect(faces.map((f) => f.family)).toEqual(['sans-serif', 'Custom']);
  });

  it('renderedTextFace drops the source tag', () => {
    setDefaultFontURL('default.woff');
    expect(renderedTextFace({ family: 'x', weight: 300 })).toEqual({
      family: `${DEFAULT_FONT_CSS_FAMILY}, "x"`,
      weight: 400,
      style: 'normal',
    });
  });

  it('the default oracle clears its cache when the default font changes or loads', () => {
    const o = getDefaultFontMetricsOracle();
    const clear = vi.spyOn(o, 'clear');
    setDefaultFontURL('default.woff');
    expect(clear).toHaveBeenCalledTimes(1);
    setDefaultFontURL(null);
    expect(clear).toHaveBeenCalledTimes(2);
  });
});

describe('textcase and variant (E8.3)', () => {
  const base: TextFont = { family: 'x', size: 10 };

  it('measures the transformed text: upper width equals the uppercased string', () => {
    const o = createFontMetricsOracle({ measurer: createFallbackTextMeasurer() });
    const upper = o.measureWidth('Hello world', { ...base, textcase: 'upper' });
    expect(upper).toBeCloseTo(o.measureWidth('HELLO WORLD', base));
    expect(upper).toBeGreaterThan(o.measureWidth('Hello world', base));
    expect(o.measureWidth('élan vital', { ...base, textcase: 'word caps' })).toBeCloseTo(
      o.measureWidth('Élan Vital', base),
    );
  });

  it('scales small caps: uppercase at 0.8× (petite 0.72×, unicase 1×)', () => {
    const o = createFontMetricsOracle({ measurer: createFallbackTextMeasurer() });
    const upper = o.measureWidth('SMALL', base);
    expect(o.measureWidth('small', { ...base, variant: 'small-caps' })).toBeCloseTo(upper * 0.8);
    expect(o.measureWidth('small', { ...base, variant: 'petite-caps' })).toBeCloseTo(upper * 0.72);
    expect(o.measureWidth('small', { ...base, variant: 'unicase' })).toBeCloseTo(upper);
    const m = o.measureText('a\nb', { ...base, variant: 'all-small-caps' }, 1.5);
    expect(m.lineHeight).toBeCloseTo(8 * 1.5);
    expect(m.height).toBeCloseTo(2 * 8 * 1.5);
    expect(m.ascent).toBeCloseTo(0.905 * 8);
  });

  it('wraps and ellipsizes the transformed text at the scaled size', () => {
    const m = monospaceMeasurer();
    const o = createFontMetricsOracle({ measurer: m });
    // 1 em per character: 'AB CD' is 5 em = 40 px at 0.8 × 10 px.
    expect(o.wrapText('ab cd', { ...base, variant: 'small-caps' }, 30)).toEqual(['AB', 'CD']);
    expect(o.wrapText('ab cd', { ...base, variant: 'small-caps' }, 40)).toEqual(['AB CD']);
    expect(o.ellipsize('abcdef', { ...base, textcase: 'upper' }, 40)).toBe(`ABC${TEXT_ELLIPSIS}`);
    expect(o.ellipsize('abcdef', { ...base, variant: 'small-caps' }, 40)).toBe(
      `ABCD${TEXT_ELLIPSIS}`,
    );
  });

  it('caches by the transformed text, so equal drawn strings share an entry', () => {
    const m = monospaceMeasurer();
    const o = createFontMetricsOracle({ measurer: m });
    o.measureWidth('abc', { ...base, textcase: 'upper' });
    o.measureWidth('ABC', base);
    o.measureWidth('Abc', { ...base, variant: 'small-caps', size: 20 });
    expect(m.calls).toBe(1);
    // A different transform of the same source string is measured separately.
    o.measureWidth('abc', { ...base, textcase: 'lower' });
    expect(m.calls).toBe(2);
  });
});

describe('registered variants in the metrics oracle (E8.3 + E2.18)', () => {
  it('measures a bold request with the registered bold face', () => {
    fonts.register(
      'Inter',
      { regular: 'r.woff', bold: 'b.woff', italic: 'i.woff' },
      { cssFontFace: false },
    );
    expect(measurementFace({ family: '"Brand", Inter', weight: 'bold' })).toMatchObject({
      source: 'registered',
      weight: 700,
      style: 'normal',
    });
    expect(measurementFace({ family: 'Inter', style: 'italic', weight: 700 })).toMatchObject({
      source: 'registered',
      weight: 400,
      style: 'italic',
    });

    // The fallback measurer, fed the rendered face: bold is measured bold (≈ 5% wider).
    const faces: TextFace[] = [];
    const fallback = createFallbackTextMeasurer();
    const o = createFontMetricsOracle({
      measurer: {
        kind: 'fallback',
        width: (text, face) => (faces.push(face), fallback.width(text, face)),
        vertical: (face) => fallback.vertical(face),
      },
      resolveFace: renderedTextFace,
    });
    const bold = o.measureWidth('Hello', { family: 'Inter', size: 10, weight: 600 });
    expect(faces[0]).toEqual({ family: '"Inter", "Inter"', weight: 700, style: 'normal' });
    expect(bold).toBeCloseTo(o.measureWidth('Hello', { family: 'Inter', size: 10 }) * 1.05);
  });
});
