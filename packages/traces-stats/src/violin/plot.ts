/**
 * `violin` renderer (plan E10.5): the density bodies as one batched fill and one batch of outlines,
 * the inner box (fill, outline, median, whiskers) and dashed mean lines, and the points as one
 * marker set (plotly.js `violin/plot.js`, `violin/style.js`). Geometry is in linear coordinates,
 * so zoom and pan only set the transform.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type {
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { traceRenderOrder } from '@mk7s/holochart-traces-basic';
import { boxShapes, type BoxShapeOptions, type Polylines } from '../box/geometry.ts';
import { FillLayer, LineLayer, PointLayer } from '../box/layers.ts';
import { meanDash } from '../box/plot.ts';
import { pointStyle, rgba, traceOpacity } from '../box/style.ts';
import type { ViolinCalc } from './calc.ts';
import { violinShapes, type ViolinSide } from './geometry.ts';

/** Draw order within the trace (added to its render order). */
const LAYER = { outline: 0.1, box: 0.2, boxOutline: 0.3, mean: 0.4, points: 0.5 } as const;

function objectAt(v: unknown, key: string): Record<string, unknown> {
  const c = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;
  return c !== null && typeof c === 'object' ? (c as Record<string, unknown>) : {};
}

function numberOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** The violin's side. */
export function violinSide(trace: FullTrace): ViolinSide {
  const side = trace['side'];
  return side === 'positive' || side === 'negative' ? side : 'both';
}

/** The inner box's shape options (Plotly: `bdPos · box.width`, halved on one side for split violins). */
export function innerBoxOptions(calc: ViolinCalc, trace: FullTrace): BoxShapeOptions {
  const { bPos, bdPos } = calc.offsets;
  const width = numberOr(objectAt(trace, 'box')['width'], 0.25);
  const side = violinSide(trace);
  const half = (bdPos * width) / 2;
  return {
    bPos,
    bdPos:
      side === 'both'
        ? [bdPos * width, bdPos * width]
        : side === 'positive'
          ? [0, half]
          : [half, 0],
    wdPos: 0,
    notched: false,
    notchwidth: 0,
    sdmode: false,
    showWhiskers: true,
    useExtremes: false,
    mean: objectAt(trace, 'meanline')['visible'] === true ? 'line' : false,
  };
}

/** Concatenate polylines. */
function joinLines(a: Polylines, b: Polylines): Polylines {
  const starts = new Int32Array(a.starts.length + b.starts.length);
  starts.set(a.starts);
  for (let i = 0; i < b.starts.length; i++) starts[a.starts.length + i] = b.starts[i]! + a.x.length;
  const x = new Float64Array(a.x.length + b.x.length);
  const y = new Float64Array(a.y.length + b.y.length);
  x.set(a.x);
  x.set(b.x, a.x.length);
  y.set(a.y);
  y.set(b.y, a.y.length);
  return { x, y, starts };
}

class ViolinView implements TraceView<ViolinCalc> {
  readonly #body = new FillLayer();
  readonly #outline = new LineLayer();
  readonly #box = new FillLayer();
  readonly #boxOutline = new LineLayer();
  readonly #mean = new LineLayer();
  readonly #points = new PointLayer();

  constructor(ctx: TracePlotContext<ViolinCalc>) {
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<ViolinCalc>, plan: TraceUpdatePlan): void {
    if (plan.calc || plan.plot || plan.style || plan.selection) {
      this.#sync(ctx);
      return;
    }
    if (plan.transform) {
      const t = ctx.transform;
      for (const layer of [this.#body, this.#outline, this.#box, this.#boxOutline, this.#mean]) {
        layer.setTransform(t);
      }
      this.#points.setTransform(t);
    }
  }

  #sync(ctx: TracePlotContext<ViolinCalc>): void {
    const { calc, trace } = ctx;
    const order = traceRenderOrder(trace, ctx.index);
    const opacity = traceOpacity(trace);
    const box = objectAt(trace, 'box');
    const boxLine = objectAt(box, 'line');
    const meanline = objectAt(trace, 'meanline');
    const boxVisible = box['visible'] === true;
    const meanVisible = meanline['visible'] === true;
    const line = objectAt(trace, 'line');
    const lineWidth = numberOr(line['width'], 2);

    const shapes = violinShapes(calc, violinSide(trace), meanVisible && !boxVisible);
    this.#body.sync(ctx, shapes.bodies, rgba(trace['fillcolor']), opacity, order);
    this.#outline.sync(
      ctx,
      shapes.outlines,
      { color: rgba(line['color']), width: lineWidth, opacity },
      order + LAYER.outline,
    );

    let means = shapes.means;
    if (boxVisible) {
      const inner = boxShapes(calc, innerBoxOptions(calc, trace));
      this.#box.sync(ctx, inner.bodies, rgba(box['fillcolor']), opacity, order + LAYER.box);
      this.#boxOutline.sync(
        ctx,
        inner.outlines,
        { color: rgba(boxLine['color']), width: numberOr(boxLine['width'], lineWidth), opacity },
        order + LAYER.boxOutline,
      );
      means = joinLines(means, inner.means);
    } else {
      this.#box.remove(ctx);
      this.#boxOutline.remove(ctx);
    }
    const meanWidth = numberOr(meanline['width'], lineWidth);
    this.#mean.sync(
      ctx,
      meanVisible ? means : undefined,
      { color: rgba(meanline['color']), width: meanWidth, dash: meanDash(meanWidth), opacity },
      order + LAYER.mean,
    );
    const selected = ctx.selectedPoints ? new Set(ctx.selectedPoints) : null;
    this.#points.sync(ctx, pointStyle(calc, trace, selected), opacity, order + LAYER.points);
  }
}

/** The violin `plot` part: one {@link ViolinView} per visible trace. */
export const violinRenderer: TraceRenderer<ViolinCalc> = {
  create: (ctx) => new ViolinView(ctx),
};
