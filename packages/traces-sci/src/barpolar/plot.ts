/**
 * `barpolar` rendering (plan E11.5): one instanced annular-sector draw call per trace (the arc
 * primitive) on circular grids, with the outline centered on the edges like Plotly's strokes;
 * bars clipped to the subplot (radial range, sector) by clamping their extents. On polygon grids
 * (`gridshape: 'linear'`) bars follow the grid's edges: batched polygon fills plus an outline.
 */
import {
  createArcPrimitive,
  createLazyFillPrimitive,
  LinePrimitive,
  type ArcPrimitive,
  type LazyFillPrimitive,
} from '@mk7s/holochart-render';
import type {
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { barStyle } from '@mk7s/holochart-traces-basic';
import type { PolarCalc } from '../polar/cross-trace.ts';
import { isAngleInsideSector, TAU } from '../polar/geometry.ts';
import { POLAR_ORDER, traceOrder } from '../polar/order.ts';
import type { PolarSubplot } from '../polar/subplot.ts';
import { subplotTransform } from '../scatterpolar/plot.ts';
import { barPixels, polygonBarRing } from './geometry.ts';

/** `[lo, hi]` ∩ the sector `[s0, s1]` (radians), or `undefined` when they don't meet. */
export function clipAngles(
  lo: number,
  hi: number,
  s0: number,
  s1: number,
): [number, number] | undefined {
  let best: [number, number] | undefined;
  // Try the bar's interval shifted by whole turns; keep the largest overlap.
  const k0 = Math.floor((s0 - hi) / TAU);
  for (let k = k0; k <= k0 + 2; k++) {
    const a = Math.max(lo + k * TAU, s0);
    const b = Math.min(hi + k * TAU, s1);
    if (b > a && (!best || b - a > best[1] - best[0])) best = [a, b];
  }
  return best;
}

const FULL: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: true };

class BarpolarView implements TraceView<PolarCalc> {
  #arcs: ArcPrimitive | undefined;
  #fill: LazyFillPrimitive | undefined;
  #outline: LinePrimitive | undefined;
  #ctx: TracePlotContext<PolarCalc>;
  #subplot: PolarSubplot | undefined;
  #off: (() => void) | undefined;

  constructor(ctx: TracePlotContext<PolarCalc>) {
    this.#ctx = ctx;
    this.#draw(ctx, FULL);
  }

  update(ctx: TracePlotContext<PolarCalc>, plan: TraceUpdatePlan): void {
    this.#ctx = ctx;
    this.#draw(ctx, plan);
  }

  #follow(subplot: PolarSubplot | undefined): void {
    if (subplot === this.#subplot) return;
    this.#off?.();
    this.#subplot = subplot;
    this.#off = subplot?.onChange(() => {
      this.#draw(this.#ctx, FULL);
      this.#ctx.invalidate();
    });
  }

  #draw(ctx: TracePlotContext<PolarCalc>, _plan: TraceUpdatePlan): void {
    const subplot = ctx.calc.subplot;
    this.#follow(subplot);
    const px = subplot ? barPixels(ctx.calc, subplot) : undefined;
    if (!subplot || !px) {
      this.#clear(ctx);
      return;
    }
    const trace = ctx.trace;
    const n = px.rp0.length;
    const style = barStyle(trace, n, null, ctx.fullLayout);
    const transform = subplotTransform(subplot, ctx.viewport.size.height);
    const order = traceOrder(POLAR_ORDER.bars, ctx.index);
    if (subplot.vangles) this.#drawPolygons(ctx, subplot, px, style, transform, order);
    else this.#drawArcs(ctx, subplot, px, style, transform, order);
  }

  #drawArcs(
    ctx: TracePlotContext<PolarCalc>,
    sp: PolarSubplot,
    px: NonNullable<ReturnType<typeof barPixels>>,
    style: ReturnType<typeof barStyle>,
    transform: ReturnType<typeof subplotTransform>,
    order: number,
  ): void {
    this.#dropPolygons(ctx);
    const n = px.rp0.length;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const inner = new Float32Array(n);
    const outer = new Float32Array(n);
    const start = new Float32Array(n);
    const end = new Float32Array(n);
    const bw = style.borderWidth;
    const widthAt = (i: number): number => (typeof bw === 'number' ? bw : (bw[i] ?? 0));
    const border = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let r0 = Math.min(px.rp0[i]!, px.rp1[i]!);
      let r1 = Math.max(px.rp0[i]!, px.rp1[i]!);
      r0 = Math.max(r0, sp.innerRadius);
      r1 = Math.min(r1, sp.radius);
      let angles: [number, number] | undefined = [
        Math.min(px.g0[i]!, px.g1[i]!),
        Math.max(px.g0[i]!, px.g1[i]!),
      ];
      if (!sp.full) angles = clipAngles(angles[0], angles[1], sp.sector[0], sp.sector[1]);
      if (px.visible[i] !== 1 || !(r1 > r0) || !angles) {
        x[i] = NaN;
        continue;
      }
      // Plotly strokes the outline centered on the edges: grow the wedge by half the width.
      const w = widthAt(i);
      inner[i] = Math.max(0, r0 - w / 2);
      outer[i] = r1 + w / 2;
      start[i] = angles[0];
      end[i] = angles[1];
      border[i] = w;
    }
    const data = {
      x,
      y,
      innerRadius: inner,
      outerRadius: outer,
      startAngle: start,
      endAngle: end,
      fill: style.fill,
      borderColor: style.border,
      borderWidth: border,
    };
    if (!this.#arcs) {
      this.#arcs = createArcPrimitive(ctx.primitives, data);
      ctx.add(this.#arcs);
    } else this.#arcs.update(data);
    this.#arcs.setTransform(transform);
    this.#arcs.object.renderOrder = order;
  }

  #drawPolygons(
    ctx: TracePlotContext<PolarCalc>,
    sp: PolarSubplot,
    px: NonNullable<ReturnType<typeof barPixels>>,
    style: ReturnType<typeof barStyle>,
    transform: ReturnType<typeof subplotTransform>,
    order: number,
  ): void {
    if (this.#arcs) ctx.remove(this.#arcs);
    this.#arcs = undefined;
    const vangles = sp.vangles!;
    const n = px.rp0.length;
    const x: number[] = [];
    const y: number[] = [];
    const rings: number[] = [];
    const colors: number[] = [];
    const lx: number[] = [];
    const ly: number[] = [];
    const lineColors: number[] = [];
    const bw = style.borderWidth;
    let lineWidth = 0;
    for (let i = 0; i < n; i++) {
      if (px.visible[i] !== 1) continue;
      const g0 = px.g0[i]!;
      const g1 = px.g1[i]!;
      if (!isAngleInsideSector((g0 + g1) / 2, sp.sector)) continue;
      const r0 = Math.max(Math.min(px.rp0[i]!, px.rp1[i]!), sp.innerRadius);
      const r1 = Math.min(Math.max(px.rp0[i]!, px.rp1[i]!), sp.radius);
      if (!(r1 > r0)) continue;
      const ring = polygonBarRing(r0, r1, g0, g1, vangles);
      rings.push(x.length);
      for (const [vx, vy] of ring) {
        x.push(vx);
        y.push(vy);
      }
      colors.push(...style.fill.subarray(i * 4, i * 4 + 4));
      const w = typeof bw === 'number' ? bw : (bw[i] ?? 0);
      if (w > 0) {
        lineWidth = Math.max(lineWidth, w);
        if (lx.length > 0) {
          lx.push(NaN);
          ly.push(NaN);
          lineColors.push(0, 0, 0, 0);
        }
        for (const [vx, vy] of [...ring, ring[0]!]) {
          lx.push(vx);
          ly.push(vy);
          lineColors.push(...style.border.subarray(i * 4, i * 4 + 4));
        }
      }
    }
    if (rings.length === 0) {
      this.#dropPolygons(ctx);
      return;
    }
    const data = {
      x: Float64Array.from(x),
      y: Float64Array.from(y),
      rings,
      color: Float32Array.from(colors),
    };
    if (!this.#fill) {
      this.#fill = createLazyFillPrimitive(ctx.primitives, data);
      ctx.add(this.#fill);
    } else this.#fill.update(data);
    this.#fill.setTransform(transform);
    this.#fill.object.renderOrder = order;
    if (lineWidth > 0) {
      if (!this.#outline) {
        this.#outline = new LinePrimitive(ctx.primitives);
        ctx.add(this.#outline);
      }
      this.#outline.update({
        x: Float64Array.from(lx),
        y: Float64Array.from(ly),
        color: Float32Array.from(lineColors),
        width: lineWidth,
        join: 'miter',
      });
      this.#outline.setTransform(transform);
      this.#outline.object.renderOrder = order + 0.001;
    } else if (this.#outline) {
      ctx.remove(this.#outline);
      this.#outline = undefined;
    }
  }

  #dropPolygons(ctx: TracePlotContext<PolarCalc>): void {
    if (this.#fill) ctx.remove(this.#fill);
    if (this.#outline) ctx.remove(this.#outline);
    this.#fill = undefined;
    this.#outline = undefined;
  }

  #clear(ctx: TracePlotContext<PolarCalc>): void {
    if (this.#arcs) ctx.remove(this.#arcs);
    this.#arcs = undefined;
    this.#dropPolygons(ctx);
  }

  dispose(): void {
    this.#off?.();
    this.#off = undefined;
  }
}

export const barpolarRenderer: TraceRenderer<PolarCalc> = {
  create: (ctx) => new BarpolarView(ctx),
};
