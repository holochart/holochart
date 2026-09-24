/**
 * Pure helpers for Plotly's paint-level font attributes (plan E8.3): `textcase`, `variant`,
 * `shadow`, and `lineposition`.
 *
 * Shared by the text primitive (text-layout.ts) and the font metrics oracle (text-metrics.ts) so
 * that what is measured is exactly what is drawn. Tiny and troika-free on purpose: it ships in the
 * initial bundle chunk (plan E21.5).
 */
import type { RGBA } from '../types.ts';
import type { TextFontTextCase, TextFontVariant } from './text-fonts.ts';

// ---- textcase ---------------------------------------------------------------------------------

/**
 * First letter of a word: at the start or after whitespace, optionally behind leading punctuation
 * (`"hello` → `"Hello`), like CSS `text-transform: capitalize`. Unicode-aware (`\p{L}`).
 */
const WORD_START = /(^|\s)(\p{P}*)(\p{L})/gu;

/**
 * Apply a Plotly `font.textcase`: `upper` / `lower` (locale-independent `toUpperCase` /
 * `toLowerCase`), `word caps` (the first letter of each word is uppercased, the rest left as is,
 * like CSS `capitalize`), or `normal` / unset (unchanged).
 *
 * @example
 * ```ts
 * applyTextCase('élan vital', 'word caps'); // 'Élan Vital'
 * ```
 */
export function applyTextCase(text: string, textcase: TextFontTextCase | undefined): string {
  switch (textcase) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'word caps':
      return text.replace(
        WORD_START,
        (_, pre: string, punct: string, letter: string) => pre + punct + letter.toUpperCase(),
      );
    default:
      return text;
  }
}

// ---- variant ----------------------------------------------------------------------------------

/** Size of approximated small capitals relative to the font size. */
export const SMALL_CAPS_SCALE = 0.8;

/** Size of approximated petite capitals relative to the font size. */
export const PETITE_CAPS_SCALE = 0.72;

/** How text and size change for a font's `textcase` and `variant` (see resolveTextTransform). */
export interface TextTransform {
  /** Maps the source text to the drawn text. Idempotent: applying it twice changes nothing. */
  transform(text: string): string;
  /** Multiplies the font size. */
  sizeScale: number;
  /** Whether {@link transform} is the identity and {@link sizeScale} is 1. */
  identity: boolean;
}

const IDENTITY_TRANSFORM: TextTransform = Object.freeze({
  transform: (text: string) => text,
  sizeScale: 1,
  identity: true,
});

/** The variant as (uppercase?, size scale). */
function variantRule(variant: TextFontVariant | undefined): [boolean, number] {
  switch (variant) {
    case 'small-caps':
    case 'all-small-caps':
      return [true, SMALL_CAPS_SCALE];
    case 'petite-caps':
    case 'all-petite-caps':
      return [true, PETITE_CAPS_SCALE];
    case 'unicase':
      return [true, 1];
    default:
      return [false, 1];
  }
}

/**
 * The text transform and size scale for a font's `textcase` and `variant`, applied in that order
 * (CSS applies `text-transform` before `font-variant-caps`).
 *
 * **Variants are approximated.** True small caps draw lowercase letters as small capitals next to
 * full-size capitals, which needs per-glyph sizes inside one label; troika sizes a label as a
 * whole, so this has to wait for rich-text runs (E2.10). Until then the whole label is uppercased
 * and drawn at a reduced size: {@link SMALL_CAPS_SCALE} for `small-caps` / `all-small-caps`,
 * {@link PETITE_CAPS_SCALE} for `petite-caps` / `all-petite-caps`; `unicase` uppercases at full
 * size. The metrics oracle and the text primitive both use this function, so layout matches what
 * is drawn.
 */
export function resolveTextTransform(font: {
  textcase?: TextFontTextCase | undefined;
  variant?: TextFontVariant | undefined;
}): TextTransform {
  const textcase = font.textcase;
  const [upper, sizeScale] = variantRule(font.variant);
  const caseChanges = textcase === 'upper' || textcase === 'lower' || textcase === 'word caps';
  if (!caseChanges && !upper) return IDENTITY_TRANSFORM;
  return {
    // Uppercasing after the textcase: idempotent, since both steps are.
    transform: upper
      ? (text) => applyTextCase(text, textcase).toUpperCase()
      : (text) => applyTextCase(text, textcase),
    sizeScale,
    identity: false,
  };
}

// ---- lineposition -----------------------------------------------------------------------------

/** Decoration lines of a label ({@link parseLinePosition}). */
export interface TextDecorationLines {
  under: boolean;
  over: boolean;
  through: boolean;
}

/**
 * Parse a Plotly `font.lineposition` flaglist (`'under'`, `'over+through'`, `'none'`, …).
 * Unknown flags are ignored; `none`, empty, or unset means no lines.
 */
export function parseLinePosition(value: string | undefined | null): TextDecorationLines {
  const out: TextDecorationLines = { under: false, over: false, through: false };
  if (typeof value !== 'string') return out;
  for (const flag of value.toLowerCase().split('+')) {
    const f = flag.trim();
    if (f === 'under' || f === 'over' || f === 'through') out[f] = true;
  }
  return out;
}

/** Whether any decoration line is set. */
export function hasDecorationLines(lines: TextDecorationLines): boolean {
  return lines.under || lines.over || lines.through;
}

// ---- colors (for shadows) ---------------------------------------------------------------------

/** The named colors {@link parseShadowColor} knows, sRGB 0–255. Others fall back to black. */
const NAMED_COLORS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
  transparent: [0, 0, 0, 0],
  gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1],
  darkgray: [169, 169, 169, 1],
  darkgrey: [169, 169, 169, 1],
  lightgray: [211, 211, 211, 1],
  lightgrey: [211, 211, 211, 1],
  silver: [192, 192, 192, 1],
  red: [255, 0, 0, 1],
  green: [0, 128, 0, 1],
  blue: [0, 0, 255, 1],
  yellow: [255, 255, 0, 1],
  orange: [255, 165, 0, 1],
  purple: [128, 0, 128, 1],
};

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^rgba?\(\s*([^)]*)\)$/i;

/** One `rgb()` channel: a number 0–255 or a percentage. */
function channel(token: string): number {
  const v = Number.parseFloat(token);
  if (!Number.isFinite(v)) return NaN;
  return Math.min(1, Math.max(0, token.endsWith('%') ? v / 100 : v / 255));
}

/** An alpha value: a number 0–1 or a percentage. */
function alpha(token: string | undefined): number {
  if (token === undefined) return 1;
  const v = Number.parseFloat(token);
  if (!Number.isFinite(v)) return NaN;
  return Math.min(1, Math.max(0, token.endsWith('%') ? v / 100 : v));
}

/**
 * Parse a CSS color to sRGB 0–1 RGBA: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`
 * (comma or space separated, numbers or percentages, `/ alpha`), and a few names (black, white,
 * transparent, gray/grey, …). Returns `null` for anything else. Kept small on purpose: render
 * cannot depend on d3-color, and shadows rarely use exotic colors.
 */
export function parseShadowColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  const named = NAMED_COLORS[s];
  if (named) return [named[0] / 255, named[1] / 255, named[2] / 255, named[3]];
  const hex = HEX.exec(s)?.[1];
  if (hex) {
    const short = hex.length <= 4;
    const digits = short ? Array.from(hex, (c) => c + c) : (hex.match(/../g) ?? []);
    const [r = 'ff', g = 'ff', b = 'ff', a = 'ff'] = digits;
    return [
      Number.parseInt(r, 16) / 255,
      Number.parseInt(g, 16) / 255,
      Number.parseInt(b, 16) / 255,
      Number.parseInt(a, 16) / 255,
    ];
  }
  const args = FUNC.exec(s)?.[1];
  if (args !== undefined) {
    const [rgb = '', a] = args.split('/');
    const parts = rgb
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    // Legacy `rgba(r, g, b, a)`: the alpha is the fourth comma-separated value.
    const alphaToken = a?.trim() ?? parts[3];
    const out: RGBA = [
      channel(parts[0] ?? ''),
      channel(parts[1] ?? ''),
      channel(parts[2] ?? ''),
      alpha(alphaToken),
    ];
    return parts.length >= 3 && out.every(Number.isFinite) ? out : null;
  }
  return null;
}

// ---- shadow -----------------------------------------------------------------------------------

/** A parsed text shadow ({@link parseTextShadow}), lengths in px. */
export interface TextShadow {
  /** +x right. */
  offsetX: number;
  /** +y down (CSS). */
  offsetY: number;
  /** Blur radius. */
  blur: number;
  /** Outline width drawn under the shadow: 0 for CSS shadows, 1 for Plotly's `auto` halo. */
  width: number;
  /** sRGB 0–1 RGBA. */
  color: RGBA;
}

/** Split a CSS list at top-level commas (not inside `rgb(…)`). */
function splitTopLevel(value: string, separator: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && separator.test(ch)) {
      if (current.length > 0) out.push(current);
      current = '';
    } else current += ch;
  }
  if (current.length > 0) out.push(current);
  return out;
}

const LENGTH = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|em|rem)?$/i;

/** The color with the most contrast to `color`: white for dark colors, black for light ones. */
export function textContrastColor(color: RGBA): RGBA {
  // tinycolor's `isDark` (what Plotly's `Color.contrast` uses): perceived brightness < 128/255.
  const brightness = (color[0] * 299 + color[1] * 587 + color[2] * 114) / 1000;
  return brightness < 128 / 255 ? [1, 1, 1, 1] : [0, 0, 0, 1];
}

/**
 * Parse a CSS `text-shadow` (the first shadow of a list): two or three lengths (`offsetX offsetY
 * [blur]`, in px, unitless, `em`, or `rem`) and an optional color before or after them. A missing
 * color is the text color (`currentColor`); an unknown one is black.
 *
 * `'auto'` is Plotly's automatic shadow: a thin halo around the glyphs — no offset, 1 px outline,
 * 1 px blur — in the contrast color of the text (white behind dark text, black behind light text).
 * `'none'`, empty, unset, or unparsable values yield `null`.
 */
export function parseTextShadow(
  shadow: string | undefined | null,
  textColor: RGBA = [0, 0, 0, 1],
  fontSize = 16,
): TextShadow | null {
  if (typeof shadow !== 'string') return null;
  const value = shadow.trim();
  if (value === '' || value.toLowerCase() === 'none') return null;
  if (value.toLowerCase() === 'auto') {
    return { offsetX: 0, offsetY: 0, blur: 1, width: 1, color: textContrastColor(textColor) };
  }
  const first = splitTopLevel(value, /,/)[0] ?? '';
  const lengths: number[] = [];
  let color: RGBA | null = null;
  for (const token of splitTopLevel(first.trim(), /\s/)) {
    const m = LENGTH.exec(token);
    if (m) {
      const unit = (m[2] ?? 'px').toLowerCase();
      lengths.push(Number.parseFloat(m[1]!) * (unit === 'px' ? 1 : fontSize));
    } else if (token.toLowerCase() === 'currentcolor') {
      color = textColor;
    } else {
      color = parseShadowColor(token) ?? [0, 0, 0, 1];
    }
  }
  if (lengths.length < 2 || lengths.length > 3) return null;
  return {
    offsetX: lengths[0]!,
    offsetY: lengths[1]!,
    blur: Math.max(0, lengths[2] ?? 0),
    width: 0,
    color: color ?? textColor,
  };
}
