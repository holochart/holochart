/**
 * Level of detail for big scatter lines (plan E16.2), loaded with a dynamic `import()` the first
 * time a line has enough points to use it (see `plot.ts`).
 *
 * {@link LineLod} keeps a min/max ("M4") pyramid of a line with monotonic x: level 0 holds every
 * finite point, level `j` the first, lowest, highest and last point (in index order) of each
 * x bucket `2^(p + j − 1)` linear units wide, built from level `j − 1` (buckets nest because their
 * widths are powers of two, so min/max of min/max is exact). {@link LineLod.path} reads the x
 * window around the view from the coarsest level whose buckets are at most {@link BUCKET_PX} px
 * wide, and decimates those entries once more into whole px columns (as `buildLinePath` does;
 * the few buckets that straddle a column edge are read point by point), so a zoom or pan re-reads
 * only the entries in view, never the whole trace. The result is exactly the per-column min/max
 * decimation of the points in the window: visually lossless, since every column keeps its vertical
 * extent and the points where the line enters and leaves it. Columns must be whole pixels: the
 * line shader's join partition leaves holes where zigzags of several columns share a pixel.
 *
 * The pyramid is cut into chunks of {@link CHUNK} consecutive points, numbered from a stream
 * position that streaming (E7.2) keeps stable, so `extendTraces` / `prependTraces` rebuild only
 * the chunks at the edited ends. Gaps (non-finite points, unless `connectgaps`) never share a
 * bucket; the line breaks there exactly as without decimation.
 */
import type { WindowChange } from './line-stream.ts';

/** Points per chunk: a power of two, so offsets (and the gap flag) fit a Uint16. */
const CHUNK = 1 << 14;
/** Entry flag: a gap precedes this point (the line breaks before it). */
const GAP = 0x8000;
const OFFSET = 0x7fff;
/**
 * Widest pyramid bucket a path reads, in px. Buckets are then decimated into whole px columns; the
 * few that straddle a column edge are read point by point, so smaller buckets mean fewer points
 * read there but more entries elsewhere (1/8 px balances the two).
 */
const BUCKET_PX = 0.125;
/** The window around the view that a path covers, in view widths on each side. */
const MARGIN = 1;

interface Chunk {
  /** Stream positions `[id·CHUNK, (id + 1)·CHUNK)`. */
  readonly id: number;
  /** x of the first and last finite point. */
  readonly x0: number;
  readonly x1: number;
  /** log2 of the bucket width of level 1. */
  readonly p: number;
  /** Entries per level: `offset | GAP`, offsets from the chunk's first stream position. */
  readonly levels: readonly Uint16Array[];
}

/** The view a path is built for: the visible linear x range and |px per linear x unit|. */
export interface LodView {
  readonly lo: number;
  readonly hi: number;
  readonly scaleX: number;
}

/** What a path covers: its x scale and x window (`all`: every point of the line). */
export interface LodWindow {
  readonly scaleX: number;
  readonly lo: number;
  readonly hi: number;
  readonly all: boolean;
}

/** A path of {@link LineLod.path}. */
export interface LodPath {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly window: LodWindow;
}

/** Whether a path covering `window` is still right for `view`: same resolution, inside it. */
export function covers(window: LodWindow, view: LodView): boolean {
  return (
    Math.abs(Math.abs(view.scaleX) / window.scaleX - 1) < 1e-6 &&
    (window.all || (view.lo >= window.lo && view.hi <= window.hi))
  );
}

function finite(x: ArrayLike<number>, y: ArrayLike<number>, i: number): boolean {
  return Number.isFinite(x[i]) && Number.isFinite(y[i]);
}

/** Bucket exponent of a view: buckets `2^q` linear units wide are ≤ {@link BUCKET_PX} px. */
function exponent(scaleX: number): number {
  const s = Math.abs(scaleX);
  return s > 0 && Number.isFinite(s) ? Math.floor(Math.log2(BUCKET_PX / s)) : Infinity;
}

/**
 * Min/max decimation of `prev` into buckets `w` wide: per bucket (never across a gap) the first,
 * lowest, highest and last entry, in index order and without duplicates.
 */
function reduce(
  prev: Uint16Array,
  w: number,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  base: number,
): Uint16Array {
  const out = new Uint16Array(prev.length);
  let n = 0;
  let k = 0;
  while (k < prev.length) {
    const bucket = Math.floor((x[base + (prev[k]! & OFFSET)] as number) / w);
    let lo = k;
    let hi = k;
    let loY = y[base + (prev[k]! & OFFSET)] as number;
    let hiY = loY;
    let j = k + 1;
    for (; j < prev.length; j++) {
      const e = prev[j]!;
      const i = base + (e & OFFSET);
      if (e & GAP || Math.floor((x[i] as number) / w) !== bucket) break;
      const yi = y[i] as number;
      if (yi < loY) {
        lo = j;
        loY = yi;
      }
      if (yi > hiY) {
        hi = j;
        hiY = yi;
      }
    }
    const last = j - 1;
    const p = Math.min(lo, hi);
    const q = Math.max(lo, hi);
    out[n++] = prev[k]!;
    if (p !== k) out[n++] = prev[p]!;
    if (q !== p) out[n++] = prev[q]!;
    if (last !== q) out[n++] = prev[last]!;
    k = j;
  }
  return out.slice(0, n);
}

/**
 * The pyramid of chunk `id` from the points of the window `x` / `y` whose index 0 is stream
 * position `start`; `undefined` when it has no finite point, `null` when x decreases.
 */
function buildChunk(
  id: number,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  n: number,
  start: number,
  connectgaps: boolean,
): Chunk | null | undefined {
  const base = id * CHUNK - start; // window index of offset 0
  const from = Math.max(0, base);
  const to = Math.min(n, base + CHUNK);
  const level0 = new Uint16Array(Math.max(0, to - from));
  let m = 0;
  let prevX = -Infinity;
  for (let i = from; i < to; i++) {
    if (!finite(x, y, i)) continue;
    const xi = x[i] as number;
    if (xi < prevX) return null;
    prevX = xi;
    const gap = !connectgaps && i > 0 && !finite(x, y, i - 1);
    level0[m++] = (i - base) | (gap ? GAP : 0);
  }
  if (m === 0) return undefined;
  const levels: Uint16Array[] = [level0.slice(0, m)];
  const x0 = x[base + (levels[0]![0]! & OFFSET)] as number;
  const x1 = prevX;
  const span = x1 - x0;
  // Level 1 buckets hold ~8 points on average, so every level at least halves (M4 keeps ≤ 4).
  const p = Math.ceil(Math.log2(Math.max((8 * span) / m, Math.abs(x0) * 2 ** -40, 2 ** -1000)));
  let last: Uint16Array = levels[0]!;
  for (let j = 1; last.length > 4 && j < 64; j++) {
    const w = 2 ** (p + j - 1);
    last = reduce(last, w, x, y, base);
    levels.push(last);
    if (w > span) break;
  }
  return { id, x0, x1, p, levels };
}

/** The min/max pyramid of a line (see the module comment). */
export class LineLod {
  /** The arrays it was built from (a new calc builds a new pyramid). */
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  readonly connectgaps: boolean;
  /** False when x decreases somewhere: the caller then draws the line without the pyramid. */
  valid = true;
  #n = 0;
  /** Stream position of window index 0 (see {@link edit}). */
  #start = 0;
  /** Chunks with finite points, in order. */
  #chunks: Chunk[] = [];

  /** `start`: the stream position of point 0 (where chunks are cut, see {@link edit}). */
  constructor(x: ArrayLike<number>, y: ArrayLike<number>, connectgaps: boolean, start = 0) {
    this.x = x;
    this.y = y;
    this.connectgaps = connectgaps;
    this.#start = start;
    this.#rebuild(() => undefined);
  }

  /** The stream position of point 0 (it moves with streaming edits). */
  get start(): number {
    return this.#start;
  }

  /**
   * Streaming edit (E7.2): the window is now `x` / `y` (`change` from the previous one). Only the
   * chunks with added or removed points are rebuilt. Returns {@link valid}.
   */
  edit(x: ArrayLike<number>, y: ArrayLike<number>, change: WindowChange): boolean {
    const n = Math.min(x.length, y.length);
    // Stream positions of the retained points: [r0, r1).
    const r0 = this.#start + change.frontRemoved;
    const r1 = this.#start + this.#n - change.endRemoved;
    const start = r0 - change.frontAdded;
    this.x = x;
    this.y = y;
    if (r1 <= r0 || start + n !== r1 + change.endAdded) {
      this.#start = 0;
      this.#rebuild(() => undefined);
      return this.valid;
    }
    // Chunks with edited points; with a new front also r0's (its gap flag reads the point before).
    const front = change.frontRemoved > 0 || change.frontAdded > 0;
    const end = change.endRemoved > 0 || change.endAdded > 0;
    const low = front ? Math.floor(r0 / CHUNK) : -Infinity;
    const high = end ? Math.floor(r1 / CHUNK) : Infinity;
    const old = new Map(this.#chunks.map((c) => [c.id, c]));
    this.#start = start;
    this.#rebuild((id) => (id > low && id < high ? old.get(id) : undefined));
    return this.valid;
  }

  /**
   * The line's vertices (linear; the caller applies step shapes) over the view and
   * {@link MARGIN} view widths on each side, at the view's resolution, and what it covers (see
   * {@link covers}).
   */
  path(view: LodView): LodPath {
    const q = exponent(view.scaleX);
    const sx =
      Math.abs(view.scaleX) > 0 && Number.isFinite(view.scaleX) ? Math.abs(view.scaleX) : 1;
    const width = view.hi - view.lo;
    const lo = view.lo - MARGIN * width;
    const hi = view.hi + MARGIN * width;
    const chunks = this.#chunks;
    const all = chunks.length === 0 || (lo <= chunks[0]!.x0 && hi >= chunks[chunks.length - 1]!.x1);
    const window: LodWindow = { scaleX: sx, lo, hi, all };
    const out: number[] = [];
    const { x, y } = this;
    const start = this.#start;
    const levelIndex = (c: Chunk): number =>
      Math.max(0, Math.min(c.levels.length - 1, q - c.p + 1));
    const levelOf = (c: Chunk): Uint16Array => c.levels[levelIndex(c)]!;
    const xAt = (c: Chunk, entry: number): number =>
      x[c.id * CHUNK - start + (entry & OFFSET)] as number;
    // The first chunk ending at or after `lo`, and its first entry at or after `lo`.
    let c = 0;
    for (let top = chunks.length; c < top;) {
      const mid = (c + top) >> 1;
      if (chunks[mid]!.x1 < lo) c = mid + 1;
      else top = mid;
    }
    let e = 0;
    if (c < chunks.length) {
      const level = levelOf(chunks[c]!);
      for (let top = level.length; e < top;) {
        const mid = (e + top) >> 1;
        if (xAt(chunks[c]!, level[mid]!) < lo) e = mid + 1;
        else top = mid;
      }
    }
    // Start one entry earlier, so that the segment entering the window is drawn.
    if (e > 0) e--;
    else if (c > 0) e = levelOf(chunks[--c]!).length - 1;
    const columns = new ColumnDecimator(sx, out);
    const col = (v: number): number => Math.floor(v * sx);
    for (; c < chunks.length; c++, e = 0) {
      const chunk = chunks[c]!;
      const j = levelIndex(chunk);
      const level = chunk.levels[j]!;
      const w = j > 0 ? 2 ** (chunk.p + j - 1) : 0;
      const base = chunk.id * CHUNK - start;
      while (e < level.length) {
        // The entries of one bucket: [e, g).
        const first = level[e]!;
        const i0 = base + (first & OFFSET);
        let g = e + 1;
        if (w > 0) {
          const bucket = Math.floor((x[i0] as number) / w);
          while (g < level.length) {
            const next = level[g]!;
            if (next & GAP || Math.floor((x[base + (next & OFFSET)] as number) / w) !== bucket)
              break;
            g++;
          }
        }
        const gap = (first & GAP) !== 0;
        const i1 = base + (level[g - 1]! & OFFSET);
        const x1 = x[i1] as number;
        if (g - e > 1 && col(x[i0] as number) !== col(x1)) {
          // A bucket across a column edge: its points, so that each column is exact.
          let head = gap;
          for (let i = i0; i <= i1; i++) {
            const xi = x[i] as number;
            const yi = y[i] as number;
            if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
            columns.add(xi, yi, head);
            head = false;
          }
        } else {
          for (let k = e; k < g; k++) {
            const i = base + (level[k]! & OFFSET);
            columns.add(x[i] as number, y[i] as number, k === e && gap);
          }
        }
        e = g;
        // One bucket past `hi`, so that the segment leaving the window is drawn.
        if (x1 > hi) return columns.finish(window);
      }
    }
    return columns.finish(window);
  }

  /** Build the chunks of the current window, taking those `reuse` returns as they are. */
  #rebuild(reuse: (id: number) => Chunk | undefined): void {
    const { x, y } = this;
    const n = Math.min(x.length, y.length);
    this.#n = n;
    const chunks: Chunk[] = [];
    let prevX = -Infinity;
    let valid = true;
    const last = Math.floor((this.#start + n - 1) / CHUNK);
    for (let id = Math.floor(this.#start / CHUNK); id <= last && valid; id++) {
      const chunk = reuse(id) ?? buildChunk(id, x, y, n, this.#start, this.connectgaps);
      if (chunk === undefined) continue;
      valid = chunk !== null && chunk.x0 >= prevX;
      if (chunk) prevX = chunk.x1;
      chunks.push(chunk!);
    }
    this.#chunks = valid ? chunks : [];
    this.valid = valid;
  }
}

/**
 * Min/max decimation of a point stream into whole px columns (`floor(x · scaleX)`, the columns of
 * `buildLinePath`): per column the first, lowest, highest and last point, in order.
 */
class ColumnDecimator {
  readonly #sx: number;
  /** Interleaved x, y. */
  readonly #out: number[];
  #n = 0;
  #col = 0;
  #k = 0;
  // First, lowest, highest and last point of the column, with their sequence numbers.
  #fx = 0;
  #fy = 0;
  #fk = 0;
  #lox = 0;
  #loy = 0;
  #lok = 0;
  #hix = 0;
  #hiy = 0;
  #hik = 0;
  #lx = 0;
  #ly = 0;
  #lk = 0;

  constructor(sx: number, out: number[]) {
    this.#sx = sx;
    this.#out = out;
  }

  /** Add a point; `gap`: the line breaks before it. */
  add(x: number, y: number, gap: boolean): void {
    if (gap) {
      this.#flush();
      if (this.#out.length > 0) this.#out.push(NaN, NaN);
    }
    const col = Math.floor(x * this.#sx);
    if (this.#n > 0 && col !== this.#col) this.#flush();
    const k = this.#k++;
    if (this.#n++ === 0) {
      this.#col = col;
      this.#fx = this.#lox = this.#hix = this.#lx = x;
      this.#fy = this.#loy = this.#hiy = this.#ly = y;
      this.#fk = this.#lok = this.#hik = this.#lk = k;
      return;
    }
    this.#lx = x;
    this.#ly = y;
    this.#lk = k;
    if (y < this.#loy) {
      this.#lox = x;
      this.#loy = y;
      this.#lok = k;
    }
    if (y > this.#hiy) {
      this.#hix = x;
      this.#hiy = y;
      this.#hik = k;
    }
  }

  finish(window: LodWindow): LodPath {
    this.#flush();
    const out = this.#out;
    const n = out.length / 2;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = out[2 * i]!;
      y[i] = out[2 * i + 1]!;
    }
    return { x, y, window };
  }

  #flush(): void {
    if (this.#n === 0) return;
    this.#n = 0;
    const out = this.#out;
    out.push(this.#fx, this.#fy);
    // first ≤ min(lo, hi) ≤ max(lo, hi) ≤ last in order; drop repeats.
    const loFirst = this.#lok <= this.#hik;
    const pk = loFirst ? this.#lok : this.#hik;
    const qk = loFirst ? this.#hik : this.#lok;
    if (pk !== this.#fk) out.push(loFirst ? this.#lox : this.#hix, loFirst ? this.#loy : this.#hiy);
    if (qk !== pk) out.push(loFirst ? this.#hix : this.#lox, loFirst ? this.#hiy : this.#loy);
    if (this.#lk !== qk) out.push(this.#lx, this.#ly);
  }
}

/**
 * Pyramids by calc (any object standing for one data set): the main view and the range slider's
 * mirror of a trace share one, and a streamed calc takes over its `previous` calc's pyramid,
 * edited at the ends (`change`).
 */
const pyramids = new WeakMap<object, LineLod>();

/** The pyramid of `x` / `y` (the arrays of `calc`), cached per calc. */
export function lineLod(
  calc: object,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  connectgaps: boolean,
  previous?: object,
  change?: WindowChange,
): LineLod {
  const cached = pyramids.get(calc);
  if (cached?.connectgaps === connectgaps) return cached;
  let lod = previous && change ? pyramids.get(previous) : undefined;
  if (lod?.connectgaps === connectgaps) {
    pyramids.delete(previous!);
    // A line whose x went back stays drawn without a pyramid until its next full calc.
    if (lod.valid) lod.edit(x, y, change!);
  } else {
    lod = new LineLod(x, y, connectgaps);
  }
  pyramids.set(calc, lod);
  return lod;
}
