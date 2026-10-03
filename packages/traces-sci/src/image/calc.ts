/**
 * `image` calc (plan E11.3), following plotly.js `image/calc.js`: the pixel grid's size (`z`'s
 * rows × longest row, or the `source` picture's size read from its header), its placement —
 * pixel column i spans `x0 + (i − ½)·dx … x0 + (i + ½)·dx` — and, for `z`, the 8-bit RGBA pixels
 * the texture shows (each pixel scaled from `zmin` / `zmax` to its color model, Plotly's
 * `makeScaler`; pixels with a non-numeric component are transparent). A `source` is decoded by the
 * view. Pure.
 *
 * Placement is in Plotly's calc space (raw values on log axes, ms on dates); the drawn quad spans
 * the linear coordinates of its outer edges (so on a log axis pixels are not log-spaced, unlike
 * Plotly, which draws them in data units).
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { RasterPixels } from '@mk7s/holochart-render';
import {
  linearExtremes,
  type AxisInfo,
  type CalcContext,
  type TraceExtremes,
} from '@mk7s/holochart-runtime';
import {
  COLORMODELS,
  isColormodel,
  makeScaler,
  scaledToRgba8,
  type Colormodel,
} from './colormodel.ts';
import { dataUriImageSize } from './source.ts';

/** More pixels than this are not drawn (a warning is logged): 16.7 M, 4096². */
export const MAX_PIXELS = 4096 * 4096;

/** image calcdata. @experimental */
export interface ImageCalc {
  /** Pixel columns and rows. */
  readonly w: number;
  readonly h: number;
  /** Where pixel column 0 / row 0 starts, in calc space (Plotly's `cd0.x0`: `x0 − dx / 2`). */
  readonly x0: number;
  readonly y0: number;
  readonly dx: number;
  readonly dy: number;
  /** Linear coordinates of the outer edges: `[column 0 start, last column end]`, same for rows. */
  readonly xEdges: readonly [number, number];
  readonly yEdges: readonly [number, number];
  readonly colormodel: Colormodel;
  /** 8-bit RGBA pixels of `z` (straight alpha); undefined for a `source`, decoded by the view. */
  readonly pixels: RasterPixels | undefined;
  /** The `source` data URI when there is no `z`. */
  readonly source: string | undefined;
}

/** An empty calc (no pixels). */
export function emptyImageCalc(): ImageCalc {
  return {
    w: 0,
    h: 0,
    x0: 0,
    y0: 0,
    dx: 1,
    dy: 1,
    xEdges: [0, 0],
    yEdges: [0, 0],
    colormodel: 'rgb',
    pixels: undefined,
    source: undefined,
  };
}

/** A numeric attribute, or `dflt`. */
function numberOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** Plotly's `d2c` of `x0` / `y0`: raw numbers on log axes, else the axis' linear coordinate. */
export function startInCalcSpace(axis: AxisInfo, v: unknown): number {
  if (axis.type === 'log') {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return axis.scale.d2l(v);
}

/** Calc space → linear coordinates (log10 on log axes). */
export function calcToLinear(axis: AxisInfo | undefined, c: number): number {
  if (axis?.type !== 'log') return c;
  return c > 0 ? Math.log10(c) : NaN;
}

/** The longest row of `z`. */
function maxRowLength(z: ArrayLike<unknown>): number {
  let w = 0;
  for (let i = 0; i < z.length; i++) {
    const row = z[i];
    if (isArrayLike(row)) w = Math.max(w, (row as ArrayLike<unknown>).length);
  }
  return w;
}

/** The pixel at `z[row][column]` (undefined when missing). */
export function pixelAt(z: unknown, row: number, col: number): ArrayLike<unknown> | undefined {
  if (!isArrayLike(z)) return undefined;
  const r = (z as ArrayLike<unknown>)[row];
  if (!isArrayLike(r)) return undefined;
  const p = (r as ArrayLike<unknown>)[col];
  return isArrayLike(p) ? (p as ArrayLike<unknown>) : undefined;
}

/** The trace's color model and component ranges. */
export function colorRangeOf(trace: FullTrace): {
  colormodel: Colormodel;
  zmin: number[];
  zmax: number[];
} {
  const colormodel = isColormodel(trace['colormodel']) ? trace['colormodel'] : 'rgb';
  const spec = COLORMODELS[colormodel];
  const range = (v: unknown, dflt: readonly number[]) =>
    Array.from({ length: spec.channels }, (_, k) =>
      numberOr(Array.isArray(v) ? (v as unknown[])[k] : undefined, dflt[k]!),
    );
  return {
    colormodel,
    zmin: range(trace['zmin'], spec.zmin),
    zmax: range(trace['zmax'], spec.zmax),
  };
}

/** 8-bit RGBA pixels of a `z` grid of `w × h` pixels (see the module comment). */
export function rgbaPixels(trace: FullTrace, w: number, h: number): RasterPixels {
  const { colormodel, zmin, zmax } = colorRangeOf(trace);
  const scale = makeScaler(colormodel, zmin, zmax);
  const data = new Uint8ClampedArray(w * h * 4);
  const z = trace['z'] as ArrayLike<unknown>;
  const c: number[] = [];
  for (let r = 0; r < h; r++) {
    const row = z[r];
    if (!isArrayLike(row)) continue;
    const pixels = row as ArrayLike<unknown>;
    for (let i = 0; i < w && i < pixels.length; i++) {
      const p = pixels[i];
      if (!isArrayLike(p)) continue;
      const scaled = scale(p as ArrayLike<unknown>, c);
      if (scaled) scaledToRgba8(colormodel, scaled, data, (r * w + i) * 4);
    }
  }
  return { data, width: w, height: h };
}

/** Options of {@link calcImage}. */
export interface ImageCalcOptions {
  /** Warning sink (default `console.warn`). */
  readonly warn?: (message: string) => void;
}

/** The image `calc` (see the module comment). */
export function calcImage(
  trace: FullTrace,
  ctx: Pick<CalcContext, 'xaxis' | 'yaxis'>,
  options: ImageCalcOptions = {},
): ImageCalc {
  const { xaxis, yaxis } = ctx;
  if (!xaxis || !yaxis || trace.visible === false) return emptyImageCalc();
  const z = trace['z'];
  const source = typeof trace['source'] === 'string' ? trace['source'] : undefined;
  let w = 0;
  let h = 0;
  if (isArrayLike(z)) {
    h = (z as ArrayLike<unknown>).length;
    w = maxRowLength(z as ArrayLike<unknown>);
  } else if (source) {
    const size = dataUriImageSize(source);
    w = size?.width ?? 0;
    h = size?.height ?? 0;
  }
  if (w === 0 || h === 0) return emptyImageCalc();
  if (w * h > MAX_PIXELS) {
    (options.warn ?? ((m: string) => console.warn(m)))(
      `[holochart] image trace ${trace._index}: ${w}×${h} pixels is more than ${MAX_PIXELS}; not drawn.`,
    );
    return emptyImageCalc();
  }
  const dx = numberOr(trace['dx'], 1);
  const dy = numberOr(trace['dy'], 1);
  const x0 = startInCalcSpace(xaxis, trace['x0'] ?? 0) - dx / 2;
  const y0 = startInCalcSpace(yaxis, trace['y0'] ?? 0) - dy / 2;
  const hasZ = isArrayLike(z);
  return {
    w,
    h,
    x0,
    y0,
    dx,
    dy,
    xEdges: [calcToLinear(xaxis, x0), calcToLinear(xaxis, x0 + w * dx)],
    yEdges: [calcToLinear(yaxis, y0), calcToLinear(yaxis, y0 + h * dy)],
    colormodel: hasZ ? colorRangeOf(trace).colormodel : 'rgba256',
    pixels: hasZ ? rgbaPixels(trace, w, h) : undefined,
    source: hasZ ? undefined : source,
  };
}

/** Autorange: the whole picture, edge to edge, without padding (Plotly). */
export function imageExtremes(calc: ImageCalc): TraceExtremes {
  if (calc.w === 0 || calc.h === 0) return {};
  return { x: linearExtremes(calc.xEdges), y: linearExtremes(calc.yEdges) };
}
