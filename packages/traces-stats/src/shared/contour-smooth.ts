/**
 * Contour line smoothing: samples of Plotly's `Drawing.smoothopen` / `Drawing.smoothclosed`
 * (centripetal Catmull-Rom tangents turned into quadratic/cubic Bézier spans). Pure.
 *
 * Plotly smooths the SVG path in pixels; callers here smooth in index space (before converting to
 * data coordinates), which matches Plotly on square cells. Plotly also rounds the control points to
 * 0.01 px; this does not.
 */

/** Plotly's `CatmullRomExp`. */
const CATMULL_ROM_EXP = 0.5;

/** Tangent control points before and after point `c` (Plotly's `makeTangent`). */
function tangent(
  px: number,
  py: number,
  cx: number,
  cy: number,
  nx: number,
  ny: number,
  s: number,
  out: Float64Array,
  o: number,
): void {
  const d1x = px - cx;
  const d1y = py - cy;
  const d2x = nx - cx;
  const d2y = ny - cy;
  const d1a = Math.pow(d1x * d1x + d1y * d1y, CATMULL_ROM_EXP / 2);
  const d2a = Math.pow(d2x * d2x + d2y * d2y, CATMULL_ROM_EXP / 2);
  const numx = (d2a * d2a * d1x - d1a * d1a * d2x) * s;
  const numy = (d2a * d2a * d1y - d1a * d1a * d2y) * s;
  const denom1 = 3 * d2a * (d1a + d2a);
  const denom2 = 3 * d1a * (d1a + d2a);
  out[o] = cx + (denom1 ? numx / denom1 : 0);
  out[o + 1] = cy + (denom1 ? numy / denom1 : 0);
  out[o + 2] = cx - (denom2 ? numx / denom2 : 0);
  out[o + 3] = cy - (denom2 ? numy / denom2 : 0);
}

/** Append `segs` samples (excluding t = 0) of the quadratic Bézier p0 → q → p1. */
function sampleQuad(
  xs: number[],
  ys: number[],
  x0: number,
  y0: number,
  qx: number,
  qy: number,
  x1: number,
  y1: number,
  segs: number,
): void {
  for (let k = 1; k <= segs; k++) {
    if (k === segs) {
      xs.push(x1);
      ys.push(y1);
      break;
    }
    const t = k / segs;
    const u = 1 - t;
    xs.push(u * u * x0 + 2 * u * t * qx + t * t * x1);
    ys.push(u * u * y0 + 2 * u * t * qy + t * t * y1);
  }
}

/** Append `segs` samples (excluding t = 0) of the cubic Bézier p0 → c1 → c2 → p1. */
function sampleCubic(
  xs: number[],
  ys: number[],
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x1: number,
  y1: number,
  segs: number,
  includeEnd: boolean,
): void {
  for (let k = 1; k <= segs; k++) {
    if (k === segs) {
      if (includeEnd) {
        xs.push(x1);
        ys.push(y1);
      }
      break;
    }
    const t = k / segs;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    xs.push(a * x0 + b * c1x + c * c2x + d * x1);
    ys.push(a * y0 + b * c1y + c * c2y + d * y1);
  }
}

/**
 * A smoothed copy of a polyline, sampled with `segmentsPerSpan` segments per input span.
 *
 * - `smoothing` 0 (or not positive/finite), or fewer than 3 points: the input points, copied.
 * - Open paths (`smoothopen`): quadratic first and last spans, cubic spans between; the endpoints
 *   are kept exactly and the result has `1 + (n − 1)·segmentsPerSpan` points.
 * - Closed paths (`smoothclosed`): cubic spans all the way round, including the closing span; the
 *   result stays closed without repeating its first point and has `n·segmentsPerSpan` points.
 *
 * Every input point is on the result (at every `segmentsPerSpan`-th sample).
 */
export function smoothPath(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  closed: boolean,
  smoothing: number,
  segmentsPerSpan = 8,
): { x: Float64Array; y: Float64Array } {
  const n = Math.min(x.length, y.length);
  const segs = Math.max(1, Math.floor(segmentsPerSpan));
  if (!(smoothing > 0) || !Number.isFinite(smoothing) || n < 3) {
    return {
      x: Float64Array.from({ length: n }, (_, k) => x[k] as number),
      y: Float64Array.from({ length: n }, (_, k) => y[k] as number),
    };
  }
  const px = (k: number): number => x[k] as number;
  const py = (k: number): number => y[k] as number;
  // t[4k..4k+3]: control points before (x, y) and after (x, y) point k.
  const t = new Float64Array(4 * n);
  const xs: number[] = [px(0)];
  const ys: number[] = [py(0)];
  if (!closed) {
    for (let k = 1; k < n - 1; k++) {
      tangent(px(k - 1), py(k - 1), px(k), py(k), px(k + 1), py(k + 1), smoothing, t, 4 * k);
    }
    sampleQuad(xs, ys, px(0), py(0), t[4] as number, t[5] as number, px(1), py(1), segs);
    for (let k = 2; k < n - 1; k++) {
      const a = 4 * (k - 1);
      const b = 4 * k;
      sampleCubic(
        xs,
        ys,
        px(k - 1),
        py(k - 1),
        t[a + 2] as number,
        t[a + 3] as number,
        t[b] as number,
        t[b + 1] as number,
        px(k),
        py(k),
        segs,
        true,
      );
    }
    const l = 4 * (n - 2);
    sampleQuad(
      xs,
      ys,
      px(n - 2),
      py(n - 2),
      t[l + 2] as number,
      t[l + 3] as number,
      px(n - 1),
      py(n - 1),
      segs,
    );
  } else {
    for (let k = 0; k < n; k++) {
      const p = (k + n - 1) % n;
      const q = (k + 1) % n;
      tangent(px(p), py(p), px(k), py(k), px(q), py(q), smoothing, t, 4 * k);
    }
    for (let k = 1; k <= n; k++) {
      const a = 4 * (k - 1);
      const kk = k % n;
      const b = 4 * kk;
      sampleCubic(
        xs,
        ys,
        px(k - 1),
        py(k - 1),
        t[a + 2] as number,
        t[a + 3] as number,
        t[b] as number,
        t[b + 1] as number,
        px(kk),
        py(kk),
        segs,
        k < n,
      );
    }
  }
  return { x: Float64Array.from(xs), y: Float64Array.from(ys) };
}
