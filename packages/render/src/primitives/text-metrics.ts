/**
 * Synchronous font metrics oracle for the (pure) layout stage (plan §4.2, E2.9, E4.2, E4.6).
 *
 * Layout needs text sizes *before* anything renders — automargin, legend sizing, uniform text — but
 * troika typesets asynchronously in a worker. The oracle answers synchronously instead:
 *
 * - In browsers it measures with canvas 2D `measureText` (an `OffscreenCanvas`, or a detached
 *   `<canvas>` when that is unavailable).
 * - Elsewhere (node, jsdom, workers without canvas) it uses a deterministic per-character width
 *   table approximating Helvetica/Arial, so tests and server-side layout are reproducible.
 *
 * Widths are measured once per (face, string) at a reference size and scaled linearly by the font
 * size. Linear scaling is what SDF text does as well (no hinting), so one cache entry serves every
 * size. The cache is an LRU keyed by style/weight/family + text.
 *
 * ## Limits (document for layout consumers)
 *
 * - The canvas measures with a *CSS* font, troika renders from a font *file*. The canvas measurer
 *   therefore measures with the face troika will draw ({@link measurementFace}, plan E2.18): the
 *   registered family (`registerFont` adds it as a CSS `FontFace`), else the app's default font
 *   (`configureText({ defaultFontURL })` registers it as a CSS face), else the built-in default
 *   font's face (TeX Gyre Heros, registered as a CSS face once loaded; measuring starts the load).
 *   Until that face has loaded, the browser measures with the requested family list; the default
 *   oracle clears its cache when fonts change, and charts re-run layout then.
 * - Kerning and ligatures are included by canvas but not by the fallback table. Wrapping sums
 *   per-word widths, which ignores kerning across break opportunities (normally spaces).
 * - No bidi reordering, no complex-script shaping in the fallback, and ellipsis truncation works on
 *   grapheme clusters only where `Intl.Segmenter` exists (code points otherwise).
 * - `letterSpacing` is not modeled.
 * - `textcase` and `variant` are applied before measuring ({@link resolveTextTransform}): the
 *   transformed text is measured at the scaled size, exactly as the text primitive draws it. So
 *   {@link FontMetricsOracle.wrapText} and {@link FontMetricsOracle.ellipsize} return transformed
 *   text (the transform is idempotent, so handing it back to the primitive changes nothing).
 *
 * Pure module: never imports troika or touches WebGL.
 */
import {
  cssFontString,
  measurementFace,
  normalizeFontWeight,
  normalizeFontStyle,
  subscribeFontChanges,
  type TextFont,
} from './text-fonts.ts';
import { resolveTextTransform } from './text-style.ts';

/** Default line height as a multiple of the font size (shared with the text primitive). */
export const TEXT_DEFAULT_LINE_HEIGHT = 1.2;

/** The ellipsis appended by {@link FontMetricsOracle.ellipsize}. */
export const TEXT_ELLIPSIS = '\u2026';

/** A font face without size: what measurements are cached by. */
export type TextFace = Omit<TextFont, 'size'>;

/** Vertical font metrics as fractions of the font size. */
export interface FontVerticalMetrics {
  /** Distance from the baseline to the top of the em box / line box, > 0. */
  ascent: number;
  /** Distance from the baseline to the bottom, > 0. */
  descent: number;
}

/**
 * Low-level measuring backend: widths and vertical metrics at a font size of 1 px. Results are
 * cached by the oracle, so implementations need not cache.
 */
export interface TextMeasurer {
  /** `'canvas'`, `'fallback'`, or a custom name (for debugging). */
  readonly kind: string;
  /** Advance width of a single line of text at 1 px. */
  width(text: string, face: TextFace): number;
  /** Ascent/descent at 1 px. */
  vertical(face: TextFace): FontVerticalMetrics;
}

/** Result of {@link FontMetricsOracle.measureText}, all in CSS px. */
export interface MeasuredText {
  /** Width of the widest line (trailing whitespace excluded, like troika). */
  width: number;
  /** Font ascent (baseline → top). */
  ascent: number;
  /** Font descent (baseline → bottom, positive). */
  descent: number;
  /** Line advance: `fontSize * lineHeight`. */
  lineHeight: number;
  /** Block height: `lineCount * lineHeight` (matches troika's block bounds). */
  height: number;
  /** Number of lines (hard `\n` breaks only; see {@link FontMetricsOracle.wrapText}). */
  lineCount: number;
}

/**
 * Synchronous, cached text measurement for layout. Every method honors the font's `textcase` and
 * `variant` (see the module notes).
 */
export interface FontMetricsOracle {
  readonly measurer: TextMeasurer;
  /** Width in px of the widest line of `text` (trailing whitespace excluded). */
  measureWidth(text: string, font: TextFont): number;
  /**
   * Advance width in px of one line of `text`, trailing whitespace included: where the next run
   * of a rich-text line starts (E2.10). `text` must not contain `\n`.
   */
  measureAdvance(text: string, font: TextFont): number;
  /** Width, vertical metrics, and block height. `lineHeight` is a multiple of the font size. */
  measureText(text: string, font: TextFont, lineHeight?: number): MeasuredText;
  /**
   * Greedy word wrap like troika's `whiteSpace: 'normal'`: breaks after whitespace and hyphens,
   * honors `\n`, and lets a single word wider than `maxWidth` overflow on its own line.
   */
  wrapText(text: string, font: TextFont, maxWidth: number): string[];
  /**
   * Truncate each line of `text` so it fits `maxWidth`, appending `ellipsis` (default `…`) to
   * truncated lines. Returns `''` for a line when not even the ellipsis fits.
   */
  ellipsize(text: string, font: TextFont, maxWidth: number, ellipsis?: string): string;
  /** Drop cached measurements (e.g. after a web font finished loading). */
  clear(): void;
}

export interface FontMetricsOracleOptions {
  /** Measuring backend. Default: canvas when available, else the deterministic fallback. */
  measurer?: TextMeasurer;
  /** Maximum cached width entries (LRU). Default 20 000. */
  cacheSize?: number;
  /**
   * Maps a requested face to the face the measurer measures with. Default: for the canvas measurer,
   * the face troika will actually draw ({@link measurementFace}: the registered family, the app's
   * default font, or the built-in default font); identity for other measurers, so the
   * deterministic fallback (node, tests) is unchanged. `null` forces identity.
   */
  resolveFace?: ((face: TextFace) => TextFace) | null;
}

/** The measured face for a request: what troika draws ({@link measurementFace}). */
export function renderedTextFace(face: TextFace): TextFace {
  const m = measurementFace(face);
  return { family: m.family, weight: m.weight, style: m.style };
}

/** Size at which the canvas measurer measures (then divides): avoids small-size rounding. */
const REFERENCE_SIZE = 100;

/**
 * Advance widths in 1/1000 em for U+0020–U+007E, from the Helvetica AFM (≈ Arial). Used by the
 * deterministic fallback measurer.
 */
// prettier-ignore
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // space – /
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 0 – ?
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // @ – O
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // P – _
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // ` – o
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, // p – ~
];

/** Arial's hhea ascent/descent (1854/2048, 434/2048): what canvas reports for Arial. */
const FALLBACK_VERTICAL: FontVerticalMetrics = { ascent: 0.905, descent: 0.212 };

/** Bold faces are ~5% wider than regular ones in typical sans-serif families. */
const FALLBACK_BOLD_FACTOR = 1.05;

/** Width in em of one code point in the fallback table. */
export function fallbackCharWidth(codePoint: number): number {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return HELVETICA_WIDTHS[codePoint - 0x20]! / 1000;
  // Zero-width: controls, combining marks, zero-width space/joiners, variation selectors.
  if (
    codePoint < 0x20 ||
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  ) {
    return 0;
  }
  if (codePoint === 0xa0) return 0.278; // no-break space
  if (codePoint === 0x2026 || codePoint === 0x2014) return 1; // ellipsis, em dash
  if (codePoint === 0x2013) return 0.556; // en dash
  if (codePoint === 0x2212) return 0.584; // minus sign (Plotly negative numbers)
  if (codePoint === 0xb0) return 0.4; // degree sign
  // Wide East Asian ranges (CJK, Hangul, kana, fullwidth forms) and emoji: 1 em.
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  ) {
    return 1;
  }
  return 0.556; // average Latin/Greek/Cyrillic glyph
}

/**
 * Deterministic measurer: Helvetica-like per-character widths, no kerning, bold ≈ 5% wider, italic
 * same as upright. Identical results on every platform, which makes layout unit tests stable.
 */
export function createFallbackTextMeasurer(): TextMeasurer {
  return {
    kind: 'fallback',
    width(text, face) {
      let em = 0;
      for (const ch of text) em += fallbackCharWidth(ch.codePointAt(0)!);
      return normalizeFontWeight(face.weight) >= 600 ? em * FALLBACK_BOLD_FACTOR : em;
    },
    vertical() {
      return FALLBACK_VERTICAL;
    },
  };
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Canvas 2D measurer, or `null` when no canvas with a 2D context exists (node, jsdom without the
 * `canvas` package). Vertical metrics come from `fontBoundingBoxAscent/Descent` (the font's line
 * metrics) and fall back to Arial-like ratios where unsupported.
 */
export function createCanvasTextMeasurer(): TextMeasurer | null {
  let ctx: Context2D | null = null;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      ctx = new OffscreenCanvas(1, 1).getContext('2d');
    } else if (typeof document !== 'undefined') {
      ctx = document.createElement('canvas').getContext('2d');
    }
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx.measureText !== 'function') return null;
  const context = ctx;
  let currentFont = '';
  const setFont = (face: TextFace): void => {
    const font = cssFontString(face, REFERENCE_SIZE);
    if (font !== currentFont) {
      context.font = font;
      currentFont = font;
    }
  };
  return {
    kind: 'canvas',
    width(text, face) {
      setFont(face);
      return context.measureText(text).width / REFERENCE_SIZE;
    },
    vertical(face) {
      setFont(face);
      const m = context.measureText('');
      const ascent = m.fontBoundingBoxAscent;
      const descent = m.fontBoundingBoxDescent;
      if (!Number.isFinite(ascent) || !Number.isFinite(descent) || ascent <= 0) {
        return FALLBACK_VERTICAL;
      }
      return { ascent: ascent / REFERENCE_SIZE, descent: Math.max(0, descent) / REFERENCE_SIZE };
    },
  };
}

/** Cache key for a face (size-independent). */
export function textFaceKey(face: TextFace): string {
  return `${normalizeFontStyle(face.style)}|${normalizeFontWeight(face.weight)}|${face.family}`;
}

let segmenter: Intl.Segmenter | null | undefined;

/** Split into grapheme clusters when `Intl.Segmenter` exists, else into code points. */
function graphemes(text: string): string[] {
  if (segmenter === undefined) {
    const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
    segmenter = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : null;
  }
  if (!segmenter) return Array.from(text);
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** Break-opportunity tokens: each ends after a whitespace run or a hyphen run (troika's rules). */
const WRAP_TOKEN = /[^\s\-\u2010\u2012-\u2014]*(?:[-\u2010\u2012-\u2014]+|\s+)?/g;

/** Create an oracle. Most code should use {@link getDefaultFontMetricsOracle}. */
export function createFontMetricsOracle(options: FontMetricsOracleOptions = {}): FontMetricsOracle {
  const measurer = options.measurer ?? createCanvasTextMeasurer() ?? createFallbackTextMeasurer();
  const cacheSize = Math.max(1, options.cacheSize ?? 20000);
  const resolveFace =
    options.resolveFace === undefined
      ? measurer.kind === 'canvas'
        ? renderedTextFace
        : null
      : options.resolveFace;
  const widths = new Map<string, number>();
  const verticals = new Map<string, FontVerticalMetrics>();

  /**
   * The face to measure with, plus its cache key. Keys use the resolved face, so a registration
   * that changes what is drawn never serves a stale entry even without {@link clear}.
   */
  const resolve = (font: TextFace): [TextFace, string] => {
    const face = resolveFace ? resolveFace(font) : font;
    return [face, textFaceKey(face)];
  };

  /** Width at 1 px of a single line, LRU-cached. `face` is already resolved. */
  const unitWidth = (text: string, face: TextFace, faceKey: string): number => {
    if (text.length === 0) return 0;
    const key = `${faceKey}\u0000${text}`;
    const hit = widths.get(key);
    if (hit !== undefined) {
      // Refresh recency: Map iteration order is insertion order, so the first key is the LRU.
      widths.delete(key);
      widths.set(key, hit);
      return hit;
    }
    const w = measurer.width(text, face);
    widths.set(key, w);
    if (widths.size > cacheSize) widths.delete(widths.keys().next().value!);
    return w;
  };

  const lineWidth = (line: string, size: number, face: TextFace, faceKey: string): number =>
    unitWidth(line.trimEnd(), face, faceKey) * size;

  /**
   * The drawn text and size for a request (`textcase`, `variant`). Cache keys stay correct without
   * mentioning either: widths are keyed by the transformed text, and the size scale is applied
   * after the (size-independent) cache.
   */
  const drawn = (text: string, font: TextFont): [string, number] => {
    const t = resolveTextTransform(font);
    return t.identity ? [text, font.size] : [t.transform(text), font.size * t.sizeScale];
  };

  const measureWidth = (text: string, font: TextFont): number => {
    const [face, faceKey] = resolve(font);
    const [drawnText, size] = drawn(text, font);
    let max = 0;
    for (const line of drawnText.split('\n')) {
      max = Math.max(max, lineWidth(line, size, face, faceKey));
    }
    return max;
  };

  const vertical = (font: TextFace): FontVerticalMetrics => {
    const [face, key] = resolve(font);
    let v = verticals.get(key);
    if (!v) {
      v = measurer.vertical(face);
      verticals.set(key, v);
    }
    return v;
  };

  const ellipsizeLine = (
    line: string,
    size: number,
    face: TextFace,
    faceKey: string,
    maxWidth: number,
    ellipsis: string,
  ): string => {
    if (lineWidth(line, size, face, faceKey) <= maxWidth) return line;
    const ellipsisWidth = unitWidth(ellipsis, face, faceKey) * size;
    if (ellipsisWidth > maxWidth) return '';
    const parts = graphemes(line);
    // Largest prefix that fits with the ellipsis (width is monotonic up to kerning effects).
    let lo = 0;
    let hi = parts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const prefix = parts.slice(0, mid).join('').trimEnd();
      if (lineWidth(prefix, size, face, faceKey) + ellipsisWidth <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return parts.slice(0, lo).join('').trimEnd() + ellipsis;
  };

  const measureAdvance = (text: string, font: TextFont): number => {
    const [face, faceKey] = resolve(font);
    const [drawnText, size] = drawn(text, font);
    return unitWidth(drawnText, face, faceKey) * size;
  };

  return {
    measurer,
    measureWidth,
    measureAdvance,
    measureText(text, font, lineHeight = TEXT_DEFAULT_LINE_HEIGHT) {
      const v = vertical(font);
      // The size scale of a variant applies to everything troika draws, line advance included.
      const size = drawn('', font)[1];
      const lineCount = text.split('\n').length;
      const advance = size * lineHeight;
      return {
        width: measureWidth(text, font),
        ascent: v.ascent * size,
        descent: v.descent * size,
        lineHeight: advance,
        height: lineCount * advance,
        lineCount,
      };
    },
    wrapText(text, font, maxWidth) {
      const [face, faceKey] = resolve(font);
      const [drawnText, size] = drawn(text, font);
      const out: string[] = [];
      for (const hardLine of drawnText.split('\n')) {
        const tokens = hardLine.match(WRAP_TOKEN)?.filter((t) => t.length > 0) ?? [];
        let line = '';
        let width = 0;
        for (const token of tokens) {
          const core = token.trimEnd();
          const coreWidth = unitWidth(core, face, faceKey) * size;
          const tokenWidth = core === token ? coreWidth : unitWidth(token, face, faceKey) * size;
          // Trailing whitespace may hang past maxWidth, as in troika and CSS.
          if (line.length > 0 && width + coreWidth > maxWidth) {
            out.push(line.trimEnd());
            line = token;
            width = tokenWidth;
          } else {
            line += token;
            width += tokenWidth;
          }
        }
        out.push(line.trimEnd());
      }
      return out;
    },
    ellipsize(text, font, maxWidth, ellipsis = TEXT_ELLIPSIS) {
      const [face, faceKey] = resolve(font);
      const [drawnText, size] = drawn(text, font);
      return drawnText
        .split('\n')
        .map((line) => ellipsizeLine(line, size, face, faceKey, maxWidth, ellipsis))
        .join('\n');
    },
    clear() {
      widths.clear();
      verticals.clear();
    },
  };
}

let defaultOracle: FontMetricsOracle | null = null;
let unsubscribeDefault: (() => void) | null = null;

/**
 * The shared oracle (canvas-backed in browsers, deterministic fallback elsewhere). Its cache is
 * cleared whenever fonts change (registration, CSS font face loaded, `document.fonts` finished
 * loading).
 */
export function getDefaultFontMetricsOracle(): FontMetricsOracle {
  if (!defaultOracle) {
    const oracle = createFontMetricsOracle();
    defaultOracle = oracle;
    const clear = (): void => oracle.clear();
    const unsubscribe = subscribeFontChanges(clear);
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    fonts?.addEventListener?.('loadingdone', clear);
    unsubscribeDefault = () => {
      unsubscribe();
      fonts?.removeEventListener?.('loadingdone', clear);
    };
  }
  return defaultOracle;
}

/**
 * Replace the shared oracle (e.g. force the deterministic fallback for reproducible layout);
 * `null` resets to lazy creation of the default.
 */
export function setDefaultFontMetricsOracle(oracle: FontMetricsOracle | null): void {
  unsubscribeDefault?.();
  unsubscribeDefault = null;
  defaultOracle = oracle;
}

/** {@link FontMetricsOracle.measureText} on the default oracle. */
export function measureText(text: string, font: TextFont, lineHeight?: number): MeasuredText {
  return getDefaultFontMetricsOracle().measureText(text, font, lineHeight);
}

/** {@link FontMetricsOracle.wrapText} on the default oracle. */
export function wrapText(text: string, font: TextFont, maxWidth: number): string[] {
  return getDefaultFontMetricsOracle().wrapText(text, font, maxWidth);
}

/** {@link FontMetricsOracle.ellipsize} on the default oracle. */
export function ellipsize(
  text: string,
  font: TextFont,
  maxWidth: number,
  ellipsis?: string,
): string {
  return getDefaultFontMetricsOracle().ellipsize(text, font, maxWidth, ellipsis);
}
