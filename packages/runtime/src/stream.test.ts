// @vitest-environment jsdom
import { concatExtremes, type FullTrace, type Scale } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { linearExtremes } from './axes.ts';
import { extendTraces, prependTraces } from './api.ts';
import { createChart, type Chart } from './chart.ts';
import type { TraceAppend, TraceModule, TraceUpdatePlan } from './contracts.ts';
import {
  createDotsModule,
  createLog,
  setup,
  type DotsCalc,
  type TestSetup,
} from './__testing__/fakes.ts';
import { createChartRegistry } from './registry.ts';

/**
 * The test `dots` module made streaming-aware: `_length` from its data, and `calcAppend` /
 * `extremesAppend` that record their calls (and compute the same result as a full calc).
 */
function streamingSetup(options: { calcAppend?: boolean } = {}) {
  const base = setup({ width: 640, height: 400 });
  const log = createLog();
  const appends: TraceAppend[] = [];
  const merged: number[] = [];
  const dots = createDotsModule(log);
  const module: TraceModule<DotsCalc> = {
    ...dots,
    type: 'sdots',
    supplyDefaults(input, out: FullTrace, ctx) {
      dots.supplyDefaults(input, out, ctx);
      const x = out['x'] as ArrayLike<unknown> | undefined;
      const y = out['y'] as ArrayLike<unknown> | undefined;
      out['_length'] = Math.min(x?.length ?? 0, y?.length ?? 0);
    },
    ...(options.calcAppend === false
      ? {}
      : {
          calcAppend(_prev, trace, ctx, append) {
            appends.push(append);
            const n = trace['_length'] as number;
            const x = ctx.xaxis!.scale.d2lArray(
              Array.from(trace['x'] as ArrayLike<unknown>).slice(0, n),
            );
            const y = ctx.yaxis!.scale.d2lArray(
              Array.from(trace['y'] as ArrayLike<unknown>).slice(0, n),
            );
            return { x, y };
          },
          extremesAppend(prev, calc, _prevCalc, trace, _ctx, append) {
            merged.push(append.count);
            const pad = Number(trace['size']) / 2;
            const range =
              append.at === 'end'
                ? [calc.x.length - append.count, calc.x.length]
                : [0, append.count];
            const added = (v: Float64Array) => linearExtremes(v.subarray(range[0], range[1]), pad);
            const linear = { type: 'linear' } as unknown as Scale;
            // (A real module recomputes when a trimmed point was an extreme; the test data never trims one.)
            return {
              x: concatExtremes([prev.x!, added(calc.x)], linear),
              y: concatExtremes([prev.y!, added(calc.y)], linear),
            };
          },
        }),
  };
  const registry = createChartRegistry().register(module);
  return { ...base, log, appends, merged, options: { ...base.options, registry } };
}

type Setup = ReturnType<typeof streamingSetup>;
let s: Setup;
let charts: Chart[] = [];

function chart(figure: Parameters<typeof createChart>[1], t: TestSetup = s): Chart {
  const c = createChart(t.container, figure, t.options);
  charts.push(c);
  return c;
}

beforeEach(() => {
  s = streamingSetup();
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
});

const lastPlan = (index = 0): TraceUpdatePlan | undefined =>
  s.log.updates.filter((u) => u.index === index).at(-1)?.plan;

describe('extendTraces / prependTraces (E7.2)', () => {
  it('appends to plain and typed arrays without mutating them', async () => {
    const x = [0, 1, 2];
    const y = Float64Array.from([5, 6, 7]);
    const c = chart({ data: [{ type: 'sdots', x, y }] });
    await c.ready;
    await c.extendTraces({ x: [[3, 4]], y: [Float64Array.from([8, 9])] }, [0]);
    const t = c.data[0] as { x: number[]; y: Float64Array };
    expect(t.x).toEqual([0, 1, 2, 3, 4]);
    expect(t.y).toBeInstanceOf(Float64Array);
    expect(Array.from(t.y)).toEqual([5, 6, 7, 8, 9]);
    expect(x).toEqual([0, 1, 2]);
    expect(Array.from(y)).toEqual([5, 6, 7]);
  });

  it('keeps a rolling window with maxPoints (number, per key, options form)', async () => {
    const c = chart({ data: [{ type: 'sdots', x: [0, 1, 2], y: [0, 1, 2] }] });
    await c.ready;
    await c.extendTraces({ x: [[3, 4]], y: [[3, 4]] }, 0, 4);
    expect(c.data[0]).toMatchObject({ x: [1, 2, 3, 4], y: [1, 2, 3, 4] });
    await c.extendTraces({ x: [[5]], y: [[5]] }, [0], { x: [2], y: [3] });
    expect(c.data[0]).toMatchObject({ x: [4, 5], y: [3, 4, 5] });
    await c.extendTraces({ x: [[6]], y: [[6]] }, [0], { maxPoints: 2 });
    expect(c.data[0]).toMatchObject({ x: [5, 6], y: [5, 6] });
  });

  it('prepends and trims from the end', async () => {
    const c = chart({ data: [{ type: 'sdots', x: Float32Array.from([2, 3, 4]), y: [2, 3, 4] }] });
    await c.ready;
    await c.prependTraces({ x: [[0, 1]], y: [[0, 1]] }, [0], 4);
    const t = c.data[0] as { x: Float32Array; y: number[] };
    expect(t.x).toBeInstanceOf(Float32Array);
    expect(Array.from(t.x)).toEqual([0, 1, 2, 3]);
    expect(t.y).toEqual([0, 1, 2, 3]);
    expect(s.appends.at(-1)).toMatchObject({ at: 'start', start: 0, count: 2, trimmed: 1 });
  });

  it('extends several traces (negative indices count from the end)', async () => {
    const c = chart({
      data: [
        { type: 'sdots', x: [0], y: [0] },
        { type: 'sdots', x: [0], y: [10] },
      ],
    });
    await c.ready;
    await c.extendTraces({ y: [[1], [11]], x: [[1], [1]] }, [0, -1]);
    expect(c.data.map((t) => (t as { y: number[] }).y)).toEqual([
      [0, 1],
      [10, 11],
    ]);
  });

  it('rejects malformed calls with Plotly messages and changes nothing', async () => {
    const c = chart({ data: [{ type: 'sdots', x: [0], y: [0] }] });
    await c.ready;
    const before = c.data[0];
    await expect(c.extendTraces([] as never, [0])).rejects.toThrow(
      'update must be a key:value object',
    );
    await expect(c.extendTraces({ y: [[1]] }, undefined as never)).rejects.toThrow(
      'indices must be an integer or array of integers',
    );
    await expect(c.extendTraces({ y: [[1]] }, [3])).rejects.toThrow('must be valid indices');
    await expect(c.extendTraces({ y: [[1], [2]] }, [0])).rejects.toThrow(
      'attribute y must be an array of length equal to indices array length',
    );
    await expect(c.extendTraces({ y: [[1]] }, [0], { x: [1] })).rejects.toThrow(
      'when maxPoints is set as a key:value object',
    );
    await expect(c.extendTraces({ y: [[1]], text: [['a']] }, [0])).rejects.toThrow(
      'cannot extend missing or non-array attribute: text',
    );
    expect(c.data[0]).toBe(before);
  });

  it('takes the streaming path: calcAppend, extremesAppend, plan.append, no full calc', async () => {
    const c = chart({ data: [{ type: 'sdots', x: [0, 1, 2], y: [0, 1, 2] }] });
    await c.ready;
    const calcs = s.log.calc.length;
    await c.extendTraces({ x: [[3, 4]], y: [[3, 4]] }, [0], 4);
    expect(s.log.calc.length).toBe(calcs);
    expect(s.appends).toEqual([
      { at: 'end', start: 2, count: 2, trimmed: 1, previous: 3, length: 4, keys: ['x', 'y'] },
    ]);
    expect(s.merged).toEqual([2]);
    expect(lastPlan()).toMatchObject({ calc: true, plot: true, append: { count: 2 } });
  });

  it('merges calls batched in one tick into one pipeline run', async () => {
    const c = chart({ data: [{ type: 'sdots', x: [0, 1, 2], y: [0, 1, 2] }] });
    await c.ready;
    const updates = s.log.updates.length;
    const frames = s.frames();
    void c.extendTraces({ x: [[3]], y: [[3]] }, [0], 3);
    await c.extendTraces({ x: [[4, 5]], y: [[4, 5]] }, [0], 3);
    expect(s.log.updates.length).toBe(updates + 1);
    expect(s.frames()).toBe(frames + 1);
    expect(s.appends.at(-1)).toMatchObject({
      at: 'end',
      count: 3,
      trimmed: 3,
      previous: 3,
      length: 3,
    });
    expect(c.data[0]).toMatchObject({ x: [3, 4, 5] });
  });

  it('autoranges incrementally to the same range as a fresh chart', async () => {
    const c = chart({ data: [{ type: 'sdots', x: [0, 1, 2], y: [5, 1, 7] }] });
    await c.ready;
    await c.extendTraces({ x: [[3, 4]], y: [[-20, 40]] }, [0]);
    const fresh = streamingSetup();
    const d = chart(
      { data: [{ type: 'sdots', x: [0, 1, 2, 3, 4], y: [5, 1, 7, -20, 40] }] },
      fresh,
    );
    await d.ready;
    for (const axis of ['xaxis', 'yaxis']) {
      expect((c.fullLayout?.[axis] as { range: number[] }).range).toEqual(
        (d.fullLayout?.[axis] as { range: number[] }).range,
      );
    }
  });

  it('falls back to a full calc without calcAppend, after a restyle, or for mixed calls', async () => {
    const plain = streamingSetup({ calcAppend: false });
    const c = chart({ data: [{ type: 'sdots', x: [0, 1], y: [0, 1] }] }, plain);
    await c.ready;
    await c.extendTraces({ x: [[2]], y: [[2]] }, [0]);
    expect(plain.log.calc).toEqual([0, 0]); // first draw, then a full recalc
    expect(plain.log.updates.at(-1)?.plan.append).toBeUndefined();

    const d = chart({ data: [{ type: 'sdots', x: [0, 1], y: [0, 1] }] });
    await d.ready;
    void d.restyle({ size: 4 }, 0);
    await d.extendTraces({ x: [[2]], y: [[2]] }, [0]);
    expect(s.appends).toEqual([]);
    void d.extendTraces({ x: [[3]], y: [[3]] }, [0]);
    await d.prependTraces({ x: [[-1]], y: [[-1]] }, [0]);
    expect(s.appends).toEqual([]);
    expect(lastPlan()?.append).toBeUndefined();
    expect(d.data[0]).toMatchObject({ x: [-1, 0, 1, 2, 3] });
  });

  it('falls back when keys are trimmed differently', async () => {
    const c = chart({ data: [{ type: 'sdots', x: [0, 1, 2, 3], y: [0, 1, 2] }] });
    await c.ready;
    await c.extendTraces({ x: [[9]], y: [[9]] }, [0], 4);
    expect(s.appends).toEqual([]);
    expect(c.data[0]).toMatchObject({ x: [1, 2, 3, 9], y: [0, 1, 2, 9] });
  });

  it('emits redraw (plotly_redraw) after the frame', async () => {
    const c = chart({ data: [{ type: 'sdots', x: [0], y: [0] }] });
    await c.ready;
    const events: unknown[] = [];
    c.on('plotly_redraw', (e) => void events.push(e));
    const frames = s.frames();
    await c.extendTraces({ y: [[1]], x: [[1]] }, [0], 10);
    expect(s.frames()).toBe(frames + 1);
    expect(events).toEqual([
      { kind: 'extend', update: { y: [[1]], x: [[1]] }, traces: [0], maxPoints: 10 },
    ]);
  });

  it('has functional forms keyed by element', async () => {
    const c = chart({ data: [{ type: 'sdots', x: [1], y: [1] }] });
    await c.ready;
    await extendTraces(s.container, { x: [[2]], y: [[2]] }, [0]);
    await prependTraces(s.container, { x: [[0]], y: [[0]] }, [0]);
    expect(c.data[0]).toMatchObject({ x: [0, 1, 2], y: [0, 1, 2] });
  });
});
