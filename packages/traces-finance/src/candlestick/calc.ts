/**
 * `candlestick` calc and cross-trace calc (plan E12.3; plotly.js `candlestick/calc.js` and box's
 * `cross_trace_calc.js` `setPositionOffset`, which lays candles out as boxes): the shared price
 * calc, with the candles of a subplot sized from the smallest spacing of all their positions (half
 * of it, `dPos`, is a position's slot) and `layout.boxgap` / `boxgroupgap` / `boxmode`: a candle is
 * `2 · dPos · (1 − boxgap) · (1 − boxgroupgap)` wide, and in `group` mode the candlestick traces
 * share each slot side by side.
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { CalcContext, CrossTraceEntry } from '@mk7s/holochart-runtime';
import {
  calcPrices,
  distinctMinDiff,
  sameSlot,
  type PriceCalc,
  type PriceSlot,
} from '../shared/calc.ts';
import { CANDLE_COUNT, CANDLE_NUM } from './defaults.ts';

function num(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** The slots of candlestick traces laid out together (in order), Plotly's `setPositionOffset`. */
export function candleSlots(
  entries: readonly { readonly calc: PriceCalc; readonly trace: FullTrace }[],
  fullLayout: FullLayout,
): PriceSlot[] {
  if (entries.length === 0) return [];
  const first = entries[0]!.calc;
  let minDiff: number;
  if (first.xType === 'category' || first.xType === 'multicategory') minDiff = 1;
  else if (entries.length === 1) minDiff = first.minDiff;
  else {
    const all = new Float64Array(entries.reduce((n, e) => n + e.calc.length, 0));
    let k = 0;
    for (const e of entries) {
      all.set(e.calc.pos, k);
      k += e.calc.length;
    }
    minDiff = distinctMinDiff(all);
  }
  const dPos = (Number.isFinite(minDiff) ? minDiff : 1) / 2;
  const total = num(fullLayout[CANDLE_COUNT], 1);
  const group = fullLayout['boxmode'] === 'group' && total > 1;
  const groupFraction = 1 - num(fullLayout['boxgap'], 0.3);
  const groupGapFraction = 1 - num(fullLayout['boxgroupgap'], 0.3);
  return entries.map(({ trace }) => {
    if (!group) {
      return { dPos, bPos: 0, halfWidth: dPos * groupFraction * groupGapFraction, wHover: dPos };
    }
    const shift = num(trace[CANDLE_NUM], 0);
    return {
      dPos,
      bPos: 2 * dPos * (-0.5 + (shift + 0.5) / total) * groupFraction,
      halfWidth: (dPos * groupFraction * groupGapFraction) / total,
      wHover: (dPos * groupFraction) / total,
    };
  });
}

/** Candlestick calc: prices and directions, with candles laid out as if the trace were alone. */
export function calcCandlestick(trace: FullTrace, ctx: CalcContext): PriceCalc {
  const calc = calcPrices(trace, ctx);
  calc.slot = candleSlots([{ calc, trace }], ctx.fullLayout)[0]!;
  return calc;
}

/**
 * Cross-trace calc: lay out every candlestick trace of a subplot together. Reports the traces
 * whose candles moved or changed width.
 */
export function crossTraceCalcCandlestick(
  entries: readonly CrossTraceEntry<PriceCalc>[],
  fullLayout: FullLayout,
): number[] {
  const live = entries.filter((e) => e.calc);
  const slots = candleSlots(live, fullLayout);
  const changed: number[] = [];
  live.forEach((e, k) => {
    const slot = slots[k]!;
    if (sameSlot(slot, e.calc.slot)) return;
    e.calc.slot = slot;
    changed.push(e.index);
  });
  return changed;
}
