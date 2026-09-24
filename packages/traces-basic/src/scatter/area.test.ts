import { createScale, supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { IDENTITY_TRANSFORM } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type CrossTraceContext,
  type HoverContext,
  type HoverQuery,
  type SubplotInfo,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { bubbleSizeref } from './bubble.ts';
import { calcScatter, markerDiameters, type ScatterCalc } from './calc.ts';
import { calcScatterAppend } from './calc-stream.ts';
import { scatterCrossTraceCalc } from './cross-trace.ts';
import { scatter } from './index.ts';
import { scatterHoverPoints, scatterLegendIcon } from './interaction.ts';

const registry = createChartRegistry().register(scatter);

function axisInfo(type: 'linear' | 'log' | 'date' | 'category', categories?: string[]): AxisInfo {
  const scale = createScale({ type, ...(categories ? { categories } : {}) });
  return { scale, type, full: {}, start: 0, end: 100 } as unknown as AxisInfo;
}

function defaults(data: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  return supplyDefaults({ data, layout }, registry.core);
}

/** Calc + cross-trace calc of every visible trace, on one subplot with the given axes. */
function run(
  data: Record<string, unknown>[],
  axes: { x?: AxisInfo; y?: AxisInfo } = {},
): { traces: FullTrace[]; calcs: ScatterCalc[]; fullLayout: FullLayout; ctx: CalcContext } {
  const { fullData, fullLayout } = defaults(data);
  const xaxis = axes.x ?? axisInfo('linear');
  const yaxis = axes.y ?? axisInfo('linear');
  const ctx: CalcContext = { fullLayout, index: 0, xaxis, yaxis };
  const traces = fullData.filter((t) => t.visible === true);
  const calcs = traces.map((t) => calcScatter(t, { ...ctx, index: t._index }));
  const cross: CrossTraceContext = {
    fullLayout,
    subplot: {} as SubplotInfo,
    xaxis,
    yaxis,
  };
  scatterCrossTraceCalc(
    traces.map((trace, k) => ({ trace, index: trace._index, calc: calcs[k]! })),
    cross,
  );
  return { traces, calcs, fullLayout, ctx };
}

const arr = (v: ArrayLike<number>): number[] => Array.from(v);

describe('scatter fill and stack defaults (E9.4, Plotly scatter/defaults.js)', () => {
  it('fill defaults to none; fillcolor to the line color at half opacity', () => {
    const { fullData } = defaults([
      { y: [1, 2, 3] },
      { y: [1, 2, 3], fill: 'tozeroy', line: { color: '#ff0000' } },
      { y: [1, 2, 3], fill: 'tozeroy', mode: 'markers', marker: { color: 'rgb(0, 0, 255)' } },
    ]);
    expect(fullData[0]!['fill']).toBe('none');
    expect(fullData[0]!['fillcolor']).toBeUndefined();
    expect(fullData[1]!['fillcolor']).toBe('rgba(255, 0, 0, 0.5)');
    expect(fullData[2]!['fillcolor']).toBe('rgba(0, 0, 255, 0.5)');
    // The fill follows the line shape even without lines.
    expect(fullData[2]!['line']).toMatchObject({ shape: 'linear' });
  });

  it('fillgradient: coerced when typed, its average color feeds fillcolor without a line', () => {
    const { fullData } = defaults([
      {
        y: [1, 2],
        // No line or marker color to inherit (markers would pass on their '#444' outline).
        mode: 'none',
        fill: 'tozeroy',
        fillgradient: {
          type: 'horizontal',
          colorscale: [
            [0, 'rgb(0,0,0)'],
            [1, 'rgb(255,255,255)'],
          ],
        },
      },
    ]);
    const t = fullData[0]!;
    expect(t['fillgradient']).toMatchObject({ type: 'horizontal' });
    expect(t['fillcolor']).toBe('rgba(128, 128, 128, 0.5)');
  });

  it("hoveron: 'fills' for toself / tonext without markers or text", () => {
    const { fullData } = defaults([
      { y: [1, 2, 3], mode: 'lines', fill: 'toself' },
      { y: [1, 2, 3], mode: 'lines+markers', fill: 'toself' },
      { y: [1, 2, 3], mode: 'lines', fill: 'tozeroy' },
      { y: [1, 2, 3], mode: 'markers' },
    ]);
    expect(fullData.map((t) => t['hoveron'])).toEqual([
      'fills',
      'points+fills',
      'points',
      'points',
    ]);
  });

  it("stackgroup implies fill 'tonexty' and mode 'lines' (any point count)", () => {
    const { fullData } = defaults([
      { y: [1, 2, 3], stackgroup: 'a' },
      { y: [1, 2, 3], stackgroup: 'a', fill: 'none' },
    ]);
    expect(fullData[0]).toMatchObject({ fill: 'tonexty', mode: 'lines', orientation: 'v' });
    expect(fullData[0]).toMatchObject({ groupnorm: '', stackgaps: 'infer zero' });
    expect(fullData[1]!['fill']).toBe('none');
    // Stack-wide options appear on one trace only.
    expect(fullData[1]!['groupnorm']).toBeUndefined();
  });

  it("orientation 'h' by default with x only; a later orientation resets earlier fills", () => {
    const { fullData } = defaults([
      { x: [1, 2, 3], stackgroup: 'a' },
      { x: [1, 2, 3], y: [1, 2, 3], stackgroup: 'b' },
      { x: [1, 2, 3], y: [1, 2, 3], stackgroup: 'b', orientation: 'h' },
    ]);
    expect(fullData[0]).toMatchObject({ orientation: 'h', fill: 'tonextx' });
    expect(fullData[1]!['fill']).toBe('tonextx');
    expect(fullData[1]!['orientation']).toBeUndefined();
    expect(fullData[2]).toMatchObject({ orientation: 'h', fill: 'tonextx' });
  });

  it('keeps separate stack options per subplot and group', () => {
    const { fullData } = defaults([
      { y: [1], stackgroup: 'a', groupnorm: 'percent' },
      { y: [1], stackgroup: 'a', groupnorm: 'fraction' },
      { y: [1], stackgroup: 'a', yaxis: 'y2', groupnorm: 'fraction' },
    ]);
    expect(fullData[0]!['groupnorm']).toBe('percent');
    // The first value found wins: later ones are not coerced.
    expect(fullData[1]!['groupnorm']).toBeUndefined();
    expect(fullData[2]!['groupnorm']).toBe('fraction');
  });
});

describe('scatter crossTraceCalc: links and stacks', () => {
  it('links tonext* to the previous visible trace of the same stack group', () => {
    const { calcs } = run([
      { y: [1, 2] },
      { y: [3, 4], fill: 'tonexty' },
      { y: [5, 6], fill: 'tozeroy' },
      { y: [7, 8], fill: 'tonexty', visible: 'legendonly' },
      { y: [9, 9], fill: 'tonext' },
    ]);
    expect(calcs[0]!.link).toEqual({ first: true });
    expect(calcs[1]!.link?.previous?.index).toBe(0);
    expect(calcs[1]!.link?.first).toBe(false);
    // Only tonext* link; a hidden trace is skipped.
    expect(calcs[2]!.link?.previous).toBeUndefined();
    expect(calcs[3]!.link?.previous?.index).toBe(2);
  });

  it('links within stack groups, not across them', () => {
    const { calcs } = run([
      { y: [1, 2], stackgroup: 'a' },
      { y: [1, 2], fill: 'tonexty' },
      { y: [1, 2], stackgroup: 'a' },
      { y: [1, 2], stackgroup: 'b' },
    ]);
    expect(calcs[0]!.link).toEqual({ first: true });
    // The unstacked trace has no unstacked trace before it.
    expect(calcs[1]!.link).toEqual({ first: true });
    expect(calcs[2]!.link?.previous?.index).toBe(0);
    expect(calcs[3]!.link).toEqual({ first: true });
  });

  it('stacks y values and keeps the raw ones for reruns (idempotent)', () => {
    const data = [
      { x: [0, 1, 2], y: [1, 2, 3], stackgroup: 'a' },
      { x: [0, 1, 2], y: [10, 20, 30], stackgroup: 'a' },
    ];
    const { traces, calcs, fullLayout, ctx } = run(data);
    expect(arr(calcs[1]!.y)).toEqual([11, 22, 33]);
    expect(arr(calcs[1]!.stack!.raw.y)).toEqual([10, 20, 30]);
    expect(arr(calcs[1]!.stack!.value)).toEqual([10, 20, 30]);
    expect(arr(calcs[1]!.stack!.path.y)).toEqual([11, 22, 33]);
    // Rerun on the same calcs: same result.
    scatterCrossTraceCalc(
      traces.map((trace, k) => ({ trace, index: k, calc: calcs[k]! })),
      { fullLayout, subplot: {} as SubplotInfo, xaxis: ctx.xaxis!, yaxis: ctx.yaxis! },
    );
    expect(arr(calcs[1]!.y)).toEqual([11, 22, 33]);
    // A member leaving the group restores its own coordinates.
    scatterCrossTraceCalc([{ trace: traces[1]!, index: 1, calc: calcs[1]! }], {
      fullLayout: defaults([data[1]!]).fullLayout,
      subplot: {} as SubplotInfo,
      xaxis: ctx.xaxis!,
      yaxis: ctx.yaxis!,
    });
    expect(arr(calcs[1]!.y)).toEqual([10, 20, 30]);
  });

  it('stacks x values for orientation h, with groupnorm', () => {
    const { calcs } = run([
      { y: [0, 1], x: [1, 3], stackgroup: 'a', orientation: 'h', groupnorm: 'percent' },
      { y: [0, 1], x: [3, 1], stackgroup: 'a' },
    ]);
    expect(arr(calcs[0]!.x)).toEqual([25, 75]);
    expect(arr(calcs[1]!.x)).toEqual([100, 100]);
    expect(arr(calcs[1]!.y)).toEqual([0, 1]);
    expect(calcs[1]!.stack?.orientation).toBe('h');
    expect(arr(calcs[1]!.stack!.value)).toEqual([75, 25]);
  });

  it('interpolates or infers zero at positions a trace lacks (stackgaps)', () => {
    const data = (stackgaps: string) => [
      { x: [0, 1, 2], y: [1, 1, 1], stackgroup: 'a', stackgaps },
      { x: [0, 2], y: [2, 4], stackgroup: 'a' },
    ];
    const zero = run(data('infer zero')).calcs[1]!;
    expect(arr(zero.stack!.path.y)).toEqual([3, 1, 5]);
    expect(arr(zero.stack!.slotIndex)).toEqual([0, -1, 1]);
    const interp = run(data('interpolate')).calcs[1]!;
    expect(arr(interp.stack!.path.y)).toEqual([3, 4, 5]);
  });

  it('stacks data values on log axes, and only on numeric value axes', () => {
    const log = run(
      [
        { x: [0, 1], y: [10, 100], stackgroup: 'a' },
        { x: [0, 1], y: [90, 900], stackgroup: 'a' },
      ],
      { y: axisInfo('log') },
    );
    expect(arr(log.calcs[1]!.y).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([2, 3]);
    const cat = run(
      [
        { x: [0, 1], y: ['a', 'b'], stackgroup: 'g' },
        { x: [0, 1], y: ['a', 'b'], stackgroup: 'g' },
      ],
      { y: axisInfo('category', ['a', 'b']) },
    );
    expect(cat.calcs[1]!.stack).toBeUndefined();
    expect(arr(cat.calcs[1]!.y)).toEqual([0, 1]);
  });

  it('stacked traces do not stream (restack from a full calc)', () => {
    const { traces, calcs, ctx } = run([
      { x: [0, 1], y: [1, 2], stackgroup: 'a' },
      { x: [0, 1], y: [1, 2], stackgroup: 'a' },
    ]);
    const append = {
      at: 'end' as const,
      start: 2,
      count: 1,
      trimmed: 0,
      previous: 2,
      length: 3,
      keys: ['x', 'y'],
    };
    const t = { ...traces[1]!, x: [0, 1, 2], y: [1, 2, 3], _length: 3 } as FullTrace;
    expect(calcScatterAppend(calcs[1]!, t, ctx, append)).toBeUndefined();
  });
});

describe('scatter extremes with fills (Plotly calcAxisExpansion)', () => {
  it('tozeroy includes zero on y and keeps x tight', () => {
    const { traces, calcs, ctx } = run([{ x: [1, 2, 3], y: [5, 6, 7], fill: 'tozeroy' }]);
    const e = scatter.extremes!(calcs[0]!, traces[0]!, ctx);
    expect(e.y!.min.some((p) => p.l === 0)).toBe(true);
    expect(e.x!.min[0]).toMatchObject({ l: 1, padPx: 0 });
    expect(e.x!.min[0]!.extrapad).toBeFalsy();
  });

  it('tonexty reaches zero for the first trace or a vertical stack only', () => {
    const { traces, calcs, ctx } = run([
      { x: [1, 2], y: [5, 6] },
      { x: [1, 2], y: [8, 9], fill: 'tonexty' },
    ]);
    const second = scatter.extremes!(calcs[1]!, traces[1]!, ctx);
    expect(second.y!.min.some((p) => p.l === 0)).toBe(false);
    const stacked = run([
      { x: [1, 2], y: [5, 6], stackgroup: 'a' },
      { x: [1, 2], y: [8, 9], stackgroup: 'a' },
    ]);
    const s = scatter.extremes!(stacked.calcs[1]!, stacked.traces[1]!, stacked.ctx);
    expect(s.y!.min.some((p) => p.l === 0)).toBe(true);
    expect(s.y!.max.some((p) => p.l === 15)).toBe(true);
  });

  it('closed shapes and log axes do not extend to zero', () => {
    const closed = run([{ x: [1, 2, 1], y: [5, 6, 5], fill: 'tozeroy' }]);
    const c = scatter.extremes!(closed.calcs[0]!, closed.traces[0]!, closed.ctx);
    expect(c.y!.min.some((p) => p.l === 0)).toBe(false);
    const log = run([{ x: [1, 2], y: [10, 100], fill: 'tozeroy' }], { y: axisInfo('log') });
    const l = scatter.extremes!(log.calcs[0]!, log.traces[0]!, log.ctx);
    expect(l.y!.min.some((p) => p.l === 0)).toBe(false);
  });
});

describe('scatter hover on fills and stacks', () => {
  const hoverCtx = (fullLayout: FullLayout, ctx: CalcContext): HoverContext => ({
    fullLayout,
    xaxis: ctx.xaxis,
    yaxis: ctx.yaxis,
    transform: IDENTITY_TRANSFORM,
  });
  const query = (x: number, y: number, mode: HoverQuery['mode'] = 'closest'): HoverQuery => ({
    px: x,
    py: y,
    xl: x,
    yl: y,
    mode,
    distance: 20,
  });

  it('reports the trace when the pointer is inside the fill (hoveron fills)', () => {
    const { traces, calcs, fullLayout, ctx } = run([
      { x: [0, 100, 100, 0], y: [0, 0, 100, 100], mode: 'lines', fill: 'toself', name: 'box' },
    ]);
    const h = hoverCtx(fullLayout, ctx);
    const [p] = scatterHoverPoints(calcs[0]!, traces[0]!, query(50, 50), h);
    expect(p).toMatchObject({ pointIndex: -1, text: 'box', distance: 20 });
    expect(p!.fields).toMatchObject({ hoveron: 'fills' });
    expect(p!.color).toBe(traces[0]!['fillcolor']);
    expect(p!.py).toBe(50);
    // Outside the fill: nothing. Fills only hover in closest mode.
    expect(scatterHoverPoints(calcs[0]!, traces[0]!, query(150, 50), h)).toEqual([]);
    expect(scatterHoverPoints(calcs[0]!, traces[0]!, query(50, 50, 'x'), h)).toEqual([]);
  });

  it('points win over the fill; hoveron points ignores the fill', () => {
    const { traces, calcs, fullLayout, ctx } = run([
      {
        x: [0, 100, 100, 0],
        y: [0, 0, 100, 100],
        mode: 'lines+markers',
        fill: 'toself',
        hoveron: 'points+fills',
      },
      {
        x: [0, 100, 100, 0],
        y: [0, 0, 100, 100],
        mode: 'lines',
        fill: 'toself',
        hoveron: 'points',
      },
    ]);
    const h = hoverCtx(fullLayout, ctx);
    const [corner] = scatterHoverPoints(calcs[0]!, traces[0]!, query(98, 98), h);
    expect(corner!.pointIndex).toBe(2);
    expect(scatterHoverPoints(calcs[1]!, traces[1]!, query(50, 50), h)).toEqual([]);
  });

  it('tonext fill hover excludes the enclosed previous trace', () => {
    const { traces, calcs, fullLayout, ctx } = run([
      { x: [40, 60, 60, 40], y: [40, 40, 60, 60], mode: 'lines', fill: 'toself' },
      { x: [0, 100, 100, 0], y: [0, 0, 100, 100], mode: 'lines', fill: 'tonext' },
    ]);
    const h = hoverCtx(fullLayout, ctx);
    expect(scatterHoverPoints(calcs[1]!, traces[1]!, query(10, 10), h)).toHaveLength(1);
    expect(scatterHoverPoints(calcs[1]!, traces[1]!, query(50, 50), h)).toEqual([]);
  });

  it("a stacked point reports its own (normalized) value, drawn at the stack's top", () => {
    const { traces, calcs, fullLayout, ctx } = run([
      { x: [0, 10], y: [1, 3], stackgroup: 'a', mode: 'lines+markers', groupnorm: 'percent' },
      { x: [0, 10], y: [3, 1], stackgroup: 'a', mode: 'lines+markers' },
    ]);
    const [p] = scatterHoverPoints(
      calcs[1]!,
      traces[1]!,
      query(10, 100),
      hoverCtx(fullLayout, ctx),
    );
    expect(p).toMatchObject({ pointIndex: 1, py: 100, y: 25, x: 10 });
  });

  it('legend: a fill swatch edged with the line', () => {
    const { traces } = run([{ y: [1, 2], fill: 'tozeroy', line: { color: '#123456', width: 3 } }]);
    expect(scatterLegendIcon(traces[0]!)).toEqual({
      kind: 'fill',
      fill: { color: 'rgba(18, 52, 86, 0.5)', lineColor: 'rgb(18, 52, 86)', lineWidth: 2 },
    });
  });
});

describe('bubbles (E9.5)', () => {
  it("bubbleSizeref: the largest size draws maxPx across (Plotly's formula)", () => {
    const sizes = [10, 40, '90', null, -5, NaN];
    const ref = bubbleSizeref(sizes, 60);
    expect(ref).toBeCloseTo((2 * 90) / 3600);
    const { fullData } = defaults([
      {
        x: [1, 2],
        y: [1, 2],
        mode: 'markers',
        marker: { size: [10, 90], sizemode: 'area', sizeref: ref },
      },
    ]);
    const d = markerDiameters(fullData[0]!, 2) as Float32Array;
    expect(d[1]).toBeCloseTo(60, 4);
    expect(bubbleSizeref([1, 4], 20, { sizemode: 'diameter' })).toBe(0.2);
    expect(bubbleSizeref([0, -1], 20)).toBe(1);
    expect(bubbleSizeref([5], 0)).toBe(1);
  });

  it("sizemode 'area' matches Plotly's makeBubbleSizeFn (radius sqrt(v/2/sizeref), sizemin)", () => {
    const { fullData } = defaults([
      {
        y: [1, 2, 3, 4],
        mode: 'markers',
        marker: { size: [8, 50, 0, '18'], sizemode: 'area', sizeref: 0.5, sizemin: 3 },
      },
    ]);
    const d = markerDiameters(fullData[0]!, 4) as Float32Array;
    // sqrt(8/2/0.5) = 2.83 → sizemin 3 → 6 px; sqrt(50/2/0.5) = 7.07 → 14.14 px; 0 hides;
    // the numeric string '18' counts: sqrt(18) = 4.24 → 8.49 px.
    expect(Array.from(d).map((v) => Math.round(v * 100) / 100)).toEqual([6, 14.14, 0, 8.49]);
  });
});
