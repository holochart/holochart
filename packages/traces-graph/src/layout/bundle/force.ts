/**
 * Force-directed edge bundling (Holten and van Wijk 2009) for graphs without groups: links that
 * run alongside each other are pulled together into bundles, so a hairball shows its main streams.
 * Every link is cut into points; each point is attracted to the matching points of the links that
 * are compatible with its own, and springs along the link keep it smooth. The two ends never move.
 * Pure and deterministic: typed arrays in, routes out, only `+ − × ÷` and `Math.sqrt`, no random
 * numbers, and all bounds below are counts, never time.
 *
 * ## Which links attract each other
 *
 * The paper's edge compatibility, a number in [0, 1] that is the product of four:
 * - angle: `|cos|` of the angle between the two links (so two links that run in opposite
 *   directions are as compatible as two that run the same way);
 * - scale: `2 / (avg / min + max / avg)` of the two lengths (`avg` is their mean);
 * - position: `avg / (avg + distance between the midpoints)`;
 * - visibility: how much of each link is "seen" from the other, `min(V(P, Q), V(Q, P))` with
 *   `V(P, Q) = max(0, 1 − 2 · |Pm − Im| / |I0 − I1|)`, `I0 I1` the ends of Q projected on the line
 *   of P, `Im` their middle and `Pm` the middle of P.
 * Two links attract each other when the product is at least `compatibility` (default 0.6) and
 * not 0.
 *
 * The lists are built once, from the straight links ({@link linkCompatibility}), and bounded:
 * - candidates of a link are found through a uniform grid over the link midpoints (about two
 *   links per cell). The cells are visited in square rings of growing distance from the link's own
 *   cell, the cells of a ring row by row and the links of a cell in index order;
 * - the search stops after `candidates` links were examined (default 1,000), or at the ring that
 *   lies beyond the distance at which position and scale compatibility can still reach the
 *   threshold (1.25 link lengths at the default threshold), whichever comes first;
 * - the cheap tests come first (angle, scale, position), visibility last, each ending the test as
 *   soon as the product is below the threshold;
 * - a link keeps at most `maxNeighbours` (default 32) of what it found: the most compatible, ties
 *   by lower link index.
 * So the lists cost at most links × `candidates` tests, and a link in a dense place may not see
 * every compatible link: it sees its nearest ones. The lists are not symmetric (P may keep Q while
 * Q does not keep P).
 *
 * ## The model
 *
 * The paper's forces depend on the unit of the coordinates and overshoot when two points nearly
 * coincide. This model has no unit and cannot overshoot. For point `p_i` of link P, with `q` the
 * matching point of each neighbour Q (point `i` of Q, or point `n + 1 − i` when Q runs the other
 * way, which the well-known d3 plugin gets wrong):
 *
 * - attraction: `a = Σ C_PQ · w_Q · (q − p_i) / Σ w_Q`, with `w_Q = 1 / (|q − p_i| + eps)` and
 *   `eps` = {@link SOFTENING} × the mean link length. This is the paper's inverse-linear attraction
 *   divided by the sum of the weights, which makes it a weighted mean of the steps toward the
 *   neighbours: a point is never asked to go farther than its neighbours are;
 * - spring: `k · (p_i−1 + p_i+1 − 2 · p_i)` with `k = stiffness × r × ((n + 1) / 2)²`, where `r` is
 *   the mean link length over the link's own length, kept within 1/4 … 4 (the paper's `K / |P|`:
 *   short links are stiffer), and `n` is the number of points of the cycle. The factor
 *   `((n + 1) / 2)²` makes the spring a tension that is the same at every subdivision (the second
 *   difference shrinks with the square of the spacing), so that refining a link does not loosen it;
 * - move: `p_i += S · (strength · a + spring)`, all points at once from the old positions (Jacobi),
 *   so the order the links are stored in changes nothing but the tie-breaks above and the last
 *   bits of the sums. `S` is the cycle's step, lowered per link to `1 / (strength + 2 · k)` where
 *   it is larger. With that limit every new point is a weighted mean of old points: of itself, of
 *   its two neighbours along the link and of the matching points of its neighbours. So a point
 *   never jumps beyond the points that pull it, nothing leaves the convex hull of the link ends,
 *   and no value can become `NaN`.
 *
 * At rest, attraction and tension balance: a link of mean length joins its bundle along a curve
 * that closes the gap by a factor e every `√(stiffness / (4 · strength · C))` of its length (`C`
 * the compatibility of its neighbours), about a fifth of the link at the defaults. A higher
 * `stiffness` gives looser bundles and wider fans at the ends; `strength` 0 leaves every link
 * straight, at once.
 *
 * The schedule is the paper's: `cycles` cycles (default 6); the points per link double each cycle
 * (1, 2, 4, 8, 16, 32), re-spaced evenly along the link's current shape; the step halves each
 * cycle from {@link FIRST_STEP}; the iterations start at `iterations` (default 50) and shrink by
 * 2/3 each cycle (50, 33, 22, 15, 10, 7). After the last cycle the points are smoothed
 * `smoothing` times (default 1) with a `[1 2 1] / 4` kernel.
 *
 * The cost is links × `maxNeighbours` × 708 point steps at the defaults (708 = 1·50 + 2·33 + 4·22
 * + 8·15 + 16·10 + 32·7), so the size is capped: with more than `maxLinks` links that can be
 * bundled (default 20,000, which takes 3 to 4 s on a 2021 laptop, see `bench/bundle.bench.ts`)
 * nothing is computed, every link stays straight and the result says `refused`.
 *
 * ## What comes out
 *
 * A `'polyline'` route per bundled link: its two ends and the subdivision points between, thinned
 * with a Ramer–Douglas–Peucker pass that drops every point within `tolerance` (default 0.25
 * layout units, a quarter of a CSS px) of the segment between the kept points around it.
 *
 * Polylines and not cubic Bézier chains, by the number of vertices drawn. The `graph` trace draws
 * a polyline route with one vertex per point: 34 at most here, and 9 to 19 on average after
 * thinning (the benchmark's graphs in a square of 1,000 units). It draws a spline route with 12
 * segments per cubic piece: 13 vertices for one piece, 25 for two, 37 for three. A bundled link
 * leaves its node, turns into the bundle, runs along it and turns out again: two bends with a
 * straight stretch between, which one cubic cannot follow to a quarter of a px and which takes
 * three pieces or more to fit. So a fitted chain would draw two to four times the vertices, cost
 * a fit per link, and not be exact.
 *
 * These links stay straight (`undefined`): a self-link; a link with an end that is not a node or
 * has no finite position; a link of length 0; a link without a compatible neighbour; a link whose
 * bundled shape is within `tolerance` of the straight line.
 */
import type { LinkRoute } from '../types.ts';
import {
  DEFAULT_BUNDLE_STRENGTH,
  unit,
  whole,
  type BundleGraph,
  type BundlePositions,
} from './types.ts';

/** Options of {@link forceBundle}. */
export interface ForceBundleOptions {
  /**
   * 0 = straight links … 1 = fully bundled: the weight of the attraction against the springs.
   * Default 0.85.
   */
  readonly strength?: number;
  /**
   * Compatibility two links need to attract each other, 0 to 1 (see the module comment). Lower
   * values bundle more links, also ones that do not belong together; at 0 the search has no
   * distance limit and only `candidates` bounds it. Default 0.6.
   */
  readonly compatibility?: number;
  /**
   * Refinement cycles, 1 to 7: a link has `2^(cycles − 1)` subdivision points at the end.
   * Default 6 (32 points).
   */
  readonly cycles?: number;
  /**
   * Iterations of the first cycle, 1,000 at most; each later cycle runs two thirds of the one
   * before. Default 50.
   */
  readonly iterations?: number;
  /**
   * Stiffness of the links, 0 to 0.5: the paper's spring constant `K`. Higher values keep links
   * straighter and bundles looser. Default 0.1.
   */
  readonly stiffness?: number;
  /** Compatible links kept per link at most, the most compatible first. Default 32. */
  readonly maxNeighbours?: number;
  /** Links examined per link at most when looking for compatible ones. Default 1,000. */
  readonly candidates?: number;
  /**
   * Size cap: with more links that can be bundled than this, nothing is bundled and the result
   * says `refused`. Default 20,000.
   */
  readonly maxLinks?: number;
  /** `[1 2 1] / 4` smoothing passes over the final points, 0 to 8. Default 1. */
  readonly smoothing?: number;
  /**
   * Points of a route closer than this to the line through the points kept are dropped
   * (Ramer–Douglas–Peucker), in layout units. 0 keeps every subdivision point. Default 0.25.
   */
  readonly tolerance?: number;
}

/** What {@link forceBundle} returns. */
export interface ForceBundleResult {
  /** One entry per link (the indices of `graph.source`): a `'polyline'` route, or `undefined` for a straight link. */
  readonly routes: (LinkRoute | undefined)[];
  /** `'force'` when at least one link got a route, else `'none'`. */
  readonly method: 'force' | 'none';
  /** True when the graph is over `maxLinks`, so the links were left straight. */
  readonly refused: boolean;
}

/** The compatible links of every link, as {@link linkCompatibility} finds them. */
export interface LinkCompatibility {
  /** Number of links that can be bundled: two different nodes at finite positions, apart. */
  readonly bundleable: number;
  /** Mean length of those links. */
  readonly meanLength: number;
  /**
   * The neighbours of link `k` are entries `start[k] … start[k + 1] − 1` of the three arrays
   * below, the most compatible first (ties by lower link index).
   */
  readonly start: Int32Array;
  /** Link index of each neighbour. */
  readonly neighbour: Int32Array;
  /** Its compatibility with the link, `compatibility` (the threshold) to 1. */
  readonly compatibility: Float64Array;
  /** 1 when the neighbour runs the other way (its points are matched in reverse). */
  readonly opposite: Uint8Array;
}

/** The step of the first cycle: the share of the way to the balance point a point moves per iteration. */
export const FIRST_STEP = 0.5;

/**
 * The softening of the inverse-distance weights, as a share of the mean link length: neighbours
 * closer than this pull about equally.
 */
export const SOFTENING = 0.05;

/** Grid cells per side at most. */
const GRID_LIMIT = 2048;

const positive = (v: unknown, dflt: number): number =>
  typeof v === 'number' && v >= 0 && v < Infinity ? v : dflt;

/** The links as segments: ends, lengths, and which of them can be bundled. */
interface Segments {
  readonly links: number;
  readonly x0: Float64Array;
  readonly y0: Float64Array;
  readonly x1: Float64Array;
  readonly y1: Float64Array;
  readonly length: Float64Array;
  /** 1 for a link between two different nodes at finite positions that are apart. */
  readonly valid: Uint8Array;
  readonly count: number;
  readonly meanLength: number;
}

function segments(positions: BundlePositions, graph: BundleGraph): Segments {
  const n = Math.min(positions.x.length, positions.y.length);
  const links = Math.min(graph.source.length, graph.target.length);
  const x0 = new Float64Array(links);
  const y0 = new Float64Array(links);
  const x1 = new Float64Array(links);
  const y1 = new Float64Array(links);
  const length = new Float64Array(links);
  const valid = new Uint8Array(links);
  let count = 0;
  let sum = 0;
  for (let k = 0; k < links; k++) {
    const s = graph.source[k]!;
    const t = graph.target[k]!;
    if (!(s >= 0 && s < n && t >= 0 && t < n) || s === t) continue;
    const ax = positions.x[s]!;
    const ay = positions.y[s]!;
    const bx = positions.x[t]!;
    const by = positions.y[t]!;
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.sqrt(dx * dx + dy * dy);
    // Also false for NaN (a missing position) and for Infinity (coordinates too large to square).
    if (!(l > 0 && l < Infinity)) continue;
    x0[k] = ax;
    y0[k] = ay;
    x1[k] = bx;
    y1[k] = by;
    length[k] = l;
    valid[k] = 1;
    count++;
    sum += l;
  }
  return { links, x0, y0, x1, y1, length, valid, count, meanLength: count > 0 ? sum / count : 0 };
}

/** How much of segment A is seen from segment B: the paper's `V(A, B)`. */
function visibility(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number {
  const ux = bx - ax;
  const uy = by - ay;
  const uu = ux * ux + uy * uy;
  // The ends of the other segment along this one, as shares of its length.
  const t0 = ((cx - ax) * ux + (cy - ay) * uy) / uu;
  const t1 = ((dx - ax) * ux + (dy - ay) * uy) / uu;
  const span = Math.abs(t1 - t0);
  if (!(span > 0)) return 0;
  const v = 1 - (2 * Math.abs(0.5 - (t0 + t1) / 2)) / span;
  return v > 0 ? v : 0;
}

/**
 * The compatibility of two segments (`a → b` of length `la`, `c → d` of length `lc`), or 0 as soon
 * as the product of the measures tested so far is below `threshold`.
 */
function staged(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  la: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  lc: number,
  threshold: number,
): number {
  const dot = (bx - ax) * (dx - cx) + (by - ay) * (dy - cy);
  let c = Math.abs(dot) / (la * lc);
  if (c > 1) c = 1;
  if (!(c >= threshold)) return 0;
  const avg = (la + lc) / 2;
  c *= 2 / (avg / Math.min(la, lc) + Math.max(la, lc) / avg);
  if (!(c >= threshold)) return 0;
  const mx = (ax + bx) / 2 - (cx + dx) / 2;
  const my = (ay + by) / 2 - (cy + dy) / 2;
  c *= avg / (avg + Math.sqrt(mx * mx + my * my));
  if (!(c >= threshold)) return 0;
  c *= Math.min(
    visibility(ax, ay, bx, by, cx, cy, dx, dy),
    visibility(cx, cy, dx, dy, ax, ay, bx, by),
  );
  return c >= threshold ? c : 0;
}

/**
 * The paper's compatibility of two links given by their ends, 0 to 1: the product of the angle,
 * scale, position and visibility compatibilities (see the module comment). 0 when either link has
 * no length. Symmetric, and the same when either link is reversed.
 */
export function edgeCompatibility(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  const la = Math.sqrt((a[2] - a[0]) * (a[2] - a[0]) + (a[3] - a[1]) * (a[3] - a[1]));
  const lb = Math.sqrt((b[2] - b[0]) * (b[2] - b[0]) + (b[3] - b[1]) * (b[3] - b[1]));
  if (!(la > 0 && la < Infinity && lb > 0 && lb < Infinity)) return 0;
  return staged(a[0], a[1], a[2], a[3], la, b[0], b[1], b[2], b[3], lb, 0);
}

/**
 * The longest a compatible link can be relative to this one: the ratio at which the scale
 * compatibility alone falls to `threshold`.
 */
function scaleReach(threshold: number): number {
  // 2 / ((1 + r) / 2 + 2r / (1 + r)) = threshold  ⇔  r² + (6 − 2c) · r + (1 − 2c) = 0, c = 2 / threshold.
  const c = 2 / threshold;
  const b = 6 - 2 * c;
  return (-b + Math.sqrt(b * b - 4 * (1 - 2 * c))) / 2;
}

function lists(seg: Segments, options: ForceBundleOptions): LinkCompatibility {
  const { links, x0, y0, x1, y1, length, valid, count } = seg;
  const threshold = unit(options.compatibility, 0.6);
  // Never more than there are other links, whatever the options say.
  const budget = Math.min(whole(options.candidates, 1000, 1), Math.max(1, count - 1));
  const keep = Math.min(whole(options.maxNeighbours, 32, 1), budget);
  const start = new Int32Array(links + 1);
  if (count < 2) {
    return {
      bundleable: count,
      meanLength: seg.meanLength,
      start,
      neighbour: new Int32Array(0),
      compatibility: new Float64Array(0),
      opposite: new Uint8Array(0),
    };
  }

  // The grid over the midpoints: about two links per cell.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < links; k++) {
    if (valid[k] !== 1) continue;
    const mx = (x0[k]! + x1[k]!) / 2;
    const my = (y0[k]! + y1[k]!) / 2;
    if (mx < minX) minX = mx;
    if (mx > maxX) maxX = mx;
    if (my < minY) minY = my;
    if (my > maxY) maxY = my;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  let size =
    width > 0 && height > 0
      ? Math.sqrt((width * height * 2) / count)
      : (Math.max(width, height) * 2) / count;
  if (!(size > 0 && size < Infinity)) size = 1;
  const cols = Math.max(1, Math.min(GRID_LIMIT, Math.floor(width / size) + 1));
  const rows = Math.max(1, Math.min(GRID_LIMIT, Math.floor(height / size) + 1));
  const cellOf = new Int32Array(links);
  const cellStart = new Int32Array(cols * rows + 1);
  for (let k = 0; k < links; k++) {
    if (valid[k] !== 1) continue;
    const cx = Math.min(cols - 1, Math.floor(((x0[k]! + x1[k]!) / 2 - minX) / size));
    const cy = Math.min(rows - 1, Math.floor(((y0[k]! + y1[k]!) / 2 - minY) / size));
    const cell = cy * cols + cx;
    cellOf[k] = cell;
    cellStart[cell + 1]!++;
  }
  for (let c = 0; c < cols * rows; c++) cellStart[c + 1]! += cellStart[c]!;
  // Filled in index order, so the links of a cell are in index order.
  const cellLinks = new Int32Array(count);
  const fill = cellStart.slice(0, cols * rows);
  for (let k = 0; k < links; k++) if (valid[k] === 1) cellLinks[fill[cellOf[k]!]!++] = k;

  // Position compatibility is avg / (avg + d): at least the threshold only for
  // d ≤ avg · (1 − threshold) / threshold, and avg is bounded through the scale compatibility.
  const reach =
    threshold > 0 ? (((1 + scaleReach(threshold)) / 2) * (1 - threshold)) / threshold : Infinity;

  let capacity = Math.max(16, count * Math.min(keep, 8));
  let neighbour = new Int32Array(capacity);
  let compatibility = new Float64Array(capacity);
  let opposite = new Uint8Array(capacity);
  let used = 0;
  const bestLink = new Int32Array(keep);
  const bestValue = new Float64Array(keep);

  for (let k = 0; k < links; k++) {
    start[k] = used;
    if (valid[k] !== 1) continue;
    const ax = x0[k]!;
    const ay = y0[k]!;
    const bx = x1[k]!;
    const by = y1[k]!;
    const la = length[k]!;
    const radius = la * reach;
    const cell = cellOf[k]!;
    const cx = cell % cols;
    const cy = (cell - cx) / cols;
    const lastRing = Math.max(cx, cols - 1 - cx, cy, rows - 1 - cy);
    let examined = 0;
    let best = 0;
    // Every cell of ring r is at least (r − 1) cells away from any point of the link's own cell.
    search: for (let r = 0; r <= lastRing && (r - 1) * size <= radius; r++) {
      const top = cy - r;
      const bottom = cy + r;
      for (let yy = Math.max(0, top); yy <= Math.min(rows - 1, bottom); yy++) {
        // The first and last row of the ring are whole; the rows between are its two sides.
        const full = yy === top || yy === bottom;
        const from = Math.max(0, cx - r);
        const to = Math.min(cols - 1, cx + r);
        for (let xx = from; xx <= to; xx++) {
          if (!full && xx !== cx - r && xx !== cx + r) {
            // Jump over the inside of the ring.
            xx = Math.max(xx, cx + r - 1);
            continue;
          }
          const c = yy * cols + xx;
          for (let e = cellStart[c]!; e < cellStart[c + 1]!; e++) {
            const q = cellLinks[e]!;
            if (q === k) continue;
            if (examined >= budget) break search;
            examined++;
            const value = staged(
              ax,
              ay,
              bx,
              by,
              la,
              x0[q]!,
              y0[q]!,
              x1[q]!,
              y1[q]!,
              length[q]!,
              threshold,
            );
            if (!(value > 0)) continue;
            // Insert into the best so far: by compatibility, then by lower index.
            let at = best;
            if (best === keep) {
              const lastValue = bestValue[keep - 1]!;
              if (value < lastValue || (value === lastValue && q > bestLink[keep - 1]!)) continue;
              at = keep - 1;
            } else {
              best++;
            }
            while (
              at > 0 &&
              (bestValue[at - 1]! < value || (bestValue[at - 1] === value && bestLink[at - 1]! > q))
            ) {
              bestValue[at] = bestValue[at - 1]!;
              bestLink[at] = bestLink[at - 1]!;
              at--;
            }
            bestValue[at] = value;
            bestLink[at] = q;
          }
        }
      }
    }
    if (used + best > capacity) {
      capacity = Math.max(2 * capacity, used + best);
      const grownLinks = new Int32Array(capacity);
      grownLinks.set(neighbour.subarray(0, used));
      neighbour = grownLinks;
      const grownValues = new Float64Array(capacity);
      grownValues.set(compatibility.subarray(0, used));
      compatibility = grownValues;
      const grownFlags = new Uint8Array(capacity);
      grownFlags.set(opposite.subarray(0, used));
      opposite = grownFlags;
    }
    for (let j = 0; j < best; j++) {
      const q = bestLink[j]!;
      neighbour[used] = q;
      compatibility[used] = bestValue[j]!;
      const dot = (bx - ax) * (x1[q]! - x0[q]!) + (by - ay) * (y1[q]! - y0[q]!);
      opposite[used] = dot < 0 ? 1 : 0;
      used++;
    }
  }
  start[links] = used;
  return {
    bundleable: count,
    meanLength: seg.meanLength,
    start,
    neighbour: neighbour.slice(0, used),
    compatibility: compatibility.slice(0, used),
    opposite: opposite.slice(0, used),
  };
}

/**
 * The compatible links of every link, from the straight links: the first, bounded step of
 * {@link forceBundle} (see the module comment for the compatibility and the bounds). Reads the
 * options `compatibility`, `candidates` and `maxNeighbours`; it does not apply `maxLinks`.
 */
export function linkCompatibility(
  positions: BundlePositions,
  graph: BundleGraph,
  options: ForceBundleOptions = {},
): LinkCompatibility {
  return lists(segments(positions, graph), options);
}

/**
 * Ramer–Douglas–Peucker over points `0 … last` of a flat polyline at `base`: marks in `kept` the
 * points to keep so that every dropped point is within `tolerance` of the segment between the kept
 * points around it. The farthest point of a stretch is kept first; of two equally far ones, the
 * earlier. Returns the number of points kept.
 */
function thin(
  points: Float64Array,
  base: number,
  last: number,
  tolerance: number,
  kept: Uint8Array,
  stack: Int32Array,
): number {
  kept.fill(0, 0, last + 1);
  kept[0] = 1;
  kept[last] = 1;
  let count = 2;
  const limit = tolerance * tolerance;
  let top = 0;
  stack[top++] = 0;
  stack[top++] = last;
  while (top > 0) {
    const b = stack[--top]!;
    const a = stack[--top]!;
    if (b - a < 2) continue;
    const ax = points[base + 2 * a]!;
    const ay = points[base + 2 * a + 1]!;
    const ux = points[base + 2 * b]! - ax;
    const uy = points[base + 2 * b + 1]! - ay;
    const uu = ux * ux + uy * uy;
    let far = -1;
    let farthest = limit;
    for (let i = a + 1; i < b; i++) {
      const vx = points[base + 2 * i]! - ax;
      const vy = points[base + 2 * i + 1]! - ay;
      // The closest point of the segment, as a share of it.
      let t = uu > 0 ? (vx * ux + vy * uy) / uu : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const ex = vx - t * ux;
      const ey = vy - t * uy;
      const d = ex * ex + ey * ey;
      if (d > farthest) {
        farthest = d;
        far = i;
      }
    }
    if (far < 0) continue;
    kept[far] = 1;
    count++;
    stack[top++] = a;
    stack[top++] = far;
    stack[top++] = far;
    stack[top++] = b;
  }
  return count;
}

/**
 * Force-directed edge bundling: a `'polyline'` route for every link that was pulled into a bundle
 * and `undefined` for a link that stays straight. See the module comment for the model, its
 * bounds and which links stay straight.
 *
 * `refused` is true, with every route `undefined` and `method: 'none'`, when the graph has more
 * than `maxLinks` links that can be bundled.
 */
export function forceBundle(
  positions: BundlePositions,
  graph: BundleGraph,
  options: ForceBundleOptions = {},
): ForceBundleResult {
  const links = Math.min(graph.source.length, graph.target.length);
  const routes = new Array<LinkRoute | undefined>(links).fill(undefined);
  const strength = unit(options.strength, DEFAULT_BUNDLE_STRENGTH);
  if (links === 0 || strength === 0) return { routes, method: 'none', refused: false };
  const seg = segments(positions, graph);
  if (seg.count > whole(options.maxLinks, 20000, 0)) {
    return { routes, method: 'none', refused: true };
  }
  const { start, neighbour, compatibility, opposite } = lists(seg, options);
  if (neighbour.length === 0) return { routes, method: 'none', refused: false };

  const { x0, y0, x1, y1, valid } = seg;
  const cycles = Math.min(7, whole(options.cycles, 6, 1));
  const stiffness = Math.min(0.5, positive(options.stiffness, 0.1));
  const smoothing = Math.min(8, whole(options.smoothing, 1, 0));
  const tolerance = positive(options.tolerance, 0.25);
  const eps = SOFTENING * seg.meanLength;
  let iterations = Math.min(1000, whole(options.iterations, 50, 0));

  // The stiffness of each link at one subdivision point: the paper's K / |P|, without a unit.
  const spring = new Float64Array(links);
  for (let k = 0; k < links; k++) {
    if (valid[k] !== 1) continue;
    const ratio = seg.meanLength / seg.length[k]!;
    spring[k] = stiffness * Math.min(4, Math.max(0.25, ratio));
  }

  // Points of every link, ends included, in two buffers: one is read while the other is written,
  // then they swap. A link has `stride` numbers at the same place in both; the stride is that of
  // the cycle, so that the early cycles, which have few points, work in little memory.
  const most = 2 ** (cycles - 1);
  let stride = 4;
  let cur = new Float64Array(links * 2 * (most + 2));
  let next = new Float64Array(links * 2 * (most + 2));
  const sumX = new Float64Array(most + 2);
  const sumY = new Float64Array(most + 2);
  const sumW = new Float64Array(most + 2);
  const along = new Float64Array(most + 2);

  let n = 1;
  let step = FIRST_STEP;
  for (let cycle = 0; cycle < cycles; cycle++) {
    // Subdivide: `n` points evenly along each link's current shape (its straight line at first,
    // and always for a link that nothing attracts).
    const old = n / 2;
    const oldStride = stride;
    stride = 2 * (n + 2);
    for (let k = 0; k < links; k++) {
      if (valid[k] !== 1) continue;
      const base = k * stride;
      const was = k * oldStride;
      const ax = x0[k]!;
      const ay = y0[k]!;
      const bx = x1[k]!;
      const by = y1[k]!;
      next[base] = ax;
      next[base + 1] = ay;
      next[base + 2 * n + 2] = bx;
      next[base + 2 * n + 3] = by;
      if (cycle === 0 || start[k] === start[k + 1]) {
        for (let i = 1; i <= n; i++) {
          const f = i / (n + 1);
          next[base + 2 * i] = ax + f * (bx - ax);
          next[base + 2 * i + 1] = ay + f * (by - ay);
        }
        continue;
      }
      // Length along the old polyline at each of its points (old + 2 of them).
      let total = 0;
      along[0] = 0;
      for (let i = 1; i <= old + 1; i++) {
        const dx = cur[was + 2 * i]! - cur[was + 2 * i - 2]!;
        const dy = cur[was + 2 * i + 1]! - cur[was + 2 * i - 1]!;
        total += Math.sqrt(dx * dx + dy * dy);
        along[i] = total;
      }
      let at = 1;
      for (let i = 1; i <= n; i++) {
        const want = (total * i) / (n + 1);
        while (at < old + 1 && along[at]! < want) at++;
        const before = along[at - 1]!;
        const span = along[at]! - before;
        const f = span > 0 ? (want - before) / span : 0;
        const px = cur[was + 2 * at - 2]!;
        const py = cur[was + 2 * at - 1]!;
        next[base + 2 * i] = px + f * (cur[was + 2 * at]! - px);
        next[base + 2 * i + 1] = py + f * (cur[was + 2 * at + 1]! - py);
      }
    }
    cur.set(next.subarray(0, links * stride));
    const tension = ((n + 1) / 2) * ((n + 1) / 2);

    for (let iteration = 0; iteration < iterations; iteration++) {
      const from = cur;
      const into = next;
      for (let k = 0; k < links; k++) {
        const first = start[k]!;
        const end = start[k + 1]!;
        if (first === end) continue;
        const base = k * stride;
        for (let i = 1; i <= n; i++) {
          sumX[i] = 0;
          sumY[i] = 0;
          sumW[i] = 0;
        }
        for (let e = first; e < end; e++) {
          const c = compatibility[e]!;
          // The matching point of a neighbour that runs the other way is counted from its end.
          const flip = opposite[e] === 1;
          let q = neighbour[e]! * stride + (flip ? 2 * n : 2);
          const hop = flip ? -2 : 2;
          let p = base + 2;
          for (let i = 1; i <= n; i++) {
            const dx = from[q]! - from[p]!;
            const dy = from[q + 1]! - from[p + 1]!;
            const w = 1 / (Math.sqrt(dx * dx + dy * dy) + eps);
            const cw = c * w;
            sumX[i]! += cw * dx;
            sumY[i]! += cw * dy;
            sumW[i]! += w;
            q += hop;
            p += 2;
          }
        }
        const k2 = spring[k]! * tension;
        const move = Math.min(step, 1 / (strength + 2 * k2));
        for (let i = 1; i <= n; i++) {
          const at = base + 2 * i;
          const px = from[at]!;
          const py = from[at + 1]!;
          const w = sumW[i]!;
          const pullX = w > 0 ? (strength * sumX[i]!) / w : 0;
          const pullY = w > 0 ? (strength * sumY[i]!) / w : 0;
          const tightX = k2 * (from[at - 2]! + from[at + 2]! - 2 * px);
          const tightY = k2 * (from[at - 1]! + from[at + 3]! - 2 * py);
          into[at] = px + move * (pullX + tightX);
          into[at + 1] = py + move * (pullY + tightY);
        }
      }
      cur = into;
      next = from;
    }

    if (cycle + 1 < cycles) {
      n *= 2;
      step /= 2;
      iterations = Math.round((iterations * 2) / 3);
    }
  }

  for (let pass = 0; pass < smoothing; pass++) {
    for (let k = 0; k < links; k++) {
      if (start[k] === start[k + 1]) continue;
      const base = k * stride;
      for (let i = 1; i <= n; i++) {
        const at = base + 2 * i;
        next[at] = (cur[at - 2]! + 2 * cur[at]! + cur[at + 2]!) / 4;
        next[at + 1] = (cur[at - 1]! + 2 * cur[at + 1]! + cur[at + 3]!) / 4;
      }
    }
    const swap = cur;
    cur = next;
    next = swap;
  }

  const kept = new Uint8Array(n + 2);
  const stack = new Int32Array(4 * (n + 2));
  let bundled = false;
  for (let k = 0; k < links; k++) {
    if (start[k] === start[k + 1]) continue;
    const base = k * stride;
    let count = n + 2;
    if (tolerance > 0) count = thin(cur, base, n + 1, tolerance, kept, stack);
    else kept.fill(1);
    if (count < 3) continue;
    const points = new Float64Array(2 * count);
    let at = 0;
    for (let i = 0; i <= n + 1; i++) {
      if (kept[i] !== 1) continue;
      points[at++] = cur[base + 2 * i]!;
      points[at++] = cur[base + 2 * i + 1]!;
    }
    routes[k] = { points, kind: 'polyline' };
    bundled = true;
  }
  return { routes, method: bundled ? 'force' : 'none', refused: false };
}
