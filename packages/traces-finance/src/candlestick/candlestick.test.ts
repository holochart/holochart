import { holochartTemplate } from '@mk7s/holochart-core';
import { LinePrimitive, RectPrimitive } from '@mk7s/holochart-render';
import type { CrossTraceEntry } from '@mk7s/holochart-runtime';
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { calcOf, daily, figure, plotCtx } from '../__testing__/figure.ts';
import type { PriceCalc } from '../shared/calc.ts';
import { candleGeometry } from './plot.ts';
import { candleSlots, crossTraceCalcCandlestick } from './calc.ts';
import { candlestick } from './index.ts';

const DAY = 86_400_000;
const DATES = { x: { type: 'date' as const } };
const ROWS = [
  [1, 3, 0.5, 2],
  [2, 2.5, 1, 1.5],
  [1.5, 2, 1, 1.5],
  [1.5, 4, 1.5, 3.5],
] as const;
const candles = (extra: Record<string, unknown> = {}) => ({
  type: 'candlestick',
  ...daily(ROWS),
  ...extra,
});

describe('candlestick defaults', () => {
  it('fills bodies with the line color at half opacity and has no whisker caps', () => {
    const [t] = figure([candles({ increasing: { line: { color: '#00f', width: 1 } } })]).fullData;
    expect(t).toMatchObject({
      line: { width: 2 },
      whiskerwidth: 0,
      increasing: {
        line: { color: 'rgb(0, 0, 255)', width: 1 },
        fillcolor: 'rgba(0, 0, 255, 0.5)',
      },
      decreasing: {
        line: { color: 'rgb(255, 65, 54)', width: 2 },
        fillcolor: 'rgba(255, 65, 54, 0.5)',
      },
    });
    const [f] = figure([candles({ decreasing: { fillcolor: 'black' } })]).fullData;
    expect(f).toMatchObject({ decreasing: { fillcolor: 'rgb(0, 0, 0)' } });
  });

  it('coerces the box layout attributes and numbers the candlestick traces', () => {
    const { fullData, fullLayout } = figure([candles(), candles({ visible: false }), candles()], {
      boxmode: 'group',
    });
    expect(fullLayout).toMatchObject({ boxmode: 'group', boxgap: 0.3, boxgroupgap: 0.3 });
    expect(fullLayout['_numCandles']).toBe(2);
    expect([fullData[0]!['_candleNum'], fullData[2]!['_candleNum']]).toEqual([0, 1]);
    expect(fullLayout.xaxis).toMatchObject({ rangeslider: { visible: true } });
  });

  it("uses the default look's colors, with Plotly's half-opacity bodies", () => {
    const [t] = figure([candles()], { template: holochartTemplate }).fullData;
    expect(t).toMatchObject({
      increasing: {
        line: { color: 'rgb(17, 142, 54)', width: 1 },
        fillcolor: 'rgba(17, 142, 54, 0.5)',
      },
      decreasing: {
        line: { color: 'rgb(234, 42, 55)', width: 1 },
        fillcolor: 'rgba(234, 42, 55, 0.5)',
      },
    });
  });
});

describe('candlestick layout', () => {
  it('makes candles 49% of the spacing wide by default (boxgap and boxgroupgap 0.3)', () => {
    const { calc } = calcOf(candles(), DATES);
    expect(calc.slot.dPos).toBe(DAY / 2);
    expect(calc.slot.halfWidth).toBeCloseTo(0.245 * DAY);
    expect(calc.slot.wHover).toBe(DAY / 2);
    expect(calc.slot.bPos).toBe(0);
  });

  it('puts grouped traces side by side in each slot', () => {
    const layout = { boxmode: 'group', boxgap: 0, boxgroupgap: 0 };
    const a = calcOf(candles(), DATES, layout);
    const b = calcOf({ ...candles(), _candleNum: 1 }, DATES, layout);
    const fullLayout = { ...a.fullLayout, _numCandles: 2 };
    const traces = [
      { calc: a.calc, trace: { ...a.trace, _candleNum: 0 } },
      { calc: b.calc, trace: { ...b.trace, _candleNum: 1 } },
    ];
    const [s0, s1] = candleSlots(traces, fullLayout);
    expect(s0).toEqual({ dPos: DAY / 2, bPos: -DAY / 4, halfWidth: DAY / 4, wHover: DAY / 4 });
    expect(s1!.bPos).toBe(DAY / 4);
  });

  it('lays the candles of a subplot out from all their positions', () => {
    const a = calcOf({ ...candles(), x: [0, 10, 20, 30] });
    const b = calcOf({ ...candles(), x: [5, 6, 7, 8] });
    const entries: CrossTraceEntry<PriceCalc>[] = [
      { trace: a.trace, index: 0, calc: a.calc },
      { trace: b.trace, index: 1, calc: b.calc },
    ];
    expect(crossTraceCalcCandlestick(entries, a.fullLayout)).toEqual([0]);
    expect(a.calc.slot.halfWidth).toBeCloseTo(0.245);
    expect(crossTraceCalcCandlestick(entries, a.fullLayout)).toEqual([]);
  });

  it('gives category axes one slot per category', () => {
    const { calc } = calcOf(
      { ...candles(), x: ['a', 'c'] },
      { x: { type: 'category', categories: ['a', 'b', 'c'] } },
    );
    expect(calc.slot.dPos).toBe(0.5);
  });
});

describe('candlestick view', () => {
  it('builds bodies from open to close and wicks from the body to the high and low', () => {
    const { calc } = calcOf({ ...candles(), x: [0, 1, 2, 3] });
    const { bodies, wicks } = candleGeometry(calc, 0);
    const h = 0.245;
    expect(Array.from(bodies.x0)).toEqual([-h, 1 - h, 2 - h, 3 - h].map((v) => expect.closeTo(v)));
    expect(Array.from(bodies.y0)).toEqual([1, 2, 1.5, 1.5]);
    expect(Array.from(bodies.y1)).toEqual([2, 1.5, 1.5, 3.5]);
    // Two wicks per candle, the flat third body as a line, and no empty wick (bar 3's low).
    expect(wicks.count).toBe(2 + 2 + 3 + 1);
    expect(Array.from(wicks.y.subarray(0, 4))).toEqual([2, 3, 1, 0.5]);
    const flat = Array.from(wicks.x.subarray(12, 14));
    expect(flat).toEqual([2 - h, 2 + h].map((v) => expect.closeTo(v)));
    // Whisker caps at every high and low.
    expect(candleGeometry(calc, 0.5).wicks.count).toBe(wicks.count + 8);
  });

  it('draws in two calls whatever the candle count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3000 }), (n) => {
        const rows = Array.from({ length: n }, (_, i) => {
          const o = 100 + 5 * Math.sin(i);
          return [o, o + 3, o - 3, o + 2 * Math.cos(i * 1.7)] as const;
        });
        const s = calcOf({ type: 'candlestick', ...daily(rows) }, DATES);
        const { ctx, added } = plotCtx(s.trace, s.calc, s.fullLayout);
        candlestick.plot!.create(ctx);
        expect(added).toHaveLength(2);
        const rects = added.find((p) => p instanceof RectPrimitive) as RectPrimitive;
        expect(rects.instanceCount).toBe(n);
        expect(added.some((p) => p instanceof LinePrimitive)).toBe(true);
      }),
      { numRuns: 8 },
    );
  });

  it('styles bodies per direction with centered outlines, and dims unselected candles', () => {
    const s = calcOf(candles(), DATES);
    const { ctx, added } = plotCtx(s.trace, s.calc, s.fullLayout);
    const view = candlestick.plot!.create(ctx);
    const rects = added.find((p) => p instanceof RectPrimitive) as RectPrimitive;
    const line = added.find((p) => p instanceof LinePrimitive) as LinePrimitive;
    expect(rects.object.renderOrder).toBeGreaterThan(line.object.renderOrder);
    const rectUpdate = vi.spyOn(rects, 'update');
    const lineUpdate = vi.spyOn(line, 'update');
    view.update(
      { ...ctx, selectedPoints: [1] },
      { calc: false, plot: false, style: false, transform: false, selection: true },
    );
    const patch = rectUpdate.mock.calls[0]![0];
    expect(Object.keys(patch).sort()).toEqual(['borderColor', 'borderWidth', 'fill', 'opacity']);
    const fill = patch.fill as Float32Array;
    // Candle 0 (rising, dimmed): Plotly's #3D9970 at half opacity × 0.3; candle 1 (falling) kept.
    expect(fill[3]).toBeCloseTo(0.15);
    expect(fill[7]).toBeCloseTo(0.5);
    expect(Array.from(patch.borderWidth as Float32Array)).toEqual([2, 2, 2, 2]);
    expect(Object.keys(lineUpdate.mock.calls[0]![0]).sort()).toEqual([
      'color',
      'dash',
      'opacity',
      'width',
    ]);
  });
});
