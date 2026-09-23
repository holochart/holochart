import { describe, expect, it } from 'vitest';
import {
  dashDependsOnViewport,
  dashDistance,
  dashPeriod,
  MAX_DASH_ENTRIES,
  resolveDashPattern,
} from './line-dash.ts';

describe('resolveDashPattern', () => {
  it('returns [] for solid', () => {
    expect(resolveDashPattern('solid', 2)).toEqual([]);
    expect(resolveDashPattern(undefined, 2)).toEqual([]);
  });

  it('scales named dashes with max(width, 3) like Plotly', () => {
    expect(resolveDashPattern('dot', 1)).toEqual([3, 3]);
    expect(resolveDashPattern('dot', 4)).toEqual([4, 4]);
    expect(resolveDashPattern('dash', 2)).toEqual([9, 9]);
    expect(resolveDashPattern('longdash', 4)).toEqual([20, 20]);
    expect(resolveDashPattern('dashdot', 4)).toEqual([12, 4, 4, 4]);
    expect(resolveDashPattern('longdashdot', 4)).toEqual([20, 8, 4, 8]);
  });

  it('parses px / unitless / percentage lists and doubles odd lists', () => {
    expect(resolveDashPattern('5px,10px,2px', 2)).toEqual([5, 10, 2, 5, 10, 2]);
    expect(resolveDashPattern('4 2', 2)).toEqual([4, 2]);
    const pct = resolveDashPattern('10%,5%', 1, { width: 300, height: 400 });
    const diag = Math.sqrt((300 ** 2 + 400 ** 2) / 2);
    expect(pct[0]).toBeCloseTo(0.1 * diag);
    expect(pct[1]).toBeCloseTo(0.05 * diag);
    expect(dashDependsOnViewport('10%,5%')).toBe(true);
    expect(dashDependsOnViewport('dash')).toBe(false);
  });

  it('falls back to solid for invalid, negative or all-zero lists', () => {
    expect(resolveDashPattern('5px,abc', 2)).toEqual([]);
    expect(resolveDashPattern('5,-1', 2)).toEqual([]);
    expect(resolveDashPattern('0,0', 2)).toEqual([]);
    expect(resolveDashPattern([2, 3], 2)).toEqual([2, 3]);
  });

  it('truncates overly long lists to the shader limit', () => {
    const long = Array.from({ length: 40 }, () => 1);
    expect(resolveDashPattern(long, 1)).toHaveLength(MAX_DASH_ENTRIES);
  });
});

describe('dashDistance', () => {
  const pattern = [4, 2]; // on [0,4], off (4,6)
  it('is negative inside dashes and positive in gaps', () => {
    expect(dashDistance(2, pattern)).toBe(-2);
    expect(dashDistance(5, pattern)).toBe(1);
    expect(dashDistance(5.5, pattern)).toBeCloseTo(0.5); // nearest is next period's dash
  });

  it('is periodic', () => {
    for (const s of [0.3, 1.7, 4.2, 5.9]) {
      expect(dashDistance(s + 6 * 7, pattern)).toBeCloseTo(dashDistance(s, pattern));
      expect(dashDistance(s - 6 * 3, pattern)).toBeCloseTo(dashDistance(s, pattern));
    }
    expect(dashPeriod(pattern)).toBe(6);
  });

  it('handles zero-length dashes (dots with round caps)', () => {
    expect(dashDistance(0, [0, 5])).toBe(0);
    expect(dashDistance(1, [0, 5])).toBe(1);
  });
});
