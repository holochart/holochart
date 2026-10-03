import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFallbackTextMeasurer,
  fallbackCharWidth,
  type TextMeasurer,
} from './text-metrics.ts';

/**
 * The deterministic fallback measurer (node, tests, server-side layout): widths in em. Expected
 * values are the Helvetica AFM advance widths (1/1000 em) for the characters the table names, zero
 * for characters that take no space, 1 em for East Asian wide characters and emoji, and the
 * average Latin width (0.556 em, a Helvetica digit) for everything else.
 */
describe('fallbackCharWidth outside printable ASCII', () => {
  it('gives no width to controls, combining marks, zero-width characters and variation selectors', () => {
    const zeroWidth = [
      0x09, // tab (a control)
      0x0a, // line feed
      0x0300, // combining grave, first of the block
      0x036f, // last combining diacritical mark
      0x200b, // zero-width space
      0x200d, // zero-width joiner
      0x200f, // right-to-left mark
      0xfe00, // variation selector 1
      0xfe0f, // variation selector 16 (emoji presentation)
    ];
    for (const cp of zeroWidth) expect([cp, fallbackCharWidth(cp)]).toEqual([cp, 0]);
  });

  it('uses the Helvetica widths of common typographic characters', () => {
    expect(fallbackCharWidth(0xa0)).toBe(0.278); // no-break space = space
    expect(fallbackCharWidth(0x20)).toBe(0.278);
    expect(fallbackCharWidth(0x2013)).toBe(0.556); // en dash
    expect(fallbackCharWidth(0x2014)).toBe(1); // em dash
    expect(fallbackCharWidth(0x2026)).toBe(1); // ellipsis
    expect(fallbackCharWidth(0x2212)).toBe(0.584); // minus sign = plus sign
    expect(fallbackCharWidth('+'.codePointAt(0)!)).toBe(0.584);
    expect(fallbackCharWidth(0xb0)).toBe(0.4); // degree sign
  });

  it('makes East Asian wide characters and emoji 1 em wide', () => {
    const wide = [
      0x1100, // Hangul Jamo
      0x115f,
      0x2e80, // CJK radicals
      0x3042, // hiragana あ
      0xa4cf, // end of Yi
      0xac00, // Hangul syllable 가
      0xd7a3,
      0xf900, // CJK compatibility ideographs
      0xfaff,
      0xff01, // fullwidth !
      0xff60,
      0xffe0, // fullwidth ¢
      0xffe6,
      0x1f300, // emoji
      0x1f600, // 😀
      0x1faff,
      0x20000, // CJK extension B
      0x3fffd,
    ];
    for (const cp of wide) expect([cp, fallbackCharWidth(cp)]).toEqual([cp, 1]);
  });

  it('uses the average Latin width for other scripts, including narrow neighbors of the wide ones', () => {
    const average = [
      0xe9, // é
      0x03a9, // Ω
      0x0416, // Ж
      0x10d0, // Georgian ა, the block before Hangul Jamo
      0x1160, // Hangul jungseong filler: a medial jamo, not a wide leading one
      0xa4d0, // Lisu ꓐ, right after Yi
      0xfb00, // ﬀ, right after the CJK compatibility ideographs
      0xff71, // halfwidth katakana ｱ
      0xffe8, // halfwidth forms light vertical ￨
      0x1fb00, // symbols for legacy computing, after the emoji blocks
    ];
    for (const cp of average) expect([cp, fallbackCharWidth(cp)]).toEqual([cp, 0.556]);
  });
});

describe('fallback measurer: whole strings', () => {
  const m = createFallbackTextMeasurer();

  it('measures astral characters once, not once per UTF-16 unit', () => {
    // One emoji (two code units) is 1 em; a base letter with a combining mark is the letter alone.
    expect(m.width('😀', { family: 'x' })).toBe(1);
    expect(m.width('é', { family: 'x' })).toBeCloseTo(0.556);
    // "10 °C": 1, 0, no-break space, degree, C.
    expect(m.width('10 °C', { family: 'x' })).toBeCloseTo(0.556 * 2 + 0.278 + 0.4 + 0.722);
  });

  it('widens weights from 600 up by 5% and ignores the style', () => {
    const regular = m.width('Total', { family: 'x' });
    expect(m.width('Total', { family: 'x', weight: 500 })).toBe(regular);
    expect(m.width('Total', { family: 'x', style: 'italic' })).toBe(regular);
    expect(m.width('Total', { family: 'x', weight: 600 })).toBeCloseTo(regular * 1.05);
    expect(m.width('Total', { family: 'x', weight: 'bold' })).toBeCloseTo(regular * 1.05);
  });
});

/**
 * Without `Intl.Segmenter` (older runtimes), ellipsis truncation works on code points instead of
 * grapheme clusters. The segmenter is looked up once per module instance, so the module is loaded
 * fresh under a stubbed `Intl`.
 */
describe('ellipsize without Intl.Segmenter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** One em per code point. */
  const mono: TextMeasurer = {
    kind: 'mono',
    width: (text) => Array.from(text).length,
    vertical: () => ({ ascent: 0.8, descent: 0.2 }),
  };

  async function oracleWithoutSegmenter() {
    vi.resetModules();
    vi.stubGlobal('Intl', Object.create(Intl, { Segmenter: { value: undefined } }) as typeof Intl);
    const metrics = await import('./text-metrics.ts');
    return {
      oracle: metrics.createFontMetricsOracle({ measurer: mono }),
      ellipsis: metrics.TEXT_ELLIPSIS,
    };
  }

  it('truncates at code points, never inside a surrogate pair', async () => {
    const { oracle, ellipsis } = await oracleWithoutSegmenter();
    const font = { family: 'mono', size: 1 };
    // Four emoji, 3 em available: two emoji and the ellipsis.
    const out = oracle.ellipsize('😀😁😂🤣', font, 3);
    expect(out).toBe(`😀😁${ellipsis}`);
    expect(Array.from(out)).toHaveLength(3);
  });

  it('may split a grapheme cluster between its code points', async () => {
    const { oracle, ellipsis } = await oracleWithoutSegmenter();
    // Four é as letter + combining mark (8 code points), 4 em available: three code points fit
    // with the ellipsis, which ends between a letter and its mark.
    const out = oracle.ellipsize('éééé', { family: 'mono', size: 1 }, 4);
    expect(out).toBe(`ée${ellipsis}`);
  });
});
