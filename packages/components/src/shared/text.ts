/**
 * Text helpers shared by the components: Plotly pseudo-HTML → plain text, fonts, and measurement
 * through the synchronous font-metrics oracle (the same one layout uses, ADR-005).
 *
 * Rich text (E2.10) is not built yet. Until it is, labels are simplified here: `<br>` becomes a
 * line break, `<sup>`/`<sub>` digits and signs become Unicode super/subscripts (so log-axis
 * `10<sup>3</sup>` labels still read correctly), a few entities are decoded, and every other tag
 * is dropped (keeping its text).
 */
import type { RGBA } from '@mk7s/holochart-render';
import { getDefaultFontMetricsOracle, type TextFont } from '@mk7s/holochart-render';
import { toRGBA } from '@mk7s/holochart-core';

/** Line height of multi-line labels, relative to the font size (Plotly's `LINE_SPACING`). */
export const LINE_HEIGHT = 1.3;

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '−': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
};

const SUBSCRIPT: Readonly<Record<string, string>> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '−': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
};

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function mapChars(text: string, table: Readonly<Record<string, string>>): string {
  let out = '';
  for (const ch of text) out += table[ch] ?? ch;
  return out;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/**
 * Plotly pseudo-HTML → plain text for the SDF text primitive: `<br>` → `\n`, `<sup>`/`<sub>` →
 * Unicode super/subscripts where they exist, other tags removed, entities decoded.
 *
 * @example
 * ```ts
 * plainText('10<sup>−3</sup>'); // '10⁻³'
 * plainText('Jan 5<br>2026');   // 'Jan 5\n2026'
 * ```
 */
export function plainText(text: string): string {
  if (text === '') return '';
  let s = text.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<sup>([\s\S]*?)<\/sup>/gi, (_, inner: string) =>
    mapChars(inner.replace(/<[^>]*>/g, ''), SUPERSCRIPT),
  );
  s = s.replace(/<sub>([\s\S]*?)<\/sub>/gi, (_, inner: string) =>
    mapChars(inner.replace(/<[^>]*>/g, ''), SUBSCRIPT),
  );
  s = s.replace(/<[^>]*>/g, '');
  return decodeEntities(s);
}

/** Whether `<tag>`/`</tag>` pairs in `text` nest properly (`a</b><b>b` does not). */
function balanced(text: string, tag: string): boolean {
  let depth = 0;
  for (const m of text.matchAll(new RegExp(`<(/?)${tag}>`, 'gi'))) {
    depth += m[1] === '/' ? -1 : 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/**
 * {@link plainText} plus whole-label styling: a label entirely wrapped in `<b>…</b>` or
 * `<i>…</i>` (common for titles) is drawn bold or italic. Partial styling needs rich text (E2.10).
 */
export function styledText(text: string, font: TextFont): { text: string; font: TextFont } {
  let inner = text.trim();
  let bold = false;
  let italic = false;
  for (;;) {
    const m = /^<(b|i|em|strong)>([\s\S]*)<\/\1>$/i.exec(inner);
    if (!m || !balanced(m[2] as string, m[1] as string)) break;
    const tag = (m[1] as string).toLowerCase();
    if (tag === 'b' || tag === 'strong') bold = true;
    else italic = true;
    inner = m[2] as string;
  }
  if (!bold && !italic) return { text: plainText(text), font };
  return {
    text: plainText(inner),
    font: { ...font, ...(bold ? { weight: 'bold' } : {}), ...(italic ? { style: 'italic' } : {}) },
  };
}

/** A defaulted Plotly font (`layout.font`, `tickfont`, …). */
export interface FullFont {
  readonly family: string;
  readonly size: number;
  readonly color: string;
  readonly weight?: number | 'normal' | 'bold';
  readonly style?: 'normal' | 'italic';
  /** Plotly font extras (plan E8.3), drawn by the text primitive. */
  readonly variant?: TextFont['variant'];
  readonly textcase?: TextFont['textcase'];
  readonly lineposition?: string;
  readonly shadow?: string;
}

/** Fill unset fields of `font` from `base` (Plotly's font inheritance). */
export function inheritFont(font: Partial<FullFont> | undefined, base: FullFont): FullFont {
  return {
    family: font?.family ?? base.family,
    size: font?.size ?? base.size,
    color: font?.color ?? base.color,
    weight: font?.weight ?? base.weight ?? 'normal',
    style: font?.style ?? base.style ?? 'normal',
    ...extras(font?.variant ?? base.variant, font?.textcase ?? base.textcase, font, base),
  };
}

/** The E8.3 font extras of `font` over `base`, omitting unset ones (keeps objects minimal). */
function extras(
  variant: FullFont['variant'],
  textcase: FullFont['textcase'],
  font: Partial<FullFont> | undefined,
  base: Partial<FullFont>,
): Partial<FullFont> {
  const lineposition = font?.lineposition ?? base.lineposition;
  const shadow = font?.shadow ?? base.shadow;
  return {
    ...(variant !== undefined ? { variant } : {}),
    ...(textcase !== undefined ? { textcase } : {}),
    ...(lineposition !== undefined ? { lineposition } : {}),
    ...(shadow !== undefined ? { shadow } : {}),
  };
}

/** A defaulted font → the render layer's `TextFont` (optionally scaled). */
export function textFont(font: FullFont, scale = 1): TextFont {
  return {
    family: font.family,
    size: font.size * scale,
    weight: font.weight ?? 'normal',
    style: font.style ?? 'normal',
    ...extras(font.variant, font.textcase, font, {}),
  };
}

const TRANSPARENT: RGBA = [0, 0, 0, 0];

/** CSS color → sRGB 0–1 RGBA for primitives (`fallback`, default transparent, when invalid). */
export function rgba(color: unknown, fallback: RGBA = TRANSPARENT): RGBA {
  if (typeof color !== 'string') return fallback;
  return (toRGBA(color) as RGBA | null) ?? fallback;
}

/** Size of a (possibly multi-line) plain-text block in px. */
export interface TextBox {
  readonly width: number;
  readonly height: number;
  readonly lines: number;
}

/** Measures one line of text in px (injectable so layout stays testable without a canvas). */
export type MeasureLine = (line: string, font: TextFont) => number;

/** The shared oracle's `measureWidth` (canvas metrics in browsers, a fixed table elsewhere). */
export const oracleMeasure: MeasureLine = (line, font) =>
  getDefaultFontMetricsOracle().measureWidth(line, font);

/** Box of a plain-text block (lines split on `\n`) at `LINE_HEIGHT` line spacing. */
export function measureBlock(text: string, font: TextFont, measure: MeasureLine): TextBox {
  if (text === '') return { width: 0, height: 0, lines: 0 };
  const lines = text.split('\n');
  let width = 0;
  for (const line of lines) width = Math.max(width, measure(line, font));
  return { width, height: lines.length * font.size * LINE_HEIGHT, lines: lines.length };
}
