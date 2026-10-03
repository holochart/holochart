/**
 * Calc shared by `ohlc` and `candlestick` (plotly.js `ohlc/calc.js` `calcCommon`): linear x
 * positions (after period alignment, E3.5) and prices, the direction of every bar, and autorange
 * extremes. Pure.
 *
 * Positions and prices are linear coordinates (compressed on range-break axes, ADR-022), so the
 * views upload them once and zooming only sets transforms. A point with a missing or
 * non-representable value (including an x inside a range break) is not drawn.
 */
import {
  alignPeriod,
  cleanNumber,
  isArrayLike,
  type AxisType,
  type FullTrace,
  type Scale,
} from '@mk7s/holochart-core';
import {
  linearExtremes,
  type AxisInfo,
  type CalcContext,
  type TraceExtremes,
} from '@mk7s/holochart-runtime';

/**
 * Where the bars of a trace sit around their positions, in x linear units. `ohlc` and
 * `candlestick` fill it from their own cross-trace calc.
 * @experimental
 */
export interface PriceSlot {
  /** Half the smallest spacing of positions (Plotly's `dPos`): autorange padding on x. */
  readonly dPos: number;
  /** Offset of the drawn bar from its position (grouped candlesticks; 0 for ohlc). */
  readonly bPos: number;
  /** Half the drawn width: the ohlc tick length, the candle body's half width. */
  readonly halfWidth: number;
  /** Half the x span around the bar center that hovers it (Plotly's `wHover`). */
  readonly wHover: number;
}

/**
 * Calcdata of an `ohlc` or `candlestick` trace. Index-aligned with the data (`length`).
 * @experimental
 */
export interface PriceCalc {
  readonly length: number;
  /** Linear x positions after period alignment. */
  readonly pos: Float64Array;
  /** Linear x before period alignment: what hover labels show (Plotly's `orig_p`). */
  readonly origPos: Float64Array;
  /** Linear prices (log10 on log axes). */
  readonly open: Float64Array;
  readonly high: Float64Array;
  readonly low: Float64Array;
  readonly close: Float64Array;
  /** 1 where the bar is increasing (Plotly's `dir`), 0 where decreasing. */
  readonly increasing: Uint8Array;
  /** Data indices of the drawn bars (every value finite), in data order. */
  readonly drawn: Int32Array;
  /** The drawn bars' positions never decrease (hover bisects them). */
  readonly sorted: boolean;
  /**
   * The smallest spacing between distinct positions (Plotly's `Lib.distinctVals(x).minDiff`), or
   * NaN without a finite position.
   */
  readonly minDiff: number;
  readonly xType: AxisType | undefined;
  readonly yType: AxisType | undefined;
  /** With `xperiod`: each bar's period (linear), which `pos` is aligned within. */
  readonly period?: { readonly starts: Float64Array; readonly ends: Float64Array };
  /** Placement (updated by the cross-trace calc). */
  slot: PriceSlot;
}

/** The first `n` values of an array (the array itself when it is no longer). */
function head(values: ArrayLike<unknown>, n: number): ArrayLike<unknown> {
  if (values.length <= n) return values;
  if (ArrayBuffer.isView(values)) {
    return (values as unknown as Float64Array).subarray(0, n) as ArrayLike<unknown>;
  }
  return Array.prototype.slice.call(values, 0, n) as unknown[];
}

/** Linear coordinates of a data array on an axis (numbers without one). */
function linear(values: unknown, n: number, scale: Scale | undefined): Float64Array {
  const out = new Float64Array(n).fill(NaN);
  if (!isArrayLike(values)) return out;
  const data = head(values, n);
  if (scale) return scale.d2lArray(data, out);
  for (let i = 0; i < data.length; i++) out[i] = cleanNumber(data[i]);
  return out;
}

/** Linear x: `x`, or the indices 0, 1, 2, … (compressed and masked on range-break axes). */
function positions(trace: FullTrace, n: number, axis: AxisInfo | undefined): Float64Array {
  if (isArrayLike(trace['x'])) return linear(trace['x'], n, axis?.scale);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = axis ? axis.scale.d2l(i) : i;
  return out;
}

/**
 * Plotly's `Lib.distinctVals(values).minDiff` over the finite values: the smallest difference
 * between distinct values (values closer than 1/10000 of the average spacing merge), the whole
 * span or 1 with a single distinct value, NaN with none. Sorted input is not copied.
 */
export function distinctMinDiff(values: ArrayLike<number>): number {
  let finite = 0;
  let ascending = true;
  let previous = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    finite++;
    if (v < previous) ascending = false;
    previous = v;
  }
  if (finite === 0) return NaN;
  let sorted: ArrayLike<number> = values;
  if (!ascending || finite !== values.length) {
    const copy = new Float64Array(finite);
    let k = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      if (Number.isFinite(v)) copy[k++] = v;
    }
    if (!ascending) copy.sort();
    sorted = copy;
  }
  const last = finite - 1;
  let minDiff = sorted[last]! - sorted[0]! || 1;
  const errDiff = minDiff / (last || 1) / 10000;
  let kept = sorted[0]!;
  for (let i = 1; i <= last; i++) {
    const v = sorted[i]!;
    if (v - kept > errDiff) {
      minDiff = Math.min(minDiff, v - kept);
      kept = v;
    }
  }
  return minDiff;
}

/** A slot for bars spaced `minDiff` apart, drawn `halfWidth` to each side of their positions. */
export function simpleSlot(minDiff: number, halfWidth: number): PriceSlot {
  const d = Number.isFinite(minDiff) ? minDiff : 1;
  return { dPos: d / 2, bPos: 0, halfWidth, wHover: d / 2 };
}

/** Whether two slots place bars identically. */
export function sameSlot(a: PriceSlot, b: PriceSlot): boolean {
  return (
    a.dPos === b.dPos && a.bPos === b.bPos && a.halfWidth === b.halfWidth && a.wHover === b.wHover
  );
}

/**
 * Positions, prices and directions of a trace. The direction follows Plotly: close above open
 * is increasing, below is decreasing, and an unchanged bar (close = open) compares its close with
 * the previous drawn close, keeping the previous direction when that is unchanged too (the first
 * bars count as increasing).
 */
export function calcPrices(trace: FullTrace, ctx: CalcContext): PriceCalc {
  const n = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  const xa = ctx.xaxis;
  const ys = ctx.yaxis?.scale;
  const origPos = positions(trace, n, xa);
  const period =
    trace['xperiod'] !== undefined && (!xa || xa.type === 'date' || xa.type === 'linear')
      ? alignPeriod(origPos, {
          period: trace['xperiod'],
          period0: trace['xperiod0'],
          alignment: trace['xperiodalignment'] as 'start' | 'middle' | 'end' | undefined,
          isDate: xa?.type === 'date',
          breaks: xa?.scale.breaks,
        })
      : undefined;
  const pos = period ? period.vals : origPos;
  const open = linear(trace['open'], n, ys);
  const high = linear(trace['high'], n, ys);
  const low = linear(trace['low'], n, ys);
  const close = linear(trace['close'], n, ys);

  const increasing = new Uint8Array(n);
  const drawn = new Int32Array(n);
  let count = 0;
  let sorted = true;
  let up = true;
  let previousClose = NaN;
  let previousPos = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = pos[i]!;
    const o = open[i]!;
    const c = close[i]!;
    if (![p, o, high[i]!, low[i]!, c].every(Number.isFinite)) continue;
    if (c === o) {
      if (!Number.isNaN(previousClose) && c !== previousClose) up = c > previousClose;
    } else up = c > o;
    previousClose = c;
    increasing[i] = up ? 1 : 0;
    drawn[count++] = i;
    if (p < previousPos) sorted = false;
    previousPos = p;
  }
  const minDiff = distinctMinDiff(pos);
  return {
    length: n,
    pos,
    origPos,
    open,
    high,
    low,
    close,
    increasing,
    drawn: drawn.slice(0, count),
    sorted,
    minDiff,
    xType: xa?.type,
    yType: ctx.yaxis?.type,
    ...(period ? { period: { starts: period.starts, ends: period.ends } } : {}),
    slot: simpleSlot(minDiff, 0),
  };
}

/**
 * Autorange extremes (Plotly: x positions padded by half the bar spacing, `vpad: minDiff / 2`;
 * lows and highs with the 5% padding, `padded: true`).
 */
export function priceExtremes(calc: PriceCalc): TraceExtremes {
  let x0 = Infinity;
  let x1 = -Infinity;
  for (let i = 0; i < calc.length; i++) {
    const p = calc.pos[i]!;
    if (p < x0) x0 = p;
    if (p > x1) x1 = p;
  }
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const values of [calc.low, calc.high]) {
    for (let i = 0; i < calc.length; i++) {
      const v = values[i]!;
      if (v < y0) y0 = v;
      if (v > y1) y1 = v;
    }
  }
  const pad = calc.slot.dPos;
  return {
    x: x0 <= x1 ? linearExtremes([x0 - pad, x1 + pad]) : { min: [], max: [] },
    y: y0 <= y1 ? linearExtremes([y0, y1], 0, { padded: true }) : { min: [], max: [] },
  };
}
