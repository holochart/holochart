/**
 * CSS color parsing for the defaults stage and the render boundary.
 *
 * Colors are stored in `fullData`/`fullLayout` as canonical `rgb(r, g, b)` / `rgba(r, g, b, a)`
 * strings so later stages (and equality checks in the diffing stage) never deal with the many CSS
 * spellings of one color. The renderer consumes sRGB 0–1 RGBA floats (see render `types.ts`), which
 * {@link toRGBA} produces.
 */
import { color as d3color } from 'd3-color';

/** sRGB 0–1 RGBA, alpha not premultiplied — the render layer's color format. */
export type RGBA = readonly [r: number, g: number, b: number, a: number];

const CACHE_LIMIT = 1024;
const canonicalCache = new Map<string, string | null>();
const rgbaCache = new Map<string, RGBA | null>();

function remember<V>(cache: Map<string, V>, key: string, value: V): V {
  // Colors in real figures are a small set; a full reset is cheaper than LRU bookkeeping.
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, value);
  return value;
}

/**
 * Parse any CSS color and return its canonical `rgb()`/`rgba()` string, or `null` if `value` is
 * not a valid color. `'transparent'` becomes `rgba(0, 0, 0, 0)`.
 */
export function canonicalColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hit = canonicalCache.get(value);
  if (hit !== undefined) return hit;
  const c = d3color(value.trim());
  return remember(canonicalCache, value, c ? c.rgb().formatRgb() : null);
}

/** True if `value` is a string d3-color can parse. */
export function isValidColor(value: unknown): value is string {
  return canonicalColor(value) !== null;
}

/**
 * Convert a CSS color to sRGB 0–1 RGBA floats for the renderer, or `null` if invalid.
 * Results are cached and frozen, so callers must not mutate them.
 */
export function toRGBA(value: string): RGBA | null {
  const hit = rgbaCache.get(value);
  if (hit !== undefined) return hit;
  const c = d3color(value.trim());
  if (!c) return remember(rgbaCache, value, null);
  const { r, g, b, opacity } = c.rgb();
  // d3 parses 'transparent' with NaN channels; treat any NaN channel as 0.
  const clamp = (v: number): number => (Number.isNaN(v) ? 0 : Math.min(1, Math.max(0, v)));
  const rgba: RGBA = Object.freeze([
    clamp(r / 255),
    clamp(g / 255),
    clamp(b / 255),
    clamp(Number.isNaN(opacity) ? 1 : opacity),
  ] as const);
  return remember(rgbaCache, value, rgba);
}

/**
 * Pack a list of CSS colors into a `Float32Array` of `4 * n` sRGB 0–1 floats (the render layer's
 * per-item color format). Invalid entries use `fallback`.
 */
export function toRGBAArray(
  colors: ArrayLike<unknown>,
  fallback: RGBA = [0, 0, 0, 1],
  out: Float32Array = new Float32Array(colors.length * 4),
): Float32Array {
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    const rgba = (typeof c === 'string' ? toRGBA(c) : null) ?? fallback;
    out.set(rgba, i * 4);
  }
  return out;
}
