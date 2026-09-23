/**
 * Error-bar rendering (plan E9.7). Every bar of a trace along one axis is drawn with two draw
 * calls, whatever the point count: one {@link LinePrimitive} holding all stems (2-point polylines
 * separated by NaN gaps) and one {@link MarkerSet} holding all cross-bar caps (`line-ew` /
 * `line-ns` symbols, two instances per bar). No per-point three.js objects.
 *
 * Geometry arrays are rebuilt (O(n), allocated once per rebuild) only when positions or bars
 * change; style edits only touch the primitives' style buffers and uniforms.
 */
import { toRGBA, type FullTrace } from '@mk7s/holochart-core';
import {
  createMarkers,
  LinePrimitive,
  type DataTransform,
  type MarkerData,
  type MarkerSet,
  type Primitive,
  type PrimitiveContext,
  type RGBA,
  type ViewportSize,
} from '@mk7s/holochart-render';
import type { ErrorBarCalc } from './calc.ts';

/** Resolved error-bar style in render units. */
export interface ErrorBarStyle {
  /** sRGB 0–1 RGBA. */
  color: RGBA;
  /** Stem and cap stroke width in CSS px. */
  thickness: number;
  /** Cap half-length in CSS px (Plotly `width`); 0 hides the caps. */
  width: number;
  /** Trace opacity, multiplied into every color's alpha. */
  opacity: number;
}

/** Plotly's `Color.defaultLine`, used if a container somehow lacks a color. */
const FALLBACK_COLOR: RGBA = [68 / 255, 68 / 255, 68 / 255, 1];
const DEFAULT_THICKNESS = 2;
const DEFAULT_WIDTH = 4;
/** `line-ew` / `line-ns` span ±1.4 × the marker radius (see render `symbols.ts`). */
const LINE_SYMBOL_EXTENT = 1.4;
const TRANSPARENT: RGBA = [0, 0, 0, 0];

function container(trace: FullTrace, letter: 'x' | 'y'): Readonly<Record<string, unknown>> {
  const c = trace[`error_${letter}`];
  return c !== null && typeof c === 'object' ? (c as Readonly<Record<string, unknown>>) : {};
}

function nonNegative(v: unknown, fallback: number): number {
  return typeof v === 'number' && v >= 0 && v < Infinity ? v : fallback;
}

/**
 * Style of `error_<letter>` from the full trace. `error_x` with `copy_ystyle` takes the color,
 * thickness and width of `error_y`; the trace `opacity` goes into `opacity`.
 */
export function errorBarStyle(trace: FullTrace, letter: 'x' | 'y'): ErrorBarStyle {
  let source = container(trace, letter);
  if (letter === 'x' && source['copy_ystyle'] === true) source = container(trace, 'y');
  const color = source['color'];
  const opacity = trace['opacity'];
  return {
    color: (typeof color === 'string' ? toRGBA(color) : null) ?? FALLBACK_COLOR,
    thickness: nonNegative(source['thickness'], DEFAULT_THICKNESS),
    width: nonNegative(source['width'], DEFAULT_WIDTH),
    opacity: typeof opacity === 'number' ? opacity : 1,
  };
}

/** Input of {@link ErrorBarLayer}. */
export interface ErrorBarLayerData {
  /** Points' x linear coordinates. */
  x: ArrayLike<number>;
  /** Points' y linear coordinates. */
  y: ArrayLike<number>;
  bars: ErrorBarCalc;
  style: ErrorBarStyle;
}

/** Construction options for {@link ErrorBarLayer}. */
export interface ErrorBarLayerOptions {
  /** three.js render order of both primitives (trace order). */
  renderOrder?: number;
}

interface Geometry {
  stemX: Float64Array;
  stemY: Float64Array;
  capX: Float64Array;
  capY: Float64Array;
  /** Per cap instance: 1 for a clipped lower end. `undefined` when nothing is clipped. */
  capClipped: Uint8Array | undefined;
}

/**
 * Lay out stems (`[lower, upper, NaN]` per bar) and caps (`[lower, upper]` per bar). Only points
 * with a bar are included; bars whose point is not finite on the other axis get NaN positions,
 * which both primitives treat as hidden.
 */
function buildGeometry(data: ErrorBarLayerData): Geometry {
  const { x, y, bars } = data;
  const { minus, plus, clipped } = bars;
  const n = Math.min(x.length, y.length, minus.length, plus.length);
  let m = 0;
  let anyClipped = false;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(minus[i]) && Number.isFinite(plus[i])) {
      m++;
      if (clipped[i]) anyClipped = true;
    }
  }
  const stemX = new Float64Array(3 * m);
  const stemY = new Float64Array(3 * m);
  const capX = new Float64Array(2 * m);
  const capY = new Float64Array(2 * m);
  const capClipped = anyClipped ? new Uint8Array(2 * m) : undefined;
  // Along the bar axis the ends vary; across it both ends share the point's coordinate.
  const along = bars.letter === 'x' ? { a: stemX, b: capX } : { a: stemY, b: capY };
  const across = bars.letter === 'x' ? { a: stemY, b: capY, c: y } : { a: stemX, b: capX, c: x };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const lo = minus[i]!;
    const hi = plus[i]!;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    const other = across.c[i]!;
    const ok = Number.isFinite(other);
    const s = 3 * j;
    const k = 2 * j;
    along.a[s] = ok ? lo : NaN;
    along.a[s + 1] = ok ? hi : NaN;
    along.a[s + 2] = NaN;
    across.a[s] = ok ? other : NaN;
    across.a[s + 1] = ok ? other : NaN;
    across.a[s + 2] = NaN;
    along.b[k] = ok ? lo : NaN;
    along.b[k + 1] = ok ? hi : NaN;
    across.b[k] = ok ? other : NaN;
    across.b[k + 1] = ok ? other : NaN;
    if (capClipped && clipped[i]) capClipped[k] = 1;
    j++;
  }
  return { stemX, stemY, capX, capY, capClipped };
}

/**
 * The error bars of one trace along one axis. Add {@link primitives} to the chart with
 * `ctx.add` (which also disposes them on removal).
 */
export class ErrorBarLayer {
  /** All stems, as one line primitive. */
  readonly stems: LinePrimitive;
  /** All end caps, as one marker set. */
  readonly caps: MarkerSet;
  #data: ErrorBarLayerData;
  #geometry: Geometry;
  /** Cap sizes when some caps are clipped; reused across style updates. */
  #capSizes: Float32Array | undefined;

  constructor(ctx: PrimitiveContext, data: ErrorBarLayerData, options: ErrorBarLayerOptions = {}) {
    this.#data = { ...data };
    this.#geometry = buildGeometry(this.#data);
    const g = this.#geometry;
    this.stems = new LinePrimitive(ctx, {
      x: g.stemX,
      y: g.stemY,
      cap: 'butt',
      ...this.#stemStyle(),
    });
    this.caps = createMarkers(
      ctx,
      { x: g.capX, y: g.capY, color: TRANSPARENT, ...this.#capSymbol(), ...this.#capStyle() },
      options.renderOrder !== undefined ? { renderOrder: options.renderOrder } : {},
    );
    if (options.renderOrder !== undefined) this.stems.object.renderOrder = options.renderOrder;
  }

  /** The primitives to `ctx.add` / `ctx.remove`. */
  get primitives(): readonly Primitive<unknown>[] {
    return [this.stems, this.caps] as readonly Primitive<unknown>[];
  }

  /** three.js render order of both primitives. */
  set renderOrder(n: number) {
    this.stems.object.renderOrder = n;
    this.caps.object.renderOrder = n;
  }

  /**
   * Apply changes. Geometry is rebuilt only when `x`, `y` or `bars` is given; a `style`-only
   * update touches only style buffers and uniforms.
   */
  update(patch: Partial<ErrorBarLayerData>): void {
    const geometryChanged =
      patch.x !== undefined || patch.y !== undefined || patch.bars !== undefined;
    const styleChanged = patch.style !== undefined;
    if (!geometryChanged && !styleChanged) return;
    const next = { ...this.#data };
    if (patch.x !== undefined) next.x = patch.x;
    if (patch.y !== undefined) next.y = patch.y;
    if (patch.bars !== undefined) next.bars = patch.bars;
    if (patch.style !== undefined) next.style = patch.style;
    this.#data = next;

    if (geometryChanged) {
      this.#geometry = buildGeometry(next);
      const g = this.#geometry;
      this.stems.update({ x: g.stemX, y: g.stemY, ...this.#stemStyle() });
      this.caps.update({ x: g.capX, y: g.capY, ...this.#capSymbol(), ...this.#capStyle() });
      return;
    }
    this.stems.update(this.#stemStyle());
    this.caps.update(this.#capStyle());
  }

  /** Set the linear → world transform of both primitives (zoom / pan). */
  setTransform(t: DataTransform): void {
    this.stems.setTransform(t);
    this.caps.setTransform(t);
  }

  /** Forward viewport changes to both primitives. */
  setViewport(size: ViewportSize): void {
    this.stems.setViewport(size);
    this.caps.setViewport(size);
  }

  /** Dispose both primitives. Not needed for primitives removed through `ctx.remove`. */
  dispose(): void {
    this.stems.dispose();
    this.caps.dispose();
  }

  #stemStyle() {
    const { color, thickness, opacity } = this.#data.style;
    return { color, width: thickness, opacity };
  }

  #capSymbol(): Pick<MarkerData, 'symbol'> {
    // Caps cross the stem: horizontal on vertical (y) bars, vertical on horizontal (x) bars.
    return { symbol: this.#data.bars.letter === 'y' ? 'line-ew' : 'line-ns' };
  }

  #capStyle(): Pick<MarkerData, 'size' | 'lineWidth' | 'lineColor' | 'opacity'> {
    const { color, thickness, width, opacity } = this.#data.style;
    // A line symbol spans LINE_SYMBOL_EXTENT × size / 2 each way; the cap spans `width` each way.
    const size = width > 0 ? (2 * width) / LINE_SYMBOL_EXTENT : 0;
    const clipped = this.#geometry.capClipped;
    let sizeInput: MarkerData['size'] = size;
    if (clipped) {
      let sizes = this.#capSizes;
      if (sizes?.length !== clipped.length)
        sizes = this.#capSizes = new Float32Array(clipped.length);
      for (let k = 0; k < clipped.length; k++) sizes[k] = clipped[k] ? 0 : size;
      sizeInput = sizes;
    } else {
      this.#capSizes = undefined;
    }
    return { size: sizeInput, lineWidth: thickness, lineColor: color, opacity };
  }
}

/** Create an {@link ErrorBarLayer}. */
export function createErrorBarLayer(
  ctx: PrimitiveContext,
  data: ErrorBarLayerData,
  options: ErrorBarLayerOptions = {},
): ErrorBarLayer {
  return new ErrorBarLayer(ctx, data, options);
}
