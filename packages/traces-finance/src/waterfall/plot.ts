/**
 * `waterfall` renderer (plan E12.4, E22.1): bar's renderer draws the bars and labels (see
 * `bars/view.ts`); the connector lines are two-point segments in one line primitive (plotly.js
 * `waterfall/plot.js` `plotConnectors`), in linear coordinates, so zoom and pan only set the
 * transform. Connectors draw over the bars and under the labels.
 *
 * - `between`: from each bar's end (its far edge on the size axis) across the gap to the next
 *   bar.
 * - `spanning`: also across each bar at its end, and across each relative bar (but the first) at
 *   its start, so the line runs through the whole waterfall.
 *
 * Plotly lengthens bars by half the connector width in `between` mode so a thick connector stays
 * flush with the bar ends; bars keep their exact size here.
 *
 * Extruded (`depth`, 2.5D) the connectors lie on the plane of the bars' front faces, running along
 * the fronts of the bar ends.
 */
import type { TracePlotContext, TraceUpdatePlan } from '@mk7s/holochart-runtime';
import { traceRenderOrder } from '@mk7s/holochart-traces-basic';
import { barLikeRenderer, type BarLikeLayer } from '../bars/view.ts';
import { LineLayer, SegmentBuilder, type SegmentStyle, type Segments } from '../shared/layers.ts';
import { rgba, traceOpacity } from '../shared/style.ts';
import type { WaterfallCalc } from './calc.ts';
import { waterfallBarTrace } from './style.ts';

/** Draw order of connectors within the trace: over the bars (0), under the labels (0.5). */
const CONNECTOR_LAYER = 0.3;

/**
 * The connector segments of a laid-out waterfall (linear coordinates), for connector `mode`.
 */
export function waterfallConnectors(calc: WaterfallCalc, mode: unknown): Segments {
  const n = calc.length;
  const out = new SegmentBuilder(3 * n);
  const horizontal = calc.orientation === 'h';
  const { center, width } = calc.bars;
  // A segment across the position axis at size `s`, from position `p0` to `p1`.
  const add = (p0: number, p1: number, s: number, i: number): void => {
    if (horizontal) out.add(s, p0, s, p1, i, 1);
    else out.add(p0, s, p1, s, i, 1);
  };
  for (let i = 0; i < n; i++) {
    // No line between bars without a value (Plotly draws the last bar's own spans).
    if (i !== n - 1 && !calc.connectNext[i]) continue;
    const p0 = center[i]! - width[i]! / 2;
    const p1 = center[i]! + width[i]! / 2;
    const s0 = calc.s0[i]!;
    const s1 = calc.s1[i]!;
    if (![p0, p1, s0, s1].every(Number.isFinite)) continue;
    if (mode === 'spanning') {
      if (!calc.isSum[i] && i > 0) add(p1, p0, s0, i);
      if (calc.isSum[i] || i < n - 1) add(p0, p1, s1, i);
    }
    if (i + 1 < n) {
      const next = center[i + 1]! - width[i + 1]! / 2;
      if (Number.isFinite(next) && Number.isFinite(calc.s0[i + 1]!)) add(p1, next, s1, i);
    }
  }
  return out.build();
}

interface ConnectorLine {
  readonly visible: boolean;
  readonly mode: unknown;
  readonly color: unknown;
  readonly width: number;
  readonly dash: string;
}

function connectorOf(ctx: TracePlotContext<WaterfallCalc>): ConnectorLine {
  const c = (ctx.trace['connector'] ?? {}) as {
    visible?: unknown;
    mode?: unknown;
    line?: { color?: unknown; width?: unknown; dash?: unknown };
  };
  const width = typeof c.line?.width === 'number' ? c.line.width : 0;
  return {
    visible: c.visible !== false && width > 0,
    mode: c.mode,
    color: c.line?.color,
    width,
    dash: typeof c.line?.dash === 'string' ? c.line.dash : 'solid',
  };
}

/** The connector layer of one waterfall view. */
class ConnectorLayer implements BarLikeLayer<WaterfallCalc> {
  readonly #line = new LineLayer();
  #mode: unknown;

  lifted() {
    return [this.#line.primitive];
  }

  update(ctx: TracePlotContext<WaterfallCalc>, plan: TraceUpdatePlan): void {
    const c = connectorOf(ctx);
    if (!c.visible) {
      this.#line.remove(ctx);
      return;
    }
    const style: SegmentStyle = {
      color: rgba(c.color),
      width: c.width,
      dash: c.dash,
      opacity: traceOpacity(ctx.trace),
    };
    if (plan.calc || plan.plot || !this.#line.primitive || c.mode !== this.#mode) {
      this.#mode = c.mode;
      const order = traceRenderOrder(ctx.trace, ctx.index) + CONNECTOR_LAYER;
      this.#line.sync(ctx, waterfallConnectors(ctx.calc, c.mode), style, order);
      return;
    }
    if (plan.style) this.#line.restyle(style);
    if (plan.transform) this.#line.setTransform(ctx.transform);
  }
}

/** The waterfall `plot` part. */
export const waterfallRenderer = barLikeRenderer<WaterfallCalc>({
  barTrace: (ctx) => waterfallBarTrace(ctx.trace, ctx.calc, ctx.xaxis, ctx.yaxis),
  layers: () => [new ConnectorLayer()],
});
