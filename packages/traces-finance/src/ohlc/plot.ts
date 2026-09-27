/**
 * `ohlc` renderer (plan E12.2, E22.1): every bar is three segments — the open tick to the left of
 * its center, the low–high line, the close tick to the right (plotly.js `ohlc/plot.js`) — batched
 * into one instanced line primitive per direction (each direction has its own width and dash), so
 * a trace is at most two draw calls whatever its size. Geometry is in linear coordinates: zoom and
 * pan only set the transform (on range-break axes too, ADR-022); restyles and selections
 * re-upload colors only.
 */
import type {
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { traceRenderOrder } from '@mk7s/holochart-traces-basic';
import type { PriceCalc } from '../shared/calc.ts';
import { LineLayer, SegmentBuilder, segmentStyle, type Segments } from '../shared/layers.ts';
import {
  directionStyle,
  rgba,
  selectionAlpha,
  traceOpacity,
  type DirectionStyle,
} from '../shared/style.ts';

/** The segments of the rising (`up`) and falling (`down`) bars of a calc. */
export function ohlcSegments(calc: PriceCalc): { up: Segments; down: Segments } {
  const { drawn, increasing } = calc;
  const up = new SegmentBuilder(3 * drawn.length);
  const down = new SegmentBuilder(3 * drawn.length);
  const tick = calc.slot.halfWidth;
  for (let k = 0; k < drawn.length; k++) {
    const i = drawn[k]!;
    const inc = increasing[i]!;
    const b = inc ? up : down;
    const c = calc.pos[i]! + calc.slot.bPos;
    b.add(c - tick, calc.open[i]!, c, calc.open[i]!, k, inc);
    b.add(c, calc.high[i]!, c, calc.low[i]!, k, inc);
    b.add(c, calc.close[i]!, c + tick, calc.close[i]!, k, inc);
  }
  return { up: up.build(), down: down.build() };
}

function layerStyle(
  segments: Segments,
  style: DirectionStyle,
  alpha: Float32Array | undefined,
  opacity: number,
) {
  const s = { color: rgba(style.color), width: style.width };
  return {
    color: segmentStyle(segments, { up: s, down: s }, alpha).color,
    width: style.width,
    dash: style.dash,
    opacity,
  };
}

class OhlcView implements TraceView<PriceCalc> {
  readonly #up = new LineLayer();
  readonly #down = new LineLayer();
  #segments: { up: Segments; down: Segments } | undefined;

  constructor(ctx: TracePlotContext<PriceCalc>) {
    this.#sync(ctx, true);
  }

  update(ctx: TracePlotContext<PriceCalc>, plan: TraceUpdatePlan): void {
    if (plan.calc || plan.plot || !this.#segments) {
      this.#sync(ctx, true);
      return;
    }
    if (plan.style || plan.selection) this.#sync(ctx, false);
    if (plan.transform) {
      this.#up.setTransform(ctx.transform);
      this.#down.setTransform(ctx.transform);
    }
  }

  #sync(ctx: TracePlotContext<PriceCalc>, geometry: boolean): void {
    const { calc, trace } = ctx;
    if (geometry || !this.#segments) this.#segments = ohlcSegments(calc);
    const alpha = selectionAlpha(calc, ctx.selectedPoints);
    const opacity = traceOpacity(trace);
    const order = traceRenderOrder(trace, ctx.index);
    const layers = [
      [this.#up, this.#segments.up, directionStyle(trace, true)],
      [this.#down, this.#segments.down, directionStyle(trace, false)],
    ] as const;
    for (const [layer, segments, style] of layers) {
      const s = layerStyle(segments, style, alpha, opacity);
      if (geometry) layer.sync(ctx, segments, s, order);
      else layer.restyle(s);
    }
  }

  /** The line layers (tests). */
  get layers(): readonly LineLayer[] {
    return [this.#up, this.#down];
  }
}

/** The ohlc `plot` part: one {@link OhlcView} per visible trace (and per range slider mirror). */
export const ohlcRenderer: TraceRenderer<PriceCalc> = {
  create: (ctx) => new OhlcView(ctx),
};
