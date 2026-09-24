/**
 * `box` renderer (plan E10.4, E22.1): the box bodies as one batched fill, the outlines, medians,
 * whiskers and caps as one batch of polylines, the dashed mean lines (and ± sd diamonds) as
 * another, and the points as one marker set (plotly.js `box/plot.js` and `box/style.js`). Geometry
 * is in linear coordinates, so zoom and pan only set the transform.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type {
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { traceRenderOrder } from '@mk7s/holochart-traces-basic';
import type { BoxCalc } from './calc.ts';
import { boxShapes, type BoxShapeOptions } from './geometry.ts';
import { FillLayer, LineLayer, PointLayer } from './layers.ts';
import { pointStyle, rgba, traceOpacity } from './style.ts';

/** Draw order within the trace (added to its render order). */
const LAYER = { outline: 0.1, mean: 0.2, points: 0.3 } as const;

function numberOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** Plotly's dash for mean lines: `2·width, width` px. */
export function meanDash(width: number): string {
  return `${2 * width}px,${width}px`;
}

/** The shape options of a box trace (Plotly's `plotBoxAndWhiskers` / `plotBoxMean` inputs). */
export function boxShapeOptions(calc: BoxCalc, trace: FullTrace): BoxShapeOptions {
  const { bPos, bdPos } = calc.offsets;
  const sdmode = trace['sizemode'] === 'sd';
  const boxmean = trace['boxmean'];
  return {
    bPos,
    bdPos: [bdPos, bdPos],
    wdPos: bdPos * numberOr(trace['whiskerwidth'], 0),
    notched: trace['notched'] === true,
    notchwidth: numberOr(trace['notchwidth'], 0.25),
    sdmode,
    showWhiskers: trace['showwhiskers'] !== false,
    // Plotly: whiskers reach min / max without fences (sd mode) or without points.
    useExtremes: sdmode || calc.mode === false,
    mean: boxmean === 'sd' ? 'sd' : boxmean === true ? 'line' : false,
  };
}

class BoxView implements TraceView<BoxCalc> {
  readonly #body = new FillLayer();
  readonly #outline = new LineLayer();
  readonly #mean = new LineLayer();
  readonly #points = new PointLayer();

  constructor(ctx: TracePlotContext<BoxCalc>) {
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<BoxCalc>, plan: TraceUpdatePlan): void {
    if (plan.calc || plan.plot || plan.style || plan.selection) {
      this.#sync(ctx);
      return;
    }
    if (plan.transform) {
      const t = ctx.transform;
      this.#body.setTransform(t);
      this.#outline.setTransform(t);
      this.#mean.setTransform(t);
      this.#points.setTransform(t);
    }
  }

  #sync(ctx: TracePlotContext<BoxCalc>): void {
    const { calc, trace } = ctx;
    const order = traceRenderOrder(trace, ctx.index);
    const opacity = traceOpacity(trace);
    const shapes = boxShapes(calc, boxShapeOptions(calc, trace));
    const line = (trace['line'] ?? {}) as { color?: unknown; width?: unknown };
    const lineColor = rgba(line.color);
    const width = numberOr(line.width, 2);
    this.#body.sync(ctx, shapes.bodies, rgba(trace['fillcolor']), opacity, order);
    this.#outline.sync(
      ctx,
      shapes.outlines,
      { color: lineColor, width, opacity },
      order + LAYER.outline,
    );
    this.#mean.sync(
      ctx,
      shapes.means,
      { color: lineColor, width, dash: meanDash(width), opacity },
      order + LAYER.mean,
    );
    const selected = ctx.selectedPoints ? new Set(ctx.selectedPoints) : null;
    this.#points.sync(ctx, pointStyle(calc, trace, selected), opacity, order + LAYER.points);
  }
}

/** The box `plot` part: one {@link BoxView} per visible trace. */
export const boxRenderer: TraceRenderer<BoxCalc> = {
  create: (ctx) => new BoxView(ctx),
};
