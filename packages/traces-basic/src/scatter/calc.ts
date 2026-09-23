/**
 * `scatter` calc and autorange extremes (plan E9.1, E3.2). Pure: data space → linear coordinates
 * through the axes' scales (plan §4.3), kept as `Float64Array`s so the render layer can apply
 * relative-to-center encoding (E16.4).
 */
import { isArrayLike, toFloat64Array, type FullTrace, type Scale } from '@mk7s/holochart-core';
import { linearExtremes, type CalcContext, type TraceExtremes } from '@mk7s/holochart-runtime';
import { hasMarkers } from './defaults.ts';

/** Scatter calcdata: linear coordinates per point (`NaN` where a point cannot be placed). */
export interface ScatterCalc {
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Point count (`min(x.length, y.length)`, or the length of the given coordinate). */
  readonly length: number;
}

function head(values: ArrayLike<unknown>, length: number): ArrayLike<unknown> {
  if (values.length <= length) return values;
  if (ArrayBuffer.isView(values)) return (values as unknown as Float64Array).subarray(0, length);
  return Array.prototype.slice.call(values, 0, length) as unknown[];
}

/** Linear coordinates for `letter`, from the data array or from `letter0 + i·dletter`. */
function coordinates(
  trace: FullTrace,
  letter: 'x' | 'y',
  length: number,
  scale: Scale | undefined,
): Float64Array {
  const values = trace[letter];
  if (isArrayLike(values)) {
    const data = head(values as ArrayLike<unknown>, length);
    if (scale) return scale.d2lArray(data, new Float64Array(length));
    return toFloat64Array(data);
  }
  const out = new Float64Array(length);
  const start = trace[`${letter}0`];
  const step = Number(trace[`d${letter}`] ?? 1);
  // Log axes step in data space (x0 + i·dx, then log10); every other type is linear in l already.
  if (scale?.type === 'log') {
    const d0 = Number(start);
    for (let i = 0; i < length; i++) out[i] = scale.d2l(d0 + i * step);
    return out;
  }
  const l0 = scale ? scale.d2l(start) : Number(start);
  for (let i = 0; i < length; i++) out[i] = l0 + i * step;
  return out;
}

/** Scatter calc: linearize coordinates on the trace's axes. */
export function calcScatter(trace: FullTrace, ctx: CalcContext): ScatterCalc {
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  return {
    x: coordinates(trace, 'x', length, ctx.xaxis?.scale),
    y: coordinates(trace, 'y', length, ctx.yaxis?.scale),
    length,
  };
}

/** Marker radius per point (px), for autorange padding. */
function markerPadding(trace: FullTrace): number | Float64Array {
  if (!hasMarkers(trace['mode'])) return 0;
  const size = (trace['marker'] as { size?: unknown } | undefined)?.size;
  if (typeof size === 'number') return size / 2;
  if (!isArrayLike(size)) return 0;
  const sizes = size as ArrayLike<unknown>;
  const out = new Float64Array(sizes.length);
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i];
    out[i] = typeof s === 'number' && s > 0 ? s / 2 : 0;
  }
  return out;
}

/**
 * What the trace needs to be fully visible: its extreme points, padded by the marker radius, plus
 * Plotly's 5% extra padding when markers are drawn (lines-only traces touch the axis ends).
 */
export function scatterExtremes(calc: ScatterCalc, trace: FullTrace): TraceExtremes {
  const pad = markerPadding(trace);
  const options = { padded: hasMarkers(trace['mode']) };
  return { x: linearExtremes(calc.x, pad, options), y: linearExtremes(calc.y, pad, options) };
}
