import { holochartTemplate, HOLOCHART_COLORWAY } from '@mk7s/holochart-core';
import { LinePrimitive, RectPrimitive } from '@mk7s/holochart-render';
import { STACK_GROUPS } from '@mk7s/holochart-runtime';
import { bar } from '@mk7s/holochart-traces-basic';
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { calcAll, calcOne, categories, figure, hoverCtx, plotCtx } from '../__testing__/bars.ts';
import { waterfallValues, type WaterfallCalc } from './calc.ts';
import { waterfallHoverPoints } from './hover.ts';
import { waterfall } from './index.ts';
import { waterfallConnectors } from './plot.ts';
import { waterfallBarTrace, waterfallLabels, waterfallLegendIcon } from './style.ts';

// troika typesets in a worker with browser globals; the view tests only need its object graph.
// Mocked by path, like bar's and pie's tests: traces-finance does not depend on troika, render does.
vi.mock('../../../render/node_modules/troika-three-text', async () => {
  const { Object3D } = await import('three');
  type Node = InstanceType<typeof Object3D>;
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

const STAGES = ['Sales', 'Consulting', 'Costs', 'Taxes', 'Net'];
const PNL = {
  type: 'waterfall',
  x: STAGES,
  y: [60, 20, -40, -10, null],
  measure: ['relative', 'relative', 'relative', 'relative', 'total'],
};
const AXES = { x: categories(STAGES), y: { range: [-10, 100] as [number, number] } };

function pnl(extra: Record<string, unknown> = {}, layout: Record<string, unknown> = {}) {
  const r = calcOne({ ...PNL, ...extra }, AXES, layout);
  return { ...r, calc: r.calc as WaterfallCalc };
}

describe('waterfall defaults', () => {
  it("uses Plotly's direction colors, a 2 px connector and no textinfo without a request", () => {
    const { fullData, fullLayout } = figure([PNL]);
    const t = fullData[0]!;
    expect(t).toMatchObject({
      orientation: 'v',
      increasing: { marker: { color: 'rgb(61, 153, 112)', line: { width: 0 } } },
      decreasing: { marker: { color: 'rgb(255, 65, 54)' } },
      totals: { marker: { color: 'rgb(68, 153, 255)' } },
      connector: { visible: true, mode: 'between', line: { width: 2, dash: 'solid' } },
      textposition: 'auto',
      texttemplate: '',
    });
    expect(t['textinfo']).toBeUndefined();
    expect(fullLayout).toMatchObject({
      waterfallmode: 'group',
      waterfallgap: 0.2,
      waterfallgroupgap: 0,
    });
    // Layout attributes of bar-like types are only there with such a trace.
    expect(fullLayout['barmode']).toBeUndefined();
  });

  it('is horizontal when only x is given, and hides without data', () => {
    const { fullData } = figure([{ x: [1, 2] }, { y: [] }, { x: [1], textinfo: 'delta' }]);
    expect(fullData[0]).toMatchObject({ orientation: 'h', y0: 0, dy: 1, _length: 2 });
    expect(fullData[1]!.visible).toBe(false);
    expect(fullData[2]).toMatchObject({ textinfo: 'delta' });
    const { fullData: none } = figure([{ x: [1], textposition: 'none', textinfo: 'delta' }]);
    expect(none[0]!['textinfo']).toBeUndefined();
  });

  it('skips the connector line style when it is hidden or zero-width', () => {
    const { fullData } = figure([
      { ...PNL, connector: { visible: false, line: { color: 'red' } } },
      { ...PNL, connector: { line: { width: 0, color: 'red' } } },
    ]);
    expect(fullData[0]!['connector']).toEqual({ visible: false });
    expect(fullData[1]!['connector']).toEqual({
      visible: true,
      mode: 'between',
      line: { width: 0 },
    });
  });

  it("the default look's colors: emerald, red and blue from the colorway, a gray 1 px connector", () => {
    const [t] = figure([PNL], { template: holochartTemplate }).fullData;
    const rgb = (hex: string): string =>
      `rgb(${[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(', ')})`;
    expect(t).toMatchObject({
      increasing: { marker: { color: rgb(HOLOCHART_COLORWAY[3]) } },
      decreasing: { marker: { color: rgb(HOLOCHART_COLORWAY[0]) } },
      totals: { marker: { color: rgb(HOLOCHART_COLORWAY[1]) } },
      connector: { line: { width: 1 } },
    });
  });
});

describe('waterfall calc', () => {
  it('keeps a running total: relative changes, totals and directions', () => {
    const { calc } = pnl();
    expect(Array.from(calc.size)).toEqual([60, 80, 40, 30, 30]);
    expect(Array.from(calc.final)).toEqual([60, 80, 40, 30, 30]);
    expect(Array.from(calc.direction)).toEqual([0, 0, 1, 1, 2]);
    expect(Array.from(calc.isSum)).toEqual([0, 0, 0, 0, 1]);
    expect(calc.hasTotals).toBe(true);
    // Relative bars start where the previous one ended; the total starts at the base.
    expect(Array.from(calc.s0)).toEqual([0, 60, 80, 40, 0]);
    expect(Array.from(calc.s1)).toEqual([60, 80, 40, 30, 30]);
  });

  it('resets the total with absolute measures and shifts everything by base', () => {
    const { calc } = pnl({
      y: [100, -30, 50, 20, 0],
      measure: ['absolute', 'r', 'a', 'relative', 't'],
      base: 1000,
    });
    expect(Array.from(calc.final)).toEqual([1100, 1070, 1050, 1070, 1070]);
    expect(Array.from(calc.s0)).toEqual([1000, 1100, 1000, 1050, 1000]);
    expect(Array.from(calc.s1)).toEqual([1100, 1070, 1050, 1070, 1070]);
    expect(Array.from(calc.direction)).toEqual([2, 1, 2, 0, 2]);
    // initial / delta / final (Plotly's `calcTexttemplate`).
    expect(waterfallValues(calc, 1)).toEqual({ initial: 1100, delta: -30, final: 1070 });
    expect(waterfallValues(calc, 2)).toEqual({ initial: 1000, delta: 50, final: 1050 });
    // A total without a value: its change is the running total.
    expect(waterfallValues(calc, 4)).toEqual({ initial: 1000, delta: 70, final: 1070 });
  });

  it('counts missing values as 0 and does not connect across them', () => {
    const { calc } = pnl({ y: [10, null, 5, 2, null], measure: [] });
    expect(Array.from(calc.size)).toEqual([10, 10, 15, 17, 17]);
    expect(Array.from(calc.direction)).toEqual([0, 0, 0, 0, 0]);
    expect(Array.from(calc.connectNext)).toEqual([0, 0, 1, 0, 0]);
    expect(calc.hasTotals).toBe(false);
  });

  it('the last bar ends at base + the running total since the last absolute (property)', () => {
    const measure = fc.constantFrom('relative', 'total', 'absolute');
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -50, max: 50 }), measure), {
          minLength: 1,
          maxLength: 12,
        }),
        fc.integer({ min: -100, max: 100 }),
        (rows, base) => {
          const x = rows.map((_, i) => `s${i}`);
          const r = calcOne(
            { x, y: rows.map((r) => r[0]), measure: rows.map((r) => r[1]), base },
            { x: categories(x), y: { range: [-500, 500] } },
          );
          const calc = r.calc as WaterfallCalc;
          let total = 0;
          rows.forEach(([v, m]) => {
            if (m === 'absolute') total = v;
            else if (m === 'relative') total += v;
          });
          const last = rows.length - 1;
          expect(calc.final[last]).toBe(base + total);
          expect(calc.s1[last]).toBe(base + total);
          // Every relative bar spans exactly its change.
          rows.forEach(([v, m], i) => {
            if (m === 'relative') expect(calc.s1[i]! - calc.s0[i]!).toBe(v);
          });
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('waterfall grouping', () => {
  const two = (layout: Record<string, unknown>) =>
    calcAll(
      [
        { ...PNL, name: 'a' },
        { ...PNL, name: 'b', y: [30, 10, -20, -5, null] },
      ],
      AXES,
      layout,
    ).calcs as WaterfallCalc[];

  it('groups traces side by side with waterfallgap and waterfallgroupgap', () => {
    const [a, b] = two({ waterfallgap: 0.4, waterfallgroupgap: 0.5 });
    // Group width 0.6, two slots of 0.3, bars 0.15 wide at their slot centers.
    expect(a!.bars.width[0]).toBeCloseTo(0.15);
    expect(a!.bars.center[0]).toBeCloseTo(-0.15);
    expect(b!.bars.center[0]).toBeCloseTo(0.15);
  });

  it('overlays traces in overlay mode, ignoring barmode', () => {
    const [a, b] = two({ waterfallmode: 'overlay', barmode: 'stack' });
    expect(a!.bars.center[2]).toBeCloseTo(2);
    expect(b!.bars.center[2]).toBeCloseTo(2);
    expect(a!.bars.width[2]).toBeCloseTo(0.8);
    // Each waterfall keeps its own running total (never stacked).
    expect(b!.s1[4]).toBe(15);
  });

  it('never shares slots with bars: its own cross-trace group, not bar-like stacking', () => {
    expect(waterfall.categories.some((c) => STACK_GROUPS.has(c))).toBe(false);
  });
});

describe('waterfall connectors', () => {
  it("between: from each bar's end to the next bar", () => {
    const { calc } = pnl();
    const s = waterfallConnectors(calc, 'between');
    expect(s.count).toBe(4);
    // Bar 0 ends at 60: a line at y = 60 from x = 0.4 to 0.6.
    expect(Array.from(s.x.subarray(0, 2))).toEqual([0.4, 0.6].map((v) => expect.closeTo(v)));
    expect(Array.from(s.y.subarray(0, 2))).toEqual([60, 60]);
    expect(Array.from(s.y.subarray(6, 8))).toEqual([30, 30]);
  });

  it('spanning: also across the bar ends and relative bar starts', () => {
    const { calc } = pnl();
    const s = waterfallConnectors(calc, 'spanning');
    // 4 between + bar ends (bars 0–3 and the total) + starts of relative bars 1–3.
    expect(s.count).toBe(4 + 5 + 3);
    const ys: number[] = [];
    for (let k = 0; k < s.count; k++) {
      expect(s.y[2 * k]).toBe(s.y[2 * k + 1]);
      ys.push(s.y[2 * k]!);
    }
    expect(ys).toEqual([60, 60, 60, 80, 80, 80, 40, 40, 40, 30, 30, 30]);
  });

  it('are vertical segments for horizontal waterfalls and stop at missing values', () => {
    const r = calcOne(
      { y: STAGES, x: [60, 20, null, 5, 1], orientation: 'h', measure: [] },
      { y: categories(STAGES), x: { range: [0, 100] } },
    );
    const s = waterfallConnectors(r.calc as WaterfallCalc, 'between');
    expect(s.count).toBe(2);
    expect(s.x[0]).toBe(60);
    expect(s.x[1]).toBe(60);
    expect(s.y[1]! - s.y[0]!).toBeCloseTo(0.2);
  });
});

describe('waterfall labels', () => {
  it('shows the textinfo parts, formatted like the axes', () => {
    const { calc, trace, xaxis, yaxis } = pnl({ textinfo: 'label+initial+delta+final' });
    const labels = waterfallLabels(trace, calc, xaxis, yaxis);
    expect(labels[2]).toBe('Costs<br>80<br>−40<br>40');
    expect(labels[4]).toBe('Net<br>0<br>30<br>30');
  });

  it('fills texttemplate with initial, delta, final, value and label', () => {
    const { calc, trace, xaxis, yaxis } = pnl({
      texttemplate: '%{label}: %{delta:+.1f} → %{final} (%{initial})',
      text: ['a', 'b', 'c', 'd', 'e'],
    });
    const labels = waterfallLabels(trace, calc, xaxis, yaxis);
    expect(labels[1]).toBe('Consulting: +20.0 → 80 (60)');
    const plain = waterfallLabels({ ...trace, texttemplate: '' }, calc, xaxis, yaxis);
    expect(plain).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('hands bar the direction colors and label strings, without a corner radius', () => {
    const { calc, trace, xaxis, yaxis } = pnl({
      increasing: { marker: { line: { width: 2, color: 'white' } } },
      textinfo: 'delta',
    });
    const b = waterfallBarTrace(trace, calc, xaxis, yaxis);
    const marker = b['marker'] as { color: string[]; line: { width: number[] }; cornerradius: 0 };
    expect(marker.color).toEqual([
      'rgb(61, 153, 112)',
      'rgb(61, 153, 112)',
      'rgb(255, 65, 54)',
      'rgb(255, 65, 54)',
      'rgb(68, 153, 255)',
    ]);
    expect(marker.line.width).toEqual([2, 2, 0, 0, 0]);
    expect(marker.cornerradius).toBe(0);
    expect(b['text']).toEqual(['60', '20', '−40', '−10', '30']);
    expect(b['texttemplate']).toBe('');
  });
});

describe('waterfall view', () => {
  it("draws bar's rects and labels plus one connector line primitive", () => {
    const s = pnl({ textinfo: 'final' });
    const create = vi.spyOn(bar.plot!, 'create');
    const { ctx, added } = plotCtx(s.trace, s.calc, s.fullLayout, {
      xaxis: s.xaxis,
      yaxis: s.yaxis,
    });
    const view = waterfall.plot!.create(ctx);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0].trace['text']).toEqual(['60', '80', '40', '30', '30']);
    create.mockRestore();
    const rects = added.find((p) => p instanceof RectPrimitive) as RectPrimitive;
    expect(rects.instanceCount).toBe(5);
    const lines = added.filter((p) => p instanceof LinePrimitive) as LinePrimitive[];
    expect(lines).toHaveLength(1);
    expect(lines[0]!.object.renderOrder).toBeGreaterThan(rects.object.renderOrder);
    // Hiding the connector removes it; a restyle re-uploads its colors only.
    view.update(
      { ...ctx, trace: { ...ctx.trace, connector: { visible: false } } },
      { calc: false, plot: true, style: true, transform: false },
    );
    expect(added.some((p) => p instanceof LinePrimitive)).toBe(false);
    view.update(ctx, { calc: false, plot: true, style: true, transform: false });
    const line = added.find((p) => p instanceof LinePrimitive) as LinePrimitive;
    const update = vi.spyOn(line, 'update');
    view.update(ctx, { calc: false, plot: false, style: true, transform: false });
    expect(Object.keys(update.mock.calls[0]![0]).sort()).toEqual([
      'color',
      'dash',
      'opacity',
      'width',
    ]);
  });
});

describe('waterfall hover', () => {
  it('reports the running total, with the change and initial value for relative bars', () => {
    const s = pnl();
    const ctx = hoverCtx(s);
    const [p] = waterfallHoverPoints(
      s.calc,
      s.trace,
      { px: 20, py: 600, xl: 2, yl: 60, mode: 'closest', distance: 20 },
      ctx,
    );
    expect(p).toMatchObject({
      pointIndex: 2,
      y: 40,
      color: 'rgb(255, 65, 54)',
      extraText: '(40) ▼<br>Initial: 80',
      labels: { initial: '80', delta: '(40)', final: '40' },
      fields: { initial: 80, delta: -40, final: 40 },
    });
    // Anchored at the bar end.
    expect(p!.py).toBeCloseTo(400);
  });

  it('shows only the value line for sum bars, and the final value when the value is hidden', () => {
    const s = pnl();
    const ctx = hoverCtx(s);
    const at = (i: number, trace = s.trace) =>
      waterfallHoverPoints(
        s.calc,
        trace,
        { px: i * 10, py: 100, xl: i, yl: 10, mode: 'closest', distance: 20 },
        ctx,
      )[0];
    expect(at(4)!.extraText).toBeUndefined();
    expect(at(4)!.fields).toMatchObject({ initial: 0, delta: 30, final: 30 });
    expect(at(0, { ...s.trace, hoverinfo: 'x+final+delta' })!.extraText).toBe('60<br>60 ▲');
    expect(at(0, { ...s.trace, hoverinfo: 'x+y' })!.extraText).toBeUndefined();
  });
});

describe('waterfall legend', () => {
  it('shows each direction side by side, with the sum style when the trace has totals', () => {
    const [withTotals] = figure([PNL]).fullData;
    const g = waterfallLegendIcon(withTotals!);
    expect(g.kind).toBe('parts');
    expect(g.parts!.map((p) => ('rect' in p ? p.color : ''))).toEqual([
      'rgb(61, 153, 112)',
      'rgb(68, 153, 255)',
      'rgb(255, 65, 54)',
    ]);
    const [plain] = figure([{ ...PNL, measure: [] }]).fullData;
    expect(waterfallLegendIcon(plain!).parts).toHaveLength(2);
  });
});

describe('waterfall description', () => {
  it('summarizes the final value and lists changes and totals', () => {
    const s = pnl();
    const d = waterfall.describe!({
      trace: s.trace,
      calc: s.calc,
      index: 0,
      fullLayout: s.fullLayout,
      xaxis: s.xaxis,
      yaxis: s.yaxis,
      maxRows: 3,
    });
    expect(d!.summary).toBe('Waterfall "trace 0": 5 bars. Final value 30.');
    expect(d!.table!.rows).toEqual([
      ['Sales', '60', '60'],
      ['Consulting', '20', '80'],
      ['Costs', '−40', '40'],
    ]);
    // Every bar on demand, past maxRows (the visible data table, E17.3).
    expect(d!.table!.total).toBe(5);
    expect(d!.table!.row?.(0)).toEqual(d!.table!.rows[0]);
    expect(d!.table!.row?.(3)).toEqual(['Taxes', '−10', '30']);
  });
});
