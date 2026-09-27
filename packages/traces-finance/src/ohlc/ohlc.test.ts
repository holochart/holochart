import { holochartTemplate, plotlyClassicTemplate } from '@mk7s/holochart-core';
import { LinePrimitive } from '@mk7s/holochart-render';
import type { CrossTraceEntry } from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { calcOf, daily, figure, plotCtx } from '../__testing__/figure.ts';
import type { PriceCalc } from '../shared/calc.ts';
import { crossTraceCalcOhlc } from './calc.ts';
import { ohlc } from './index.ts';
import { ohlcSegments } from './plot.ts';

const DAY = 86_400_000;
const ROWS = [
  [1, 3, 0.5, 2],
  [2, 2.5, 1, 1.5],
  [1.5, 2, 1, 1.5],
  [1.5, 4, 1.5, 3.5],
] as const;
const DATES = { x: { type: 'date' as const } };

describe('ohlc defaults', () => {
  it('hides traces without all four prices and uses the shortest array', () => {
    const { fullData } = figure([
      { open: [1], high: [2], low: [0] },
      { open: [], high: [], low: [], close: [] },
      { x: [1, 2], open: [1, 2, 3], high: [2, 3, 4], low: [0, 1, 2], close: [1, 2, 3] },
    ]);
    expect(fullData.map((t) => t.visible)).toEqual([false, false, true]);
    expect(fullData[2]!['_length']).toBe(2);
  });

  it("follows Plotly's defaults: colors, widths and dashes per direction, tickwidth", () => {
    const [t] = figure([{ ...daily(ROWS), line: { width: 3, dash: 'dash' } }]).fullData;
    expect(t).toMatchObject({
      tickwidth: 0.3,
      increasing: { line: { color: 'rgb(61, 153, 112)', width: 3, dash: 'dash' } },
      decreasing: { line: { color: 'rgb(255, 65, 54)', width: 3, dash: 'dash' } },
      hoverlabel: { split: false },
      zorder: 0,
    });
    expect(t).not.toHaveProperty('xperiod0');
    const [p] = figure([{ ...daily(ROWS), xperiod: DAY }]).fullData;
    expect(p).toMatchObject({ xperiod: DAY, xperiodalignment: 'middle' });
  });

  it('turns the range slider on for its x axis by default', () => {
    const { fullLayout } = figure([{ ...daily(ROWS), xaxis: 'x2' }, { ...daily(ROWS) }]);
    expect(fullLayout['xaxis2']).toMatchObject({ rangeslider: { visible: true } });
    expect(fullLayout.xaxis).toMatchObject({ rangeslider: { visible: true } });
    const off = figure([daily(ROWS)], { xaxis: { rangeslider: { visible: false } } });
    expect(off.fullLayout.xaxis).toMatchObject({ rangeslider: { visible: false } });
  });

  it('ignores hovertemplate for split labels', () => {
    const [t] = figure([
      { ...daily(ROWS), hovertemplate: '%{open}', hoverlabel: { split: true } },
    ]).fullData;
    expect(t!['hovertemplate']).toBe('');
  });

  it("keeps Plotly's colors with the plotly-classic template", () => {
    const [t] = figure([daily(ROWS)], { template: plotlyClassicTemplate }).fullData;
    expect(t).toMatchObject({
      line: { width: 2 },
      increasing: { line: { color: 'rgb(61, 153, 112)' } },
      decreasing: { line: { color: 'rgb(255, 65, 54)' } },
    });
  });

  it("uses the default look's colors and thin lines", () => {
    const [t] = figure([daily(ROWS)], { template: holochartTemplate }).fullData;
    expect(t).toMatchObject({
      line: { width: 1 },
      increasing: { line: { color: 'rgb(17, 142, 54)', width: 1 } },
      decreasing: { line: { color: 'rgb(234, 42, 55)', width: 1 } },
    });
  });
});

describe('ohlc calc', () => {
  it('sizes ticks from the spacing: tickwidth × the smallest x difference', () => {
    const { calc } = calcOf({ ...daily(ROWS), tickwidth: 0.2 }, DATES);
    expect(calc.slot).toEqual({ dPos: DAY / 2, bPos: 0, halfWidth: 0.2 * DAY, wHover: DAY / 2 });
  });

  it('shares the smallest spacing across the ohlc traces of a subplot', () => {
    const a = calcOf({
      x: [0, 4, 8],
      open: [1, 1, 1],
      high: [2, 2, 2],
      low: [0, 0, 0],
      close: [2, 2, 2],
    });
    const b = calcOf({ x: [0, 1], open: [1, 1], high: [2, 2], low: [0, 0], close: [0, 0] });
    const entries: CrossTraceEntry<PriceCalc>[] = [
      { trace: a.trace, index: 0, calc: a.calc },
      { trace: b.trace, index: 1, calc: b.calc },
    ];
    expect(crossTraceCalcOhlc(entries)).toEqual([0]);
    expect(a.calc.slot.halfWidth).toBeCloseTo(0.3);
    expect(a.calc.slot.wHover).toBe(0.5);
    // Idempotent: nothing changes the second time.
    expect(crossTraceCalcOhlc(entries)).toEqual([]);
  });
});

describe('ohlc view', () => {
  it('draws three segments per bar, one line primitive per direction', () => {
    const s = calcOf(daily(ROWS), DATES);
    const segs = ohlcSegments(s.calc);
    expect([segs.up.count, segs.down.count]).toEqual([6, 6]);
    const t = s.calc.pos[0]!;
    const tick = 0.3 * DAY;
    // Open tick, low–high line, close tick.
    expect(Array.from(segs.up.x.subarray(0, 6))).toEqual([t - tick, t, t, t, t, t + tick]);
    expect(Array.from(segs.up.y.subarray(0, 6))).toEqual([1, 1, 3, 0.5, 2, 2]);

    const { ctx, added } = plotCtx(s.trace, s.calc, s.fullLayout);
    ohlc.plot!.create(ctx);
    expect(added).toHaveLength(2);
    expect(added.every((p) => p instanceof LinePrimitive)).toBe(true);
    // Only rising bars: one draw call.
    const up = calcOf(daily([ROWS[0], ROWS[3]]), DATES);
    const one = plotCtx(up.trace, up.calc, up.fullLayout);
    ohlc.plot!.create(one.ctx);
    expect(one.added).toHaveLength(1);
  });

  it('keeps two draw calls for any number of bars', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => {
      const o = 100 + Math.sin(i);
      return [o, o + 2, o - 2, o + Math.cos(i * 3)] as const;
    });
    const s = calcOf(daily(rows), DATES);
    const { ctx, added } = plotCtx(s.trace, s.calc, s.fullLayout);
    ohlc.plot!.create(ctx);
    expect(added).toHaveLength(2);
    const segments = added.reduce((n, p) => n + (p as LinePrimitive).instanceCount, 0);
    expect(segments).toBeGreaterThan(3 * 5000);
  });

  it('only sets the transform on zoom, and re-uploads colors only on restyle and selection', () => {
    const s = calcOf(daily(ROWS), DATES);
    const { ctx, added } = plotCtx(s.trace, s.calc, s.fullLayout);
    const view = ohlc.plot!.create(ctx);
    const lines = added as LinePrimitive[];
    const updates = lines.map((l) => vi.spyOn(l, 'update'));
    const transforms = lines.map((l) => vi.spyOn(l, 'setTransform'));
    const plan = { calc: false, plot: false, style: false, transform: true };
    view.update({ ...ctx, transform: { ...ctx.transform, scaleX: 2 } }, plan);
    expect(updates.every((u) => u.mock.calls.length === 0)).toBe(true);
    expect(transforms.every((t) => t.mock.calls.length === 1)).toBe(true);

    view.update({ ...ctx, selectedPoints: [0] }, { ...plan, transform: false, selection: true });
    const patch = updates[0]!.mock.calls[0]![0];
    expect(Object.keys(patch).sort()).toEqual(['color', 'dash', 'opacity', 'width']);
    // Rising bars: the first is selected, the last is dimmed (Plotly's 0.3 opacity).
    const color = patch.color as Float32Array;
    expect(color[3]).toBe(1);
    expect(color[color.length - 1]).toBeCloseTo(0.3);
  });
});
