import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  IDENTITY_TRANSFORM,
  LinePrimitive,
  MarkerSet,
  TextPrimitive,
  type DataTransform,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type TracePlotContext,
  type TraceUpdatePlan,
} from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { scatter, type ScatterCalc } from './index.ts';
import { textLabels, traceRenderOrder } from './plot.ts';
import { markerStyle } from './style.ts';

// troika typesets in a worker with browser globals; the view tests only need its object graph.
// Mocked by path: traces-basic does not depend on troika, render does.
vi.mock('../../../render/node_modules/troika-three-text', async () => {
  const { Object3D } = await import('three');
  type Node = InstanceType<typeof Object3D>;
  // `Object3D.dispose()` exists only in newer @types/three, so a declared method would need
  // `override` there and must not have it on the minimum supported version (CI's `three (min)`).
  // Attaching it at construction typechecks against both.
  const noopDispose = (o: object): void => {
    Object.assign(o, { dispose: (): void => {} });
  };
  class Text extends Object3D {
    constructor() {
      super();
      noopDispose(this);
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    addText(text: Node): void {
      this.add(text);
    }
    removeText(text: Node): void {
      this.remove(text);
    }
    constructor() {
      super();
      noopDispose(this);
    }
    sync(callback?: () => void): void {
      callback?.();
    }
  }
  return { Text, BatchedText, configureTextBuilder: () => {}, preloadFont: () => {} };
});

const registry = createChartRegistry().register(scatter);

function full(data: unknown[], layout: unknown = {}) {
  return supplyDefaults({ data, layout }, registry.core);
}

function defaults(data: unknown[], layout: unknown = {}): FullTrace[] {
  return full(data, layout).fullData;
}

function axisInfo(type: 'linear' | 'log' | 'date' | 'category', categories?: string[]): AxisInfo {
  const scale = createScale({ type, ...(categories ? { categories } : {}) });
  return { scale, type, full: {} } as unknown as AxisInfo;
}

const linear = (): CalcContext => ({
  fullLayout: {} as never,
  index: 0,
  xaxis: axisInfo('linear'),
  yaxis: axisInfo('linear'),
});

function calcOf(trace: FullTrace, ctx: CalcContext = linear()): ScatterCalc {
  return scatter.calc!(trace, ctx) as ScatterCalc;
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
      opacity: 1,
      angle: 0,
      line: { color: 'rgb(68, 68, 68)', width: 0 },
    });
    expect(a?.['line']).toEqual({
      color: 'rgb(31, 119, 180)',
      width: 2,
      dash: 'solid',
      shape: 'linear',
      simplify: true,
    });
    expect(b?.['mode']).toBe('lines');
    // Markers are off, so marker attributes are not defaulted.
    expect(b?.['marker']).toBeUndefined();
    expect(b?.['line']).toMatchObject({ color: 'rgb(255, 127, 14)' });
    expect(b?.['x0']).toBe(0);
    expect(b?.['_length']).toBe(25);
    expect(a?.['zorder']).toBe(0);
    expect(a?.['error_y']).toEqual({ visible: false });
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

  it('shares colors between lines and markers like Plotly', () => {
    const [a, b] = defaults([
      { y: [1, 2], marker: { color: 'red' } },
      { y: [1, 2], line: { color: 'green' } },
    ]);
    expect((a?.['line'] as { color: unknown }).color).toBe('rgb(255, 0, 0)');
    expect((b?.['marker'] as { color: unknown }).color).toBe('rgb(0, 128, 0)');
  });

  it('defaults bubbles (per-point sizes)', () => {
    const [t] = defaults([{ y: [1, 2], mode: 'markers', marker: { size: [10, 40] } }]);
    expect(t?.['marker']).toMatchObject({
      opacity: 0.7,
      sizeref: 1,
      sizemin: 0,
      sizemode: 'diameter',
      line: { color: 'rgb(255, 255, 255)', width: 1 },
    });
  });

  it('coerces colorscale attributes only for numeric colors', () => {
    const [plain, numeric, fixed, named] = defaults([
      { y: [1, 2], mode: 'markers', marker: { color: ['red', 'blue'] } },
      { y: [1, 2], mode: 'markers', marker: { color: [1, 2] } },
      { y: [1, 2], mode: 'markers', marker: { color: [1, 2], cmin: 0, cmax: 5 } },
      { y: [1, 2], mode: 'markers', marker: { color: [1, 2], colorscale: 'Viridis' } },
    ]);
    expect(plain?.['marker']).not.toHaveProperty('cauto');
    expect(numeric?.['marker']).toMatchObject({
      cauto: true,
      autocolorscale: true,
      reversescale: false,
      showscale: false,
    });
    expect(fixed?.['marker']).toMatchObject({ cauto: false, cmin: 0, cmax: 5 });
    expect(named?.['marker']).toMatchObject({ autocolorscale: false, colorscale: 'Viridis' });
  });

  it('defaults text from layout.font and the text mode attributes', () => {
    const [t] = defaults([{ y: [1, 2], mode: 'text', text: ['a', 'b'] }], {
      font: { size: 14, color: '#333' },
    });
    expect(t?.['textposition']).toBe('middle center');
    expect(t?.['texttemplate']).toBe('');
    expect(t?.['textfont']).toMatchObject({ size: 14, color: 'rgb(51, 51, 51)' });
  });

  it('defaults error bars with the line color', () => {
    const [t] = defaults([
      {
        y: [1, 2],
        mode: 'lines',
        line: { color: 'purple' },
        error_y: { array: [0.1, 0.2] },
        error_x: { value: 5 },
      },
    ]);
    expect(t?.['error_y']).toMatchObject({
      visible: true,
      type: 'data',
      color: 'rgb(128, 0, 128)',
      width: 4,
    });
    expect(t?.['error_x']).toMatchObject({ visible: true, type: 'percent', copy_ystyle: true });
  });

  it('collects the cross-trace domain of color axes', () => {
    const { fullLayout } = full(
      [
        { y: [1, 2], mode: 'markers', marker: { color: [1, 5], coloraxis: 'coloraxis' } },
        { y: [1, 2], mode: 'markers', marker: { color: [-2, 3], coloraxis: 'coloraxis' } },
      ],
      { coloraxis: { colorscale: 'Viridis' } },
    );
    expect(fullLayout['coloraxis']).toMatchObject({
      colorscale: 'Viridis',
      autocolorscale: false,
      cauto: true,
      _min: -2,
      _max: 5,
    });
  });
});

describe('scatter calc', () => {
  it('linearizes coordinates through the axes', () => {
    const [trace] = defaults([{ x: ['b', 'a', 'b'], y: [1, 10, 100], mode: 'markers' }]);
    const calc = calcOf(trace!, {
      ...linear(),
      xaxis: axisInfo('category', ['b', 'a']),
      yaxis: axisInfo('log'),
    });
    expect([...calc.x]).toEqual([0, 1, 0]);
    expect([...calc.y]).toEqual([0, 1, 2]);
    expect(calc.length).toBe(3);
  });

  it('builds implicit coordinates from x0/dx', () => {
    const [trace] = defaults([{ y: [5, 6, 7], x0: 10, dx: 2 }]);
    expect([...calcOf(trace!).x]).toEqual([10, 12, 14]);
  });

  it('truncates the longer coordinate array', () => {
    const [trace] = defaults([{ x: new Float64Array([1, 2, 3]), y: [4, 5] }]);
    expect([...calcOf(trace!).x]).toEqual([1, 2]);
  });

  it('keeps gaps as NaN', () => {
    const [trace] = defaults([{ x: [1, 2, 3], y: [1, null, 3] }]);
    expect([...calcOf(trace!).y]).toEqual([1, NaN, 3]);
  });

  it('aligns periods', () => {
    const [trace] = defaults([{ x: [0, 10, 20], y: [1, 2, 3], xperiod: 10 }]);
    expect(trace?.['xperiodalignment']).toBe('middle');
    expect([...calcOf(trace!).x]).toEqual([5, 15, 25]);
  });

  it('scales bubble sizes by sizeref / sizemode / sizemin', () => {
    const [diameter, area, min] = defaults([
      { y: [1, 2], mode: 'markers', marker: { size: [10, 40], sizeref: 2 } },
      { y: [1, 2], mode: 'markers', marker: { size: [8, 32], sizemode: 'area' } },
      { y: [1, 2, 3], mode: 'markers', marker: { size: [2, 40, -1], sizemin: 4 } },
    ]);
    expect([...(calcOf(diameter!).markerSize as Float32Array)]).toEqual([5, 20]);
    expect([...(calcOf(area!).markerSize as Float32Array)]).toEqual([4, 8]);
    // Radius 1 → sizemin 4 → diameter 8; negative sizes hide the point.
    expect([...(calcOf(min!).markerSize as Float32Array)]).toEqual([8, 40, 0]);
  });

  it('pads extremes like Plotly (marker padding + 5%)', () => {
    const [trace] = defaults([
      { x: [0, 4], y: [1, 3], mode: 'markers', marker: { size: [10, 20] } },
    ]);
    const e = scatter.extremes!(calcOf(trace!), trace!, linear());
    // max(size / 1.6, 3); the larger marker at 4 may still decide the minimum.
    expect(e.x?.min).toEqual([
      { l: 0, padPx: 6.25, extrapad: true },
      { l: 4, padPx: 12.5, extrapad: true },
    ]);
    expect(e.x?.max).toEqual([{ l: 4, padPx: 12.5, extrapad: true }]);
  });

  it('keeps line charts tight in x but padded in y', () => {
    const [trace] = defaults([{ y: [1, 2], mode: 'lines' }]);
    const e = scatter.extremes!(calcOf(trace!), trace!, linear());
    expect(e.x?.max).toEqual([{ l: 1, padPx: 0, extrapad: false }]);
    expect(e.y?.max).toEqual([{ l: 2, padPx: 0, extrapad: true }]);
  });

  it('includes error bar ends in the extremes', () => {
    const [trace] = defaults([
      { x: [1, 2], y: [10, 20], mode: 'lines', error_y: { type: 'constant', value: 3 } },
    ]);
    const calc = calcOf(trace!);
    expect([...calc.errorY!.plus]).toEqual([13, 23]);
    expect([...calc.errorY!.minus]).toEqual([7, 17]);
    const e = scatter.extremes!(calc, trace!, linear());
    expect(Math.max(...e.y!.max.map((p) => p.l))).toBe(23);
    expect(Math.min(...e.y!.min.map((p) => p.l))).toBe(7);
    // y error bars make x padded too (Plotly).
    expect(e.x?.max[0]?.extrapad).toBe(true);
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
    expect(style.colorValues).toBeNull();
    expect([...(style.opacity as Float32Array)]).toEqual([0.5, 0.25]);
    expect(style.lineWidth).toBe(1);
    expect(style.lineColor).toEqual([68 / 255, 68 / 255, 68 / 255, 1]);
  });

  it('maps numeric colors through the GPU colorscale path', () => {
    const [trace] = defaults([
      {
        y: [1, 2, 3],
        mode: 'markers',
        marker: { color: [0, 5, 10], colorscale: 'Greys', reversescale: true },
      },
    ]);
    const style = markerStyle(trace!, { calc: calcOf(trace!) });
    expect([...(style.colorValues as Float64Array)]).toEqual([0, 5, 10]);
    expect(style.cmin).toBe(0);
    expect(style.cmax).toBe(10);
    expect(style.reversescale).toBe(true);
    expect(style.colorscale?.[0]?.[1]).toEqual([0, 0, 0, 1]);
  });

  it('dims unselected points and applies selected styles', () => {
    const [trace] = defaults([
      {
        y: [1, 2, 3],
        mode: 'markers',
        marker: { color: 'blue', opacity: 0.5 },
        selected: { marker: { color: 'red', size: 12 } },
      },
    ]);
    const style = markerStyle(trace!, { calc: calcOf(trace!), selectedPoints: [1] });
    const opacity = [...(style.opacity as Float32Array)];
    [0.1, 0.5, 0.1].forEach((v, i) => expect(opacity[i]).toBeCloseTo(v, 6));
    const color = style.color as Float32Array;
    expect([...color.subarray(4, 8)]).toEqual([1, 0, 0, 1]);
    expect([...color.subarray(0, 4)]).toEqual([0, 0, 1, 1]);
    expect([...(style.size as Float32Array)]).toEqual([6, 12, 6]);
  });
});

describe('scatter text', () => {
  const axes = { x: undefined, y: undefined };

  it('places labels around markers (Plotly textPointPosition)', () => {
    const [trace] = defaults([
      {
        x: [1, 2],
        y: [3, 4],
        mode: 'markers+text',
        text: ['a', ''],
        textposition: 'top right',
        marker: { size: 8 },
        textfont: { size: 10 },
      },
    ]);
    const labels = textLabels(trace!, calcOf(trace!), axes);
    // Empty text makes no label; r = 4 / 0.8 + 1 = 6.
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({
      text: 'a',
      x: 1,
      y: 3,
      anchorX: 'left',
      anchorY: 'baseline',
    });
    expect(labels[0]!.offset).toEqual([6, 10 * 0.75 - 6 - 10]);
  });

  it('formats texttemplate with per-point values and axis labels', () => {
    const [trace] = defaults([
      {
        x: [1, 2],
        y: [0.5, 1.25],
        mode: 'markers+text',
        texttemplate: '%{y:.1f} (%{customdata[1]})<br>%{marker.size}',
        customdata: [
          ['a', 'b'],
          ['c', 'd'],
        ],
        marker: { size: [3, 4] },
      },
    ]);
    const labels = textLabels(trace!, calcOf(trace!), axes);
    expect(labels.map((l) => l.text)).toEqual(['0.5 (b)\n3', '1.3 (d)\n4']);
  });
});

describe('scatter view', () => {
  function plotContext(trace: FullTrace, transform: DataTransform = IDENTITY_TRANSFORM) {
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<ScatterCalc> = {
      trace,
      calc: calcOf(trace),
      index: 3,
      fullLayout: {} as never,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform: { ...transform, scaleX: 2 },
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
  const ALL: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: true };

  it('draws one marker set per trace, in trace order', () => {
    const [trace] = defaults([{ x: [1, 2], y: [3, 4], mode: 'markers' }]);
    const { ctx, added } = plotContext(trace!);
    scatter.plot!.create(ctx);
    expect(added).toHaveLength(1);
    const markers = added[0] as MarkerSet;
    expect(markers.count).toBe(2);
    expect(Math.floor(markers.object.renderOrder)).toBe(3);
  });

  it('draws error bars, line, markers and text as one primitive each, layered in that order', () => {
    const [trace] = defaults([
      {
        x: [1, 2, 3],
        y: [3, 4, 2],
        mode: 'lines+markers+text',
        text: 'p',
        error_y: { value: 10 },
        zorder: 2,
      },
    ]);
    const { ctx, added } = plotContext(trace!);
    scatter.plot!.create(ctx);
    // Error bars: stems (line) + caps (markers).
    expect(added.map((p) => p.constructor)).toEqual([
      LinePrimitive,
      MarkerSet,
      LinePrimitive,
      MarkerSet,
      TextPrimitive,
    ]);
    const orders = added.map((p) => p.object.renderOrder);
    expect(orders[0]).toBe(orders[1]);
    expect(orders[1]).toBeLessThan(orders[2]!);
    expect(orders[2]).toBeLessThan(orders[3]!);
    expect(orders[3]).toBeLessThan(orders[4]!);
    expect(Math.floor(orders[3]!)).toBe(traceRenderOrder(trace!, 3));
    expect(traceRenderOrder(trace!, 3)).toBe(20003);
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

    view.update(ctx, { ...PLAN, selection: true });
    expect(update).toHaveBeenCalledTimes(2);

    view.update(ctx, ALL);
    expect(Object.keys(update.mock.calls[2]![0])).toContain('x');
  });

  it('rebuilds spline geometry only when the zoom changes the scales enough', () => {
    const [trace] = defaults([{ x: [0, 1, 2, 3], y: [0, 1, 0, 1], line: { shape: 'spline' } }]);
    const { ctx, added } = plotContext(trace!);
    const view = scatter.plot!.create(ctx);
    const line = added[0] as LinePrimitive;
    const update = vi.spyOn(line, 'update');
    // Pan: same scales.
    view.update(
      { ...ctx, transform: { ...ctx.transform, offsetX: 50 } },
      { ...PLAN, transform: true },
    );
    expect(update).not.toHaveBeenCalled();
    // Anisotropic zoom changes the spline's px-space shape.
    view.update(
      { ...ctx, transform: { ...ctx.transform, scaleY: 3 } },
      { ...PLAN, transform: true },
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(Object.keys(update.mock.calls[0]![0])).toEqual(['x', 'y']);
  });

  it('keeps linear lines transform-only', () => {
    const [trace] = defaults([{ x: [0, 1, 2], y: [0, 1, 0], mode: 'lines' }]);
    const { ctx, added } = plotContext(trace!);
    const view = scatter.plot!.create(ctx);
    const update = vi.spyOn(added[0] as LinePrimitive, 'update');
    view.update(
      { ...ctx, transform: { ...ctx.transform, scaleY: 30 } },
      { ...PLAN, transform: true },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('adds and removes primitives when the mode changes', () => {
    const [trace] = defaults([{ y: [3, 4], mode: 'markers' }]);
    const { ctx, added } = plotContext(trace!);
    const view = scatter.plot!.create(ctx);
    const [lines] = defaults([{ y: [3, 4], mode: 'lines' }]);
    view.update({ ...ctx, trace: lines!, calc: calcOf(lines!) }, ALL);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(LinePrimitive);
    const [none] = defaults([{ y: [3, 4], mode: 'none' }]);
    view.update({ ...ctx, trace: none!, calc: calcOf(none!) }, ALL);
    expect(added).toHaveLength(0);
  });
});
