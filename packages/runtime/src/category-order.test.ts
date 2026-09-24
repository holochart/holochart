// @vitest-environment jsdom
import type { FullTrace } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import type { TraceModule } from './contracts.ts';
import {
  createDotsModule,
  createLog,
  setup,
  type CallLog,
  type DotsCalc,
} from './__testing__/fakes.ts';
import { createChartRegistry } from './registry.ts';

/**
 * Value-based `categoryorder`s through the pipeline (E3.6): the test `dots` module reports its
 * points as category samples (index on the category axis, the other coordinate as value, like
 * scatter), has a recorded `crossTraceCalc`, and a `calcAppend` that records its calls.
 */
function catSetup() {
  const base = setup({ width: 640, height: 400 });
  const log: CallLog = createLog();
  const appendCalls: number[] = [];
  const dots = createDotsModule(log, { cross: true });
  const module: TraceModule<DotsCalc> = {
    ...dots,
    type: 'cats',
    supplyDefaults(input, out: FullTrace, ctx) {
      dots.supplyDefaults(input, out, ctx);
      const x = out['x'] as ArrayLike<unknown> | undefined;
      const y = out['y'] as ArrayLike<unknown> | undefined;
      out['_length'] = Math.min(x?.length ?? 0, y?.length ?? 0);
    },
    categoryValues(calc, _trace, axis) {
      return axis === 'x' ? { index: calc.x, value: calc.y } : { index: calc.y, value: calc.x };
    },
    calcAppend(_prev, trace, ctx) {
      appendCalls.push(ctx.index);
      return {
        x: ctx.xaxis!.scale.d2lArray(Array.from(trace['x'] as ArrayLike<unknown>)),
        y: ctx.yaxis!.scale.d2lArray(Array.from(trace['y'] as ArrayLike<unknown>)),
      };
    },
  };
  const registry = createChartRegistry().register(module);
  return { ...base, log, appendCalls, options: { ...base.options, registry } };
}

let s: ReturnType<typeof catSetup>;
let charts: Chart[] = [];

function chart(figure: Parameters<typeof createChart>[1]): Chart {
  const c = createChart(s.container, figure, s.options);
  charts.push(c);
  return c;
}

/** The category order of an axis, read back through its scale. */
function order(c: Chart, id: string, count: number): unknown[] {
  const scale = c.axes.get(id)!.scale;
  return Array.from({ length: count }, (_, i) => scale.l2d(i));
}

function positions(c: Chart, index: number, letter: 'x' | 'y'): number[] {
  return Array.from((c.getCalcdata(index) as DotsCalc)[letter]);
}

beforeEach(() => {
  s = catSetup();
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
});

describe('value-based categoryorder (E3.6)', () => {
  const data = [
    { type: 'cats', x: ['a', 'b', 'c'], y: [1, 5, 3] },
    { type: 'cats', x: ['c', 'a'], y: [4, NaN] },
  ];

  it('sorts by the per-category total after calc, then calcs again on the new order', async () => {
    const c = chart({ data, layout: { xaxis: { categoryorder: 'total descending' } } });
    await c.ready;
    // Totals: a 1 (NaN skipped), b 5, c 7.
    expect(order(c, 'x', 3)).toEqual(['c', 'b', 'a']);
    expect(positions(c, 0, 'x')).toEqual([2, 1, 0]);
    expect(positions(c, 1, 'x')).toEqual([0, 2]);
    // Second calc and cross-trace pass, like Plotly's.
    expect(s.log.calc).toEqual([0, 1, 0, 1]);
    expect(s.log.cross).toEqual([
      [0, 1],
      [0, 1],
    ]);
    expect(c.fullLayout?.['xaxis']).toMatchObject({ type: 'category' });
  });

  it('ignores categoryarray and needs no second pass when trace order already fits', async () => {
    const c = chart({
      data,
      layout: { xaxis: { categoryorder: 'min ascending', categoryarray: ['c', 'b', 'a'] } },
    });
    await c.ready;
    // Minimums: a 1, b 5, c 3.
    expect(order(c, 'x', 3)).toEqual(['a', 'c', 'b']);
    const d = chart({ data, layout: { xaxis: { categoryorder: 'mean ascending' } } });
    await d.ready;
    // Means: a 1, b 5, c 3.5 — same order again.
    expect(order(d, 'x', 3)).toEqual(['a', 'c', 'b']);
    const e = chart({ data: [data[0]!], layout: { xaxis: { categoryorder: 'max ascending' } } });
    await e.ready;
    expect(order(e, 'x', 3)).toEqual(['a', 'c', 'b']);
    const f = chart({
      data: [{ type: 'cats', x: ['a', 'b'], y: [1, 2] }],
      layout: { xaxis: { categoryorder: 'sum ascending' } },
    });
    s.log.calc.length = 0;
    await f.ready;
    expect(s.log.calc).toEqual([0]);
  });

  it('orders y category axes by the x values (horizontal data)', async () => {
    const c = chart({
      data: [
        { type: 'cats', y: ['p', 'q', 'r'], x: [3, 1, 2] },
        { type: 'cats', y: ['p', 'q'], x: [3, 9] },
      ],
      layout: { yaxis: { categoryorder: 'median ascending' } },
    });
    await c.ready;
    // Medians: p 3, q 5, r 2.
    expect(order(c, 'y', 3)).toEqual(['r', 'p', 'q']);
    expect(positions(c, 0, 'y')).toEqual([1, 2, 0]);
  });

  it('keeps ties in trace order in both directions and skips legendonly traces', async () => {
    const c = chart({
      data: [
        { type: 'cats', x: ['a', 'b', 'c'], y: [2, 2, 1] },
        { type: 'cats', x: ['c'], y: [100], visible: 'legendonly' },
      ],
      layout: { xaxis: { categoryorder: 'total descending' } },
    });
    await c.ready;
    expect(order(c, 'x', 3)).toEqual(['a', 'b', 'c']);
    await c.relayout({ 'xaxis.categoryorder': 'total ascending' });
    expect(order(c, 'x', 3)).toEqual(['c', 'a', 'b']);
    await c.restyle({ visible: true }, [1]);
    expect(order(c, 'x', 3)).toEqual(['a', 'b', 'c']);
  });

  it('aggregates over every subplot that shares the axis', async () => {
    const c = chart({
      data: [
        { type: 'cats', x: ['a', 'b'], y: [1, 2] },
        { type: 'cats', x: ['a', 'b'], y: [5, 1], yaxis: 'y2' },
      ],
      layout: {
        xaxis: { categoryorder: 'total descending' },
        yaxis: { domain: [0, 0.45] },
        yaxis2: { domain: [0.55, 1] },
      },
    });
    await c.ready;
    // Totals: a 6, b 3.
    expect(order(c, 'x', 2)).toEqual(['a', 'b']);
    await c.restyle({ y: [[1, 20]] }, [1]);
    expect(order(c, 'x', 2)).toEqual(['b', 'a']);
    expect(positions(c, 0, 'x')).toEqual([1, 0]);
    expect(positions(c, 1, 'x')).toEqual([1, 0]);
  });

  it('reorders after restyle and relayout, and back to trace order', async () => {
    const c = chart({ data, layout: { xaxis: { categoryorder: 'total descending' } } });
    await c.ready;
    // Data edit that keeps the order: one calc of the edited trace, no second pass.
    s.log.calc.length = 0;
    await c.restyle({ y: [[1, 6, 3]] }, [0]);
    expect(order(c, 'x', 3)).toEqual(['c', 'b', 'a']);
    expect(s.log.calc).toEqual([0]);
    // Now b wins: every trace on the axis calcs again on the new order.
    s.log.calc.length = 0;
    await c.restyle({ y: [[1, 9, 3]] }, [0]);
    expect(order(c, 'x', 3)).toEqual(['b', 'c', 'a']);
    expect(s.log.calc).toEqual([0, 0, 1]);
    expect(positions(c, 1, 'x')).toEqual([1, 2]);
    await c.relayout({ 'xaxis.categoryorder': 'trace' });
    expect(order(c, 'x', 3)).toEqual(['a', 'b', 'c']);
    expect(positions(c, 0, 'x')).toEqual([0, 1, 2]);
    await c.relayout({ 'xaxis.categoryorder': 'total ascending' });
    expect(order(c, 'x', 3)).toEqual(['a', 'c', 'b']);
    await c.relayout({ 'xaxis.categoryorder': 'max descending' });
    // Maxima: a 1, b 9, c 4.
    expect(order(c, 'x', 3)).toEqual(['b', 'c', 'a']);
  });

  it('reorders on streaming appends, falling back to a full calc when the order changes', async () => {
    const c = chart({
      data: [{ type: 'cats', x: ['a', 'b'], y: [5, 3] }],
      layout: { xaxis: { categoryorder: 'total descending' } },
    });
    await c.ready;
    expect(order(c, 'x', 2)).toEqual(['a', 'b']);
    // Same order: the streaming calc stands.
    s.log.calc.length = 0;
    await c.extendTraces({ x: [['b']], y: [[1]] }, [0]);
    expect(s.appendCalls).toEqual([0]);
    expect(s.log.calc).toEqual([]);
    expect(positions(c, 0, 'x')).toEqual([0, 1, 1]);
    // b overtakes a: full calc on the new order.
    await c.extendTraces({ x: [['b']], y: [[4]] }, [0]);
    expect(s.appendCalls).toEqual([0, 0]);
    expect(s.log.calc).toEqual([0]);
    expect(order(c, 'x', 2)).toEqual(['b', 'a']);
    expect(positions(c, 0, 'x')).toEqual([1, 0, 0, 0]);
    // A new category rebuilds the scale anyway.
    await c.extendTraces({ x: [['z']], y: [[50]] }, [0]);
    expect(order(c, 'x', 3)).toEqual(['z', 'b', 'a']);
  });
});
