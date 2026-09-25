/**
 * The selections component's view (plan E5.12): draws the outlines of `layout.selections` and
 * handles moving and resizing them. The component (`selections.ts`) loads this module the first
 * time a figure has selections (`shared/lazy-view.ts`); see there for the behaviour.
 */
import { toRGBA } from '@mk7s/holochart-core';
import { LinePrimitive, type RGBA, type Viewport } from '@mk7s/holochart-render';
import {
  selectionsOf,
  type ComponentDrawContext,
  type ComponentPointerEvent,
  type ComponentView,
  type FullSelection,
  type SubplotInfo,
} from '@mk7s/holochart-runtime';
import { findChart, fireAndForget } from '../shared/host.ts';
import {
  dragOutline,
  hitSelection,
  outlineEdits,
  selectionOutline,
  type SelectionDragMode,
  type SelectionOutline,
} from './geometry.ts';

/** Draw order inside a subplot viewport: above every trace. */
const OUTLINE_ORDER = 1e9;

interface Placed {
  readonly sel: FullSelection & {
    readonly line?: { color?: string; width?: number; dash?: string };
    readonly opacity?: number;
  };
  readonly subplot: SubplotInfo;
  readonly outline: SelectionOutline;
}

interface Drag {
  readonly placed: Placed;
  readonly mode: SelectionDragMode;
  readonly x0: number;
  readonly y0: number;
  dx: number;
  dy: number;
}

const CURSORS: Record<string, string> = { move: 'move' };

/** Draws the outlines of a chart's selections and handles their editing. */
export class SelectionsView implements ComponentView {
  #ctx: ComponentDrawContext;
  /** The default outline color on a background (the shapes' `contrastColor`). */
  readonly #contrast: (css: unknown) => string;
  readonly #lines = new Map<string, { prim: LinePrimitive; viewport: Viewport; key: string }>();
  #placed: Placed[] = [];
  #drag: Drag | undefined;
  /** `_index` of the active selection (clicked). */
  #active: number | undefined;

  /**
   * `contrast` is the shapes' `contrastColor`, passed in so that this module (loaded on first use)
   * shares no module with the shapes component, whose code stays in the package entry.
   */
  constructor(ctx: ComponentDrawContext, contrast: (css: unknown) => string) {
    this.#ctx = ctx;
    this.#contrast = contrast;
    this.#draw();
  }

  update(ctx: ComponentDrawContext): void {
    this.#ctx = ctx;
    this.#draw();
  }

  #draw(): void {
    const ctx = this.#ctx;
    const placed: Placed[] = [];
    for (const sel of selectionsOf(ctx.fullLayout)) {
      const sp = [...ctx.subplots.values()].find(
        (s) => s.xaxis.id === sel.xref && s.yaxis.id === sel.yref,
      );
      if (!sp) continue;
      const drag = this.#drag;
      let outline = selectionOutline(sel, sp.xaxis, sp.yaxis);
      if (!outline) continue;
      if (drag && drag.placed.outline.index === outline.index && outline.index >= 0) {
        outline = dragOutline(drag.placed.outline, sp.xaxis, sp.yaxis, drag.mode, drag.dx, drag.dy);
      }
      placed.push({ sel: sel as Placed['sel'], subplot: sp, outline });
    }
    this.#placed = placed;
    if (this.#active !== undefined && !placed.some((p) => p.outline.index === this.#active)) {
      this.#active = undefined;
    }
    const fallback = this.#contrast(ctx.fullLayout.plot_bgcolor);
    const used = new Set<string>();
    placed.forEach((p, k) => {
      const key = `${k}`;
      used.add(key);
      const active = p.outline.index === this.#active && p.outline.index >= 0;
      const line = p.sel.line ?? {};
      const color: RGBA = toRGBA(line.color ?? fallback) ?? [1, 1, 1, 1];
      const width = typeof line.width === 'number' ? line.width : 1;
      const x = Float64Array.from([...p.outline.x, p.outline.x[0] as number]);
      const y = Float64Array.from([...p.outline.y, p.outline.y[0] as number]);
      const data = {
        x,
        y,
        color,
        width: active ? width + 1 : width,
        dash: active ? 'solid' : (line.dash ?? 'dot'),
        opacity: typeof p.sel.opacity === 'number' ? p.sel.opacity : 0.7,
        cap: 'butt' as const,
        join: 'miter' as const,
      };
      const dataKey = JSON.stringify({ ...data, x: [...x], y: [...y] });
      let entry = this.#lines.get(key);
      if (entry && entry.viewport !== p.subplot.viewport) {
        if (!entry.viewport.disposed) ctx.remove(entry.prim);
        this.#lines.delete(key);
        entry = undefined;
      }
      if (!entry) {
        const prim = new LinePrimitive(ctx.primitives, {});
        prim.object.renderOrder = OUTLINE_ORDER;
        ctx.add(prim, p.subplot.viewport);
        entry = { prim, viewport: p.subplot.viewport, key: '' };
        this.#lines.set(key, entry);
      }
      if (entry.key !== dataKey) {
        entry.prim.update(data as Parameters<LinePrimitive['update']>[0]);
        entry.key = dataKey;
      }
      entry.prim.setTransform(p.subplot.transform);
    });
    for (const [key, entry] of this.#lines) {
      if (used.has(key)) continue;
      if (!entry.viewport.disposed) ctx.remove(entry.prim);
      this.#lines.delete(key);
    }
  }

  /** Selections are edited in the select drag modes only (elsewhere they are just drawn). */
  #editing(): boolean {
    const mode = this.#ctx.fullLayout.dragmode;
    return mode === 'select' || mode === 'lasso';
  }

  #hit(x: number, y: number): { placed: Placed; mode: SelectionDragMode } | undefined {
    for (let k = this.#placed.length - 1; k >= 0; k--) {
      const p = this.#placed[k] as Placed;
      if (p.outline.index < 0) continue;
      const mode = hitSelection(p.outline, p.subplot.xaxis, p.subplot.yaxis, x, y);
      if (mode) return { placed: p, mode };
    }
    return undefined;
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    const drag = this.#drag;
    if (drag) {
      if (event.type === 'move') {
        drag.dx = event.x - drag.x0;
        drag.dy = event.y - drag.y0;
        event.cursor = CURSORS[drag.mode] ?? `${drag.mode.slice(7)}-resize`;
        this.#redraw();
      } else if (event.type === 'up' || event.type === 'leave') {
        this.#drag = undefined;
        if (event.type === 'up') this.#commit(drag);
        else this.#redraw();
      }
      return event.type !== 'leave';
    }
    if (!this.#editing()) return false;
    const hit = this.#hit(event.x, event.y);
    const index = hit?.placed.outline.index;
    // Moving needs the selection active: a drag inside an inactive one starts a new selection.
    const grabs = hit !== undefined && (hit.mode !== 'move' || index === this.#active);
    switch (event.type) {
      case 'move':
        if (!grabs || !hit) return false;
        event.cursor = CURSORS[hit.mode] ?? `${hit.mode.slice(7)}-resize`;
        return true;
      case 'down':
        if (!grabs || !hit || event.button !== 0) return false;
        this.#drag = { placed: hit.placed, mode: hit.mode, x0: event.x, y0: event.y, dx: 0, dy: 0 };
        return true;
      case 'click':
        if (hit) {
          this.#setActive(index);
          return true;
        }
        if (this.#active !== undefined) this.#setActive(undefined);
        return false;
      default:
        return false;
    }
  }

  #setActive(index: number | undefined): void {
    if (index === this.#active) return;
    this.#active = index;
    this.#redraw();
  }

  #redraw(): void {
    this.#draw();
    this.#ctx.invalidate();
  }

  #commit(drag: Drag): void {
    const chart = findChart(this.#ctx);
    if (!chart || (drag.dx === 0 && drag.dy === 0)) {
      this.#redraw();
      return;
    }
    const { subplot, outline } = drag.placed;
    const moved = dragOutline(outline, subplot.xaxis, subplot.yaxis, drag.mode, drag.dx, drag.dy);
    this.#active = outline.index;
    fireAndForget(chart.relayout(outlineEdits(moved, subplot.xaxis, subplot.yaxis), { gui: true }));
  }

  dispose(): void {
    // Primitives added through the context are removed and disposed by the runtime.
    this.#lines.clear();
  }
}
