import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { IDENTITY_TRANSFORM } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type HoverContext,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { bar, type BarCalc } from './index.ts';

const registry = createChartRegistry().register(bar);

/** Two grouped traces over categories a, b; 100 px per category, 10 px per y unit. */
function setup(layout: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    {
      data: [
        { type: 'bar', x: ['a', 'b'], y: [4, 8], name: 'A', text: ['ta', 'tb'], ...extra },
        { type: 'bar', x: ['a', 'b'], y: [2, -3], name: 'B', customdata: ['c0', 'c1'] },
      ],
      layout,
    },
    registry.core,
  );
  const x = {
    id: 'x',
    scale: createScale({ type: 'category', categories: ['a', 'b'], range: [-0.5, 1.5] }),
  } as unknown as AxisInfo;
  const y = {
    id: 'y',
    scale: createScale({ type: 'linear', range: [-5, 10] }),
  } as unknown as AxisInfo;
  const calcs = fullData.map((t, index) =>
    bar.calc!(t, { fullLayout, index, xaxis: x, yaxis: y }),
  ) as BarCalc[];
  bar.crossTraceCalc!(
    fullData.map((trace, index) => ({ trace, index, calc: calcs[index]! })),
    { fullLayout, xaxis: x, yaxis: y, subplot: {} as never },
  );
  const ctx: HoverContext = {
    fullLayout,
    xaxis: x,
    yaxis: y,
    // l → px: x = 100·l + 50, y = 10·l + 50.
    transform: { ...IDENTITY_TRANSFORM, scaleX: 100, offsetX: 50, scaleY: 10, offsetY: 50 },
  };
  return { traces: fullData as FullTrace[], calcs, ctx };
}

const query = (px: number, py: number, mode: HoverQuery['mode'] = 'closest'): HoverQuery => ({
  px,
  py,
  xl: (px - 50) / 100,
  yl: (py - 50) / 10,
  mode,
  distance: 20,
});

describe('bar hoverPoints', () => {
  it('closest: finds the bar under the pointer and anchors the label at its end', () => {
    const { traces, calcs, ctx } = setup();
    // Trace A's bar at 'a' spans x 30–70 px (center -0.2 → 30 px), y 50–90 px.
    const [hit] = bar.hoverPoints!(calcs[0]!, traces[0]!, query(35, 60), ctx);
    expect(hit).toMatchObject({ pointIndex: 0, x: 'a', y: 4, text: 'ta', px: 30, py: 90 });
    expect(hit!.color).toBe('rgb(31, 119, 180)');
    expect(hit!.distance).toBeCloseTo(5);
    expect(bar.hoverPoints!(calcs[0]!, traces[0]!, query(35, 95), ctx)).toEqual([]);
  });

  it('x mode: reports every bar of the group at the pointer position', () => {
    const { traces, calcs, ctx } = setup();
    const a = bar.hoverPoints!(calcs[0]!, traces[0]!, query(90, 0, 'x'), ctx);
    const b = bar.hoverPoints!(calcs[1]!, traces[1]!, query(90, 0, 'x'), ctx);
    expect(a.map((p) => p.pointIndex)).toEqual([0]);
    expect(b.map((p) => p.pointIndex)).toEqual([0]);
    // Both bars of the group tie.
    expect(a[0]!.distance).toBe(b[0]!.distance);
    expect(b[0]!.fields).toMatchObject({ customdata: 'c0', value: 2, label: 'a' });
  });

  it('keeps zero-length bars hoverable', () => {
    const { traces, calcs, ctx } = setup({}, { y: [0, 8] });
    expect(bar.hoverPoints!(calcs[0]!, traces[0]!, query(30, 51), ctx)).toHaveLength(1);
  });

  it('anchors horizontal bars at their right end', () => {
    const { fullData, fullLayout } = supplyDefaults(
      { data: [{ type: 'bar', y: ['a'], x: [3], orientation: 'h' }] },
      registry.core,
    );
    const x = {
      id: 'x',
      scale: createScale({ type: 'linear', range: [0, 5] }),
    } as unknown as AxisInfo;
    const y = {
      id: 'y',
      scale: createScale({ type: 'category', categories: ['a'], range: [-0.5, 0.5] }),
    } as unknown as AxisInfo;
    const calc = bar.calc!(fullData[0]!, { fullLayout, index: 0, xaxis: x, yaxis: y }) as BarCalc;
    const ctx: HoverContext = {
      fullLayout,
      xaxis: x,
      yaxis: y,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 10, scaleY: 100, offsetY: 50 },
    };
    const [hit] = bar.hoverPoints!(calc, fullData[0]!, query(10, 50), ctx);
    expect(hit).toMatchObject({ px: 30, py: 50, x: 3, y: 'a' });
  });
});

describe('bar selectPoints', () => {
  it('selects bars whose center is inside the box', () => {
    const { traces, calcs, ctx } = setup();
    // A's centers: (-0.2, 2) and (0.8, 4).
    const rect = { kind: 'rect' as const, x: [-0.5, 0.5] as const, y: [0, 3] as const };
    expect(bar.selectPoints!(calcs[0]!, traces[0]!, rect, ctx)).toEqual([0]);
    const all = { kind: 'rect' as const, x: [-1, 2] as const, y: [0, 5] as const };
    expect(bar.selectPoints!(calcs[0]!, traces[0]!, all, ctx)).toEqual([0, 1]);
  });

  it('selects with a lasso polygon', () => {
    const { traces, calcs, ctx } = setup();
    const polygon = [
      [0.5, 3],
      [1.2, 3],
      [1.2, 5],
      [0.5, 5],
    ] as const;
    const lasso = { kind: 'lasso' as const, x: [0.5, 1.2] as const, y: [3, 5] as const, polygon };
    expect(bar.selectPoints!(calcs[0]!, traces[0]!, lasso, ctx)).toEqual([1]);
  });
});
