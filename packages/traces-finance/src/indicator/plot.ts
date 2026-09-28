/**
 * `indicator` renderer (plan E12.7): an angular gauge is ONE instanced {@link ArcPrimitive}
 * (background, steps, value bar, threshold, outline and tick marks, in that order), a bullet
 * gauge ONE instanced {@link RectPrimitive}, and every text (number, delta, title, tick labels)
 * one batched {@link TextPrimitive}. Indicators are domain traces: they draw into the overlay
 * viewport, whose world units are container px with a bottom-left origin, so container `(x, y)` is
 * world `(x, height − y)`.
 *
 * Every update rebuilds the (few) instances in place. Transitions need nothing here: the runtime's
 * animation engine writes the in-between `value` (and `delta.reference`) on every frame, so the
 * number counts up, formatted each frame, and the gauge bar sweeps (see `layout.ts` for the kept
 * number scale that stops the digits from jittering).
 */
import { localeOf, toRGBA } from '@mk7s/holochart-core';
import {
  createArcPrimitive,
  createRectPrimitive,
  createTextPrimitive,
  subscribeFontChanges,
  type ArcData,
  type ArcPrimitive,
  type Primitive,
  type RectData,
  type RectPrimitive,
  type RGBA,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type { TracePlotContext, TraceRenderer, TraceView } from '@mk7s/holochart-runtime';
import type { IndicatorCalc } from './calc.ts';
import {
  layoutIndicator,
  LINE_HEIGHT,
  type GaugeArc,
  type GaugeRect,
  type IndicatorLayout,
  type IndicatorLayoutCache,
} from './layout.ts';

const CLEAR: RGBA = [0, 0, 0, 0];

/**
 * Render orders in the overlay, like pie's: every primitive stays in [-10, 0), below figure
 * components (title, legend, annotations); the gauge, then the text; trace order within each.
 */
const ORDER = { gauge: -9, text: -3 } as const;
const orderOf = (layer: number, index: number): number => layer + Math.min(index, 999) * 1e-3;

const rgba = (color: string): RGBA => (color ? (toRGBA(color) ?? CLEAR) : CLEAR);

/** Arc primitive instances of an angular gauge, in world px (`height` flips y). */
export function gaugeArcData(arcs: readonly GaugeArc[], height: number): Partial<ArcData> {
  const n = arcs.length;
  const data = {
    x: new Float64Array(n),
    y: new Float64Array(n),
    innerRadius: new Float32Array(n),
    outerRadius: new Float32Array(n),
    startAngle: new Float32Array(n),
    endAngle: new Float32Array(n),
    fill: new Float32Array(n * 4),
    borderColor: new Float32Array(n * 4),
    borderWidth: new Float32Array(n),
  };
  arcs.forEach((a, i) => {
    data.x[i] = a.cx;
    data.y[i] = height - a.cy;
    data.innerRadius[i] = a.r0;
    data.outerRadius[i] = a.r1;
    data.startAngle[i] = a.a0;
    data.endAngle[i] = a.a1;
    data.fill.set(rgba(a.fill), i * 4);
    data.borderColor.set(rgba(a.border), i * 4);
    data.borderWidth[i] = a.borderWidth;
  });
  return data;
}

/** Rect primitive instances of a bullet gauge, in world px (`height` flips y). */
export function gaugeRectData(rects: readonly GaugeRect[], height: number): Partial<RectData> {
  const n = rects.length;
  const data = {
    x0: new Float64Array(n),
    y0: new Float64Array(n),
    x1: new Float64Array(n),
    y1: new Float64Array(n),
    fill: new Float32Array(n * 4),
    borderColor: new Float32Array(n * 4),
    borderWidth: new Float32Array(n),
  };
  rects.forEach((r, i) => {
    data.x0[i] = r.x0;
    data.x1[i] = r.x1;
    data.y0[i] = height - r.y1;
    data.y1[i] = height - r.y0;
    data.fill.set(rgba(r.fill), i * 4);
    data.borderColor.set(rgba(r.border), i * 4);
    data.borderWidth[i] = r.borderWidth;
  });
  return { ...data, borderAlign: 'center' };
}

/** Text labels of an indicator, in world px. */
export function indicatorTextLabels(layout: IndicatorLayout, height: number): TextLabel[] {
  return layout.texts.map((t) => {
    const label: TextLabel = {
      text: t.text,
      x: t.x,
      y: height - t.y,
      font: t.font,
      color: rgba(t.color),
      anchorX: t.anchorX,
      anchorY: 'baseline',
      align: t.anchorX,
      angle: t.angle,
      lineHeight: LINE_HEIGHT,
    };
    if (t.runs) label.runs = t.runs;
    return label;
  });
}

class IndicatorView implements TraceView<IndicatorCalc> {
  #arcs: ArcPrimitive | undefined;
  #rects: RectPrimitive | undefined;
  #text: TextPrimitive | undefined;
  /** Plotly's kept number scale and offsets (see `layout.ts`). */
  readonly #cache: IndicatorLayoutCache = new Map();
  /**
   * Until a web font (e.g. the default TeX Gyre Heros face) has loaded, text is measured with a
   * fallback font; the chart re-runs layout when it arrives. Kept scales measured before then must
   * go, or the smallest one (a wider fallback, e.g. on Linux) sticks.
   */
  readonly #unsubscribeFonts = subscribeFontChanges(() => this.#cache.clear());

  constructor(ctx: TracePlotContext<IndicatorCalc>) {
    this.#sync(ctx);
  }

  dispose(): void {
    this.#unsubscribeFonts();
  }

  update(ctx: TracePlotContext<IndicatorCalc>): void {
    this.#sync(ctx);
  }

  #sync(ctx: TracePlotContext<IndicatorCalc>): void {
    const rect = ctx.domain?.rect;
    const height = ctx.viewport.size.height;
    const layout = rect
      ? layoutIndicator(ctx.trace, ctx.calc, {
          domain: rect,
          plotWidth: ctx.plotArea?.width ?? rect.width,
          cache: this.#cache,
          locale: localeOf(ctx.fullLayout),
        })
      : undefined;
    const arcs = layout?.arcs ?? [];
    const rects = layout?.rects ?? [];

    if (arcs.length === 0) this.#arcs = this.#drop(ctx, this.#arcs);
    else {
      const data = gaugeArcData(arcs, height);
      if (!this.#arcs) {
        this.#arcs = createArcPrimitive(ctx.primitives, data);
        ctx.add(this.#arcs);
      } else this.#arcs.update(data);
      this.#arcs.object.renderOrder = orderOf(ORDER.gauge, ctx.index);
      this.#arcs.setTransform(ctx.transform);
    }

    if (rects.length === 0) this.#rects = this.#drop(ctx, this.#rects);
    else {
      const data = gaugeRectData(rects, height);
      if (!this.#rects) {
        this.#rects = createRectPrimitive(ctx.primitives, data);
        ctx.add(this.#rects);
      } else this.#rects.update(data);
      this.#rects.object.renderOrder = orderOf(ORDER.gauge, ctx.index);
      this.#rects.setTransform(ctx.transform);
    }

    const labels = layout ? indicatorTextLabels(layout, height) : [];
    if (labels.length === 0) this.#text = this.#drop(ctx, this.#text);
    else {
      if (!this.#text) {
        this.#text = createTextPrimitive(ctx.primitives, { labels });
        ctx.add(this.#text);
      } else this.#text.update({ labels });
      this.#text.object.renderOrder = orderOf(ORDER.text, ctx.index);
      this.#text.setTransform(ctx.transform);
    }
  }

  #drop<T>(ctx: TracePlotContext<IndicatorCalc>, primitive: Primitive<T> | undefined): undefined {
    if (primitive) ctx.remove(primitive);
    return undefined;
  }
}

/** The indicator `plot` part: one {@link IndicatorView} per visible indicator. */
export const indicatorRenderer: TraceRenderer<IndicatorCalc> = {
  create: (ctx) => new IndicatorView(ctx),
};
