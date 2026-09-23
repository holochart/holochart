import Flatbush from 'flatbush';

/** Options for {@link PointIndex}. */
export interface PointIndexOptions {
  /** Flatbush node size (fan-out). Default 16; larger builds faster, smaller queries faster. */
  nodeSize?: number;
}

const EMPTY: readonly number[] = Object.freeze([]);

/**
 * Even-odd (crossing number) point-in-polygon test.
 *
 * `polygon` is a flat `[x0, y0, x1, y1, ...]` ring; the closing edge is implicit. Even-odd is used
 * (rather than non-zero winding) so self-intersecting lasso strokes behave predictably: regions
 * wound an even number of times, e.g. the centre of a pentagram, are outside.
 * Fewer than 3 vertices always returns `false`.
 */
export function pointInPolygon(px: number, py: number, polygon: ArrayLike<number>): boolean {
  const n = polygon.length >> 1;
  if (n < 3) return false;
  let inside = false;
  let jx = polygon[(n - 1) * 2] as number;
  let jy = polygon[(n - 1) * 2 + 1] as number;
  for (let i = 0; i < n; i++) {
    const ix = polygon[i * 2] as number;
    const iy = polygon[i * 2 + 1] as number;
    // Half-open rule on y (> vs <=) so a vertex exactly at py is counted once, not twice.
    if (iy > py !== jy > py && px < ((jx - ix) * (py - iy)) / (jy - iy) + ix) {
      inside = !inside;
    }
    jx = ix;
    jy = iy;
  }
  return inside;
}

/**
 * Static 2D spatial index over a point cloud, backed by a packed Hilbert R-tree (flatbush).
 * Used for CPU picking of 2D traces (ADR-010): hover (`nearest`), box select (`withinRect`),
 * lasso (`withinPolygon`) and brush-radius queries.
 *
 * The index is unit-agnostic: all distances are Euclidean in the units of the input arrays. For
 * hover hit-testing pass pixel-space coordinates (or data pre-scaled so both axes share a unit),
 * otherwise anisotropic axes make "nearest" meaningless.
 *
 * Non-finite points (NaN gaps, ±Infinity) are skipped and never returned; every returned index
 * refers to the ORIGINAL position in the `x`/`y` arrays. If the arrays differ in length, the
 * shorter length is used.
 *
 * Construction is O(1): the tree is built lazily on the first query, and {@link invalidate}
 * simply marks it dirty, so frequently-updated data only pays for a rebuild when actually queried.
 */
export class PointIndex {
  private x: ArrayLike<number>;
  private y: ArrayLike<number>;
  private readonly nodeSize: number;
  private tree: Flatbush | null = null;
  /** Maps flatbush item id -> original index. Monotonically increasing by construction. */
  private ids: Uint32Array = new Uint32Array(0);
  private dirty = true;
  private count = 0;

  // Query scratch state read by the preallocated filter closures below, so queries don't
  // allocate a fresh closure each call.
  private qx = 0;
  private qy = 0;
  private qr2 = 0;
  private qPoly: ArrayLike<number> = EMPTY;
  private readonly radiusFilter = (_i: number, px: number, py: number): boolean => {
    const dx = px - this.qx;
    const dy = py - this.qy;
    return dx * dx + dy * dy <= this.qr2;
  };
  private readonly polygonFilter = (_i: number, px: number, py: number): boolean =>
    pointInPolygon(px, py, this.qPoly);

  constructor(x: ArrayLike<number>, y: ArrayLike<number>, options: PointIndexOptions = {}) {
    this.x = x;
    this.y = y;
    this.nodeSize = options.nodeSize ?? 16;
  }

  /** Whether the tree is currently built (false until the first query, and after `invalidate`). */
  get built(): boolean {
    return !this.dirty;
  }

  /** Number of valid (finite) points indexed. Triggers a build if needed. */
  get size(): number {
    this.ensure();
    return this.count;
  }

  /**
   * Mark the index stale, optionally swapping in new coordinate arrays. The rebuild happens
   * lazily on the next query. Call this after mutating the arrays in place, too.
   */
  invalidate(x?: ArrayLike<number>, y?: ArrayLike<number>): void {
    if (x) this.x = x;
    if (y) this.y = y;
    this.dirty = true;
    this.tree = null;
  }

  /** Original index of the point closest to `(x, y)` within `maxDistance`, or -1 if none. */
  nearest(x: number, y: number, maxDistance = Infinity): number {
    const tree = this.ensure();
    if (!tree || Number.isNaN(x) || Number.isNaN(y)) return -1;
    const hit = tree.neighbors(x, y, 1, maxDistance)[0];
    return hit === undefined ? -1 : (this.ids[hit] as number);
  }

  /** Original indices of up to `k` points closest to `(x, y)`, sorted by increasing distance. */
  nearestK(x: number, y: number, k: number, maxDistance = Infinity): number[] {
    const tree = this.ensure();
    if (!tree || !(k >= 1) || Number.isNaN(x) || Number.isNaN(y)) return [];
    return this.mapIds(tree.neighbors(x, y, Math.floor(k), maxDistance));
  }

  /**
   * Original indices of points inside the rectangle, ascending. Corners may be given in any
   * order; edges are inclusive.
   */
  withinRect(x0: number, y0: number, x1: number, y1: number): number[] {
    const tree = this.ensure();
    if (!tree) return [];
    const hits = tree.search(
      Math.min(x0, x1),
      Math.min(y0, y1),
      Math.max(x0, x1),
      Math.max(y0, y1),
    );
    return this.mapSorted(hits);
  }

  /** Original indices of points within distance `r` (inclusive) of `(x, y)`, ascending. */
  withinRadius(x: number, y: number, r: number): number[] {
    const tree = this.ensure();
    if (!tree || !(r >= 0) || Number.isNaN(x) || Number.isNaN(y)) return [];
    this.qx = x;
    this.qy = y;
    this.qr2 = r * r;
    return this.mapSorted(tree.search(x - r, y - r, x + r, y + r, this.radiusFilter));
  }

  /**
   * Original indices of points inside a flat `[x0, y0, x1, y1, ...]` polygon (even-odd rule),
   * ascending. The polygon's bounding box prefilters candidates through the tree; only those get
   * the exact point-in-polygon test. Fewer than 3 vertices returns `[]`.
   */
  withinPolygon(polygon: ArrayLike<number>): number[] {
    const n = polygon.length >> 1;
    if (n < 3) return [];
    const tree = this.ensure();
    if (!tree) return [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const px = polygon[i * 2] as number;
      const py = polygon[i * 2 + 1] as number;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    if (!(minX <= maxX && minY <= maxY)) return []; // NaN vertices
    this.qPoly = polygon;
    try {
      return this.mapSorted(tree.search(minX, minY, maxX, maxY, this.polygonFilter));
    } finally {
      // Don't retain the caller's polygon between queries.
      this.qPoly = EMPTY;
    }
  }

  /** Build the tree if dirty. Returns null when there are no valid points (flatbush rejects 0). */
  private ensure(): Flatbush | null {
    if (!this.dirty) return this.tree;
    const { x, y } = this;
    const n = Math.min(x.length, y.length);
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(x[i]) && Number.isFinite(y[i])) count++;
    }
    this.count = count;
    this.dirty = false;
    if (count === 0) {
      this.tree = null;
      this.ids = new Uint32Array(0);
      return null;
    }
    const tree = new Flatbush(count, this.nodeSize);
    const ids = count === n && this.ids.length === n ? this.ids : new Uint32Array(count);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const px = x[i] as number;
      const py = y[i] as number;
      if (Number.isFinite(px) && Number.isFinite(py)) {
        tree.add(px, py, px, py);
        ids[k++] = i;
      }
    }
    tree.finish();
    this.tree = tree;
    this.ids = ids;
    return tree;
  }

  private mapIds(hits: number[]): number[] {
    const ids = this.ids;
    for (let i = 0; i < hits.length; i++) hits[i] = ids[hits[i] as number] as number;
    return hits;
  }

  /** Map to original indices in ascending order. `ids` is monotonic, so sorting item ids suffices. */
  private mapSorted(hits: number[]): number[] {
    hits.sort((a, b) => a - b);
    return this.mapIds(hits);
  }
}
