/**
 * Autorange padding of stacked scatter traces that draw markers. A stacked trace spans its whole
 * stacked series, including the positions only other traces of the group have; Plotly
 * (`scatter/cross_trace_calc.js`) pads each slot of that series by its point's marker padding and
 * by 0 at gaps: `ppad[j] = cd[j].gap ? 0 : (arrayPad ? ppadRaw[cd[j].i] : ppadRaw)`.
 *
 * Expected extremes are worked out by hand: the stacked tops by adding the traces up, the marker
 * paddings as `max(size / 1.6, 3)` (`calcMarkerSize`), and the kept extremes with `findExtremes`'
 * dominance rule (a candidate is dropped when another one is at least as extreme with at least as
 * much padding).
 */
import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type CrossTraceContext,
  type SubplotInfo,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { calcScatter, type ScatterCalc } from './calc.ts';
import { scatterCrossTraceCalc } from './cross-trace.ts';
import { scatter } from './index.ts';

const registry = createChartRegistry().register(scatter);

function axisInfo(): AxisInfo {
  return {
    scale: createScale({ type: 'linear' }),
    type: 'linear',
    full: {},
  } as unknown as AxisInfo;
}

/** Calc and cross-trace calc of every trace, on one subplot with linear axes. */
function run(data: Record<string, unknown>[]) {
  const { fullData, fullLayout } = supplyDefaults({ data, layout: {} }, registry.core);
  const xaxis = axisInfo();
  const yaxis = axisInfo();
  const ctx: CalcContext = { fullLayout, index: 0, xaxis, yaxis };
  const traces: FullTrace[] = fullData.filter((t) => t.visible === true);
  const calcs: ScatterCalc[] = traces.map((t) => calcScatter(t, { ...ctx, index: t._index }));
  const cross: CrossTraceContext = { fullLayout, subplot: {} as SubplotInfo, xaxis, yaxis };
  scatterCrossTraceCalc(
    traces.map((trace, k) => ({ trace, index: trace._index, calc: calcs[k]! })),
    cross,
  );
  return { traces, calcs, ctx };
}

const at = (l: number, padPx = 0, extrapad = false) => ({ l, padPx, extrapad });

describe('scatter extremes: marker padding of stacked traces', () => {
  // A line with a peak at x = 1, then two marker traces that have no point there: their stacked
  // series passes through the peak (a gap slot) without a marker.
  const stacked = () =>
    run([
      { x: [0, 1, 2], y: [1, 10, 1], stackgroup: 'a' },
      {
        x: [0, 2],
        y: [2, 4],
        stackgroup: 'a',
        mode: 'lines+markers',
        marker: { size: [16, 4] },
      },
      { x: [0, 2], y: [1, 1], stackgroup: 'a', mode: 'lines+markers', marker: { size: 8 } },
    ]);

  it('stacks the series through the positions the marker traces lack', () => {
    const { calcs } = stacked();
    expect(Array.from(calcs[1]!.stack!.path.y)).toEqual([3, 10, 5]);
    expect(Array.from(calcs[1]!.stack!.slotIndex)).toEqual([0, -1, 1]);
    expect(Array.from(calcs[2]!.stack!.path.y)).toEqual([4, 10, 6]);
    expect(Array.from(calcs[2]!.stack!.slotIndex)).toEqual([0, -1, 1]);
  });

  it('a line-only member is not padded by markers', () => {
    const { traces, calcs, ctx } = stacked();
    const e = scatter.extremes!(calcs[0]!, traces[0]!, ctx);
    expect(e.y).toEqual({ min: [at(0)], max: [at(10, 0, true)] });
  });

  it('per-point sizes pad the slots of their own points, and gaps not at all', () => {
    const { traces, calcs, ctx } = stacked();
    // Sizes 16 and 4: paddings 10 and 3 (2.5 raised to the minimum), on the slots at x = 0 and 2.
    expect(Array.from(calcs[1]!.ppad as Float64Array)).toEqual([10, 3]);
    const e = scatter.extremes!(calcs[1]!, traces[1]!, ctx);
    // Tops 3 (pad 10), 10 (gap, pad 0), 5 (pad 3): none dominates another.
    expect(e.y).toEqual({
      min: [at(0)],
      max: [at(3, 10, true), at(10, 0, true), at(5, 3, true)],
    });
  });

  it('a single size pads every point slot the same, and gaps not at all', () => {
    const { traces, calcs, ctx } = stacked();
    // Size 8: padding 5.
    expect(calcs[2]!.ppad).toBe(5);
    const e = scatter.extremes!(calcs[2]!, traces[2]!, ctx);
    // Tops 4 (pad 5), 10 (gap, pad 0), 6 (pad 5): 6 dominates 4. Were the gap padded like a point,
    // the top at 10 alone would remain.
    expect(e.y).toEqual({ min: [at(0)], max: [at(10, 0, true), at(6, 5, true)] });
  });

  it('keeps x tight: stacked areas fill to the next trace along y', () => {
    const { traces, calcs, ctx } = stacked();
    for (const k of [1, 2]) {
      const e = scatter.extremes!(calcs[k]!, traces[k]!, ctx);
      expect(e.x).toEqual({ min: [at(0)], max: [at(2)] });
    }
  });
});
