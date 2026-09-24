/**
 * Contour label placement, in screen pixels (a simplified, deterministic take on the label
 * placement in Plotly `contour/plot.js`). Pure.
 *
 * Callers convert the contour paths to px (x right, y UP — viewport world coordinates) and measure
 * each path's label text. Paths shorter than `minPathFactor` label widths (Plotly `LABELMIN`) get
 * no label; longer paths get about one label per `spacing` px, spread evenly along the path. Each
 * label sits on the path, rotated along the chord spanning its width, and is kept readable (never
 * upside down). A position whose padded label box leaves the plot rect or overlaps a label already
 * placed is abandoned for the nearest workable one within ±spacing/3 along the path (10
 * candidates), or dropped. {@link cutPath} then removes the line under each label.
 */

/** A path to label, in px (y up). */
export interface LabelPath {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  closed: boolean;
}

/** Measured label text size in px. */
export interface LabelSize {
  width: number;
  height: number;
}

/** The plot area in px (y up); the corners may come in any order. */
export interface PlotRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Options of {@link placeContourLabels}. */
export interface LabelOptions {
  /** Target distance between labels along a path, px. Default `max(300, 8·width)`. */
  spacing?: number | undefined;
  /** Minimum path length in label widths (Plotly `LABELMIN`). Default 3. */
  minPathFactor?: number | undefined;
  /** Padding around each label box and gap, px. Default 3. */
  padding?: number | undefined;
}

/** One placed label. */
export interface ContourLabel {
  /** Index of the labelled path. */
  path: number;
  /** Label center (on the path), px, y up. */
  x: number;
  y: number;
  /** Rotation in degrees, clockwise positive on screen (Plotly `textangle`), in (−90, 90]. */
  angle: number;
  /** Arc-length position of the center along the path, px. */
  s: number;
}

/** Result of {@link placeContourLabels}. */
export interface LabelPlacement {
  labels: ContourLabel[];
  /**
   * Per labelled path, the sorted arc-length intervals to cut out of its line, within
   * `[0, length]` (an interval of a closed path that wraps past its start is split in two).
   */
  gaps: Map<number, [number, number][]>;
}

const CANDIDATES = 10;

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

/** An oriented box: center, unit axes (u along the text) and half extents. */
interface Box {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  hw: number;
  hh: number;
}

function corners(b: Box): number[] {
  const ax = b.ux * b.hw;
  const ay = b.uy * b.hw;
  const bx = -b.uy * b.hh;
  const by = b.ux * b.hh;
  return [
    b.cx - ax - bx,
    b.cy - ay - by,
    b.cx + ax - bx,
    b.cy + ay - by,
    b.cx + ax + bx,
    b.cy + ay + by,
    b.cx - ax + bx,
    b.cy - ay + by,
  ];
}

/** Separating-axis test for two oriented boxes. */
function boxesOverlap(a: Box, b: Box): boolean {
  const axes = [a.ux, a.uy, -a.uy, a.ux, b.ux, b.uy, -b.uy, b.ux];
  const ca = corners(a);
  const cb = corners(b);
  for (let k = 0; k < 8; k += 2) {
    const nx = axes[k] as number;
    const ny = axes[k + 1] as number;
    let amin = Infinity;
    let amax = -Infinity;
    let bmin = Infinity;
    let bmax = -Infinity;
    for (let c = 0; c < 8; c += 2) {
      const pa = (ca[c] as number) * nx + (ca[c + 1] as number) * ny;
      const pb = (cb[c] as number) * nx + (cb[c + 1] as number) * ny;
      amin = Math.min(amin, pa);
      amax = Math.max(amax, pa);
      bmin = Math.min(bmin, pb);
      bmax = Math.max(bmax, pb);
    }
    if (amax <= bmin || bmax <= amin) return false;
  }
  return true;
}

/** Normalize a clockwise-positive angle in degrees to the readable range (−90, 90]. */
function readableAngle(deg: number): number {
  let a = deg % 360;
  while (a > 90) a -= 180;
  while (a <= -90) a += 180;
  return a === 0 ? 0 : a; // no −0
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

/**
 * Place contour labels along `paths` (px, y up) inside `rect`. `sizes[p]` is the measured label
 * size of path p (paths without a size are skipped). Deterministic: paths are processed in order,
 * earlier labels win overlaps.
 */
export function placeContourLabels(
  paths: readonly LabelPath[],
  sizes: readonly (LabelSize | undefined)[],
  rect: PlotRect,
  options: LabelOptions = {},
): LabelPlacement {
  const minFactor = options.minPathFactor ?? 3;
  const pad = options.padding ?? 3;
  const rx0 = Math.min(rect.x0, rect.x1);
  const rx1 = Math.max(rect.x0, rect.x1);
  const ry0 = Math.min(rect.y0, rect.y1);
  const ry1 = Math.max(rect.y0, rect.y1);
  const labels: ContourLabel[] = [];
  const boxes: Box[] = [];
  const gaps = new Map<number, [number, number][]>();

  for (let p = 0; p < paths.length; p++) {
    const path = paths[p] as LabelPath;
    const size = sizes[p];
    if (!size || !(size.width > 0) || !(size.height >= 0)) continue;
    const { width: w, height: h } = size;
    const { x, y, closed } = path;
    const cum = arcLengths(x, y, closed);
    const len = cum.length > 0 ? (cum[cum.length - 1] as number) : 0;
    if (!(len > 0) || len < minFactor * w) continue;
    const spacing = options.spacing ?? Math.max(300, 8 * w);
    const n = Math.max(1, Math.floor(len / spacing));
    const radius = Math.min(spacing / 3, len / (2 * n));
    const step = radius / (CANDIDATES / 2);
    const pathGaps: [number, number][] = [];

    const at = (s: number): [number, number] => {
      if (closed) return pointAt(x, y, cum, ((s % len) + len) % len);
      return pointAt(x, y, cum, Math.min(Math.max(s, 0), len));
    };

    for (let k = 0; k < n; k++) {
      const base = ((k + 0.5) * len) / n;
      for (let c = 0; c < CANDIDATES; c++) {
        const off = (c % 2 === 1 ? 1 : -1) * Math.ceil(c / 2) * step;
        let s = base + off;
        if (closed) s = ((s % len) + len) % len;
        else s = Math.min(Math.max(s, w / 2), len - w / 2);
        const [cx, cy] = at(s);
        const [ax, ay] = at(s - w / 2);
        const [bx, by] = at(s + w / 2);
        const dx = bx - ax;
        const dy = by - ay;
        const angle =
          dx === 0 && dy === 0 ? 0 : readableAngle((-Math.atan2(dy, dx) * 180) / Math.PI);
        const rad = (-angle * Math.PI) / 180; // counter-clockwise, y up
        const box: Box = {
          cx,
          cy,
          ux: Math.cos(rad),
          uy: Math.sin(rad),
          hw: w / 2 + pad,
          hh: h / 2 + pad,
        };
        const pts = corners(box);
        let inside = true;
        for (let q = 0; q < 8 && inside; q += 2) {
          const px = pts[q] as number;
          const py = pts[q + 1] as number;
          inside = px >= rx0 && px <= rx1 && py >= ry0 && py <= ry1;
        }
        if (!inside) continue;
        if (boxes.some((b) => boxesOverlap(b, box))) continue;
        boxes.push(box);
        labels.push({ path: p, x: cx, y: cy, angle, s });
        pathGaps.push(...wrapInterval(s - w / 2 - pad, s + w / 2 + pad, len, closed));
        break;
      }
    }
    if (pathGaps.length > 0) gaps.set(p, mergeIntervals(pathGaps));
  }
  return { labels, gaps };
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
