import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  IDENTITY_TRANSFORM,
  type MarkerSet,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type TracePlotContext,
  type TraceUpdatePlan,
} from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { scatter, type ScatterCalc } from './index.ts';
import { markerStyle } from './plot.ts';

const registry = createChartRegistry().register(scatter);

function defaults(data: unknown[], layout: unknown = {}): FullTrace[] {
  return supplyDefaults({ data, layout }, registry.core).fullData;
}

function axisInfo(type: 'linear' | 'log' | 'date' | 'category', categories?: string[]): AxisInfo {
  const scale = createScale({ type, ...(categories ? { categories } : {}) });
  return { scale, type } as unknown as AxisInfo;
}

describe('scatter defaults', () => {
  it('follows the Plotly mode rule and colorway', () => {
    const few = { x: [1, 2, 3], y: [1, 2, 3] };
    const many = { y: Array.from({ length: 25 }, (_, i) => i) };
    const [a, b] = defaults([few, many]);
    expect(a?.['mode']).toBe('lines+markers');
    expect(a?.['marker']).toMatchObject({
      color: 'rgb(31, 119, 180)',
      size: 6,
      symbol: 'circle',
      line: { color: 'rgb(68, 68, 68)', width: 0 },
    });
    expect(b?.['mode']).toBe('lines');
    // Markers are off, so marker attributes are not defaulted.
    expect(b?.['marker']).toBeUndefined();
    expect(b?.['x0']).toBe(0);
    expect(b?.['_length']).toBe(25);
  });

  it('uses the shorter of x and y, and hides traces without data', () => {
    const [a, b] = defaults([{ x: [1, 2, 3], y: [1, 2] }, { mode: 'markers' }]);
    expect(a?.['_length']).toBe(2);
    expect(b?.visible).toBe(false);
  });

  it('accepts symbol names, codes and per-point arrays', () => {
    const [a, b, c] = defaults([
      { y: [1], mode: 'markers', marker: { symbol: 'diamond-open-dot' } },
      { y: [1], mode: 'markers', marker: { symbol: 102 } },
      { y: [1, 2], mode: 'markers', marker: { symbol: ['square', 3] } },
    ]);
    expect((a?.['marker'] as { symbol: unknown }).symbol).toBe('diamond-open-dot');
    expect((b?.['marker'] as { symbol: unknown }).symbol).toBe(102);
    expect((c?.['marker'] as { symbol: unknown }).symbol).toEqual(['square', 3]);
  });
});

describe('scatter calc', () => {
  const ctx = (x: AxisInfo, y: AxisInfo) => ({
    fullLayout: {} as never,
    index: 0,
    xaxis: x,
    yaxis: y,
  });

  it('linearizes coordinates through the axes', () => {
    const [trace] = defaults([{ x: ['b', 'a', 'b'], y: [1, 10, 100], mode: 'markers' }]);
    const calc = scatter.calc!(
      trace!,
      ctx(axisInfo('category', ['b', 'a']), axisInfo('log')),
    ) as ScatterCalc;
    expect([...calc.x]).toEqual([0, 1, 0]);
    expect([...calc.y]).toEqual([0, 1, 2]);
    expect(calc.length).toBe(3);
  });

  it('builds implicit coordinates from x0/dx', () => {
    const [trace] = defaults([{ y: [5, 6, 7], x0: 10, dx: 2 }]);
    const calc = scatter.calc!(trace!, ctx(axisInfo('linear'), axisInfo('linear'))) as ScatterCalc;
    expect([...calc.x]).toEqual([10, 12, 14]);
  });

  it('truncates the longer coordinate array', () => {
    const [trace] = defaults([{ x: new Float64Array([1, 2, 3]), y: [4, 5] }]);
    const calc = scatter.calc!(trace!, ctx(axisInfo('linear'), axisInfo('linear'))) as ScatterCalc;
    expect([...calc.x]).toEqual([1, 2]);
  });

  it('pads extremes by the marker radius (with the 5% padding for markers)', () => {
    const [trace] = defaults([
      { x: [0, 4], y: [1, 3], mode: 'markers', marker: { size: [10, 20] } },
    ]);
    const calc = scatter.calc!(trace!, ctx(axisInfo('linear'), axisInfo('linear'))) as ScatterCalc;
    const e = scatter.extremes!(calc, trace!, ctx(axisInfo('linear'), axisInfo('linear')));
    // The larger marker at 4 may still decide the minimum, so both are candidates there.
    expect(e.x?.min).toEqual([
      { l: 0, padPx: 5, extrapad: true },
      { l: 4, padPx: 10, extrapad: true },
    ]);
    expect(e.x?.max).toEqual([{ l: 4, padPx: 10, extrapad: true }]);
  });

  it('does not pad lines-only traces', () => {
    const [trace] = defaults([{ y: [1, 2], mode: 'lines' }]);
    const calc = scatter.calc!(trace!, ctx(axisInfo('linear'), axisInfo('linear'))) as ScatterCalc;
    expect(
      scatter.extremes!(calc, trace!, ctx(axisInfo('linear'), axisInfo('linear'))).y?.max,
    ).toEqual([{ l: 2, padPx: 0 }]);
  });
});

describe('scatter style', () => {
  it('converts colors, sizes and opacities to render inputs', () => {
    const [trace] = defaults([
      {
        y: [1, 2],
        mode: 'markers',
        opacity: 0.5,
        marker: { color: ['red', '#00ff00'], size: 8, opacity: [1, 0.5], line: { width: 1 } },
      },
    ]);
    const style = markerStyle(trace!);
    expect([...(style.color as Float32Array)]).toEqual([1, 0, 0, 1, 0, 1, 0, 1]);
    expect(style.size).toBe(8);
    expect([...(style.opacity as Float32Array)]).toEqual([0.5, 0.25]);
    expect(style.lineWidth).toBe(1);
    expect(style.lineColor).toEqual([68 / 255, 68 / 255, 68 / 255, 1]);
  });
});

describe('scatter view', () => {
  function plotContext(trace: FullTrace) {
    const added: Primitive<unknown>[] = [];
    const calc = scatter.calc!(trace, {
      fullLayout: {} as never,
      index: 0,
      xaxis: axisInfo('linear'),
      yaxis: axisInfo('linear'),
    }) as ScatterCalc;
    const ctx: TracePlotContext<ScatterCalc> = {
      trace,
      calc,
      index: 3,
      fullLayout: {} as never,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 2 },
      viewport: {} as Viewport,
      primitives: { resources: createResourceManager(), invalidate: vi.fn() },
      add: (p) => {
        added.push(p as Primitive<unknown>);
        return p;
      },
      remove: (p) => {
        added.splice(added.indexOf(p as Primitive<unknown>), 1);
        p.dispose();
      },
      invalidate: vi.fn(),
    };
    return { ctx, added };
  }

  const PLAN: TraceUpdatePlan = { calc: false, plot: false, style: false, transform: false };

  it('draws one marker set per trace, in trace order', () => {
    const [trace] = defaults([{ x: [1, 2], y: [3, 4], mode: 'markers' }]);
    const { ctx, added } = plotContext(trace!);
    scatter.plot!.create(ctx);
    expect(added).toHaveLength(1);
    const markers = added[0] as MarkerSet;
    expect(markers.count).toBe(2);
    expect(markers.object.renderOrder).toBe(3);
  });

  it('updates only what the plan says', () => {
    const [trace] = defaults([{ x: [1, 2], y: [3, 4], mode: 'markers' }]);
    const { ctx, added } = plotContext(trace!);
    const view = scatter.plot!.create(ctx);
    const markers = added[0] as MarkerSet;
    const update = vi.spyOn(markers, 'update');
    const setTransform = vi.spyOn(markers, 'setTransform');

    view.update(ctx, { ...PLAN, style: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(Object.keys(update.mock.calls[0]![0])).not.toContain('x');
    expect(setTransform).not.toHaveBeenCalled();

    view.update(ctx, { ...PLAN, transform: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(setTransform).toHaveBeenCalledWith(ctx.transform);

    view.update(ctx, { calc: true, plot: true, style: true, transform: true });
    expect(Object.keys(update.mock.calls[1]![0])).toContain('x');
  });

  it('removes the markers when mode drops them', () => {
    const [trace] = defaults([{ y: [3, 4], mode: 'markers' }]);
    const { ctx, added } = plotContext(trace!);
    const view = scatter.plot!.create(ctx);
    const [lines] = defaults([{ y: [3, 4], mode: 'lines' }]);
    view.update(
      { ...ctx, trace: lines! },
      { calc: true, plot: true, style: true, transform: true },
    );
    expect(added).toHaveLength(0);
  });
});
