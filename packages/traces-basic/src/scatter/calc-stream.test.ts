import { autorange, createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type TraceAppend,
  type TraceExtremes,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { calcScatter, scatterExtremes, type ScatterCalc } from './calc.ts';
import { calcScatterAppend, scatterExtremesAppend } from './calc-stream.ts';
import { scatter } from './index.ts';

const registry = createChartRegistry().register(scatter);

function fullTrace(input: Record<string, unknown>): FullTrace {
  return supplyDefaults({ data: [input], layout: {} }, registry.core).fullData[0]!;
}

function axisInfo(type: 'linear' | 'log' | 'date' | 'category'): AxisInfo {
  const scale = createScale({ type });
  scale.setLength(500);
  scale.setRange(0, 1);
  return { scale, type, full: {} } as unknown as AxisInfo;
}

function context(x: 'linear' | 'log' | 'date', y: 'linear' | 'log'): CalcContext {
  return { fullLayout: {} as never, index: 0, xaxis: axisInfo(x), yaxis: axisInfo(y) };
}

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expectSameCalc(a: ScatterCalc, b: ScatterCalc): void {
  expect(a.length).toBe(b.length);
  expect(Array.from(a.x)).toEqual(Array.from(b.x));
  expect(Array.from(a.y)).toEqual(Array.from(b.y));
  if (typeof a.markerSize === 'number') expect(a.markerSize).toBe(b.markerSize);
  else expect(Array.from(a.markerSize)).toEqual(Array.from(b.markerSize as Float32Array));
  if (a.ppad instanceof Float64Array) {
    expect(Array.from(a.ppad)).toEqual(Array.from(b.ppad as Float64Array));
  } else expect(a.ppad).toBe(b.ppad);
  expect(a.errorY?.count).toBe(b.errorY?.count);
  if (a.errorY) expect(Array.from(a.errorY.plus)).toEqual(Array.from(b.errorY!.plus));
}

/** Extremes as sorted sets, and the ranges they resolve to. */
function normalize(e: TraceExtremes, ctx: CalcContext) {
  const set = (list: { l: number; padPx: number; extrapad?: boolean }[]) =>
    list
      .map((p) => `${p.l}|${p.padPx}|${p.extrapad === true}`)
      .sort()
      .join(',');
  const range = (letter: 'x' | 'y') => {
    const axis = letter === 'x' ? ctx.xaxis! : ctx.yaxis!;
    return autorange([e[letter]!], axis.scale, { autorange: true } as never);
  };
  return {
    x: [set(e.x!.min), set(e.x!.max)],
    y: [set(e.y!.min), set(e.y!.max)],
    rx: range('x'),
    ry: range('y'),
  };
}

type Scenario = {
  name: string;
  mode: string;
  axes: ['linear' | 'log' | 'date', 'linear' | 'log'];
  bubble?: boolean;
  typed?: boolean;
  errorBars?: boolean;
};

const scenarios: Scenario[] = [
  { name: 'lines, typed arrays', mode: 'lines', axes: ['linear', 'linear'], typed: true },
  { name: 'markers, plain arrays', mode: 'markers', axes: ['linear', 'linear'] },
  { name: 'bubbles (per-point size)', mode: 'markers', axes: ['linear', 'linear'], bubble: true },
  { name: 'log y, dates on x', mode: 'lines+markers', axes: ['date', 'log'], typed: true },
  { name: 'error bars', mode: 'markers', axes: ['linear', 'linear'], errorBars: true },
];

describe('scatter calcAppend / extremesAppend (E7.2)', () => {
  it.each(scenarios.map((s) => [s.name, s] as const))(
    'equals a full calc after random appends, prepends and trims: %s',
    (_, s) => {
      const random = rng(s.name.length * 31 + 7);
      const ctx = context(s.axes[0], s.axes[1]);
      let tNext = 1_700_000_000_000;
      let tPrev = tNext;
      const point = (front: boolean) => {
        const t = front ? (tPrev -= 1000) : (tNext += 1000);
        const x = s.axes[0] === 'date' ? t : (t - 1_700_000_000_000) / 1000;
        const y = random() < 0.05 ? NaN : 1 + random() * 100;
        return { x, y, size: 5 + Math.round(random() * 20), err: random() * 3 };
      };
      const arr = (v: number[]) => (s.typed ? Float64Array.from(v) : v);
      let pts = Array.from({ length: 200 }, () => point(false));
      const input = (): Record<string, unknown> => ({
        type: 'scatter',
        mode: s.mode,
        x: arr(pts.map((p) => p.x)),
        y: arr(pts.map((p) => p.y)),
        ...(s.bubble ? { marker: { size: pts.map((p) => p.size) } } : {}),
        ...(s.errorBars ? { error_y: { type: 'data', array: pts.map((p) => p.err) } } : {}),
      });
      let trace = fullTrace(input());
      let calc = calcScatter(trace, ctx);
      let extremes = scatterExtremes(calc, trace, ctx);
      let fastExtremes = 0;
      for (let step = 0; step < 60; step++) {
        const prepend = random() < 0.3;
        const count = 1 + Math.floor(random() * (random() < 0.2 ? 50 : 10));
        const maxPoints = 150 + Math.floor(random() * 100);
        const previous = pts.length;
        const added = Array.from({ length: count }, () => point(prepend));
        let trimmed: number;
        if (prepend) {
          pts = [...added.reverse(), ...pts];
          trimmed = Math.max(0, pts.length - maxPoints);
          pts = pts.slice(0, pts.length - trimmed);
        } else {
          pts = [...pts, ...added];
          trimmed = Math.max(0, pts.length - maxPoints);
          pts = pts.slice(trimmed);
        }
        const keys = ['x', 'y', ...(s.bubble ? ['marker.size'] : [])];
        if (s.errorBars) keys.push('error_y.array');
        const append: TraceAppend = {
          at: prepend ? 'start' : 'end',
          start: prepend ? 0 : pts.length - count,
          count,
          trimmed,
          previous,
          length: pts.length,
          keys,
        };
        trace = fullTrace(input());
        const next = calcScatterAppend(calc, trace, ctx, append);
        expect(next).toBeDefined();
        const want = calcScatter(trace, ctx);
        expectSameCalc(next!, want);
        const e = scatterExtremesAppend(extremes, next!, calc, trace, ctx, append);
        if (e) fastExtremes++;
        const got = e ?? scatterExtremes(next!, trace, ctx);
        expect(normalize(got, ctx)).toEqual(normalize(scatterExtremes(want, trace, ctx), ctx));
        calc = next!;
        extremes = got;
      }
      if (!s.errorBars) expect(fastExtremes).toBe(60);
    },
  );

  it('falls back to a full calc when retained points would pair with other values', () => {
    const ctx = context('linear', 'linear');
    const before = fullTrace({ y: [1, 2, 3], marker: { color: ['red', 'green', 'blue'] } });
    const calc = calcScatter(before, ctx);
    const after = fullTrace({ y: [2, 3, 4], marker: { color: ['red', 'green', 'blue'] } });
    const append: TraceAppend = {
      at: 'end',
      start: 2,
      count: 1,
      trimmed: 1,
      previous: 3,
      length: 3,
      keys: ['y'],
    };
    // Implicit x (x0 + i·dx) shifts, and marker.color was not trimmed with y.
    expect(calcScatterAppend(calc, after, ctx, append)).toBeUndefined();
    // Appending without trimming keeps every pairing.
    const grown = fullTrace({ y: [1, 2, 3, 4], marker: { color: ['red', 'green', 'blue'] } });
    const next = calcScatterAppend(calc, grown, ctx, {
      ...append,
      trimmed: 0,
      length: 4,
      start: 3,
    });
    expect(next && Array.from(next.x)).toEqual([0, 1, 2, 3]);
  });

  it('recomputes an axis only when a trimmed point was its extreme', () => {
    const ctx = context('linear', 'linear');
    const ys = [100, 1, 2, 3];
    const before = fullTrace({ x: [0, 1, 2, 3], y: ys, mode: 'lines' });
    const calc = calcScatter(before, ctx);
    const extremes = scatterExtremes(calc, before, ctx);
    const after = fullTrace({ x: [1, 2, 3, 4], y: [1, 2, 3, 4], mode: 'lines' });
    const append: TraceAppend = {
      at: 'end',
      start: 3,
      count: 1,
      trimmed: 1,
      previous: 4,
      length: 4,
      keys: ['x', 'y'],
    };
    const next = calcScatterAppend(calc, after, ctx, append)!;
    const e = scatterExtremesAppend(extremes, next, calc, after, ctx, append)!;
    // y max (100) was trimmed: recomputed to 4.
    expect(e.y!.max.map((p) => p.l)).toEqual([4]);
    expect(e.x!.min.map((p) => p.l)).toEqual([1]);
  });
});
