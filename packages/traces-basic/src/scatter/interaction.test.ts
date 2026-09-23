import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createChartRegistry,
  type AxisInfo,
  type HoverContext,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { scatter, type ScatterCalc } from './index.ts';

const registry = createChartRegistry().register(scatter);

function setup(input: Record<string, unknown>, scaleX = 10, scaleY = 10) {
  const [trace] = supplyDefaults({ data: [input], layout: {} }, registry.core).fullData;
  const axis = { scale: createScale({ type: 'linear' }), type: 'linear' } as unknown as AxisInfo;
  const calc = scatter.calc!(trace!, {
    fullLayout: {} as never,
    index: 0,
    xaxis: axis,
    yaxis: axis,
  }) as ScatterCalc;
  const ctx: HoverContext = {
    fullLayout: {} as never,
    xaxis: axis,
    yaxis: axis,
    transform: { scaleX, scaleY, offsetX: 5, offsetY: 7 },
  };
  return { trace: trace as FullTrace, calc, ctx };
}

function query(
  xl: number,
  yl: number,
  mode: HoverQuery['mode'] = 'closest',
  distance = 20,
): HoverQuery {
  return { xl, yl, px: xl * 10 + 5, py: yl * 10 + 7, mode, distance };
}

describe('scatter hoverPoints', () => {
  const data = {
    x: [0, 1, 2, 3, 4],
    y: [0, 3, 1, 4, 2],
    mode: 'markers',
    text: ['a', 'b', 'c', 'd', 'e'],
    customdata: [10, 11, 12, 13, 14],
    marker: { size: 10, color: 'red' },
  };

  it('finds the closest point with its label anchor, values and fields', () => {
    const { trace, calc, ctx } = setup(data);
    const [hit] = scatter.hoverPoints!(calc, trace, query(1.1, 2.8), ctx);
    expect(hit).toMatchObject({
      pointIndex: 1,
      px: 15,
      py: 37,
      x: 1,
      y: 3,
      text: 'b',
      color: 'rgb(255, 0, 0)',
      fields: { 'marker.size': 10, customdata: 11 },
    });
    // Inside the marker: Plotly's distance floor (1 − 3/r).
    expect(hit!.distance).toBeCloseTo(1 - 3 / 5);
  });

  it('respects hoverdistance, and searches without a limit', () => {
    const { trace, calc, ctx } = setup(data);
    // ≥ 4.1 units (41 px) from every point, minus the 5 px radius: beyond 20 px.
    expect(scatter.hoverPoints!(calc, trace, query(2, 8), ctx)).toEqual([]);
    const [far] = scatter.hoverPoints!(calc, trace, query(3, 40, 'closest', Infinity), ctx);
    expect(far?.pointIndex).toBe(3);
    expect(far?.distance).toBeCloseTo(360 - 5);
  });

  it('ranks by px distance on anisotropic axes', () => {
    // 1 x unit = 100 px, 1 y unit = 1 px: point 0 is nearer in linear units (0.9 vs 3.0), but
    // point 1 is nearer on screen (90 px vs 10.4 px).
    const { trace, calc, ctx } = setup({ x: [0, 1], y: [3, 0], mode: 'markers' }, 100, 1);
    const q: HoverQuery = { xl: 0.9, yl: 3, px: 0, py: 0, mode: 'closest', distance: Infinity };
    expect(scatter.hoverPoints!(calc, trace, q, ctx)[0]?.pointIndex).toBe(1);
  });

  it('picks the nearest x (sorted or not) and the nearest y', () => {
    const { trace, calc, ctx } = setup(data);
    expect(scatter.hoverPoints!(calc, trace, query(2.9, 0, 'x'), ctx)[0]?.pointIndex).toBe(3);
    expect(scatter.hoverPoints!(calc, trace, query(0, 1.2, 'y'), ctx)[0]?.pointIndex).toBe(2);
    const shuffled = setup({ x: [3, 0, 4, 1, 2], y: [1, 2, 3, 4, 5], mode: 'lines' });
    const hits = scatter.hoverPoints!(
      shuffled.calc,
      shuffled.trace,
      query(0.8, 100, 'x', Infinity),
      shuffled.ctx,
    );
    expect(hits[0]?.pointIndex).toBe(3);
    const limited = scatter.hoverPoints!(
      shuffled.calc,
      shuffled.trace,
      query(0.8, 100, 'x'),
      shuffled.ctx,
    );
    expect(limited[0]?.pointIndex).toBe(3);
  });

  it('skips gaps and reports implicit x values', () => {
    const { trace, calc, ctx } = setup({ y: [1, null, 3], x0: 10, dx: 5, mode: 'lines' });
    const [hit] = scatter.hoverPoints!(calc, trace, query(15, 2, 'x', Infinity), ctx);
    expect(hit?.pointIndex).not.toBe(1);
    const [last] = scatter.hoverPoints!(calc, trace, query(20, 3), ctx);
    expect(last).toMatchObject({ pointIndex: 2, x: 20, y: 3 });
  });

  it('uses colorscale colors for hover labels', () => {
    const { trace, calc, ctx } = setup({
      x: [0, 1],
      y: [0, 1],
      mode: 'markers',
      marker: {
        color: [0, 1],
        colorscale: [
          [0, 'black'],
          [1, 'white'],
        ],
      },
    });
    expect(scatter.hoverPoints!(calc, trace, query(1, 1), ctx)[0]?.color).toBe(
      'rgb(255, 255, 255)',
    );
  });
});

describe('scatter selectPoints', () => {
  const data = { x: [0, 1, 2, 3], y: [0, 1, 2, 3], mode: 'markers' };

  it('selects by box and by lasso', () => {
    const { trace, calc, ctx } = setup(data);
    expect(
      scatter.selectPoints!(calc, trace, { kind: 'rect', x: [0.5, 2.5], y: [0, 5] }, ctx),
    ).toEqual([1, 2]);
    const lasso = scatter.selectPoints!(
      calc,
      trace,
      {
        kind: 'lasso',
        x: [-1, 4],
        y: [-1, 4],
        polygon: [
          [-1, -1],
          [4, -1],
          [4, 4],
        ],
      },
      ctx,
    );
    // Points on the diagonal edge are on the boundary; the strictly inside ones must be there.
    expect(lasso).toEqual(expect.arrayContaining([0, 1, 2]));
  });

  it('does not select bare lines', () => {
    const { trace, calc, ctx } = setup({ ...data, mode: 'lines' });
    expect(
      scatter.selectPoints!(calc, trace, { kind: 'rect', x: [-9, 9], y: [-9, 9] }, ctx),
    ).toEqual([]);
  });
});

describe('scatter legendIcon', () => {
  const icon = (input: Record<string, unknown>) => scatter.legendIcon!(setup(input).trace);

  it('reflects the mode', () => {
    expect(icon({ y: [1, 2], mode: 'lines' })).toEqual({
      kind: 'line',
      line: { color: 'rgb(31, 119, 180)', width: 2, dash: 'solid' },
    });
    expect(icon({ y: [1, 2], mode: 'markers', marker: { symbol: 'diamond', size: 30 } })).toEqual({
      kind: 'marker',
      marker: {
        symbol: 'diamond',
        size: 16,
        color: 'rgb(31, 119, 180)',
        lineColor: 'rgb(68, 68, 68)',
        lineWidth: 0,
        opacity: 1,
      },
    });
    expect(icon({ y: [1, 2], line: { dash: 'dot' } }).kind).toBe('lines+markers');
    expect(icon({ y: [1, 2], mode: 'text', text: 'a' }).kind).toBe('marker');
  });

  it('uses the first point of per-point styles', () => {
    const glyph = icon({
      y: [1, 2],
      mode: 'markers',
      opacity: 0.5,
      marker: { color: ['red', 'blue'], symbol: ['square', 'circle'], opacity: [0.8, 1] },
    });
    expect(glyph.marker).toMatchObject({ color: 'red', symbol: 'square', opacity: 0.4 });
  });
});
