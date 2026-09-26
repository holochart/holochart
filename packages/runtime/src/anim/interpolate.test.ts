import { toRGBA } from '@mk7s/holochart-core';
import { mixColors } from '@mk7s/holochart-render';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  interpolator,
  matchPoints,
  pointArrayPaths,
  pointKind,
  pointTween,
  sameValue,
} from './interpolate.ts';

describe('interpolator', () => {
  it('numbers move linearly and may overshoot; opacities and sizes are kept in range', () => {
    expect(interpolator(2, 6)?.(0.25)).toBe(3);
    expect(interpolator(2, 6)?.(1.5)).toBe(8);
    expect(interpolator(0.5, 1, 'fade')?.(1.5)).toBe(1);
    expect(interpolator(4, 2, 'grow')?.(3)).toBe(0);
  });

  it('colors mix in OKLab, alpha linearly', () => {
    const tween = interpolator('red', 'rgba(0, 0, 255, 0.5)');
    const mid = mixColors(toRGBA('red')!, toRGBA('rgba(0, 0, 255, 0.5)')!, 0.5, 'oklab');
    const expected = `rgba(${mid
      .slice(0, 3)
      .map((v) => Math.round(v * 255))
      .join(', ')}, 0.75)`;
    expect(tween?.(0.5)).toBe(expected);
    expect(toRGBA(tween?.(0) as string)).toEqual(toRGBA('red'));
    expect(toRGBA(tween?.(1) as string)).toEqual(toRGBA('rgba(0, 0, 255, 0.5)'));
  });

  it('equal values, strings and mixed types cannot interpolate', () => {
    expect(interpolator(3, 3)).toBeUndefined();
    expect(interpolator('a', 'b')).toBeUndefined();
    expect(interpolator(1, 'red')).toBeUndefined();
    expect(interpolator(undefined, 2)).toBeUndefined();
  });

  it('knows which attributes fade and grow', () => {
    expect(pointKind('marker.opacity')).toBe('fade');
    expect(pointKind('marker.size')).toBe('grow');
    expect(pointKind('line.width')).toBe('grow');
    expect(pointKind('x')).toBe('value');
  });
});

describe('matchPoints', () => {
  it('by index: extra new points enter, extra old points exit', () => {
    const m = matchPoints(3, 2);
    expect([...m.from]).toEqual([0, 1, 2]);
    expect([...m.to]).toEqual([0, 1, -1]);
    expect(m.changed).toBe(true);
    const n = matchPoints(1, 3);
    expect([...n.from]).toEqual([0, -1, -1]);
    expect(matchPoints(2, 2).changed).toBe(false);
    // Lines and fills leave exiting points out.
    const joined = matchPoints(3, 2, ['a', 'b', 'c'], ['c', 'a'], false);
    expect([...joined.from]).toEqual([2, 0]);
    expect(joined.changed).toBe(false);
  });

  it('by ids: first occurrence wins; unmatched old points are appended', () => {
    const m = matchPoints(4, 3, ['a', 'b', 'c', 'a'], ['c', 'x', 'a']);
    expect([...m.from]).toEqual([2, -1, 0, 1, 3]);
    expect([...m.to]).toEqual([0, 1, 2, -1, -1]);
    // Ids compare as strings (Plotly keys points by `String(id)`).
    expect(matchPoints(2, 2, [1, 2], ['2', '1']).changed).toBe(false);
  });

  it('every old and new point appears exactly once', () => {
    const ids = fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'), { maxLength: 8 });
    fc.assert(
      fc.property(ids, ids, (a, b) => {
        const m = matchPoints(a.length, b.length, a, b);
        const from = [...m.from].filter((j) => j >= 0).sort((x, y) => x - y);
        const to = [...m.to].filter((i) => i >= 0);
        expect(from).toEqual(a.map((_, j) => j));
        expect(to).toEqual(b.map((_, i) => i));
        expect(m.length).toBe(m.from.length);
        // A matched pair has equal ids.
        m.from.forEach((j, k) => {
          const i = m.to[k] as number;
          if (j >= 0 && i >= 0) expect(a[j]).toBe(b[i]);
        });
      }),
    );
  });
});

describe('pointTween', () => {
  it('interpolates per point; entering points hold still, exiting ones keep their place', () => {
    const m = matchPoints(3, 3, ['a', 'b', 'c'], ['b', 'c', 'd']);
    const x = pointTween([1, 2, 3], [20, 30, 40], m, 'value');
    expect(x.constant).toBe(false);
    // b: 2 → 20, c: 3 → 30, d enters at 40, a exits at 1.
    expect([...(x.tween(0.5) as Float64Array)]).toEqual([11, 16.5, 40, 1]);
    const size = pointTween(10, [4, 6, 8], m, 'grow');
    expect([...(size.tween(0.5) as Float64Array)]).toEqual([7, 8, 4, 5]);
    const opacity = pointTween(1, 1, m, 'fade');
    expect([...(opacity.tween(0.25) as Float64Array)]).toEqual([1, 1, 0.25, 0.75]);
  });

  it('colors per point; strings snap to the new values with the exiting points appended', () => {
    const m = matchPoints(2, 1);
    const color = pointTween(['red', 'blue'], ['green'], m, 'value');
    expect(color.constant).toBe(false);
    const at1 = color.tween(1) as string[];
    expect(toRGBA(at1[0]!)).toEqual(toRGBA('green'));
    expect(toRGBA(at1[1]!)).toEqual(toRGBA('blue'));
    const text = pointTween(['a', 'b'], ['c'], m, 'value');
    expect(text.constant).toBe(true);
    expect(text.tween(0.3)).toEqual(['c', 'b']);
  });

  it('gaps snap: a missing old value jumps to the new one', () => {
    const m = matchPoints(2, 2);
    const y = pointTween([null, 2], [5, 4], m, 'value');
    expect([...(y.tween(0.5) as Float64Array)]).toEqual([5, 3]);
  });

  it('starts at the old values and ends at the new ones', () => {
    const values = fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), {
      minLength: 1,
      maxLength: 10,
    });
    fc.assert(
      fc.property(values, values, (a, b) => {
        const m = matchPoints(a.length, b.length);
        const { tween } = pointTween(a, b, m, 'value');
        const start = Array.from(tween(0) as ArrayLike<number>);
        const end = Array.from(tween(1) as ArrayLike<number>);
        // Exact up to rounding (the end state itself is restored from the new figure).
        const close = (x: number, y: number) =>
          expect(Math.abs(x - y)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(y)));
        for (let k = 0; k < m.length; k++) {
          const j = m.from[k] as number;
          const i = m.to[k] as number;
          close(start[k] as number, (j >= 0 ? a[j] : b[i]) as number);
          close(end[k] as number, (i >= 0 ? b[i] : a[j]) as number);
        }
      }),
    );
  });
});

describe('helpers', () => {
  it('sameValue compares arrays item by item', () => {
    expect(sameValue([1, 2], [1, 2])).toBe(true);
    expect(sameValue(new Float64Array([1, 2]), [1, 2])).toBe(true);
    expect(sameValue([1, 2], [1, 3])).toBe(false);
    expect(sameValue('a', 'a')).toBe(true);
  });

  it('pointArrayPaths finds per-point arrays in nested containers', () => {
    const trace = {
      x: [1, 2],
      y: [3, 4],
      text: ['a', 'b'],
      marker: { color: ['r', 'g'], size: 4, line: { width: [1, 2] } },
      customdata: [1, 2, 3],
      _private: [1, 2],
    };
    expect(pointArrayPaths(trace, 2)).toEqual([
      'x',
      'y',
      'text',
      'marker.color',
      'marker.line.width',
    ]);
  });
});
