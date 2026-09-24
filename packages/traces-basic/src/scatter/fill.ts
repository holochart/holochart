/**
 * Scatter fill geometry (plan E9.4): turns a trace's drawn path (and the previous trace's, for
 * `tonext*`) into polygon rings for the render package's fill primitive, following plotly.js
 * `scatter/plot.js`. Pure: typed arrays in, typed arrays out, in linear axis coordinates, so zoom
 * and pan only change the primitive's transform.
 *
 * ## Shapes (Plotly)
 *
 * - `tozeroy` / `tozerox`, and `tonexty` / `tonextx` without a previous trace: the whole path,
 *   joined straight across gaps, closed along the zero line from its last point back to its first.
 * - `tonexty` / `tonextx`: the path, then the previous trace's path backwards (both joined across
 *   gaps), closed with straight lines between the end points.
 * - `toself`, and `tonext` without a previous trace: every segment of the path closes on itself.
 * - `tonext`: the segments of this path and the previous one; where one encloses the other the
 *   nonzero rule cuts the inner one out (the previous rings are reversed).
 *
 * ## Fill rules
 *
 * SVG (and so Plotly) fills paths with the nonzero rule, which the render package computes exactly
 * on the CPU for self-intersecting rings. That is several times slower than its earcut fast path,
 * so a directional fill uses earcut (`'simple'`) when the ring is provably simple: both boundaries
 * monotonic along the fill's position axis over the same span and never crossing (the usual area,
 * stacked area and range band). Anything else uses `'nonzero'`.
 */
import type { FillRule } from '@mk7s/holochart-render';

/** Plotly `fill`. */
export type FillMode = 'none' | 'tozeroy' | 'tozerox' | 'tonexty' | 'tonextx' | 'toself' | 'tonext';

/** A drawn path: linear coordinates with a NaN vertex between segments (see `line-path.ts`). */
export interface PathXY {
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
}

/** Polygon rings of one fill (one polygon): the render package's `FillGeometryInput`. */
export interface FillGeometry {
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Start vertex of each ring. */
  readonly rings: Uint32Array;
  readonly fillRule: FillRule;
}

/** The fill direction of a mode: `'y'` / `'x'` for the directional fills, `''` otherwise. */
export function fillDirection(mode: string): 'x' | 'y' | '' {
  const last = mode.charAt(mode.length - 1);
  return mode !== 'none' && (last === 'x' || last === 'y') ? last : '';
}

/** Whether `mode` links to the previous trace (`tonext`, `tonextx`, `tonexty`). */
export function linksToPrevious(mode: unknown): boolean {
  return mode === 'tonext' || mode === 'tonextx' || mode === 'tonexty';
}

/** `[start, end)` vertex ranges of the finite runs of a path. */
function segments(path: PathXY): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.min(path.x.length, path.y.length);
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const ok = i < n && Number.isFinite(path.x[i]) && Number.isFinite(path.y[i]);
    if (ok && start < 0) start = i;
    else if (!ok && start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

/** The finite vertices of a path, joined straight across gaps. */
function joined(path: PathXY): { x: Float64Array; y: Float64Array } {
  const n = Math.min(path.x.length, path.y.length);
  let m = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(path.x[i]) && Number.isFinite(path.y[i])) m++;
  const x = new Float64Array(m);
  const y = new Float64Array(m);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const xi = path.x[i] as number;
    const yi = path.y[i] as number;
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    x[k] = xi;
    y[k] = yi;
    k++;
  }
  return { x, y };
}

/** Growable ring builder. */
class Rings {
  x: number[] = [];
  y: number[] = [];
  starts: number[] = [];

  begin(): void {
    this.starts.push(this.x.length);
  }

  push(x: number, y: number): void {
    this.x.push(x);
    this.y.push(y);
  }

  /** Append `path[a, b)`, backwards when `reverse`. */
  append(path: PathXY, a: number, b: number, reverse = false): void {
    if (reverse)
      for (let i = b - 1; i >= a; i--) this.push(path.x[i] as number, path.y[i] as number);
    else for (let i = a; i < b; i++) this.push(path.x[i] as number, path.y[i] as number);
  }

  finish(fillRule: FillRule): FillGeometry | undefined {
    if (this.x.length < 3) return undefined;
    return {
      x: Float64Array.from(this.x),
      y: Float64Array.from(this.y),
      rings: Uint32Array.from(this.starts),
      fillRule,
    };
  }
}

/** Options of {@link buildFill}. */
export interface FillOptions {
  readonly mode: FillMode;
  /** The trace's drawn path. */
  readonly path: PathXY;
  /** The previous trace's drawn path, for `tonext*` (absent: fill like the unlinked mode). */
  readonly previous?: PathXY | undefined;
  /** Linear coordinate of zero on the x / y axis (the `tozero*` baseline). */
  readonly zeroX: number;
  readonly zeroY: number;
}

/**
 * Polygon rings of a scatter fill in linear coordinates, or `undefined` when there is nothing to
 * fill (fewer than 3 vertices, `fill: 'none'`). See the module docs for the shapes.
 */
export function buildFill(opts: FillOptions): FillGeometry | undefined {
  const { mode, path } = opts;
  if (mode === 'none') return undefined;
  const dir = fillDirection(mode);
  const previous = linksToPrevious(mode) ? opts.previous : undefined;
  const rings = new Rings();

  if (dir !== '') {
    const own = joined(path);
    const n = own.x.length;
    if (n === 0) return undefined;
    const prev = previous ? joined(previous) : undefined;
    rings.begin();
    let other: { x: Float64Array; y: Float64Array };
    if (prev && prev.x.length > 0) {
      rings.append(own, 0, n);
      rings.append(prev, 0, prev.x.length, true);
      other = prev;
    } else {
      // Plotly: the end points projected onto the zero line come first, then the path.
      const first = [own.x[0] as number, own.y[0] as number];
      const last = [own.x[n - 1] as number, own.y[n - 1] as number];
      if (dir === 'y') {
        rings.push(last[0] as number, opts.zeroY);
        rings.push(first[0] as number, opts.zeroY);
        other = {
          x: Float64Array.of(first[0] as number, last[0] as number),
          y: new Float64Array(2).fill(opts.zeroY),
        };
      } else {
        rings.push(opts.zeroX, last[1] as number);
        rings.push(opts.zeroX, first[1] as number);
        other = {
          x: new Float64Array(2).fill(opts.zeroX),
          y: Float64Array.of(first[1] as number, last[1] as number),
        };
      }
      rings.append(own, 0, n);
    }
    return rings.finish(isSimpleBand(own, other, dir) ? 'simple' : 'nonzero');
  }

  for (const [a, b] of segments(path)) {
    rings.begin();
    rings.append(path, a, b);
  }
  if (previous) {
    for (const [a, b] of segments(previous)) {
      rings.begin();
      rings.append(previous, a, b, true);
    }
  }
  // Drop rings too short to enclose anything (the primitive skips them too, but they would still
  // count in `rings`).
  return compact(rings).finish('nonzero');
}

function compact(r: Rings): Rings {
  const out = new Rings();
  const ends = [...r.starts.slice(1), r.x.length];
  r.starts.forEach((start, k) => {
    const end = ends[k] as number;
    if (end - start < 3) return;
    out.begin();
    for (let i = start; i < end; i++) out.push(r.x[i] as number, r.y[i] as number);
  });
  return out;
}

// ---- Simple-ring test ---------------------------------------------------------------------------

/** +1 / −1 when `v` never decreases / never increases (and is not constant), else 0. */
function monotonic(v: Float64Array): 1 | -1 | 0 {
  let up = false;
  let down = false;
  for (let i = 1; i < v.length; i++) {
    const d = (v[i] as number) - (v[i - 1] as number);
    if (d > 0) up = true;
    else if (d < 0) down = true;
    if (up && down) return 0;
  }
  return up ? 1 : down ? -1 : 0;
}

/** Whether the values at equal positions (vertical runs) never turn back. */
function runsMonotonic(pos: Float64Array, val: Float64Array): boolean {
  let dir = 0;
  for (let i = 1; i < pos.length; i++) {
    if (pos[i] !== pos[i - 1]) {
      dir = 0;
      continue;
    }
    const d = Math.sign((val[i] as number) - (val[i - 1] as number));
    if (d === 0) continue;
    if (dir !== 0 && d !== dir) return false;
    dir = d;
  }
  return true;
}

/**
 * The range of a monotonic (non-decreasing `pos`) polyline's values at position `t`, with a
 * cursor for linear sweeps: every vertex exactly at `t`, else the interpolation between its
 * neighbors. Returns `undefined` outside the polyline's span.
 */
class Sweep {
  #k = 0;
  readonly pos: Float64Array;
  readonly val: Float64Array;

  constructor(pos: Float64Array, val: Float64Array) {
    this.pos = pos;
    this.val = val;
  }

  at(t: number): [number, number] | undefined {
    const { pos, val } = this;
    const n = pos.length;
    while (this.#k < n && (pos[this.#k] as number) < t) this.#k++;
    const k = this.#k;
    if (k < n && pos[k] === t) {
      let lo = val[k] as number;
      let hi = lo;
      for (let j = k + 1; j < n && pos[j] === t; j++) {
        lo = Math.min(lo, val[j] as number);
        hi = Math.max(hi, val[j] as number);
      }
      return [lo, hi];
    }
    if (k === 0 || k >= n) return undefined;
    const p0 = pos[k - 1] as number;
    const p1 = pos[k] as number;
    const v =
      (val[k - 1] as number) +
      (((val[k] as number) - (val[k - 1] as number)) * (t - p0)) / (p1 - p0);
    return [v, v];
  }
}

/**
 * Whether the ring "`a` forwards, `b` backwards" is simple for a fill along `dir` (`'y'`: values
 * are y, positions x): both monotonic in the same direction over the same span, without turning
 * back in vertical runs, and `a − b` never changing sign. Both are piecewise linear, so checking
 * every vertex of each against the other suffices.
 */
export function isSimpleBand(a: PathXY, b: PathXY, dir: 'x' | 'y'): boolean {
  let aPos = Float64Array.from(dir === 'y' ? a.x : a.y);
  const aVal = Float64Array.from(dir === 'y' ? a.y : a.x);
  let bPos = Float64Array.from(dir === 'y' ? b.x : b.y);
  const bVal = Float64Array.from(dir === 'y' ? b.y : b.x);
  if (aPos.length < 2 || bPos.length < 2) return false;
  const sense = monotonic(aPos);
  if (sense === 0 || monotonic(bPos) !== sense) return false;
  if (sense < 0) {
    aPos = aPos.map((v) => -v);
    bPos = bPos.map((v) => -v);
  }
  if (aPos[0] !== bPos[0] || aPos[aPos.length - 1] !== bPos[bPos.length - 1]) return false;
  if (!runsMonotonic(aPos, aVal) || !runsMonotonic(bPos, bVal)) return false;
  let above = false;
  let below = false;
  // `v` is a vertex of a (`sign` 1) or of b (`sign` −1), `range` the other's values there. Strictly
  // inside the other's vertical run is a crossing.
  const visit = (v: number, range: [number, number] | undefined, sign: 1 | -1): boolean => {
    if (!range) return false;
    const [lo, hi] = range;
    if (v > lo && v < hi) return false;
    const side = v > hi ? sign : v < lo ? -sign : 0;
    if (side > 0) above = true;
    else if (side < 0) below = true;
    return !(above && below);
  };
  const sb = new Sweep(bPos, bVal);
  for (let i = 0; i < aPos.length; i++) {
    if (!visit(aVal[i] as number, sb.at(aPos[i] as number), 1)) return false;
  }
  const sa = new Sweep(aPos, aVal);
  for (let i = 0; i < bPos.length; i++) {
    if (!visit(bVal[i] as number, sa.at(bPos[i] as number), -1)) return false;
  }
  return true;
}

// ---- Hit testing (hover on fills) ---------------------------------------------------------------

/** Winding number of the rings `[from, to)` of `g` around `(px, py)`. */
function winding(g: FillGeometry, px: number, py: number, from: number, to: number): number {
  let w = 0;
  const count = g.x.length;
  for (let r = from; r < to; r++) {
    const start = g.rings[r] as number;
    const end = r + 1 < g.rings.length ? (g.rings[r + 1] as number) : count;
    for (let i = start; i < end; i++) {
      const j = i + 1 < end ? i + 1 : start;
      const x0 = g.x[i] as number;
      const y0 = g.y[i] as number;
      const x1 = g.x[j] as number;
      const y1 = g.y[j] as number;
      if (y0 <= py) {
        if (y1 > py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) w++;
      } else if (y1 <= py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) w--;
    }
  }
  return w;
}

/** Whether `(px, py)` (linear) is inside the fill (nonzero rule, which covers simple rings too). */
export function fillContains(g: FillGeometry, px: number, py: number): boolean {
  return winding(g, px, py, 0, g.rings.length) !== 0;
}

/**
 * Where a fill's hover label goes (Plotly's `getHoverLabelPosition`), in the same (e.g. px)
 * coordinates as `map` returns: vertically at the middle of the rings that contain the point
 * (clamped to `[0, height]`), horizontally at their rightmost edge crossing at that height (clamped
 * to `[0, width]`). `undefined` when no single ring contains the point.
 */
export function fillLabelPosition(
  g: FillGeometry,
  point: readonly [number, number],
  map: (x: number, y: number) => readonly [number, number],
  size: { width: number; height: number },
): { x: number; y: number } | undefined {
  const count = g.x.length;
  const inside: [number, number][] = [];
  let ymin = Infinity;
  let ymax = -Infinity;
  for (let r = 0; r < g.rings.length; r++) {
    if (winding(g, point[0], point[1], r, r + 1) === 0) continue;
    const start = g.rings[r] as number;
    const end = r + 1 < g.rings.length ? (g.rings[r + 1] as number) : count;
    inside.push([start, end]);
    for (let i = start; i < end; i++) {
      const y = map(g.x[i] as number, g.y[i] as number)[1];
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }
  }
  if (inside.length === 0) return undefined;
  const yPos = (Math.max(ymin, 0) + Math.min(ymax, size.height)) / 2;
  let xmax = -Infinity;
  for (const [start, end] of inside) {
    for (let i = start; i < end; i++) {
      const j = i + 1 < end ? i + 1 : start;
      const [x0, y0] = map(g.x[i] as number, g.y[i] as number);
      const [x1, y1] = map(g.x[j] as number, g.y[j] as number);
      if (y0 > yPos !== y1 >= yPos && y1 !== y0) {
        xmax = Math.max(xmax, x0 + ((x1 - x0) * (yPos - y0)) / (y1 - y0));
      }
    }
  }
  if (!Number.isFinite(xmax)) return undefined;
  return { x: Math.min(Math.max(xmax, 0), size.width), y: yPos };
}
