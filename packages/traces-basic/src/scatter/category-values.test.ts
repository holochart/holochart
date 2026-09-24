import { createScale, supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { scatter, type ScatterCalc } from './index.ts';

const registry = createChartRegistry().register(scatter);

function axisInfo(type: 'linear' | 'log' | 'category', categories?: string[]): AxisInfo {
  const scale = createScale({ type, ...(categories ? { categories } : {}) });
  return { scale, type, full: {} } as unknown as AxisInfo;
}

describe('scatter category values (value-based categoryorder, E3.6)', () => {
  it('pairs the category index with the other coordinate', () => {
    const [trace] = supplyDefaults(
      { data: [{ x: ['b', 'a', 'zz'], y: [1, 2, 3] }], layout: {} },
      registry.core,
    ).fullData;
    const ctx: CalcContext = {
      fullLayout: {} as never,
      index: 0,
      xaxis: axisInfo('category', ['a', 'b']),
      yaxis: axisInfo('linear'),
    };
    const calc = scatter.calc!(trace!, ctx) as ScatterCalc;
    const s = scatter.categoryValues!(calc, trace!, 'x', ctx)!;
    // Unknown categories are NaN indices (skipped when collecting).
    expect(Array.from(s.index)).toEqual([1, 0, NaN]);
    expect(Array.from(s.value)).toEqual([1, 2, 3]);
  });

  it('reports data values, not log10, from a log value axis (Plotly calc space)', () => {
    const [trace] = supplyDefaults(
      { data: [{ y: ['p', 'q'], x: [10, 1000] }], layout: {} },
      registry.core,
    ).fullData;
    const ctx: CalcContext = {
      fullLayout: {} as never,
      index: 0,
      xaxis: axisInfo('log'),
      yaxis: axisInfo('category', ['p', 'q']),
    };
    const calc = scatter.calc!(trace!, ctx) as ScatterCalc;
    const s = scatter.categoryValues!(calc, trace!, 'y', ctx)!;
    expect(Array.from(s.index)).toEqual([0, 1]);
    expect(Array.from(s.value).map((v) => Math.round(v))).toEqual([10, 1000]);
  });
});
