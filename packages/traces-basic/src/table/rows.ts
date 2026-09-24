/**
 * Row virtualization for `table` (plan E9.13): row heights, their running offsets and the visible
 * window, so only the rows on screen are measured, laid out and uploaded.
 *
 * Every row starts at the declared `cells.height`; a row gets its real height (it grows to fit
 * wrapped or multi-line text, as in Plotly) the first time it comes near the viewport. Offsets are
 * a prefix sum, rebuilt from the first changed row when heights change: O(rows) numbers, which is a
 * fraction of a millisecond for 100k rows and only happens when newly measured rows grew.
 *
 * The scroll position is an **anchor** (a row and an offset into it), not an absolute y: measuring
 * rows above the anchor moves everything below them, and keeping the anchor row fixed on screen
 * means rows that grow while they are measured never make the visible rows jump.
 */

/** Scroll position: `offset` px into row `row` is at the top of the body. */
export interface ScrollAnchor {
  readonly row: number;
  readonly offset: number;
}

/** Heights and offsets of every body row. */
export class RowHeights {
  readonly count: number;
  #base: number;
  readonly #heights: Float64Array;
  readonly #measured: Uint8Array;
  /** `offsets[i]`: top of row `i`; `offsets[count]`: total height. Valid below `#dirty`. */
  readonly #offsets: Float64Array;
  #dirty = 0;

  constructor(count: number, base: number) {
    this.count = Math.max(0, count);
    this.#base = base;
    this.#heights = new Float64Array(this.count).fill(base);
    this.#measured = new Uint8Array(this.count);
    this.#offsets = new Float64Array(this.count + 1);
  }

  /** The declared height unmeasured rows use. */
  get base(): number {
    return this.#base;
  }

  /** Forget every measurement (text, fonts or widths changed), with a new declared height. */
  reset(base: number): void {
    this.#base = base;
    this.#heights.fill(base);
    this.#measured.fill(0);
    this.#dirty = 0;
  }

  /** Whether row `i` has been measured since the last reset. */
  measured(i: number): boolean {
    return this.#measured[i] === 1;
  }

  /** Height of row `i`. */
  height(i: number): number {
    return this.#heights[i] ?? 0;
  }

  /** Record the measured height of row `i` (never below the declared height, as in Plotly). */
  set(i: number, height: number): boolean {
    if (i < 0 || i >= this.count) return false;
    this.#measured[i] = 1;
    const h = Math.max(this.#base, Number.isFinite(height) ? height : 0);
    if (h === this.#heights[i]) return false;
    this.#heights[i] = h;
    this.#dirty = Math.min(this.#dirty, i + 1);
    return true;
  }

  #ensure(): void {
    if (this.#dirty > this.count) return;
    const o = this.#offsets;
    const h = this.#heights;
    for (let i = Math.max(1, this.#dirty); i <= this.count; i++) o[i] = o[i - 1]! + h[i - 1]!;
    this.#dirty = this.count + 1;
  }

  /** Top of row `i` (`i = count` gives the total height). */
  top(i: number): number {
    this.#ensure();
    return this.#offsets[Math.max(0, Math.min(this.count, i))]!;
  }

  /** Total height of all rows. */
  get total(): number {
    return this.top(this.count);
  }

  /** The row at `y` px from the top of the first row (clamped to the rows), by binary search. */
  rowAt(y: number): number {
    if (this.count === 0) return 0;
    this.#ensure();
    const o = this.#offsets;
    let lo = 0;
    let hi = this.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (o[mid]! <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** The anchor for an absolute scroll position. */
  anchorAt(y: number): ScrollAnchor {
    const row = this.rowAt(y);
    return { row, offset: y - this.top(row) };
  }

  /** Absolute scroll position of an anchor. */
  positionOf(anchor: ScrollAnchor): number {
    return this.top(anchor.row) + anchor.offset;
  }
}

/** Largest scroll position: the rows' total height minus the body height (0 when they fit). */
export function maxScroll(rows: RowHeights, viewHeight: number): number {
  return Math.max(0, rows.total - viewHeight);
}

/** The visible window of a laid-out body. */
export interface RowWindow {
  /** Scroll position in use (clamped). */
  readonly scrollY: number;
  /** First and last visible rows (inclusive); `last < first` when there are none. */
  readonly first: number;
  readonly last: number;
  /** The anchor matching `scrollY`. */
  readonly anchor: ScrollAnchor;
}

/**
 * Measure the rows around the viewport and return the visible window. Rows within `margin` rows
 * above and below the visible ones are measured too, so rows usually have their final height
 * before they scroll into view; the anchor row stays where it was on screen. `measure(i)` returns
 * the height row `i` needs.
 */
export function layoutRows(
  rows: RowHeights,
  anchor: ScrollAnchor,
  viewHeight: number,
  measure: (row: number) => number,
  margin = 0,
): RowWindow {
  const view = Math.max(0, viewHeight);
  let current = clampAnchor(rows, anchor);
  for (let pass = 0; pass < 8; pass++) {
    const y = clampScroll(rows, rows.positionOf(current), view);
    current = rows.anchorAt(y);
    const first = rows.rowAt(y);
    const last = rows.rowAt(y + Math.max(0, view - 1e-6));
    let changed = false;
    const from = Math.max(0, first - margin);
    const to = Math.min(rows.count - 1, last + margin);
    for (let i = from; i <= to; i++) {
      if (!rows.measured(i)) changed = rows.set(i, measure(i)) || changed;
    }
    if (!changed) return { scrollY: y, first, last: rows.count === 0 ? -1 : last, anchor: current };
  }
  const y = clampScroll(rows, rows.positionOf(current), view);
  return {
    scrollY: y,
    first: rows.rowAt(y),
    last: rows.count === 0 ? -1 : rows.rowAt(y + Math.max(0, view - 1e-6)),
    anchor: rows.anchorAt(y),
  };
}

function clampAnchor(rows: RowHeights, anchor: ScrollAnchor): ScrollAnchor {
  if (rows.count === 0) return { row: 0, offset: 0 };
  const row = Math.max(0, Math.min(rows.count - 1, Math.floor(anchor.row) || 0));
  return { row, offset: Number.isFinite(anchor.offset) ? anchor.offset : 0 };
}

function clampScroll(rows: RowHeights, y: number, view: number): number {
  return Math.max(0, Math.min(maxScroll(rows, view), y));
}
