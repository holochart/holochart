/**
 * Colorscale lookup textures (plan E2.12).
 *
 * Each unique colorscale becomes one 256×1 RGBA8 `DataTexture`, shared and ref-counted through the
 * {@link ResourceManager} under a key derived from its stops. `cmin` / `cmax` / `cmid` /
 * `reversescale` never touch the texture: shaders map a value to `t` with uniforms and sample the
 * LUT at {@link lutCoord}.
 *
 * Interpolation happens in sRGB byte space, matching Plotly (which interpolates CSS rgb strings).
 * The texture is tagged `NoColorSpace` so the sampled values are the raw sRGB numbers the custom
 * shaders write straight to the output (see the color conventions in `types.ts`).
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import type { ResourceManager, RGBA } from '../types.ts';

/** A colorscale stop: position in [0, 1] and an sRGB 0–1 RGBA color. */
export type ColorscaleStop = readonly [position: number, color: RGBA];

/** Ordered list of stops (Plotly `colorscale` after color parsing). At least one stop. */
export type Colorscale = readonly ColorscaleStop[];

/** Number of texels in a colorscale LUT. */
export const COLORSCALE_LUT_SIZE = 256;

/** Validate and sort stops; positions are clamped to [0, 1]. */
function normalizedStops(scale: Colorscale): ColorscaleStop[] {
  if (scale.length === 0) throw new RangeError('A colorscale needs at least one stop');
  const stops = scale.map(
    ([p, c]) => [Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0)), c] as const,
  );
  // Stable sort keeps duplicate positions (hard color steps) in their given order.
  return stops.sort((a, b) => a[0] - b[0]);
}

/**
 * Sample a colorscale at `t` ∈ [0, 1] (clamped) with linear interpolation. CPU mirror of the LUT
 * (without 8-bit quantization), for legends, colorbars, and hover labels.
 */
export function sampleColorscale(
  scale: Colorscale,
  t: number,
  out: [number, number, number, number] = [0, 0, 0, 0],
): [number, number, number, number] {
  return sampleSorted(normalizedStops(scale), t, out);
}

function sampleSorted(
  stops: readonly ColorscaleStop[],
  t: number,
  out: [number, number, number, number],
): [number, number, number, number] {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  let lo = first;
  let hi = last;
  if (x <= first[0]) {
    hi = first;
  } else if (x >= last[0]) {
    lo = last;
  } else {
    for (let i = 1; i < stops.length; i++) {
      const s = stops[i]!;
      if (x <= s[0]) {
        lo = stops[i - 1]!;
        hi = s;
        break;
      }
    }
  }
  const span = hi[0] - lo[0];
  const f = span > 0 ? (x - lo[0]) / span : 1;
  for (let c = 0; c < 4; c++) out[c] = lo[1][c]! + (hi[1][c]! - lo[1][c]!) * f;
  return out;
}

/** Build the RGBA8 LUT for a colorscale: texel `i` holds the color at `t = i / (size - 1)`. */
export function buildColorscaleLUT(
  scale: Colorscale,
  size = COLORSCALE_LUT_SIZE,
  out: Uint8Array = new Uint8Array(size * 4),
): Uint8Array {
  const stops = normalizedStops(scale);
  const rgba: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < size; i++) {
    sampleSorted(stops, size > 1 ? i / (size - 1) : 0, rgba);
    for (let c = 0; c < 4; c++)
      out[i * 4 + c] = Math.round(Math.min(1, Math.max(0, rgba[c]!)) * 255);
  }
  return out;
}

/**
 * Texture coordinate for `t` ∈ [0, 1] so that t = 0 and t = 1 hit the centers of the first and last
 * texels exactly (mirrors the shader).
 */
export function lutCoord(t: number, size = COLORSCALE_LUT_SIZE): number {
  const x = Math.min(1, Math.max(0, t));
  return (x * (size - 1) + 0.5) / size;
}

/** Resource key for a colorscale. Colors are quantized to 8 bits, as in the LUT. */
export function colorscaleKey(scale: Colorscale): string {
  const parts = normalizedStops(scale).map(
    ([p, c]) =>
      `${+p.toFixed(6)}:${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(',')}`,
  );
  return `colorscale:${parts.join('|')}`;
}

/** Create a LUT texture (not cached; prefer {@link acquireColorscaleTexture}). */
export function createColorscaleTexture(scale: Colorscale): DataTexture {
  const data = buildColorscaleLUT(scale);
  const texture = new DataTexture(data, COLORSCALE_LUT_SIZE, 1, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.name = 'holochart:colorscale';
  texture.needsUpdate = true;
  return texture;
}

/** A shared LUT texture plus the key to release it with. */
export interface ColorscaleTextureHandle {
  readonly key: string;
  readonly texture: DataTexture;
  /** Release this handle's reference (idempotent). */
  release(): void;
}

/** Acquire the shared LUT texture for `scale` (ref-counted; call `release` when done). */
export function acquireColorscaleTexture(
  resources: ResourceManager,
  scale: Colorscale,
): ColorscaleTextureHandle {
  const key = colorscaleKey(scale);
  const texture = resources.acquire(key, () => createColorscaleTexture(scale));
  let released = false;
  return {
    key,
    texture,
    release() {
      if (released) return;
      released = true;
      resources.release(key);
    },
  };
}

/**
 * Resolve the color domain (Plotly semantics): when `cmid` is set, `cmin`/`cmax` are widened so they
 * are equidistant from `cmid`. A degenerate or non-finite domain falls back to a unit span so the
 * shader never divides by zero.
 */
export function resolveColorDomain(
  cmin: number,
  cmax: number,
  cmid?: number | null,
): [number, number] {
  let lo = Number.isFinite(cmin) ? cmin : 0;
  let hi = Number.isFinite(cmax) ? cmax : 1;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (cmid != null && Number.isFinite(cmid)) {
    const half = Math.max(Math.abs(hi - cmid), Math.abs(cmid - lo));
    lo = cmid - half;
    hi = cmid + half;
  }
  if (hi === lo) {
    lo -= 0.5;
    hi += 0.5;
  }
  return [lo, hi];
}

/**
 * CPU mirror of the shader mapping value → `t` ∈ [0, 1] for a resolved domain (`[lo, hi]` from
 * {@link resolveColorDomain}). Returns NaN for non-finite values (drawn with the NaN color).
 */
export function colorscaleT(value: number, lo: number, hi: number, reverse = false): number {
  if (!Number.isFinite(value)) return NaN;
  const t = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return reverse ? 1 - t : t;
}
