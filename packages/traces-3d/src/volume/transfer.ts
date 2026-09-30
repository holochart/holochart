/**
 * The transfer function and value packing of ray-marched volumes (`render: 'raymarch'`, plan
 * E14.7): what the fragment shader (`raymarch.ts`) and the CPU hover (`raymarch-hover.ts`) read.
 *
 * - **Values** go to the GPU as a normalized 8-bit 3D texture (`R8`): byte 0 marks a missing
 *   value, bytes 1–255 span the data range `[min, max]` (254 steps). 8 bits because it is linearly
 *   filterable everywhere in WebGL 2 (float textures need `OES_texture_float_linear`, 16-bit
 *   normalized formats an extension) and 4× smaller than float32: a 256³ grid is a 16 MB upload.
 *   The quantization (1/254 of the data range) is finer than the 256-entry colorscale LUT.
 * - **Transfer function**: 256 RGBA entries over the same `[min, max]`: the colorscale's color
 *   (its domain `cmin` / `cmax`, `reversescale`) and the opacity `opacity · opacityscale(t) ·
 *   colorscale alpha`, `t` the value's position in the color domain. That opacity is the opacity
 *   of one grid cell of material: the shader corrects it for its sample spacing
 *   (`1 − (1 − a)^step`), so the look doesn't depend on `raymarch.step`.
 * - **Range**: values outside `[isomin, isomax]` are empty (tested per sample in the shader, not
 *   baked into the table, so the cut is exact).
 */
import { mapColor, type resolveColorMapping } from '@mk7s/holochart-traces-basic';

/** A resolved colorscale mapping (traces-basic's `ColorMapping`). */
export type ColorMapping = NonNullable<ReturnType<typeof resolveColorMapping>>;

/** Entries of the transfer function table. */
export const TRANSFER_SIZE = 256;

/** What the transfer function maps (see the module comment). */
export interface TransferSpec {
  /** The data range the table (and the value texture) spans. */
  readonly domain: readonly [number, number];
  /** The colorscale mapping (null: gray ramp over the domain). */
  readonly mapping: ColorMapping | null;
  readonly opacity: number;
  /** `[position, opacity]` stops over the color domain, or null. */
  readonly opacityscale: readonly (readonly [number, number])[] | null;
}

/** The value at entry `e` (0 … size − 1) of a table over `domain`. */
export function transferValue(domain: readonly [number, number], e: number): number {
  return domain[0] + (e / (TRANSFER_SIZE - 1)) * (domain[1] - domain[0]);
}

/** Straight-alpha sRGB RGBA 0–1 of value `v` (see the module comment). */
export function transferAt(spec: TransferSpec, v: number): [number, number, number, number] {
  const m = spec.mapping;
  const [lo, hi] = m ? [m.cmin, m.cmax] : spec.domain;
  const color: [number, number, number, number] = m
    ? mapColor(v, m)
    : (() => {
        const t = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5;
        return [t, t, t, 1];
      })();
  let alpha = Math.min(1, Math.max(0, spec.opacity)) * color[3];
  const stops = spec.opacityscale;
  if (stops && stops.length >= 2) {
    const t = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5;
    alpha *= sampleStops(stops, t);
  }
  return [color[0], color[1], color[2], alpha];
}

/** Linear interpolation of `[position, value]` stops at `t` (the last value past the end). */
function sampleStops(stops: readonly (readonly [number, number])[], t: number): number {
  for (let s = 1; s < stops.length; s++) {
    const [p1, o1] = stops[s]!;
    if (t <= p1) {
      const [p0, o0] = stops[s - 1]!;
      return p1 > p0 ? o0 + ((o1 - o0) * (t - p0)) / (p1 - p0) : o1;
    }
  }
  return stops[stops.length - 1]![1];
}

/** The transfer function table: {@link TRANSFER_SIZE} RGBA bytes (straight alpha, sRGB). */
export function buildTransferFunction(
  spec: TransferSpec,
  out: Uint8Array = new Uint8Array(TRANSFER_SIZE * 4),
): Uint8Array {
  for (let e = 0; e < TRANSFER_SIZE; e++) {
    const c = transferAt(spec, transferValue(spec.domain, e));
    for (let k = 0; k < 4; k++) out[e * 4 + k] = Math.round(Math.min(1, Math.max(0, c[k]!)) * 255);
  }
  return out;
}

/** The byte of value `v` in a texture over `domain` (0: missing). */
export function packValue(v: number, domain: readonly [number, number]): number {
  if (!Number.isFinite(v)) return 0;
  const span = domain[1] - domain[0];
  const t = span > 0 ? (v - domain[0]) / span : 0.5;
  return 1 + Math.round(Math.min(1, Math.max(0, t)) * 254);
}

/** The value of byte `b` (NaN for 0). */
export function unpackValue(b: number, domain: readonly [number, number]): number {
  if (b < 0.5) return NaN;
  return domain[0] + ((b - 1) / 254) * (domain[1] - domain[0]);
}
