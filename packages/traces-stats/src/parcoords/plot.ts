/**
 * `parcoords` renderer (plan E10.10, E22.1). A domain trace: it draws into the overlay viewport,
 * whose world units are container px with a bottom-left origin (container `(x, y)` is world
 * `(x, height − y)`).
 *
 * - **Lines:** every row in ONE {@link LinePrimitive}, in axis space (see `lines.ts`) mapped to
 *   pixels by a transform, so a resize is uniforms only; a brush or a colorscale restyle rewrites
 *   the per-vertex colors only; the geometry is rebuilt when the data or the axis order changes.
 * - **Axes:** axis lines and ticks as instanced rects, brush bars (magenta over a paper-colored
 *   shadow) as a second rect set, and one batched text primitive for tick, range and axis labels.
 *
 * Pointer handling (brushing, dragging axis labels) is `interaction.ts`; brushes restyle
 * `dimensions[i].constraintrange` and axis drops restyle `dimensions` in the new order, both as
 * user edits (`uirevision` keeps them).
 */
import { richTextLabel, type FullTrace } from '@mk7s/holochart-core';
import {
  createRectPrimitive,
  createTextPrimitive,
  IDENTITY_TRANSFORM,
  LinePrimitive,
  measureText,
  type RectData,
  type RectPrimitive,
  type RGBA,
  type TextLabel,
  type TextPrimitive,
  type TextRunLines,
} from '@mk7s/holochart-render';
import type {
  ComponentPointerEvent,
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import type { ParcoordsCalc } from './calc.ts';
import {
  chartOf,
  colorLUT,
  inkColor,
  lineColorMapping,
  rgba,
  textFontOf,
  traceRect,
  type LineColorMapping,
} from './common.ts';
import { ParcoordsInteraction, type HitAxis, type ParcoordsHitGeometry } from './interaction.ts';
import {
  axisSpacing,
  axisTicks,
  dimensionContainer,
  labelPlacement,
  layoutAxes,
  PARCOORDS,
  rangeLabels,
  unitToValue,
  unitToY,
  valueToUnit,
  yToUnit,
  type Rect,
} from './layout.ts';
import { lineColors, lineGeometry, selectionMask, unselectedColor } from './lines.ts';
import { parseRanges, storedRanges, type Range } from './ranges.ts';

/** Render orders in the overlay, below figure components: lines, axes, brush bars, labels. */
const ORDER = { lines: -9.5, axes: -9.25, bars: -9, text: -8.75 } as const;
const orderOf = (layer: number, index: number): number => layer + Math.min(index, 999) * 1e-4;

/** Rows × axes up to which the lines follow a dragged axis live (beyond: on drop). */
const LIVE_DRAG_VERTICES = 400_000;
/** Plotly's brush bar color. */
const BAR: RGBA = [1, 0, 1, 1];

/** Rect instances collected for one rect primitive. */
class Rects {
  readonly x0: number[] = [];
  readonly y0: number[] = [];
  readonly x1: number[] = [];
  readonly y1: number[] = [];
  readonly fill: number[] = [];

  /** A rect in container px (flipped to world with `h`). */
  push(x0: number, y0: number, x1: number, y1: number, color: RGBA, h: number): void {
    this.x0.push(x0);
    this.x1.push(x1);
    this.y0.push(h - y1);
    this.y1.push(h - y0);
    this.fill.push(color[0], color[1], color[2], color[3]);
  }

  data(): Partial<RectData> {
    return {
      x0: Float64Array.from(this.x0),
      y0: Float64Array.from(this.y0),
      x1: Float64Array.from(this.x1),
      y1: Float64Array.from(this.y1),
      fill: Float32Array.from(this.fill),
      snap: true,
    };
  }
}

/** Axis-aligned box of a label drawn at `(x, y)` (container px), rotated by `angle` about it. */
function labelBox(label: TextLabel, width: number, height: number, ascent: number): Rect {
  const ax = label.anchorX === 'left' ? 0 : label.anchorX === 'right' ? -width : -width / 2;
  const corners: [number, number][] = [
    [ax, -ascent],
    [ax + width, -ascent],
    [ax, height - ascent],
    [ax + width, height - ascent],
  ];
  const a = ((label.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [cx, cy] of corners) {
    const x = label.x + cx * cos - cy * sin;
    const y = label.y + cx * sin + cy * cos;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x: x0 - 2, y: y0 - 2, width: x1 - x0 + 4, height: y1 - y0 + 4 };
}

/** The label of `text` in `font`: rich (runs) when it has markup, else plain. */
function textLabel(
  text: string,
  font: ReturnType<typeof textFontOf>,
  props: Omit<TextLabel, 'text'>,
): TextLabel {
  const rich = richTextLabel(text, font.font, { newlines: 'break' });
  return {
    ...props,
    text: rich?.text ?? text,
    font: rich?.font ?? font.font,
    color: font.color,
    ...(rich?.runs ? { runs: rich.runs as unknown as TextRunLines } : {}),
  };
}

class ParcoordsView implements TraceView<ParcoordsCalc> {
  #ctx: TracePlotContext<ParcoordsCalc> | undefined;
  #calc: ParcoordsCalc | undefined;
  #rect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  /** Display order (indices into `calc.dimensions`) until the restyle of a drop arrives. */
  #order: readonly number[] = [];
  /** Order the line geometry was built for. */
  #builtOrder = '';
  #drag: { dim: number; x: number; order: readonly number[] } | undefined;
  /** Ranges shown while brushing, and ranges committed until their restyle arrives. */
  readonly #preview = new Map<number, readonly Range[]>();
  readonly #pending = new Map<number, readonly Range[]>();
  #colors: Float32Array | undefined;
  /** A recolor waiting for the next animation frame (brush moves come faster than frames). */
  #recolorFrame: number | undefined;
  #lut: { scale: unknown; lut: Float32Array } | undefined;
  #geometry: ParcoordsHitGeometry | undefined;

  #lines: LinePrimitive | undefined;
  #axes: RectPrimitive | undefined;
  #bars: RectPrimitive | undefined;
  #text: TextPrimitive | undefined;

  readonly #interaction = new ParcoordsInteraction({
    geometry: () => this.#geometry,
    previewRanges: (dim, ranges) => {
      if (ranges) this.#preview.set(dim, ranges);
      else this.#preview.delete(dim);
      this.#drawBars();
      this.#scheduleRecolor();
    },
    commitRanges: (dim, ranges, event) => this.#commit(dim, ranges, event),
    dragAxis: (drag) => {
      this.#drag = drag;
      this.#layout(true);
    },
    reorder: (order, event) => this.#reorder(order, event),
  });

  constructor(ctx: TracePlotContext<ParcoordsCalc>) {
    this.update(ctx, { calc: true, plot: true, style: true, transform: true });
  }

  update(ctx: TracePlotContext<ParcoordsCalc>, plan: TraceUpdatePlan): void {
    this.#ctx = ctx;
    this.#rect = traceRect(ctx);
    if (ctx.calc !== this.#calc) {
      this.#calc = ctx.calc;
      this.#order = ctx.calc.dimensions.map((_, i) => i);
      this.#builtOrder = '';
      this.#drag = undefined;
      this.#preview.clear();
    }
    // Every update carries the trace's own constraint ranges (a committed brush has arrived).
    this.#pending.clear();
    const styleOnly = !plan.calc && !plan.plot && !plan.transform;
    if (styleOnly) {
      this.#recolor();
      this.#drawBars();
      this.#drawAxes();
    } else this.#layout(false);
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    return this.#interaction.handle(event);
  }

  // ---- state ------------------------------------------------------------------------------------

  /** The displayed ranges of dimension `d` (index into `calc.dimensions`). */
  #rangesOf(d: number): readonly Range[] {
    const preview = this.#preview.get(d) ?? this.#pending.get(d);
    if (preview) return preview;
    const ctx = this.#ctx!;
    const dim = ctx.calc.dimensions[d]!;
    return parseRanges(dimensionContainer(ctx.trace, dim)['constraintrange']);
  }

  #commit(d: number, ranges: readonly Range[], event: ComponentPointerEvent): void {
    const ctx = this.#ctx;
    if (!ctx) return;
    this.#preview.delete(d);
    this.#pending.set(d, ranges);
    this.#recolor();
    this.#drawBars();
    const stored = storedRanges(ranges);
    const path = `dimensions[${ctx.calc.dimensions[d]!.index}].constraintrange`;
    chartOf(event)
      ?.restyle({ [path]: stored ? [stored] : null }, [ctx.index], { gui: true })
      .catch(() => undefined);
  }

  /** An axis drop: show the new order and restyle `dimensions` in it (hidden ones stay put). */
  #reorder(order: readonly number[], event: ComponentPointerEvent): void {
    const ctx = this.#ctx;
    if (!ctx) return;
    this.#order = order;
    this.#layout(false);
    const input = (ctx.trace._input as { dimensions?: unknown }).dimensions;
    if (!Array.isArray(input)) return;
    const dims = ctx.calc.dimensions;
    const next = input.slice();
    dims.forEach((dim, slot) => (next[dim.index] = input[dims[order[slot]!]!.index]));
    chartOf(event)
      ?.restyle({ dimensions: [next] }, [ctx.index], { gui: true })
      .catch(() => undefined);
  }

  // ---- drawing ----------------------------------------------------------------------------------

  /** Lay out and draw everything but the colors; `live` is a drag frame. */
  #layout(live: boolean): void {
    const ctx = this.#ctx;
    const calc = this.#calc;
    if (!ctx || !calc) return;
    const order = this.#drag?.order ?? this.#order;
    const rect = this.#rect;
    const spacing = axisSpacing(rect, order.length);
    const axes = layoutAxes(calc, rect, order, this.#drag);
    const key = `${order.join(',')}|${this.#drag && live ? this.#drag.x : ''}`;
    const liveLines = calc.length * order.length <= LIVE_DRAG_VERTICES;
    if (key !== this.#builtOrder && (!live || liveLines)) {
      this.#builtOrder = key;
      const slots = axes.map((a) => (spacing > 0 ? (a.x - rect.x) / spacing : 0));
      const geometry = lineGeometry(calc, order, slots);
      this.#colors = undefined;
      const data = {
        ...geometry,
        color: this.#lineColors(order.length),
        width: 1,
        join: 'bevel' as const,
      };
      if (!this.#lines) {
        this.#lines = new LinePrimitive(ctx.primitives, data);
        ctx.add(this.#lines);
      } else this.#lines.update(data);
      this.#lines.object.renderOrder = orderOf(ORDER.lines, ctx.index);
    }
    if (this.#lines) {
      const h = ctx.viewport.size.height;
      this.#lines.setTransform({
        scaleX: spacing,
        offsetX: rect.x,
        scaleY: rect.height - 2 * PARCOORDS.pad,
        offsetY: h - (rect.y + rect.height) + PARCOORDS.pad,
      });
    }
    this.#drawAxes();
    this.#drawBars();
    ctx.invalidate();
  }

  /** Colors of the lines as the geometry is built (`dims` vertices per line). */
  #lineColors(dims: number): Float32Array {
    const ctx = this.#ctx!;
    const calc = ctx.calc;
    const trace = ctx.trace;
    const mapping: LineColorMapping | undefined = calc.colors
      ? lineColorMapping(trace, ctx.fullLayout, calc.colorExtent)
      : undefined;
    let lut: Float32Array | undefined;
    if (mapping) {
      if (this.#lut?.scale !== mapping.colorscale) {
        this.#lut = { scale: mapping.colorscale, lut: colorLUT(mapping.colorscale) };
      }
      lut = this.#lut.lut;
    }
    const line = (trace['line'] ?? {}) as Record<string, unknown>;
    const unselected = ((trace['unselected'] as Record<string, unknown> | undefined)?.['line'] ??
      {}) as Record<string, unknown>;
    const constraints = new Map<number, readonly Range[]>();
    calc.dimensions.forEach((_, d) => constraints.set(d, this.#rangesOf(d)));
    this.#colors = lineColors(
      calc,
      dims,
      {
        mapping,
        lut,
        flat: rgba(line['color'], [0.27, 0.27, 0.27, 1]),
        unselected: unselectedColor(
          rgba(unselected['color'], [0.5, 0.5, 0.5, 1]),
          unselected['opacity'],
          calc.length,
        ),
      },
      selectionMask(calc, constraints),
      this.#colors,
    );
    return this.#colors;
  }

  /** Recolor on the next animation frame, once however many brush moves arrive before it. */
  #scheduleRecolor(): void {
    if (typeof requestAnimationFrame !== 'function') return this.#recolor();
    this.#recolorFrame ??= requestAnimationFrame(() => {
      this.#recolorFrame = undefined;
      this.#recolor();
    });
  }

  dispose(): void {
    if (this.#recolorFrame !== undefined) cancelAnimationFrame(this.#recolorFrame);
    this.#recolorFrame = undefined;
    // Primitives were added through ctx.add: the runtime removes and disposes them.
    this.#ctx = undefined;
  }

  /** Rewrite the line colors in place (no geometry change). */
  #recolor(): void {
    if (this.#recolorFrame !== undefined) cancelAnimationFrame(this.#recolorFrame);
    this.#recolorFrame = undefined;
    const ctx = this.#ctx;
    if (!ctx || !this.#lines) return;
    const dims = (this.#drag?.order ?? this.#order).length;
    this.#lines.update({ color: this.#lineColors(dims) });
    ctx.invalidate();
  }

  /** Axis lines, ticks and labels; also the hit geometry for the interaction. */
  #drawAxes(): void {
    const ctx = this.#ctx;
    const calc = this.#calc;
    if (!ctx || !calc) return;
    const trace = ctx.trace as FullTrace;
    const rect = this.#rect;
    const h = ctx.viewport.size.height;
    const order = this.#drag?.order ?? this.#order;
    const axes = layoutAxes(calc, rect, order, this.#drag);
    const ink = inkColor(ctx.fullLayout, 0.25);
    const rects = new Rects();
    const labels: TextLabel[] = [];
    const tickFont = textFontOf(trace['tickfont']);
    const rangeFont = textFontOf(trace['rangefont']);
    const labelFont = textFontOf(trace['labelfont']);
    const angle = Number(trace['labelangle']) || 0;
    const side = trace['labelside'] === 'bottom' ? 'bottom' : 'top';
    const place = labelPlacement(angle, side);
    const top = rect.y + PARCOORDS.pad;
    const bottom = rect.y + rect.height - PARCOORDS.pad;
    const hitAxes: HitAxis[] = [];
    for (const { dim, x } of axes) {
      const d = calc.dimensions.indexOf(dim);
      const container = dimensionContainer(trace, dim);
      // Axis line with Plotly's 2 px end ticks, then the ticks and their labels on the left.
      rects.push(x - 0.5, top, x + 0.5, bottom, ink, h);
      rects.push(x - PARCOORDS.outerTick, top - 0.5, x, top + 0.5, ink, h);
      rects.push(x - PARCOORDS.outerTick, bottom - 0.5, x, bottom + 0.5, ink, h);
      for (const tick of axisTicks(dim, container, bottom - top)) {
        const y = unitToY(rect, tick.u);
        rects.push(x - PARCOORDS.tickLength, y - 0.5, x, y + 0.5, ink, h);
        labels.push(
          textLabel(tick.text, tickFont, {
            x: x - PARCOORDS.tickLabelGap,
            y,
            anchorX: 'right',
            anchorY: 'middle',
          }),
        );
      }
      const range = rangeLabels(dim, container);
      if (range.top) {
        labels.push(
          textLabel(range.top, rangeFont, {
            x,
            y: rect.y - PARCOORDS.rangeOffset,
            anchorX: 'center',
            anchorY: 'baseline',
          }),
        );
      }
      if (range.bottom) {
        labels.push(
          textLabel(range.bottom, rangeFont, {
            x,
            y: rect.y + rect.height + PARCOORDS.rangeOffset + 0.75 * rangeFont.font.size,
            anchorX: 'center',
            anchorY: 'baseline',
          }),
        );
      }
      let labelRect: Rect | undefined;
      if (dim.label) {
        const label = textLabel(dim.label, labelFont, {
          x,
          y: (side === 'top' ? rect.y : rect.y + rect.height) + place.dy,
          anchorX: place.anchorX,
          anchorY: 'baseline',
          angle,
        });
        labels.push(label);
        const m = measureText(label.text, labelFont.font);
        labelRect = labelBox(label, m.width, m.height, 0.8 * labelFont.font.size);
      }
      const range0 = dim.range;
      hitAxes.push({
        dim: d,
        x,
        top,
        bottom,
        label: labelRect,
        ranges: this.#rangesOf(d),
        brush: {
          valueAt: (y) => unitToValue(range0, yToUnit(rect, y)),
          yOf: (v) => unitToY(rect, valueToUnit(range0, v)),
          ticks: dim.tickvals ? [...dim.tickvals].sort((a, b) => a - b) : undefined,
          multiselect: container['multiselect'] !== false,
        },
      });
    }
    this.#geometry = { rect, axes: hitAxes };

    const data = rects.data();
    if (!this.#axes) {
      this.#axes = createRectPrimitive(ctx.primitives, data);
      ctx.add(this.#axes);
    } else this.#axes.update(data);
    this.#axes.object.renderOrder = orderOf(ORDER.axes, ctx.index);
    this.#axes.setTransform(IDENTITY_TRANSFORM);

    for (const l of labels) l.y = h - l.y;
    if (!this.#text) {
      this.#text = createTextPrimitive(ctx.primitives, { labels });
      ctx.add(this.#text);
    } else this.#text.update({ labels });
    this.#text.object.renderOrder = orderOf(ORDER.text, ctx.index);
    this.#text.setTransform(IDENTITY_TRANSFORM);
  }

  /** Brush bars: every axis' ranges as a magenta bar over a paper-colored shadow (Plotly). */
  #drawBars(): void {
    const ctx = this.#ctx;
    const calc = this.#calc;
    if (!ctx || !calc) return;
    const rect = this.#rect;
    const h = ctx.viewport.size.height;
    const order = this.#drag?.order ?? this.#order;
    const shadow = rgba(ctx.fullLayout['paper_bgcolor'], [1, 1, 1, 1]);
    const rects = new Rects();
    const w = PARCOORDS.barWidth;
    for (const { dim, x } of layoutAxes(calc, rect, order, this.#drag)) {
      const d = calc.dimensions.indexOf(dim);
      for (const [lo, hi] of this.#rangesOf(d)) {
        const ya = unitToY(rect, valueToUnit(dim.range, lo));
        const yb = unitToY(rect, valueToUnit(dim.range, hi));
        const y0 = Math.min(ya, yb);
        const y1 = Math.max(ya, yb);
        rects.push(
          x - (w + 1) / 2,
          y0 - 1,
          x + (w + 1) / 2,
          y1 + 1,
          [shadow[0], shadow[1], shadow[2], 1],
          h,
        );
        rects.push(x - (w - 1) / 2, y0, x + (w - 1) / 2, y1, BAR, h);
      }
    }
    // Keep the hit geometry's ranges in step with what is drawn.
    if (this.#geometry) {
      this.#geometry = {
        ...this.#geometry,
        axes: this.#geometry.axes.map((a) => ({ ...a, ranges: this.#rangesOf(a.dim) })),
      };
    }
    const data = { ...rects.data(), snap: false };
    if (!this.#bars) {
      this.#bars = createRectPrimitive(ctx.primitives, data);
      ctx.add(this.#bars);
    } else this.#bars.update(data);
    this.#bars.object.renderOrder = orderOf(ORDER.bars, ctx.index);
    this.#bars.setTransform(IDENTITY_TRANSFORM);
    ctx.invalidate();
  }
}

/** The parcoords `plot` part: one {@link ParcoordsView} per visible trace. */
export const parcoordsRenderer: TraceRenderer<ParcoordsCalc> = {
  create: (ctx) => new ParcoordsView(ctx),
};
