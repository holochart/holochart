/**
 * `splom` calc (plan E10.9, Plotly's `splom/calc.js`): each dimension's values → one float64 column
 * of linear coordinates (log10, ms, category index, compressed range-break space), converted
 * through the axis the dimension is drawn on (its x axis, else its y axis). Typed arrays go
 * straight through the scale's array conversion. The columns are what the GPU uploads, once per
 * dimension, and what hover and selection search.
 *
 * Autorange: every dimension axis gets the extremes of its column, padded by the marker size like
 * scatter markers (Plotly's `calcMarkerSize` ppad plus the 5% extra padding).
 */
import {
  isArrayLike,
  toFloat64Array,
  type AxisExtremes,
  type FullTrace,
} from '@mk7s/holochart-core';
import {
  linearExtremes,
  type AxisInfo,
  type CalcContext,
  type TraceExtremes,
} from '@mk7s/holochart-runtime';
import { dimensionsOf, type FullDimension } from './defaults.ts';

/** Calcdata of a splom trace. */
export interface SplomCalc {
  /** Sample count (the shortest visible dimension). */
  readonly length: number;
  /** Linear coordinates per dimension (`null` for hidden dimensions). */
  readonly columns: readonly (Float64Array | null)[];
  /** Drawn marker diameters (px): one size, or one per sample (`sizeref` / `sizemode` applied). */
  readonly markerSize: number | Float32Array;
  /** Autorange padding (px) per sample, or one for all. */
  readonly ppad: number | Float64Array;
}

interface FullMarker {
  size?: unknown;
  sizeref?: unknown;
  sizemin?: unknown;
  sizemode?: unknown;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function sizeValue(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/**
 * Marker diameters: Plotly's `makeBubbleSizeFn` for per-sample sizes (radius `v/2 / sizeref`, or
 * its square root with `sizemode: 'area'`, at least `sizemin`), the plain size otherwise.
 */
export function markerDiameters(trace: FullTrace, length: number): number | Float32Array {
  const marker = (trace['marker'] ?? {}) as FullMarker;
  if (!isArrayLike(marker.size)) return Math.max(0, num(marker.size, 6));
  const sizes = marker.size;
  const sizeref = num(marker.sizeref, 1) || 1;
  const sizemin = num(marker.sizemin, 0);
  const area = marker.sizemode === 'area';
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const v = sizeValue(i < sizes.length ? sizes[i] : undefined);
    const base = area ? Math.sqrt(v / 2 / sizeref) : v / 2 / sizeref;
    out[i] = base > 0 ? 2 * Math.max(base, sizemin) : 0;
  }
  return out;
}

/** Autorange padding per sample: Plotly's `calcMarkerSize` (`max(size / (1.6·sizeref), 3)`). */
export function markerPadding(trace: FullTrace, length: number): number | Float64Array {
  const marker = (trace['marker'] ?? {}) as FullMarker;
  const sizeref = 1.6 * (num(marker.sizeref, 1) || 1);
  const pad =
    marker.sizemode === 'area'
      ? (v: number) => Math.max(Math.sqrt((v || 0) / sizeref), 3)
      : (v: number) => Math.max((v || 0) / sizeref, 3);
  if (!isArrayLike(marker.size)) return pad(num(marker.size, 6));
  const out = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const v = sizeValue(i < marker.size.length ? marker.size[i] : undefined);
    out[i] = pad(Number.isFinite(v) ? v : 0);
  }
  return out;
}

/** The axis dimension `i` converts through: its x axis, else its y axis (Plotly). */
export function dimensionAxis(trace: FullTrace, i: number, ctx: CalcContext): AxisInfo | undefined {
  const diag = trace['_diag'] as readonly (readonly [string?, string?])[] | undefined;
  const pair = diag?.[i];
  if (!pair || !ctx.axes) return undefined;
  return (
    (pair[0] ? ctx.axes.get(pair[0]) : undefined) ?? (pair[1] ? ctx.axes.get(pair[1]) : undefined)
  );
}

function column(dim: FullDimension, length: number, axis: AxisInfo | undefined): Float64Array {
  const values = dim.values as ArrayLike<unknown>;
  const data =
    values.length === length
      ? values
      : ArrayBuffer.isView(values)
        ? (values as unknown as Float64Array).subarray(0, length)
        : Array.prototype.slice.call(values, 0, length);
  if (axis) return axis.scale.d2lArray(data, new Float64Array(length));
  return toFloat64Array(data);
}

/** The splom module's `calc`. */
export function calcSplom(trace: FullTrace, ctx: CalcContext): SplomCalc {
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  const columns = dimensionsOf(trace).map((dim, i) =>
    dim.visible && isArrayLike(dim.values)
      ? column(dim, length, dimensionAxis(trace, i, ctx))
      : null,
  );
  return {
    length,
    columns,
    markerSize: markerDiameters(trace, length),
    ppad: markerPadding(trace, length),
  };
}

/** Autorange: each dimension axis spans its column, padded like scatter markers. */
export function splomExtremes(calc: SplomCalc, trace: FullTrace): TraceExtremes {
  const byAxis: Record<string, AxisExtremes> = {};
  const diag = (trace['_diag'] ?? []) as readonly (readonly [string?, string?])[];
  calc.columns.forEach((col, i) => {
    if (!col) return;
    const e = linearExtremes(col, calc.ppad, { padded: true });
    for (const id of diag[i] ?? []) if (id !== undefined && !byAxis[id]) byAxis[id] = e;
  });
  return { byAxis };
}
