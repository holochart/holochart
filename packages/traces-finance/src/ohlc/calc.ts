/**
 * `ohlc` calc and cross-trace calc (plan E12.2; plotly.js `ohlc/calc.js`): the shared price calc,
 * with the ticks sized from the smallest x spacing of all the ohlc traces of a subplot (Plotly's
 * `_minDiff`, over the traces of an x axis): each tick is `tickwidth × minDiff` long, a bar hovers
 * over half the spacing on each side, and autorange pads x by the same half spacing.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { CalcContext, CrossTraceEntry } from '@mk7s/holochart-runtime';
import {
  calcPrices,
  sameSlot,
  simpleSlot,
  type PriceCalc,
  type PriceSlot,
} from '../shared/calc.ts';

/** The slot of ohlc bars spaced `minDiff` apart (NaN / infinite: 1, as Plotly). */
export function ohlcSlot(minDiff: number, trace: FullTrace): PriceSlot {
  const d = Number.isFinite(minDiff) ? minDiff : 1;
  const tickwidth = typeof trace['tickwidth'] === 'number' ? trace['tickwidth'] : 0.3;
  return simpleSlot(d, d * tickwidth);
}

/** Ohlc calc: prices and directions, with ticks sized as if the trace were alone. */
export function calcOhlc(trace: FullTrace, ctx: CalcContext): PriceCalc {
  const calc = calcPrices(trace, ctx);
  calc.slot = ohlcSlot(calc.minDiff, trace);
  return calc;
}

/**
 * Cross-trace calc: size the ticks of every ohlc trace of a subplot from their smallest spacing.
 * Reports the traces whose ticks changed.
 */
export function crossTraceCalcOhlc(entries: readonly CrossTraceEntry<PriceCalc>[]): number[] {
  let minDiff = Infinity;
  for (const e of entries) {
    if (e.calc && Number.isFinite(e.calc.minDiff)) minDiff = Math.min(minDiff, e.calc.minDiff);
  }
  const changed: number[] = [];
  for (const e of entries) {
    if (!e.calc) continue;
    const slot = ohlcSlot(minDiff, e.trace);
    if (sameSlot(slot, e.calc.slot)) continue;
    e.calc.slot = slot;
    changed.push(e.index);
  }
  return changed;
}
