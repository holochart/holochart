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
  /**
   * Source serial of each stream vertex, or -1 for a sentinel: the input index plus
   * {@link sourceBase}. Valid for `[head, head + vertexCount)`; the length is the capacity.
   */
  source: Int32Array;
  /** Number of segment instances to draw (`max(0, vertexCount - 3)`). */
  instanceCount: number;
  /** Float64 RTC origin subtracted from positions. */
  origin: Vec3;
  /**
   * Stream positions: `[x - ox, y - oy, z - oz, valid]` per vertex, valid for
   * `[head, head + vertexCount)`. Length ≥ `4 * (head + vertexCount)`.
   */
  points: Float32Array;
  /**
   * First stream vertex (0 unless built with an `offset`). Streaming (E7.2) slides the live range
   * inside the arrays instead of moving data, so GPU uploads stay proportional to the change.
   */
  head: number;
  /**
   * Added to input indices to form {@link source} serials (0 for a plain build). Streaming edits
   * renumber the inputs without rewriting retained vertices by changing the base instead.
   */
  sourceBase: number;
}

/**
 * Round capacities up to a power of two (at least 16).
 *
 * @deprecated Line buffers are sized from an exact count since E16.9; kept for API stability.
 */
export function lineCapacity(vertexCount: number): number {
  let c = 16;
  while (c < vertexCount) c *= 2;
  return c;
}

/**
 * Where the sentinel-stream builder stands. {@link buildLineLayout} runs it from the start of a
 * stream; streaming edits (`LinePrimitive.splice`) resume it in the middle of one, which is why
 * the state is explicit.
 */
export interface LineCursor {
  /** Next stream index to write. */
  at: number;
  /** Something (a sentinel at least) was written before `at`. */
  started: boolean;
  /** The vertex before `at` is a valid point (not a sentinel). */
  lastValid: boolean;
  /** Position of the last valid point, for dropping exact duplicates. */
  lx: number;
  ly: number;
  lz: number;
}

/** Arrays a {@link LineCursor} writes into; omitted to only count. */
export interface LineStreamArrays {
  source: Int32Array;
  points: Float32Array;
}

/** A cursor at the start of a new stream. */
export function lineCursor(at = 0): LineCursor {
  return { at, started: false, lastValid: false, lx: 0, ly: 0, lz: 0 };
}

/** Write a gap sentinel at the cursor unless the previous vertex already is one. */
export function writeLineSentinel(c: LineCursor, out: LineStreamArrays | undefined): void {
  if (c.started && !c.lastValid) return; // collapse runs of sentinels
  if (out) {
    out.source[c.at] = -1;
    const o = c.at * 4;
    out.points[o] = out.points[o + 1] = out.points[o + 2] = out.points[o + 3] = 0;
  }
  c.at++;
  c.started = true;
  c.lastValid = false;
}

/**
 * What {@link writeLinePoint} did with an input point: `None` (dropped: an exact duplicate of the
 * previous point, or a gap skipped by `connectGaps`), `Vertex` (written as a valid vertex) or
 * `Gap` (wrote, or collapsed into, a sentinel).
 */
export const LineStep = { None: 0, Vertex: 1, Gap: 2 } as const;
export type LineStep = (typeof LineStep)[keyof typeof LineStep];

/**
 * Feed input point `(px, py, pz)` with source serial `serial` to the builder: a valid vertex, a
 * gap sentinel (non-finite, unless `connectGaps`), or nothing (exact duplicate of the previous
 * point — a zero-length segment has no direction, which would break the joins on either side).
 */
export function writeLinePoint(
  c: LineCursor,
  out: LineStreamArrays | undefined,
  serial: number,
  px: number,
  py: number,
  pz: number,
  connectGaps: boolean,
  origin: Readonly<Vec3>,
): LineStep {
  // Number.isFinite does not coerce, so `null` entries in plain arrays count as gaps too.
  if (!(Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz))) {
    if (connectGaps) return LineStep.None;
    writeLineSentinel(c, out);
    return LineStep.Gap;
  }
  if (c.lastValid && px === c.lx && py === c.ly && pz === c.lz) return LineStep.None;
  if (out) {
    out.source[c.at] = serial;
    const o = c.at * 4;
    out.points[o] = px - origin[0];
    out.points[o + 1] = py - origin[1];
    out.points[o + 2] = pz - origin[2];
    out.points[o + 3] = 1;
  }
  c.at++;
  c.started = true;
  c.lastValid = true;
  c.lx = px;
  c.ly = py;
  c.lz = pz;
  return LineStep.Vertex;
}

/** Options of {@link buildLineLayout}. */
export interface LineLayoutOptions {
  /** Allocate at least this many stream vertices (streaming slack). Default: the exact count. */
  capacity?: number;
  /** First stream vertex to write (room left for prepends). Default 0. */
  offset?: number;
  /** See {@link LineLayout.sourceBase}. Default 0. */
  sourceBase?: number;
  /** The stream length when already known (from {@link countLineStream}). */
  count?: number;
}

/** Run the builder over the whole input, writing into `out` (or only counting). */
function runLineStream(
  input: LineGeometryInput,
  c: LineCursor,
  out: LineStreamArrays | undefined,
  origin: Readonly<Vec3>,
  sourceBase: number,
): void {
  const { x, y, z } = input;
  const n = Math.min(x.length, y.length, z ? z.length : Infinity);
  const connect = input.connectGaps === true;
  let boundaries: Set<number> | undefined;
  if (input.starts && input.starts.length > 0) boundaries = new Set(Array.from(input.starts));
  writeLineSentinel(c, out);
  for (let i = 0; i < n; i++) {
    if (i > 0 && boundaries?.has(i)) writeLineSentinel(c, out);
    writeLinePoint(c, out, i + sourceBase, x[i]!, y[i]!, z ? z[i]! : 0, connect, origin);
  }
  writeLineSentinel(c, out);
}

/** Exact number of stream vertices {@link buildLineLayout} writes for `input`. */
export function countLineStream(input: LineGeometryInput): number {
  const c = lineCursor();
  runLineStream(input, c, undefined, [0, 0, 0], 0);
  return c.at;
}

/**
 * Build the sentinel-separated vertex stream. Consecutive exact duplicates are dropped (a
 * zero-length segment has no direction, which would break the joins on either side), runs of
 * gaps collapse to one sentinel, and with `connectGaps` non-finite points are skipped entirely.
 *
 * The stream is counted first and arrays are sized exactly (E16.9: sizing for the worst case of
 * a gap after every point, rounded to a power of two, over-allocated 2.6× on dense series).
 * `reuse` lets callers recycle arrays of sufficient capacity (partial GPU uploads, plan E16.3).
 */
export function buildLineLayout(
  input: LineGeometryInput,
  reuse?: LineStreamArrays,
  options: LineLayoutOptions = {},
): LineLayout {
  const { x, y, z } = input;
  const origin = computeOrigin(x, y, z);
  const count = options.count ?? countLineStream(input);
  const offset = options.offset ?? 0;
  const sourceBase = options.sourceBase ?? 0;
  const capacity = Math.max(offset + count, options.capacity ?? 0, 4);
  const reusable =
    reuse && reuse.source.length >= capacity && reuse.points.length >= 4 * capacity
      ? reuse
      : undefined;
  const out = reusable ?? {
    source: new Int32Array(capacity),
    points: new Float32Array(4 * capacity),
  };
  runLineStream(input, lineCursor(offset), out, origin, sourceBase);
  return {
    vertexCount: count,
    source: out.source,
    instanceCount: Math.max(0, count - 3),
    origin,
    points: out.points,
    head: offset,
    sourceBase,
  };
}

/** Fill per-stream-vertex RGBA colors from per-input-point colors (sentinels get zeros). */
export function fillLineColors(
  layout: Pick<LineLayout, 'vertexCount' | 'source'> & { sourceBase?: number },
  color: ColorInput,
  out: Float32Array,
): void {
  const tmp = [0, 0, 0, 0];
  const base = layout.sourceBase ?? 0;
  for (let v = 0; v < layout.vertexCount; v++) {
    const serial = layout.source[v]!;
    const s = serial < 0 ? -1 : serial - base;
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
  layout: Pick<LineLayout, 'vertexCount' | 'source'> & { sourceBase?: number },
  width: ScalarInput,
  out: Float32Array,
): void {
  const base = layout.sourceBase ?? 0;
  for (let v = 0; v < layout.vertexCount; v++) {
    const s = layout.source[v]!;
    out[v] = s < 0 ? 0 : scalarAt(width, s - base, 1);
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
  layout: Pick<LineLayout, 'vertexCount' | 'source'> & { sourceBase?: number },
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
  const base = layout.sourceBase ?? 0;
  let prevX = 0;
  let prevY = 0;
  let prevOk = false;
  let phase = 0;
  for (let v = 0; v < layout.vertexCount; v++) {
    const serial = layout.source[v]!;
    if (serial < 0) {
      out[v * 2] = 0;
      out[v * 2 + 1] = 0;
      if (v > 0) out[(v - 1) * 2 + 1] = 0;
      prevOk = false;
      phase = 0;
      continue;
    }
    const s = serial - base;
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
