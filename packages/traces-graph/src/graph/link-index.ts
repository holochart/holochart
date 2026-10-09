/**
 * A spatial index of the drawn links of a `graph` trace (backlog G7), so that link hover does not
 * measure the distance to every link: a uniform grid over the box of the link geometry, in the
 * geometry's linear coordinates, each cell listing the links that pass through it. Pure.
 *
 * It is built the first time a pointer asks for a link and kept with the geometry (`hover.ts`
 * keeps one per `LinkGeometry` object, and a geometry is another object whenever the positions,
 * the routes or the zoom-dependent parts change), so a graph nobody hovers pays nothing.
 *
 * The grid is sized by the links: about as many cells as there are segments, but no more along
 * an axis than lets a link of mean extent span a few cells, so that a hairball of long links, or
 * of long bundled routes, does not put every link in hundreds of cells. A segment is walked in steps of at most a
 * cell and entered in the cells of the box around each step: every cell it crosses, and now and
 * then a neighbour. A query looks at the cells its reach box touches, so it finds every link
 * that has a point in that box (the point is in a cell of the link, and that cell touches the
 * box), each once.
 */
import type { LinkGeometry } from './geometry.ts';

/** The most cells along one side of the grid. */
const MAX_SIDE = 512;
/** A link of mean extent spans about this many cells along an axis at most. */
const CELLS_PER_LINK = 6;

/** The index of one geometry. */
export interface LinkIndex {
  /**
   * The links with a point within the box around (`x`, `y`) that reaches `rx` and `ry` along the
   * two axes (linear units): every such link, and maybe a few more of the cells around. Each
   * link once, in no particular order. The array is reused by the next call.
   */
  near(x: number, y: number, rx: number, ry: number): Uint32Array;
  /** Cells along x and y. */
  readonly columns: number;
  readonly rows: number;
  /** Entries in the cells, for tests and measurements. */
  readonly entries: number;
}

/** Build the index of `geometry` (see the module comment). */
export function buildLinkIndex(geometry: LinkGeometry): LinkIndex {
  const { x, y, offsets } = geometry;
  const links = offsets.length - 1;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let segments = 0;
  let drawn = 0;
  // The extents of the links along each axis, summed.
  let spanX = 0;
  let spanY = 0;
  for (let k = 0; k < links; k++) {
    const from = offsets[k]!;
    const to = offsets[k + 1]!;
    if (to - from < 2) continue;
    let lx0 = Infinity;
    let lx1 = -Infinity;
    let ly0 = Infinity;
    let ly1 = -Infinity;
    for (let i = from; i < to; i++) {
      const px = x[i]!;
      const py = y[i]!;
      if (px < lx0) lx0 = px;
      if (px > lx1) lx1 = px;
      if (py < ly0) ly0 = py;
      if (py > ly1) ly1 = py;
    }
    if (!Number.isFinite(lx0 + lx1 + ly0 + ly1)) continue;
    drawn++;
    segments += to - from - 1;
    spanX += lx1 - lx0;
    spanY += ly1 - ly0;
    if (lx0 < x0) x0 = lx0;
    if (lx1 > x1) x1 = lx1;
    if (ly0 < y0) y0 = ly0;
    if (ly1 > y1) y1 = ly1;
  }
  const empty = new Uint32Array(0);
  if (segments === 0 || !Number.isFinite(x0 + x1 + y0 + y1)) {
    return { near: () => empty, columns: 0, rows: 0, entries: 0 };
  }
  const width = Math.max(x1 - x0, 1e-12);
  const height = Math.max(y1 - y0, 1e-12);
  // Each axis by itself: in linear units the two may differ by orders of magnitude.
  const bySegments = Math.ceil(Math.sqrt(segments));
  const side = (extent: number, span: number): number => {
    const mean = span / drawn;
    const byLength = mean > 0 ? (CELLS_PER_LINK * extent) / mean : MAX_SIDE;
    return Math.max(1, Math.min(MAX_SIDE, bySegments, Math.ceil(byLength)));
  };
  const columns = side(width, spanX);
  const rows = side(height, spanY);
  const cw = width / columns;
  const ch = height / rows;
  const col = (v: number): number => Math.min(columns - 1, Math.max(0, Math.floor((v - x0) / cw)));
  const row = (v: number): number => Math.min(rows - 1, Math.max(0, Math.floor((v - y0) / ch)));

  /**
   * Visit the cells of segment `i − 1 → i`: the cells of the boxes around short steps along it,
   * each step at most a cell long, so the cells visited are those the segment crosses and their
   * neighbours across a shared corner.
   */
  const walk = (i: number, visit: (cell: number) => void): void => {
    const ax = x[i - 1]!;
    const ay = y[i - 1]!;
    const bx = x[i]!;
    const by = y[i]!;
    if (ax !== ax || ay !== ay || bx !== bx || by !== by) return;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax) / cw, Math.abs(by - ay) / ch)));
    let px = ax;
    let py = ay;
    for (let s = 1; s <= steps; s++) {
      const qx = ax + ((bx - ax) * s) / steps;
      const qy = ay + ((by - ay) * s) / steps;
      const c0 = col(Math.min(px, qx));
      const c1 = col(Math.max(px, qx));
      const r0 = row(Math.min(py, qy));
      const r1 = row(Math.max(py, qy));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) visit(r * columns + c);
      px = qx;
      py = qy;
    }
  };

  // Two passes: count the entries of each cell, then fill them (a link once per cell).
  const cells = columns * rows;
  const start = new Uint32Array(cells + 1);
  const last = new Int32Array(cells).fill(-1);
  for (let k = 0; k < links; k++) {
    const count = (cell: number): void => {
      if (last[cell] === k) return;
      last[cell] = k;
      start[cell + 1] = start[cell + 1]! + 1;
    };
    for (let i = offsets[k]! + 1; i < offsets[k + 1]!; i++) walk(i, count);
  }
  for (let c = 0; c < cells; c++) start[c + 1] = start[c + 1]! + start[c]!;
  const entries = start[cells]!;
  const items = new Uint32Array(entries);
  const fill = Uint32Array.from(start.subarray(0, cells));
  last.fill(-1);
  for (let k = 0; k < links; k++) {
    const put = (cell: number): void => {
      if (last[cell] === k) return;
      last[cell] = k;
      items[fill[cell]!] = k;
      fill[cell] = fill[cell]! + 1;
    };
    for (let i = offsets[k]! + 1; i < offsets[k + 1]!; i++) walk(i, put);
  }

  const seen = new Uint32Array(links);
  let stamp = 0;
  let found = new Uint32Array(64);
  return {
    columns,
    rows,
    entries,
    near(qx, qy, rx, ry) {
      // Outside the grid by more than the reach: nothing.
      if (qx + rx < x0 || qx - rx > x1 || qy + ry < y0 || qy - ry > y1) return empty;
      const c0 = col(qx - rx);
      const c1 = col(qx + rx);
      const r0 = row(qy - ry);
      const r1 = row(qy + ry);
      if (++stamp === 0xffffffff) {
        seen.fill(0);
        stamp = 1;
      }
      let n = 0;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cell = r * columns + c;
          for (let e = start[cell]!; e < start[cell + 1]!; e++) {
            const k = items[e]!;
            if (seen[k] === stamp) continue;
            seen[k] = stamp;
            if (n === found.length) {
              const grown = new Uint32Array(found.length * 2);
              grown.set(found);
              found = grown;
            }
            found[n++] = k;
          }
        }
      }
      return found.subarray(0, n);
    },
  };
}
