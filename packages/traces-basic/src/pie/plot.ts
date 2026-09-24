/**
 * `pie` renderer (plan E9.11, E22.1): every slice of the trace in ONE instanced {@link ArcPrimitive}
 * (plan §3 principle 6), one batched {@link TextPrimitive} for the slice labels and the title, and
 * one {@link LinePrimitive} for leader lines. Pies are domain traces: they draw into the overlay
 * viewport, whose world units are container px with a bottom-left origin, so container `(x, y)` is
 * world `(x, height − y)`.
 *
 * ## Outlines
 *
 * Plotly strokes `marker.line` centered on each slice's edge; the arc primitive draws its border
 * inside the wedge. Each slice therefore gets a border of half the width (two neighbours make one
 * full-width seam on radial edges), plus thin rim wedges of the line color for the outer half at
 * the outer radius (and the hole's edge): the same primitive, extra instances.
 *
 * Every update rebuilds the slice buffers (pies have few slices) but reuses the primitives.
 * Deferred: animated re-flow when slices are hidden and pull transitions (E7.3), `marker.pattern`
 * (E8.10), `uniformtext` (E4.6), `automargin`.
 */
import { toRGBA, type FullTrace } from '@mk7s/holochart-core';
import {
  createArcPrimitive,
  createTextPrimitive,
  LinePrimitive,
  type ArcData,
  type ArcPrimitive,
  type RGBA,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type { TracePlotContext, TraceRenderer, TraceView } from '@mk7s/holochart-runtime';
import { sliceCenter, type PieCalc } from './calc.ts';
import { castOption } from './helpers.ts';
import { layoutPieAreas, measureTitles, resolvePieColors } from './layout.ts';
import { layoutPieText, LINE_HEIGHT, type PieTextLayout } from './text.ts';

const GREY: RGBA = [0.5, 0.5, 0.5, 1];
const DEFAULT_LINE = '#444';

/**
 * Render orders in the overlay: every pie primitive stays in [-10, 0), below figure components
 * (title, legend, annotations). Slices of all pies, then leader lines, then labels; trace order
 * within each layer.
 */
const ORDER = { arcs: -9, lines: -6, text: -3 } as const;
const orderOf = (layer: number, index: number): number => layer + Math.min(index, 999) * 1e-3;

/** Per-instance arc buffers for every slice: the wedge, its outer rim and (donuts) inner rim. */
export interface PieArcs {
  readonly count: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly innerRadius: Float32Array;
  readonly outerRadius: Float32Array;
  readonly startAngle: Float32Array;
  readonly endAngle: Float32Array;
  readonly fill: Float32Array;
  readonly borderColor: Float32Array;
  readonly borderWidth: Float32Array;
}

function lineStyle(trace: FullTrace, pts: readonly number[]): { color: RGBA; width: number } {
  const line = (trace['marker'] as { line?: { color?: unknown; width?: unknown } } | undefined)
    ?.line;
  const width = Number(castOption(line?.width, pts)) || 0;
  const color = castOption(line?.color, pts);
  return {
    width: Math.max(0, width),
    color: (typeof color === 'string' ? toRGBA(color) : null) ?? toRGBA(DEFAULT_LINE)!,
  };
}

/**
 * Arc instances of a laid-out pie, in world px (`height` flips y). Hidden and empty slices get a
 * NaN center, which the primitive culls.
 */
export function pieArcs(trace: FullTrace, calc: PieCalc, height: number): PieArcs {
  const layout = calc.layout;
  const n = calc.slices.length;
  const hole = 1 - calc.ring;
  const perSlice = hole > 0 ? 3 : 2;
  const count = n * perSlice;
  const x = new Float64Array(count).fill(NaN);
  const y = new Float64Array(count).fill(NaN);
  const innerRadius = new Float32Array(count);
  const outerRadius = new Float32Array(count);
  const startAngle = new Float32Array(count);
  const endAngle = new Float32Array(count);
  const fill = new Float32Array(count * 4);
  const borderColor = new Float32Array(count * 4);
  const borderWidth = new Float32Array(count);
  if (layout && layout.r > 0) {
    const r = layout.r;
    calc.slices.forEach((slice, k) => {
      if (slice.hidden || !Number.isFinite(slice.midAngle)) return;
      const [cx, cy] = sliceCenter(slice, layout);
      const wx = cx;
      const wy = height - cy;
      // Arc angles: 0 = +x, counter-clockwise (y up); Plotly's are from 12 o'clock, clockwise.
      const a0 = Math.PI / 2 - slice.startAngle;
      const a1 = Math.PI / 2 - slice.stopAngle;
      const { color: lineColor, width } = lineStyle(trace, slice.pts);
      const set = (i: number, r0: number, r1: number, color: RGBA): void => {
        x[i] = wx;
        y[i] = wy;
        innerRadius[i] = r0;
        outerRadius[i] = r1;
        startAngle[i] = a0;
        endAngle[i] = a1;
        fill.set(color, i * 4);
      };
      const base = k * perSlice;
      set(base, hole * r, r, toRGBA(slice.color) ?? GREY);
      if (width > 0) {
        borderColor.set(lineColor, base * 4);
        borderWidth[base] = width / 2;
        set(base + 1, r, r + width / 2, lineColor);
        if (hole > 0) set(base + 2, Math.max(0, hole * r - width / 2), hole * r, lineColor);
      }
    });
  }
  return {
    count,
    x,
    y,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    borderColor,
    borderWidth,
  };
}

/** Text labels for the text primitive, in world px. `opacity` multiplies the alpha. */
export function pieTextLabels(text: PieTextLayout, height: number, opacity: number): TextLabel[] {
  return text.labels.map((l) => ({
    text: l.text,
    x: l.x,
    y: height - l.y,
    font: l.font,
    color: [l.color[0], l.color[1], l.color[2], l.color[3] * opacity],
    anchorX: l.anchorX,
    anchorY: l.anchorY,
    align: l.anchorX,
    angle: l.angle,
    lineHeight: LINE_HEIGHT,
  }));
}

function traceOpacity(trace: FullTrace): number {
  const o = trace['opacity'];
  return typeof o === 'number' && Number.isFinite(o) ? o : 1;
}

/**
 * Lay the pie out on its own when the runtime has not run `crossTraceLayout` for it (it always does
 * before `plot`; this keeps hand-built contexts working): colors from this trace only.
 */
function ensureLayout(ctx: TracePlotContext<PieCalc>): void {
  const { calc, trace } = ctx;
  if (calc.layout) return;
  if (calc.slices.some((s) => s.color === '')) resolvePieColors([calc], ctx.fullLayout);
  const rect = ctx.domain?.rect;
  if (!rect) return;
  measureTitles([{ trace, calc }]);
  const size = ctx.viewport.size as { width: number; height: number } | undefined;
  layoutPieAreas([{ trace, calc, rect }], {
    width: size?.width ?? rect.x + rect.width,
    height: size?.height ?? rect.y + rect.height,
  });
}

class PieView implements TraceView<PieCalc> {
  #arcs: ArcPrimitive | undefined;
  #text: TextPrimitive | undefined;
  #lines: LinePrimitive | undefined;

  constructor(ctx: TracePlotContext<PieCalc>) {
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<PieCalc>): void {
    // Slices are few: any change rebuilds the buffers, in place.
    this.#sync(ctx);
  }

  #sync(ctx: TracePlotContext<PieCalc>): void {
    ensureLayout(ctx);
    const { trace, calc } = ctx;
    const height = calc.layout?.height ?? ctx.viewport.size.height;
    const opacity = traceOpacity(trace);

    const arcs = pieArcs(trace, calc, height);
    const data: Partial<ArcData> = {
      x: arcs.x,
      y: arcs.y,
      innerRadius: arcs.innerRadius,
      outerRadius: arcs.outerRadius,
      startAngle: arcs.startAngle,
      endAngle: arcs.endAngle,
      fill: arcs.fill,
      borderColor: arcs.borderColor,
      borderWidth: arcs.borderWidth,
      opacity,
    };
    if (!this.#arcs) {
      this.#arcs = createArcPrimitive(ctx.primitives, data);
      ctx.add(this.#arcs);
    } else this.#arcs.update(data);
    this.#arcs.object.renderOrder = orderOf(ORDER.arcs, ctx.index);
    this.#arcs.setTransform(ctx.transform);

    const text = layoutPieText(trace, calc, ctx.fullLayout);
    this.#syncText(ctx, pieTextLabels(text, height, opacity));
    this.#syncLines(ctx, text, height, opacity);
  }

  #syncText(ctx: TracePlotContext<PieCalc>, labels: TextLabel[]): void {
    if (labels.length === 0) {
      if (this.#text) ctx.remove(this.#text);
      this.#text = undefined;
      return;
    }
    if (!this.#text) {
      this.#text = createTextPrimitive(ctx.primitives, { labels });
      ctx.add(this.#text);
    } else this.#text.update({ labels });
    this.#text.object.renderOrder = orderOf(ORDER.text, ctx.index);
    this.#text.setTransform(ctx.transform);
  }

  #syncLines(
    ctx: TracePlotContext<PieCalc>,
    text: PieTextLayout,
    height: number,
    opacity: number,
  ): void {
    if (text.lines.length === 0) {
      if (this.#lines) ctx.remove(this.#lines);
      this.#lines = undefined;
      return;
    }
    const x: number[] = [];
    const y: number[] = [];
    const starts: number[] = [];
    const color: number[] = [];
    const width: number[] = [];
    for (const line of text.lines) {
      if (x.length > 0) starts.push(x.length);
      for (const [px, py] of line.points) {
        x.push(px);
        y.push(height - py);
        color.push(...line.color);
        width.push(line.width);
      }
    }
    const data = {
      x: Float64Array.from(x),
      y: Float64Array.from(y),
      starts,
      color: Float32Array.from(color),
      width: Float32Array.from(width),
      opacity,
    };
    if (!this.#lines) {
      this.#lines = new LinePrimitive(ctx.primitives, data);
      ctx.add(this.#lines);
    } else this.#lines.update(data);
    this.#lines.object.renderOrder = orderOf(ORDER.lines, ctx.index);
    this.#lines.setTransform(ctx.transform);
  }
}

/** The pie `plot` part: one {@link PieView} per visible pie. */
export const pieRenderer: TraceRenderer<PieCalc> = {
  create: (ctx) => new PieView(ctx),
};
