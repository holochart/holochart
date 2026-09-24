/**
 * `bar` renderer (plan E9.8, E22.1): one instanced {@link RectPrimitive} for every bar of the trace
 * (plan §3 principle 6), the shared error-bar layers (E9.7) and one batched {@link TextPrimitive}
 * for its labels, updated in place per
 * the runtime's plan: style and selection edits re-upload colors only, and zoom/pan (`transform`)
 * sets uniforms — except for what depends on bar sizes in px (label placement, percentage corner
 * radii, the start of bars below a log axis), which is recomputed from the calc without new geometry
 * in the common case.
 */
import { toRGBA, uniformTextOf, type FullTrace, type UniformText } from '@mk7s/holochart-core';
import {
  createRectPrimitive,
  createTextPrimitive,
  type RectData,
  type RectPrimitive,
  type RGBA,
  type ScalarInput,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type {
  AxisInfo,
  ComponentPointerEvent,
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { ErrorBarLayer, errorBarStyle } from '../shared/error-bars/index.ts';
import { traceRenderOrder } from '../shared/render-order.ts';
import { cartesianLinkAt, handleLinkPointer, hasLink } from '../shared/rich-text.ts';
import { negotiateUniformText, releaseUniformText } from '../shared/uniform-text.ts';
import type { BarCalc } from './calc.ts';
import { mayShowText } from './defaults.ts';
import { barStyle, cornerRadiusPx, selectionSet, type BarStyle } from './style.ts';
import { planBarText, valueFormatters } from './text.ts';

/** Bars narrower than this (px) are not snapped to device pixels, so dense bars keep their widths. */
const SNAP_MIN_WIDTH_PX = 2;

const WHITE: RGBA = [1, 1, 1, 1];

/** Draw order within the trace (added to its render order): bars, error bars, then labels on top. */
const LAYER = { errorBars: 0.25, text: 0.5 } as const;

/** Rect corners of every bar, in linear coordinates. */
export interface BarGeometry {
  readonly x0: Float64Array;
  readonly y0: Float64Array;
  readonly x1: Float64Array;
  readonly y1: Float64Array;
}

/**
 * Rect corners of every bar. Bars below a log axis (`s0 = -Infinity`) start at `floor`; skipped
 * bars get NaN corners, which the rect primitive does not draw.
 */
export function barGeometry(calc: BarCalc, floor: number): BarGeometry {
  const n = calc.length;
  const g = {
    x0: new Float64Array(n),
    y0: new Float64Array(n),
    x1: new Float64Array(n),
    y1: new Float64Array(n),
  };
  const [p0, p1, s0, s1] =
    calc.orientation === 'h' ? [g.y0, g.y1, g.x0, g.x1] : [g.x0, g.x1, g.y0, g.y1];
  const { center, width } = calc.bars;
  for (let i = 0; i < n; i++) {
    const c = center[i]!;
    const half = width[i]! / 2;
    p0[i] = c - half;
    p1[i] = c + half;
    s0[i] = calc.s0[i] === -Infinity ? floor : calc.s0[i]!;
    s1[i] = calc.s1[i]!;
  }
  return g;
}

function sizeAxis(calc: BarCalc, ctx: TracePlotContext<BarCalc>): AxisInfo | undefined {
  return calc.orientation === 'h' ? ctx.xaxis : ctx.yaxis;
}

function visibleRange(axis: AxisInfo | undefined): { lo: number; span: number } | undefined {
  const r = axis?.scale.range;
  if (!r || !Number.isFinite(r[0]) || !Number.isFinite(r[1])) return undefined;
  return { lo: Math.min(r[0], r[1]), span: Math.abs(r[1] - r[0]) || 1 };
}

/**
 * Where bars below a log axis start (linear): one visible span below the bottom of the range, so
 * they reach past the plot edge at any zoom without huge coordinates (RTC precision).
 */
export function floorFor(calc: BarCalc, axis: AxisInfo | undefined): number {
  if (!calc.floor) return NaN;
  const r = visibleRange(axis);
  return r ? r.lo - r.span : -1;
}

/** Whether a floor still lies below the visible range with sane precision after a zoom. */
function floorStillValid(floor: number, axis: AxisInfo | undefined): boolean {
  const r = visibleRange(axis);
  if (!r) return true;
  return floor < r.lo && r.lo - floor < 100 * r.span;
}

function positionScale(calc: BarCalc, ctx: TracePlotContext<BarCalc>): number {
  return Math.abs(calc.orientation === 'h' ? ctx.transform.scaleY : ctx.transform.scaleX);
}

/** Corner radii in px (outermost bars only), and whether they depend on the zoom (`%`). */
function cornerRadii(
  calc: BarCalc,
  ctx: TracePlotContext<BarCalc>,
): { radius: ScalarInput; relative: boolean } {
  const marker = ctx.trace['marker'] as { cornerradius?: unknown } | undefined;
  const radius = marker?.cornerradius ?? ctx.fullLayout['barcornerradius'];
  const relative = typeof radius === 'string' && radius.trim().endsWith('%');
  if (!relative && cornerRadiusPx(radius, 0) === 0) return { radius: 0, relative };
  const scale = positionScale(calc, ctx);
  const out = new Float32Array(calc.length);
  for (let i = 0; i < calc.length; i++) {
    out[i] = calc.bars.outmost[i] ? cornerRadiusPx(radius, calc.bars.width[i]! * scale) : 0;
  }
  return { radius: out, relative };
}

/** Snap edges to device pixels unless some bar is narrower than {@link SNAP_MIN_WIDTH_PX}. */
function shouldSnap(calc: BarCalc, ctx: TracePlotContext<BarCalc>): boolean {
  const scale = positionScale(calc, ctx);
  let min = Infinity;
  for (let i = 0; i < calc.length; i++) {
    const w = calc.bars.width[i]! * scale;
    if (Number.isFinite(w) && w < min) min = w;
  }
  return min >= SNAP_MIN_WIDTH_PX;
}

function hasText(trace: FullTrace): boolean {
  if (!mayShowText(trace['textposition'])) return false;
  const nonEmpty = (v: unknown): boolean =>
    typeof v === 'string' ? v !== '' : v !== null && typeof v === 'object';
  return nonEmpty(trace['text']) || nonEmpty(trace['texttemplate']);
}

class BarView implements TraceView<BarCalc> {
  #rects: RectPrimitive | undefined;
  #text: TextPrimitive | undefined;
  #style: BarStyle | undefined;
  #floor = NaN;
  #relativeRadius = false;
  #errors: { x?: ErrorBarLayer; y?: ErrorBarLayer } = {};
  /** The context labels were last computed with (uniformtext refreshes, link hit tests). */
  #textCtx: TracePlotContext<BarCalc> | undefined;
  /** Drawn labels with links (E2.10), for {@link BarView.handlePointer}. */
  #links: TextLabel[] = [];

  constructor(ctx: TracePlotContext<BarCalc>) {
    this.#sync(ctx);
  }

  /** Clicks on label links (`<a href>`) open them; hovering one shows a pointer cursor. */
  handlePointer(event: ComponentPointerEvent): boolean {
    const ctx = this.#textCtx;
    if (this.#links.length === 0 || !ctx) return false;
    const link = cartesianLinkAt(this.#links, ctx.transform, ctx.subplot, event.x, event.y);
    return handleLinkPointer(event, link);
  }

  dispose(): void {
    // Other bar views are being updated or disposed too: no refresh from here.
    const ctx = this.#textCtx;
    if (ctx) releaseUniformText(ctx.primitives, ctx.trace.type, this, false);
  }

  update(ctx: TracePlotContext<BarCalc>, plan: TraceUpdatePlan): void {
    if (!this.#rects || plan.calc || plan.plot) {
      this.#sync(ctx);
      return;
    }
    const rects = this.#rects;
    const restyle = plan.style || plan.selection === true;
    if (restyle) {
      const style = this.#computeStyle(ctx);
      rects.update({
        fill: style.fill,
        borderColor: style.border,
        borderWidth: style.borderWidth,
        opacity: traceOpacity(ctx.trace),
        ...(plan.transform ? {} : { cornerRadius: cornerRadii(ctx.calc, ctx).radius }),
      });
    }
    if (plan.transform) {
      const patch: Partial<RectData> = { snap: shouldSnap(ctx.calc, ctx) };
      if (ctx.calc.floor && !floorStillValid(this.#floor, sizeAxis(ctx.calc, ctx))) {
        this.#floor = floorFor(ctx.calc, sizeAxis(ctx.calc, ctx));
        Object.assign(patch, barGeometry(ctx.calc, this.#floor));
      }
      if (this.#relativeRadius || restyle) patch.cornerRadius = cornerRadii(ctx.calc, ctx).radius;
      rects.update(patch);
      rects.setTransform(ctx.transform);
    }
    for (const letter of ['x', 'y'] as const) {
      const layer = this.#errors[letter];
      if (!layer) continue;
      if (restyle) layer.update({ style: errorBarStyle(ctx.trace, letter) });
      if (plan.transform) layer.setTransform(ctx.transform);
    }
    this.#syncText(ctx);
  }

  /** Create, update or remove the error-bar layers to match the calc. */
  #syncErrorBars(ctx: TracePlotContext<BarCalc>): void {
    const { calc, trace } = ctx;
    for (const letter of ['x', 'y'] as const) {
      const bars = letter === 'x' ? calc.errorX : calc.errorY;
      let layer = this.#errors[letter];
      if (!bars || bars.count === 0) {
        if (layer) for (const p of layer.primitives) ctx.remove(p);
        this.#errors[letter] = undefined;
        continue;
      }
      const data = { ...calc.ends, bars, style: errorBarStyle(trace, letter) };
      if (!layer) {
        layer = new ErrorBarLayer(ctx.primitives, data);
        for (const p of layer.primitives) ctx.add(p);
        this.#errors[letter] = layer;
      } else {
        layer.update(data);
      }
      layer.renderOrder = traceRenderOrder(ctx.trace, ctx.index) + LAYER.errorBars;
      layer.setTransform(ctx.transform);
    }
  }

  #computeStyle(ctx: TracePlotContext<BarCalc>): BarStyle {
    this.#style = barStyle(
      ctx.trace,
      ctx.calc.length,
      selectionSet(ctx.selectedPoints),
      ctx.fullLayout,
    );
    return this.#style;
  }

  /** Create or fully refresh every primitive. */
  #sync(ctx: TracePlotContext<BarCalc>): void {
    const { calc } = ctx;
    this.#floor = floorFor(calc, sizeAxis(calc, ctx));
    const style = this.#computeStyle(ctx);
    const radii = cornerRadii(calc, ctx);
    this.#relativeRadius = radii.relative;
    const data: Partial<RectData> = {
      ...barGeometry(calc, this.#floor),
      fill: style.fill,
      borderColor: style.border,
      borderWidth: style.borderWidth,
      cornerRadius: radii.radius,
      // Plotly strokes bar outlines on the edge path (SVG semantics).
      borderAlign: 'center',
      snap: shouldSnap(calc, ctx),
      opacity: traceOpacity(ctx.trace),
    };
    if (!this.#rects) {
      this.#rects = createRectPrimitive(ctx.primitives, data);
      ctx.add(this.#rects);
    } else {
      this.#rects.update(data);
    }
    this.#rects.object.renderOrder = traceRenderOrder(ctx.trace, ctx.index);
    this.#rects.setTransform(ctx.transform);
    this.#syncErrorBars(ctx);
    this.#syncText(ctx);
  }

  /**
   * Labels depend on bar sizes in px, colors and the selection: recompute them all. With
   * `layout.uniformtext`, their size is negotiated with every other bar trace of the chart (E4.6);
   * `uniform` overrides the layout's when another view asks for a refresh.
   */
  #syncText(
    ctx: TracePlotContext<BarCalc>,
    uniform: UniformText = uniformTextOf(ctx.fullLayout),
  ): void {
    const { trace, calc } = ctx;
    this.#textCtx = ctx;
    if (!hasText(trace)) {
      releaseUniformText(ctx.primitives, trace.type, this);
      if (this.#text) ctx.remove(this.#text);
      this.#text = undefined;
      this.#links = [];
      return;
    }
    const style = this.#style ?? this.#computeStyle(ctx);
    const plan = planBarText(trace, calc, {
      transform: ctx.transform,
      xRange: ctx.xaxis?.scale.range,
      yRange: ctx.yaxis?.scale.range,
      fill: style.fill,
      background: toRGBA(String(ctx.fullLayout.plot_bgcolor ?? '#fff')) ?? WHITE,
      formatters: valueFormatters(calc, ctx.xaxis, ctx.yaxis),
      floor: this.#floor,
      selected: selectionSet(ctx.selectedPoints),
      uniformText: uniform,
    });
    // Plotly negotiates per trace type (`_barText_minsize`), across subplots.
    const size = negotiateUniformText(ctx.primitives, trace.type, this, plan.items, uniform, (u) =>
      this.#refreshText(u),
    );
    const labels = plan.labels(size);
    this.#links = labels.some(hasLink) ? labels.filter(hasLink) : [];
    if (!this.#text) {
      this.#text = createTextPrimitive(ctx.primitives, { labels });
      ctx.add(this.#text);
    } else {
      this.#text.update({ labels });
    }
    // Labels draw over this trace's bars, below the next bar trace.
    this.#text.object.renderOrder = traceRenderOrder(ctx.trace, ctx.index) + LAYER.text;
    this.#text.setTransform(ctx.transform);
  }

  /** Redraw the labels from the last context with another trace's `uniformtext` negotiation. */
  #refreshText(uniform: UniformText): void {
    const ctx = this.#textCtx;
    if (ctx && this.#rects) this.#syncText(ctx, uniform);
  }
}

function traceOpacity(trace: FullTrace): number {
  return typeof trace['opacity'] === 'number' ? trace['opacity'] : 1;
}

/** The bar `plot` part: creates one {@link BarView} per visible trace. */
export const barRenderer: TraceRenderer<BarCalc> = {
  create: (ctx) => new BarView(ctx),
};
