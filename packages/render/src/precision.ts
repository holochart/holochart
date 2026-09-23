/**
 * Relative-to-center (RTC) position encoding shared by every primitive (plan E16.4, §4.3).
 *
 * Positions arrive as float64 data. A per-primitive float64 origin is subtracted on the CPU and the
 * float32 delta is uploaded. The shader applies `world = delta * scale + offsetRTC`, where
 * `offsetRTC = offset + origin * scale` is computed in float64 (see {@link rtcOffset}). Because the
 * large common part cancels in float64, a 1-second window of millisecond timestamps in 2026 stays
 * sub-pixel exact as long as the set's own extent fits float32 (≈ ±2^24 units at unit resolution).
 * A hi/lo split for extreme zoom of very long series is deferred (E16.4, P2).
 */

/** Sentinel written for points with a non-finite coordinate; the vertex shader collapses them. */
export const HIDDEN_POSITION = 3.0e38;

import type { DataTransform } from './types.ts';

/** A float64 3-vector (origins and effective transforms are kept in float64 on the CPU). */
export type Vec3 = [number, number, number];

/** Center of the finite range of `values[0..count)`; 0 when no value is finite. */
export function rtcAxisOrigin(
  values: ArrayLike<number> | null | undefined,
  count = values?.length ?? 0,
): number {
  if (!values) return 0;
  let min = Infinity;
  let max = -Infinity;
  const n = Math.min(count, values.length);
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    // NaN fails both comparisons; ±Infinity is excluded below.
    if (v < min && v > -Infinity) min = v;
    if (v > max && v < Infinity) max = v;
  }
  return min <= max ? (min + max) / 2 : 0;
}

/**
 * Write RTC-encoded positions for items `[start, end)` into an interleaved `xyz` float32 array.
 * Source arrays are read at `i - srcOffset`. A missing `z` encodes as 0. Items with any non-finite
 * coordinate (or a source index out of range) get {@link HIDDEN_POSITION}.
 */
export function rtcEncodePositions(
  out: Float32Array,
  start: number,
  end: number,
  srcOffset: number,
  origin: readonly [number, number, number],
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  z: ArrayLike<number> | null,
): void {
  const [ox, oy, oz] = origin;
  for (let i = start; i < end; i++) {
    const j = i - srcOffset;
    const xv = j < x.length ? x[j]! : NaN;
    const yv = j < y.length ? y[j]! : NaN;
    const zv = z ? (j < z.length ? z[j]! : NaN) : oz;
    const k = i * 3;
    if (Number.isFinite(xv) && Number.isFinite(yv) && Number.isFinite(zv)) {
      out[k] = xv - ox;
      out[k + 1] = yv - oy;
      out[k + 2] = zv - oz;
    } else {
      out[k] = HIDDEN_POSITION;
      out[k + 1] = HIDDEN_POSITION;
      out[k + 2] = HIDDEN_POSITION;
    }
  }
}

/**
 * RTC origin for a set of coordinate arrays: the center of each axis' finite range. Non-finite
 * values (NaN gaps, ±Infinity) are ignored; axes with no finite value get origin 0.
 */
export function computeOrigin(
  x: ArrayLike<number> | undefined,
  y: ArrayLike<number> | undefined,
  z?: ArrayLike<number>,
): Vec3 {
  return [rtcAxisOrigin(x), rtcAxisOrigin(y), rtcAxisOrigin(z)];
}

/**
 * The transform actually applied in shaders to RTC-encoded positions: `world = local * scale +
 * offset`, where `offset = transform.offset + origin * transform.scale` is computed in float64 so
 * precision is lost only after the (small) subtraction.
 */
export function effectiveTransform(
  transform: DataTransform,
  origin: Readonly<Vec3>,
): { scale: Vec3; offset: Vec3 } {
  const sz = transform.scaleZ ?? 1;
  return {
    scale: [transform.scaleX, transform.scaleY, sz],
    offset: [
      rtcOffset(transform.offsetX, origin[0], transform.scaleX),
      rtcOffset(transform.offsetY, origin[1], transform.scaleY),
      rtcOffset(transform.offsetZ ?? 0, origin[2], sz),
    ],
  };
}

/** Effective shader offset for one axis, in float64: `offset + origin * scale`. */
export function rtcOffset(offset: number, origin: number, scale: number): number {
  return offset + origin * scale;
}

/**
 * Float32 emulation of the vertex shader's `delta * scale + offsetRTC` (every operand and
 * intermediate rounded to float32), used to test precision on the CPU.
 */
export function emulateShaderWorld(delta: number, scale: number, offsetRTC: number): number {
  const f = Math.fround;
  return f(f(f(delta) * f(scale)) + f(offsetRTC));
}
