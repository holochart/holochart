/**
 * Marching squares for one contour level (Plotly `contour/make_crossings.js` +
 * `find_all_paths.js`), in fractional index space. Pure.
 *
 * Grid point (i, j) holds `z[j·nx + i]` (i along x, j along y). A contour crosses the grid edge
 * between an "above" corner (z ≥ level) and a "below" one at the linearly interpolated position;
 * every edge crossing is computed from the same two corners in the same order, so the cells on
 * both sides of an edge share bit-identical points. Saddle cells (two diagonal corners above) are
 * resolved with the average of the four corners: when it is ≥ level the above corners connect
 * through the cell (Plotly's rule, with ties going to "above").
 *
 * Paths are oriented with the above side on the LEFT (in a y-up frame x = i, y = j): closed loops
 * around maxima run counter-clockwise, loops around minima clockwise, and open paths run from the
 * grid boundary to the grid boundary. Closed paths do not repeat their first point.
 */

/** A row-major grid of z values: `z[j·nx + i]`. */
export interface ContourGrid {
  z: ArrayLike<number>;
  nx: number;
  ny: number;
}

/** A contour polyline in fractional index (or, after conversion, data) coordinates. */
export interface ContourPath {
  x: Float64Array;
  y: Float64Array;
  /** Closed loop (the first point is not repeated) or open path ending on the grid boundary. */
  closed: boolean;
}

/**
 * Segments of one cell, as (from edge, to edge) pairs in the cell's counter-clockwise edge order
 * (0 bottom, 1 right, 2 top, 3 left). Corner k (0 bottom-left, 1 bottom-right, 2 top-right,
 * 3 top-left) sits between edges k − 1 and k.
 */
function cellSegments(
  above: number,
  za: number,
  zb: number,
  zc: number,
  zd: number,
  level: number,
): number[] {
  const up = (k: number): boolean => ((above >> (k & 3)) & 1) === 1;
  if (above === 5 || above === 10) {
    const out: number[] = [];
    if ((za + zb + zc + zd) / 4 >= level) {
      // Above corners joined: cut off each below corner, below on the right.
      for (let k = 0; k < 4; k++) if (!up(k)) out.push((k + 3) & 3, k);
    } else {
      // Above corners separated: cut off each above corner, above on the left.
      for (let k = 0; k < 4; k++) if (up(k)) out.push(k, (k + 3) & 3);
    }
    return out;
  }
  // One contiguous run of above corners s…e (counter-clockwise): leave through the edge after
  // its last corner, towards the edge before its first corner.
  let s = 0;
  let e = 0;
  for (let k = 0; k < 4; k++) {
    if (up(k) && !up(k + 3)) s = k;
    if (up(k) && !up(k + 1)) e = k;
  }
  return [e, (s + 3) & 3];
}

/**
 * The contour lines of `grid` at `level`, as maximal polylines in index coordinates. Cells with a
 * non-finite corner are skipped (run {@link fillGaps} first); grids narrower than 2×2 have no
 * paths. Degenerate paths (a single repeated point) are dropped.
 */
export function marchingSquares(grid: ContourGrid, level: number): ContourPath[] {
  const { z, nx, ny } = grid;
  if (!(nx >= 2 && ny >= 2) || !Number.isFinite(level)) return [];
  const nH = (nx - 1) * ny;
  const nEdges = nH + nx * (ny - 1);
  const segFrom: number[] = [];
  const segTo: number[] = [];

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const za = z[j * nx + i] as number;
      const zb = z[j * nx + i + 1] as number;
      const zc = z[(j + 1) * nx + i + 1] as number;
      const zd = z[(j + 1) * nx + i] as number;
      if (
        !Number.isFinite(za) ||
        !Number.isFinite(zb) ||
        !Number.isFinite(zc) ||
        !Number.isFinite(zd)
      ) {
        continue;
      }
      const above =
        (za >= level ? 1 : 0) |
        (zb >= level ? 2 : 0) |
        (zc >= level ? 4 : 0) |
        (zd >= level ? 8 : 0);
      if (above === 0 || above === 15) continue;
      // Global ids of the bottom, right, top and left edges.
      const edges = [
        j * (nx - 1) + i,
        nH + j * nx + i + 1,
        (j + 1) * (nx - 1) + i,
        nH + j * nx + i,
      ];
      const segs = cellSegments(above, za, zb, zc, zd, level);
      for (let s = 0; s < segs.length; s += 2) {
        segFrom.push(edges[segs[s] as number] as number);
        segTo.push(edges[segs[s + 1] as number] as number);
      }
    }
  }
  const nSeg = segFrom.length;
  if (nSeg === 0) return [];

  const outSeg = new Int32Array(nEdges).fill(-1);
  const inSeg = new Int32Array(nEdges).fill(-1);
  for (let s = 0; s < nSeg; s++) {
    outSeg[segFrom[s] as number] = s;
    inSeg[segTo[s] as number] = s;
  }

  /** Crossing on an edge; always interpolated from its lower-index corner. */
  const crossing = (edge: number, xs: number[], ys: number[]): void => {
    let i: number;
    let j: number;
    let z1: number;
    let z0: number;
    const horizontal = edge < nH;
    if (horizontal) {
      i = edge % (nx - 1);
      j = (edge - i) / (nx - 1);
      z0 = z[j * nx + i] as number;
      z1 = z[j * nx + i + 1] as number;
    } else {
      const e = edge - nH;
      i = e % nx;
      j = (e - i) / nx;
      z0 = z[j * nx + i] as number;
      z1 = z[(j + 1) * nx + i] as number;
    }
    const t = (level - z0) / (z1 - z0);
    const x = horizontal ? i + t : i;
    const y = horizontal ? j : j + t;
    const n = xs.length;
    // Skip repeats (crossings through a grid point exactly at the level).
    if (n > 0 && xs[n - 1] === x && ys[n - 1] === y) return;
    xs.push(x);
    ys.push(y);
  };

  const visited = new Uint8Array(nSeg);
  const paths: ContourPath[] = [];
  const emit = (xs: number[], ys: number[], closed: boolean): void => {
    let n = xs.length;
    if (closed) {
      while (n > 1 && xs[n - 1] === xs[0] && ys[n - 1] === ys[0]) n--;
    }
    if (n < (closed ? 3 : 2)) return;
    paths.push({
      x: Float64Array.from(xs.slice(0, n)),
      y: Float64Array.from(ys.slice(0, n)),
      closed,
    });
  };

  // Open paths start where a segment leaves an edge no segment enters (the grid boundary, or the
  // border of skipped non-finite cells).
  for (let s0 = 0; s0 < nSeg; s0++) {
    if (visited[s0] || inSeg[segFrom[s0] as number] !== -1) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    crossing(segFrom[s0] as number, xs, ys);
    let s = s0;
    while (s !== -1 && !visited[s]) {
      visited[s] = 1;
      crossing(segTo[s] as number, xs, ys);
      s = outSeg[segTo[s] as number] as number;
    }
    emit(xs, ys, false);
  }
  // Everything left forms closed loops.
  for (let s0 = 0; s0 < nSeg; s0++) {
    if (visited[s0]) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    let s = s0;
    let closed = false;
    for (;;) {
      visited[s] = 1;
      crossing(segFrom[s] as number, xs, ys);
      const next = outSeg[segTo[s] as number] as number;
      if (next === s0) {
        closed = true;
        break;
      }
      if (next === -1 || visited[next]) {
        crossing(segTo[s] as number, xs, ys);
        break;
      }
      s = next;
    }
    emit(xs, ys, closed);
  }
  return paths;
}

/** Contour paths for every level, in order (one {@link marchingSquares} call per level). */
export function marchLevels(grid: ContourGrid, levels: readonly number[]): ContourPath[][] {
  return levels.map((level) => marchingSquares(grid, level));
}

/**
 * Map a fractional grid index to a data coordinate by piecewise-linear interpolation between the
 * cell-center coordinates `centers` (non-uniform grids allowed); indices outside `[0, n − 1]`
 * extrapolate the first/last interval. Whole indices return the center exactly.
 */
export function indexToData(fi: number, centers: ArrayLike<number>): number {
  const n = centers.length;
  if (n === 0) return NaN;
  if (n === 1) return centers[0] as number;
  const i0 = Math.min(Math.max(Math.floor(fi), 0), n - 2);
  const t = fi - i0;
  const c0 = centers[i0] as number;
  const c1 = centers[i0 + 1] as number;
  if (t === 0) return c0;
  if (t === 1) return c1;
  return c0 + t * (c1 - c0);
}

/** A path converted from index to data coordinates with {@link indexToData}. */
export function pathToData(
  path: ContourPath,
  xCenters: ArrayLike<number>,
  yCenters: ArrayLike<number>,
): ContourPath {
  const n = path.x.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    x[k] = indexToData(path.x[k] as number, xCenters);
    y[k] = indexToData(path.y[k] as number, yCenters);
  }
  return { x, y, closed: path.closed };
}
