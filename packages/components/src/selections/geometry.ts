/**
 * Geometry of `layout.selections` outlines (plan E5.12), pure: a selection's outline in its
 * subplot's linear coordinates, hit testing in container px, and what a drag does to it.
 */
import {
  linearToPosition,
  parseSelectionPath,
  positionToLinear,
  type AxisInfo,
  type FullSelection,
} from '@mk7s/holochart-runtime';

type Axis = Pick<AxisInfo, 'type' | 'scale' | 'letter' | 'start'>;

/** One selection's outline: a closed polygon in linear coordinates of its axes. */
export interface SelectionOutline {
  /** `_index` of the selection in `layout.selections` (-1 for template items). */
  readonly index: number;
  readonly type: 'rect' | 'path';
  /** Polygon vertices (not repeated at the end), linear coordinates. */
  readonly x: readonly number[];
  readonly y: readonly number[];
  /** `rect` only: the box, sorted (`x0 <= x1`, `y0 <= y1`), linear coordinates. */
  readonly box?: readonly [x0: number, x1: number, y0: number, y1: number];
}

/** The outline of a defaulted selection on its axes, or `undefined` when incomplete. */
export function selectionOutline(
  sel: FullSelection,
  xaxis: Axis,
  yaxis: Axis,
): SelectionOutline | undefined {
  const index = typeof sel._index === 'number' ? sel._index : -1;
  if (sel.type === 'path') {
    const poly =
      typeof sel.path === 'string' ? parseSelectionPath(sel.path, xaxis, yaxis) : undefined;
    if (!poly) return undefined;
    return { index, type: 'path', x: poly.map((p) => p[0]), y: poly.map((p) => p[1]) };
  }
  const xa = positionToLinear(xaxis, sel.x0);
  const xb = positionToLinear(xaxis, sel.x1);
  const ya = positionToLinear(yaxis, sel.y0);
  const yb = positionToLinear(yaxis, sel.y1);
  if (![xa, xb, ya, yb].every(Number.isFinite)) return undefined;
  const [x0, x1] = xa <= xb ? [xa, xb] : [xb, xa];
  const [y0, y1] = ya <= yb ? [ya, yb] : [yb, ya];
  return {
    index,
    type: 'rect',
    x: [x0, x1, x1, x0],
    y: [y0, y0, y1, y1],
    box: [x0, x1, y0, y1],
  };
}

/** Linear coordinate → container px along an axis (x from the left, y from the top). */
export function toContainer(axis: Axis, l: number): number {
  const p = axis.scale.l2p(l);
  return axis.letter === 'x' ? axis.start + p : axis.start - p;
}

/** Container px → linear coordinate along an axis. */
export function fromContainer(axis: Axis, c: number): number {
  return axis.scale.p2l(axis.letter === 'x' ? c - axis.start : axis.start - c);
}

/** What dragging a selection does: move it, or resize a box along the named edges. */
export type SelectionDragMode = 'move' | `resize-${string}`;

/** How close to an edge (px) a press must be to resize. */
export const SELECTION_GRAB = 6;

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/**
 * What a press at container px (`px`, `py`) grabs on an outline: a box's edge or corner resizes
 * it (`resize-n`, `resize-se`, …; boxes too small for handles only move), the inside (or a lasso's
 * outline) moves it; `undefined` when it misses.
 */
export function hitSelection(
  outline: SelectionOutline,
  xaxis: Axis,
  yaxis: Axis,
  px: number,
  py: number,
): SelectionDragMode | undefined {
  const xs = outline.x.map((l) => toContainer(xaxis, l));
  const ys = outline.y.map((l) => toContainer(yaxis, l));
  if (outline.box) {
    const l = Math.min(...xs);
    const r = Math.max(...xs);
    const t = Math.min(...ys);
    const b = Math.max(...ys);
    const g = SELECTION_GRAB;
    if (px < l - g || px > r + g || py < t - g || py > b + g) return undefined;
    if (r - l < 3 * g || b - t < 3 * g) return 'move';
    const v = Math.abs(py - t) <= g ? 'n' : Math.abs(py - b) <= g ? 's' : '';
    const h = Math.abs(px - l) <= g ? 'w' : Math.abs(px - r) <= g ? 'e' : '';
    return v || h ? `resize-${v}${h}` : 'move';
  }
  let inside = false;
  const n = xs.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ax, ay, bx, by] = [xs[i]!, ys[i]!, xs[j]!, ys[j]!];
    if (segmentDistance(px, py, ax, ay, bx, by) <= SELECTION_GRAB) return 'move';
    if (ay > py !== by > py && px < ax + ((py - ay) * (bx - ax)) / (by - ay)) inside = !inside;
  }
  return inside ? 'move' : undefined;
}

/**
 * The outline after a drag of (`dx`, `dy`) container px in `mode`: moved (every vertex), or a
 * box with the grabbed edges moved (edges may cross; the box stays sorted).
 */
export function dragOutline(
  outline: SelectionOutline,
  xaxis: Axis,
  yaxis: Axis,
  mode: SelectionDragMode,
  dx: number,
  dy: number,
): SelectionOutline {
  const shiftX = (l: number): number => fromContainer(xaxis, toContainer(xaxis, l) + dx);
  const shiftY = (l: number): number => fromContainer(yaxis, toContainer(yaxis, l) + dy);
  if (mode === 'move' || !outline.box) {
    const x = outline.x.map(shiftX);
    const y = outline.y.map(shiftY);
    if (!outline.box) return { ...outline, x, y };
    const [x0, x1, y0, y1] = outline.box;
    return { ...outline, x, y, box: [shiftX(x0), shiftX(x1), shiftY(y0), shiftY(y1)] };
  }
  let [x0, x1, y0, y1] = outline.box;
  const edges = mode.slice('resize-'.length);
  // Container px: the top edge is the larger y value (y axes grow upward), unless reversed.
  const topIsY1 = toContainer(yaxis, y1) <= toContainer(yaxis, y0);
  const leftIsX0 = toContainer(xaxis, x0) <= toContainer(xaxis, x1);
  if (edges.includes('w')) {
    if (leftIsX0) x0 = shiftX(x0);
    else x1 = shiftX(x1);
  }
  if (edges.includes('e')) {
    if (leftIsX0) x1 = shiftX(x1);
    else x0 = shiftX(x0);
  }
  if (edges.includes('n')) {
    if (topIsY1) y1 = shiftY(y1);
    else y0 = shiftY(y0);
  }
  if (edges.includes('s')) {
    if (topIsY1) y0 = shiftY(y0);
    else y1 = shiftY(y1);
  }
  const [a, b] = x0 <= x1 ? [x0, x1] : [x1, x0];
  const [c, d] = y0 <= y1 ? [y0, y1] : [y1, y0];
  return { ...outline, x: [a, b, b, a], y: [c, c, d, d], box: [a, b, c, d] };
}

/** A path value as text: dates with `_` between date and time (Plotly). */
function pathValue(v: number | string): string {
  return typeof v === 'string' ? v.replace(' ', '_') : String(v);
}

/**
 * The `relayout` edits that store an outline in `selections[index]`: `x0`, `x1`, `y0`, `y1` for a
 * box, `path` for a lasso (Plotly's attribute strings).
 */
export function outlineEdits(
  outline: SelectionOutline,
  xaxis: Axis,
  yaxis: Axis,
): Record<string, unknown> {
  const i = outline.index;
  if (outline.box) {
    const [x0, x1, y0, y1] = outline.box;
    return {
      [`selections[${i}].x0`]: linearToPosition(xaxis, x0),
      [`selections[${i}].x1`]: linearToPosition(xaxis, x1),
      [`selections[${i}].y0`]: linearToPosition(yaxis, y0),
      [`selections[${i}].y1`]: linearToPosition(yaxis, y1),
    };
  }
  const parts = outline.x.map(
    (x, k) =>
      `${k === 0 ? 'M' : 'L'}${pathValue(linearToPosition(xaxis, x))},${pathValue(linearToPosition(yaxis, outline.y[k] as number))}`,
  );
  return { [`selections[${i}].path`]: `${parts.join('')}Z` };
}
