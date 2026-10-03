/**
 * Implicit scatter coordinates (`x0 + i·dx`, `y0 + i·dy`) on axes whose linear space is not the
 * data space: log axes and linear axes with range breaks. Expected values follow Plotly's
 * `makeCalcdata` (`set_convert.js`): the steps are taken on the data values, which are then
 * converted (log10) or compressed and masked (range breaks).
 */
import { createBreakMap, createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { scatter, type ScatterCalc } from './index.ts';

const registry = createChartRegistry().register(scatter);

function defaults(data: unknown[]): FullTrace[] {
  return supplyDefaults({ data, layout: {} }, registry.core).fullData;
}

function axisInfo(type: 'linear' | 'log'): AxisInfo {
  return { scale: createScale({ type }), type, full: {} } as unknown as AxisInfo;
}

function calcOf(trace: FullTrace, axes: { x?: AxisInfo; y?: AxisInfo } = {}): ScatterCalc {
  const ctx: CalcContext = {
    fullLayout: {} as never,
    index: 0,
    xaxis: axes.x ?? axisInfo('linear'),
    yaxis: axes.y ?? axisInfo('linear'),
  };
  return scatter.calc!(trace, ctx) as ScatterCalc;
}

describe('scatter calc: implicit coordinates on a log axis', () => {
  it('steps x0 + i·dx on the data values, then takes log10', () => {
    const [trace] = defaults([{ y: [5, 6, 7], x0: 1, dx: 9, mode: 'markers' }]);
    const calc = calcOf(trace!, { x: axisInfo('log') });
    // Data x: 1, 10, 19 (not 10^(0 + 9i)).
    expect(calc.x[0]).toBe(0);
    expect(calc.x[1]).toBe(1);
    expect(calc.x[2]).toBeCloseTo(Math.log10(19), 12);
    expect([...calc.y]).toEqual([5, 6, 7]);
  });

  it('drops the implicit points that are not positive', () => {
    const [trace] = defaults([{ y: [5, 6, 7], x0: -10, dx: 10, mode: 'markers' }]);
    const calc = calcOf(trace!, { x: axisInfo('log') });
    // Data x: -10, 0, 10: only the last one exists on a log axis.
    expect([...calc.x]).toEqual([NaN, NaN, 1]);
  });

  it('does the same for y0 + i·dy when only x is given', () => {
    const [trace] = defaults([{ x: [1, 2, 3], y0: 100, dy: 900, mode: 'markers' }]);
    const calc = calcOf(trace!, { y: axisInfo('log') });
    // Data y: 100, 1000, 1900.
    expect(calc.y[0]).toBe(2);
    expect(calc.y[1]).toBe(3);
    expect(calc.y[2]).toBeCloseTo(Math.log10(1900), 12);
    expect([...calc.x]).toEqual([1, 2, 3]);
  });
});

describe('scatter calc: implicit coordinates across range breaks of a linear axis', () => {
  // The axis hides [10, 20): linear space is the raw value minus the length of the breaks between
  // 0 and it, so 20 lands on 10 and 25 on 15; values inside the break are masked.
  const broken = (): AxisInfo => {
    const breaks = createBreakMap([{ bounds: [10, 20] }], 'linear')!;
    return {
      scale: createScale({ type: 'linear', breaks }),
      type: 'linear',
      full: {},
    } as unknown as AxisInfo;
  };

  it('steps the raw values, then compresses them and masks those inside a break', () => {
    const [trace] = defaults([{ y: [1, 2, 3, 4, 5], x0: 5, dx: 5, mode: 'markers' }]);
    // Raw x: 5, 10, 15, 20, 25.
    expect([...calcOf(trace!, { x: broken() }).x]).toEqual([5, NaN, NaN, 10, 15]);
  });

  it('places implicit points where the same explicit x values go', () => {
    const [trace] = defaults([{ x: [5, 10, 15, 20, 25], y: [1, 2, 3, 4, 5], mode: 'markers' }]);
    expect([...calcOf(trace!, { x: broken() }).x]).toEqual([5, NaN, NaN, 10, 15]);
  });

  it('accepts a numeric string as the start', () => {
    const [trace] = defaults([{ y: [1, 2, 3], x0: '15', dx: 5, mode: 'markers' }]);
    // Raw x: 15 (hidden), 20, 25.
    expect([...calcOf(trace!, { x: broken() }).x]).toEqual([NaN, 10, 15]);
  });
});
