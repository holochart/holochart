// @vitest-environment jsdom
/**
 * `ComponentModule.extremes` (M2 wave 1): components add to the autorange next to the traces, the
 * way Plotly's data-referenced shapes do (`shapes/calc_autorange.js`).
 */
import type { AxisExtremes } from '@mk7s/holochart-core';
import { afterEach, describe, expect, it } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import type { ComponentExtremesContext, ComponentModule } from './contracts.ts';
import { setup } from './__testing__/fakes.ts';

const charts: Chart[] = [];
afterEach(() => {
  for (const c of charts.splice(0)) c.destroy();
});

/** A component that asks for y = `top` (linear) on axis `y`, recording its calls. */
function marker(top: number, calls: ComponentExtremesContext[]): ComponentModule {
  return {
    name: 'marker',
    extremes(ctx) {
      calls.push(ctx);
      const y: AxisExtremes = { min: [], max: [{ l: top, padPx: 0 }] };
      return { y };
    },
  };
}

function yRange(chart: Chart): number[] {
  return (chart.fullLayout?.['yaxis'] as { range: number[] }).range;
}

describe('component extremes', () => {
  it('extend the autorange of the axis they name', async () => {
    const calls: ComponentExtremesContext[] = [];
    const t = setup({ width: 400, height: 300, components: [marker(50, calls)] });
    const chart = createChart(
      t.container,
      { data: [{ type: 'dots', x: [0, 1], y: [0, 10] }] },
      t.options,
    );
    charts.push(chart);
    await chart.ready;
    expect(yRange(chart)[1]).toBeGreaterThanOrEqual(50);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]!.axes.has('y')).toBe(true);
    expect(calls[0]!.fullData).toHaveLength(1);
  });

  it('are ignored when the axis range is fixed', async () => {
    const t = setup({ width: 400, height: 300, components: [marker(50, [])] });
    const chart = createChart(
      t.container,
      { data: [{ type: 'dots', x: [0, 1], y: [0, 10] }], layout: { yaxis: { range: [0, 20] } } },
      t.options,
    );
    charts.push(chart);
    await chart.ready;
    expect(yRange(chart)).toEqual([0, 20]);
  });
});
