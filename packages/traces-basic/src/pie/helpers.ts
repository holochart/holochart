/**
 * Small `pie` helpers ported from plotly.js (`traces/pie/helpers.js`, `components/color`): value
 * and percent formatting, per-slice attribute lookup over aggregated points, and the color
 * operations pie defaults need (`rgbaString`, `hexString`, HSL lightness, contrast).
 */
import { isArrayLike, isValidColor, toRGBA, type RGBA } from '@mk7s/holochart-core';

// ---- Formatting ---------------------------------------------------------------------------------

/** Plotly's `format`: drop trailing zeros of a `toPrecision` string (also before an exponent). */
function trimZeros(v: string): string {
  if (v.includes('e')) return v.replace(/[.]?0+e/, 'e');
  if (v.includes('.')) return v.replace(/[.]?0+$/, '');
  return v;
}

/**
 * Plotly's `Lib.numSeparate` with the default `separators` (`'.,'`): thousands are separated only
 * when the integer part has more than 4 digits (`1234` stays, `12345` → `12,345`).
 */
export function numSeparate(value: string): string {
  const [int = '', ...rest] = value.split('.');
  const frac = rest.length > 0 ? `.${rest.join('.')}` : '';
  if (int.replace(/^[-−]/, '').length <= 4) return int + frac;
  const re = /(\d+)(\d{3})/;
  let x = int;
  while (re.test(x)) x = x.replace(re, '$1,$2');
  return x + frac;
}

/**
 * A slice fraction as a percentage with 3 significant digits (Plotly's `formatPiePercent`).
 *
 * @example
 * ```ts
 * formatPiePercent(1 / 3); // '33.3%'
 * formatPiePercent(0.5); // '50%'
 * ```
 */
export function formatPiePercent(v: number): string {
  return `${numSeparate(trimZeros((v * 100).toPrecision(3)))}%`;
}

/** A slice value with 10 significant digits, trailing zeros dropped (Plotly's `formatPieValue`). */
export function formatPieValue(v: number): string {
  return numSeparate(trimZeros(v.toPrecision(10)));
}

// ---- Per-slice attribute lookup -----------------------------------------------------------------

/**
 * The first "filled" entry of `array` at `indices` (Plotly's `getFirstFilled`): truthy, `0` or
 * `''`. `undefined` for non-arrays.
 */
export function getFirstFilled(array: unknown, indices: readonly number[]): unknown {
  if (!isArrayLike(array)) return undefined;
  for (const i of indices) {
    const v = array[i];
    if (v || v === 0 || v === '') return v;
  }
  return undefined;
}

/**
 * A scalar-or-array attribute for an aggregated slice (Plotly's `castOption`): the first filled
 * array entry among the slice's data indices, or the scalar when truthy.
 */
export function castOption(item: unknown, indices: readonly number[]): unknown {
  if (isArrayLike(item)) return getFirstFilled(item, indices);
  return item ? item : undefined;
}

/** Plotly's `isValidTextValue`: a non-empty string or a finite number. */
export function isValidTextValue(v: unknown): v is string | number {
  return (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));
}

/** `fast-isnumeric`: finite numbers and numeric strings. */
export function isNumeric(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.trim() !== '' && Number.isFinite(Number(v));
  return false;
}

/**
 * Plotly pseudo-HTML → plain text for the SDF text primitive: `<br>` breaks lines, other tags are
 * dropped and the common entities decoded (rich text is E2.10).
 */
export function plainText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&amp;/g, '&');
}

// ---- Colors -------------------------------------------------------------------------------------

const byte = (c: number): number => Math.round(Math.min(1, Math.max(0, c)) * 255);

/** A color as `rgb(r, g, b)` / `rgba(r, g, b, a)` (Plotly's `Color.rgbaString`), or `null`. */
export function rgbaString(color: unknown): string | null {
  if (!isValidColor(color)) return null;
  const c = toRGBA(color);
  if (!c) return null;
  return rgbaCss(c);
}

/** sRGB 0–1 RGBA → `rgb()` / `rgba()`. */
export function rgbaCss(c: RGBA): string {
  return c[3] >= 1
    ? `rgb(${byte(c[0])}, ${byte(c[1])}, ${byte(c[2])})`
    : `rgba(${byte(c[0])}, ${byte(c[1])}, ${byte(c[2])}, ${+c[3].toFixed(3)})`;
}

function hex(c: RGBA): string {
  const h = (v: number): string => byte(v).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`.toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue = (p: number, q: number, t: number): number => {
    let u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}

/**
 * Change a color's HSL lightness by `delta` percentage points and return it as uppercase
 * `#RRGGBB` (Plotly's `hexString(adjustLightness(c, delta))`, tinycolor's `lighten` / `darken`).
 */
export function adjustLightnessHex(color: string, delta: number): string {
  const c = toRGBA(color);
  if (!c) return color;
  const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
  const [r, g, b] = hslToRgb(h, s, Math.min(1, Math.max(0, l + delta / 100)));
  return hex([r, g, b, 1]);
}

const cache = new Map<string, readonly string[]>();

/**
 * A colorway followed by every color 20% lighter, then every color 20% darker (Plotly's
 * `generateExtendedColors`, `extendpiecolors`). Cached per colorway.
 */
export function extendColors(colors: readonly string[]): readonly string[] {
  const key = JSON.stringify(colors);
  let out = cache.get(key);
  if (!out) {
    out = [
      ...colors,
      ...colors.map((c) => adjustLightnessHex(c, 20)),
      ...colors.map((c) => adjustLightnessHex(c, -20)),
    ];
    if (cache.size > 64) cache.clear();
    cache.set(key, out);
  }
  return out;
}

function luminance(c: RGBA): number {
  const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

function wcag(a: RGBA, b: RGBA): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE: RGBA = [1, 1, 1, 1];
/** Plotly's `Color.defaultLine` (`#444`). */
export const DEFAULT_LINE: RGBA = [68 / 255, 68 / 255, 68 / 255, 1];

/**
 * Plotly's `Color.contrast` without amounts: white on dark colors, `#444` on light ones (WCAG
 * contrast), translucent colors composited over white first.
 */
export function contrastColor(color: RGBA): RGBA {
  const a = color[3];
  const c: RGBA =
    a >= 1 ? color : [color[0] * a + (1 - a), color[1] * a + (1 - a), color[2] * a + (1 - a), 1];
  return wcag(c, WHITE) > wcag(c, DEFAULT_LINE) ? WHITE : DEFAULT_LINE;
}
