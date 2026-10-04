/**
 * Screen-space join / cap geometry for the line primitive — a line-by-line CPU mirror of the
 * vertex + fragment shader logic in `line.glsl.ts`, used by unit tests (no WebGL in tests).
 *
 * ## How joins work without overlap
 *
 * Every segment instance is a screen-space quad around its segment, extended at each end far
 * enough to hold the join/cap. The fragment shader evaluates a signed distance to the stroke and
 * clips the segment at the **join bisector**: segment `i` owns the half-plane after the bisector
 * at its start vertex and before the bisector at its end vertex. The two segments meeting at a
 * vertex compute that bisector from bit-identical inputs, so each pixel is shaded by exactly one
 * of them — translucent lines get no double-blended seams at joins.
 *
 * With the ownership clip in place the join styles fall out as:
 * - **miter**: each segment's infinite stroke strip, clipped by the bisector (the strips meet at
 *   the miter tip). Falls back to bevel when `1 / cos(θ/2) > miterLimit` (SVG semantics).
 * - **bevel**: the strip additionally clipped by the line through both outer corners.
 * - **round**: the strip cut at the vertex (butt) united with a disc of radius `width / 2`.
 *
 * Known limit: when a segment is shorter than about `width/2 · tan(θ/2)` at a sharp turn, the
 * bisectors at its two ends cross inside the stroke and small slivers can be missed or doubled.
 */

/** Join style between consecutive segments. */
export type LineJoin = 'miter' | 'round' | 'bevel';
/** Cap style at polyline ends (and at dash ends). */
export type LineCap = 'butt' | 'round' | 'square';

/** End modes shared with the shader (`vEndA.w` / `vEndB.w`). */
export const END_MITER = 0;
export const END_BUTT = 1;
export const END_SQUARE = 2;
export const END_ROUND = 3;
export const END_BEVEL = 4;

/**
 * Offset (px) of the join ownership boundary; mirrors `OWN_EPS` in `line.glsl.ts`. Keeps the boundary
 * off pixel centers so rounding differences between the two segments' tangents can't make both
 * discard the same pixel (see the shader comment).
 */
export const OWN_EPS = 1 / 512;

/**
 * How far the quad of a segment extends past the stroke's sides, in units of the anti-aliasing
 * ramp `aa` (one device px). Coverage is `clamp(0.5 - d / aa, 0, 1)` and `d` is at least the
 * distance to the stroke's sides, so no pixel whose center is further than
 * `halfWidth + 0.5 * aa` from the segment's axis is drawn; the other half is {@link QUAD_SLACK}.
 * Mirrored in `line.glsl.ts`.
 */
export const QUAD_FRINGE = 1;

/**
 * Room around the centers of the pixels a segment draws, in units of `aa`: half a device px. The
 * canvas is multisampled, and a pixel at the edge of a quad is only written to the samples the
 * quad covers; with half a pixel of room every sample of every drawn pixel is inside (4× and 8×
 * sample positions lie within 0.47 px of the center). With less, joins show pin holes.
 */
export const QUAD_SLACK = 0.5;

/**
 * How far the quad of a segment reaches beyond a vertex along the segment's axis (px): far enough
 * for every pixel the segment draws there, and no further (mirror of the shader's `computeEnd`
 * return value).
 *
 * - **Cap**: the cap's shape (nothing for butt, `halfWidth` for round and square) and its fringe.
 *   With round joins a butt cap reaches `halfWidth` too: on a segment shorter than that, the disc
 *   of the join at its other end covers pixels behind the cap.
 * - **Join**: the segment draws only after the bisector through the vertex (the ownership split).
 *   Within the stroke and its fringe, `|perp| < halfWidth + 0.5 * aa`, the bisector lies at most
 *   `(halfWidth + 0.5 * aa) * tan(θ/2)` behind the vertex: at a gentle turn the quad ends half a
 *   pixel past the vertex instead of `halfWidth + aa` past it. Capped at the join shape plus a
 *   full ramp (`extent + aa`, the quad before plan E16.9), so a sharp miter's quad is what it
 *   was.
 *
 * Every pixel the former quad drew is at least {@link QUAD_SLACK} inside this one, so the two draw
 * the same image (`line-join.test.ts`, and the visual baselines). The shader uses this reach only
 * for a segment whose ends have the same depth: the quad's corners carry the end points' depths,
 * so a segment that crosses depths (a 2.5D view, a 3D scene) keeps the former quad.
 */
export function quadReach(
  end: SegmentEnd,
  halfWidth: number,
  aa: number,
  join: LineJoin = 'miter',
): number {
  const fringe = QUAD_FRINGE * aa;
  if (end.tangent[0] === 0 && end.tangent[1] === 0) {
    return (end.mode === END_BUTT && join !== 'round' ? 0 : halfWidth) + fringe;
  }
  // `bevel` is halfWidth · cos(θ/2).
  const cosHalf = halfWidth > 0 ? Math.min(1, end.bevel / halfWidth) : 0;
  const tanHalf = Math.sqrt(Math.max(0, 1 - cosHalf * cosHalf)) / Math.max(cosHalf, 1e-4);
  return Math.min(end.extent + aa, (halfWidth + fringe) * tanHalf + QUAD_SLACK * aa);
}

/** Shader uniform codes. */
export const JOIN_CODE: Record<LineJoin, number> = { miter: 0, round: 1, bevel: 2 };
export const CAP_CODE: Record<LineCap, number> = { butt: 0, round: 1, square: 2 };

type V2 = readonly [number, number];

/** Per-end data handed from the vertex to the fragment stage. */
export interface SegmentEnd {
  /** Unit bisector tangent (ownership normal); `[0, 0]` for a cap. */
  tangent: [number, number];
  /** Outer bisector normal, for the bevel clip. */
  outer: [number, number];
  /** Distance from the vertex to the bevel line along `outer`. */
  bevel: number;
  /** One of the END_* codes. */
  mode: number;
  /** How far the quad extends beyond the vertex along the segment axis (excl. AA margin). */
  extent: number;
}

/** Everything the fragment stage needs for one segment (screen px). */
export interface SegmentFrame {
  a: [number, number];
  b: [number, number];
  dir: [number, number];
  len: number;
  halfWidth: number;
  startEnd: SegmentEnd;
  endEnd: SegmentEnd;
}

function sub(p: V2, q: V2): [number, number] {
  return [p[0] - q[0], p[1] - q[1]];
}

function safeNormalize(v: V2, fallback: V2): [number, number] {
  const l = Math.hypot(v[0], v[1]);
  return l > 1e-6 ? [v[0] / l, v[1] / l] : [fallback[0], fallback[1]];
}

/**
 * Join/cap data at one vertex. `dIn` is the direction arriving at the vertex, `dOut` the direction
 * leaving it; both segments sharing the vertex call this with the same arguments.
 */
export function computeEnd(
  dIn: V2,
  dOut: V2,
  isJoin: boolean,
  halfWidth: number,
  join: LineJoin,
  cap: LineCap,
  miterLimit: number,
): SegmentEnd {
  if (!isJoin) {
    const mode = cap === 'butt' ? END_BUTT : cap === 'round' ? END_ROUND : END_SQUARE;
    return { tangent: [0, 0], outer: [0, 0], bevel: 0, mode, extent: halfWidth };
  }
  const tangent = safeNormalize([dIn[0] + dOut[0], dIn[1] + dOut[1]], dOut);
  const c = Math.min(1, Math.max(-1, dIn[0] * dOut[0] + dIn[1] * dOut[1]));
  const cosHalf = Math.sqrt(0.5 * (1 + c));
  let mode = join === 'miter' ? END_MITER : join === 'round' ? END_ROUND : END_BEVEL;
  if (mode === END_MITER && cosHalf * miterLimit < 1) mode = END_BEVEL;
  const turn = Math.sign(dIn[0] * dOut[1] - dIn[1] * dOut[0]);
  // Left turn (turn > 0) → the outer side is the right-hand side of the bisector tangent.
  const outer: [number, number] = [turn * tangent[1], -turn * tangent[0]];
  const tanHalf = Math.sqrt(Math.max(0, 1 - cosHalf * cosHalf)) / Math.max(cosHalf, 1e-4);
  const extent = mode === END_MITER ? Math.max(halfWidth, halfWidth * tanHalf) : halfWidth;
  return { tangent, outer, bevel: halfWidth * cosHalf, mode, extent };
}

/**
 * Vertex-stage mirror: build the frame of segment `a → b` given optional neighbors (screen px).
 */
export function computeSegmentFrame(
  prev: V2 | undefined,
  a: V2,
  b: V2,
  next: V2 | undefined,
  width: number,
  join: LineJoin,
  cap: LineCap,
  miterLimit: number,
): SegmentFrame {
  const dir = safeNormalize(sub(b, a), [1, 0]);
  const dIn = prev ? safeNormalize(sub(a, prev), dir) : dir;
  const dOut = next ? safeNormalize(sub(next, b), dir) : dir;
  const hw = width / 2;
  return {
    a: [a[0], a[1]],
    b: [b[0], b[1]],
    dir,
    len: Math.hypot(b[0] - a[0], b[1] - a[1]),
    halfWidth: hw,
    startEnd: computeEnd(dIn, dir, prev !== undefined, hw, join, cap, miterLimit),
    endEnd: computeEnd(dir, dOut, next !== undefined, hw, join, cap, miterLimit),
  };
}

function endDistance(end: SegmentEnd, rel: V2, beyond: number, hw: number): number {
  switch (end.mode) {
    case END_BUTT:
    case END_ROUND:
      return beyond;
    case END_SQUARE:
      return beyond - hw;
    case END_BEVEL:
      return rel[0] * end.outer[0] + rel[1] * end.outer[1] - end.bevel;
    default:
      return -Infinity; // miter: only the ownership clip bounds it
  }
}

/**
 * Fragment-stage mirror: signed distance (px, negative inside) from `p` to this segment's share of
 * the stroke, or `undefined` when `p` is owned by a neighbouring segment.
 */
export function segmentDistance(frame: SegmentFrame, p: V2): number | undefined {
  const { a, b, dir, len, halfWidth: hw, startEnd, endEnd } = frame;
  const rel = sub(p, a);
  const relB = sub(p, b);
  if (startEnd.tangent[0] !== 0 || startEnd.tangent[1] !== 0) {
    if (rel[0] * startEnd.tangent[0] + rel[1] * startEnd.tangent[1] < OWN_EPS) return undefined;
  }
  if (endEnd.tangent[0] !== 0 || endEnd.tangent[1] !== 0) {
    if (relB[0] * endEnd.tangent[0] + relB[1] * endEnd.tangent[1] >= OWN_EPS) return undefined;
  }
  const t = rel[0] * dir[0] + rel[1] * dir[1];
  const perp = -rel[0] * dir[1] + rel[1] * dir[0];
  let d = Math.abs(perp) - hw;
  d = Math.max(d, endDistance(startEnd, rel, -t, hw));
  d = Math.max(d, endDistance(endEnd, relB, t - len, hw));
  if (startEnd.mode === END_ROUND) d = Math.min(d, Math.hypot(rel[0], rel[1]) - hw);
  if (endEnd.mode === END_ROUND) d = Math.min(d, Math.hypot(relB[0], relB[1]) - hw);
  return d;
}
