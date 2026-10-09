/**
 * Autorange extremes of scatter traces that fill along x (`tozerox`, `tonextx`, horizontal
 * stacks). Expected values are worked out by hand from Plotly's `calcAxisExpansion`
 * (`scatter/calc.js`) and `findExtremes`:
 *
 * - x includes 0 for an open `tozerox` fill, and for a `tonextx` fill when the trace is the first
 *   scatter trace of its group or stacks horizontally; the 0 end is the baseline (no padding), the
 *   other end keeps the marker padding and the 5% extra padding; only linear axes extend to zero;
 * - otherwise x is tight (no padding at all) for traces with neither markers nor text;
 * - y is tight in the 5% sense (`padded: false`) for any x fill, keeping the marker padding.
 */
import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type CrossTraceContext,
  type SubplotInfo,
  type TraceExtremes,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { calcScatter, type ScatterCalc } from './calc.ts';
import { scatterCrossTraceCalc } from './cross-trace.ts';
import { scatter } from './index.ts';

const registry = createChartRegistry().register(scatter);

function axisInfo(type: 'linear' | 'log'): AxisInfo {
  return { scale: createScale({ type }), type, full: {} } as unknown as AxisInfo;
}

/** Calc, cross-trace calc and extremes of every trace, on one subplot. */
function extremes(data: Record<string, unknown>[], axes: { x?: AxisInfo } = {}) {
  const { fullData, fullLayout } = supplyDefaults({ data, layout: {} }, registry.core);
  const xaxis = axes.x ?? axisInfo('linear');
  const yaxis = axisInfo('linear');
  const ctx: CalcContext = { fullLayout, index: 0, xaxis, yaxis };
  const traces: FullTrace[] = fullData.filter((t) => t.visible === true);
  const calcs: ScatterCalc[] = traces.map((t) => calcScatter(t, { ...ctx, index: t._index }));
  const cross: CrossTraceContext = { fullLayout, subplot: {} as SubplotInfo, xaxis, yaxis };
  scatterCrossTraceCalc(
    traces.map((trace, k) => ({ trace, index: trace._index, calc: calcs[k]! })),
    cross,
  );
  const out: TraceExtremes[] = traces.map((t, k) => scatter.extremes!(calcs[k]!, t, ctx));
  return { traces, calcs, extremes: out };
}

/** One extreme: linear value, px padding, whether the 5% extra padding applies. */
const at = (l: number, padPx = 0, extrapad = false) => ({ l, padPx, extrapad });

describe('scatter extremes: fills along x', () => {
  it('tozerox includes x = 0 as an unpadded baseline and makes y tight', () => {
    const { extremes: e } = extremes([
      { x: [2, 5, 3], y: [1, 2, 3], fill: 'tozerox', mode: 'lines' },
    ]);
    expect(e[0]!.x).toEqual({ min: [at(0)], max: [at(5, 0, true)] });
    expect(e[0]!.y).toEqual({ min: [at(1)], max: [at(3)] });
  });

  it('tozerox with markers keeps their padding away from the baseline', () => {
    const { extremes: e } = extremes([
      { x: [2, 5, 3], y: [1, 2, 3], fill: 'tozerox', mode: 'lines+markers', marker: { size: 8 } },
    ]);
    // Marker padding max(8 / 1.6, 3) = 5 px; the baseline at 0 gets none.
    expect(e[0]!.x).toEqual({ min: [at(0)], max: [at(5, 5, true)] });
    expect(e[0]!.y).toEqual({ min: [at(1, 5)], max: [at(3, 5)] });
  });

  it('tozerox on a log x axis cannot reach zero: x stays padded at both ends', () => {
    const { calcs, extremes: e } = extremes(
      [{ x: [10, 1000], y: [1, 2], fill: 'tozerox', mode: 'lines' }],
      { x: axisInfo('log') },
    );
    expect([...calcs[0]!.x]).toEqual([1, 3]);
    expect(e[0]!.x).toEqual({ min: [at(1, 0, true)], max: [at(3, 0, true)] });
    expect(e[0]!.y).toEqual({ min: [at(1)], max: [at(2)] });
  });

  it('a closed tozerox shape only fills itself: no zero, x tight', () => {
    const { extremes: e } = extremes([
      { x: [2, 5, 2], y: [1, 2, 1], fill: 'tozerox', mode: 'lines' },
    ]);
    expect(e[0]!.x).toEqual({ min: [at(2)], max: [at(5)] });
    expect(e[0]!.y).toEqual({ min: [at(1)], max: [at(2)] });
  });

  it('tonextx reaches zero for the first scatter trace only', () => {
    const { extremes: e } = extremes([
      { x: [2, 5], y: [1, 2], fill: 'tonextx', mode: 'lines' },
      { x: [8, 9], y: [1, 2], fill: 'tonextx', mode: 'lines' },
    ]);
    // First: fills to the axis.
    expect(e[0]!.x).toEqual({ min: [at(0)], max: [at(5, 0, true)] });
    expect(e[0]!.y).toEqual({ min: [at(1)], max: [at(2)] });
    // Second: fills to the first trace; a line without markers is tight in x.
    expect(e[1]!.x).toEqual({ min: [at(8)], max: [at(9)] });
    expect(e[1]!.y).toEqual({ min: [at(1)], max: [at(2)] });
  });

  it('a later tonextx trace with markers is padded in x, and keeps only the px padding in y', () => {
    const { extremes: e } = extremes([
      { x: [2, 5], y: [1, 2], mode: 'lines' },
      { x: [8, 9], y: [1, 2], fill: 'tonextx', mode: 'markers', marker: { size: 8 } },
    ]);
    expect(e[1]!.x).toEqual({ min: [at(8, 5, true)], max: [at(9, 5, true)] });
    expect(e[1]!.y).toEqual({ min: [at(1, 5)], max: [at(2, 5)] });
  });

  it('every trace of a horizontal stack reaches zero in x', () => {
    const {
      traces,
      calcs,
      extremes: e,
    } = extremes([
      { y: [1, 2], x: [1, 3], stackgroup: 'a', orientation: 'h' },
      { y: [1, 2], x: [3, 2], stackgroup: 'a' },
    ]);
    expect(traces[1]!['fill']).toBe('tonextx');
    // Stacked x of the second trace: 1 + 3 and 3 + 2.
    expect([...calcs[1]!.x]).toEqual([4, 5]);
    expect(e[1]!.x).toEqual({ min: [at(0)], max: [at(5, 0, true)] });
    expect(e[1]!.y).toEqual({ min: [at(1)], max: [at(2)] });
  });
});
