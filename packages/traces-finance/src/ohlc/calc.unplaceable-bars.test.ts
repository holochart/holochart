/**
 * Ohlc tick sizing when a trace has no bar that can be placed on x (missing x values, or every
 * bar inside a range break). Expected values follow plotly.js `ohlc/calc.js` `convertTickWidth`:
 * the shared spacing is the smallest finite `minDiff` of the ohlc traces of the x axis, traces
 * without one are skipped, and the spacing is 1 when no trace has one. A tick is then
 * `tickwidth × spacing` long, and a bar hovers (and pads the autorange) over half the spacing on
 * each side.
 */
import type { CrossTraceEntry } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { calcOf } from '../__testing__/figure.ts';
import type { PriceCalc } from '../shared/calc.ts';
import { crossTraceCalcOhlc } from './calc.ts';

const PRICES = { open: [1, 1], high: [2, 2], low: [0, 0], close: [2, 2] };

describe('ohlc ticks of traces without a placeable bar', () => {
  it('uses a spacing of 1 when no trace of the subplot has one', () => {
    const lost = calcOf({ x: [null, null], ...PRICES });
    expect(lost.trace.visible).toBe(true);
    expect(Array.from(lost.calc.drawn)).toEqual([]);
    expect(lost.calc.minDiff).toBeNaN();
    const unit = { dPos: 0.5, bPos: 0, halfWidth: 0.3, wHover: 0.5 };
    expect(lost.calc.slot).toEqual(unit);
    // The cross-trace pass agrees with what the trace got alone: nothing to redraw.
    expect(crossTraceCalcOhlc([{ trace: lost.trace, index: 0, calc: lost.calc }])).toEqual([]);
    expect(lost.calc.slot).toEqual(unit);
  });

  it('does the same when every bar falls inside a range break', () => {
    // Saturday and Sunday on an axis that hides weekends.
    const weekend = calcOf(
      { x: ['2024-01-06', '2024-01-07'], ...PRICES, tickwidth: 0.2 },
      { x: { type: 'date', rangebreaks: [{ bounds: ['sat', 'mon'] }] } },
    );
    expect(Array.from(weekend.calc.pos)).toEqual([NaN, NaN]);
    expect(Array.from(weekend.calc.drawn)).toEqual([]);
    expect(weekend.calc.slot).toEqual({ dPos: 0.5, bPos: 0, halfWidth: 0.2, wHover: 0.5 });
    const entries = [{ trace: weekend.trace, index: 0, calc: weekend.calc }];
    expect(crossTraceCalcOhlc(entries)).toEqual([]);
  });

  it('skips such a trace when sharing the smallest spacing, and sizes its ticks from the others', () => {
    const spaced = calcOf({
      x: [0, 4, 8],
      open: [1, 1, 1],
      high: [2, 2, 2],
      low: [0, 0, 0],
      close: [2, 2, 2],
    });
    const lost = calcOf({ x: [null, null], ...PRICES, tickwidth: 0.5 });
    const entries: CrossTraceEntry<PriceCalc>[] = [
      { trace: spaced.trace, index: 0, calc: spaced.calc },
      { trace: lost.trace, index: 1, calc: lost.calc },
    ];
    // Only the trace without positions changes: the spaced one already had the spacing of 4.
    expect(crossTraceCalcOhlc(entries)).toEqual([1]);
    expect(spaced.calc.slot.dPos).toBe(2);
    expect(spaced.calc.slot.wHover).toBe(2);
    expect(spaced.calc.slot.halfWidth).toBeCloseTo(0.3 * 4);
    // Spacing 4, tickwidth 0.5.
    expect(lost.calc.slot).toEqual({ dPos: 2, bPos: 0, halfWidth: 2, wHover: 2 });
    expect(crossTraceCalcOhlc(entries)).toEqual([]);
  });
});
