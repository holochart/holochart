/**
 * `funnelarea` renderer (plan E12.6, E22.1): every stage of a trace in ONE batched polygon fill
 * (the fill primitive, loaded on first use; plan §3 principle 6), the stage outlines in one line
 * primitive (centered on the edges, like Plotly's strokes) and the labels and title in one batched
 * SDF text primitive. Funnel areas are domain traces: they draw into the overlay viewport, whose
 * world units are container px with a bottom-left origin, so container `(x, y)` is world
 * `(x, height − y)`. Stages are few, so every update rebuilds the buffers, in place.
 *
 * `marker.pattern` (E8.10) hatches the stages as pie's slices (the fill's pattern paint, whose code
 * loads on first use), with tiles anchored at the container's top-left corner, where Plotly's
 * `userSpaceOnUse` tiles of the funnel paths start too. `layout.uniformtext` (E4.6) sizes the
 * stage labels of every funnel area of the chart alike (traces-basic's negotiation, per trace
 * type as in Plotly).
 *
 * Deferred: label links.
 */
import { toRGBA, uniformTextOf, type FullTrace, type UniformText } from '@mk7s/holochart-core';
import {
  createLazyFillPrimitive,
  createTextPrimitive,
  fadeTextRuns,
  LinePrimitive,
  type LazyFillPrimitive,
  type PatternFill,
  type RGBA,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type { TracePlotContext, TraceRenderer, TraceView } from '@mk7s/holochart-runtime';
import {
  castOption,
  negotiateUniformText,
  releaseUniformText,
  slicePattern,
} from '@mk7s/holochart-traces-basic';
import { traceOpacity } from '../shared/style.ts';
import {
  layoutFunnelareas,
  LINE_HEIGHT,
  measureTitles,
  resolveFunnelareaColors,
  type FunnelareaCalc,
} from './calc.ts';
import { layoutFunnelareaText, type FunnelareaTextLayout } from './text.ts';

const GREY: RGBA = [0.5, 0.5, 0.5, 1];
const DEFAULT_LINE: RGBA = [68 / 255, 68 / 255, 68 / 255, 1];

/**
 * Render orders in the overlay (as pie's, in [-10, 0), below figure components): stages, then
 * outlines, then labels; trace order within each layer.
 */
const ORDER = { fill: -9, lines: -8, text: -3 } as const;
const orderOf = (layer: number, index: number): number => layer + Math.min(index, 999) * 1e-3;

/** Buffers of the stage fills and outlines, in world px. */
export interface FunnelareaShapes {
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Start vertex of each stage (4 vertices each). */
  readonly rings: number[];
  /** One RGBA per stage. */
  readonly fill: Float32Array;
  /** `marker.pattern` per stage (the fill's pattern paint), or `null` without a shape. */
  readonly pattern: PatternFill | null;
  /** Closed outlines, NaN-separated, with per-vertex colors and widths (none without width). */
  readonly outline: {
    readonly x: Float64Array;
    readonly y: Float64Array;
    readonly color: Float32Array;
    readonly width: Float32Array;
  };
}

/**
 * The stage fills and outlines of a laid-out funnel area, in world px (`height` flips y). `paper`
 * is the default pattern background (Plotly: `paper_bgcolor`, as for pies).
 */
export function funnelareaShapes(
  trace: FullTrace,
  calc: FunnelareaCalc,
  height: number,
  paper?: unknown,
): FunnelareaShapes {
  const x: number[] = [];
  const y: number[] = [];
  const rings: number[] = [];
  const fill: number[] = [];
  const lx: number[] = [];
  const ly: number[] = [];
  const lc: number[] = [];
  const lw: number[] = [];
  const layout = calc.layout;
  const marker = trace['marker'] as
    { line?: { color?: unknown; width?: unknown }; pattern?: unknown } | undefined;
  const line = marker?.line;
  const patterns: (Record<string, unknown> | undefined)[] = [];
  if (layout) {
    for (const slice of calc.slices) {
      const c = slice.corners;
      if (slice.hidden || !c) continue;
      const ring = [c.tl, c.tr, c.br, c.bl].map(
        ([px, py]) => [layout.cx + px, height - (layout.cy + py)] as const,
      );
      rings.push(x.length);
      for (const [px, py] of ring) {
        x.push(px);
        y.push(py);
      }
      fill.push(...((slice.color ? toRGBA(slice.color) : null) ?? GREY));
      patterns.push(slicePattern(marker?.pattern, slice.pts, paper));
      // Plotly's `styleOne`: the first filled entry among the stage's points.
      const width = Number(castOption(line?.width, slice.pts)) || 0;
      if (!(width > 0)) continue;
      const colorIn = castOption(line?.color, slice.pts);
      const color = (typeof colorIn === 'string' ? toRGBA(colorIn) : null) ?? DEFAULT_LINE;
      if (lx.length > 0) {
        lx.push(NaN);
        ly.push(NaN);
        lc.push(0, 0, 0, 0);
        lw.push(0);
      }
      for (const [px, py] of [...ring, ring[0]!]) {
        lx.push(px);
        ly.push(py);
        lc.push(...color);
        lw.push(width);
      }
    }
  }
  const colors = Float32Array.from(fill);
  return {
    x: Float64Array.from(x),
    y: Float64Array.from(y),
    rings,
    fill: colors,
    pattern: patterns.some(Boolean)
      ? { pattern: patterns, color: colors, background: paper, parse: toRGBA }
      : null,
    outline: {
      x: Float64Array.from(lx),
      y: Float64Array.from(ly),
      color: Float32Array.from(lc),
      width: Float32Array.from(lw),
    },
  };
}

/**
 * Lay the funnel area out on its own when the runtime has not run `crossTraceLayout` for it (it
 * always does before `plot`; this keeps hand-built contexts working): colors from this trace only.
 */
function ensureLayout(ctx: TracePlotContext<FunnelareaCalc>): void {
  const { calc, trace } = ctx;
  if (calc.layout) return;
  if (calc.slices.some((s) => s.color === '')) resolveFunnelareaColors([calc], ctx.fullLayout);
  const rect = ctx.domain?.rect;
  if (!rect) return;
  measureTitles([{ trace, calc }]);
  const size = ctx.viewport.size as { width: number; height: number } | undefined;
  layoutFunnelareas([{ trace, calc, rect }], {
    width: size?.width ?? rect.x + rect.width,
    height: size?.height ?? rect.y + rect.height,
  });
}

/** Text labels for the text primitive, in world px (`height` flips y). */
function textLabels(text: FunnelareaTextLayout, height: number, opacity: number): TextLabel[] {
  return text.labels.map((l) => {
    const label: TextLabel = {
      text: l.text,
      x: l.x,
      y: height - l.y,
      font: l.font,
      color: [l.color[0], l.color[1], l.color[2], l.color[3] * opacity],
      anchorX: l.anchorX,
      anchorY: l.anchorY,
      align: l.anchorX,
      angle: 0,
      lineHeight: LINE_HEIGHT,
    };
    if (l.runs) label.runs = fadeTextRuns(l.runs, opacity);
    return label;
  });
}

class FunnelareaView implements TraceView<FunnelareaCalc> {
  #fill: LazyFillPrimitive | undefined;
  #lines: LinePrimitive | undefined;
  #text: TextPrimitive | undefined;
  /** The last context (uniformtext refreshes). */
  #ctx: TracePlotContext<FunnelareaCalc> | undefined;

  constructor(ctx: TracePlotContext<FunnelareaCalc>) {
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<FunnelareaCalc>): void {
    // Stages are few: any change rebuilds the buffers, in place.
    this.#sync(ctx);
  }

  dispose(): void {
    // Other funnel areas are being updated or disposed too: no refresh from here.
    const ctx = this.#ctx;
    if (ctx) releaseUniformText(ctx.primitives, ctx.trace.type, this, false);
  }

  #sync(ctx: TracePlotContext<FunnelareaCalc>): void {
    this.#ctx = ctx;
    ensureLayout(ctx);
    const { trace, calc } = ctx;
    const height = calc.layout?.height ?? ctx.viewport.size.height;
    const opacity = traceOpacity(trace);
    const shapes = funnelareaShapes(trace, calc, height, ctx.fullLayout.paper_bgcolor);

    if (shapes.rings.length === 0) {
      if (this.#fill) ctx.remove(this.#fill);
      this.#fill = undefined;
    } else {
      const data = {
        x: shapes.x,
        y: shapes.y,
        rings: shapes.rings,
        color: shapes.fill,
        opacity,
        paint: shapes.pattern
          ? { kind: 'pattern' as const, pattern: shapes.pattern }
          : { kind: 'solid' as const },
      };
      if (!this.#fill) {
        this.#fill = createLazyFillPrimitive(ctx.primitives, data);
        ctx.add(this.#fill);
      } else this.#fill.update(data);
      this.#fill.object.renderOrder = orderOf(ORDER.fill, ctx.index);
      this.#fill.setTransform(ctx.transform);
    }

    const outline = shapes.outline;
    if (outline.x.length === 0) {
      if (this.#lines) ctx.remove(this.#lines);
      this.#lines = undefined;
    } else {
      const data = { ...outline, opacity, join: 'miter' as const };
      if (!this.#lines) {
        this.#lines = new LinePrimitive(ctx.primitives, data);
        ctx.add(this.#lines);
      } else this.#lines.update(data);
      this.#lines.object.renderOrder = orderOf(ORDER.lines, ctx.index);
      this.#lines.setTransform(ctx.transform);
    }

    this.#syncText(ctx, uniformTextOf(ctx.fullLayout));
  }

  /**
   * The labels and title, with `layout.uniformtext` (E4.6) as negotiated with the other funnel
   * areas of the chart (Plotly's `_funnelareaText_minsize`); `uniform` overrides the layout's when
   * another view asks for a refresh.
   */
  #syncText(ctx: TracePlotContext<FunnelareaCalc>, uniform: UniformText): void {
    const { trace, calc } = ctx;
    const height = calc.layout?.height ?? ctx.viewport.size.height;
    let text = layoutFunnelareaText(trace, calc, ctx.fullLayout, { uniformText: uniform });
    const size = negotiateUniformText(ctx.primitives, trace.type, this, text.items, uniform, (u) =>
      this.#refresh(u),
    );
    if (size !== text.uniformSize) {
      text = layoutFunnelareaText(trace, calc, ctx.fullLayout, {
        uniformText: uniform,
        ...(size !== undefined ? { uniformSize: size } : {}),
      });
    }
    const labels = textLabels(text, height, traceOpacity(trace));
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

  /** Redraw the labels from the last context with another funnel area's negotiation. */
  #refresh(uniform: UniformText): void {
    if (this.#ctx) this.#syncText(this.#ctx, uniform);
  }
}

/** The funnelarea `plot` part: one {@link FunnelareaView} per visible funnel area. */
export const funnelareaRenderer: TraceRenderer<FunnelareaCalc> = {
  create: (ctx) => new FunnelareaView(ctx),
};
