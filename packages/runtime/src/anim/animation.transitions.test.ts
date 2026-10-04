// @vitest-environment jsdom
import { attr, type FullTrace } from '@mk7s/holochart-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { linearExtremes } from '../axes.ts';
import { createChart, type Chart } from '../chart.ts';
import type { ComponentModule, TraceModule } from '../contracts.ts';
import { setup, type TestSetup } from '../__testing__/fakes.ts';

/**
 * Transitions of `react` in situations around the plain case (`animate.test.ts`): traces added,
 * removed or failing while one runs, axes whose positions cannot interpolate, and what `ordering`
 * leaves alone. Same setup as there: a `blobs` trace whose view records what it draws, and the
 * manual scheduler (16 ms per step).
 */
const blobsSchema = attr.object({
  x: attr.dataArray({ editType: 'calc' }),
  y: attr.dataArray({ editType: 'calc' }),
  symbol: attr.string({ dflt: 'circle', editType: 'calc' }),
  marker: attr.object({
    size: attr.number({ min: 0, dflt: 6, arrayOk: true, editType: 'calc' }),
  }),
});

interface Drawn {
  readonly x: unknown;
  readonly y: unknown;
}

function blobsModule(drawn: Drawn[][]): TraceModule<{ x: Float64Array; y: Float64Array }> {
  const record = (index: number, trace: FullTrace): void => {
    (drawn[index] ??= []).push({ x: trace['x'], y: trace['y'] });
  };
  return {
    type: 'blobs',
    categories: ['cartesian'],
    schema: blobsSchema,
    meta: { description: 'Test blobs.' },
    animatable: ['x', 'y', 'marker.size'],
    supplyDefaults(_in, out: FullTrace, ctx) {
      ctx.coerce('x');
      ctx.coerce('y');
      ctx.coerce('symbol');
      ctx.coerce('marker.size');
      const x = out['x'] as ArrayLike<unknown> | undefined;
      out['_length'] = x?.length ?? 0;
    },
    calc(trace, ctx) {
      // A trace this module cannot compute: the pipeline run fails.
      if (trace['symbol'] === 'broken') throw new Error('blobs: cannot calc a broken trace');
      return {
        x: ctx.xaxis!.scale.d2lArray((trace['x'] as ArrayLike<unknown>) ?? []),
        y: ctx.yaxis!.scale.d2lArray((trace['y'] as ArrayLike<unknown>) ?? []),
      };
    },
    extremes(calc) {
      return { x: linearExtremes(calc.x, 0), y: linearExtremes(calc.y, 0) };
    },
    plot: {
      create(ctx) {
        record(ctx.index, ctx.trace);
        return { update: (c) => record(c.index, c.trace) };
      },
    },
  };
}

let t: TestSetup;
let chart: Chart | undefined;
let drawn: Drawn[][];

beforeAll(async () => {
  // Have the lazily loaded animation code in the module cache.
  await import('./animation.ts');
});

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  drawn = [];
  t.registry.register(blobsModule(drawn));
});

afterEach(() => {
  chart?.destroy();
  chart = undefined;
  t.container.remove();
  vi.restoreAllMocks();
});

async function make(figure: Parameters<typeof createChart>[1]): Promise<Chart> {
  chart = createChart(t.container, figure, t.options);
  await chart.ready;
  return chart;
}

/** Let promises and microtasks settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

/** Advance `n` animation frames of 16 ms, letting each frame's pipeline run. */
async function steps(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    t.scheduler.step();
    await flush();
  }
}

function last(trace = 0): Drawn {
  const list = drawn[trace] ?? [];
  return list[list.length - 1] as Drawn;
}

const y = (trace = 0): number[] => Array.from(last(trace).y as ArrayLike<number>);

const TRANSITION_EVENTS = ['transitioning', 'transitioned', 'transitioninterrupted'] as const;

function events(c: Chart): string[] {
  const out: string[] = [];
  for (const name of TRANSITION_EVENTS) c.on(name, () => out.push(name));
  return out;
}

/** 160 ms, linear: 5 steps (80 ms) are halfway. */
const TRANSITION = { duration: 160, easing: 'linear' as const };
const X = [0, 1, 2];
const blob = (values: number[], extra: Record<string, unknown> = {}) => ({
  type: 'blobs',
  x: X,
  y: values,
  ...extra,
});
const layout = (extra: Record<string, unknown> = {}) => ({
  transition: TRANSITION,
  yaxis: { range: [0, 10] },
  ...extra,
});

describe('transitions while the traces of the chart change (E7.3)', () => {
  it('animates a trace from its old values when react puts a new trace in front of it', async () => {
    const c = await make({ data: [blob([1, 2, 3], { uid: 'old' })], layout: layout() });
    const done = c.react({
      data: [blob([9, 9, 9], { uid: 'new' }), blob([5, 6, 7], { uid: 'old' })],
      layout: layout(),
    });
    await flush();
    // The new trace is drawn as given; the old one, now second, starts where it was.
    expect(last(0).y).toEqual([9, 9, 9]);
    expect(y(1)).toEqual([1, 2, 3]);
    await steps(5);
    expect(last(0).y).toEqual([9, 9, 9]);
    expect(y(1)).toEqual([3, 4, 5]);
    await steps(6);
    await done;
    expect(last(1).y).toEqual([5, 6, 7]);
    expect(c.data).toEqual([blob([9, 9, 9], { uid: 'new' }), blob([5, 6, 7], { uid: 'old' })]);
  });

  it('stops animating a trace that is deleted meanwhile, and finishes the others', async () => {
    const c = await make({ data: [blob([0, 0, 0]), blob([1, 2, 3])], layout: layout() });
    const log = events(c);
    const done = c.react({ data: [blob([8, 8, 8]), blob([5, 6, 7])], layout: layout() });
    await flush();
    await steps(3);
    await c.deleteTraces(0);
    await steps(2);
    // Halfway (80 ms): the remaining trace, now the first, is still on its way.
    expect(c.data).toHaveLength(1);
    expect(y(0)).toEqual([3, 4, 5]);
    await steps(6);
    await done;
    expect(c.data).toEqual([blob([5, 6, 7])]);
    expect(last(0).y).toEqual([5, 6, 7]);
    expect(log).toEqual(['transitioning', 'transitioned']);
  });

  it('keeps animating an axis range when a trace is added meanwhile', async () => {
    const figure = (range: number[]) => ({
      data: [blob([1, 2, 3])],
      layout: layout({ yaxis: { range } }),
    });
    const c = await make(figure([0, 10]));
    const done = c.react(figure([0, 20]));
    await flush();
    await steps(3);
    await c.addTraces(blob([4, 4, 4]), 0);
    await steps(2);
    expect(c.fullLayout!['yaxis']).toMatchObject({ range: [0, 15] });
    await steps(6);
    await done;
    expect(c.fullLayout!['yaxis']).toMatchObject({ range: [0, 20] });
    expect(c.layout['yaxis']).toEqual({ range: [0, 20] });
  });

  it('draws a trace that was hidden as given: there is nothing to animate from', async () => {
    const c = await make({
      data: [blob([1, 2, 3], { visible: 'legendonly' })],
      layout: layout(),
    });
    const log = events(c);
    await c.react({ data: [blob([5, 6, 7], { visible: true })], layout: layout() });
    expect(last().y).toEqual([5, 6, 7]);
    expect(log).toEqual([]);
  });

  it('takes the figure as it is, without events or a redraw, when nothing changed', async () => {
    const figure = { data: [blob([1, 2, 3])], layout: layout() };
    const c = await make(figure);
    const log = events(c);
    const draws = drawn[0]!.length;
    await expect(c.react(figure)).resolves.toBe(c);
    await steps(2);
    expect(log).toEqual([]);
    expect(drawn[0]).toHaveLength(draws);
  });
});

describe('transitions: what cannot interpolate (E7.3)', () => {
  it('snaps positions on a category axis, numbers included, while values animate', async () => {
    // Numbers on a category axis are category names: 15 is not between 10 and 20.
    const figure = (x: number[], values: number[]) => ({
      data: [{ type: 'blobs', x, y: values }],
      layout: layout({ xaxis: { type: 'category' } }),
    });
    const c = await make(figure([10, 20, 30], [1, 2, 3]));
    const done = c.react(figure([30, 10, 20], [5, 6, 7]));
    await flush();
    expect(last().x).toEqual([30, 10, 20]);
    expect(y()).toEqual([1, 2, 3]);
    await steps(5);
    expect(last().x).toEqual([30, 10, 20]);
    expect(y()).toEqual([3, 4, 5]);
    await steps(6);
    await done;
    expect(last().y).toEqual([5, 6, 7]);
  });

  it('interpolates the same numbers on a linear axis', async () => {
    const figure = (x: number[]) => ({
      data: [{ type: 'blobs', x, y: [1, 2, 3] }],
      layout: layout(),
    });
    const c = await make(figure([10, 20, 30]));
    void c.react(figure([30, 10, 20]));
    await flush();
    await steps(5);
    expect(Array.from(last().x as ArrayLike<number>)).toEqual([20, 15, 25]);
  });

  it('snaps date strings at the start while values animate', async () => {
    const figure = (x: string[], values: number[]) => ({
      data: [{ type: 'blobs', x, y: values }],
      layout: layout(),
    });
    const c = await make(figure(['2024-01-01', '2024-02-01', '2024-03-01'], [1, 2, 3]));
    const next = ['2025-01-01', '2025-02-01', '2025-03-01'];
    const done = c.react(figure(next, [5, 6, 7]));
    await flush();
    expect(last().x).toEqual(next);
    await steps(5);
    expect(last().x).toEqual(next);
    expect(y()).toEqual([3, 4, 5]);
    await steps(6);
    await done;
  });

  it('snaps the range of an axis that changes type, so the traces are not held back', async () => {
    const c = await make({ data: [blob([1, 2, 3])], layout: layout() });
    const done = c.react({
      data: [blob([1, 10, 100])],
      // Decades on a log axis: no in-between of a linear range [0, 10] and 10^0 … 10^2.
      layout: layout({ yaxis: { type: 'log', range: [0, 2] } }),
    });
    await flush();
    expect(c.fullLayout!['yaxis']).toMatchObject({ type: 'log', range: [0, 2] });
    await steps(5);
    expect(c.fullLayout!['yaxis']).toMatchObject({ range: [0, 2] });
    expect(y()).toEqual([1, 6, 51.5]);
    await steps(6);
    await done;
    expect(last().y).toEqual([1, 10, 100]);
  });
});

describe('transitions: ordering and component tweens (E7.3, E7.5)', () => {
  /** A component owning `layout.dial`, which its view interpolates itself (squared progress). */
  const dial: ComponentModule = {
    name: 'dial',
    layoutSchema: { dial: attr.number({ dflt: 0, editType: 'plot' }) },
    draw: {
      create: () => ({
        update: () => {},
        layoutTweens(from, to) {
          const a = from['dial'] as number;
          const b = to['dial'] as number;
          return a === b ? [] : [{ path: 'dial', tween: (e: number) => a + (b - a) * e * e }];
        },
      }),
    },
  };
  const figure = (
    values: number[],
    turn: number,
    range: number[],
    ordering: 'layout first' | 'traces first',
  ) => ({
    data: [blob(values)],
    layout: { transition: { ...TRANSITION, ordering }, dial: turn, yaxis: { range } },
  });

  it("keeps a component's own tween moving whichever of axes and traces is held", async () => {
    t.registry.register(dial);
    const c = await make(figure([1, 2, 3], 0, [0, 10], 'layout first'));
    const first = c.react(figure([5, 6, 7], 8, [0, 20], 'layout first'));
    await flush();
    await steps(5);
    // Halfway: the range animates, the traces wait, the dial follows its own curve (8 × 0.5²).
    expect(c.fullLayout!['yaxis']).toMatchObject({ range: [0, 15] });
    expect(y()).toEqual([1, 2, 3]);
    expect(c.fullLayout!['dial']).toBeCloseTo(2, 10);
    await steps(6);
    await first;
    expect(last().y).toEqual([5, 6, 7]);
    expect(c.fullLayout!['dial']).toBe(8);

    const second = c.react(figure([1, 2, 3], 0, [0, 10], 'traces first'));
    await flush();
    await steps(5);
    // The other way round: the traces animate, the range waits, the dial still moves (8 → 6).
    expect(c.fullLayout!['yaxis']).toMatchObject({ range: [0, 20] });
    expect(y()).toEqual([3, 4, 5]);
    expect(c.fullLayout!['dial']).toBeCloseTo(6, 10);
    await steps(6);
    await second;
    expect(c.fullLayout!['yaxis']).toMatchObject({ range: [0, 10] });
    expect(c.layout['dial']).toBe(0);
  });
});

describe('transitions that cannot finish (E7.3)', () => {
  it("settles react's promise when the chart is destroyed mid-transition", async () => {
    const c = await make({ data: [blob([1, 2, 3])], layout: layout() });
    const log = events(c);
    const done = c.react({ data: [blob([5, 6, 7])], layout: layout() });
    await flush();
    await steps(2);
    c.destroy();
    chart = undefined;
    await steps(1);
    await expect(done).resolves.toBe(c);
    // It did not finish.
    expect(log).toEqual(['transitioning']);
  });

  it('rejects with the error of the pipeline run that failed', async () => {
    const c = await make({ data: [blob([1, 2, 3])], layout: layout() });
    const failed = c.react({ data: [blob([5, 6, 7], { symbol: 'broken' })], layout: layout() });
    await expect(failed).rejects.toThrow('blobs: cannot calc a broken trace');
    console.log('AFTER FAILURE', JSON.stringify(c.data[0]));
  });
});
