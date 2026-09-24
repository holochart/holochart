/**
 * Pointer handling of a `table` (plan E9.13), after plotly.js' `traces/table/plot.js`: the wheel
 * and a drag on the cells scroll the rows, the scrollbar can be dragged or clicked, and dragging a
 * header cell moves its column (the others make room as its center passes theirs), which restyles
 * `columnorder` on release.
 *
 * Tables take every pointer event over their area (and the scrollbar next to it) before the chart
 * does, so a wheel or drag over a table never zooms or pans the plot. At the ends of the scroll
 * range a wheel event is still taken but not `preventDefault`ed, so the page scrolls on (Plotly).
 *
 * The state machine is pure: it works on the geometry the view last drew and calls back into it
 * ({@link TableInteractionHost}), so it is unit tested without a renderer.
 */
import type { ComponentPointerEvent } from '@mk7s/holochart-runtime';

/** Plotly's `overdrag`: how far (px) a dragged column may leave the table on either side. */
export const OVERDRAG = 45;
/** Plotly's `uplift`: a dragged column is lifted this many px. */
export const UPLIFT = 5;
/** Plotly's scrollbar constants: glyph width, gap to the table and the grab zone width. */
export const SCROLLBAR_WIDTH = 8;
export const SCROLLBAR_OFFSET = 5;
export const SCROLLBAR_CAPTURE_WIDTH = 18;
/** Shortest scrollbar glyph (Plotly: golden ratio × width). */
const MIN_BAR_LENGTH = 1.618 * SCROLLBAR_WIDTH;
/** Pointer travel (px) before a header press becomes a column drag. */
const DRAG_THRESHOLD = 3;

/** Scrollbar state (Plotly's `renderScrollbarKit` / `scrollbarState`). */
export interface ScrollbarState {
  /** Height of all rows. */
  readonly total: number;
  /** Height of the body (below the header). */
  readonly view: number;
  /** Glyph length and the room it can move in, px. */
  readonly barLength: number;
  readonly barWiggleRoom: number;
  /** Scrollable distance: `max(0, total − view)`. */
  readonly wiggleRoom: number;
  /** Glyph top below the header, px. */
  readonly topY: number;
  /** Scroll px per px of glyph movement. */
  readonly dragMultiplier: number;
}

/** Plotly's scrollbar math for `total` px of rows in a `view` px body scrolled to `scrollY`. */
export function scrollbarState(total: number, view: number, scrollY: number): ScrollbarState {
  const visible = Math.min(total, view);
  const ratio = total > 0 ? visible / total : 1;
  const barLength = Math.max(ratio * visible, MIN_BAR_LENGTH);
  const barWiggleRoom = visible - barLength;
  const wiggleRoom = Math.max(0, total - view);
  const topY = barWiggleRoom > 0 && wiggleRoom > 0 ? (scrollY / wiggleRoom) * barWiggleRoom : 0;
  return {
    total,
    view,
    barLength,
    barWiggleRoom,
    wiggleRoom,
    topY,
    dragMultiplier: barWiggleRoom > 0 ? wiggleRoom / barWiggleRoom : 0,
  };
}

/** One column as laid out, in display order. */
export interface HitColumn {
  /** Data index. */
  readonly index: number;
  /** Left edge relative to the table's left edge, and width, px. */
  readonly x: number;
  readonly width: number;
}

/** What the interaction needs of the drawn table (container px, top-left origin). */
export interface TableHitGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly headerHeight: number;
  /** Columns in display order. */
  readonly columns: readonly HitColumn[];
  readonly scrollY: number;
  readonly scrollbar: ScrollbarState;
}

/** Callbacks into the table view. */
export interface TableInteractionHost {
  /** The geometry last drawn, or `undefined` when the table is not drawn. */
  geometry(): TableHitGeometry | undefined;
  /** Scroll the body to `y` (clamped). Returns whether the position changed. */
  scrollTo(y: number): boolean;
  /**
   * Show the drag of column `index` with its left edge at `x` (relative to the table, clamped) and
   * the columns in `order` (data indices, left to right); `undefined` ends the drag display.
   */
  dragColumn(drag: { index: number; x: number; order: readonly number[] } | undefined): void;
  /** A column drag ended with the columns in `order` (data indices, left to right). */
  reorder(order: readonly number[], event: ComponentPointerEvent): void;
  /** Pointer activity over the table: show the scrollbar for a while (Plotly). */
  activity(): void;
}

type Gesture =
  | { kind: 'rows'; startY: number; startScroll: number }
  | { kind: 'bar'; startY: number; startScroll: number; multiplier: number }
  | {
      kind: 'column';
      index: number;
      startX: number;
      columnX: number;
      width: number;
      order: number[];
      initial: readonly number[];
      moved: boolean;
    };

/** Pixel size of one wheel `deltaMode` unit (pixels, lines, pages), as the chart's wheel zoom. */
function wheelDelta(e: WheelEvent): number {
  return e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
}

/** Where a point is, relative to a table. */
export type TableZone = 'header' | 'cells' | 'scrollbar' | undefined;

/** The zone of `(px, py)` (container px) in `g`. The scrollbar zone counts only when it can scroll. */
export function zoneAt(g: TableHitGeometry, px: number, py: number): TableZone {
  const bodyTop = g.y + g.headerHeight;
  if (g.scrollbar.barWiggleRoom > 0 && g.scrollbar.wiggleRoom > 0) {
    const cx = g.x + g.width + SCROLLBAR_OFFSET + SCROLLBAR_WIDTH / 2;
    if (
      Math.abs(px - cx) <= SCROLLBAR_CAPTURE_WIDTH / 2 &&
      py >= bodyTop &&
      py <= bodyTop + g.scrollbar.view
    ) {
      return 'scrollbar';
    }
  }
  if (px < g.x || px > g.x + g.width || py < g.y || py > g.y + g.height) return undefined;
  return py < bodyTop ? 'header' : 'cells';
}

/**
 * Plotly's column drag: the dragged column's center (at `x + width / 2`, unclamped) is sorted
 * among the other columns' centers at their current positions, which gives the new order.
 */
export function dragOrder(
  columns: readonly HitColumn[],
  current: readonly number[],
  index: number,
  x: number,
): number[] {
  const widths = new Map(columns.map((c) => [c.index, c.width]));
  const center = new Map<number, number>();
  let left = 0;
  for (const i of current) {
    const w = widths.get(i) ?? 0;
    center.set(i, i === index ? x + w / 2 : left + w / 2);
    left += w;
  }
  return [...current].sort((a, b) => center.get(a)! - center.get(b)! || 0);
}

/** Pointer state machine of one table view (see the module comment). */
export class TableInteraction {
  readonly #host: TableInteractionHost;
  #gesture: Gesture | undefined;

  constructor(host: TableInteractionHost) {
    this.#host = host;
  }

  /** A gesture (scroll drag, scrollbar drag, column drag) is in progress. */
  get active(): boolean {
    return this.#gesture !== undefined;
  }

  /** Handle one pointer event; `true` when the table took it. */
  handle(event: ComponentPointerEvent): boolean {
    const g = this.#host.geometry();
    if (this.#gesture) return this.#continue(event, g);
    if (!g) return false;
    const zone = zoneAt(g, event.x, event.y);
    if (!zone) return false;
    switch (event.type) {
      case 'wheel': {
        const native = event.native;
        const delta = isWheelLike(native) ? wheelDelta(native) : 0;
        this.#host.activity();
        if (delta !== 0 && this.#host.scrollTo(g.scrollY + delta)) native?.preventDefault();
        return true;
      }
      case 'down':
        this.#start(event, g, zone);
        return true;
      case 'move':
        event.cursor =
          zone === 'header'
            ? 'ew-resize'
            : zone === 'cells' && g.scrollbar.wiggleRoom > 0
              ? 'ns-resize'
              : 'default';
        this.#host.activity();
        return true;
      case 'leave':
        return false;
      default:
        // up / click / dblclick over the table: nothing for the chart to do (no autoscale).
        return true;
    }
  }

  #start(event: ComponentPointerEvent, g: TableHitGeometry, zone: TableZone): void {
    if (event.button !== 0) return;
    if (zone === 'scrollbar') {
      const s = g.scrollbar;
      const local = event.y - (g.y + g.headerHeight);
      if (local < s.topY || local > s.topY + s.barLength) {
        // Plotly: a press beside the glyph centers it on the pointer.
        const target = ((local - s.barLength / 2) / s.view) * s.total;
        this.#host.scrollTo(Math.max(0, Math.min(s.total, target)));
      }
      const now = this.#host.geometry() ?? g;
      this.#gesture = {
        kind: 'bar',
        startY: event.y,
        startScroll: now.scrollY,
        multiplier: s.dragMultiplier,
      };
      this.#host.activity();
      return;
    }
    if (zone === 'header') {
      const localX = event.x - g.x;
      const column = g.columns.find((c) => localX >= c.x && localX <= c.x + c.width);
      if (!column) return;
      const order = g.columns.map((c) => c.index);
      this.#gesture = {
        kind: 'column',
        index: column.index,
        startX: event.x,
        columnX: column.x,
        width: column.width,
        order,
        initial: order,
        moved: false,
      };
      return;
    }
    this.#gesture = { kind: 'rows', startY: event.y, startScroll: g.scrollY };
  }

  #continue(event: ComponentPointerEvent, g: TableHitGeometry | undefined): boolean {
    const gesture = this.#gesture!;
    if (event.type === 'wheel') return true;
    if (event.type === 'move') {
      if (gesture.kind === 'rows') {
        // Plotly's `makeDragRow(…, -1)`: the rows follow the pointer.
        this.#host.scrollTo(gesture.startScroll - (event.y - gesture.startY));
        this.#host.activity();
      } else if (gesture.kind === 'bar') {
        this.#host.scrollTo(gesture.startScroll + gesture.multiplier * (event.y - gesture.startY));
        this.#host.activity();
      } else if (g) {
        const dx = event.x - gesture.startX;
        if (!gesture.moved && Math.abs(dx) < DRAG_THRESHOLD) return true;
        gesture.moved = true;
        const raw = gesture.columnX + dx;
        gesture.order = dragOrder(g.columns, gesture.order, gesture.index, raw);
        const x = Math.max(-OVERDRAG, Math.min(g.width + OVERDRAG - gesture.width, raw));
        this.#host.dragColumn({ index: gesture.index, x, order: gesture.order });
        event.cursor = 'ew-resize';
      }
      return true;
    }
    if (event.type === 'up' || event.type === 'leave') {
      this.#gesture = undefined;
      if (gesture.kind === 'column' && gesture.moved) {
        this.#host.dragColumn(undefined);
        const changed = gesture.order.some((v, i) => v !== gesture.initial[i]);
        if (changed) this.#host.reorder(gesture.order, event);
      }
      return true;
    }
    return true;
  }
}

function isWheelLike(e: Event | undefined): e is WheelEvent {
  return (
    e !== undefined &&
    typeof (e as { deltaY?: unknown }).deltaY === 'number' &&
    typeof (e as { deltaMode?: unknown }).deltaMode === 'number'
  );
}
