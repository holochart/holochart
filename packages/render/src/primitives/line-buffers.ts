/**
 * CPU-side buffer building for the line primitive (plan E2.5). Pure functions, no WebGL.
 *
 * ## Buffer layout
 *
 * All polylines of a primitive live in one vertex stream with **sentinel** vertices (`valid = 0`)
 * at every polyline start/end and at every gap:
 *
 * ```
 * [S, a0, a1, a2, S, b0, b1, S]
 * ```
 *
 * Each instance `k` reads four consecutive stream vertices `(prev, A, B, next) = (k, k+1, k+2, k+3)`
 * through interleaved attributes with offsets 0/4/8/12 (stride 4 floats), so no per-segment
 * duplication is uploaded. An instance whose `A` or `B` is a sentinel is culled in the vertex
 * shader; a sentinel `prev`/`next` turns that end into a cap instead of a join.
 */
import type { ColorInput, ScalarInput } from '../types.ts';
import { colorAt, computeOrigin, scalarAt, type NumericArray, type Vec3 } from './common.ts';

/** Geometry-affecting line inputs. */
export interface LineGeometryInput {
  x: NumericArray;
  y: NumericArray;
  /** Optional z for 3D lines. */
  z?: NumericArray;
  /** Start index (into x/y) of each polyline after the first. Omitted: a single polyline. */
  starts?: ArrayLike<number>;
  /** Connect across NaN/null/non-finite points instead of breaking the line. */
  connectGaps?: boolean;
}

/** Result of {@link buildLineLayout}. */
export interface LineLayout {
  /** Number of stream vertices, including sentinels. */
  vertexCount: number;
  /** Source (input) index of each stream vertex, or -1 for a sentinel. Length ≥ `vertexCount`. */
  source: Int32Array;
  /** Number of segment instances to draw (`max(0, vertexCount - 3)`). */
  instanceCount: number;
  /** Float64 RTC origin subtracted from positions. */
  origin: Vec3;
  /** Stream positions: `[x - ox, y - oy, z - oz, valid]` per vertex. Length ≥ `4 * vertexCount`. */
  points: Float32Array;
}

/** Round capacities up so streaming appends rarely reallocate GPU buffers. */
export function lineCapacity(vertexCount: number): number {
  let c = 16;
  while (c < vertexCount) c *= 2;
  return c;
}

/**
 * Build the sentinel-separated vertex stream. Consecutive exact duplicates are dropped (a
 * zero-length segment has no direction, which would break the joins on either side), runs of
 * gaps collapse to one sentinel, and with `connectGaps` non-finite points are skipped entirely.
 *
 * `reuse` lets callers recycle arrays of sufficient capacity (partial GPU uploads, plan §E16.3).
 */
export function buildLineLayout(
  input: LineGeometryInput,
  reuse?: { source: Int32Array; points: Float32Array },
): LineLayout {
  const { x, y, z } = input;
  const n = Math.min(x.length, y.length, z ? z.length : Infinity);
  const origin = computeOrigin(x, y, z);

  // Upper bound on stream length: every point plus a sentinel per polyline boundary / gap.
  const nStarts = input.starts ? input.starts.length : 0;
  const maxVertices = 2 * n + nStarts + 2;
  // Two passes would avoid over-allocation; instead we size to the bound once and track the count.
  const capacity = lineCapacity(Math.max(maxVertices, 4));
  const reusable =
    reuse && reuse.source.length >= capacity && reuse.points.length >= 4 * capacity
      ? reuse
      : undefined;
  const source = reusable ? reusable.source : new Int32Array(capacity);
  const points = reusable ? reusable.points : new Float32Array(4 * capacity);

  let count = 0;
  let lastValid = false;
  let lx = 0;
  let ly = 0;
  let lz = 0;
  const pushSentinel = (): void => {
    if (count > 0 && !lastValid) return; // collapse runs of sentinels
    source[count] = -1;
    const o = count * 4;
    points[o] = points[o + 1] = points[o + 2] = points[o + 3] = 0;
    count++;
    lastValid = false;
  };

  const boundaries = new Set<number>();
  if (input.starts) {
    for (let i = 0; i < input.starts.length; i++) boundaries.add(input.starts[i]!);
  }

  pushSentinel();
  for (let i = 0; i < n; i++) {
    if (i > 0 && boundaries.has(i)) pushSentinel();
    const px = x[i]!;
    const py = y[i]!;
    const pz = z ? z[i]! : 0;
    // Number.isFinite does not coerce, so `null` entries in plain arrays count as gaps too.
    const valid = Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz);
    if (!valid) {
      if (!input.connectGaps) pushSentinel();
      continue;
    }
    if (lastValid && px === lx && py === ly && pz === lz) continue;
    source[count] = i;
    const o = count * 4;
    points[o] = px - origin[0];
    points[o + 1] = py - origin[1];
    points[o + 2] = pz - origin[2];
    points[o + 3] = 1;
    count++;
    lastValid = true;
    lx = px;
    ly = py;
    lz = pz;
  }
  pushSentinel();

  return {
    vertexCount: count,
    source,
    instanceCount: Math.max(0, count - 3),
    origin,
    points,
  };
}

/** Fill per-stream-vertex RGBA colors from per-input-point colors (sentinels get zeros). */
export function fillLineColors(
  layout: Pick<LineLayout, 'vertexCount' | 'source'>,
  color: ColorInput,
  out: Float32Array,
): void {
  const tmp = [0, 0, 0, 0];
  for (let v = 0; v < layout.vertexCount; v++) {
    const s = layout.source[v]!;
    const o = v * 4;
    if (s < 0) {
      out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
      continue;
    }
    colorAt(color, s, tmp);
    out[o] = tmp[0]!;
    out[o + 1] = tmp[1]!;
    out[o + 2] = tmp[2]!;
    out[o + 3] = tmp[3]!;
  }
}

/**
 * Fill per-stream-vertex widths. The segment from stream vertex `v` to `v + 1` uses the width of
 * `v`'s source point, i.e. input `width[i]` styles the segment leaving point `i`.
 */
export function fillLineWidths(
  layout: Pick<LineLayout, 'vertexCount' | 'source'>,
  width: ScalarInput,
  out: Float32Array,
): void {
  for (let v = 0; v < layout.vertexCount; v++) {
    const s = layout.source[v]!;
    out[v] = s < 0 ? 0 : scalarAt(width, s, 1);
  }
}

/**
 * Maps a float64 world position to CSS-pixel screen coordinates. `m` is a column-major 4×4 matrix
 * (three.js `Matrix4.elements`) from world space to *pixel* clip space, i.e. viewport transform ×
 * projection × model-view; the result is divided by w.
 */
export type ScreenMatrix = ArrayLike<number>;

/** The screen matrix of the 2D pixel camera (ADR-008): world units are already CSS px. */
export const PIXEL_SCREEN_MATRIX: readonly number[] = Object.freeze([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

/**
 * Compute per-stream-vertex dash distances: `[phase, segmentLength]` pairs where `phase` is the
 * cumulative screen-space length from the polyline (or post-gap) start **modulo `period`**, and
 * `segmentLength` is the screen length of the segment leaving that vertex.
 *
 * Storing the phase modulo the pattern period (computed in float64) keeps dashes exact on
 * arbitrarily long lines, where a raw float32 cumulative length would lose sub-pixel precision.
 *
 * Positions are recomputed in float64 from the *source* arrays (not the float32 stream) so the
 * result matches the GPU projection. Vertices behind the camera (w ≤ 0) contribute zero length.
 */
export function computeDashDistances(
  layout: Pick<LineLayout, 'vertexCount' | 'source'>,
  input: Pick<LineGeometryInput, 'x' | 'y' | 'z'>,
  transform: { scale: Readonly<Vec3>; offset: Readonly<Vec3> },
  screen: ScreenMatrix,
  period: number,
  out: Float32Array,
): void {
  const { x, y, z } = input;
  const [sx, sy, sz] = transform.scale;
  // `transform.offset` here is the *plain* data→world offset (not RTC-adjusted).
  const [ox, oy, oz] = transform.offset;
  const m = screen;
  let prevX = 0;
  let prevY = 0;
  let prevOk = false;
  let phase = 0;
  for (let v = 0; v < layout.vertexCount; v++) {
    const s = layout.source[v]!;
    if (s < 0) {
      out[v * 2] = 0;
      out[v * 2 + 1] = 0;
      if (v > 0) out[(v - 1) * 2 + 1] = 0;
      prevOk = false;
      phase = 0;
      continue;
    }
    const wx = x[s]! * sx + ox;
    const wy = y[s]! * sy + oy;
    const wz = (z ? z[s]! : 0) * sz + oz;
    const cw = m[3]! * wx + m[7]! * wy + m[11]! * wz + m[15]!;
    const ok = cw > 1e-9;
    const px = ok ? (m[0]! * wx + m[4]! * wy + m[8]! * wz + m[12]!) / cw : 0;
    const py = ok ? (m[1]! * wx + m[5]! * wy + m[9]! * wz + m[13]!) / cw : 0;
    if (v > 0 && layout.source[v - 1]! >= 0) {
      const len = prevOk && ok ? Math.hypot(px - prevX, py - prevY) : 0;
      out[(v - 1) * 2 + 1] = len;
      phase += len;
      if (period > 0) phase %= period;
    }
    out[v * 2] = phase;
    out[v * 2 + 1] = 0;
    prevX = px;
    prevY = py;
    prevOk = ok;
  }
}

/** Minimal clock abstraction so {@link createThrottle} is testable with fake timers. */
export interface ThrottleClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultClock: ThrottleClock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Leading + trailing throttle: the first request after an idle period runs immediately; requests
 * inside the interval coalesce into one trailing run, so the final state is always computed.
 */
export function createThrottle(
  run: () => void,
  intervalMs: number,
  clock: ThrottleClock = defaultClock,
): { request(): void; flush(): void; cancel(): void } {
  let last = -Infinity;
  let timer: unknown;
  const fire = (): void => {
    timer = undefined;
    last = clock.now();
    run();
  };
  return {
    request() {
      if (timer !== undefined) return;
      const wait = last + intervalMs - clock.now();
      if (wait <= 0) fire();
      else timer = clock.setTimeout(fire, wait);
    },
    flush() {
      if (timer === undefined) return;
      clock.clearTimeout(timer);
      fire();
    },
    cancel() {
      if (timer !== undefined) clock.clearTimeout(timer);
      timer = undefined;
    },
  };
}
