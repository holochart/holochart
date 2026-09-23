import { createScale, type FullAxis } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import {
  axisTypeOf,
  collectCategories,
  dataTransform,
  linearExtremes,
  resolveAxisRange,
  syncScale,
} from './axes.ts';

function axis(extra: Partial<FullAxis>): FullAxis {
  return {
    type: 'linear',
    autorange: true,
    range: undefined,
    domain: [0, 1],
    anchor: 'y',
    _id: 'x',
    _name: 'xaxis',
    ...extra,
  } as FullAxis;
}

describe('dataTransform', () => {
  it('maps linear coordinates to viewport px through each scale', () => {
    const x = createScale({ type: 'linear', range: [0, 10], length: 500 });
    const y = createScale({ type: 'linear', range: [-1, 1], length: 200 });
    const t = dataTransform(x, y);
    // world = l * scale + offset
    expect(5 * t.scaleX + t.offsetX).toBeCloseTo(x.l2p(5));
    expect(0 * t.scaleX + t.offsetX).toBeCloseTo(0);
    expect(10 * t.scaleX + t.offsetX).toBeCloseTo(500);
    // y: world origin is the bottom of the viewport, which is range[0].
    expect(-1 * t.scaleY + t.offsetY).toBeCloseTo(0);
    expect(1 * t.scaleY + t.offsetY).toBeCloseTo(200);
  });

  it('follows reversed ranges', () => {
    const x = createScale({ type: 'linear', range: [10, 0], length: 100 });
    const t = dataTransform(x, x);
    expect(10 * t.scaleX + t.offsetX).toBeCloseTo(0);
    expect(0 * t.scaleX + t.offsetX).toBeCloseTo(100);
  });
});

describe('linearExtremes', () => {
  it('finds min/max with a scalar pad, skipping non-finite values', () => {
    expect(linearExtremes([3, NaN, -2, Infinity, 7], 4)).toEqual({
      min: [{ l: -2, padPx: 4 }],
      max: [{ l: 7, padPx: 4 }],
    });
  });

  it('marks points for the 5% extra padding when asked', () => {
    expect(linearExtremes([1, 2], 3, { padded: true }).min).toEqual([
      { l: 1, padPx: 3, extrapad: true },
    ]);
  });

  it('returns no points for empty data', () => {
    expect(linearExtremes([], 3)).toEqual({ min: [], max: [] });
  });

  it('keeps only non-dominated points with per-point padding', () => {
    const e = linearExtremes([0, 1, 0.5, 10, 9.9], [1, 20, 1, 1, 30]);
    // 1 with pad 20 may still decide the minimum; 0.5 (pad 1) is dominated by 0 (pad 1).
    expect(e.min).toEqual([
      { l: 0, padPx: 1 },
      { l: 1, padPx: 20 },
      { l: 9.9, padPx: 30 },
    ]);
    expect(e.max).toEqual([
      { l: 10, padPx: 1 },
      { l: 9.9, padPx: 30 },
    ]);
  });
});

describe('categories', () => {
  it('collects categories in order of first appearance across traces', () => {
    const out: string[] = [];
    const seen = new Set<string>();
    collectCategories(['b', 'a', 'b', null, ''], out, seen);
    collectCategories(['c', 'a'], out, seen);
    expect(out).toEqual(['b', 'a', 'c']);
  });

  it('ignores non-arrays', () => {
    expect(collectCategories(undefined, [])).toEqual([]);
  });
});

describe('syncScale', () => {
  it('reuses the scale while type and categories are unchanged', () => {
    const a = syncScale(undefined, 'category', ['a', 'b']);
    expect(syncScale(a, 'category', ['a', 'b'])).toBe(a);
    const b = syncScale(a, 'category', ['a', 'b', 'c']);
    expect(b).not.toBe(a);
    expect(syncScale(b, 'linear', undefined).scale.type).toBe('linear');
  });

  it('carries range and length over to a new scale', () => {
    const a = syncScale(undefined, 'linear', undefined);
    a.scale.setRange(2, 4);
    a.scale.setLength(300);
    const b = syncScale(a, 'log', undefined);
    expect(b.scale.range).toEqual([2, 4]);
    expect(b.scale.length).toBe(300);
  });

  it("treats the undetected '-' type as linear", () => {
    expect(axisTypeOf({ type: '-' })).toBe('linear');
    expect(axisTypeOf({ type: 'date' })).toBe('date');
  });
});

describe('resolveAxisRange', () => {
  const scale = createScale({ type: 'linear', length: 100 });
  const ext = [{ min: [{ l: 0, padPx: 0 }], max: [{ l: 10, padPx: 0 }] }];

  it('autoranges from extremes', () => {
    const [a, b] = resolveAxisRange(axis({ autorange: true }), scale, ext);
    expect(a).toBeLessThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(10);
  });

  it('flips for reversed autorange', () => {
    const [a, b] = resolveAxisRange(axis({ autorange: 'reversed' }), scale, ext);
    expect(a).toBeGreaterThan(b);
  });

  it('uses a valid fixed range', () => {
    expect(resolveAxisRange(axis({ autorange: false, range: [2, 5] }), scale, ext)).toEqual([2, 5]);
  });

  it('falls back to autorange for an invalid fixed range', () => {
    const [a, b] = resolveAxisRange(axis({ autorange: false, range: [3, 3] }), scale, ext);
    expect(a).toBeLessThan(b);
  });

  it('reads log ranges in log10 units (Plotly)', () => {
    const log = createScale({ type: 'log', length: 100 });
    expect(resolveAxisRange(axis({ autorange: false, range: [0, 2] }), log, [])).toEqual([0, 2]);
  });
});
