/**
 * Text helpers shared by the components: Plotly pseudo-HTML → text for the SDF primitive, fonts,
 * and measurement through the synchronous font-metrics oracle (the same one layout uses, ADR-005).
 *
 * Rich text (E2.10): {@link styledText} parses a label with core's rich-text parser. Plain text
 * (and text whose runs all share one style, e.g. a title wrapped in `<b>`) stays one plain label
 * with that font; anything else becomes lines of styled runs, drawn by the text primitive as one
 * member per run and measured with {@link measureStyled}. Tick labels included: `10<sup>3</sup>`
 * exponents are drawn as real superscripts, as in Plotly (Unicode super/subscript digits, which
 * the text used to be mapped to, are missing from most fonts, including the bundled default).
 */
import type { RGBA, TextRunLines } from '@mk7s/holochart-render';
import { getDefaultFontMetricsOracle, layoutTextRuns, type TextFont } from '@mk7s/holochart-render';
import { richTextLabel, richTextToPlain, toRGBA } from '@mk7s/holochart-core';

/** Line height of multi-line labels, relative to the font size (Plotly's `LINE_SPACING`). */
export const LINE_HEIGHT = 1.3;

/**
 * Plotly pseudo-HTML → plain text (core's rich-text parser): tags removed, entities decoded,
 * `<br>` and raw newlines → `\n`. Unknown tags stay literal, as they are drawn.
 *
 * @example
 * ```ts
 * plainText('10<sup>−3</sup>'); // '10−3'
 * plainText('Jan 5<br>2026');   // 'Jan 5\n2026'
 * ```
 */
export function plainText(text: string): string {
  return richTextToPlain(text);
}

/** A label's text for the text primitive: plain `text`, its font, and runs when it is rich. */
export interface StyledText {
  /** Plain text (tags removed, entities decoded, `<br>` → `\n`). */
  readonly text: string;
  readonly font: TextFont;
  /** Lines of styled runs (E2.10), or `undefined` for a plain single-style label. */
  readonly runs?: TextRunLines;
}

/**
 * Plotly pseudo-HTML → a label (core's `richTextLabel`): plain text with its font when every run
 * shares one style (a whole label in `<b>…</b>` is drawn bold, like before), else lines of styled
 * runs (partial bold, `<sup>`, colored spans, links…). Plain strings take the fast path untouched.
 */
export function styledText(text: string, font: TextFont): StyledText {
  const r = richTextLabel(text, font);
  if (!r) return { text, font };
  return r.runs ? { text: r.text, font: r.font, runs: r.runs } : { text: r.text, font: r.font };
}

/** Size of a {@link styledText} label in px (runs laid out like the text primitive draws them). */
export function measureStyled(styled: StyledText, measure: MeasureLine): TextBox {
  if (!styled.runs) return measureBlock(styled.text, styled.font, measure);
  const layout = layoutTextRuns(
    styled.runs,
    { font: styled.font, lineHeight: LINE_HEIGHT },
    getDefaultFontMetricsOracle(),
  );
  return { width: layout.width, height: layout.height, lines: layout.lineCount };
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

export {
  fadeTextRuns as fadeRuns,
  handleTextLinkPointer as handleLinkPointer,
  openTextLink,
} from '@mk7s/holochart-render';
