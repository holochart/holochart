/**
 * Filled-contour regions (Plotly `contour/close_boundaries.js` + the perimeter joining in
 * `contour/plot.js`), in fractional index space. Pure.
 *
 * Plotly paints filled contours back to front: the whole grid rectangle in the color of the band
 * below the first level ({@link gridBoundary}), then, for each level in ascending order, the region
 * `{z ≥ level}` in the color of the band above that level, each over the previous ones.
 * {@link levelRegion} builds that region for one level from its marching-squares paths: closed
 * loops as they are, and open paths chained along the grid boundary into rings.
 *
 * The rings are meant for the NONZERO fill rule: outer boundaries run counter-clockwise (+1) and
 * holes around minima clockwise (−1), in the y-up frame x = i, y = j.
 */
import type { ContourGrid, ContourPath } from './contour-march.ts';

/** Rings of one level region: ring r spans vertices `rings[r]` up to `rings[r + 1]` (or the end). */
export interface ContourRegion {
  x: Float64Array;
  y: Float64Array;
  /** Start vertex of each ring. Rings are implicitly closed (the first point is not repeated). */
  rings: Uint32Array;
}

/** The grid rectangle `[0, nx − 1] × [0, ny − 1]` as a counter-clockwise closed path. */
export function gridBoundary(nx: number, ny: number): ContourPath {
  const w = nx - 1;
  const h = ny - 1;
  return { x: Float64Array.of(0, w, w, 0), y: Float64Array.of(0, 0, h, h), closed: true };
}

/**
 * Distance along the boundary of `[0, w] × [0, h]`, counter-clockwise from (0, 0), of the boundary
 * point nearest to (x, y), in `[0, 2(w + h))`.
 */
export function perimeterParam(x: number, y: number, w: number, h: number): number {
  const cx = Math.min(Math.max(x, 0), w);
  const cy = Math.min(Math.max(y, 0), h);
  const dB = Math.abs(y);
  const dR = Math.abs(w - x);
  const dT = Math.abs(h - y);
  const dL = Math.abs(x);
  const m = Math.min(dB, dR, dT, dL);
  if (m === dB) return cx;
  if (m === dR) return w + cy;
  if (m === dT) return w + h + (w - cx);
  const p = 2 * w + h + (h - cy);
  return p >= 2 * (w + h) ? 0 : p;
}

interface OpenPath {
  path: ContourPath;
  start: number;
  end: number;
}

/** Whether the grid boundary lies in `{z ≥ level}` (used when no open path crosses it). */
function boundaryAbove(grid: ContourGrid, level: number): boolean {
  const { z, nx, ny } = grid;
  let any = false;
  const check = (idx: number): boolean => {
    const v = z[idx] as number;
    if (!Number.isFinite(v)) return true;
    if (v < level) return false;
    any = true;
    return true;
  };
  for (let i = 0; i < nx; i++) {
    if (!check(i) || !check((ny - 1) * nx + i)) return false;
  }
  for (let j = 1; j < ny - 1; j++) {
    if (!check(j * nx) || !check(j * nx + nx - 1)) return false;
  }
  return any;
}

/**
 * The region `{z ≥ level}` as rings for the nonzero fill rule, from the paths
 * {@link marchingSquares} returned for that level (index coordinates).
 *
 * Open paths are chained counter-clockwise along the grid boundary: from the end of a path, walk
 * the boundary (above side on the left), adding the corners passed, to the nearest path start, and
 * continue with that path until the ring closes. Endpoints are sorted by their distance along the
 * boundary, so paths ending on corners or several paths ending on one edge join correctly. Without
 * open paths, the whole boundary rectangle is added when the boundary is above the level.
 */
export function levelRegion(
  paths: readonly ContourPath[],
  grid: ContourGrid,
  level: number,
): ContourRegion {
  const { nx, ny } = grid;
  const xs: number[] = [];
  const ys: number[] = [];
  const rings: number[] = [];
  if (!(nx >= 2 && ny >= 2)) {
    return { x: new Float64Array(0), y: new Float64Array(0), rings: new Uint32Array(0) };
  }
  const w = nx - 1;
  const h = ny - 1;
  const perimeter = 2 * (w + h);
  const eps = perimeter * 1e-9;
  const corners: [number, number, number][] = [
    [0, 0, 0],
    [w, w, 0],
    [w + h, w, h],
    [2 * w + h, 0, h],
  ];
  /** Counter-clockwise boundary distance from a to b, in [0, perimeter). */
  const ccw = (a: number, b: number): number => {
    let d = (b - a) % perimeter;
    if (d < 0) d += perimeter;
    return d > perimeter - eps ? 0 : d;
  };

  const open: OpenPath[] = [];
  for (const path of paths) {
    const n = path.x.length;
    if (n === 0) continue;
    if (path.closed) {
      rings.push(xs.length);
      for (let k = 0; k < n; k++) {
        xs.push(path.x[k] as number);
        ys.push(path.y[k] as number);
      }
      continue;
    }
    open.push({
      path,
      start: perimeterParam(path.x[0] as number, path.y[0] as number, w, h),
      end: perimeterParam(path.x[n - 1] as number, path.y[n - 1] as number, w, h),
    });
  }

  if (open.length === 0) {
    if (boundaryAbove(grid, level)) {
      rings.push(xs.length);
      xs.push(0, w, w, 0);
      ys.push(0, 0, h, h);
    }
  } else {
    const used = new Uint8Array(open.length);
    for (let first = 0; first < open.length; first++) {
      if (used[first]) continue;
      rings.push(xs.length);
      let cur = first;
      for (let guard = 0; guard <= open.length; guard++) {
        const o = open[cur] as OpenPath;
        used[cur] = 1;
        const n = o.path.x.length;
        for (let k = 0; k < n; k++) {
          xs.push(o.path.x[k] as number);
          ys.push(o.path.y[k] as number);
        }
        // Nearest path start counter-clockwise from this end (the ring's first path included).
        let next = first;
        let best = ccw(o.end, (open[first] as OpenPath).start);
        for (let c = 0; c < open.length; c++) {
          if (used[c]) continue;
          const d = ccw(o.end, (open[c] as OpenPath).start);
          if (d < best) {
            best = d;
            next = c;
          }
        }
        // Boundary corners strictly between the end and that start.
        const passed: [number, number, number][] = [];
        for (const [p, cx, cy] of corners) {
          const d = ccw(o.end, p);
          if (d > eps && d < best - eps) passed.push([d, cx, cy]);
        }
        passed.sort((a, b) => a[0] - b[0]);
        for (const [, cx, cy] of passed) {
          xs.push(cx);
          ys.push(cy);
        }
        if (next === first) break;
        cur = next;
      }
    }
  }
  return { x: Float64Array.from(xs), y: Float64Array.from(ys), rings: Uint32Array.from(rings) };
}

/** Signed area of a region (counter-clockwise rings positive): the filled area under nonzero. */
export function regionArea(region: ContourRegion): number {
  const { x, y, rings } = region;
  let total = 0;
  for (let r = 0; r < rings.length; r++) {
    const a = rings[r] as number;
    const b = r + 1 < rings.length ? (rings[r + 1] as number) : x.length;
    let s = 0;
    for (let k = a; k < b; k++) {
      const k1 = k + 1 < b ? k + 1 : a;
      s += (x[k] as number) * (y[k1] as number) - (x[k1] as number) * (y[k] as number);
    }
    total += s / 2;
  }
  return total;
}
