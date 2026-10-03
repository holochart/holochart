/**
 * Treemap tilings (plan E13.3), ported from d3-hierarchy's `treemap` (padding) and its tile methods
 * `treemapSquarify` (with a ratio), `treemapBinary`, `treemapDice`, `treemapSlice` and
 * `treemapSliceDice`, arranged as plotly.js' `traces/treemap/partition.js` and `flip_tree.js` do:
 *
 * - `packing: 'dice-slice'` is `slice-dice` on the transposed area (Plotly's `swapXY`), transposed
 *   back.
 * - `flip` mirrors every tile along x and / or y; the outer paddings are swapped first, so the
 *   header padding (`marker.pad.t`) stays on top.
 * - Plotly's squarify is d3's plain `treemapSquarify` (not `treemapResquarify`): drilling lays the
 *   entry's subtree out afresh, so tiles keep their order but not their rows across levels.
 *
 * Tiles are placed breadth first over `[0, width] × [0, height]` (y down, as SVG): the entry fills
 * the area, and each branch's children share its area inside `pad.{top, left, right, bottom}`,
 * `pad.inner` apart. Areas are proportional to values; a `remainder` or `total` above the children's
 * sum leaves the rest of the branch empty (d3 scales children by the branch's value).
 */
import type { HierNode } from '../hierarchy/build.ts';
import type { PartitionCell } from '../hierarchy/levels.ts';

/** `tiling.packing` of treemaps. @internal */
export type TreemapPacking = 'squarify' | 'binary' | 'dice' | 'slice' | 'slice-dice' | 'dice-slice';

/** Paddings of a treemap layout, px. */
export interface TreemapPadding {
  /** Between siblings (`tiling.pad`). */
  readonly inner: number;
  /** Inside branches, around their children (`marker.pad`). */
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

/** Options of {@link treemapPartition}. */
export interface TreemapTiling {
  readonly packing: TreemapPacking;
  /** Target aspect ratio of squarified tiles (≥ 1; Plotly's default is 1, d3's the golden ratio). */
  readonly squarifyratio?: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly pad: TreemapPadding;
}

/** A tile method: lays `cells` (siblings) out in `[x0, x1] × [y0, y1]` by their nodes' values. */
type Tile = (
  value: number,
  cells: readonly PartitionCell[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  depth: number,
) => void;

/** d3's `treemapDice`: side by side along x. */
export function dice(
  value: number,
  cells: readonly PartitionCell[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const k = value ? (x1 - x0) / value : 0;
  for (const c of cells) {
    c.y0 = y0;
    c.y1 = y1;
    c.x0 = x0;
    c.x1 = x0 += c.node.value * k;
  }
}

/** d3's `treemapSlice`: stacked along y. */
export function slice(
  value: number,
  cells: readonly PartitionCell[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const k = value ? (y1 - y0) / value : 0;
  for (const c of cells) {
    c.x0 = x0;
    c.x1 = x1;
    c.y0 = y0;
    c.y1 = y0 += c.node.value * k;
  }
}

/** d3's `treemapSliceDice`: `slice` at odd depths, `dice` at even ones. */
const sliceDice: Tile = (value, cells, x0, y0, x1, y1, depth) =>
  (depth & 1 ? slice : dice)(value, cells, x0, y0, x1, y1);

/**
 * d3's `treemapBinary`: a balanced binary split by value, cut across the longer side of each
 * part.
 */
export function binary(
  value: number,
  cells: readonly PartitionCell[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const n = cells.length;
  const sums = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sums[i + 1] = sums[i]! + cells[i]!.node.value;
  const split = (
    i: number,
    j: number,
    v: number,
    a0: number,
    b0: number,
    a1: number,
    b1: number,
  ) => {
    if (i >= j - 1) {
      const c = cells[i];
      if (c) [c.x0, c.y0, c.x1, c.y1] = [a0, b0, a1, b1];
      return;
    }
    const offset = sums[i]!;
    const target = v / 2 + offset;
    let k = i + 1;
    let hi = j - 1;
    while (k < hi) {
      const mid = (k + hi) >>> 1;
      if (sums[mid]! < target) k = mid + 1;
      else hi = mid;
    }
    if (target - sums[k - 1]! < sums[k]! - target && i + 1 < k) --k;
    const left = sums[k]! - offset;
    const right = v - left;
    if (a1 - a0 > b1 - b0) {
      const ak = v ? (a0 * right + a1 * left) / v : a1;
      split(i, k, left, a0, b0, ak, b1);
      split(k, j, right, ak, b0, a1, b1);
    } else {
      const bk = v ? (b0 * right + b1 * left) / v : b1;
      split(i, k, left, a0, b0, a1, bk);
      split(k, j, right, a0, bk, a1, b1);
    }
  };
  split(0, n, value, x0, y0, x1, y1);
}

/**
 * d3's `treemapSquarify` with a target `ratio` (Bruls et al.): rows of siblings, each row filled
 * while its worst aspect ratio improves, laid across the shorter side of what is left.
 */
export function squarify(
  ratio: number,
  value: number,
  cells: readonly PartitionCell[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const n = cells.length;
  let i0 = 0;
  let i1 = 0;
  while (i0 < n) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    // The next non-empty node.
    let sum: number;
    do sum = cells[i1++]!.node.value;
    while (!sum && i1 < n);
    let min = sum;
    let max = sum;
    const alpha = Math.max(dy / dx, dx / dy) / (value * ratio);
    let beta = sum * sum * alpha;
    let minRatio = Math.max(max / beta, beta / min);
    // Keep adding nodes while the aspect ratio maintains or improves.
    for (; i1 < n; ++i1) {
      const v = cells[i1]!.node.value;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
      beta = sum * sum * alpha;
      const newRatio = Math.max(max / beta, beta / min);
      if (newRatio > minRatio) {
        sum -= v;
        break;
      }
      minRatio = newRatio;
    }
    const row = cells.slice(i0, i1);
    if (dx < dy) dice(sum, row, x0, y0, x1, value ? (y0 += (dy * sum) / value) : y1);
    else slice(sum, row, x0, y0, value ? (x0 += (dx * sum) / value) : x1, y1);
    value -= sum;
    i0 = i1;
  }
}

function tileOf(packing: TreemapPacking, ratio: number): Tile {
  switch (packing) {
    case 'squarify': {
      const r = ratio > 1 ? ratio : 1;
      return (value, cells, x0, y0, x1, y1) => squarify(r, value, cells, x0, y0, x1, y1);
    }
    case 'binary':
      return binary;
    case 'dice':
      return dice;
    case 'slice':
      return slice;
    default:
      return sliceDice;
  }
}

/**
 * Transpose (`swap`) and mirror cells in place (Plotly's `flipTree`); `width` × `height` is the
 * laid-out area after transposing.
 */
export function flipCells(
  cells: readonly PartitionCell[],
  width: number,
  height: number,
  opts: { readonly swap?: boolean; readonly flipX?: boolean; readonly flipY?: boolean },
): void {
  for (const c of cells) {
    if (opts.swap) [c.x0, c.y0, c.x1, c.y1] = [c.y0, c.x0, c.y1, c.x1];
    if (opts.flipX) [c.x0, c.x1] = [width - c.x1, width - c.x0];
    if (opts.flipY) [c.y0, c.y1] = [height - c.y1, height - c.y0];
  }
}

/**
 * The treemap layout of the subtree at `entry` over `[0, width] × [0, height]` (y down): d3's
 * `treemap()` with Plotly's tiling options (see the module comment). Cells come breadth first, so
 * parents precede their children; `depth` counts levels below the entry. A cell too small for its
 * paddings collapses to its center line, as in d3.
 */
export function treemapPartition(
  entry: HierNode,
  width: number,
  height: number,
  opts: TreemapTiling,
): PartitionCell[] {
  const { flipX = false, flipY = false, pad } = opts;
  const swap = opts.packing === 'dice-slice';
  let top = flipY ? pad.bottom : pad.top;
  let left = flipX ? pad.right : pad.left;
  let right = flipX ? pad.left : pad.right;
  let bottom = flipY ? pad.top : pad.bottom;
  if (swap) [left, top, right, bottom] = [top, left, bottom, right];
  const [dx, dy] = swap ? [height, width] : [width, height];
  const tile = tileOf(opts.packing, opts.squarifyratio ?? 1);
  const p = pad.inner / 2;

  const cells: PartitionCell[] = [{ node: entry, depth: 0, x0: 0, y0: 0, x1: dx, y1: dy }];
  for (let k = 0; k < cells.length; k++) {
    const cell = cells[k]!;
    // d3's `positionNode`: inside the half inner padding its parent left around it.
    const q = k === 0 ? 0 : p;
    let x0 = cell.x0 + q;
    let y0 = cell.y0 + q;
    let x1 = cell.x1 - q;
    let y1 = cell.y1 - q;
    if (x1 < x0) x0 = x1 = (x0 + x1) / 2;
    if (y1 < y0) y0 = y1 = (y0 + y1) / 2;
    cell.x0 = x0;
    cell.y0 = y0;
    cell.x1 = x1;
    cell.y1 = y1;
    const { node } = cell;
    if (node.children.length === 0) continue;
    x0 += left - p;
    y0 += top - p;
    x1 -= right - p;
    y1 -= bottom - p;
    if (x1 < x0) x0 = x1 = (x0 + x1) / 2;
    if (y1 < y0) y0 = y1 = (y0 + y1) / 2;
    const children = node.children.map((child): PartitionCell => ({
      node: child,
      depth: cell.depth + 1,
      x0: 0,
      y0: 0,
      x1: 0,
      y1: 0,
    }));
    tile(node.value, children, x0, y0, x1, y1, cell.depth);
    for (const c of children) cells.push(c);
  }
  if (swap || flipX || flipY) flipCells(cells, width, height, { swap, flipX, flipY });
  return cells;
}
