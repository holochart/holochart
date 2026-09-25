/**
 * Pointer handling of a `parcoords` trace (plan E10.10), after plotly.js' `parcoords.js` and
 * `axisbrush.js`: a press on an axis (a 10 px wide strip) brushes it (see `brush.ts`), a press on
 * an axis label drags the axis sideways to reorder the dimensions. The trace takes these events
 * before the chart does, so brushing never zooms or pans anything underneath; elsewhere it lets
 * them through. Like Plotly, there is no hover.
 *
 * The state machine is pure: it works on the geometry the view last drew and calls back into it
 * ({@link ParcoordsInteractionHost}), so it is unit tested without a renderer.
 */
import type { ComponentPointerEvent } from '@mk7s/holochart-runtime';
import { brushCursor, BrushGesture, type BrushAxis } from './brush.ts';
import { dragOrder, PARCOORDS, type Rect } from './layout.ts';
import type { Range } from './ranges.ts';

/** One drawn axis, as the interaction sees it (container px). */
export interface HitAxis {
  /** Index into `calc.dimensions`. */
  readonly dim: number;
  readonly x: number;
  /** Axis ends: top and bottom container y. */
  readonly top: number;
  readonly bottom: number;
  /** The label's box, if the axis has a label. */
  readonly label: Rect | undefined;
  /** The brush mapping and the ranges currently shown. */
  readonly brush: BrushAxis;
  readonly ranges: readonly Range[];
}

/** What the interaction needs of the drawn trace. */
export interface ParcoordsHitGeometry {
  readonly rect: Rect;
  /** Axes in display order. */
  readonly axes: readonly HitAxis[];
}

/** Callbacks into the view. */
export interface ParcoordsInteractionHost {
  geometry(): ParcoordsHitGeometry | undefined;
  /** Show `ranges` on dimension `dim` while brushing (`undefined`: back to the trace's own). */
  previewRanges(dim: number, ranges: readonly Range[] | undefined): void;
  /** A brush ended with these ranges on dimension `dim` (empty: cleared). */
  commitRanges(dim: number, ranges: readonly Range[], event: ComponentPointerEvent): void;
  /** Show dimension `dim` dragged to container x with the axes in `order`; `undefined` ends it. */
  dragAxis(drag: { dim: number; x: number; order: readonly number[] } | undefined): void;
  /** An axis drag ended with the dimensions in `order` (indices into `calc.dimensions`). */
  reorder(order: readonly number[], event: ComponentPointerEvent): void;
}

type Gesture =
  | { kind: 'brush'; dim: number; brush: BrushGesture }
  | {
      kind: 'axis';
      dim: number;
      startX: number;
      axisX: number;
      order: number[];
      initial: readonly number[];
      moved: boolean;
    };

/** Pointer travel (px) before a label press becomes an axis drag. */
export const DRAG_THRESHOLD = 3;

/** Where a point is: on an axis' brush strip, on its label, or neither. */
export function hitAt(
  g: ParcoordsHitGeometry,
  x: number,
  y: number,
): { axis: HitAxis; zone: 'brush' | 'label' } | undefined {
  for (let i = g.axes.length - 1; i >= 0; i--) {
    const a = g.axes[i]!;
    const l = a.label;
    if (l && x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height) {
      return { axis: a, zone: 'label' };
    }
  }
  let best: HitAxis | undefined;
  let dist = PARCOORDS.captureWidth / 2;
  for (const a of g.axes) {
    const d = Math.abs(x - a.x);
    if (d <= dist && y >= a.top - PARCOORDS.handle && y <= a.bottom + PARCOORDS.handle) {
      best = a;
      dist = d;
    }
  }
  return best ? { axis: best, zone: 'brush' } : undefined;
}

/** Pointer state machine of one parcoords view (see the module comment). */
export class ParcoordsInteraction {
  readonly #host: ParcoordsInteractionHost;
  #gesture: Gesture | undefined;

  constructor(host: ParcoordsInteractionHost) {
    this.#host = host;
  }

  /** A brush or axis drag is in progress. */
  get active(): boolean {
    return this.#gesture !== undefined;
  }

  /** Handle one pointer event; `true` when the trace took it. */
  handle(event: ComponentPointerEvent): boolean {
    if (this.#gesture) return this.#continue(event);
    const g = this.#host.geometry();
    if (!g) return false;
    const hit = hitAt(g, event.x, event.y);
    if (!hit) return false;
    switch (event.type) {
      case 'move':
        event.cursor =
          hit.zone === 'label'
            ? 'ew-resize'
            : brushCursor(hit.axis.brush, hit.axis.ranges, event.y);
        return true;
      case 'down':
        if (event.button !== 0) return true;
        if (hit.zone === 'label') {
          const order = g.axes.map((a) => a.dim);
          this.#gesture = {
            kind: 'axis',
            dim: hit.axis.dim,
            startX: event.x,
            axisX: hit.axis.x,
            order,
            initial: order,
            moved: false,
          };
        } else {
          const brush = new BrushGesture(hit.axis.brush, hit.axis.ranges, event.y);
          this.#gesture = { kind: 'brush', dim: hit.axis.dim, brush };
        }
        return true;
      case 'leave':
      case 'wheel':
        return false;
      default:
        // up / click / dblclick on an axis: nothing for the chart to do.
        return true;
    }
  }

  #continue(event: ComponentPointerEvent): boolean {
    const gesture = this.#gesture!;
    if (event.type === 'move') {
      if (gesture.kind === 'brush') {
        this.#host.previewRanges(gesture.dim, gesture.brush.move(event.y));
        event.cursor = 'crosshair';
      } else {
        const g = this.#host.geometry();
        const dx = event.x - gesture.startX;
        if (!gesture.moved && Math.abs(dx) < DRAG_THRESHOLD) return true;
        gesture.moved = true;
        const x = gesture.axisX + dx;
        if (g) gesture.order = dragOrder(g.rect, gesture.order, gesture.dim, x);
        this.#host.dragAxis({ dim: gesture.dim, x, order: gesture.order });
        event.cursor = 'ew-resize';
      }
      return true;
    }
    if (event.type === 'up' || event.type === 'leave') {
      this.#gesture = undefined;
      if (gesture.kind === 'brush') {
        const ranges = gesture.brush.end(event.y);
        this.#host.commitRanges(gesture.dim, ranges, event);
      } else if (gesture.moved) {
        this.#host.dragAxis(undefined);
        const changed = gesture.order.some((v, i) => v !== gesture.initial[i]);
        if (changed) this.#host.reorder(gesture.order, event);
      }
      return true;
    }
    return true;
  }
}
