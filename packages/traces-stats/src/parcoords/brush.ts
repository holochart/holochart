/**
 * Axis brushing of `parcoords` (plan E10.10), after plotly.js' `parcoords/axisbrush.js`: a pure
 * state machine over one axis' constraint ranges, in data units, with the axis' pixel mapping.
 *
 * - A press near a range picks a region: its top end (`'n'`, the outer 10 % of the bar and 8 px
 *   beyond), its bottom end (`'s'`) or its body (`'ns'`). Dragging a body moves the range, an end
 *   resizes it, and anywhere else a new range is drawn from the press.
 * - Without `multiselect` the new range replaces the others; with it, the other ranges stay.
 * - A click (no drag) on a range body removes that range; a click elsewhere clears the axis; on
 *   an ordinal axis (`tickvals`) a click between ticks selects that tick's zone.
 * - On release, ordinal ranges snap to the ticks, and overlapping ranges merge.
 */
import { mergeRanges, snapToTicks, type Range } from './ranges.ts';
import { PARCOORDS } from './layout.ts';

/** What the brush needs of an axis. */
export interface BrushAxis {
  /** Container y → value, and back. */
  valueAt(y: number): number;
  yOf(v: number): number;
  /** Ordinal ticks (ascending), if any. */
  readonly ticks?: readonly number[] | undefined;
  readonly multiselect: boolean;
}

/** A region of an existing range: its top end, bottom end, or body (screen directions). */
export type BrushRegion = 'n' | 's' | 'ns';

/** Screen extent `[top, bottom]` (container y) of a range. */
function screenOf(axis: BrushAxis, r: Range): [number, number] {
  const a = axis.yOf(r[0]);
  const b = axis.yOf(r[1]);
  return a < b ? [a, b] : [b, a];
}

/**
 * The range and region under container y `y`: the range containing it or the nearest one within
 * {@link PARCOORDS.handle} px, and which part of it (Plotly's `getRegion`).
 */
export function regionAt(
  axis: BrushAxis,
  ranges: readonly Range[],
  y: number,
): { range: Range; region: BrushRegion } | undefined {
  let best: Range | undefined;
  let bestDist = Infinity;
  for (const r of ranges) {
    const [top, bottom] = screenOf(axis, r);
    const d = y < top ? top - y : y > bottom ? y - bottom : 0;
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  if (!best || bestDist > PARCOORDS.handle) return undefined;
  const [top, bottom] = screenOf(axis, best);
  const edge = 0.1 * (bottom - top);
  const region: BrushRegion = y <= top + edge ? 'n' : y >= bottom - edge ? 's' : 'ns';
  return { range: best, region };
}

/** The zone of the ordinal tick a value selects on click, or `undefined` (Plotly's click zones). */
export function ordinalZone(ticks: readonly number[] | undefined, v: number): Range | undefined {
  if (!ticks || ticks.length === 0) return undefined;
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i]!;
    const lo = i > 0 ? 0.75 * t + 0.25 * ticks[i - 1]! : t;
    const hi = i < ticks.length - 1 ? 0.75 * t + 0.25 * ticks[i + 1]! : t;
    if (v >= lo && v <= hi) return [lo, hi];
  }
  return undefined;
}

/** The cursor over an axis at container y (Plotly: crosshair, resize arrows, or a pointer). */
export function brushCursor(axis: BrushAxis, ranges: readonly Range[], y: number): string {
  const hit = regionAt(axis, ranges, y);
  if (hit) return hit.region === 'ns' ? 'ns-resize' : `${hit.region}-resize`;
  return ordinalZone(axis.ticks, axis.valueAt(y)) ? 'pointer' : 'crosshair';
}

/** One brush gesture on one axis. */
export class BrushGesture {
  readonly #axis: BrushAxis;
  readonly #initial: readonly Range[];
  readonly #hit: { range: Range; region: BrushRegion } | undefined;
  readonly #startY: number;
  /** Ranges that stay while this one is drawn (multiselect with an active filter). */
  readonly #staying: Range[];
  /** Fixed screen end for resizes and new ranges; grab offset and length for moves. */
  readonly #anchor: number;
  readonly #length: number;
  #current: Range | undefined;
  #moved = false;

  constructor(axis: BrushAxis, ranges: readonly Range[], y: number) {
    this.#axis = axis;
    this.#initial = ranges;
    this.#startY = y;
    const hit = regionAt(axis, ranges, y);
    this.#hit = hit;
    const grabbed = hit?.range;
    const shares = (r: Range): boolean =>
      grabbed !== undefined && (r[0] === grabbed[0] || r[1] === grabbed[1]);
    this.#staying = axis.multiselect && ranges.length > 0 ? ranges.filter((r) => !shares(r)) : [];
    if (hit) {
      const [top, bottom] = screenOf(axis, hit.range);
      this.#anchor = hit.region === 'ns' ? y - top : hit.region === 'n' ? bottom : top;
      this.#length = bottom - top;
    } else {
      this.#anchor = y;
      this.#length = 0;
    }
  }

  /** Whether the pointer moved since the press (a drag, not a click). */
  get moved(): boolean {
    return this.#moved;
  }

  /** Move the pointer to container y: the ranges to show meanwhile. */
  move(y: number): Range[] {
    if (y !== this.#startY) this.#moved = true;
    if (!this.#moved) return [...this.#initial];
    const axis = this.#axis;
    let y0: number;
    let y1: number;
    if (this.#hit?.region === 'ns') {
      // Moves are not clamped to the axis (Plotly).
      y0 = y - this.#anchor;
      y1 = y0 + this.#length;
    } else {
      y0 = Math.min(this.#anchor, y);
      y1 = Math.max(this.#anchor, y);
    }
    const a = axis.valueAt(y0);
    const b = axis.valueAt(y1);
    this.#current = a <= b ? [a, b] : [b, a];
    return [...this.#staying, this.#current];
  }

  /** Release at container y: the axis' ranges after the gesture (empty: cleared). */
  end(y: number): Range[] {
    const axis = this.#axis;
    if (!this.#moved) {
      if (!this.#hit) {
        const zone = ordinalZone(axis.ticks, axis.valueAt(y));
        if (!zone) return [];
        const base = axis.multiselect ? this.#initial : [];
        return mergeRanges([...base, zone]);
      }
      if (this.#hit.region !== 'ns' || !axis.multiselect) return [];
      const grabbed = this.#hit.range;
      return this.#initial.filter((r) => r !== grabbed);
    }
    let current = this.#current;
    const ticks = axis.ticks;
    if (current && ticks && ticks.length > 0) {
      const lo = snapToTicks(false, ticks, current[0], this.#staying);
      const hi = snapToTicks(true, ticks, current[1], this.#staying);
      current = hi > lo ? [lo, hi] : undefined;
    }
    return mergeRanges(current ? [...this.#staying, current] : this.#staying);
  }
}
