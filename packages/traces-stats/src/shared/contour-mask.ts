/**
 * The data mask of contours with gaps (Plotly `contour/plot.js` `clipGaps` + `makeClipMask`), in
 * fractional index space. Pure.
 *
 * With `connectgaps: false`, Plotly still contours the gap-filled grid but clips the drawing to the
 * region near data: the 0.9 level of the presence field (1 at grid points with data, 0 at empty
 * ones), unsmoothed. The boundary crosses each grid edge between a present and an empty point 10%
 * of the way from the present one, so an isolated empty point cuts a small diamond out of the
 * contours and a lone data point in a sea of gaps keeps a small diamond.
 *
 * {@link maskRegion} is that region as rings for the nonzero rule (fills are clipped to it on the
 * GPU with the `'intersect'` fill rule); {@link clipPathToMask} clips a contour line to it on the
 * CPU, exactly (the region is a union of convex pieces per grid cell).
 */
import type { ContourRegion } from './contour-fill.ts';
import { levelRegion } from './contour-fill.ts';
import { marchingSquares, type ContourGrid, type ContourPath } from './contour-march.ts';

/** Plotly's mask level: the boundary sits this far from an empty point towards a present one. */
export const MASK_LEVEL = 0.9;

/** The presence field of a grid: 1 where `z` is finite, 0 where it is empty. */
export function presenceField(z: ArrayLike<number>, n = z.length): Float64Array {
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) out[k] = Number.isFinite(z[k]) ? 1 : 0;
  return out;
}

/** Whether a presence field has any empty point. */
export function hasGaps(field: ArrayLike<number>): boolean {
  for (let k = 0; k < field.length; k++) if (field[k] !== 1) return true;
  return false;
}

/** The masked region (`presence ≥ 0.9`) as rings for the nonzero rule, in index coordinates. */
export function maskRegion(field: Float64Array, nx: number, ny: number): ContourRegion {
  const grid: ContourGrid = { z: field, nx, ny };
  return levelRegion(marchingSquares(grid, MASK_LEVEL), grid, MASK_LEVEL);
}

/** Corner k of cell (i, j): 0 bottom-left, 1 bottom-right, 2 top-right, 3 top-left. */
const CORNER_DI = [0, 1, 1, 0];
const CORNER_DJ = [0, 0, 1, 1];

/**
 * The convex pieces of the mask inside cell (i, j), counter-clockwise, as flat [x, y, …] lists:
 * one piece per contiguous run of present corners (a saddle's two present corners are separate,
 * as marching squares separates them at level 0.9), or the whole cell.
 */
function cellPieces(field: Float64Array, nx: number, i: number, j: number): number[][] {
  const up = [0, 1, 2, 3].map((k) => field[(j + CORNER_DJ[k]!) * nx + i + CORNER_DI[k]!] === 1);
  const count = up.filter(Boolean).length;
  const cx = (k: number): number => i + CORNER_DI[k & 3]!;
  const cy = (k: number): number => j + CORNER_DJ[k & 3]!;
  if (count === 4) return [[cx(0), cy(0), cx(1), cy(1), cx(2), cy(2), cx(3), cy(3)]];
  if (count === 0) return [];
  // Edge e runs from corner e to corner e + 1; the crossing sits 10% from the present corner.
  const crossing = (e: number): [number, number] => {
    const a = e & 3;
    const b = (e + 1) & 3;
    const t = up[a] ? 1 - MASK_LEVEL : MASK_LEVEL;
    return [cx(a) + t * (cx(b) - cx(a)), cy(a) + t * (cy(b) - cy(a))];
  };
  const pieces: number[][] = [];
  const saddle = count === 2 && up[0] === up[2];
  for (let s = 0; s < 4; s++) {
    // Start of a run: present corner s whose predecessor is empty.
    if (!up[s] || up[(s + 3) & 3]) continue;
    let e = s;
    while (up[(e + 1) & 3] && !saddle) e = (e + 1) & 3;
    const piece: number[] = [...crossing((s + 3) & 3)];
    for (let k = s; ; k = (k + 1) & 3) {
      piece.push(cx(k), cy(k));
      if (k === e) break;
    }
    piece.push(...crossing(e));
    pieces.push(piece);
  }
  return pieces;
}

/** Whether (x, y) lies in a convex counter-clockwise polygon (boundary included). */
function inConvex(poly: readonly number[], x: number, y: number): boolean {
  const n = poly.length / 2;
  for (let k = 0; k < n; k++) {
    const x0 = poly[2 * k]!;
    const y0 = poly[2 * k + 1]!;
    const x1 = poly[(2 * k + 2) % (2 * n)]!;
    const y1 = poly[(2 * k + 3) % (2 * n)]!;
    if ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0) < -1e-12) return false;
  }
  return true;
}

/** A mask field with cached cell pieces, for {@link clipPathToMask}. */
export interface MaskIndex {
  readonly field: Float64Array;
  readonly nx: number;
  readonly ny: number;
  readonly pieces: Map<number, number[][]>;
}

/** Index a presence field for clipping. */
export function maskIndex(field: Float64Array, nx: number, ny: number): MaskIndex {
  return { field, nx, ny, pieces: new Map() };
}

function piecesOf(m: MaskIndex, i: number, j: number): number[][] {
  const key = j * m.nx + i;
  let p = m.pieces.get(key);
  if (!p) m.pieces.set(key, (p = cellPieces(m.field, m.nx, i, j)));
  return p;
}

function cellOf(v: number, n: number): number {
  return Math.min(Math.max(Math.floor(v), 0), n - 2);
}

/** Whether an index-space point is inside the mask. */
export function inMask(m: MaskIndex, x: number, y: number): boolean {
  if (m.nx < 2 || m.ny < 2) return false;
  const i = cellOf(x, m.nx);
  const j = cellOf(y, m.ny);
  return piecesOf(m, i, j).some((p) => inConvex(p, x, y));
}

/** Parameters in (0, 1) where segment a→b crosses the mask boundary. */
function crossings(m: MaskIndex, ax: number, ay: number, bx: number, by: number): number[] {
  const out: number[] = [];
  const i0 = cellOf(Math.min(ax, bx), m.nx);
  const i1 = cellOf(Math.max(ax, bx), m.nx);
  const j0 = cellOf(Math.min(ay, by), m.ny);
  const j1 = cellOf(Math.max(ay, by), m.ny);
  const dx = bx - ax;
  const dy = by - ay;
  const f = m.field;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const c = j * m.nx + i;
      // Cells with every corner present hold no boundary.
      if (f[c] === 1 && f[c + 1] === 1 && f[c + m.nx] === 1 && f[c + m.nx + 1] === 1) continue;
      for (const poly of piecesOf(m, i, j)) {
        const n = poly.length / 2;
        for (let k = 0; k < n; k++) {
          const px = poly[2 * k]!;
          const py = poly[2 * k + 1]!;
          const qx = poly[(2 * k + 2) % (2 * n)]!;
          const qy = poly[(2 * k + 3) % (2 * n)]!;
          // Edges along the cell's sides are shared with the neighbour's pieces, not boundary.
          if (
            (px === qx && (px === i || px === i + 1)) ||
            (py === qy && (py === j || py === j + 1))
          ) {
            continue;
          }
          const ex = qx - px;
          const ey = qy - py;
          const den = dx * ey - dy * ex;
          if (den === 0) continue;
          const t = ((px - ax) * ey - (py - ay) * ex) / den;
          const u = ((px - ax) * dy - (py - ay) * dx) / den;
          if (t > 0 && t < 1 && u >= 0 && u <= 1) out.push(t);
        }
      }
    }
  }
  return out.sort((p, q) => p - q);
}

/**
 * The parts of a contour line (index coordinates) inside the mask, as paths. A closed path that
 * stays inside comes back unchanged; cut paths come back open (a closed path cut once or more is
 * joined across its first point).
 */
export function clipPathToMask(path: ContourPath, m: MaskIndex): ContourPath[] {
  const n = path.x.length;
  if (n === 0) return [];
  const segs = path.closed ? n : n - 1;
  const pieces: { x: number[]; y: number[] }[] = [];
  let cur: { x: number[]; y: number[] } | undefined;
  let cut = false;
  const push = (x: number, y: number): void => {
    if (!cur) pieces.push((cur = { x: [], y: [] }));
    const len = cur.x.length;
    if (len > 0 && cur.x[len - 1] === x && cur.y[len - 1] === y) return;
    cur.x.push(x);
    cur.y.push(y);
  };
  if (n === 1) return inMask(m, path.x[0]!, path.y[0]!) ? [path] : [];
  for (let s = 0; s < segs; s++) {
    const ax = path.x[s]!;
    const ay = path.y[s]!;
    const bx = path.x[(s + 1) % n]!;
    const by = path.y[(s + 1) % n]!;
    const ts = [0, ...crossings(m, ax, ay, bx, by), 1];
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k]!;
      const t1 = ts[k + 1]!;
      if (t1 - t0 <= 0) continue;
      const tm = (t0 + t1) / 2;
      const inside = inMask(m, ax + tm * (bx - ax), ay + tm * (by - ay));
      if (inside) {
        push(ax + t0 * (bx - ax), ay + t0 * (by - ay));
        push(ax + t1 * (bx - ax), ay + t1 * (by - ay));
      } else {
        cut = true;
        cur = undefined;
      }
    }
  }
  if (!cut) return [path];
  // A closed path's first and last pieces meet at its first point: join them.
  if (path.closed && pieces.length > 1) {
    const first = pieces[0]!;
    const last = pieces[pieces.length - 1]!;
    const lx = last.x[last.x.length - 1];
    const ly = last.y[last.y.length - 1];
    if (lx === first.x[0] && ly === first.y[0] && cur === last) {
      pieces.pop();
      first.x.splice(0, 1, ...last.x);
      first.y.splice(0, 1, ...last.y);
    }
  }
  return pieces
    .filter((p) => p.x.length >= 2)
    .map((p) => ({ x: Float64Array.from(p.x), y: Float64Array.from(p.y), closed: false }));
}
