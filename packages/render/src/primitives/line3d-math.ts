/**
 * CPU side of the 3D line primitive (plan E14.2, `line3d.ts`): near-plane clipping in clip space,
 * projection to screen px, and the dash phase of 3D polylines. Pure functions (float64), no WebGL;
 * the clipping and projection mirror the vertex shader in `line3d.glsl.ts` so the dash phase the
 * CPU stores matches the screen lengths the GPU draws.
 *
 * ## Near-plane clipping
 *
 * Segments are clipped against the near plane **before the perspective divide**: in clip space the
 * visible half-space is `z + w ≥ 0` (OpenGL convention) for perspective and orthographic cameras
 * alike, so the clip is one linear interpolation per clipped end. A clipped end becomes a butt end
 * (its join is behind the camera), its color is interpolated to the clip point, and its dash phase
 * starts there. Clipping at `z + w = NEAR_EPS` (not 0) keeps the clipped end strictly inside the
 * volume, so the hardware depth clip never removes the pixels right at the cut.
 */
import type { LineGeometryInput, LineLayout } from './line-buffers.ts';
import type { Vec3 } from './common.ts';

/** Clip-space distance inside the near plane at which segments are cut (see the module docs). */
export const NEAR_EPS = 1e-5;

/** A clip-space position `[x, y, z, w]`. */
export type Vec4 = [number, number, number, number];

/** Result of {@link clipSegmentNear}: the fractions cut from each end (0 = unclipped). */
export interface NearClip {
  /** Fraction of the segment cut at A: the visible part starts at `mix(A, B, sA)`. */
  sA: number;
  /** Fraction cut at B: the visible part ends at `mix(B, A, sB)`. */
  sB: number;
}

/**
 * Clip segment `A → B` against the near plane, given `dA = zA + wA` and `dB = zB + wB` (clip
 * space). Returns false when the whole segment is behind it (the shader culls the instance).
 * Mirrors the vertex shader exactly.
 */
export function clipSegmentNear(dA: number, dB: number, out: NearClip): boolean {
  if (dA < NEAR_EPS && dB < NEAR_EPS) return false;
  out.sA = dA < NEAR_EPS ? (NEAR_EPS - dA) / (dB - dA) : 0;
  out.sB = dB < NEAR_EPS ? (NEAR_EPS - dB) / (dA - dB) : 0;
  return true;
}

/** Linear interpolation of clip positions: `a + (b - a) * t`, written to `out`. */
export function mixClip(a: Readonly<Vec4>, b: Readonly<Vec4>, t: number, out: Vec4): Vec4 {
  for (let i = 0; i < 4; i++) out[i] = a[i]! + (b[i]! - a[i]!) * t;
  return out;
}

/**
 * Clip → screen: `[x, y]` in CSS px from the viewport's bottom-left corner and the NDC depth `z`.
 * Mirrors `hcClipToScreen` (and the depth the vertex shader interpolates).
 */
export function clipToScreen(
  c: Readonly<Vec4>,
  width: number,
  height: number,
  out: Vec3 = [0, 0, 0],
): Vec3 {
  out[0] = ((c[0] / c[3]) * 0.5 + 0.5) * width;
  out[1] = ((c[1] / c[3]) * 0.5 + 0.5) * height;
  out[2] = c[2] / c[3];
  return out;
}

/** `m · [x, y, z, 1]` for a column-major 4×4 matrix (three.js `Matrix4.elements`). */
export function transformPoint(
  m: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  out: Vec4 = [0, 0, 0, 0],
): Vec4 {
  for (let r = 0; r < 4; r++) {
    out[r] = m[r]! * x + m[4 + r]! * y + m[8 + r]! * z + m[12 + r]!;
  }
  return out;
}

/**
 * The screen-space frame the vertex shader builds for one segment (CPU mirror, for tests and
 * diagnostics): the clipped end points in px with their NDC depth, the clip fractions, and whether
 * each end keeps its join (an end that was clipped, or whose neighbor is behind the camera,
 * becomes a cap). `null` when the segment is culled.
 */
export interface ProjectedSegment {
  a: Vec3;
  b: Vec3;
  sA: number;
  sB: number;
  /** Screen position of the previous / next vertex when that end keeps its join. */
  prev: [number, number] | undefined;
  next: [number, number] | undefined;
}

/** Mirror of the 3D vertex prologue (see {@link ProjectedSegment}). */
export function projectSegment3D(
  prev: Readonly<Vec4> | undefined,
  a: Readonly<Vec4>,
  b: Readonly<Vec4>,
  next: Readonly<Vec4> | undefined,
  width: number,
  height: number,
): ProjectedSegment | null {
  const clip: NearClip = { sA: 0, sB: 0 };
  if (!clipSegmentNear(a[2] + a[3], b[2] + b[3], clip)) return null;
  const ca = mixClip(a, b, clip.sA, [0, 0, 0, 0]);
  const cb = mixClip(b, a, clip.sB, [0, 0, 0, 0]);
  // A neighbor behind the eye (w ≤ 0) projects mirrored: no join towards it (as in 2D).
  const side = (n: Readonly<Vec4> | undefined, cut: number): [number, number] | undefined => {
    if (!n || cut > 0 || n[3] < 1e-5) return undefined;
    const s = clipToScreen(n, width, height);
    return [s[0], s[1]];
  };
  return {
    a: clipToScreen(ca, width, height),
    b: clipToScreen(cb, width, height),
    sA: clip.sA,
    sB: clip.sB,
    prev: side(prev, clip.sA),
    next: side(next, clip.sB),
  };
}

/**
 * NDC depth of the point `along` px from the clipped A end of a segment of screen length `len`
 * (ends and joins past either end take that end's depth). NDC depth is affine in screen position
 * along a projected straight line, so the shader interpolates it linearly with `w = 1`.
 */
export function segmentDepthAt(zA: number, zB: number, along: number, len: number): number {
  const f = len > 0 ? Math.min(1, Math.max(0, along / len)) : 0;
  return zA + (zB - zA) * f;
}

/**
 * Per-stream-vertex dash data of a 3D polyline: `[phase, length]` pairs where `length` is the
 * screen length (CSS px) of the **visible** (near-clipped) part of the segment leaving that vertex
 * and `phase` is the dash phase at the start of that visible part: the visible screen length of the
 * polyline so far (since its start or the last gap), modulo `period`. Clipped-away parts count as
 * zero length, so dashes stay continuous through everything on screen and restart nowhere.
 *
 * `clip` maps world → clip space (projection × view × model, column-major); positions are
 * recomputed in float64 from the source arrays through the plain data → world transform.
 */
export function computeDashDistances3D(
  layout: Pick<LineLayout, 'vertexCount' | 'source'> & { sourceBase?: number },
  input: Pick<LineGeometryInput, 'x' | 'y' | 'z'>,
  transform: { scale: Readonly<Vec3>; offset: Readonly<Vec3> },
  clip: ArrayLike<number>,
  width: number,
  height: number,
  period: number,
  out: Float32Array,
): void {
  const { x, y, z } = input;
  const [sx, sy, sz] = transform.scale;
  const [ox, oy, oz] = transform.offset;
  const base = layout.sourceBase ?? 0;
  const cut: NearClip = { sA: 0, sB: 0 };
  let prev: Vec4 = [0, 0, 0, 0];
  let cur: Vec4 = [0, 0, 0, 0];
  const ca: Vec4 = [0, 0, 0, 0];
  const cb: Vec4 = [0, 0, 0, 0];
  const pa: Vec3 = [0, 0, 0];
  const pb: Vec3 = [0, 0, 0];
  let phase = 0;
  for (let v = 0; v < layout.vertexCount; v++) {
    const serial = layout.source[v]!;
    out[v * 2 + 1] = 0;
    if (serial < 0) {
      out[v * 2] = 0;
      phase = 0;
      continue;
    }
    const s = serial - base;
    transformPoint(clip, x[s]! * sx + ox, y[s]! * sy + oy, (z ? z[s]! : 0) * sz + oz, cur);
    if (v > 0 && layout.source[v - 1]! >= 0) {
      let len = 0;
      if (clipSegmentNear(prev[2] + prev[3], cur[2] + cur[3], cut)) {
        clipToScreen(mixClip(prev, cur, cut.sA, ca), width, height, pa);
        clipToScreen(mixClip(cur, prev, cut.sB, cb), width, height, pb);
        len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      }
      out[(v - 1) * 2 + 1] = len;
      phase += len;
      if (period > 0) phase %= period;
    }
    out[v * 2] = phase;
    const t = prev;
    prev = cur;
    cur = t;
  }
}
