/**
 * The range slider's view (plan E5.9): the thumbnail mirrors, masks, handles and border, and the
 * drag handling. The component (`rangeslider.ts`) loads this module the first time an x axis shows
 * a range slider (`shared/lazy-view.ts`); see there for how it draws and interacts.
 */
import { toRGBA, type FullLayout } from '@mk7s/holochart-core';
import type {
  AxisInfo,
  ComponentDrawContext,
  ComponentPointerEvent,
  ComponentView,
  SubplotInfo,
  SubplotMirror,
} from '@mk7s/holochart-runtime';
import type { RGBA } from '@mk7s/holochart-render';
import type { RectItem } from '../axes/geometry.ts';
import { RectBatch } from '../shared/batches.ts';
import { findChart, fireAndForget, overlayTransform } from '../shared/host.ts';
import { oracleMeasure } from '../shared/text.ts';
import {
  axisDepth,
  centerWindow,
  dragWindow,
  offsetShift,
  RANGESLIDER_HANDLE,
  rangesliderOf,
  rangesliderYaxis,
  sliderHeight,
  sliderRange,
  sliderRect,
  sliderTarget,
  windowPixels,
  windowRange,
  type FullRangeslider,
  type SliderTarget,
} from './geometry.ts';

/** Plotly's mask colors: over the data outside the window, and outside the y range in view. */
const MASK: RGBA = [0, 0, 0, 0.4];
const MASK_OPP: RGBA = [0, 0, 0, 0.2];
/** The window's tint on dark sliders (Plotly's window is transparent). */
const WINDOW_ON_DARK: RGBA = [1, 1, 1, 0.05];
/** Overlay draw order of the slider's rects (above axis lines, below legends and hover). */
const RENDER_ORDER = 5;
/** Px the pointer must move before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

/** Relative luminance-ish brightness of a color (tinycolor's `isDark` rule, 0–1). */
function isDark(c: RGBA): boolean {
  return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 < 0.5;
}

/** Subplots drawn with x axis `id`, in draw order. */
function subplotsOn(subplots: ReadonlyMap<string, SubplotInfo>, id: string): SubplotInfo[] {
  return [...subplots.values()].filter((sp) => sp.xaxis.id === id);
}

/** Layout key of a y axis id: `'y2'` → `'yaxis2'`. */
function yName(id: string): string {
  return `yaxis${id.slice(1)}`;
}

/** Linear range of range values (`[a, b]`), or `undefined` when not both finite. */
function linearRange(
  axis: AxisInfo,
  range: readonly unknown[] | undefined,
): [number, number] | undefined {
  if (!range) return undefined;
  const a = axis.scale.r2l(range[0]);
  const b = axis.scale.r2l(range[1]);
  return Number.isFinite(a) && Number.isFinite(b) && a !== b ? [a, b] : undefined;
}

/** Everything drawn for one slider, and what pointer handling needs. */
interface Slider {
  readonly id: string;
  readonly rect: { x: number; y: number; width: number; height: number };
  /** Linear range the slider spans (in the axis' direction). */
  readonly range: [number, number];
  /** The window in slider px. */
  readonly window: [number, number];
  readonly reversed: boolean;
}

interface Drag {
  readonly id: string;
  readonly target: SliderTarget;
  /** Slider px of the press and the window then. */
  readonly p0: number;
  readonly window: [number, number];
  readonly x0: number;
  /** Axis range before the drag (restored if the gesture is cancelled). */
  readonly start: [number, number];
  moved: boolean;
  /** The window last previewed. */
  last: [number, number] | undefined;
}

/** Draws every range slider of a chart and handles their drags. */
export class RangesliderView implements ComponentView {
  #ctx: ComponentDrawContext;
  readonly #rects: RectBatch;
  readonly #mirrors = new Map<string, SubplotMirror>();
  #sliders: Slider[] = [];
  #drag: Drag | undefined;
  /** The last press (for a click on the background: center the window there). */
  #press: { id: string; target: SliderTarget; p: number } | undefined;
  #frame = 0;

  constructor(ctx: ComponentDrawContext) {
    this.#ctx = ctx;
    this.#rects = new RectBatch(ctx, ctx.primitives, ctx.overlay, RENDER_ORDER);
    this.#draw();
  }

  update(ctx: ComponentDrawContext): void {
    this.#ctx = ctx;
    this.#draw();
  }

  #draw(): void {
    const ctx = this.#ctx;
    const fullLayout = ctx.fullLayout;
    const items: RectItem[] = [];
    const borders: { color: readonly number[]; width: number }[] = [];
    const push = (r: RectItem, border?: { color: readonly number[]; width: number }): void => {
      items.push(r);
      borders.push(border ?? { color: [0, 0, 0, 0], width: 0 });
    };
    const sliders: Slider[] = [];
    const used = new Set<string>();
    let order = 0;
    for (const axis of ctx.axes.values()) {
      const rs = axis.letter === 'x' ? rangesliderOf(axis.full) : undefined;
      if (!rs) continue;
      const subplots = subplotsOn(ctx.subplots, axis.id);
      if (subplots.length === 0) continue;
      const slider = this.#layoutSlider(axis, rs, subplots, fullLayout);
      if (slider.rect.width <= 0 || slider.rect.height <= 0) continue;
      sliders.push(slider);
      const bg = toRGBA(rs.bgcolor) ?? [1, 1, 1, 1];
      // Thumbnails: one mirror per subplot, all in the slider's rect; the first paints the bg.
      subplots.forEach((sp, k) => {
        const key = `${axis.id}|${sp.id}`;
        used.add(key);
        const options = {
          rect: slider.rect,
          x: slider.range,
          y: this.#thumbnailY(sp, rs),
          background: k === 0 ? bg : null,
          order: order++,
        };
        const existing = this.#mirrors.get(key);
        if (existing && !existing.disposed) existing.set(options);
        else {
          const mirror = ctx.mirrorSubplot?.(sp.id, options);
          if (mirror) this.#mirrors.set(key, mirror);
        }
      });
      this.#decorate(slider, rs, subplots[0] as SubplotInfo, bg, push);
    }
    for (const [key, mirror] of this.#mirrors) {
      if (used.has(key)) continue;
      mirror.dispose();
      this.#mirrors.delete(key);
    }
    this.#sliders = sliders;
    this.#rects.setTransform(overlayTransform(ctx.height));
    this.#rects.set(items, borders);
  }

  /** Rect, range and window of one axis' slider. */
  #layoutSlider(
    axis: AxisInfo,
    rs: FullRangeslider,
    subplots: readonly SubplotInfo[],
    fullLayout: FullLayout,
  ): Slider {
    const ctx = this.#ctx;
    let bottom = -Infinity;
    for (const sp of subplots) bottom = Math.max(bottom, sp.rect.y + sp.rect.height);
    const depth =
      String(axis.full.side) === 'top'
        ? 0
        : axisDepth(axis, fullLayout, { width: ctx.width, height: ctx.height }, oracleMeasure);
    const rect = sliderRect({
      start: axis.start,
      end: axis.end,
      bottom,
      depth,
      height: sliderHeight(ctx.height, fullLayout.margin, rs.thickness),
      borderwidth: rs.borderwidth,
    });
    const view = axis.scale.range;
    const base = rs.autorange
      ? (ctx.autorange?.(axis.id) ?? undefined)
      : (linearRange(axis, rs.range) ?? ctx.autorange?.(axis.id));
    const range = sliderRange(base, view);
    // Like the axis range, the slider range is readable from the full layout (raw values on
    // axes with range breaks).
    const b = axis.scale.breaks;
    (rs as { range?: unknown }).range = b ? [b.toRaw(range[0]), b.toRaw(range[1])] : [...range];
    return {
      id: axis.id,
      rect,
      range,
      window: windowPixels(view, range, rect.width),
      reversed: view[0] > view[1],
    };
  }

  /** The thumbnail's y range for a subplot (`rangemode`: match, auto or fixed). */
  #thumbnailY(sp: SubplotInfo, rs: FullRangeslider): [number, number] {
    const y = rangesliderYaxis(rs, yName(sp.yaxis.id));
    const view: [number, number] = [sp.yaxis.scale.range[0], sp.yaxis.scale.range[1]];
    if (y.rangemode === 'auto') {
      const auto = this.#ctx.autorange?.(sp.yaxis.id);
      return auto ? [auto[0], auto[1]] : view;
    }
    if (y.rangemode === 'fixed') return linearRange(sp.yaxis, y.range) ?? view;
    return view;
  }

  /** Masks, handles and border of one slider. */
  #decorate(
    slider: Slider,
    rs: FullRangeslider,
    anchor: SubplotInfo,
    bg: RGBA,
    push: (r: RectItem, border?: { color: readonly number[]; width: number }) => void,
  ): void {
    const { x, y, width, height } = slider.rect;
    const [pmin, pmax] = slider.window;
    const x0 = x + pmin;
    const x1 = x + pmax;
    const dark = isDark(bg);
    if (pmin > 0) push({ x0: x, y0: y, x1: x0, y1: y + height, color: MASK });
    if (pmax < width) push({ x0: x1, y0: y, x1: x + width, y1: y + height, color: MASK });
    // A black mask barely shows on a dark slider: lift the window a little there instead.
    if (dark && pmax > pmin) push({ x0, y0: y, x1, y1: y + height, color: WINDOW_ON_DARK });
    // Outside the y range in view (Plotly: on the anchor subplot, unless the y range matches).
    const yOpts = rangesliderYaxis(rs, yName(anchor.yaxis.id));
    if (yOpts.rangemode !== 'match') {
      const ty = this.#thumbnailY(anchor, rs);
      const [v0, v1] = anchor.yaxis.scale.range;
      const py = (l: number): number => {
        const d = ty[1] - ty[0];
        const f = d === 0 ? 0 : (l - ty[0]) / d;
        return Math.min(Math.max(y + height - f * height, y), y + height);
      };
      const top = Math.min(py(v0), py(v1));
      const bot = Math.max(py(v0), py(v1));
      if (top > y) push({ x0, y0: y, x1, y1: top, color: MASK_OPP });
      if (bot < y + height) push({ x0, y0: bot, x1, y1: y + height, color: MASK_OPP });
    }
    // Handles: Plotly's white rounded bars with a dark outline; on a dark slider, the text color
    // with a background-colored outline.
    const font = toRGBA(String((this.#ctx.fullLayout.font as { color?: unknown }).color ?? ''));
    const fill: RGBA = dark ? (font ?? [0.64, 0.65, 0.71, 1]) : [1, 1, 1, 1];
    const stroke: RGBA = dark ? bg : [0.27, 0.27, 0.27, 1];
    const hy0 = y + Math.round(height / 4);
    const hy1 = hy0 + Math.round(height / 2);
    const hw = RANGESLIDER_HANDLE / 2;
    for (const px of [x0, x1]) {
      const cx = Math.round(Math.min(Math.max(px, x - hw), x + width + hw));
      push(
        { x0: cx - hw, y0: hy0, x1: cx + hw, y1: hy1, color: fill },
        { color: stroke, width: 1 },
      );
    }
    const bw = rs.borderwidth;
    const border = toRGBA(rs.bordercolor);
    if (bw > 0 && border) {
      const s = offsetShift(rs);
      push(
        {
          x0: x - bw + s,
          y0: y - bw + s,
          x1: x + width + bw - s,
          y1: y + height + bw - s,
          color: [0, 0, 0, 0],
        },
        { color: border, width: bw },
      );
    }
  }

  // ---- pointer ------------------------------------------------------------------------------------

  #hit(x: number, y: number): { slider: Slider; p: number } | undefined {
    for (const s of this.#sliders) {
      const r = s.rect;
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
        return { slider: s, p: x - r.x };
      }
    }
    return undefined;
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    const drag = this.#drag;
    if (drag) return this.#dragEvent(drag, event);
    const hit = this.#hit(event.x, event.y);
    if (!hit) return false;
    const { slider, p } = hit;
    const target = sliderTarget(p, slider.window);
    switch (event.type) {
      case 'down': {
        if (event.button !== 0) return true;
        const axis = this.#ctx.axes.get(slider.id);
        const view = axis ? axis.scale.range : slider.range;
        this.#press = { id: slider.id, target, p };
        this.#drag = {
          id: slider.id,
          target,
          p0: p,
          window: [...slider.window],
          x0: event.x,
          start: [view[0], view[1]],
          moved: false,
          last: undefined,
        };
        return true;
      }
      case 'move':
        event.cursor =
          target === 'min' || target === 'max'
            ? 'col-resize'
            : target === 'window'
              ? 'ew-resize'
              : 'pointer';
        return true;
      case 'click': {
        const press = this.#press;
        this.#press = undefined;
        if (press?.id === slider.id && press.target === 'background') {
          this.#commit(slider, centerWindow(press.p, slider.window, slider.rect.width));
        }
        return true;
      }
      case 'wheel':
        return false;
      default:
        // `dblclick` and the rest: the slider's own, never the chart's (no axis reset).
        return true;
    }
  }

  #dragEvent(drag: Drag, event: ComponentPointerEvent): boolean {
    const slider = this.#sliders.find((s) => s.id === drag.id);
    if (event.type === 'move') {
      if (!slider) return true;
      const delta = event.x - drag.x0;
      if (!drag.moved && Math.abs(delta) <= DRAG_THRESHOLD) return true;
      drag.moved = true;
      const next = dragWindow(drag.target, drag.window, drag.p0, delta, slider.rect.width);
      if (next) {
        drag.last = next;
        this.#schedulePreview();
      }
      return true;
    }
    if (event.type === 'up') {
      this.#drag = undefined;
      this.#cancelFrame();
      if (drag.moved) this.#press = undefined;
      if (slider && drag.last) this.#commit(slider, drag.last);
      return true;
    }
    if (event.type === 'leave') {
      // The gesture was cancelled: back to the range it started from.
      this.#drag = undefined;
      this.#cancelFrame();
      if (drag.last) findChart(this.#ctx)?.previewRanges({ [drag.id]: drag.start });
      return false;
    }
    return true;
  }

  #schedulePreview(): void {
    if (this.#frame) return;
    const run = (): void => {
      this.#frame = 0;
      const drag = this.#drag;
      const slider = drag && this.#sliders.find((s) => s.id === drag.id);
      if (!drag?.last || !slider) return;
      findChart(this.#ctx)?.previewRanges({
        [drag.id]: windowRange(drag.last, slider.range, slider.rect.width, slider.reversed),
      });
    };
    if (typeof requestAnimationFrame === 'function') this.#frame = requestAnimationFrame(run);
    else run();
  }

  #cancelFrame(): void {
    if (this.#frame && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  #commit(slider: Slider, window: readonly [number, number]): void {
    const chart = findChart(this.#ctx);
    if (!chart) return;
    const range = windowRange(window, slider.range, slider.rect.width, slider.reversed);
    fireAndForget(chart.commitRanges({ [slider.id]: range }));
  }

  dispose(): void {
    this.#cancelFrame();
    for (const m of this.#mirrors.values()) m.dispose();
    this.#mirrors.clear();
    // The rect batch was added through the context: the runtime removes and disposes it.
  }
}
