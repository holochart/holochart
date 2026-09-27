import { holochartTemplate } from '@mk7s/holochart-core';
import { LazyFillPrimitive, LinePrimitive, RectPrimitive } from '@mk7s/holochart-render';
import { STACK_GROUPS } from '@mk7s/holochart-runtime';
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { calcAll, calcOne, categories, figure, hoverCtx, plotCtx } from '../__testing__/bars.ts';
import { formatPercent } from '../bars/text.ts';
import type { FunnelCalc } from './calc.ts';
import { funnelHoverPoints } from './hover.ts';
import { funnel } from './index.ts';
import { funnelConnectors } from './plot.ts';
import { funnelBarTrace, funnelLabels } from './style.ts';

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

const STAGES = ['Visits', 'Sign-ups', 'Trials', 'Orders'];
const FUNNEL = { type: 'funnel', y: STAGES, x: [1200, 600, 300, 150] };
const AXES = { y: categories(STAGES), x: { range: [-800, 800] as [number, number] } };

function one(extra: Record<string, unknown> = {}, layout: Record<string, unknown> = {}) {
  const r = calcOne({ ...FUNNEL, ...extra }, AXES, layout);
  return { ...r, calc: r.calc as FunnelCalc };
}

describe('funnel defaults', () => {
  it("is horizontal with centered value labels, Plotly's connector fill and funnelmode stack", () => {
    const { fullData, fullLayout } = figure([FUNNEL, { ...FUNNEL, text: ['a', 'b', 'c', 'd'] }]);
    expect(fullData[0]).toMatchObject({
      orientation: 'h',
      textinfo: 'value',
      textposition: 'auto',
      insidetextanchor: 'middle',
      textangle: 0,
      marker: { color: 'rgb(31, 119, 180)', line: { color: 'rgb(68, 68, 68)', width: 0 } },
      connector: { visible: true, fillcolor: 'rgba(31, 119, 180, 0.5)', line: { width: 0 } },
    });
    expect(fullData[1]).toMatchObject({ textinfo: 'text+value' });
    expect(fullLayout).toMatchObject({ funnelmode: 'stack', funnelgap: 0.2, funnelgroupgap: 0 });
  });

  it('is vertical when only y is given; per-bar colors give a black half-opacity connector', () => {
    const { fullData } = figure([
      { type: 'funnel', y: [3, 2, 1] },
      { ...FUNNEL, marker: { color: ['red', 'blue', 'green', 'gold'] } },
    ]);
    expect(fullData[0]).toMatchObject({ orientation: 'v', x0: 0, dx: 1 });
    expect(fullData[1]).toMatchObject({ connector: { fillcolor: 'rgba(0, 0, 0, 0.5)' } });
  });

  it('hides the value axis and reverses the stage axis, unless other traces use them', () => {
    const h = figure([FUNNEL]).fullLayout;
    expect(h.xaxis?.visible).toBe(false);
    expect(h.yaxis).toMatchObject({ visible: true, autorange: 'reversed' });
    const v = figure([{ type: 'funnel', x: STAGES, y: [4, 3, 2, 1], orientation: 'v' }]).fullLayout;
    expect(v.xaxis).toMatchObject({ visible: true, autorange: true });
    expect(v.yaxis?.visible).toBe(false);
    const shared = figure([FUNNEL, { type: 'scatter', x: [1, 2], y: ['Visits', 'Orders'] }]);
    expect(shared.fullLayout.xaxis?.visible).toBe(true);
    expect(shared.fullLayout.yaxis?.autorange).toBe(true);
    // The user's choices win.
    const user = figure([FUNNEL], { xaxis: { visible: true }, yaxis: { range: [0, 3] } });
    expect(user.fullLayout.xaxis?.visible).toBe(true);
    expect(user.fullLayout.yaxis?.autorange).toBe(false);
  });

  it('keeps the default look borderless', () => {
    const [t] = figure([FUNNEL], { template: holochartTemplate }).fullData;
    expect(t).toMatchObject({ marker: { color: 'rgb(234, 42, 55)', line: { width: 0 } } });
  });
});

describe('funnel calc', () => {
  it('centers each bar on zero and computes the three percentages', () => {
    const { calc } = one({ x: [1200, 600, -1, 150] });
    expect([calc.s0[0], calc.s0[1], calc.s0[3]]).toEqual([-600, -300, -75]);
    expect(Array.from(calc.s1)).toEqual([600, 300, NaN, 75]);
    expect(Array.from(calc.percentInitial)).toEqual([1, 0.5, 0, 0.125]);
    expect(Array.from(calc.percentPrevious)).toEqual([1, 0.5, NaN, 0.25]);
    expect(Array.from(calc.percentTotal)).toEqual([1200 / 1950, 600 / 1950, NaN, 150 / 1950]);
    // No connector to or from the missing stage.
    expect(Array.from(calc.connectNext)).toEqual([1, 0, 0, 0]);
  });

  it('stacks the traces of a stage and centers the stack (funnelmode stack)', () => {
    const { calcs } = calcAll([FUNNEL, { ...FUNNEL, x: [800, 400, 100, 50] }], AXES);
    const [a, b] = calcs as FunnelCalc[];
    expect(Array.from(a!.s0)).toEqual([-1000, -500, -200, -100]);
    expect(Array.from(a!.s1)).toEqual([200, 100, 100, 50]);
    expect(Array.from(b!.s0)).toEqual([200, 100, 100, 50]);
    expect(Array.from(b!.s1)).toEqual([1000, 500, 200, 100]);
    expect(a!.bars.center[1]).toBe(1);
    expect(b!.bars.center[1]).toBe(1);
    // The size axis covers every stack end, from zero.
    expect(a!.bars.tozero).toBe(true);
    expect(Array.from(a!.bars.sizePoints)).toContain(-1000);
  });

  it('stacks are centered whatever the values (property)', () => {
    const values = fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 3, maxLength: 3 });
    fc.assert(
      fc.property(fc.array(values, { minLength: 1, maxLength: 4 }), (traces) => {
        const { calcs } = calcAll(
          traces.map((x) => ({ type: 'funnel', y: ['a', 'b', 'c'], x })),
          { y: categories(['a', 'b', 'c']), x: { range: [-5000, 5000] } },
        );
        for (let i = 0; i < 3; i++) {
          const ends = (calcs as FunnelCalc[]).flatMap((c) => [c.s0[i]!, c.s1[i]!]);
          expect(Math.min(...ends) + Math.max(...ends)).toBeCloseTo(0);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('groups traces side by side in group mode, each bar centered on zero', () => {
    const { calcs } = calcAll([FUNNEL, { ...FUNNEL, x: [800, 400, 100, 50] }], AXES, {
      funnelmode: 'group',
      funnelgap: 0.5,
    });
    const [a, b] = calcs as FunnelCalc[];
    expect(a!.bars.width[0]).toBeCloseTo(0.25);
    expect(a!.bars.center[0]).toBeCloseTo(-0.125);
    expect(b!.bars.center[0]).toBeCloseTo(0.125);
    expect(Array.from(b!.s0)).toEqual([-400, -200, -50, -25]);
  });

  it('lays out on its own, never with bars or waterfalls', () => {
    expect(funnel.categories.some((c) => STACK_GROUPS.has(c))).toBe(false);
  });
});

describe('funnel connectors', () => {
  it("are trapezoids from each bar's far edge to the next bar's near edge", () => {
    const { calc } = one();
    const r = funnelConnectors(calc);
    expect(r.rings).toEqual([0, 4, 8]);
    // Stage 0 (y = 0, x ±600) to stage 1 (y = 1, x ±300), bars 0.8 wide.
    expect(Array.from(r.x.subarray(0, 4))).toEqual([-600, -300, 300, 600]);
    expect(Array.from(r.y.subarray(0, 4))).toEqual(
      [0.4, 0.6, 0.6, 0.4].map((v) => expect.closeTo(v)),
    );
    // Their two slanted sides.
    expect(r.lines.count).toBe(6);
    expect(Array.from(r.lines.x.subarray(0, 2))).toEqual([-600, -300]);
  });

  it('are skipped around missing stages, and run along x for vertical funnels', () => {
    expect(funnelConnectors(one({ x: [1, null, 3, 4] }).calc).rings).toEqual([0]);
    const r = calcOne(
      { type: 'funnel', x: STAGES, y: [4, 2, 1, 1], orientation: 'v' },
      { x: categories(STAGES), y: { range: [-5, 5] } },
    );
    const v = funnelConnectors(r.calc as FunnelCalc);
    expect(Array.from(v.x.subarray(0, 4))).toEqual(
      [0.4, 0.6, 0.6, 0.4].map((x) => expect.closeTo(x)),
    );
    expect(Array.from(v.y.subarray(0, 4))).toEqual([-2, -1, 1, 2]);
  });
});

describe('funnel labels', () => {
  it('formats percentages like Plotly', () => {
    expect(formatPercent(0.3125)).toBe('31%');
    expect(formatPercent(0.3125, 1)).toBe('31.3%');
    expect(formatPercent(1, 1)).toBe('100%');
    expect(formatPercent(0.5, 2)).toBe('50%');
  });

  it('shows the value by default and suffixes several percentages', () => {
    const s = one();
    expect(funnelLabels(s.trace, s.calc, s.xaxis, s.yaxis)).toEqual(['1200', '600', '300', '150']);
    const t = { ...s.trace, textinfo: 'label+value+percent initial+percent previous' };
    expect(funnelLabels(t, s.calc, s.xaxis, s.yaxis)[2]).toBe(
      'Trials<br>300<br>25% of initial<br>50% of previous',
    );
    const p = { ...s.trace, textinfo: 'percent total' };
    expect(funnelLabels(p, s.calc, s.xaxis, s.yaxis)[0]).toBe('53%');
  });

  it('fills texttemplate with the value and percentages', () => {
    const s = one({ texttemplate: '%{label}: %{value} (%{percentPrevious}, %{percentTotal:.1%})' });
    expect(funnelLabels(s.trace, s.calc, s.xaxis, s.yaxis)[1]).toBe('Sign-ups: 600 (50%, 26.7%)');
  });

  it("hands bar the trace's marker and the labels", () => {
    const s = one({ marker: { color: ['red', 'blue', 'green', 'gold'] } });
    const b = funnelBarTrace(s.trace, s.calc, s.xaxis, s.yaxis);
    expect(b['marker']).toMatchObject({
      color: s.trace['marker']!['color' as never],
      cornerradius: 0,
    });
    expect(b['text']).toEqual(['1200', '600', '300', '150']);
  });
});

describe('funnel view', () => {
  it('draws connector regions under the bars, and edge lines only with a width', () => {
    const s = one();
    const { ctx, added } = plotCtx(s.trace, s.calc, s.fullLayout, {
      xaxis: s.xaxis,
      yaxis: s.yaxis,
    });
    const view = funnel.plot!.create(ctx);
    const rects = added.find((p) => p instanceof RectPrimitive) as RectPrimitive;
    const fill = added.find((p) => p instanceof LazyFillPrimitive) as LazyFillPrimitive;
    expect(rects.instanceCount).toBe(4);
    expect(fill.object.renderOrder).toBeLessThan(rects.object.renderOrder);
    expect(added.some((p) => p instanceof LinePrimitive)).toBe(false);
    const connector = { ...(s.trace['connector'] as object), line: { width: 1, color: 'red' } };
    view.update(
      { ...ctx, trace: { ...s.trace, connector } },
      { calc: false, plot: true, style: true, transform: false },
    );
    expect(added.some((p) => p instanceof LinePrimitive)).toBe(true);
    view.update(
      { ...ctx, trace: { ...s.trace, connector: { visible: false } } },
      { calc: false, plot: true, style: true, transform: false },
    );
    expect(added.some((p) => p instanceof LazyFillPrimitive || p instanceof LinePrimitive)).toBe(
      false,
    );
  });
});

describe('funnel hover', () => {
  it('reports the value with the three percentage lines', () => {
    const s = one();
    const [p] = funnelHoverPoints(
      s.calc,
      s.trace,
      { px: 0, py: 10, xl: 0, yl: 1, mode: 'closest', distance: 20 },
      hoverCtx(s),
    );
    expect(p).toMatchObject({
      pointIndex: 1,
      x: 600,
      extraText: '50% of initial<br>50% of previous<br>26.7% of total',
      labels: { percentInitial: '50%', percentPrevious: '50%', percentTotal: '26.7%' },
      fields: { percentInitial: 0.5 },
    });
    const only = { ...s.trace, hoverinfo: 'y+percent total' };
    expect(
      funnelHoverPoints(
        s.calc,
        only,
        { px: 0, py: 10, xl: 0, yl: 1, mode: 'closest', distance: 20 },
        hoverCtx(s),
      )[0]!.extraText,
    ).toBe('26.7% of total');
  });
});
