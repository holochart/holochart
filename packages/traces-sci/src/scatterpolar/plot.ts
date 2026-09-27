/**
 * `scatterpolar` rendering (plan E11.4). Points are placed in geometric px on their subplot (see
 * `polar/positions.ts`) and drawn into the overlay with a translation to the subplot center:
 *
 * - **Markers and text** are scatter's own view, fed a px-space scatter calc: symbols, sizes,
 *   colorscales, selection styles, `texttemplate`, rich text… exactly as scatter draws them.
 *   Points outside the subplot's region (radial range, sector, hole) are hidden, as plotly.js
 *   hides them.
 * - **Lines** follow scatter's line shapes in screen space (straight segments or Catmull-Rom
 *   splines, like Plotly's SVG paths), clipped to the region on the CPU.
 * - **Fills** (`toself`, `tonext`) are clipped exactly by the fill primitive (see `polar/fill.ts`).
 *
 * Zooming and rotating the subplot redraw the views through the subplot's change notification
 * (no pipeline run), so drags stay interactive.
 */
import { toRGBA, type FullTrace, type RGBA } from '@mk7s/holochart-core';
import {
  createLazyFillPrimitive,
  LinePrimitive,
  type DataTransform,
  type LazyFillPrimitive,
  type Primitive,
} from '@mk7s/holochart-render';
import type {
  ComponentPointerEvent,
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { scatter, type ScatterCalc } from '@mk7s/holochart-traces-basic';
import { polarFillGeometry, linePath } from '../polar/fill.ts';
import { clipPolyline } from '../polar/geometry.ts';
import { POLAR_ORDER, SCATTER_LAYER, traceOrder } from '../polar/order.ts';
import { polarPositions, visiblePositions } from '../polar/positions.ts';
import type { PolarSubplot } from '../polar/subplot.ts';
import type { ScatterpolarCalc } from './calc.ts';

function hasFlag(mode: unknown, flag: string): boolean {
  return typeof mode === 'string' && mode.split('+').includes(flag);
}

function opacityOf(trace: FullTrace): number {
  return typeof trace['opacity'] === 'number' ? trace['opacity'] : 1;
}

/** Line style for the line primitive (scatter's `lineStyle`). */
function lineStyle(trace: FullTrace) {
  const line = (trace['line'] ?? {}) as { color?: unknown; width?: unknown; dash?: unknown };
  return {
    color: (typeof line.color === 'string' ? toRGBA(line.color) : null) ?? ([0, 0, 0, 1] as RGBA),
    width: typeof line.width === 'number' ? line.width : 2,
    dash: typeof line.dash === 'string' ? line.dash : 'solid',
    opacity: opacityOf(trace),
  };
}

/** Fill color: `fillcolor`, else the line color at half opacity. */
export function fillColorOf(trace: FullTrace): RGBA {
  const c = trace['fillcolor'];
  const rgba = typeof c === 'string' ? toRGBA(c) : null;
  if (rgba) return rgba;
  const line = (trace['line'] as { color?: unknown } | undefined)?.color;
  const l = typeof line === 'string' ? toRGBA(line) : null;
  return l ? [l[0], l[1], l[2], 0.5] : [0.5, 0.5, 0.5, 0.5];
}

/** Overlay transform of a subplot: geometric px → overlay world px. */
export function subplotTransform(subplot: PolarSubplot, height: number): DataTransform {
  return { scaleX: 1, scaleY: 1, offsetX: subplot.cx, offsetY: height - subplot.cy };
}

/** The trace as scatter's view reads it: markers and text only, `%{x}` / `%{y}` as r / θ. */
const INNER = new WeakMap<FullTrace, FullTrace>();
function innerTrace(trace: FullTrace): FullTrace {
  let t = INNER.get(trace);
  if (!t) {
    const mode = String(trace['mode'] ?? '')
      .split('+')
      .filter((f) => f === 'markers' || f === 'text');
    t = {
      ...trace,
      mode: mode.length > 0 ? mode.join('+') : 'none',
      fill: 'none',
      x: trace['r'],
      y: trace['theta'],
    };
    INNER.set(trace, t);
  }
  return t;
}

const INNER_CALC = new WeakMap<
  ScatterpolarCalc,
  { subplot: PolarSubplot; version: number; value: ScatterCalc }
>();

/**
 * The px-space scatter calc of a scatterpolar calc (points outside the region hidden), cached per
 * subplot view so hover reuses scatter's spatial index between pointer moves.
 */
export function innerCalc(calc: ScatterpolarCalc, subplot: PolarSubplot): ScatterCalc {
  const hit = INNER_CALC.get(calc);
  if (hit && hit.subplot === subplot && hit.version === subplot.version) return hit.value;
  const { x, y } = visiblePositions(polarPositions(calc, subplot));
  const value: ScatterCalc = {
    x,
    y,
    length: calc.coords.length,
    markerSize: calc.markerSize,
    ppad: calc.ppad,
    errorX: undefined,
    errorY: undefined,
  };
  INNER_CALC.set(calc, { subplot, version: subplot.version, value });
  return value;
}

const FULL: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: true };

class ScatterpolarView implements TraceView<ScatterpolarCalc> {
  #inner: TraceView<ScatterCalc> | undefined;
  /** Primitives scatter's view added (their draw order is remapped into the polar layers). */
  readonly #innerPrimitives = new Set<Primitive<unknown>>();
  #line: LinePrimitive | undefined;
  #fill: LazyFillPrimitive | undefined;
  #ctx: TracePlotContext<ScatterpolarCalc>;
  #subplot: PolarSubplot | undefined;
  #off: (() => void) | undefined;
  /** Subplot version last drawn. */
  #version = -1;

  constructor(ctx: TracePlotContext<ScatterpolarCalc>) {
    this.#ctx = ctx;
    this.#draw(ctx, FULL);
  }

  update(ctx: TracePlotContext<ScatterpolarCalc>, plan: TraceUpdatePlan): void {
    this.#ctx = ctx;
    this.#draw(ctx, plan);
  }

  #follow(subplot: PolarSubplot | undefined): void {
    if (subplot === this.#subplot) return;
    this.#off?.();
    this.#subplot = subplot;
    this.#off = subplot?.onChange(() => {
      // A drag changed the view: redraw the geometry now, from the last context.
      this.#draw(this.#ctx, FULL);
      this.#ctx.invalidate();
    });
    this.#version = -1;
  }

  #innerContext(
    ctx: TracePlotContext<ScatterpolarCalc>,
    subplot: PolarSubplot,
    transform: DataTransform,
  ): TracePlotContext<ScatterCalc> {
    return {
      trace: innerTrace(ctx.trace),
      calc: innerCalc(ctx.calc, subplot),
      index: ctx.index,
      fullLayout: ctx.fullLayout,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform,
      viewport: ctx.viewport,
      ...(ctx.plotArea ? { plotArea: ctx.plotArea } : {}),
      primitives: ctx.primitives,
      add: (p, vp) => {
        this.#innerPrimitives.add(p as Primitive<unknown>);
        return ctx.add(p, vp);
      },
      remove: (p) => {
        this.#innerPrimitives.delete(p as Primitive<unknown>);
        ctx.remove(p);
      },
      invalidate: () => ctx.invalidate(),
      selectedPoints: ctx.selectedPoints ?? null,
    };
  }

  #draw(ctx: TracePlotContext<ScatterpolarCalc>, plan: TraceUpdatePlan): void {
    const subplot = ctx.calc.subplot;
    this.#follow(subplot);
    if (!subplot) {
      this.#clear(ctx);
      return;
    }
    const { trace } = ctx;
    const moved = this.#version !== subplot.version;
    const geometry = plan.calc || plan.plot || moved;
    const transform = subplotTransform(subplot, ctx.viewport.size.height);
    const order = traceOrder(POLAR_ORDER.scatter, ctx.index);

    // Markers and text: scatter's view.
    const innerCtx = this.#innerContext(ctx, subplot, transform);
    const innerPlan: TraceUpdatePlan = geometry
      ? { ...FULL, ...(plan.selection ? { selection: true } : {}) }
      : plan;
    if (!this.#inner) this.#inner = scatter.plot!.create(innerCtx);
    else this.#inner.update(innerCtx, innerPlan);
    // Scatter orders its layers after `traceRenderOrder` (≥ 0): move them into the polar layers.
    for (const p of this.#innerPrimitives) {
      const r = p.object.renderOrder;
      if (r >= 0) p.object.renderOrder = order + (r - Math.floor(r)) * 0.01;
    }

    const lines = hasFlag(trace['mode'], 'lines');
    const fill = trace['fill'] === 'toself' || trace['fill'] === 'tonext';
    const path = lines || fill ? linePath(trace, polarPositions(ctx.calc, subplot)) : undefined;

    // Line.
    if (lines && path) {
      if (!this.#line) {
        this.#line = new LinePrimitive(ctx.primitives);
        ctx.add(this.#line);
      }
      if (geometry) {
        const clipped = clipPolyline(subplot.tester, path.x, path.y);
        this.#line.update({ x: clipped.x, y: clipped.y, ...lineStyle(trace) });
      } else {
        this.#line.update(lineStyle(trace));
      }
      this.#line.setTransform(transform);
      this.#line.object.renderOrder = order + SCATTER_LAYER.line * 0.01;
    } else if (this.#line) {
      ctx.remove(this.#line);
      this.#line = undefined;
    }

    // Fill.
    const style = { color: fillColorOf(trace), opacity: opacityOf(trace) };
    const previous = ctx.calc.previous;
    const g =
      fill && path && geometry
        ? polarFillGeometry(
            trace,
            path,
            subplot,
            previous ? linePath(previous.trace, polarPositions(previous.calc, subplot)) : undefined,
          )
        : undefined;
    if (fill && (g || !geometry)) {
      if (!this.#fill && g) {
        this.#fill = createLazyFillPrimitive(ctx.primitives, { ...g, ...style });
        ctx.add(this.#fill);
      } else if (this.#fill) {
        this.#fill.update(g ? { ...g, ...style } : style);
      }
      if (this.#fill) {
        this.#fill.setTransform(transform);
        this.#fill.object.renderOrder = previous
          ? traceOrder(POLAR_ORDER.scatter, previous.index) + SCATTER_LAYER.nextFill * 0.01
          : order + SCATTER_LAYER.fill * 0.01;
      }
    } else if (this.#fill) {
      ctx.remove(this.#fill);
      this.#fill = undefined;
    }
    this.#version = subplot.version;
  }

  #clear(ctx: TracePlotContext<ScatterpolarCalc>): void {
    if (this.#inner) {
      this.#inner.dispose?.();
      for (const p of this.#innerPrimitives) ctx.remove(p);
      this.#innerPrimitives.clear();
      this.#inner = undefined;
    }
    if (this.#line) ctx.remove(this.#line);
    if (this.#fill) ctx.remove(this.#fill);
    this.#line = undefined;
    this.#fill = undefined;
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    return this.#inner?.handlePointer?.(event) === true;
  }

  dispose(): void {
    this.#off?.();
    this.#off = undefined;
    this.#inner?.dispose?.();
  }
}

export const scatterpolarRenderer: TraceRenderer<ScatterpolarCalc> = {
  create: (ctx) => new ScatterpolarView(ctx),
};
