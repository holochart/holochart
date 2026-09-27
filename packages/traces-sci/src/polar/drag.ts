/**
 * The math of the polar drags (plan E11.4), pure: ports of plotly.js `Polar.updateRadialDrag`
 * (`moveFn`, `rerangeMove`) and `updateHoverAndMainDrag` (`clampAndSetR0R1`,
 * `computeZoomUpdates`). Pointer deltas are container px (y down); angles are radians
 * counterclockwise.
 */

/** Pointer travel (px) under which a drag stays at its start (Plotly's `MINDRAG`). */
export const MINDRAG = 8;
/** Smallest radial span (px) of a zoom box (`MINZOOM`). */
export const MINZOOM = 20;
/** Distance (px) from the center or the edge within which a zoom box snaps to it (`OFFEDGE`). */
export const OFFEDGE = 20;

/** Pointer travel along the radial axis at `angle` (px, outwards positive). */
export function alongAxis(dx: number, dy: number, angle: number): number {
  return dx * Math.cos(angle) - dy * Math.sin(angle);
}

/**
 * What a radial drag does (decided on its first real move): mostly across the axis rotates it
 * (the outer handle only), mostly along it re-ranges.
 */
export function radialDragMode(
  dx: number,
  dy: number,
  angle: number,
  index: 0 | 1,
): 'rotate' | 'range' {
  const comp = Math.abs(alongAxis(dx, dy, angle)) / Math.hypot(dx, dy);
  return comp < 0.5 && index === 1 ? 'rotate' : 'range';
}

/**
 * The radial range after dragging end `index` of `start` (linear coordinates) by `(dx, dy)`: 0.75
 * of the range per radius of travel, outwards shrinking the range (zooming in). `undefined` when
 * the drag would flip the range.
 */
export function rerange(
  start: readonly [number, number],
  index: 0 | 1,
  dx: number,
  dy: number,
  angle: number,
  radius: number,
  innerRadius: number,
): [number, number] | undefined {
  const m = (0.75 * (start[1] - start[0])) / (radius - innerRadius);
  const value = start[index] - m * alongAxis(dx, dy, angle);
  const other = start[index === 1 ? 0 : 1];
  if (m > 0 !== (index === 1 ? value > other : value < other)) return undefined;
  const out: [number, number] = [start[0], start[1]];
  out[index] = value;
  return out;
}

/**
 * The ring `[r0, r1]` (px from the center) a zoom box from radius `from` to radius `to` selects:
 * `to` stays inside the subplot, an end within {@link OFFEDGE} of the center or the edge snaps to
 * it, and rings thinner than {@link MINZOOM} select nothing (`null`).
 */
export function zoomRing(
  from: number,
  to: number,
  radius: number,
  innerRadius: number,
): [number, number] | null {
  let rr0 = from;
  let rr1 = Math.max(Math.min(to, radius), innerRadius);
  if (rr0 < OFFEDGE) rr0 = 0;
  else if (radius - rr0 < OFFEDGE) rr0 = radius;
  else if (rr1 < OFFEDGE) rr1 = 0;
  else if (radius - rr1 < OFFEDGE) rr1 = radius;
  if (!(Math.abs(rr1 - rr0) > MINZOOM)) return null;
  return [Math.min(rr0, rr1), Math.max(rr0, rr1)];
}
