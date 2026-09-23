import { attr, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  IDENTITY_TRANSFORM,
  LinePrimitive,
  MarkerSet,
  type LineData,
  type MarkerData,
  type PrimitiveContext,
} from '@mk7s/holochart-render';
import { createChartRegistry, type TraceModule } from '@mk7s/holochart-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calcErrorBars,
  errorBarAttributes,
  errorBarExtremeValues,
  ErrorBarLayer,
  errorBarStyle,
  makeComputeError,
  supplyErrorBarDefaults,
  type ErrorBarCalc,
  type ErrorBarStyle,
} from './index.ts';

// A minimal trace type carrying only error bars, defaulted the way scatter will do it.
const errorTrace: TraceModule = {
  type: 'errortest',
  categories: [],
  schema: attr.object({ error_x: errorBarAttributes('x'), error_y: errorBarAttributes('y') }),
  supplyDefaults(traceIn, traceOut, ctx) {
    supplyErrorBarDefaults(traceIn, traceOut, ctx, 'y', { defaultColor: ctx.defaultColor });
    supplyErrorBarDefaults(traceIn, traceOut, ctx, 'x', {
      defaultColor: ctx.defaultColor,
      inherit: 'y',
    });
  },
  meta: { description: 'Error-bar test trace.' },
};

const registry = createChartRegistry().register(errorTrace);

function defaults(...traces: Record<string, unknown>[]): FullTrace[] {
  return supplyDefaults(
    { data: traces.map((t) => ({ type: 'errortest', ...t })), layout: {} },
    registry.core,
  ).fullData;
}

function one(trace: Record<string, unknown>): FullTrace {
  return defaults(trace)[0]!;
}

const BLUE = 'rgb(31, 119, 180)';

describe('error bar defaults', () => {
  it('stays hidden without array, value or sqrt', () => {
    const t = one({ error_y: { thickness: 3 } });
    expect(t['error_y']).toEqual({ visible: false });
    expect(one({})['error_x']).toEqual({ visible: false });
  });

  it('infers type data from array, symmetric unless arrayminus is given', () => {
    const t = one({ error_y: { array: [1, 2] } });
    expect(t['error_y']).toEqual({
      visible: true,
      type: 'data',
      symmetric: true,
      array: [1, 2],
      traceref: 0,
      color: BLUE,
      thickness: 2,
      width: 4,
    });
    const a = one({ error_y: { array: [1], arrayminus: [2] } })['error_y'];
    expect(a).toMatchObject({ symmetric: false, arrayminus: [2], tracerefminus: 0 });
  });

  it('infers type percent from value, with valueminus for asymmetric bars', () => {
    expect(one({ error_y: { value: 5 } })['error_y']).toEqual({
      visible: true,
      type: 'percent',
      symmetric: true,
      value: 5,
      color: BLUE,
      thickness: 2,
      width: 4,
    });
    const a = one({ error_y: { type: 'constant', value: 1, valueminus: 3 } })['error_y'];
    expect(a).toMatchObject({ type: 'constant', symmetric: false, value: 1, valueminus: 3 });
    // An explicit `symmetric: true` wins over the inference.
    const s = one({ error_y: { value: 1, valueminus: 3, symmetric: true } })['error_y'];
    expect(s).toMatchObject({ symmetric: true });
    expect(s).not.toHaveProperty('valueminus');
  });

  it('turns on sqrt bars without a value and skips symmetric', () => {
    const e = one({ error_y: { type: 'sqrt' } })['error_y'] as Record<string, unknown>;
    expect(e).toMatchObject({ visible: true, type: 'sqrt' });
    expect(e).not.toHaveProperty('symmetric');
    expect(e).not.toHaveProperty('value');
  });

  it('defaults visible bars with no data to 10 percent', () => {
    expect(one({ error_y: { visible: true } })['error_y']).toMatchObject({
      type: 'percent',
      value: 10,
    });
  });

  it('copies the y style onto x bars unless x is styled', () => {
    const t = one({ error_y: { value: 1, color: 'red' }, error_x: { value: 2 } });
    expect(t['error_x']).toEqual({
      visible: true,
      type: 'percent',
      symmetric: true,
      value: 2,
      copy_ystyle: true,
    });
    expect(errorBarStyle(t, 'x').color).toEqual([1, 0, 0, 1]);

    const styled = one({ error_y: { value: 1 }, error_x: { value: 2, width: 0 } });
    expect(styled['error_x']).toMatchObject({ copy_ystyle: false, width: 0, thickness: 2 });

    // Without visible y bars there is nothing to copy.
    const alone = one({ error_x: { value: 2 } })['error_x'];
    expect(alone).not.toHaveProperty('copy_ystyle');
    expect(alone).toMatchObject({ color: BLUE, width: 4 });
  });

  it('uses the colorway color per trace', () => {
    const [, b] = defaults({ error_y: { value: 1 } }, { error_y: { value: 1 } });
    expect(b?.['error_y']).toMatchObject({ color: 'rgb(255, 127, 14)' });
  });
});

describe('makeComputeError', () => {
  it('computes percent, constant and sqrt errors', () => {
    expect(makeComputeError({ type: 'percent', value: 10, symmetric: true })(-50, 0)).toEqual([
      5, 5,
    ]);
    expect(makeComputeError({ type: 'constant', value: 3, symmetric: true })(100, 0)).toEqual([
      3, 3,
    ]);
    expect(makeComputeError({ type: 'sqrt', symmetric: true })(-16, 0)).toEqual([4, 4]);
  });

  it('uses valueminus for the minus side of asymmetric bars', () => {
    const f = makeComputeError({ type: 'percent', value: 10, valueminus: 20, symmetric: false });
    expect(f(100, 0)).toEqual([20, 10]);
    // Without valueminus the bars stay symmetric.
    const g = makeComputeError({ type: 'constant', value: 2, symmetric: false });
    expect(g(0, 0)).toEqual([2, 2]);
  });

  it('reads data arrays, symmetric and asymmetric', () => {
    const sym = makeComputeError({ type: 'data', symmetric: true, array: [1, '2', null] });
    expect(sym(0, 0)).toEqual([1, 1]);
    expect(sym(0, 1)).toEqual([2, 2]);
    expect(sym(0, 5)).toEqual([NaN, NaN]);

    const asym = makeComputeError({
      type: 'data',
      symmetric: false,
      array: [1, NaN, 3, NaN],
      arrayminus: [2, 4],
    });
    expect(asym(0, 0)).toEqual([2, 1]);
    // One missing side is filled with 0 so the other still shows.
    expect(asym(0, 1)).toEqual([4, 0]);
    expect(asym(0, 2)).toEqual([0, 3]);
    expect(asym(0, 3)).toEqual([NaN, NaN]);
  });
});

describe('calcErrorBars', () => {
  it('returns undefined for missing or hidden bars', () => {
    const t = one({});
    expect(calcErrorBars(t, 'y', [1], 'linear')).toBeUndefined();
    expect(calcErrorBars({ ...t, error_y: undefined }, 'y', [1], 'linear')).toBeUndefined();
  });

  it('computes shoe and hat on linear axes, skipping non-finite points', () => {
    const t = one({ error_y: { array: [1, 1, 1, 1], arrayminus: [2, 2, NaN, NaN] } });
    const calc = calcErrorBars(t, 'y', [10, NaN, 20, 30], 'linear')!;
    expect([...calc.minus]).toEqual([8, NaN, 20, 30]);
    expect([...calc.plus]).toEqual([11, NaN, 21, 31]);
    expect(calc.count).toBe(3);
    expect(calc.letter).toBe('y');
    expect([...calc.clipped]).toEqual([0, 0, 0, 0]);
  });

  it('marks points without a usable error', () => {
    const t = one({ error_x: { array: [1, 'x'] } });
    const calc = calcErrorBars(t, 'x', [0, 0, 0], undefined)!;
    expect([...calc.plus]).toEqual([1, NaN, NaN]);
    expect(calc.count).toBe(1);
  });

  it('computes in data space on log axes and clips ends at or below zero', () => {
    const t = one({ error_y: { type: 'percent', value: 50, valueminus: 100 } });
    // Points at 10 and 100 (log10 = 1, 2).
    const calc = calcErrorBars(t, 'y', [1, 2, NaN], 'log')!;
    expect(calc.plus[0]).toBeCloseTo(Math.log10(15));
    expect(calc.plus[1]).toBeCloseTo(Math.log10(150));
    // 100 % below → 0: clipped, placed 20 decades below the upper end.
    expect(calc.minus[0]).toBeCloseTo(Math.log10(15) - 20);
    expect([...calc.clipped]).toEqual([1, 1, 0]);
    expect(calc.count).toBe(2);

    const partial = one({ error_y: { type: 'constant', value: 5 } });
    const p = calcErrorBars(partial, 'y', [1], 'log')!;
    expect(p.minus[0]).toBeCloseTo(Math.log10(5));
    expect(p.plus[0]).toBeCloseTo(Math.log10(15));
    expect(p.clipped[0]).toBe(0);
  });

  it('drops log bars whose upper end is not positive', () => {
    const t = one({ error_y: { array: [-20] } });
    const calc = calcErrorBars(t, 'y', [1], 'log')!;
    expect(calc.count).toBe(0);
    expect(calc.plus[0]).toBeNaN();
  });

  it('works in ms on date axes', () => {
    const t = one({ error_x: { type: 'constant', value: 1000 } });
    const ms = Date.UTC(2024, 0, 1);
    const calc = calcErrorBars(t, 'x', [ms], 'date')!;
    expect([...calc.minus]).toEqual([ms - 1000]);
    expect([...calc.plus]).toEqual([ms + 1000]);
  });

  it('gives sqrt bars on category indices', () => {
    const t = one({ error_y: { type: 'sqrt' } });
    const calc = calcErrorBars(t, 'y', [0, 4], 'category')!;
    expect([...calc.minus]).toEqual([0, 2]);
    expect([...calc.plus]).toEqual([0, 6]);
  });
});

describe('errorBarExtremeValues', () => {
  it('returns both ends, and one decade below the top for clipped ends', () => {
    const calc: ErrorBarCalc = {
      letter: 'y',
      minus: Float64Array.from([1, NaN, -18]),
      plus: Float64Array.from([3, NaN, 2]),
      clipped: Uint8Array.from([0, 0, 1]),
      count: 2,
    };
    expect([...errorBarExtremeValues(calc)]).toEqual([1, 3, 1, 2]);
  });
});

describe('errorBarStyle', () => {
  it('parses the color and folds in the trace opacity', () => {
    const t = { ...one({ error_y: { value: 1, color: '#ff0000', thickness: 1, width: 0 } }) };
    t['opacity'] = 0.5;
    expect(errorBarStyle(t, 'y')).toEqual({
      color: [1, 0, 0, 1],
      thickness: 1,
      width: 0,
      opacity: 0.5,
    });
  });
});

describe('ErrorBarLayer', () => {
  const context = (): PrimitiveContext => ({
    resources: createResourceManager(),
    invalidate: () => {},
  });
  const STYLE: ErrorBarStyle = { color: [1, 0, 0, 1], thickness: 2, width: 7, opacity: 0.5 };
  const bars = (over: Partial<ErrorBarCalc> = {}): ErrorBarCalc => ({
    letter: 'y',
    minus: Float64Array.from([0, NaN, 1]),
    plus: Float64Array.from([2, NaN, 5]),
    clipped: new Uint8Array(3),
    count: 2,
    ...over,
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function build(data: Partial<Parameters<ErrorBarLayer['update']>[0]> = {}) {
    const lineUpdate = vi.spyOn(LinePrimitive.prototype, 'update');
    const markerUpdate = vi.spyOn(MarkerSet.prototype, 'update');
    const layer = new ErrorBarLayer(
      context(),
      { x: [10, 20, 30], y: [1, 2, 3], bars: bars(), style: STYLE, ...data },
      { renderOrder: 4 },
    );
    const line = lineUpdate.mock.calls.at(-1)![0] as Partial<LineData>;
    const markers = markerUpdate.mock.calls.at(-1)![0] as Partial<MarkerData>;
    return { layer, line, markers, lineUpdate, markerUpdate };
  }

  it('draws y bars as gapped 2-point stems and line-ew caps', () => {
    const { layer, line, markers } = build();
    expect([...(line.x as Float64Array)]).toEqual([10, 10, NaN, 30, 30, NaN]);
    expect([...(line.y as Float64Array)]).toEqual([0, 2, NaN, 1, 5, NaN]);
    expect(line).toMatchObject({ width: 2, cap: 'butt', opacity: 0.5, color: [1, 0, 0, 1] });
    expect(layer.stems.instanceCount).toBeGreaterThan(0);

    expect([...(markers.x as Float64Array)]).toEqual([10, 10, 30, 30]);
    expect([...(markers.y as Float64Array)]).toEqual([0, 2, 1, 5]);
    expect(markers).toMatchObject({
      symbol: 'line-ew',
      size: (2 * 7) / 1.4,
      lineWidth: 2,
      lineColor: [1, 0, 0, 1],
      opacity: 0.5,
    });
    expect(layer.caps.count).toBe(4);
    expect(layer.primitives).toEqual([layer.stems, layer.caps]);
    expect(layer.stems.object.renderOrder).toBe(4);
    expect(layer.caps.object.renderOrder).toBe(4);
    layer.renderOrder = 9;
    expect(layer.stems.object.renderOrder).toBe(9);
    expect(layer.caps.object.renderOrder).toBe(9);
  });

  it('draws x bars horizontally with line-ns caps, hiding bars of unplaceable points', () => {
    const { layer, line, markers } = build({
      y: [1, 2, NaN],
      bars: bars({ letter: 'x' }),
    });
    expect([...(line.x as Float64Array)]).toEqual([0, 2, NaN, NaN, NaN, NaN]);
    expect([...(line.y as Float64Array)]).toEqual([1, 1, NaN, NaN, NaN, NaN]);
    expect(markers.symbol).toBe('line-ns');
    expect([...(markers.x as Float64Array)]).toEqual([0, 2, NaN, NaN]);
    expect(layer.caps.count).toBe(4);
  });

  it('gives clipped lower ends a zero-size cap, and width 0 hides every cap', () => {
    const clipped = bars({ clipped: Uint8Array.from([1, 0, 0]) });
    const { layer, markers, markerUpdate } = build({ bars: clipped });
    const s = (2 * 7) / 1.4;
    expect([...(markers.size as Float32Array)]).toEqual([0, s, s, s].map(Math.fround));

    layer.update({ style: { ...STYLE, width: 0 } });
    const next = markerUpdate.mock.calls.at(-1)![0];
    expect([...(next.size as Float32Array)]).toEqual([0, 0, 0, 0]);
  });

  it('updates style without touching geometry', () => {
    const { layer, lineUpdate, markerUpdate } = build();
    const lineCalls = lineUpdate.mock.calls.length;
    const markerCalls = markerUpdate.mock.calls.length;
    layer.update({ style: { ...STYLE, color: [0, 0, 1, 1], thickness: 3 } });
    expect(lineUpdate).toHaveBeenCalledTimes(lineCalls + 1);
    expect(markerUpdate).toHaveBeenCalledTimes(markerCalls + 1);
    const line = lineUpdate.mock.calls.at(-1)![0];
    const markers = markerUpdate.mock.calls.at(-1)![0];
    expect(Object.keys(line)).not.toContain('x');
    expect(Object.keys(markers)).not.toContain('x');
    expect(Object.keys(markers)).not.toContain('symbol');
    expect(line).toMatchObject({ width: 3, color: [0, 0, 1, 1] });
    expect(markers).toMatchObject({ lineWidth: 3, lineColor: [0, 0, 1, 1] });

    // No-op patches do nothing.
    layer.update({});
    expect(lineUpdate).toHaveBeenCalledTimes(lineCalls + 1);
  });

  it('rebuilds geometry when the bars change', () => {
    const { layer, lineUpdate, markerUpdate } = build();
    layer.update({
      bars: bars({ minus: Float64Array.from([0]), plus: Float64Array.from([1]), count: 1 }),
    });
    const line = lineUpdate.mock.calls.at(-1)![0];
    expect([...(line.y as Float64Array)]).toEqual([0, 1, NaN]);
    expect(markerUpdate.mock.calls.at(-1)![0]).toHaveProperty('x');
    expect(layer.caps.count).toBe(2);
  });

  it('forwards transforms to both primitives', () => {
    const { layer } = build();
    const a = vi.spyOn(layer.stems, 'setTransform');
    const b = vi.spyOn(layer.caps, 'setTransform');
    const t = { ...IDENTITY_TRANSFORM, scaleX: 2 };
    layer.setTransform(t);
    expect(a).toHaveBeenCalledWith(t);
    expect(b).toHaveBeenCalledWith(t);
    layer.dispose();
  });
});
