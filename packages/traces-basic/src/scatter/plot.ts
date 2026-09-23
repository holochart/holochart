/**
 * `scatter` renderer (plan E9.1, E22.1): one instanced {@link MarkerSet} per trace (plan §3
 * principle 6), updated in place per the runtime's plan — `style` edits touch only the style
 * buffers, and zoom/pan (`transform`) only sets uniforms.
 *
 * Lines (E9.2), text (E9.3) and fills (E9.4) will add their own primitives to the same view.
 */
import {
  isArrayLike,
  toFloat32Array,
  toRGBA,
  toRGBAArray,
  type FullTrace,
} from '@mk7s/holochart-core';
import {
  createMarkers,
  MARKER_DEFAULTS,
  type ColorInput,
  type MarkerData,
  type MarkerSet,
  type RGBA,
  type ScalarInput,
  type SymbolInput,
} from '@mk7s/holochart-render';
import type {
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import type { ScatterCalc } from './calc.ts';
import { hasMarkers } from './defaults.ts';

interface FullMarker {
  color?: unknown;
  size?: unknown;
  symbol?: unknown;
  opacity?: unknown;
  line?: { color?: unknown; width?: unknown };
}

const DEFAULT_LINE_COLOR = MARKER_DEFAULTS.lineColor as RGBA;

function colorInput(value: unknown, fallback: RGBA): ColorInput {
  if (typeof value === 'string') return toRGBA(value) ?? fallback;
  if (isArrayLike(value)) return toRGBAArray(value as ArrayLike<unknown>, fallback);
  return fallback;
}

function scalarInput(value: unknown, fallback: number, scale = 1): ScalarInput {
  if (typeof value === 'number') return value * scale;
  if (isArrayLike(value)) {
    const out = toFloat32Array(value as ArrayLike<unknown>);
    for (let i = 0; i < out.length; i++) out[i] = Number.isFinite(out[i]) ? out[i]! * scale : 0;
    return out;
  }
  return fallback * scale;
}

function symbolInput(value: unknown): SymbolInput {
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (isArrayLike(value)) return value as ArrayLike<number | string>;
  return 0;
}

/**
 * Marker style from the full trace, in the render layer's formats (sRGB 0–1 colors, px sizes).
 * The trace `opacity` multiplies `marker.opacity` (Plotly draws the whole trace group with it).
 */
export function markerStyle(trace: FullTrace): Partial<MarkerData> {
  const marker = (trace['marker'] ?? {}) as FullMarker;
  const fill = colorInput(marker.color, MARKER_DEFAULTS.color as RGBA);
  const traceOpacity = typeof trace['opacity'] === 'number' ? trace['opacity'] : 1;
  return {
    color: fill,
    size: scalarInput(marker.size, 6),
    symbol: symbolInput(marker.symbol),
    opacity: scalarInput(marker.opacity, 1, traceOpacity),
    lineColor: colorInput(marker.line?.color, DEFAULT_LINE_COLOR),
    lineWidth: scalarInput(marker.line?.width, 0),
  };
}

class ScatterView implements TraceView<ScatterCalc> {
  #markers: MarkerSet | undefined;

  constructor(ctx: TracePlotContext<ScatterCalc>) {
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<ScatterCalc>, plan: TraceUpdatePlan): void {
    const markers = this.#markers;
    if (!markers || plan.plot) {
      this.#sync(ctx, plan.calc);
      return;
    }
    if (plan.style) markers.update(markerStyle(ctx.trace));
    if (plan.transform) markers.setTransform(ctx.transform);
  }

  /** Create, remove or fully refresh the marker set to match the trace. */
  #sync(ctx: TracePlotContext<ScatterCalc>, positions = true): void {
    if (!hasMarkers(ctx.trace['mode'])) {
      if (this.#markers) ctx.remove(this.#markers);
      this.#markers = undefined;
      return;
    }
    const style = markerStyle(ctx.trace);
    if (!this.#markers) {
      this.#markers = createMarkers(
        ctx.primitives,
        { x: ctx.calc.x, y: ctx.calc.y, ...style },
        { renderOrder: ctx.index },
      );
      ctx.add(this.#markers);
    } else {
      this.#markers.update(positions ? { x: ctx.calc.x, y: ctx.calc.y, ...style } : style);
      this.#markers.object.renderOrder = ctx.index;
    }
    this.#markers.setTransform(ctx.transform);
  }
}

/** The scatter `plot` part: creates one {@link ScatterView} per visible trace. */
export const scatterRenderer: TraceRenderer<ScatterCalc> = {
  create: (ctx) => new ScatterView(ctx),
};
