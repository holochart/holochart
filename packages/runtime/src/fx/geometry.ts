/**
 * Pure geometry for zoom, pan and selection (plan E6.2, E6.3): drag-box classification, range math
 * in linear coordinates, `minallowed` / `maxallowed` limits, selection boxes and lasso tests. No DOM,
 * no chart state.
 */
import type { SelectionQuery } from '../contracts.ts';

/** Smallest drag (px) that makes a zoom box along an axis (Plotly's `MINDRAG`). */
export const MINDRAG = 8;
/** Largest pointer travel (px) that still counts as a click. */
export const CLICK_TOLERANCE = 3;
/** Width (px) of the axis drag strips next to a subplot. */
export const AXIS_DRAG_SIZE = 30;
/** Fraction of an axis strip, at each end, that scales that end (the middle pans). */
export const AXIS_END_FRACTION = 0.15;

/** Where a drag started, relative to a subplot. */
export type DragZone = 'plot' | 'x-start' | 'x-middle' | 'x-end' | 'y-start' | 'y-middle' | 'y-end';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function inRect(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/**
 * Which drag zone a container position is in: the plot area, or the strips just below it (x axis)
 * and left of it (y axis), split into start / middle / end. `start` is the axis' `range[0]` end
 * (left for x, bottom for y). `undefined` outside all of them.
 */
export function dragZoneAt(rect: Rect, x: number, y: number): DragZone | undefined {
  if (inRect(rect, x, y)) return 'plot';
  const bottom = rect.y + rect.height;
  if (x >= rect.x && x <= rect.x + rect.width && y > bottom && y <= bottom + AXIS_DRAG_SIZE) {
    const f = (x - rect.x) / Math.max(1, rect.width);
    return f < AXIS_END_FRACTION ? 'x-start' : f > 1 - AXIS_END_FRACTION ? 'x-end' : 'x-middle';
  }
  if (y >= rect.y && y <= bottom && x < rect.x && x >= rect.x - AXIS_DRAG_SIZE) {
    const f = (bottom - y) / Math.max(1, rect.height);
    return f < AXIS_END_FRACTION ? 'y-start' : f > 1 - AXIS_END_FRACTION ? 'y-end' : 'y-middle';
  }
  return undefined;
}

/** A zoom box from a drag: which axes it zooms (x-only / y-only bands for thin drags). */
export interface ZoomBox {
  readonly x: boolean;
  readonly y: boolean;
  /** Box in container px (bands span the whole plot area on the other axis). */
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/**
 * Classify a zoom drag from `(x0, y0)` to `(x1, y1)` inside `rect` (Plotly semantics): shorter than
 * {@link MINDRAG} along an axis means that axis is not zoomed, so a thin horizontal drag zooms x
 * only. Fixed axes never zoom. `null` when neither axis zooms.
 */
export function zoomBox(
  rect: Rect,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fixedX: boolean,
  fixedY: boolean,
): ZoomBox | null {
  const cx = Math.min(Math.max(x1, rect.x), rect.x + rect.width);
  const cy = Math.min(Math.max(y1, rect.y), rect.y + rect.height);
  // A fixed axis never zooms, so with y fixed any drag along x zooms x alone (and vice versa).
  const zx = !fixedX && Math.abs(cx - x0) >= MINDRAG;
  const zy = !fixedY && Math.abs(cy - y0) >= MINDRAG;
  if (!zx && !zy) return null;
  return {
    x: zx,
    y: zy,
    x0: zx ? Math.min(x0, cx) : rect.x,
    x1: zx ? Math.max(x0, cx) : rect.x + rect.width,
    y0: zy ? Math.min(y0, cy) : rect.y,
    y1: zy ? Math.max(y0, cy) : rect.y + rect.height,
  };
}

/** A `[r0, r1]` pair in linear coordinates (`r0 > r1` for reversed axes). */
export type LinearRange = [number, number];

/** Zoom `range` by `factor` (< 1 zooms in) around the linear coordinate `anchor`. */
export function zoomAround(
  range: readonly [number, number],
  anchor: number,
  factor: number,
): LinearRange {
  return [anchor + (range[0] - anchor) * factor, anchor + (range[1] - anchor) * factor];
}

/** Shift `range` by `delta` (linear units). */
export function panBy(range: readonly [number, number], delta: number): LinearRange {
  return [range[0] + delta, range[1] + delta];
}

/**
 * Keep a range within `[min, max]` (linear; either may be undefined), preserving orientation. A pan
 * (`preserveSpan`) slides the window back inside; a zoom clamps each end. A window wider than the
 * limits is clamped to them.
 */
export function limitRange(
  range: readonly [number, number],
  min: number | undefined,
  max: number | undefined,
  preserveSpan: boolean,
): LinearRange {
  const lo0 = Math.min(range[0], range[1]);
  const hi0 = Math.max(range[0], range[1]);
  const reversed = range[0] > range[1];
  const hasMin = min !== undefined && Number.isFinite(min);
  const hasMax = max !== undefined && Number.isFinite(max);
  if (hasMin && hasMax && (min as number) >= (max as number)) return [range[0], range[1]];
  let lo = lo0;
  let hi = hi0;
  if (preserveSpan) {
    const span = hi - lo;
    if (hasMin && lo < (min as number)) {
      lo = min as number;
      hi = lo + span;
    }
    if (hasMax && hi > (max as number)) {
      hi = max as number;
      lo = hi - span;
    }
    if (hasMin && lo < (min as number)) lo = min as number;
  } else {
    if (hasMin) lo = Math.max(lo, min as number);
    if (hasMax) hi = Math.min(hi, max as number);
    if (hi <= lo) return [range[0], range[1]];
  }
  return reversed ? [hi, lo] : [lo, hi];
}

/** Box selection direction resolved for one drag (`selectdirection`). */
export function selectBoxAxes(
  direction: 'h' | 'v' | 'd' | 'any',
  dx: number,
  dy: number,
): { x: boolean; y: boolean } {
  if (direction === 'h') return { x: true, y: false };
  if (direction === 'v') return { x: false, y: true };
  if (direction === 'd')
    return Math.abs(dx) >= Math.abs(dy) ? { x: true, y: false } : { x: false, y: true };
  return { x: true, y: true };
}

/** Whether `(x, y)` is inside a polygon (even-odd rule; vertices as `[x, y]` pairs). */
export function pointInPolygon(
  polygon: readonly (readonly [number, number])[],
  x: number,
  y: number,
): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i] as readonly [number, number];
    const pj = polygon[j] as readonly [number, number];
    const yi = pi[1];
    const yj = pj[1];
    if (yi > y !== yj > y && x < ((pj[0] - pi[0]) * (y - yi)) / (yj - yi) + pi[0]) inside = !inside;
  }
  return inside;
}

/**
 * Whether a point (linear coordinates) is inside a selection: the box for `rect` queries, the
 * polygon for `lasso` ones. Trace modules use this in `selectPoints`.
 */
export function selectionContains(query: SelectionQuery, x: number, y: number): boolean {
  if (!(x >= query.x[0] && x <= query.x[1] && y >= query.y[0] && y <= query.y[1])) return false;
  if (query.kind === 'rect' || !query.polygon) return true;
  return pointInPolygon(query.polygon, x, y);
}

/** 1D label placement input: desired center and size; `pos` receives the placed center. */
export interface Placed {
  /** Desired center. */
  want: number;
  size: number;
  /** Placed center (output). */
  pos: number;
}

/**
 * Place labels along one axis without overlaps (hover label collision avoidance, E5.7): sorted by
 * desired position, each is pushed past the previous one by `gap`, then the whole stack is pulled
 * back inside `[min, max]` when it overflows. Items are sorted in place.
 */
export function avoidOverlaps(items: Placed[], min: number, max: number, gap: number): void {
  items.sort((a, b) => a.want - b.want);
  let edge = -Infinity;
  for (const it of items) {
    it.pos = Math.max(it.want, edge + gap + it.size / 2);
    edge = it.pos + it.size / 2;
  }
  // Overflow at the far end: shift up, keeping spacing, then clamp at the near end.
  let limit = max;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i] as Placed;
    if (it.pos + it.size / 2 > limit) it.pos = limit - it.size / 2;
    limit = it.pos - it.size / 2 - gap;
  }
  let floor = min;
  for (const it of items) {
    if (it.pos - it.size / 2 < floor) it.pos = floor + it.size / 2;
    floor = it.pos + it.size / 2 + gap;
  }
}
