/**
 * Pure gesture rules for touch and pointer input (plan E6.6): tap vs drag tolerances, the chart
 * canvas' `touch-action`, and two-finger pinch / pan math. No DOM, no chart state.
 *
 * ## `touch-action`
 *
 * The browser reads `touch-action` when a finger lands, so a chart states up front which touch
 * gestures it keeps; everything else stays with the page (scrolling, page zoom). From least to most
 * restrictive:
 *
 * - `manipulation`: the chart only takes taps (hover, click, double-tap reset). One-finger swipes
 *   scroll the page, pinches zoom the page. For `dragmode: false` (and 3D-only `orbit` /
 *   `turntable`), for charts whose axes are all `fixedrange`, and for charts without cartesian
 *   subplots (pie, sunburst, …) unless a trace asks for more.
 * - `pan-y`: a swipe that starts vertically scrolls the page; one that starts sideways is the
 *   chart's drag (then in any direction), and two-finger gestures are the chart's. For
 *   `dragmode: 'zoom'` (the default), `'pan'` when only x axes can move, and traces that declare
 *   it (`TraceModule.touchAction`: sankey node drags, polar axis drags).
 * - `none`: every touch gesture is the chart's. For `dragmode` `'pan'` (a movable y axis),
 *   `'select'`, `'lasso'` and the draw modes — tools a user picks on purpose — and traces whose
 *   drags go every way (table scrolling, parcoords brushing, parcats reordering).
 */
import { CLICK_TOLERANCE, type LinearRange } from './geometry.ts';
import { isDrawDragmode, type Dragmode } from './settings.ts';

/**
 * Largest travel (px) that still counts as a tap for touch and pen input (fingers wobble more
 * than a mouse; Plotly uses `MINDRAG` for every input, platforms use a touch slop of ~8–16 px).
 */
export const TAP_TOLERANCE = 10;
/** Largest distance (px) between two taps of a double tap. */
export const DOUBLE_TAP_DISTANCE = 30;

/** The canvas `touch-action` values the chart uses, least restrictive first. */
export type TouchAction = 'manipulation' | 'pan-y' | 'none';

const ORDER: readonly TouchAction[] = ['manipulation', 'pan-y', 'none'];

/** Travel (px) below which a press is still a click / tap for a `PointerEvent.pointerType`. */
export function tapTolerance(pointerType: string | undefined): number {
  return pointerType === 'touch' || pointerType === 'pen' ? TAP_TOLERANCE : CLICK_TOLERANCE;
}

/** Whether a press that travelled `(dx, dy)` px is a tap (click), not a drag. */
export function isTap(dx: number, dy: number, pointerType: string | undefined): boolean {
  return Math.hypot(dx, dy) <= tapTolerance(pointerType);
}

/**
 * Whether a tap `dt` ms and `(dx, dy)` px after the previous one completes a double tap / click.
 * `delay` is `config.doubleClickDelay`.
 */
export function isDoubleTap(
  dt: number,
  dx: number,
  dy: number,
  delay: number,
  pointerType: string | undefined,
): boolean {
  const d = pointerType === 'touch' ? DOUBLE_TAP_DISTANCE : tapTolerance(pointerType);
  return dt < delay && Math.abs(dx) <= d && Math.abs(dy) <= d;
}

/**
 * Whether a one-finger swipe that first moved `(dx, dy)` belongs to the page under
 * `touch-action: pan-y` (it started vertically). The browser scrolls it (and cancels the
 * pointer); the chart ignores it in the meantime so no zoom box flashes.
 */
export function isPageScroll(action: TouchAction, dx: number, dy: number): boolean {
  return action === 'pan-y' && Math.abs(dy) > Math.abs(dx);
}

/**
 * The canvas `touch-action` (see the module comment). `x` / `y`: some cartesian axis of that
 * letter can zoom and pan (not `fixedrange`), `false` both without cartesian subplots;
 * `subplots`: the chart has cartesian subplots; `traces`: the most restrictive
 * `TraceModule.touchAction` of the visible traces.
 */
export function touchActionFor(
  dragmode: Dragmode,
  subplots: boolean,
  x: boolean,
  y: boolean,
  traces: TouchAction | undefined,
): TouchAction {
  let own: TouchAction = 'manipulation';
  if (subplots) {
    if (dragmode === 'select' || dragmode === 'lasso' || isDrawDragmode(dragmode)) own = 'none';
    else if (dragmode === 'pan') own = y ? 'none' : x ? 'pan-y' : 'manipulation';
    else if (dragmode === 'zoom' && (x || y)) own = 'pan-y';
  }
  return traces && ORDER.indexOf(traces) > ORDER.indexOf(own) ? traces : own;
}

/**
 * Zoom factor of a pinch whose fingers started `d0` px apart and are now `d` px apart: the new
 * range span over the old one (< 1 zooms in). Distances under 1 px count as 1 px.
 */
export function pinchFactor(d0: number, d: number): number {
  return Math.max(1, d0) / Math.max(1, d);
}

/**
 * One axis of a two-finger pinch / pan: `start` scaled by `factor` around the value that was under
 * the fingers' midpoint at `p0`, then moved so that value sits under the midpoint's position now,
 * `p1`. Positions are px along the axis from its `range[0]` end (left for x, bottom for y) over an
 * axis `length` px long.
 */
export function pinchRange(
  start: readonly [number, number],
  length: number,
  p0: number,
  p1: number,
  factor: number,
): LinearRange {
  const perPx = (start[1] - start[0]) / Math.max(1, length);
  const anchor = start[0] + p0 * perPx;
  const lo = anchor - p1 * perPx * factor;
  return [lo, lo + (start[1] - start[0]) * factor];
}
