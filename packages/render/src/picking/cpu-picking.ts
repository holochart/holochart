/**
 * CPU picking for 2D views (plan E2.13, ADR-010): one lazily built {@link PointIndex} per point
 * source, queried in the view's world space (CSS px, bottom-left origin; ADR-008).
 *
 * Indexes are built over each source's own coordinates (for markers: the RTC float32 positions
 * that are actually drawn) and rebuilt only when the source's `version` changes. Pan/zoom only
 * change the source → world transform, which is applied at query time: the pixel search box is
 * mapped back into source space, candidates come from the index, and exact pixel distances are
 * computed per candidate. That keeps distances isotropic in pixels even when the axes scale
 * differently, and makes zooming free.
 */
import { PointIndex } from './point-index.ts';
import type { PickMode, PickResult } from './types.ts';

/**
 * A 2D point set the CPU picker can index. Coordinates live in the source's own space and map to
 * the view's world space (2D: CSS px from the viewport rect's bottom-left) through
 * `world = v * scale + offset` per axis.
 */
export interface PointSource2D {
  /** Number of points. */
  readonly count: number;
  /** Bumped whenever positions or `count` change; the index rebuilds on the next query. */
  readonly version: number;
  /** Write source-space coordinates of points `[0, count)` into `xs`/`ys`; NaN for gaps. */
  readPositions(xs: Float64Array, ys: Float64Array): void;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** What {@link markerPointSource} needs from a `MarkerSet` (structural, to avoid a hard link). */
export interface MarkerPositionsLike {
  readonly count: number;
  readonly positionVersion: number;
  readonly positionArray: Float32Array | null;
  readonly worldScale: { readonly x: number; readonly y: number };
  readonly worldOffset: { readonly x: number; readonly y: number };
}

/** Whether `value` looks like a {@link PointSource2D}. */
export function isPointSource2D(value: unknown): value is PointSource2D {
  const v = value as Partial<PointSource2D> | null;
  return typeof v === 'object' && v !== null && typeof v.readPositions === 'function';
}

/** Whether `value` looks like a marker set with CPU-readable positions. */
export function isMarkerPositionsLike(value: unknown): value is MarkerPositionsLike {
  const v = value as Partial<MarkerPositionsLike> | null;
  return typeof v === 'object' && v !== null && 'positionArray' in v && 'positionVersion' in v;
}

/** Values beyond this are the `HIDDEN_POSITION` gap sentinel (see `precision.ts`). */
const HIDDEN_LIMIT = 1e37;

/**
 * Adapt a `MarkerSet` as a 2D point source. It indexes the RTC positions exactly as drawn (so
 * `patch()` streaming is covered) and follows `setTransform` live through the world scale/offset.
 */
export function markerPointSource(markers: MarkerPositionsLike): PointSource2D {
  return {
    get count() {
      return markers.count;
    },
    get version() {
      return markers.positionVersion;
    },
    readPositions(xs, ys) {
      const a = markers.positionArray;
      const n = markers.count;
      for (let i = 0; i < n; i++) {
        const x = a ? a[i * 3]! : NaN;
        const y = a ? a[i * 3 + 1]! : NaN;
        const hidden = !(Math.abs(x) < HIDDEN_LIMIT && Math.abs(y) < HIDDEN_LIMIT);
        xs[i] = hidden ? NaN : x;
        ys[i] = hidden ? NaN : y;
      }
    },
    get scaleX() {
      return markers.worldScale.x;
    },
    get scaleY() {
      return markers.worldScale.y;
    },
    get offsetX() {
      return markers.worldOffset.x;
    },
    get offsetY() {
      return markers.worldOffset.y;
    },
  };
}

/** A point source over plain arrays, with a settable transform. */
export interface ArrayPointSource extends PointSource2D {
  /** Swap arrays (optional) and mark positions changed. */
  invalidate(x?: ArrayLike<number>, y?: ArrayLike<number>): void;
  setTransform(t: { scaleX: number; scaleY: number; offsetX: number; offsetY: number }): void;
}

/** Create a {@link PointSource2D} over `x`/`y` arrays (identity transform by default). */
export function arrayPointSource(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  transform: { scaleX: number; scaleY: number; offsetX: number; offsetY: number } = {
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
  },
): ArrayPointSource {
  let xs = x;
  let ys = y;
  let version = 0;
  const t = { ...transform };
  return {
    get count() {
      return Math.min(xs.length, ys.length);
    },
    get version() {
      return version;
    },
    readPositions(outX, outY) {
      const n = Math.min(xs.length, ys.length);
      for (let i = 0; i < n; i++) {
        outX[i] = xs[i]!;
        outY[i] = ys[i]!;
      }
    },
    get scaleX() {
      return t.scaleX;
    },
    get scaleY() {
      return t.scaleY;
    },
    get offsetX() {
      return t.offsetX;
    },
    get offsetY() {
      return t.offsetY;
    },
    invalidate(nx, ny) {
      if (nx) xs = nx;
      if (ny) ys = ny;
      version++;
    },
    setTransform(next) {
      t.scaleX = next.scaleX;
      t.scaleY = next.scaleY;
      t.offsetX = next.offsetX;
      t.offsetY = next.offsetY;
    },
  };
}

interface SourceEntry {
  readonly id: number;
  readonly source: PointSource2D;
  traceIndex: number;
  version: number;
  count: number;
  xs: Float64Array;
  ys: Float64Array;
  index: PointIndex | null;
}

/** Source-space interval `[lo, hi]` for the world interval `[w - r, w + r]`, or null if empty. */
function sourceInterval(
  w: number,
  r: number,
  scale: number,
  offset: number,
  out: [number, number],
): [number, number] | null {
  if (!Number.isFinite(r)) {
    out[0] = -Infinity;
    out[1] = Infinity;
    return out;
  }
  if (scale === 0 || !Number.isFinite(scale)) {
    // Degenerate axis: every point sits at `offset`.
    if (Math.abs(offset - w) > r) return null;
    out[0] = -Infinity;
    out[1] = Infinity;
    return out;
  }
  const a = (w - r - offset) / scale;
  const b = (w + r - offset) / scale;
  out[0] = Math.min(a, b);
  out[1] = Math.max(a, b);
  return out;
}

/**
 * CPU picker for one 2D view: registered point sources, each with a lazily (re)built index.
 * Coordinates are the view's world space (2D: CSS px, bottom-left origin).
 */
export class PointPicker2D {
  readonly #entries = new Map<number, SourceEntry>();
  readonly #bySource = new Map<PointSource2D, SourceEntry>();
  readonly #ix: [number, number] = [0, 0];
  readonly #iy: [number, number] = [0, 0];
  #nextId = 1;

  /** Number of registered sources. */
  get size(): number {
    return this.#entries.size;
  }

  has(source: PointSource2D): boolean {
    return this.#bySource.has(source);
  }

  /** Register a source (again: updates its trace index) and return its id. */
  add(source: PointSource2D, traceIndex = 0): number {
    const existing = this.#bySource.get(source);
    if (existing) {
      existing.traceIndex = traceIndex;
      return existing.id;
    }
    const entry: SourceEntry = {
      id: this.#nextId++,
      source,
      traceIndex,
      version: NaN,
      count: 0,
      xs: new Float64Array(0),
      ys: new Float64Array(0),
      index: null,
    };
    this.#entries.set(entry.id, entry);
    this.#bySource.set(source, entry);
    return entry.id;
  }

  /** Unregister by id or source. Returns whether it was registered. */
  remove(target: number | PointSource2D): boolean {
    const entry =
      typeof target === 'number' ? this.#entries.get(target) : this.#bySource.get(target);
    if (!entry) return false;
    this.#entries.delete(entry.id);
    this.#bySource.delete(entry.source);
    return true;
  }

  clear(): void {
    this.#entries.clear();
    this.#bySource.clear();
  }

  /**
   * Hits around world position `(wx, wy)` within `radius` (CSS px), per `mode` (see
   * {@link PickMode}), sorted by distance, then trace, then point index.
   */
  pick(wx: number, wy: number, radius: number, mode: PickMode = 'closest'): PickResult[] {
    const results: PickResult[] = [];
    if (!Number.isFinite(wx) || !Number.isFinite(wy) || !(radius >= 0)) return results;
    for (const entry of this.#entries.values()) {
      this.#query(entry, wx, wy, radius, mode, results);
    }
    results.sort(
      (a, b) =>
        a.distance - b.distance || a.traceIndex - b.traceIndex || a.pointIndex - b.pointIndex,
    );
    if (mode === 'closest' && results.length > 1) results.length = 1;
    return results;
  }

  #ensure(entry: SourceEntry): PointIndex | null {
    const source = entry.source;
    if (entry.version === source.version && entry.index) return entry.index;
    const n = Math.max(0, source.count);
    if (entry.xs.length < n) {
      entry.xs = new Float64Array(n);
      entry.ys = new Float64Array(n);
    }
    const xs = entry.xs.subarray(0, n);
    const ys = entry.ys.subarray(0, n);
    source.readPositions(xs, ys);
    entry.count = n;
    entry.version = source.version;
    if (entry.index) entry.index.invalidate(xs, ys);
    else entry.index = new PointIndex(xs, ys);
    return entry.index;
  }

  #query(
    entry: SourceEntry,
    wx: number,
    wy: number,
    r: number,
    mode: PickMode,
    out: PickResult[],
  ): void {
    const index = this.#ensure(entry);
    if (!index || entry.count === 0) return;
    const s = entry.source;
    const sx = s.scaleX;
    const sy = s.scaleY;
    const ox = s.offsetX;
    const oy = s.offsetY;
    const ix = sourceInterval(wx, mode === 'y' ? Infinity : r, sx, ox, this.#ix);
    const iy = sourceInterval(wy, mode === 'x' ? Infinity : r, sy, oy, this.#iy);
    if (!ix || !iy) return;
    const candidates = index.withinRect(ix[0], iy[0], ix[1], iy[1]);
    const xs = entry.xs;
    const ys = entry.ys;
    let best = -1;
    let bestD = Infinity;
    let bestTie = Infinity;
    for (const i of candidates) {
      const dx = xs[i]! * sx + ox - wx;
      const dy = ys[i]! * sy + oy - wy;
      let d: number;
      let tie = 0;
      if (mode === 'x') {
        d = Math.abs(dx);
        tie = Math.abs(dy);
      } else if (mode === 'y') {
        d = Math.abs(dy);
        tie = Math.abs(dx);
      } else {
        d = Math.hypot(dx, dy);
      }
      if (!(d <= r)) continue;
      if (mode === 'all') {
        out.push({ traceIndex: entry.traceIndex, pointIndex: i, distance: d, kind: 'point' });
      } else if (d < bestD || (d === bestD && tie < bestTie)) {
        best = i;
        bestD = d;
        bestTie = tie;
      }
    }
    if (best >= 0) {
      out.push({ traceIndex: entry.traceIndex, pointIndex: best, distance: bestD, kind: 'point' });
    }
  }
}
