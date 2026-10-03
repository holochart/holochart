/**
 * `waterfall` calc and cross-trace calc (plan E12.4), ported from plotly.js'
 * `waterfall/calc.js` and `cross_trace_calc.js`.
 *
 * - **Running total.** Each bar's `measure` decides what its value means: `relative` (default)
 *   adds it to the running total, `total` shows the running total (its own value is ignored), and
 *   `absolute` resets the running total to its value. A missing value counts as 0. The bar's
 *   size (bar's calc `size`) is the running total after it, relative to `base`.
 * - **Direction.** Relative bars are `increasing` (value ≥ 0) or `decreasing`; `total` and
 *   `absolute` bars are `totals`.
 * - **Values.** `final` is `base` + the running total after the bar; `delta` its own value (a sum
 *   bar's value when given, else the running total); `initial` is `final − delta`.
 * - **Geometry.** Bars are positioned and sized by bar's stacking helper with `waterfallmode`
 *   (`group` or `overlay`), `waterfallgap` and `waterfallgroupgap`, then relative bars start
 *   where the previous bar ended (Plotly moves their `s0`); sum bars start at `base`.
 * - **Connectors.** A bar connects to the next one when both have a value (or a sum measure).
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { CalcContext, CrossTraceContext, CrossTraceEntry } from '@mk7s/holochart-runtime';
import { calcBar, type BarCalc } from '@mk7s/holochart-traces-basic';
import {
  crossTraceLayout,
  layoutAlone,
  stackInput,
  toLinear,
  type BarLikeLayout,
} from '../bars/layout.ts';

/** Direction codes of {@link WaterfallCalc.direction}. */
export const INCREASING = 0;
export const DECREASING = 1;
export const TOTALS = 2;

/**
 * Waterfall calcdata: bar's calc (sizes are running totals) plus the waterfall values.
 * @experimental
 */
export interface WaterfallCalc extends BarCalc {
  /** Per bar: {@link INCREASING}, {@link DECREASING} or {@link TOTALS}. */
  readonly direction: Uint8Array;
  /** 1 for `total` and `absolute` bars (Plotly's `isSum`). */
  readonly isSum: Uint8Array;
  /** The bar's own value (0 when missing; Plotly's `rawS`). */
  readonly delta: Float64Array;
  /** `base` + the running total after the bar (Plotly's `v`). */
  readonly final: Float64Array;
  /** 1 when a connector goes from this bar to the next (Plotly's `cNext`). */
  readonly connectNext: Uint8Array;
  /** Some bar is a sum bar (the legend then shows three directions). */
  readonly hasTotals: boolean;
}

function isAbsolute(m: unknown): boolean {
  return m === 'a' || m === 'absolute';
}

function isTotal(m: unknown): boolean {
  return m === 't' || m === 'total';
}

/** Relative bars start where the previous bar ended (Plotly's `di.s0 += cd[j - 1].s`). */
function startsAtPrevious(calc: WaterfallCalc): void {
  const s0 = calc.s0;
  for (let i = 0; i < calc.length; i++) {
    if (calc.isSum[i] || !Number.isFinite(calc.s1[i]!)) continue;
    const start = calc.bars.base[i]! + (i > 0 ? calc.size[i - 1]! : 0);
    // Log axes: a start at or below zero is below the visible range (as bar's).
    if (calc.sizeType === 'log' && !(start > 0)) {
      s0[i] = -Infinity;
      calc.floor = true;
    } else s0[i] = toLinear(calc.sizeType, start);
  }
}

/** How waterfalls are laid out (see `bars/layout.ts`). */
export const WATERFALL_LAYOUT: BarLikeLayout<WaterfallCalc> = {
  type: 'waterfall',
  input: (calc, trace, index) => stackInput(calc, trace, index),
  finish: startsAtPrevious,
};

/** Waterfall calc: running totals and values, laid out as if the trace were alone. */
export function calcWaterfall(trace: FullTrace, ctx: CalcContext): WaterfallCalc {
  // Bar's calc reads the positions (period alignment, categories, dates), values and `base`.
  const bars = calcBar(trace, ctx);
  const n = bars.length;
  const measure = trace['measure'];
  const measureAt = (i: number): unknown => (isArrayLike(measure) ? measure[i] : undefined);
  const hasValue = (i: number): boolean =>
    Number.isFinite(bars.size[i]!) || isTotal(measureAt(i)) || isAbsolute(measureAt(i));
  const base = typeof trace['base'] === 'number' ? trace['base'] : 0;
  const size = new Float64Array(n);
  const direction = new Uint8Array(n);
  const isSum = new Uint8Array(n);
  const delta = new Float64Array(n);
  const final = new Float64Array(n);
  const connectNext = new Uint8Array(n);
  let total = 0;
  let hasTotals = false;
  for (let i = 0; i < n; i++) {
    const raw = bars.size[i]!;
    const amount = Number.isFinite(raw) ? raw : 0;
    const m = measureAt(i);
    if (hasValue(i) && i + 1 < n && hasValue(i + 1)) connectNext[i] = 1;
    delta[i] = amount;
    if (isAbsolute(m) || isTotal(m)) {
      if (isAbsolute(m)) total = amount;
      isSum[i] = 1;
      direction[i] = TOTALS;
      hasTotals = true;
    } else {
      direction[i] = amount < 0 ? DECREASING : INCREASING;
      total += amount;
    }
    size[i] = total;
    final[i] = base + total;
  }
  const calc: WaterfallCalc = {
    ...bars,
    size,
    direction,
    isSum,
    delta,
    final,
    connectNext,
    hasTotals,
  };
  layoutAlone(WATERFALL_LAYOUT, calc, trace, ctx.index, ctx.fullLayout);
  return calc;
}

/** Cross-trace calc: every waterfall of a subplot laid out together per `waterfallmode`. */
export function crossTraceCalcWaterfall(
  entries: readonly CrossTraceEntry<WaterfallCalc>[],
  ctx: CrossTraceContext,
): void {
  crossTraceLayout(WATERFALL_LAYOUT, entries, ctx);
}

/**
 * The values a bar reports (Plotly's `calcTexttemplate` and hover): `delta` is the bar's own value,
 * or for a sum bar without one the running total; `initial = final − delta`.
 */
export function waterfallValues(
  calc: WaterfallCalc,
  i: number,
): { initial: number; delta: number; final: number } {
  const final = calc.final[i]!;
  const delta = calc.delta[i] || calc.size[i]!;
  return { initial: final - delta, delta, final };
}
