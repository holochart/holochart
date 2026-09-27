/**
 * Contour label placement and line clipping, in screen pixels: a port of the label optimizer of
 * Plotly `contour/plot.js` (`makeLinesAndLabels`, `findBestTextLocation`, `locationCost`,
 * `addLabelData`) and `lib/geometry2d.js` (`getVisibleSegment`, `getTextLocation`,
 * `segmentDistance`). Pure.
 *
 * Callers convert the contour paths to px (x right, y UP — viewport world coordinates) and measure
 * each level's label text. {@link placeContourLabels} then, level by level and path by path:
 *
 * - finds the part of the path inside `bounds` (the plot area ∩ the data extent) to within half a
 *   text height, and skips paths whose visible part is shorter than `LABELMIN`·(width + height);
 * - allows `min(ceil(visible / normLength), LABELMAX)` labels on it, with `normLength =
 *   LABELDISTANCE · plot diagonal / max(1, levels / LABELINCREASE)`;
 * - places them one at a time, each at the minimum of Plotly's cost (edge proximity, squared angle
 *   off horizontal, distance to the labels already placed — much larger for the same level)
 *   found by a coarse scan of `INITIALSEARCHPOINTS` positions refined over `ITERATIONS` rounds,
 *   stopping at the first label costing more than `MAXCOST`.
 *
 * Each label sits at the average of its center point and the ends of the text chord
 * (`(4·pc + p0 + p1) / 6`), rotated along that chord. Its stored box — what later labels measure
 * against and what clips the lines — is `(width + fontSize/3) × max(0, height − fontSize/3)`.
 * {@link clipPolylineByBoxes} removes every line exactly under the label boxes (Plotly's SVG clip
 * path), for all levels.
 *
 * Deviations from Plotly: paths are polylines (`getPointAtLength` is linear interpolation);
 * `getVisibleSegment` steps by at least 1e-3 px so that a zero text height cannot stall it;
 * overlapping boxes both clip (Plotly's clip path is even-odd, but placed labels never overlap);
 * lines are not clipped to `bounds` (they lie within the data extent, and the subplot clips the
 * rest); `angle` is reported in degrees within (−90, 90] (Plotly's θ = −90° is the same box).
 *
 * {@link cutPath} (removing arc-length intervals from a polyline) is kept as a general utility.
 */

/** A path to label, in px (y up). */
export interface LabelPath {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  closed: boolean;
  /** Index of the path's level (into the `sizes` of {@link placeContourLabels}). */
  level: number;
}

/** A level's measured label text, px. */
export interface LabelSize {
  width: number;
  height: number;
  /** The label font size, px (pads the stored box: Plotly `addLabelData`). */
  fontSize: number;
}

/** A rectangle in px (y up); the corners may come in any order. */
export interface PlotRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A label box: centered at (x, y), `width` along the text, rotated by `angle`. */
export interface LabelBox {
  /** Center, px, y up. */
  x: number;
  y: number;
  /** Rotation in degrees, clockwise positive on screen (Plotly `textangle`), in (−90, 90]. */
  angle: number;
  /** Box size, px: the text size padded as Plotly `addLabelData` does. */
  width: number;
  height: number;
}

/** One placed label; its box is what clips the lines. */
export interface ContourLabel extends LabelBox {
  /** Index of the labelled path. */
  path: number;
  /** Its level (index into `sizes`). */
  level: number;
}

/** Options of {@link placeContourLabels}. */
export interface LabelOptions {
  /** The data extent, px (Plotly `bounds`), intersected with the plot. Default: the plot. */
  bounds?: PlotRect | undefined;
}

/** Result of {@link placeContourLabels}. */
export interface LabelPlacement {
  /** Labels in placement order; pass them to {@link clipPolylineByBoxes} to clip the lines. */
  labels: ContourLabel[];
}

/** Plotly `contour/constants.js`. */
export const LABEL_CONSTANTS = {
  /** Length of a contour, as a multiple of the plot diagonal, per label. */
  LABELDISTANCE: 2,
  /** Number of levels after which labels get more frequent. */
  LABELINCREASE: 10,
  /** Minimum visible path length, as a multiple of (text width + height), to get any label. */
  LABELMIN: 3,
  /** Max labels on one path. */
  LABELMAX: 10,
  /** Cost function weights (`LABELOPTIMIZER`). */
  EDGECOST: 1,
  ANGLECOST: 1,
  NEIGHBORCOST: 5,
  SAMELEVELFACTOR: 10,
  SAMELEVELDISTANCE: 5,
  MAXCOST: 100,
  INITIALSEARCHPOINTS: 10,
  ITERATIONS: 5,
} as const;

const C = LABEL_CONSTANTS;

/** Cumulative arc lengths; closed paths get an extra entry for the closing segment. */
function arcLengths(x: ArrayLike<number>, y: ArrayLike<number>, closed: boolean): Float64Array {
  const n = Math.min(x.length, y.length);
  const m = closed && n > 1 ? n + 1 : n;
  const cum = new Float64Array(Math.max(m, 0));
  for (let k = 1; k < m; k++) {
    const a = k - 1;
    const b = k % n;
    cum[k] =
      (cum[k - 1] as number) +
      Math.hypot((x[b] as number) - (x[a] as number), (y[b] as number) - (y[a] as number));
  }
  return cum;
}

/** Point at arc length `s` (clamped to the path) on the path unrolled by {@link arcLengths}. */
function pointAt(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  cum: Float64Array,
  s: number,
): [number, number] {
  const n = Math.min(x.length, y.length);
  const m = cum.length;
  if (m === 0) return [NaN, NaN];
  if (m === 1 || s <= 0) return [x[0] as number, y[0] as number];
  // Binary search for the segment [k, k + 1] containing s.
  let lo = 0;
  let hi = m - 1;
  if (s >= (cum[hi] as number)) {
    const k = hi % n;
    return [x[k] as number, y[k] as number];
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((cum[mid] as number) <= s) lo = mid;
    else hi = mid;
  }
  const a = lo % n;
  const b = hi % n;
  const d = (cum[hi] as number) - (cum[lo] as number);
  const t = d > 0 ? (s - (cum[lo] as number)) / d : 0;
  const xa = x[a] as number;
  const ya = y[a] as number;
  return [xa + t * ((x[b] as number) - xa), ya + t * ((y[b] as number) - ya)];
}

/** Clip an interval to [0, len], splitting it where a closed path wraps. */
function wrapInterval(lo: number, hi: number, len: number, closed: boolean): [number, number][] {
  if (!closed || hi - lo >= len) return [[Math.max(0, lo), Math.min(len, hi)]];
  const out: [number, number][] = [];
  if (lo < 0) out.push([lo + len, len], [0, hi]);
  else if (hi > len) out.push([lo, len], [0, hi - len]);
  else out.push([lo, hi]);
  return out;
}

/** Sort and merge intervals, dropping empty ones. */
function mergeIntervals(intervals: [number, number][]): [number, number][] {
  const sorted = intervals.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Plotly `Lib.mod`: a remainder in [0, d). */
function mod(v: number, d: number): number {
  const out = v % d;
  return out < 0 ? out + d : out;
}

/** Plotly `lib/geometry2d.js` `segmentsIntersect` (as a boolean). */
function segmentsIntersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): boolean {
  const a = x2 - x1;
  const b = x3 - x1;
  const c = x4 - x3;
  const d = y2 - y1;
  const e = y3 - y1;
  const f = y4 - y3;
  const det = a * f - c * d;
  if (det === 0) return false;
  const t = (b * f - c * e) / det;
  const u = (b * d - a * e) / det;
  return !(u < 0 || u > 1 || t < 0 || t > 1);
}

/** Squared distance from segment ab to point c (Plotly `perpDistance2`). */
function perpDistance2(xab: number, yab: number, llab: number, xac: number, yac: number): number {
  const fcAB = xac * xab + yac * yab;
  if (fcAB < 0) return xac * xac + yac * yac;
  if (fcAB > llab) {
    const xbc = xac - xab;
    const ybc = yac - yab;
    return xbc * xbc + ybc * ybc;
  }
  const cross = xac * yab - yac * xab;
  return (cross * cross) / llab;
}

/** Minimum distance between segments 1→2 and 3→4 (Plotly `segmentDistance`). */
export function segmentDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): number {
  if (segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4)) return 0;
  const x12 = x2 - x1;
  const y12 = y2 - y1;
  const x34 = x4 - x3;
  const y34 = y4 - y3;
  const ll12 = x12 * x12 + y12 * y12;
  const ll34 = x34 * x34 + y34 * y34;
  return Math.sqrt(
    Math.min(
      perpDistance2(x12, y12, ll12, x3 - x1, y3 - y1),
      perpDistance2(x12, y12, ll12, x4 - x1, y4 - y1),
      perpDistance2(x34, y34, ll34, x1 - x3, y1 - y3),
      perpDistance2(x34, y34, ll34, x2 - x3, y2 - y3),
    ),
  );
}

/** Plotly `bounds`, y up: `xmin..xmax × ymin..ymax` with midpoints. */
interface Bounds {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  center: number;
  middle: number;
}

/** A path unrolled by arc length. */
interface Unrolled {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  cum: Float64Array;
  total: number;
}

/** Plotly `getVisibleSegment` result. */
interface Visible {
  min: number;
  max: number;
  len: number;
  isClosed: boolean;
}

/** Plotly `getVisibleSegment`: the stretch of the path from where it enters to where it leaves. */
function visibleSegment(path: Unrolled, b: Bounds, buffer: number): Visible | undefined {
  const { x, y, cum, total } = path;
  const step = Math.max(buffer, 1e-3);
  const distToPlot = (s: number): number => {
    const [px, py] = pointAt(x, y, cum, s);
    const dx = px < b.xmin ? b.xmin - px : px > b.xmax ? px - b.xmax : 0;
    const dy = py < b.ymin ? b.ymin - py : py > b.ymax ? py - b.ymax : 0;
    return Math.sqrt(dx * dx + dy * dy);
  };
  let pMin = 0;
  let pMax = total;
  let d = distToPlot(pMin);
  while (d) {
    pMin += d + step;
    if (pMin > pMax) return undefined;
    d = distToPlot(pMin);
  }
  d = distToPlot(pMax);
  while (d) {
    pMax -= d + step;
    if (pMin > pMax) return undefined;
    d = distToPlot(pMax);
  }
  const [x0, y0] = pointAt(x, y, cum, 0);
  const [xt, yt] = pointAt(x, y, cum, total);
  return {
    min: pMin,
    max: pMax,
    len: pMax - pMin,
    isClosed: pMin === 0 && pMax === total && Math.abs(x0 - xt) < 0.1 && Math.abs(y0 - yt) < 0.1,
  };
}

/** A candidate label location; `theta` is Plotly's (radians, clockwise positive on screen). */
interface Location {
  x: number;
  y: number;
  theta: number;
}

/** Plotly `getTextLocation`, y up. */
function textLocation(path: Unrolled, position: number, textWidth: number): Location {
  const { x, y, cum, total } = path;
  const [x0, y0] = pointAt(x, y, cum, mod(position - textWidth / 2, total));
  const [x1, y1] = pointAt(x, y, cum, mod(position + textWidth / 2, total));
  // Plotly's y points down: its Δy is −Δy here. atan handles ±1/0.
  const theta = Math.atan(-(y1 - y0) / (x1 - x0));
  const [xc, yc] = pointAt(x, y, cum, mod(position, total));
  return { x: (xc * 4 + x0 + x1) / 6, y: (yc * 4 + y0 + y1) / 6, theta };
}

/** A placed label's stored data (Plotly `labelData`). */
interface Placed {
  x: number;
  y: number;
  theta: number;
  level: number;
  width: number;
  height: number;
}

/**
 * Plotly `locationCost`, y up (a label's chord runs from (x − dx, y + dy) to (x + dx, y − dy) with
 * Plotly's dx, dy; the mirror image preserves every distance).
 */
function locationCost(
  loc: Location,
  size: LabelSize,
  level: number,
  placed: readonly Placed[],
  b: Bounds,
): number {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const { x, y, theta } = loc;
  const dx = Math.cos(theta) * halfWidth;
  const dy = Math.sin(theta) * halfWidth;

  // Edge proximity. Plotly's `y > middle` (y down) is `y < middle` here.
  const normX =
    (x > b.center ? b.xmax - x : x - b.xmin) / (dx + Math.abs(Math.sin(theta) * halfHeight));
  const normY =
    (y < b.middle ? y - b.ymin : b.ymax - y) / (Math.abs(dy) + Math.cos(theta) * halfHeight);
  if (normX < 1 || normY < 1) return Infinity;
  let cost = C.EDGECOST * (1 / (normX - 1) + 1 / (normY - 1));

  // Off horizontal.
  cost += C.ANGLECOST * theta * theta;

  // Neighbours.
  const x1 = x - dx;
  const y1 = y + dy;
  const x2 = x + dx;
  const y2 = y - dy;
  for (const l of placed) {
    const dxd = (Math.cos(l.theta) * l.width) / 2;
    const dyd = (Math.sin(l.theta) * l.width) / 2;
    const dist =
      (segmentDistance(x1, y1, x2, y2, l.x - dxd, l.y + dyd, l.x + dxd, l.y - dyd) * 2) /
      (size.height + l.height);
    const sameLevel = l.level === level;
    const distOffset = sameLevel ? C.SAMELEVELDISTANCE : 1;
    if (dist <= distOffset) return Infinity;
    const distFactor = C.NEIGHBORCOST * (sameLevel ? C.SAMELEVELFACTOR : 1);
    cost += distFactor / (dist - distOffset);
  }
  return cost;
}

/** Plotly `findBestTextLocation`: a coarse scan, then half-step refinements around the best. */
function findBestTextLocation(
  path: Unrolled,
  vis: Visible,
  size: LabelSize,
  level: number,
  placed: readonly Placed[],
  b: Bounds,
): Location | undefined {
  const textWidth = size.width;
  let p0: number;
  let dp: number;
  let pMax: number;
  if (vis.isClosed) {
    dp = vis.len / C.INITIALSEARCHPOINTS;
    p0 = vis.min + dp / 2;
    pMax = vis.max;
  } else {
    dp = (vis.len - textWidth) / (C.INITIALSEARCHPOINTS + 1);
    p0 = vis.min + dp + textWidth / 2;
    pMax = vis.max - (dp + textWidth) / 2;
  }
  if (!(dp > 0)) return undefined;

  let cost = Infinity;
  let pMin = NaN;
  let loc: Location | undefined;
  for (let j = 0; j < C.ITERATIONS; j++) {
    for (let p = p0; p < pMax; p += dp) {
      const candidate = textLocation(path, p, textWidth);
      const c = locationCost(candidate, size, level, placed, b);
      if (c < cost) {
        cost = c;
        loc = candidate;
        pMin = p;
      }
    }
    if (cost > C.MAXCOST * 2) break;
    // Later iterations look half steps away from the best so far.
    if (j) dp /= 2;
    p0 = pMin - dp / 2;
    pMax = p0 + dp * 1.5;
  }
  return cost <= C.MAXCOST ? loc : undefined;
}

/** Degrees clockwise in (−90, 90] from Plotly's θ in [−π/2, π/2]. */
function angleOf(theta: number): number {
  const deg = (theta * 180) / Math.PI;
  const a = deg <= -90 ? deg + 180 : deg;
  return a === 0 ? 0 : a; // no −0
}

function normRect(r: PlotRect): [number, number, number, number] {
  return [Math.min(r.x0, r.x1), Math.max(r.x0, r.x1), Math.min(r.y0, r.y1), Math.max(r.y0, r.y1)];
}

/**
 * Place contour labels along `paths` (px, y up), Plotly's way. `sizes[level]` is the measured
 * label text of each level (paths whose level has no size are skipped); `sizes.length` is the
 * level count that scales the label density. `plot` is the plot area (its diagonal sets the label
 * spacing); labels are kept inside `options.bounds ∩ plot`. Paths are processed by level, then in
 * input order; the result is deterministic.
 */
export function placeContourLabels(
  paths: readonly LabelPath[],
  sizes: readonly (LabelSize | undefined)[],
  plot: PlotRect,
  options: LabelOptions = {},
): LabelPlacement {
  const [px0, px1, py0, py1] = normRect(plot);
  const [bx0, bx1, by0, by1] = normRect(options.bounds ?? plot);
  const xmin = Math.max(px0, bx0);
  const xmax = Math.min(px1, bx1);
  const ymin = Math.max(py0, by0);
  const ymax = Math.min(py1, by1);
  const labels: ContourLabel[] = [];
  if (!(xmax >= xmin && ymax >= ymin)) return { labels };
  const bounds: Bounds = {
    xmin,
    xmax,
    ymin,
    ymax,
    center: (xmin + xmax) / 2,
    middle: (ymin + ymax) / 2,
  };
  const plotDiagonal = Math.hypot(px1 - px0, py1 - py0);
  const normLength = (C.LABELDISTANCE * plotDiagonal) / Math.max(1, sizes.length / C.LABELINCREASE);

  const order = paths.map((_, i) => i);
  order.sort((i, j) => (paths[i] as LabelPath).level - (paths[j] as LabelPath).level || i - j);

  const placed: Placed[] = [];
  for (const p of order) {
    const path = paths[p] as LabelPath;
    const size = sizes[path.level];
    if (
      !size ||
      !(size.width >= 0 && size.height >= 0 && size.width + size.height > 0) ||
      !Number.isFinite(size.width + size.height + size.fontSize)
    ) {
      continue;
    }
    const cum = arcLengths(path.x, path.y, path.closed);
    const total = cum.length > 0 ? (cum[cum.length - 1] as number) : 0;
    if (!(total > 0) || !Number.isFinite(total)) continue;
    const unrolled: Unrolled = { x: path.x, y: path.y, cum, total };
    const vis = visibleSegment(unrolled, bounds, size.height / 2);
    if (!vis || vis.len < (size.width + size.height) * C.LABELMIN) continue;
    const maxLabels = Math.min(Math.ceil(vis.len / normLength), C.LABELMAX);
    for (let i = 0; i < maxLabels; i++) {
      const loc = findBestTextLocation(unrolled, vis, size, path.level, placed, bounds);
      if (!loc) break;
      // Plotly `addLabelData`: the stored box is padded along the text, trimmed across it.
      const width = size.width + size.fontSize / 3;
      const height = Math.max(0, size.height - size.fontSize / 3);
      placed.push({ x: loc.x, y: loc.y, theta: loc.theta, level: path.level, width, height });
      labels.push({
        path: p,
        level: path.level,
        x: loc.x,
        y: loc.y,
        angle: angleOf(loc.theta),
        width,
        height,
      });
    }
  }
  return { labels };
}

/** A box ready for clipping: center, unit text axis (y up), half extents and bounding box. */
interface ClipBox {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  hw: number;
  hh: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function clipBox(b: LabelBox): ClipBox | undefined {
  const hw = b.width / 2;
  const hh = b.height / 2;
  if (!(hw > 0 && hh > 0) || !Number.isFinite(b.x + b.y + b.angle + hw + hh)) return undefined;
  const rad = (-b.angle * Math.PI) / 180; // counter-clockwise, y up
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const ex = Math.abs(ux) * hw + Math.abs(uy) * hh;
  const ey = Math.abs(uy) * hw + Math.abs(ux) * hh;
  return {
    cx: b.x,
    cy: b.y,
    ux,
    uy,
    hw,
    hh,
    x0: b.x - ex,
    x1: b.x + ex,
    y0: b.y - ey,
    y1: b.y + ey,
  };
}

/**
 * Liang–Barsky in the box frame: push the parameter interval `[t0, t1]` ⊂ [0, 1] of segment
 * a→b inside the box, if it has positive length.
 */
function clipSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  box: ClipBox,
  out: number[],
): void {
  const rx = ax - box.cx;
  const ry = ay - box.cy;
  const vx = bx - ax;
  const vy = by - ay;
  // Segment start and direction in (u, v) = (along, across) the text.
  const pu = rx * box.ux + ry * box.uy;
  const pv = ry * box.ux - rx * box.uy;
  const du = vx * box.ux + vy * box.uy;
  const dv = vy * box.ux - vx * box.uy;
  let t0 = 0;
  let t1 = 1;
  const edge = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t0) t0 = r;
    } else if (r < t1) t1 = r;
    return t0 < t1;
  };
  if (
    edge(-du, pu + box.hw) &&
    edge(du, box.hw - pu) &&
    edge(-dv, pv + box.hh) &&
    edge(dv, box.hh - pv) &&
    t0 < t1
  ) {
    out.push(t0, t1);
  }
}

/** Max grid cells per side in {@link clipPolylineByBoxes}. */
const GRID_MAX = 256;

/** One piece of a clipped polyline. */
export interface ClippedLine {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  /** True only for an uncut closed input (returned as is, first point not repeated). */
  closed: boolean;
}

/**
 * Remove the parts of a polyline (px, y up) inside any of `boxes` — exactly, segment by segment
 * (Liang–Barsky in each box's frame, with bounding-box prefilters). Returns the remaining pieces.
 * A path no box touches comes back as is (same arrays, same `closed`); otherwise the pieces are
 * open, and on a closed path the piece through its first point is joined across it. Boxes of zero
 * area remove nothing.
 */
export function clipPolylineByBoxes(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  closed: boolean,
  boxes: readonly LabelBox[],
): ClippedLine[] {
  const n = Math.min(x.length, y.length);
  if (n === 0) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < n; k++) {
    const xk = x[k] as number;
    const yk = y[k] as number;
    if (xk < minX) minX = xk;
    if (xk > maxX) maxX = xk;
    if (yk < minY) minY = yk;
    if (yk > maxY) maxY = yk;
  }
  const cand: ClipBox[] = [];
  for (const b of boxes) {
    const c = clipBox(b);
    if (c && c.x1 > minX && c.x0 < maxX && c.y1 > minY && c.y0 < maxY) cand.push(c);
  }
  const whole = [{ x, y, closed }];
  if (cand.length === 0 || n === 1) return whole;

  // A uniform grid over the path's bounding box, cells about one box across.
  let cell = 0;
  for (const c of cand) cell = Math.max(cell, c.x1 - c.x0, c.y1 - c.y0);
  const gx = Math.min(GRID_MAX, Math.max(1, Math.ceil((maxX - minX) / cell)));
  const gy = Math.min(GRID_MAX, Math.max(1, Math.ceil((maxY - minY) / cell)));
  const cw = (maxX - minX) / gx || 1;
  const ch = (maxY - minY) / gy || 1;
  const col = (v: number): number => Math.min(gx - 1, Math.max(0, Math.floor((v - minX) / cw)));
  const row = (v: number): number => Math.min(gy - 1, Math.max(0, Math.floor((v - minY) / ch)));
  const grid: ClipBox[][] = Array.from({ length: gx * gy }, () => []);
  for (const c of cand) {
    for (let j = row(c.y0); j <= row(c.y1); j++) {
      for (let i = col(c.x0); i <= col(c.x1); i++) (grid[j * gx + i] as ClipBox[]).push(c);
    }
  }

  const pieces: { x: number[]; y: number[] }[] = [];
  let xs: number[] = [];
  let ys: number[] = [];
  let open = false; // a piece is in progress (ending at the current segment's start)
  let curFromStart = false;
  let startPiece = -1;
  let cut = false;
  const flush = (): void => {
    if (open && xs.length >= 2) {
      if (curFromStart) startPiece = pieces.length;
      pieces.push({ x: xs, y: ys });
    }
    open = curFromStart = false;
  };
  let ax = 0;
  let ay = 0;
  let bx = 0;
  let by = 0;
  let k = 0;
  // Keep [s, e] of the current segment: continue the current piece from s = 0, else start anew.
  const keep = (s: number, e: number): void => {
    if (s > 0) {
      flush();
      xs = [ax + s * (bx - ax)];
      ys = [ay + s * (by - ay)];
      open = true;
    } else if (!open) {
      xs = [ax];
      ys = [ay];
      open = true;
      curFromStart = k === 0;
    }
    if (e >= 1) {
      xs.push(bx);
      ys.push(by);
    } else {
      xs.push(ax + e * (bx - ax));
      ys.push(ay + e * (by - ay));
      flush();
    }
  };
  const cuts: number[] = [];
  const order: number[] = [];
  const test = (c: ClipBox, sx0: number, sx1: number, sy0: number, sy1: number): void => {
    if (c.x1 > sx0 && c.x0 < sx1 && c.y1 > sy0 && c.y0 < sy1) {
      clipSegment(ax, ay, bx, by, c, cuts);
    }
  };
  const segments = closed ? n : n - 1;
  for (k = 0; k < segments; k++) {
    ax = x[k] as number;
    ay = y[k] as number;
    bx = x[(k + 1) % n] as number;
    by = y[(k + 1) % n] as number;
    const sx0 = Math.min(ax, bx);
    const sx1 = Math.max(ax, bx);
    const sy0 = Math.min(ay, by);
    const sy1 = Math.max(ay, by);
    cuts.length = 0;
    const i0 = col(sx0);
    const i1 = col(sx1);
    const j0 = row(sy0);
    const j1 = row(sy1);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4) {
      for (const c of cand) test(c, sx0, sx1, sy0, sy1);
    } else {
      // A box in several of these cells may cut twice: the union below absorbs repeats.
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          for (const c of grid[j * gx + i] as ClipBox[]) test(c, sx0, sx1, sy0, sy1);
        }
      }
    }
    if (cuts.length === 0) {
      keep(0, 1);
      continue;
    }
    cut = true;
    order.length = 0;
    for (let q = 0; q < cuts.length; q += 2) order.push(q);
    order.sort((p, q) => (cuts[p] as number) - (cuts[q] as number));
    let from = 0;
    for (const q of order) {
      const s = cuts[q] as number;
      if (s > from) keep(from, s);
      else if (from === 0) flush(); // cut from the segment's start
      from = Math.max(from, cuts[q + 1] as number);
    }
    if (from < 1) keep(from, 1);
  }
  if (!cut) return whole;
  const head = pieces[0];
  if (closed && open && startPiece === 0 && head) {
    // The last piece ends at the first point: join it to the piece starting there.
    pieces[0] = { x: xs.concat(head.x.slice(1)), y: ys.concat(head.y.slice(1)) };
  } else flush();
  return pieces.map((p) => ({
    x: Float64Array.from(p.x),
    y: Float64Array.from(p.y),
    closed: false,
  }));
}

/**
 * Remove the arc-length intervals `gaps` from a polyline and return the remaining pieces as open
 * polylines (cut points interpolated). Intervals may overlap, extend past the ends, or — on closed
 * paths — wrap past the start (`lo < 0` or `hi > length`). A closed path without gaps comes back as
 * one piece that repeats its first point at the end; with gaps, the piece through its first point
 * is joined across it.
 */
export function cutPath(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  closed: boolean,
  gaps: readonly (readonly [number, number])[],
): { x: Float64Array; y: Float64Array }[] {
  const n = Math.min(x.length, y.length);
  if (n === 0) return [];
  const cum = arcLengths(x, y, closed);
  const m = cum.length;
  const len = cum[m - 1] as number;
  const eps = len * 1e-12;
  const intervals: [number, number][] = [];
  for (const [a, b] of gaps) {
    if (!(b > a)) continue;
    intervals.push(...wrapInterval(a, b, len, closed));
  }
  const merged = mergeIntervals(intervals);

  const extract = (a: number, b: number, xs: number[], ys: number[], skipFirst: boolean): void => {
    if (!skipFirst) {
      const [xa, ya] = pointAt(x, y, cum, a);
      xs.push(xa);
      ys.push(ya);
    }
    for (let k = 0; k < m; k++) {
      const s = cum[k] as number;
      if (s > a && s < b) {
        xs.push(x[k % n] as number);
        ys.push(y[k % n] as number);
      }
    }
    const [xb, yb] = pointAt(x, y, cum, b);
    xs.push(xb);
    ys.push(yb);
  };

  // Kept intervals: the complement of the gaps in [0, len].
  const kept: [number, number][] = [];
  let from = 0;
  for (const [a, b] of merged) {
    if (a - from > eps) kept.push([from, a]);
    from = Math.max(from, b);
  }
  if (len - from > eps || (len === 0 && merged.length === 0)) kept.push([from, len]);

  const pieces: { x: Float64Array; y: Float64Array }[] = [];
  const first = kept[0];
  const last = kept[kept.length - 1];
  const wrap =
    closed &&
    merged.length > 0 &&
    kept.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    first[0] === 0 &&
    last[1] === len;
  for (let r = wrap ? 1 : 0; r < kept.length - (wrap ? 1 : 0); r++) {
    const [a, b] = kept[r] as [number, number];
    const xs: number[] = [];
    const ys: number[] = [];
    extract(a, b, xs, ys, false);
    pieces.push({ x: Float64Array.from(xs), y: Float64Array.from(ys) });
  }
  if (wrap) {
    const xs: number[] = [];
    const ys: number[] = [];
    extract(last[0], len, xs, ys, false);
    extract(0, first[1], xs, ys, true);
    pieces.push({ x: Float64Array.from(xs), y: Float64Array.from(ys) });
  }
  return pieces;
}
