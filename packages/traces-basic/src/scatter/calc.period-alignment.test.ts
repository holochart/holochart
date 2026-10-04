/**
 * `xperiod` / `yperiod` in scatter calc: which periods align the points and which leave them where
 * they are. Expected values are worked out by hand from Plotly's `alignPeriod`
 * (`plots/cartesian/align_period.js`): periods tile the axis from `period0`, a point moves to the
 * start, middle or end of the period containing it, and a non-positive period (or a month period
 * off a date axis) aligns nothing.
 */
import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { scatter, type ScatterCalc } from './index.ts';

const registry = createChartRegistry().register(scatter);

function defaults(data: unknown[]): FullTrace[] {
  return supplyDefaults({ data, layout: {} }, registry.core).fullData;
}

function axisInfo(type: 'linear' | 'date'): AxisInfo {
  return { scale: createScale({ type }), type, full: {} } as unknown as AxisInfo;
}

function calcOf(trace: FullTrace, xType: 'linear' | 'date' = 'linear'): ScatterCalc {
  const ctx: CalcContext = {
    fullLayout: {} as never,
    index: 0,
    xaxis: axisInfo(xType),
    yaxis: axisInfo('linear'),
  };
  return scatter.calc!(trace, ctx) as ScatterCalc;
}

describe('scatter calc: period alignment', () => {
  it('leaves positions where they are when the period is not positive', () => {
    const [trace] = defaults([{ x: [0, 10, 20], y: [1, 2, 3], xperiod: -5 }]);
    expect(trace!['xperiod']).toBe(-5);
    expect([...calcOf(trace!).x]).toEqual([0, 10, 20]);
  });

  it('leaves positions where they are for a month period on a linear axis', () => {
    const [trace] = defaults([{ x: [0, 10, 20], y: [1, 2, 3], xperiod: 'M1' }]);
    expect([...calcOf(trace!).x]).toEqual([0, 10, 20]);
  });

  it('puts points mid-month for a month period on a date axis', () => {
    const [trace] = defaults([{ x: ['2024-01-10', '2024-02-10'], y: [1, 2], xperiod: 'M1' }]);
    // January has 31 days, February 2024 has 29: the middles are 15.5 and 14.5 days in.
    expect([...calcOf(trace!, 'date').x]).toEqual([
      Date.UTC(2024, 0, 16, 12),
      Date.UTC(2024, 1, 15, 12),
    ]);
  });

  it('aligns y to the end of its period, and to the start of periods tiled from yperiod0', () => {
    const [end, start] = defaults([
      { x: [1, 2, 3], y: [3, 12, 27], yperiod: 10, yperiodalignment: 'end' },
      { x: [1, 2, 3], y: [3, 12, 27], yperiod: 10, yperiod0: 5, yperiodalignment: 'start' },
    ]);
    // Periods [0, 10), [10, 20), [20, 30).
    expect([...calcOf(end!).y]).toEqual([10, 20, 30]);
    // Periods [-5, 5), [5, 15), [15, 25), [25, 35).
    expect([...calcOf(start!).y]).toEqual([-5, 5, 25]);
    expect([...calcOf(start!).x]).toEqual([1, 2, 3]);
  });
});
