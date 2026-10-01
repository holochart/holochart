/**
 * `funnel` renderer (plan E12.5, E22.1): bar's renderer draws the bars and labels (see
 * `bars/view.ts`); the connectors between stages (plotly.js `funnel/plot.js`
 * `plotConnectorRegions` / `plotConnectorLines`) are trapezoids from each bar's far edge to the
 * next bar's near edge — all of a trace in one batched polygon fill (the fill primitive, loaded on
 * first use) — and, with `connector.line.width`, lines along their two slanted sides in one line
 * primitive. Geometry is in linear coordinates, so zoom and pan only set the transform. Connectors
 * draw under the bars, as in Plotly. Extruded (`depth`, 2.5D) they lie on the plane of the bars'
 * front faces, joining the fronts of consecutive stages.
 */
import { createLazyFillPrimitive, type LazyFillPrimitive } from '@mk7s/holochart-render';
import type { TracePlotContext, TraceUpdatePlan } from '@mk7s/holochart-runtime';
import { traceRenderOrder } from '@mk7s/holochart-traces-basic';
import { barLikeRenderer, type BarLikeLayer } from '../bars/view.ts';
import { LineLayer, SegmentBuilder, type SegmentStyle, type Segments } from '../shared/layers.ts';
import { rgba, traceOpacity } from '../shared/style.ts';
import type { FunnelCalc } from './calc.ts';
import { funnelBarTrace } from './style.ts';

/** Draw order of the connector regions and lines within the trace: under the bars (0). */
const REGION_LAYER = -0.2;
const LINE_LAYER = -0.1;

/** Connector regions of a laid-out funnel: 4 vertices per region (linear coordinates). */
export interface FunnelRegions {
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Start vertex of each region. */
  readonly rings: number[];
  /** The two slanted sides of every region. */
  readonly lines: Segments;
}

/**
 * The connector regions and side lines between each stage and the next (Plotly: from bar `i`'s
 * edge toward the next stage, to the next bar's facing edge), skipped between stages without a
 * value.
 */
export function funnelConnectors(calc: FunnelCalc): FunnelRegions {
  const n = calc.length;
  const x: number[] = [];
  const y: number[] = [];
  const rings: number[] = [];
  const lines = new SegmentBuilder(2 * n);
  const horizontal = calc.orientation === 'h';
  const { center, width } = calc.bars;
  // A point at position `p` and size `s`.
  const put = (p: number, s: number): void => {
    x.push(horizontal ? s : p);
    y.push(horizontal ? p : s);
  };
  for (let i = 0; i + 1 < n; i++) {
    if (!calc.connectNext[i]) continue;
    const p1 = center[i]! + width[i]! / 2;
    const q0 = center[i + 1]! - width[i + 1]! / 2;
    const [a0, a1, b0, b1] = [calc.s0[i]!, calc.s1[i]!, calc.s0[i + 1]!, calc.s1[i + 1]!];
    if (![p1, q0, a0, a1, b0, b1].every(Number.isFinite)) continue;
    rings.push(x.length);
    put(p1, a0);
    put(q0, b0);
    put(q0, b1);
    put(p1, a1);
    if (horizontal) {
      lines.add(a0, p1, b0, q0, i, 1);
      lines.add(a1, p1, b1, q0, i, 1);
    } else {
      lines.add(p1, a1, q0, b1, i, 1);
      lines.add(p1, a0, q0, b0, i, 1);
    }
  }
  return { x: Float64Array.from(x), y: Float64Array.from(y), rings, lines: lines.build() };
}

interface Connector {
  readonly visible: boolean;
  readonly fillcolor: unknown;
  readonly lineWidth: number;
  readonly line: SegmentStyle;
}

function connectorOf(ctx: TracePlotContext<FunnelCalc>): Connector {
  const c = (ctx.trace['connector'] ?? {}) as {
    visible?: unknown;
    fillcolor?: unknown;
    line?: { color?: unknown; width?: unknown; dash?: unknown };
  };
  const width = typeof c.line?.width === 'number' ? c.line.width : 0;
  return {
    visible: c.visible !== false,
    fillcolor: c.fillcolor,
    lineWidth: width,
    line: {
      color: rgba(c.line?.color),
      width,
      dash: typeof c.line?.dash === 'string' ? c.line.dash : 'solid',
      opacity: traceOpacity(ctx.trace),
    },
  };
}

/** The connector regions and lines of one funnel view. */
class ConnectorLayer implements BarLikeLayer<FunnelCalc> {
  #fill: LazyFillPrimitive | undefined;
  readonly #lines = new LineLayer();
  #regions: FunnelRegions | undefined;

  update(ctx: TracePlotContext<FunnelCalc>, plan: TraceUpdatePlan): void {
    const c = connectorOf(ctx);
    if (!c.visible) {
      this.#remove(ctx);
      return;
    }
    const order = traceRenderOrder(ctx.trace, ctx.index);
    const rebuild = plan.calc || plan.plot || !this.#regions;
    if (rebuild) this.#regions = funnelConnectors(ctx.calc);
    const regions = this.#regions!;
    const fill = { color: rgba(c.fillcolor), opacity: traceOpacity(ctx.trace) };
    if (regions.rings.length === 0) {
      if (this.#fill) ctx.remove(this.#fill);
      this.#fill = undefined;
    } else if (!this.#fill) {
      this.#fill = createLazyFillPrimitive(ctx.primitives, {
        x: regions.x,
        y: regions.y,
        rings: regions.rings,
        ...fill,
      });
      ctx.add(this.#fill);
    } else if (rebuild) {
      this.#fill.update({ x: regions.x, y: regions.y, rings: regions.rings, ...fill });
    } else if (plan.style) {
      this.#fill.update(fill);
    }
    if (this.#fill) {
      this.#fill.object.renderOrder = order + REGION_LAYER;
      this.#fill.setTransform(ctx.transform);
    }
    if (!(c.lineWidth > 0)) this.#lines.remove(ctx);
    else if (rebuild || !this.#lines.primitive) {
      this.#lines.sync(ctx, regions.lines, c.line, order + LINE_LAYER);
    } else {
      if (plan.style) this.#lines.restyle(c.line);
      if (plan.transform) this.#lines.setTransform(ctx.transform);
    }
  }

  lifted() {
    return [this.#fill, this.#lines.primitive];
  }

  #remove(ctx: TracePlotContext<FunnelCalc>): void {
    if (this.#fill) ctx.remove(this.#fill);
    this.#fill = undefined;
    this.#lines.remove(ctx);
  }
}

/** The funnel `plot` part. */
export const funnelRenderer = barLikeRenderer<FunnelCalc>({
  barTrace: (ctx) => funnelBarTrace(ctx.trace, ctx.calc, ctx.xaxis, ctx.yaxis),
  layers: () => [new ConnectorLayer()],
});
