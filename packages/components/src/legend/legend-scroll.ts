/**
 * Scrolling legends (plan E5.2): a legend whose content is taller than its `maxheight` keeps that
 * height, and its content (items and title, as in plotly.js) scrolls inside the box.
 *
 * Loaded by the legend view the first time a legend overflows, like the keyboard access.
 *
 * ## Drawing
 *
 * The content is drawn into a viewport of its own, scissored to the inside of the legend's border
 * and drawn after every subplot and the upper shape and image layers (but before the overlay):
 * scrolling only moves that viewport's transform, nothing is re-uploaded. The background fills the
 * viewport under the items; the border and the scrollbar (plotly.js's: a 6 px bar in `#808BA4`,
 * 4 px from the box's right edge, at least 20 px tall) are drawn in the overlay above them.
 *
 * ## Interaction (not in static plots, which show the top of the content)
 *
 * - the wheel over the legend scrolls it (never zooming the plot beneath); once the content hits an
 *   end, the page scrolls instead;
 * - dragging the scrollbar moves it with the pointer (mouse, pen or touch);
 * - a finger dragged over the items scrolls the content along with it (the canvas's `touchmove`
 *   is cancelled meanwhile, so a `touch-action: pan-y` chart doesn't scroll the page instead);
 * - {@link LegendScroller.reveal} scrolls an item into view (the legend's keyboard focus).
 *
 * The scroll position belongs to the legend's view: it survives redraws (clamped to the new
 * content) and resets when the content fits again.
 */
import type { DataTransform, RGBA, Viewport, ViewportRect } from '@mk7s/holochart-render';
import type { ComponentDrawContext, ComponentPointerEvent } from '@mk7s/holochart-runtime';
import type { RectItem } from '../axes/geometry.ts';
import { RectBatch } from '../shared/batches.ts';
import { findChart, overlayTransform, rectTransform } from '../shared/host.ts';
import { rgba } from '../shared/text.ts';

/** plotly.js's scrollbar: width, gap to the box edge, minimum height (px) and color. */
export const SCROLLBAR = { width: 6, margin: 4, minHeight: 20, color: '#808BA4' } as const;

/** Draw order of the content viewport: after the upper shape and image layers (`layers.ts`). */
const VIEWPORT_ORDER = 1e15 + 10;
/** `renderOrder`s: the background under the items (viewport), the frame above them (overlay). */
const BG_ORDER = 9;
const FRAME_ORDER = 14;
const NO_BORDER = { color: [0, 0, 0, 0] as RGBA, width: 0 };

/** Scroll metrics of a box `view` px tall showing `content` px (plotly.js `legend/draw.js`). */
export interface ScrollGeometry {
  /** Largest offset: how far the content can move up, px. */
  readonly max: number;
  readonly barHeight: number;
  /** Largest scrollbar offset from its top position, px. */
  readonly barMax: number;
  /** Scrollbar px per content px. */
  readonly ratio: number;
}

/** {@link ScrollGeometry} for a box `view` px tall and content `content` px tall. */
export function scrollGeometry(view: number, content: number): ScrollGeometry {
  const max = Math.max(0, content - view);
  const barHeight = Math.max(SCROLLBAR.minHeight, content > 0 ? (view * view) / content : view);
  const barMax = Math.max(0, view - barHeight - 2 * SCROLLBAR.margin);
  return { max, barHeight, barMax, ratio: max > 0 ? barMax / max : 0 };
}

/** An offset clamped to `[0, max]` (`NaN` → 0). */
export function clampScroll(offset: number, g: Pick<ScrollGeometry, 'max'>): number {
  return offset > 0 ? Math.min(offset, g.max) : 0;
}

/** Wheel delta in px (lines and pages scaled like the runtime's wheel zoom). */
export function wheelDelta(e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
  return e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
}

/**
 * The offset that brings `[top, top + height]` (content px, unscrolled) into the visible band
 * `[viewTop, viewBottom]`, moving as little as possible (the start wins when it doesn't fit).
 */
export function revealOffset(
  offset: number,
  top: number,
  height: number,
  viewTop: number,
  viewBottom: number,
): number {
  if (top + height - offset > viewBottom) offset = top + height - viewBottom;
  if (top - offset < viewTop) offset = top - viewTop;
  return offset;
}

/** The legend box, container px. */
export interface ScrollBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** What {@link LegendScroller.set} draws around the content. */
export interface ScrollFrame {
  readonly box: ScrollBox;
  /** Height of the whole content, px. */
  readonly contentHeight: number;
  /** The background rect (the box) and its border. */
  readonly background: RectItem;
  readonly border: { readonly color: RGBA; readonly width: number };
  /** Scrollbar and scroll input (not in static plots). */
  readonly interactive: boolean;
}

/** The scrolling part of one legend (see the module comment). */
export class LegendScroller {
  /** How far the content moved up, px. */
  offset = 0;
  #ctx: ComponentDrawContext;
  readonly #onScroll: () => void;
  readonly #frame: RectBatch;
  #bg: RectBatch | undefined;
  #viewport: Viewport | undefined;
  #state: ScrollFrame | undefined;
  #geometry: ScrollGeometry = scrollGeometry(0, 0);
  /** A scrollbar drag or finger drag in progress (start position and offset). */
  #drag: { y0: number; offset0: number; bar: boolean } | undefined;
  /** The canvas whose `touchmove` is cancelled while a finger scrolls the legend. */
  #canvas: HTMLCanvasElement | undefined;

  /** `onScroll` runs after the offset changed (redraw the content with {@link transform}). */
  constructor(ctx: ComponentDrawContext, onScroll: () => void) {
    this.#ctx = ctx;
    this.#onScroll = onScroll;
    this.#frame = new RectBatch(ctx, ctx.primitives, ctx.overlay, FRAME_ORDER);
  }

  /** Where the content draws: the scissored viewport (the overlay without a chart, in tests). */
  get viewport(): Viewport {
    return this.#viewport ?? this.#ctx.overlay;
  }

  /** Lay out for a new frame; the offset is kept, clamped to the new content. */
  set(ctx: ComponentDrawContext, frame: ScrollFrame): void {
    this.#ctx = ctx;
    this.#state = frame;
    const { box, border } = frame;
    this.#geometry = scrollGeometry(box.height, frame.contentHeight);
    this.offset = frame.interactive ? clampScroll(this.offset, this.#geometry) : 0;
    const rect: ViewportRect = { x: box.left, y: box.top, width: box.width, height: box.height };
    const bw = Math.min(border.width, box.width / 2, box.height / 2);
    const clip: ViewportRect = {
      x: box.left + bw,
      y: box.top + bw,
      width: box.width - 2 * bw,
      height: box.height - 2 * bw,
    };
    if (this.#viewport?.disposed) this.#viewport = undefined;
    if (this.#viewport) {
      this.#viewport.setRect(rect);
      this.#viewport.setClip(clip);
    } else {
      const root = rootOf(ctx);
      if (root) {
        this.#viewport = root.addViewport({
          kind: '2d',
          rect,
          clip,
          order: VIEWPORT_ORDER,
          name: 'legend-scroll',
        });
      }
    }
    this.#bg ??= new RectBatch(ctx, ctx.primitives, this.viewport, BG_ORDER);
    this.#bg.setTransform(this.#base());
    this.#bg.set([frame.background], [NO_BORDER]);
    this.#frame.setTransform(overlayTransform(ctx.height));
    this.#drawFrame();
    if (!this.#canvas && frame.interactive) {
      this.#canvas = rootOf(ctx)?.canvas;
      this.#canvas?.addEventListener('touchmove', this.#onTouchMove, { passive: false });
    }
  }

  /** Keep the browser from panning the page while a finger scrolls the legend. */
  readonly #onTouchMove = (e: TouchEvent): void => {
    if (this.#drag && e.cancelable && e.touches.length === 1) e.preventDefault();
  };

  /** Container px → world px of {@link viewport} for the content, at the current offset. */
  transform(): DataTransform {
    const t = this.#base();
    return { ...t, offsetY: t.offsetY + this.offset };
  }

  #base(): DataTransform {
    const box = this.#state?.box;
    return this.#viewport && box
      ? rectTransform({ x: box.left, y: box.top, width: box.width, height: box.height })
      : overlayTransform(this.#ctx.height);
  }

  /** The frame in the overlay: the border (over the content) and the scrollbar. */
  #drawFrame(): void {
    const s = this.#state;
    if (!s) return;
    const { box, border } = s;
    const rects: RectItem[] = [
      {
        x0: box.left,
        y0: box.top,
        x1: box.left + box.width,
        y1: box.top + box.height,
        color: [0, 0, 0, 0],
      },
    ];
    const borders = [{ color: border.color, width: border.width }];
    if (s.interactive) {
      const bar = this.#bar();
      rects.push({ ...bar, color: rgba(SCROLLBAR.color) });
      borders.push(NO_BORDER);
    }
    this.#frame.set(rects, borders);
  }

  /** The scrollbar rect, container px. */
  #bar(): { x0: number; y0: number; x1: number; y1: number } {
    const s = this.#state as ScrollFrame;
    const g = this.#geometry;
    const x1 = s.box.left + s.box.width - s.border.width - SCROLLBAR.margin;
    const y0 = s.box.top + SCROLLBAR.margin + this.offset * g.ratio;
    return { x0: x1 - SCROLLBAR.width, y0, x1, y1: y0 + g.barHeight };
  }

  /** Scroll to `offset` (clamped); `true` when it moved. */
  scrollTo(offset: number): boolean {
    const next = clampScroll(offset, this.#geometry);
    if (next === this.offset || !this.#state?.interactive) return false;
    this.offset = next;
    this.#drawFrame();
    this.#onScroll();
    return true;
  }

  /** Scroll so the content band `[top, top + height]` (container px, unscrolled) is visible. */
  reveal(top: number, height: number): void {
    const s = this.#state;
    if (!s) return;
    const bw = s.border.width;
    const viewTop = s.box.top + bw;
    this.scrollTo(revealOffset(this.offset, top, height, viewTop, s.box.top + s.box.height - bw));
  }

  /**
   * Scroll input (see the module comment): `true` when the event was consumed. A finger's `down`
   * over the items starts tracking but returns `false`, so a tap still clicks the item.
   */
  handle(event: ComponentPointerEvent): boolean {
    const s = this.#state;
    if (!s?.interactive) return false;
    const drag = this.#drag;
    if (drag && (event.type === 'move' || event.type === 'up')) {
      const dy = event.y - drag.y0;
      const ratio = this.#geometry.ratio;
      this.scrollTo(drag.bar ? drag.offset0 + (ratio > 0 ? dy / ratio : 0) : drag.offset0 - dy);
      if (event.type === 'up') this.#drag = undefined;
      return drag.bar || event.type === 'move';
    }
    const { box } = s;
    const inside =
      event.x >= box.left &&
      event.x <= box.left + box.width &&
      event.y >= box.top &&
      event.y <= box.top + box.height;
    if (event.type === 'leave' || event.type === 'down') this.#drag = undefined;
    if (!inside) return false;
    if (event.type === 'wheel') {
      const native = event.native as WheelEvent | undefined;
      if (native && this.scrollTo(this.offset + wheelDelta(native))) native.preventDefault();
      return true;
    }
    if (event.type === 'down' && event.button === 0 && !event.ctrlKey) {
      const bar = this.#bar();
      const onBar = event.x >= bar.x0 - 2 && event.x <= bar.x1 + 2;
      const touch = (event.native as PointerEvent | undefined)?.pointerType === 'touch';
      if (onBar && event.y >= bar.y0 && event.y <= bar.y1) {
        this.#drag = { y0: event.y, offset0: this.offset, bar: true };
        return true;
      }
      if (touch) this.#drag = { y0: event.y, offset0: this.offset, bar: false };
      return onBar;
    }
    return false;
  }

  /** Remove the frame, the background and the viewport (after the content's primitives). */
  dispose(): void {
    this.#canvas?.removeEventListener('touchmove', this.#onTouchMove);
    this.#frame.dispose();
    this.#bg?.dispose();
    const vp = this.#viewport;
    this.#viewport = undefined;
    if (vp && !vp.disposed) rootOf(this.#ctx)?.removeViewport(vp);
  }
}

/** The chart's render root, if the chart is alive. */
function rootOf(ctx: ComponentDrawContext) {
  try {
    return findChart(ctx)?.three.root;
  } catch {
    return undefined;
  }
}
