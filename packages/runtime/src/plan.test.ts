import { describe, expect, it } from 'vitest';
import {
  applyEdits,
  distributeRestyle,
  flattenPatch,
  inputTraceType,
  needsLayout,
  planLayoutEdit,
  planTraceEdit,
  tracePlan,
  withRangeImplications,
  maxPointsFor,
  spliceArray,
} from './plan.ts';
import { createDotsModule, createLog } from './__testing__/fakes.ts';
import { createChartRegistry } from './registry.ts';
import type { FullLayout } from '@mk7s/holochart-core';

const core = createChartRegistry().register(createDotsModule(createLog())).core;

describe('applyEdits', () => {
  it('writes nested paths without mutating the input', () => {
    const trace = Object.freeze({ marker: Object.freeze({ color: 'red', size: 4 }), x: [1] });
    const out = applyEdits(trace, { 'marker.color': 'blue', 'line.width': 2 });
    expect(out).toEqual({ marker: { color: 'blue', size: 4 }, x: [1], line: { width: 2 } });
    expect(trace.marker.color).toBe('red');
    // Untouched branches are shared, not copied.
    expect(out.x).toBe(trace.x);
  });

  it('resets on null and ignores undefined', () => {
    const out = applyEdits(
      { marker: { color: 'red' }, name: 'a' },
      { 'marker.color': null, name: undefined },
    );
    expect(out).toEqual({ marker: {}, name: 'a' });
  });

  it('writes array indices', () => {
    const layout = { xaxis: { range: [0, 1] } };
    expect(applyEdits(layout, { 'xaxis.range[1]': 5 })).toEqual({ xaxis: { range: [0, 5] } });
    expect(layout.xaxis.range).toEqual([0, 1]);
  });

  it('rejects malformed paths and writes through non-objects', () => {
    expect(() => applyEdits({}, { 'a..b': 1 })).toThrow(/Invalid attribute path/);
    expect(() => applyEdits({ marker: 'red' }, { 'marker.color': 1 })).toThrow(/not an object/);
    expect(() => applyEdits({}, { __proto__polluted: 1, 'constructor.x': 1 })).toThrow();
  });
});

describe('distributeRestyle', () => {
  it('gives array values one entry per listed trace, cycling', () => {
    const out = distributeRestyle({ 'marker.color': ['red', 'blue'], opacity: 0.5 }, [0, 2, 3]);
    expect(out.get(0)).toEqual({ 'marker.color': 'red', opacity: 0.5 });
    expect(out.get(2)).toEqual({ 'marker.color': 'blue', opacity: 0.5 });
    expect(out.get(3)).toEqual({ 'marker.color': 'red', opacity: 0.5 });
  });

  it('unwraps data arrays and applies typed arrays as-is', () => {
    const y = new Float64Array([1, 2]);
    const out = distributeRestyle({ x: [[1, 2, 3]], y }, [1]);
    expect(out.get(1)).toEqual({ x: [1, 2, 3], y });
  });

  it('skips undefined entries and keeps null resets', () => {
    const out = distributeRestyle({ name: [undefined, null] }, [0, 1]);
    expect(out.get(0)).toEqual({});
    expect(out.get(1)).toEqual({ name: null });
  });
});

describe('flattenPatch', () => {
  it('flattens plain objects into attribute strings; arrays are leaves', () => {
    const y = new Float32Array(2);
    expect(
      flattenPatch({ marker: { color: 'red', line: { width: 2 } }, y, x: [1, 2], m: {} }),
    ).toEqual({ 'marker.color': 'red', 'marker.line.width': 2, y, x: [1, 2] });
  });
});

describe('withRangeImplications', () => {
  it('turns autorange off when a range is set', () => {
    expect(withRangeImplications({ 'xaxis2.range': [0, 1] }, {}, undefined)).toEqual({
      'xaxis2.range': [0, 1],
      'xaxis2.autorange': false,
    });
  });

  it('keeps an explicit autorange and ignores range resets', () => {
    expect(
      withRangeImplications({ 'xaxis.range': [0, 1], 'xaxis.autorange': true }, {}, undefined),
    ).toEqual({
      'xaxis.range': [0, 1],
      'xaxis.autorange': true,
    });
    expect(withRangeImplications({ 'yaxis.range': null }, {}, undefined)).toEqual({
      'yaxis.range': null,
    });
  });

  it('fills the other end of a single-ended edit from the range in use', () => {
    const fullLayout = { xaxis: { range: [-1, 9] } } as unknown as FullLayout;
    expect(withRangeImplications({ 'xaxis.range[1]': 4 }, {}, fullLayout)).toEqual({
      'xaxis.range': [-1, 4],
      'xaxis.autorange': false,
    });
    // Both ends in one update (a zoom) fill one array.
    expect(
      withRangeImplications({ 'xaxis.range[0]': 2, 'xaxis.range[1]': 3 }, {}, fullLayout),
    ).toEqual({ 'xaxis.range': [2, 3], 'xaxis.autorange': false });
    // An input range already exists: edit it in place.
    expect(
      withRangeImplications({ 'xaxis.range[0]': 2 }, { xaxis: { range: [0, 5] } }, fullLayout),
    ).toEqual({
      'xaxis.range[0]': 2,
      'xaxis.autorange': false,
    });
  });
});

describe('planning', () => {
  it('plans a color restyle as style only', () => {
    expect([...planTraceEdit(['color'], 'dots', 0, core)]).toEqual(['style']);
  });

  it('plans data edits as calc', () => {
    expect(planTraceEdit(['x'], 'dots', 0, core).has('calc')).toBe(true);
  });

  it('plans an axis range edit as ticks + plot (no calc)', () => {
    const stages = planLayoutEdit(['xaxis.range', 'xaxis.autorange'], core);
    expect(stages.has('calc')).toBe(false);
    expect(stages.has('plot')).toBe(true);
  });

  it('reads trace types like supply-defaults', () => {
    expect(inputTraceType({})).toBe('scatter');
    expect(inputTraceType({ type: 'dots' })).toBe('dots');
    expect(inputTraceType(null)).toBe('scatter');
  });

  it('maps declared stages to trace view plans', () => {
    const none = new Set<never>();
    const opts = { forceCalc: false, layoutRan: false };
    expect(tracePlan(new Set(['style']), none, opts)).toEqual({
      calc: false,
      plot: false,
      style: true,
      transform: false,
    });
    // Layout-level plot/ticks (zoom) only moves traces.
    expect(tracePlan(none, new Set(['ticks', 'plot']), { ...opts, layoutRan: true })).toEqual({
      calc: false,
      plot: false,
      style: false,
      transform: true,
    });
    // Trace-level plot re-reads the trace; calc implies everything downstream.
    expect(tracePlan(new Set(['plot']), none, opts)).toMatchObject({ plot: true, style: true });
    expect(tracePlan(none, none, { forceCalc: true, layoutRan: true })).toEqual({
      calc: true,
      plot: true,
      style: true,
      transform: true,
    });
    // Layout-level style (colorway) restyles every trace.
    expect(tracePlan(none, new Set(['style']), opts).style).toBe(true);
  });

  it('knows which stages need the layout step', () => {
    expect(needsLayout(new Set(['style', 'legend']))).toBe(false);
    expect(needsLayout(new Set(['ticks']))).toBe(true);
  });
});

describe('spliceArray (extendTraces / prependTraces, E7.2)', () => {
  it('joins plain arrays into new ones, keeping maxPoints from the end just written', () => {
    const target = [1, 2, 3];
    expect(spliceArray(target, [4, 5], -1, 'end')).toEqual({ value: [1, 2, 3, 4, 5], removed: 0 });
    expect(spliceArray(target, [4, 5], 3, 'end')).toEqual({ value: [3, 4, 5], removed: 2 });
    expect(spliceArray(target, [4, 5], 3, 'start')).toEqual({ value: [4, 5, 1], removed: 2 });
    expect(spliceArray(target, Float64Array.from([4]), 0, 'end')).toEqual({
      value: [],
      removed: 4,
    });
    expect(target).toEqual([1, 2, 3]);
  });

  it('grows typed arrays in place, never writing into earlier views', () => {
    const user = Float64Array.from([0, 1, 2]);
    const a = spliceArray(user, [3], 4, 'end').value as Float64Array;
    expect(Array.from(a)).toEqual([0, 1, 2, 3]);
    expect(a.buffer).not.toBe(user.buffer); // the caller's buffer is never written
    const b = spliceArray(a, [4, 5], 4, 'end').value as Float64Array;
    expect(b.buffer).toBe(a.buffer);
    expect(Array.from(b)).toEqual([2, 3, 4, 5]);
    expect(Array.from(a)).toEqual([0, 1, 2, 3]);
    // Extending an older view again must not overwrite what `b` shows.
    const c = spliceArray(a, [9], -1, 'end').value as Float64Array;
    expect(c.buffer).not.toBe(a.buffer);
    expect(Array.from(b)).toEqual([2, 3, 4, 5]);
    expect(Array.from(c)).toEqual([0, 1, 2, 3, 9]);
  });

  it('keeps the target type and converts other inserts', () => {
    const r = spliceArray(Int32Array.from([1]), [2.7, 3], -1, 'end').value;
    expect(r).toBeInstanceOf(Int32Array);
    expect(Array.from(r as Int32Array)).toEqual([1, 2, 3]);
  });

  it('prepends typed arrays in place', () => {
    const a = spliceArray(Float32Array.from([2, 3]), [1], 3, 'start').value as Float32Array;
    const b = spliceArray(a, [0], 3, 'start').value as Float32Array;
    expect(b.buffer).toBe(a.buffer);
    expect(Array.from(b)).toEqual([0, 1, 2]);
    expect(Array.from(a)).toEqual([1, 2, 3]);
  });

  it('reads maxPoints per key and in the options form', () => {
    expect(maxPointsFor(5.7, 'y', 0)).toBe(5);
    expect(maxPointsFor({ y: [1, 2] }, 'y', 1)).toBe(2);
    expect(maxPointsFor({ maxPoints: 9 }, 'x', 3)).toBe(9);
    expect(maxPointsFor(undefined, 'x', 0)).toBe(-1);
  });
});
