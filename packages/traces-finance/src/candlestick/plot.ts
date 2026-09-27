/**
 * `candlestick` renderer (plan E12.3, E22.1): two draw calls whatever the candle count — every
 * body in one instanced {@link RectPrimitive} (fill and outline per candle, the outline centered
 * on the edge like Plotly's stroke), and every wick, whisker cap and flat body (open = close, which
 * a rect cannot show) in one instanced line primitive with a color and width per segment. Geometry
 * is in linear coordinates, so zoom and pan only set transforms (on range-break axes too, where
 * candles keep their width, ADR-022); restyles and selections re-upload colors and widths only.
 */
import {
  createRectPrimitive,
  type DataTransform,
  type RectData,
  type RectPrimitive,
} from '@mk7s/holochart-render';
import type {
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { traceRenderOrder } from '@mk7s/holochart-traces-basic';
import type { PriceCalc } from '../shared/calc.ts';
import { LineLayer, SegmentBuilder, segmentStyle, type Segments } from '../shared/layers.ts';
import { directionStyle, putColor, rgba, selectionAlpha, traceOpacity } from '../shared/style.ts';

/** Draw order within the trace: wicks, then bodies on top. */
const BODY_LAYER = 0.1;

/** Body corners (linear) of the drawn candles, in `calc.drawn` order. */
export interface CandleBodies {
  readonly x0: Float64Array;
  readonly y0: Float64Array;
  readonly x1: Float64Array;
  readonly y1: Float64Array;
}

/** Body rects and wick segments of a calc. */
export function candleGeometry(
  calc: PriceCalc,
  whiskerwidth: number,
): { bodies: CandleBodies; wicks: Segments } {
  const { drawn, increasing } = calc;
  const n = drawn.length;
  const bodies = {
    x0: new Float64Array(n),
    y0: new Float64Array(n),
    x1: new Float64Array(n),
    y1: new Float64Array(n),
  };
  const wicks = new SegmentBuilder(2 * n);
  const { bPos, halfWidth } = calc.slot;
  const cap = halfWidth * whiskerwidth;
  for (let k = 0; k < n; k++) {
    const i = drawn[k]!;
    const up = increasing[i]!;
    const c = calc.pos[i]! + bPos;
    const o = calc.open[i]!;
    const cl = calc.close[i]!;
    const h = calc.high[i]!;
    const l = calc.low[i]!;
    bodies.x0[k] = c - halfWidth;
    bodies.x1[k] = c + halfWidth;
    bodies.y0[k] = o;
    bodies.y1[k] = cl;
    // Plotly's box path: wicks from the body to the high and the low, then the caps.
    wicks.add(c, Math.max(o, cl), c, h, k, up);
    wicks.add(c, Math.min(o, cl), c, l, k, up);
    if (cap > 0) {
      wicks.add(c - cap, h, c + cap, h, k, up);
      wicks.add(c - cap, l, c + cap, l, k, up);
    }
    // A flat body: its outline is a line across the candle.
    if (o === cl) wicks.add(c - halfWidth, o, c + halfWidth, o, k, up);
  }
  return { bodies, wicks: wicks.build() };
}

/** Per-candle fill, outline color and outline width of the bodies. */
function bodyStyle(
  calc: PriceCalc,
  ctx: TracePlotContext<PriceCalc>,
  alpha: Float32Array | undefined,
): Pick<RectData, 'fill' | 'borderColor' | 'borderWidth' | 'opacity'> {
  const n = calc.drawn.length;
  const styles = [directionStyle(ctx.trace, false), directionStyle(ctx.trace, true)] as const;
  const fills = styles.map((s) => rgba(s.fillcolor));
  const lines = styles.map((s) => rgba(s.color));
  const fill = new Float32Array(4 * n);
  const borderColor = new Float32Array(4 * n);
  const borderWidth = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const d = calc.increasing[calc.drawn[k]!]!;
    const a = alpha ? alpha[k]! : 1;
    putColor(fill, k, fills[d]!, a);
    putColor(borderColor, k, lines[d]!, a);
    borderWidth[k] = styles[d]!.width;
  }
  return { fill, borderColor, borderWidth, opacity: traceOpacity(ctx.trace) };
}

function wickStyle(
  wicks: Segments,
  ctx: TracePlotContext<PriceCalc>,
  alpha: Float32Array | undefined,
) {
  const style = (increasing: boolean) => {
    const s = directionStyle(ctx.trace, increasing);
    return { color: rgba(s.color), width: s.width };
  };
  const { color, width } = segmentStyle(wicks, { up: style(true), down: style(false) }, alpha);
  return { color, width, dash: 'solid', opacity: traceOpacity(ctx.trace) };
}

class CandlestickView implements TraceView<PriceCalc> {
  #bodies: RectPrimitive | undefined;
  readonly #wicks = new LineLayer();
  #geometry: ReturnType<typeof candleGeometry> | undefined;

  constructor(ctx: TracePlotContext<PriceCalc>) {
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<PriceCalc>, plan: TraceUpdatePlan): void {
    if (plan.calc || plan.plot || !this.#geometry) {
      this.#sync(ctx);
      return;
    }
    if (plan.style || plan.selection) {
      const alpha = selectionAlpha(ctx.calc, ctx.selectedPoints);
      this.#bodies?.update(bodyStyle(ctx.calc, ctx, alpha));
      this.#wicks.restyle(wickStyle(this.#geometry.wicks, ctx, alpha));
    }
    if (plan.transform) this.#setTransform(ctx.transform);
  }

  #sync(ctx: TracePlotContext<PriceCalc>): void {
    const { calc, trace } = ctx;
    const whiskerwidth = typeof trace['whiskerwidth'] === 'number' ? trace['whiskerwidth'] : 0;
    const geometry = candleGeometry(calc, whiskerwidth);
    this.#geometry = geometry;
    const alpha = selectionAlpha(calc, ctx.selectedPoints);
    const order = traceRenderOrder(trace, ctx.index);
    this.#wicks.sync(ctx, geometry.wicks, wickStyle(geometry.wicks, ctx, alpha), order);
    if (calc.drawn.length === 0) {
      if (this.#bodies) ctx.remove(this.#bodies);
      this.#bodies = undefined;
      return;
    }
    const data: Partial<RectData> = {
      ...geometry.bodies,
      ...bodyStyle(calc, ctx, alpha),
      borderAlign: 'center',
    };
    if (!this.#bodies) {
      this.#bodies = createRectPrimitive(ctx.primitives, data);
      ctx.add(this.#bodies);
    } else {
      this.#bodies.update(data);
    }
    this.#bodies.object.renderOrder = order + BODY_LAYER;
    this.#bodies.setTransform(ctx.transform);
  }

  #setTransform(transform: Readonly<DataTransform>): void {
    this.#bodies?.setTransform(transform);
    this.#wicks.setTransform(transform);
  }

  /** The body rects and the wick line layer (tests). */
  get parts(): { bodies: RectPrimitive | undefined; wicks: LineLayer } {
    return { bodies: this.#bodies, wicks: this.#wicks };
  }
}

/**
 * The candlestick `plot` part: one {@link CandlestickView} per visible trace (and per range slider
 * mirror).
 */
export const candlestickRenderer: TraceRenderer<PriceCalc> = {
  create: (ctx) => new CandlestickView(ctx),
};
