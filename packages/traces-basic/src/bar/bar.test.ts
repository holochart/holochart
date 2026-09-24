import {
  collectCategoryValues,
  createScale,
  sortCategoriesByValue,
  supplyDefaults,
  type CategorySamples,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import {
  createResourceManager,
  IDENTITY_TRANSFORM,
  type Primitive,
  type RectPrimitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type CrossTraceContext,
  type TracePlotContext,
  type TraceUpdatePlan,
} from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { traceRenderOrder } from '../shared/render-order.ts';
import { bar, type BarCalc } from './index.ts';
import { barGeometry } from './plot.ts';
import { barStyle, contrastColor, cornerRadiusPx } from './style.ts';

const registry = createChartRegistry().register(bar);

/** Supply defaults; traces are bars unless they say otherwise. */
function defaults(data: unknown[], layout: unknown = {}) {
  const bars = data.map((t) => ({ type: 'bar', ...(t as object) }));
  return supplyDefaults({ data: bars, layout: layout as Record<string, unknown> }, registry.core);
}

function axisInfo(
  id: string,
  type: 'linear' | 'log' | 'date' | 'category',
  categories?: string[],
  range: [number, number] = [0, 1],
): AxisInfo {
  const scale = createScale({ type, range, ...(categories ? { categories } : {}) });
  return { id, scale, type, letter: id.charAt(0), full: { type } } as unknown as AxisInfo;
}

function calcAll(
  data: unknown[],
  layout: unknown,
  x: AxisInfo,
  y: AxisInfo,
): { traces: FullTrace[]; calcs: BarCalc[]; fullLayout: FullLayout } {
  const { fullData, fullLayout } = defaults(data, layout);
  const calcs = fullData.map((trace, index) => {
    const ctx: CalcContext = { fullLayout, index, xaxis: x, yaxis: y };
    return bar.calc!(trace, ctx);
  });
  const entries = fullData.map((trace, index) => ({ trace, index, calc: calcs[index]! }));
  bar.crossTraceCalc!(entries, {
    fullLayout,
    xaxis: x,
    yaxis: y,
    subplot: {} as never,
  } satisfies CrossTraceContext);
  return { traces: fullData, calcs, fullLayout };
}

describe('bar defaults', () => {
  it('defaults orientation from the data and coerces bar layout attributes', () => {
    const { fullData, fullLayout } = defaults([{ x: ['a', 'b'], y: [1, 2] }, { x: [1, 2] }]);
    expect(fullData[0]?.['orientation']).toBe('v');
    expect(fullData[1]?.['orientation']).toBe('h');
    expect(fullData[1]?.['y0']).toBe(0);
    expect(fullData[0]?.['_length']).toBe(2);
    expect(fullLayout['barmode']).toBe('group');
    expect(fullLayout['bargap']).toBe(0.2);
    expect(fullLayout['bargroupgap']).toBe(0);
    expect(fullLayout['barnorm']).toBe('');
  });

  it('hides traces without a length coordinate', () => {
    const { fullData } = defaults([{ x: [1, 2], orientation: 'v' }, {}]);
    expect(fullData[0]?.visible).toBe(false);
    expect(fullData[1]?.visible).toBe(false);
  });

  it('inherits text fonts from layout.font; inside text color stays unset for contrast', () => {
    const { fullData } = defaults([{ y: [1], text: ['a'] }], { font: { size: 14 } });
    const t = fullData[0]!;
    expect(t['textposition']).toBe('auto');
    expect(t['textfont']).toMatchObject({ size: 14, color: 'rgb(68, 68, 68)' });
    expect((t['insidetextfont'] as { color?: unknown }).color).toBeUndefined();
    expect(t['outsidetextfont']).toMatchObject({ size: 14, color: 'rgb(68, 68, 68)' });
    expect(t['insidetextanchor']).toBe('end');
    expect(t['textangle']).toBe('auto');
    expect(t['constraintext']).toBe('both');

    const [red] = defaults([{ y: [1], textfont: { color: 'red' } }]).fullData;
    expect((red!['insidetextfont'] as { color?: unknown }).color).toBe('rgb(255, 0, 0)');
  });

  it('skips text styling with textposition none and colorscale attributes for CSS colors', () => {
    const [t] = defaults([{ y: [1], textposition: 'none' }]).fullData;
    expect(t!['textfont']).toBeUndefined();
    expect((t!['marker'] as Record<string, unknown>)['cauto']).toBeUndefined();
    const [n] = defaults([{ y: [1, 2], marker: { color: [1, 2], cmin: 0, cmax: 5 } }]).fullData;
    expect(n!['marker']).toMatchObject({ autocolorscale: true, cauto: false, reversescale: false });
  });

  it('records offset groups per position axis, orientation and alignment group', () => {
    const { fullLayout } = defaults([
      { x: ['a'], y: [1], offsetgroup: 'B' },
      { x: ['a'], y: [1], offsetgroup: 'A', yaxis: 'y2' },
      { x: ['a'], y: [1], offsetgroup: 'B' },
      { x: ['a'], y: [1], offsetgroup: 'C', alignmentgroup: 'g' },
    ]);
    expect(fullLayout['_barAlignment']).toEqual({ 'x|v|': ['B', 'A'], 'x|v|g': ['C'] });
  });
});

describe('bar calc and cross-trace calc', () => {
  const cat = (n: string[]) => axisInfo('x', 'category', n);
  const lin = (id = 'y') => axisInfo(id, 'linear');

  it('places category bars at the category index with the bargap slot', () => {
    const { calcs } = calcAll(
      [{ x: ['a', 'b', 'c'], y: [1, -2, 3] }],
      {},
      cat(['a', 'b', 'c']),
      lin(),
    );
    const c = calcs[0]!;
    expect([...c.pos]).toEqual([0, 1, 2]);
    expect([...c.bars.width].map((w) => +w.toFixed(6))).toEqual([0.8, 0.8, 0.8]);
    expect([...c.s0, ...c.s1]).toEqual([0, 0, 0, 1, -2, 3]);
  });

  it('groups, stacks and overlays traces per layout.barmode', () => {
    const data = [
      { x: ['a', 'b'], y: [1, 2] },
      { x: ['a', 'b'], y: [3, -1] },
    ];
    const x = cat(['a', 'b']);
    const group = calcAll(data, {}, x, lin()).calcs;
    expect([...group[0]!.bars.center].map((v) => +v.toFixed(6))).toEqual([-0.2, 0.8]);
    const stack = calcAll(data, { barmode: 'stack' }, x, lin()).calcs;
    expect([...stack[1]!.s0, ...stack[1]!.s1]).toEqual([1, 2, 4, 1]);
    const relative = calcAll(data, { barmode: 'relative' }, x, lin()).calcs;
    expect([...relative[1]!.s0, ...relative[1]!.s1]).toEqual([1, 0, 4, -1]);
    const overlay = calcAll(data, { barmode: 'overlay' }, x, lin()).calcs;
    expect([...overlay[1]!.bars.center]).toEqual([0, 1]);
    const percent = calcAll(data, { barmode: 'stack', barnorm: 'percent' }, x, lin()).calcs;
    expect(percent[1]!.s1[0]).toBeCloseTo(100);
  });

  it('lays out horizontal and vertical bars of a subplot separately', () => {
    const x = lin('x');
    const y = lin('y');
    const { calcs } = calcAll(
      [
        { x: [0, 1], y: [1, 1] },
        { x: [2, 2], y: [0, 1], orientation: 'h' },
      ],
      { barmode: 'stack' },
      x,
      y,
    );
    expect([...calcs[0]!.s0]).toEqual([0, 0]);
    expect([...calcs[1]!.s0]).toEqual([0, 0]);
    expect([...calcs[1]!.bars.center]).toEqual([0, 1]);
  });

  it('works without a cross-trace pass (single-trace layout in calc)', () => {
    const { fullData, fullLayout } = defaults([{ x: ['a', 'b'], y: [1, 2] }]);
    const c = bar.calc!(fullData[0]!, {
      fullLayout,
      index: 0,
      xaxis: cat(['a', 'b']),
      yaxis: lin(),
    });
    expect([...c.s1]).toEqual([1, 2]);
    expect([...c.bars.center]).toEqual([0, 1]);
  });

  it('is idempotent: re-running cross-trace calc gives the same stack', () => {
    const x = cat(['a']);
    const y = lin();
    const { traces, calcs, fullLayout } = calcAll(
      [
        { x: ['a'], y: [1] },
        { x: ['a'], y: [2] },
      ],
      { barmode: 'stack' },
      x,
      y,
    );
    const entries = traces.map((trace, index) => ({ trace, index, calc: calcs[index]! }));
    bar.crossTraceCalc!(entries, { fullLayout, xaxis: x, yaxis: y, subplot: {} as never });
    expect([calcs[1]!.s0[0], calcs[1]!.s1[0]]).toEqual([1, 3]);
  });

  it('starts log-axis bars below the axis and stacks raw values', () => {
    const y = axisInfo('y', 'log');
    const { calcs } = calcAll(
      [
        { x: ['a', 'b'], y: [10, 1000] },
        { x: ['a', 'b'], y: [90, 0] },
      ],
      { barmode: 'stack' },
      cat(['a', 'b']),
      y,
    );
    expect(calcs[0]!.s0[0]).toBe(-Infinity);
    expect(calcs[0]!.floor).toBe(true);
    expect(calcs[0]!.s1[0]).toBeCloseTo(1);
    // 10 + 90 = 100 → 2 decades.
    expect(calcs[1]!.s0[0]).toBeCloseTo(1);
    expect(calcs[1]!.s1[0]).toBeCloseTo(2);
    const g = barGeometry(calcs[0]!, -5);
    expect(g.y0[0]).toBe(-5);
  });

  it('sizes date bars in ms and accepts date bases', () => {
    const x = axisInfo('x', 'date');
    const day = 86_400_000;
    const { calcs } = calcAll([{ x: ['2024-01-01', '2024-01-02'], y: [1, 2] }], {}, x, lin());
    expect(calcs[0]!.bars.width[0]).toBeCloseTo(0.8 * day);
    const { calcs: gantt } = calcAll(
      [{ y: ['a'], x: [day], base: ['2024-01-01'], orientation: 'h' }],
      {},
      axisInfo('x', 'date'),
      axisInfo('y', 'category', ['a']),
    );
    expect(gantt[0]!.s0[0]).toBe(Date.UTC(2024, 0, 1));
    expect(gantt[0]!.s1[0]).toBe(Date.UTC(2024, 0, 2));
  });

  it('reports full slots on the position axis and zero on the size axis', () => {
    const x = cat(['a', 'b']);
    const y = lin();
    const { traces, calcs, fullLayout } = calcAll([{ x: ['a', 'b'], y: [2, 4] }], {}, x, y);
    const e = bar.extremes!(calcs[0]!, traces[0]!, { fullLayout, index: 0, xaxis: x, yaxis: y });
    expect(e.x).toEqual({ min: [{ l: -0.5, padPx: 0 }], max: [{ l: 1.5, padPx: 0 }] });
    expect(e.y?.min).toEqual([{ l: 0, padPx: 0, extrapad: false }]);
    expect(e.y?.max).toEqual([{ l: 4, padPx: 0, extrapad: true }]);
  });

  it('pads the size axis for outside labels', () => {
    const x = cat(['a']);
    const y = lin();
    const { traces, calcs, fullLayout } = calcAll(
      [{ x: ['a'], y: [2], text: ['hi'], textposition: 'outside', textfont: { size: 10 } }],
      {},
      x,
      y,
    );
    const e = bar.extremes!(calcs[0]!, traces[0]!, { fullLayout, index: 0, xaxis: x, yaxis: y });
    expect(e.y?.max[0]?.padPx).toBeCloseTo(10 * 1.2 + 6);
  });
});

describe('bar category values (value-based categoryorder, E3.6)', () => {
  const lin = (id: string) => axisInfo(id, 'linear');

  /** Sort the categories of the position axis by the traces' samples, as the runtime does. */
  function sorted(
    data: unknown[],
    layout: unknown,
    order: string,
    letter: 'x' | 'y',
    categories: string[],
  ): string[] {
    const cat = axisInfo(letter, 'category', categories);
    const [x, y] = letter === 'x' ? [cat, lin('y')] : [lin('x'), cat];
    const { traces, calcs } = calcAll(data, layout, x, y);
    const samples = calcs
      .map((c, i) => bar.categoryValues!(c, traces[i]!, letter, {} as CalcContext))
      .filter((s): s is CategorySamples => s !== undefined);
    return sortCategoriesByValue(categories, order, collectCategoryValues(categories, samples));
  }

  it('totals every trace of a stack (own sizes, not stacked tops)', () => {
    const data = [
      { x: ['a', 'b', 'c'], y: [1, 5, 2] },
      { x: ['a', 'b', 'c'], y: [6, 1, 2] },
    ];
    // Totals: a 7, b 6, c 4 — in every barmode.
    for (const barmode of ['group', 'stack', 'relative', 'overlay']) {
      expect(sorted(data, { barmode }, 'total descending', 'x', ['a', 'b', 'c'])).toEqual([
        'a',
        'b',
        'c',
      ]);
    }
    // Max of own sizes: a 6, b 5, c 2 (a stacked top would give b 6).
    expect(sorted(data, { barmode: 'stack' }, 'max ascending', 'x', ['a', 'b', 'c'])).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('uses barnorm-normalized sizes, like Plotly after cross-trace calc', () => {
    const data = [
      { x: ['a', 'b'], y: [1, 30] },
      { x: ['a', 'b'], y: [3, 10] },
    ];
    // Fractions: trace 0 has a 0.25, b 0.75 → max: a 0.75, b 0.75 (tie) vs raw a 3, b 30.
    expect(
      sorted(data, { barmode: 'stack', barnorm: 'fraction' }, 'max descending', 'x', ['a', 'b']),
    ).toEqual(['a', 'b']);
    expect(sorted(data, { barmode: 'stack' }, 'max descending', 'x', ['a', 'b'])).toEqual([
      'b',
      'a',
    ]);
  });

  it('reads horizontal bars on the y axis and skips bars without a value', () => {
    const data = [
      { y: ['p', 'q', 'r'], x: [3, null, 1], orientation: 'h' },
      { y: ['q', 'r'], x: [2, 1], orientation: 'h' },
    ];
    // Totals: p 3, q 2, r 2 (tie keeps trace order).
    expect(sorted(data, {}, 'total ascending', 'y', ['p', 'q', 'r'])).toEqual(['q', 'r', 'p']);
    // Means: p 3, q 2, r 1.
    expect(sorted(data, {}, 'mean ascending', 'y', ['p', 'q', 'r'])).toEqual(['r', 'q', 'p']);
  });

  it('contributes nothing on the size axis', () => {
    const { traces, calcs } = calcAll(
      [{ x: ['a'], y: [1] }],
      {},
      axisInfo('x', 'category', ['a']),
      lin('y'),
    );
    expect(bar.categoryValues!(calcs[0]!, traces[0]!, 'y', {} as CalcContext)).toBeUndefined();
  });
});

describe('bar error bars', () => {
  it('default to the outline color and attach at the stacked bar ends', () => {
    const x = axisInfo('x', 'category', ['a', 'b']);
    const y = axisInfo('y', 'linear');
    const { traces, calcs, fullLayout } = calcAll(
      [
        { x: ['a', 'b'], y: [1, 2] },
        { x: ['a', 'b'], y: [3, 4], error_y: { array: [0.5, 1] } },
      ],
      { barmode: 'stack' },
      x,
      y,
    );
    expect(traces[1]!['error_y']).toMatchObject({
      visible: true,
      type: 'data',
      color: 'rgb(68, 68, 68)',
    });
    const e = calcs[1]!.errorY!;
    // Tops are 4 and 6.
    expect([...e.minus, ...e.plus]).toEqual([3.5, 5, 4.5, 7]);
    expect([...calcs[1]!.ends.x]).toEqual([0, 1]);
    const ext = bar.extremes!(calcs[1]!, traces[1]!, { fullLayout, index: 1, xaxis: x, yaxis: y });
    expect(ext.y?.max.some((p) => p.l === 7 && p.extrapad === true)).toBe(true);
  });
});

describe('bar style', () => {
  it('bakes marker opacity into fill and outline', () => {
    const [t] = defaults([
      { y: [1, 2], marker: { color: ['red', 'blue'], opacity: [1, 0.5], line: { width: 2 } } },
    ]).fullData;
    const s = barStyle(t!, 2);
    expect([...s.fill]).toEqual([1, 0, 0, 1, 0, 0, 1, 0.5]);
    expect(s.border[7]).toBeCloseTo(0.5);
    expect(s.borderWidth).toBe(2);
  });

  it('maps numeric colors through the colorscale', () => {
    const [t] = defaults([
      {
        y: [1, 2, 3],
        marker: {
          color: [0, 5, 10],
          colorscale: [
            [0, 'black'],
            [1, 'white'],
          ],
        },
      },
    ]).fullData;
    const s = barStyle(t!, 3);
    expect([...s.color.subarray(0, 4)]).toEqual([0, 0, 0, 1]);
    expect(s.color[4]).toBeCloseTo(0.5);
    expect([...s.color.subarray(8, 12)]).toEqual([1, 1, 1, 1]);
    const [named] = defaults([
      { y: [1, 2], marker: { color: [0, 1], colorscale: 'viridis' } },
    ]).fullData;
    expect(barStyle(named!, 2).color[0]).toBeCloseTo(0x44 / 255);
  });

  it('dims unselected bars and applies selected/unselected styles', () => {
    const [t] = defaults([
      { y: [1, 2, 3], marker: { opacity: 0.5 }, selected: { marker: { color: 'red' } } },
    ]).fullData;
    const s = barStyle(t!, 3, new Set([1]));
    expect([...s.fill.subarray(4, 8)]).toEqual([1, 0, 0, 0.5]);
    expect(s.fill[3]).toBeCloseTo(0.1);
    const [u] = defaults([{ y: [1, 2], unselected: { marker: { opacity: 0.7 } } }]).fullData;
    expect(barStyle(u!, 2, new Set([0])).fill[7]).toBeCloseTo(0.7);
  });

  it('parses corner radii in px and percent of the bar width', () => {
    expect(cornerRadiusPx(4, 40)).toBe(4);
    expect(cornerRadiusPx('25%', 40)).toBe(10);
    expect(cornerRadiusPx('8', 40)).toBe(8);
    expect(cornerRadiusPx('nope', 40)).toBe(0);
    expect(cornerRadiusPx(undefined, 40)).toBe(0);
  });

  it('picks white text on dark fills and dark text on light ones', () => {
    expect(contrastColor([0.1, 0.1, 0.4, 1], 0, [1, 1, 1, 1])).toEqual([1, 1, 1, 1]);
    expect(contrastColor([0.9, 0.9, 0.5, 1], 0, [1, 1, 1, 1])[0]).toBeCloseTo(68 / 255);
    // A translucent dark fill over white reads light.
    expect(contrastColor([0, 0, 0, 0.2], 0, [1, 1, 1, 1])[0]).toBeCloseTo(68 / 255);
  });

  it('describes the legend glyph', () => {
    const [t] = defaults([
      { y: [1], marker: { color: 'red', line: { width: 1, color: 'blue' } } },
    ]).fullData;
    expect(bar.legendIcon!(t!)).toEqual({
      kind: 'bar',
      fill: { color: 'rgb(255, 0, 0)', lineColor: 'rgb(0, 0, 255)', lineWidth: 1 },
    });
  });
});

describe('bar view', () => {
  function plotContext(
    data: unknown[],
    layout: unknown = {},
    selectedPoints?: number[] | null,
    index = 0,
  ) {
    const x = axisInfo('x', 'category', ['a', 'b'], [-0.5, 1.5]);
    const y = axisInfo('y', 'linear', undefined, [0, 4]);
    const { traces, calcs, fullLayout } = calcAll(data, layout, x, y);
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<BarCalc> = {
      trace: traces[index]!,
      calc: calcs[index]!,
      index: 2,
      fullLayout,
      subplot: undefined,
      xaxis: x,
      yaxis: y,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 100, offsetX: 50, scaleY: 50 },
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
      ...(selectedPoints !== undefined ? { selectedPoints } : {}),
    };
    return { ctx, added };
  }

  const PLAN: TraceUpdatePlan = { calc: false, plot: false, style: false, transform: false };

  it('adds error-bar layers above the bars', () => {
    const { ctx, added } = plotContext([{ x: ['a', 'b'], y: [1, 3], error_y: { value: 10 } }]);
    bar.plot!.create(ctx);
    // Rects, then the error-bar stems and caps.
    expect(added).toHaveLength(3);
    expect(added[1]!.object.renderOrder).toBe(traceRenderOrder(ctx.trace, 2) + 0.25);
  });

  it('draws all bars with one rect primitive, in trace order', () => {
    const { ctx, added } = plotContext([{ x: ['a', 'b'], y: [1, 3], textposition: 'none' }]);
    bar.plot!.create(ctx);
    expect(added).toHaveLength(1);
    const rects = added[0] as RectPrimitive;
    expect(rects.instanceCount).toBe(2);
    expect(rects.object.renderOrder).toBe(traceRenderOrder(ctx.trace, 2));
  });

  it('restyles without new geometry and zooms with uniforms only', () => {
    const { ctx, added } = plotContext([{ x: ['a', 'b'], y: [1, 3] }]);
    const view = bar.plot!.create(ctx);
    const rects = added[0] as RectPrimitive;
    const update = vi.spyOn(rects, 'update');
    const setTransform = vi.spyOn(rects, 'setTransform');
    view.update(ctx, { ...PLAN, style: true });
    expect(Object.keys(update.mock.calls[0]![0])).not.toContain('x0');
    view.update(ctx, { ...PLAN, transform: true });
    expect(Object.keys(update.mock.calls[1]![0])).not.toContain('x0');
    expect(setTransform).toHaveBeenCalledWith(ctx.transform);
    view.update(ctx, { ...PLAN, selection: true });
    expect(Object.keys(update.mock.calls[2]![0])).toContain('fill');
  });

  it('rounds only the outermost bars of a stack', () => {
    const data = [
      { x: ['a'], y: [1], marker: { cornerradius: 5 } },
      { x: ['a'], y: [1], marker: { cornerradius: '25%' } },
    ];
    const radius = (index: number): number[] => {
      const { ctx, added } = plotContext(data, { barmode: 'stack' }, undefined, index);
      bar.plot!.create(ctx);
      const rects = added[0] as unknown as { data: { cornerRadius: Float32Array } };
      return [...rects.data.cornerRadius];
    };
    expect(radius(0)).toEqual([0]);
    // 25% of a stacked bar 0.8 slots wide at 100 px per slot (80 px).
    expect(radius(1)).toEqual([20]);
  });

  it('dims unselected bars through ctx.selectedPoints', () => {
    const { ctx, added } = plotContext([{ x: ['a', 'b'], y: [1, 3] }], {}, [0]);
    bar.plot!.create(ctx);
    const fill = (added[0] as unknown as { data: { fill: Float32Array } }).data.fill;
    expect(fill[3]).toBe(1);
    expect(fill[7]).toBeCloseTo(0.2);
  });
});
