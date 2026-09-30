/**
 * Tick label and axis title placement for 3D scenes (plan E14.1b), in screen space: labels are
 * billboards (upright, px-sized) set off from their projected edge along the edge's outward normal,
 * anchored on the side facing the edge, and culled greedily where they would overlap. Pure.
 */

/** A label box in container px (top-left origin). */
export interface LabelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type AnchorX = 'left' | 'center' | 'right';
export type AnchorY = 'top' | 'middle' | 'bottom';

/**
 * The unit normal of the screen segment `(ax, ay)–(bx, by)` that points away from `(cx, cy)`
 * (the projected box center): the direction labels are pushed off an edge. Screen y is down.
 */
export function outwardNormal(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  let nx: number;
  let ny: number;
  if (len < 1e-6) {
    // The edge points at the camera: push away from the center instead.
    nx = ax - cx;
    ny = ay - cy;
    const l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l];
  }
  nx = -dy / len;
  ny = dx / len;
  if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

/** Anchors that put a label on the `(nx, ny)` side of its point (screen y down). */
export function anchorsFor(nx: number, ny: number): { anchorX: AnchorX; anchorY: AnchorY } {
  const t = 0.38;
  return {
    anchorX: nx > t ? 'left' : nx < -t ? 'right' : 'center',
    anchorY: ny > t ? 'top' : ny < -t ? 'bottom' : 'middle',
  };
}

/** The box of a `width × height` label anchored at `(x, y)`. */
export function labelBox(
  x: number,
  y: number,
  width: number,
  height: number,
  anchorX: AnchorX,
  anchorY: AnchorY,
): LabelBox {
  const x0 = anchorX === 'left' ? x : anchorX === 'right' ? x - width : x - width / 2;
  const y0 = anchorY === 'top' ? y : anchorY === 'bottom' ? y - height : y - height / 2;
  return { x0, y0, x1: x0 + width, y1: y0 + height };
}

function overlaps(a: LabelBox, b: LabelBox, gap: number): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}

/**
 * Collision culling: keeps labels in order, dropping each one whose box comes within `gap` px of a
 * box already kept (so put the labels that matter most first: titles, then ticks).
 */
export function cullOverlaps<T extends { readonly box: LabelBox }>(
  labels: readonly T[],
  gap = 2,
): T[] {
  const kept: T[] = [];
  for (const l of labels) {
    if (!kept.some((k) => overlaps(k.box, l.box, gap))) kept.push(l);
  }
  return kept;
}
