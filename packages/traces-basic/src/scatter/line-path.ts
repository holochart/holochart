/**
 * Scatter `mode: 'lines'` path building (plan E9.2): turns a trace's points (linear axis
 * coordinates, non-finite where a point is missing) into the vertex stream the render package's
 * `LinePrimitive` draws, following plotly.js `line.shape`, `line.smoothing`, `connectgaps` and
 * `line.simplify` semantics.
 *
 * Pure: typed arrays in, typed arrays out; no three.js, no DOM. Output vertices are in linear
 * axis coordinates with a single NaN vertex between polylines, which `buildLineLayout` turns into
 * a gap sentinel.
 *
 * Step shapes are built directly in linear space because the data → px transform is affine per
 * axis, so a horizontal/vertical step stays horizontal/vertical. Splines and decimation are not
 * affine-invariant under anisotropic scaling (tangent lengths and px columns depend on the
 * transform), so they are computed in px space and mapped back; see {@link pathDependsOnScale} and
 * {@link needsRebuild} for when the caller must rebuild after a zoom.
 */

/** Plotly `line.shape`. */
export type LineShape = 'linear' | 'spline' | 'hv' | 'vh' | 'hvh' | 'vhv';

/** Vertices to draw, linear coords; NaN entries separate polylines. */
export interface LinePath {
  readonly x: Float64Array;
  readonly y: Float64Array;
  /**
   * Whether any run was decimated by `simplify`. A decimated path is only valid for the px
   * resolution it was built at, so the caller must rebuild it when {@link needsRebuild} says so.
   */
  readonly decimated: boolean;
}

/** Options for {@link buildLinePath}. */
export interface LinePathOptions {
  shape: LineShape;
  /** Plotly `line.smoothing` (0–1.3), spline only. */
  smoothing: number;
  connectgaps: boolean;
  /**
   * |px per linear unit| of the current transform, per axis (spline tessellation and decimation
   * are done in px space). The sign is ignored; zero or non-finite values are treated as 1.
   */
  scaleX: number;
  scaleY: number;
  /** Plotly `line.simplify`: enable pixel-based decimation (see below). */
  simplify: boolean;
}

/** plotly.js `Drawing.CatmullRomExp`: centripetal Catmull-Rom. */
const CATMULL_ROM_EXP = 0.5;
/** Target Bézier chord length in px: fine enough to look smooth on a 1–2 px line. */
const SPLINE_CHORD_PX = 3;
/** Cap on subdivisions per Bézier so a huge zoom cannot explode the vertex count. */
const SPLINE_MAX_SUBDIVISIONS = 64;
/**
 * Min/max decimation emits ≤ 4 points per px column, so it only pays off (and is only attempted)
 * when a run has more than that many points per column.
 */
const DECIMATE_POINTS_PER_PX = 4;

/**
 * Growable float64 vertex stream. Geometric growth keeps appends amortised O(1) when the exact
 * output size is not known up front (spline tessellation).
 */
export class VertexStream {
  x: Float64Array;
  y: Float64Array;
  length = 0;

  constructor(capacity: number) {
    const c = Math.max(4, capacity);
    this.x = new Float64Array(c);
    this.y = new Float64Array(c);
  }

  /** Empty the stream, keeping its capacity (streaming scratch). */
  reset(): void {
    this.length = 0;
  }

  push(px: number, py: number): void {
    if (this.length === this.x.length) this.grow();
    this.x[this.length] = px;
    this.y[this.length] = py;
    this.length++;
  }

  private grow(): void {
    const c = this.x.length * 2;
    const x = new Float64Array(c);
    const y = new Float64Array(c);
    x.set(this.x);
    y.set(this.y);
    this.x = x;
    this.y = y;
  }

  /** Exact-length arrays (copied only if the buffer was over-allocated). */
  finish(): { x: Float64Array; y: Float64Array } {
    if (this.length === this.x.length) return { x: this.x, y: this.y };
    return { x: this.x.slice(0, this.length), y: this.y.slice(0, this.length) };
  }
}

/** Only the magnitude of the transform matters for shape; degenerate scales fall back to 1. */
export function sanitizeScale(s: number): number {
  const a = Math.abs(s);
  return a > 0 && Number.isFinite(a) ? a : 1;
}

/**
 * Build the vertex stream for a scatter line.
 *
 * Runs of finite points (split at non-finite points unless `connectgaps`) are shaped
 * independently and joined with one NaN vertex. A single-point run is emitted as-is (the line
 * primitive draws nothing for it). O(n) time; no per-point object allocation.
 */
export function buildLinePath(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  opts: LinePathOptions,
): LinePath {
  const n = Math.min(x.length, y.length);

  // Compact finite points and record run boundaries. Compaction makes every run a contiguous
  // [start, end) slice, which the shapers below index directly.
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);
  const runEnds = new Int32Array(n);
  let m = 0;
  let runs = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i] as number;
    const yi = y[i] as number;
    if (Number.isFinite(xi) && Number.isFinite(yi)) {
      cx[m] = xi;
      cy[m] = yi;
      m++;
    } else if (!opts.connectgaps && m > (runs > 0 ? (runEnds[runs - 1] as number) : 0)) {
      runEnds[runs++] = m;
    }
  }
  if (m > (runs > 0 ? (runEnds[runs - 1] as number) : 0)) runEnds[runs++] = m;

  const sx = sanitizeScale(opts.scaleX);
  const sy = sanitizeScale(opts.scaleY);
  const { shape } = opts;
  const smooth = shape === 'spline' && opts.smoothing > 0;

  // Exact for linear/steps; a starting guess for splines (the stream grows as needed).
  const perPoint =
    shape === 'hv' || shape === 'vh' ? 2 : shape === 'hvh' || shape === 'vhv' ? 3 : smooth ? 4 : 1;
  const out = new VertexStream(m * perPoint + runs);

  const canDecimate = opts.simplify && (shape === 'linear' || shape === 'spline');
  let decX: Float64Array | undefined;
  let decY: Float64Array | undefined;
  let tangents: Float64Array | undefined;
  let decimated = false;

  let start = 0;
  for (let r = 0; r < runs; r++) {
    const end = runEnds[r] as number;
    if (r > 0) out.push(NaN, NaN);

    let xs: Float64Array = cx;
    let ys: Float64Array = cy;
    let a = start;
    let b = end;
    if (canDecimate) {
      decX ??= new Float64Array(m);
      decY ??= new Float64Array(m);
      const count = decimateRun(cx, cy, start, end, sx, decX, decY);
      if (count >= 0) {
        xs = decX;
        ys = decY;
        a = 0;
        b = count;
        decimated = true;
      }
    }

    switch (shape) {
      case 'hv':
      case 'vh':
      case 'hvh':
      case 'vhv':
        stepRun(xs, ys, a, b, shape, out);
        break;
      case 'spline':
        if (smooth && b - a >= 3) {
          tangents ??= new Float64Array(4 * m);
          splineRun(xs, ys, a, b, opts.smoothing, sx, sy, tangents, out);
        } else {
          linearRun(xs, ys, a, b, out);
        }
        break;
      default:
        linearRun(xs, ys, a, b, out);
    }
    start = end;
  }

  const { x: ox, y: oy } = out.finish();
  return { x: ox, y: oy, decimated };
}

/** Straight segments: the points as-is. */
function linearRun(
  xs: Float64Array,
  ys: Float64Array,
  a: number,
  b: number,
  out: VertexStream,
): void {
  for (let i = a; i < b; i++) out.push(xs[i] as number, ys[i] as number);
}

/** plotly.js `Drawing.steps`, in linear space (steps survive the affine transform). */
function stepRun(
  xs: Float64Array,
  ys: Float64Array,
  a: number,
  b: number,
  shape: 'hv' | 'vh' | 'hvh' | 'vhv',
  out: VertexStream,
): void {
  if (b <= a) return;
  let x0 = xs[a] as number;
  let y0 = ys[a] as number;
  out.push(x0, y0);
  for (let i = a + 1; i < b; i++) {
    const x1 = xs[i] as number;
    const y1 = ys[i] as number;
    switch (shape) {
      case 'hv':
        out.push(x1, y0);
        break;
      case 'vh':
        out.push(x0, y1);
        break;
      case 'hvh': {
        const xm = (x0 + x1) / 2;
        out.push(xm, y0);
        out.push(xm, y1);
        break;
      }
      case 'vhv': {
        const ym = (y0 + y1) / 2;
        out.push(x0, ym);
        out.push(x1, ym);
        break;
      }
    }
    out.push(x1, y1);
    x0 = x1;
    y0 = y1;
  }
}

/**
 * plotly.js `makeTangent` at point `i` between `prev` and `next` (px space): writes the incoming
 * `[x, y]` and outgoing `[x, y]` Bézier control points to `out[o … o + 3]`.
 */
export function splineTangent(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  prev: number,
  i: number,
  next: number,
  smoothing: number,
  sx: number,
  sy: number,
  out: Float64Array,
  o: number,
): void {
  const tx = (xs[i] as number) * sx;
  const ty = (ys[i] as number) * sy;
  const d1x = (xs[prev] as number) * sx - tx;
  const d1y = (ys[prev] as number) * sy - ty;
  const d2x = (xs[next] as number) * sx - tx;
  const d2y = (ys[next] as number) * sy - ty;
  const d1a = Math.pow(d1x * d1x + d1y * d1y, CATMULL_ROM_EXP / 2);
  const d2a = Math.pow(d2x * d2x + d2y * d2y, CATMULL_ROM_EXP / 2);
  const numx = (d2a * d2a * d1x - d1a * d1a * d2x) * smoothing;
  const numy = (d2a * d2a * d1y - d1a * d1a * d2y) * smoothing;
  const denom1 = 3 * d2a * (d1a + d2a);
  const denom2 = 3 * d1a * (d1a + d2a);
  // A zero denominator means a coincident neighbour; Plotly then puts the control on the point.
  out[o] = tx + (denom1 ? numx / denom1 : 0);
  out[o + 1] = ty + (denom1 ? numy / denom1 : 0);
  out[o + 2] = tx - (denom2 ? numx / denom2 : 0);
  out[o + 3] = ty - (denom2 ? numy / denom2 : 0);
}

/**
 * plotly.js `Drawing.smoothopen` + `makeTangent` (centripetal Catmull-Rom), evaluated in px space
 * so the curve matches what Plotly draws on screen, then tessellated and mapped back to linear
 * coordinates. Requires `b - a >= 3` and `smoothing > 0`.
 *
 * `tan` is scratch of length ≥ 4·(b − a): per point `[inX, inY, outX, outY]` control points (px).
 */
function splineRun(
  xs: Float64Array,
  ys: Float64Array,
  a: number,
  b: number,
  smoothing: number,
  sx: number,
  sy: number,
  tan: Float64Array,
  out: VertexStream,
): void {
  const len = b - a;
  for (let i = 1; i < len - 1; i++) {
    splineTangent(xs, ys, a + i - 1, a + i, a + i + 1, smoothing, sx, sy, tan, 4 * i);
  }

  out.push(xs[a] as number, ys[a] as number);
  // First segment: quadratic with the incoming control of p1.
  quadratic(xs, ys, a, a + 1, tan[4] as number, tan[5] as number, sx, sy, out);
  // Middle segments: cubic with p(i−1)'s outgoing and p(i)'s incoming controls.
  for (let i = 2; i < len - 1; i++) {
    cubic(
      xs,
      ys,
      a + i - 1,
      a + i,
      tan[4 * (i - 1) + 2] as number,
      tan[4 * (i - 1) + 3] as number,
      tan[4 * i] as number,
      tan[4 * i + 1] as number,
      sx,
      sy,
      out,
    );
  }
  // Last segment: quadratic with the outgoing control of p(n−2).
  const k = len - 2;
  quadratic(
    xs,
    ys,
    a + k,
    a + k + 1,
    tan[4 * k + 2] as number,
    tan[4 * k + 3] as number,
    sx,
    sy,
    out,
  );
}

/** Subdivisions for a Bézier whose control polygon is `lengthPx` long (≈3 px chords). */
function subdivisions(lengthPx: number): number {
  const k = Math.ceil(lengthPx / SPLINE_CHORD_PX);
  return k < 1 || !Number.isFinite(k) ? 1 : Math.min(k, SPLINE_MAX_SUBDIVISIONS);
}

/**
 * Emit the interior samples and the end point of the quadratic Bézier `p(i0) → p(i1)` with
 * control `(cx, cy)` in px. The end point is the original data value so data points are exact.
 */
export function quadratic(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  i0: number,
  i1: number,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  out: VertexStream,
): void {
  const x0 = (xs[i0] as number) * sx;
  const y0 = (ys[i0] as number) * sy;
  const x1 = (xs[i1] as number) * sx;
  const y1 = (ys[i1] as number) * sy;
  const k = subdivisions(Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy));
  for (let j = 1; j < k; j++) {
    const t = j / k;
    const u = 1 - t;
    const w0 = u * u;
    const w1 = 2 * u * t;
    const w2 = t * t;
    out.push((w0 * x0 + w1 * cx + w2 * x1) / sx, (w0 * y0 + w1 * cy + w2 * y1) / sy);
  }
  out.push(xs[i1] as number, ys[i1] as number);
}

/** Cubic counterpart of {@link quadratic} with controls `(c1x, c1y)`, `(c2x, c2y)` in px. */
export function cubic(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  i0: number,
  i1: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  sx: number,
  sy: number,
  out: VertexStream,
): void {
  const x0 = (xs[i0] as number) * sx;
  const y0 = (ys[i0] as number) * sy;
  const x1 = (xs[i1] as number) * sx;
  const y1 = (ys[i1] as number) * sy;
  const k = subdivisions(
    Math.hypot(c1x - x0, c1y - y0) +
      Math.hypot(c2x - c1x, c2y - c1y) +
      Math.hypot(x1 - c2x, y1 - c2y),
  );
  for (let j = 1; j < k; j++) {
    const t = j / k;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    out.push(
      (w0 * x0 + w1 * c1x + w2 * c2x + w3 * x1) / sx,
      (w0 * y0 + w1 * c1y + w2 * c2y + w3 * y1) / sy,
    );
  }
  out.push(xs[i1] as number, ys[i1] as number);
}

/** The px column of linear coordinate `x` at `sx` px per unit (decimation bucket). */
export function bucketOf(x: number, sx: number): number {
  return Math.floor(x * sx);
}

/** Whether a monotonic run of `len` points from `xFirst` to `xLast` is dense enough to decimate. */
export function denseEnough(len: number, xFirst: number, xLast: number, sx: number): boolean {
  return len > DECIMATE_POINTS_PER_PX * (Math.abs(xLast - xFirst) * sx + 1);
}

/**
 * Min/max ("M4") decimation of the run `[s, e)` into `outX/outY` (from index 0): per px column
 * keep, in original order, the first, min-y, max-y and last points. Visually lossless for a
 * 1-px line because every column's vertical extent and its entry/exit points are preserved.
 *
 * Returns the number of points written, or −1 when the run is not eligible (x not monotonic, or
 * not dense enough for decimation to help).
 */
function decimateRun(
  xs: Float64Array,
  ys: Float64Array,
  s: number,
  e: number,
  sx: number,
  outX: Float64Array,
  outY: Float64Array,
): number {
  const len = e - s;
  const xFirst = xs[s] as number;
  const xLast = xs[e - 1] as number;
  if (!denseEnough(len, xFirst, xLast, sx)) return -1;

  // Columns are only contiguous in index order when x is monotonic.
  const dir = xLast >= xFirst ? 1 : -1;
  for (let i = s + 1; i < e; i++) {
    if (((xs[i] as number) - (xs[i - 1] as number)) * dir < 0) return -1;
  }

  let count = 0;
  const emit = (i: number): void => {
    outX[count] = xs[i] as number;
    outY[count] = ys[i] as number;
    count++;
  };
  // first ≤ min(lo, hi) ≤ max(lo, hi) ≤ last in index order, so no sort is needed.
  const flush = (first: number, lo: number, hi: number, last: number): void => {
    const p = Math.min(lo, hi);
    const q = Math.max(lo, hi);
    emit(first);
    if (p !== first) emit(p);
    if (q !== p) emit(q);
    if (last !== q) emit(last);
  };

  // Buckets are px columns of the linear coordinate itself (not relative to the run's first x):
  // panning (an offset change) never reshuffles them, and neither does streaming points in or
  // out at either end (E7.2), so an edit re-emits only the buckets at the ends.
  let bucket = bucketOf(xFirst, sx);
  let first = s;
  let last = s;
  let lo = s;
  let hi = s;
  for (let i = s + 1; i < e; i++) {
    const bi = bucketOf(xs[i] as number, sx);
    if (bi !== bucket) {
      flush(first, lo, hi, last);
      bucket = bi;
      first = last = lo = hi = i;
    } else {
      last = i;
      const yi = ys[i] as number;
      if (yi < (ys[lo] as number)) lo = i;
      if (yi > (ys[hi] as number)) hi = i;
    }
  }
  flush(first, lo, hi, last);
  return count;
}

/**
 * Whether `buildLinePath` output depends on the transform for these options (spline, or simplify
 * that actually decimated).
 *
 * A non-decimated `simplify` path does not depend on scale: zooming out may make it dense enough
 * to decimate, but the undecimated path is still exactly right, just not as cheap.
 */
export function pathDependsOnScale(
  opts: Pick<LinePathOptions, 'shape' | 'smoothing' | 'simplify'>,
  decimated: boolean,
): boolean {
  return (opts.shape === 'spline' && opts.smoothing > 0) || (opts.simplify && decimated);
}

/** Symmetric ratio ≥ 1 between two scale magnitudes (∞ if exactly one is degenerate). */
function scaleFactor(a: number, b: number): number {
  const p = Math.abs(a);
  const q = Math.abs(b);
  if (p === q) return 1;
  if (!(p > 0) || !(q > 0) || !Number.isFinite(p) || !Number.isFinite(q)) return Infinity;
  return p > q ? p / q : q / p;
}

/**
 * Whether a transform change from `prev` to `next` scales warrants rebuilding a scale-dependent
 * path: aspect ratio (scaleX/scaleY) changed by more than 1e-6 relative, or either scale changed
 * by a factor ≥ 2 (tessellation / decimation resolution).
 *
 * An aspect change alters the spline's shape in linear space, so any real change counts; a
 * uniform zoom leaves the curve itself unchanged and only its sampling density drifts, which is
 * tolerable up to 2×. With `spline: false` (a decimated straight line) only the x resolution
 * matters: y zooms (a streaming autorange) never rebuild it.
 */
export function needsRebuild(
  prev: { scaleX: number; scaleY: number },
  next: { scaleX: number; scaleY: number },
  options: { spline?: boolean } = {},
): boolean {
  const fx = scaleFactor(prev.scaleX, next.scaleX);
  if (options.spline === false) return fx >= 2;
  const fy = scaleFactor(prev.scaleY, next.scaleY);
  if (fx >= 2 || fy >= 2) return true;
  // Relative aspect change = (nx/ny)/(px/py) − 1, computed without dividing by a small scale.
  const aspect =
    (Math.abs(next.scaleX) * Math.abs(prev.scaleY)) /
    (Math.abs(next.scaleY) * Math.abs(prev.scaleX));
  return Math.abs(aspect - 1) > 1e-6;
}
