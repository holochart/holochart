import { describe, expect, it } from 'vitest';
import {
  bandValue,
  contourColorRange,
  contourLevels,
  levelList,
  MAX_CONTOUR_LEVELS,
} from './contour-levels.ts';

const auto = (zmin: number, zmax: number, ncontours = 15) =>
  contourLevels({ zmin, zmax, autocontour: true, ncontours });

describe('contourLevels (autocontour)', () => {
  it('picks a nice step and the ticks strictly inside the range', () => {
    const r = auto(0.3, 9.7);
    expect(r.size).toBe(1);
    expect(r.start).toBe(1);
    expect(r.end).toBe(9);
    expect(r.levels).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('moves start/end off ticks that land exactly on zmin/zmax', () => {
    const r = auto(0, 10);
    expect(r.size).toBe(1);
    expect(r.start).toBe(1);
    expect(r.end).toBe(9);
    expect(r.levels).toHaveLength(9);
  });

  it('cleans float noise from the levels', () => {
    const r = auto(0, 1);
    expect(r.size).toBe(0.1);
    expect(r.levels).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
  });

  it('keeps one level midway when start passes end (small ncontours)', () => {
    const r = auto(0, 10, 2);
    expect(r.size).toBe(10);
    expect(r.start).toBe(5);
    expect(r.end).toBe(5);
    expect(r.levels).toEqual([5]);
  });

  it('treats ncontours 0 as 15 and reversed ranges as sorted', () => {
    expect(auto(0, 10, 0).size).toBe(1);
    expect(auto(10, 0).levels).toEqual(auto(0, 10).levels);
  });

  it('handles negative ranges', () => {
    const r = auto(-7.5, -2.5);
    expect(r.size).toBe(0.5);
    expect(r.start).toBe(-7);
    expect(r.end).toBe(-3);
    expect(r.levels[1]).toBe(-6.5);
  });

  it('gives a single level for flat or non-finite data', () => {
    expect(auto(5, 5).levels).toEqual([5]);
    // Plotly quirk: an empty range is not "reversed", so both ends round up.
    expect(auto(5.5, 5.5).levels).toEqual([6]);
    expect(auto(NaN, NaN).levels).toEqual([0]);
    expect(auto(NaN, 3).levels).toEqual([3]);
    expect(auto(-Infinity, Infinity).levels).toHaveLength(1);
  });
});

describe('contourLevels (manual)', () => {
  it('uses start/end/size as given', () => {
    const r = contourLevels({
      zmin: 0,
      zmax: 1,
      autocontour: false,
      start: 0.1,
      end: 0.7,
      size: 0.2,
    });
    expect(r.levels).toEqual([0.1, 0.3, 0.5, 0.7]);
  });

  it('swaps a reversed start/end', () => {
    const r = contourLevels({ zmin: 0, zmax: 1, autocontour: false, start: 5, end: 1, size: 1 });
    expect([r.start, r.end]).toEqual([1, 5]);
    expect(r.levels).toEqual([1, 2, 3, 4, 5]);
  });

  it('fills in a missing or invalid size', () => {
    const base = { zmin: 0, zmax: 1, autocontour: false, start: 0, end: 10 } as const;
    expect(contourLevels({ ...base, ncontours: 15 }).size).toBe(1);
    expect(contourLevels({ ...base, size: 0, ncontours: 3 }).size).toBe(5);
    expect(contourLevels({ ...base, size: -2 }).size).toBe(1);
    const same = contourLevels({ ...base, end: 0 });
    expect(same.size).toBe(1);
    expect(same.levels).toEqual([0]);
  });

  it('stops at end within a tolerance and caps the count', () => {
    const r = contourLevels({
      zmin: 0,
      zmax: 1,
      autocontour: false,
      start: 0,
      end: 0.3 - 1e-12,
      size: 0.1,
    });
    expect(r.levels).toEqual([0, 0.1, 0.2, 0.3]);
    const big = contourLevels({
      zmin: 0,
      zmax: 1,
      autocontour: false,
      start: 0,
      end: 1e6,
      size: 1,
    });
    expect(big.levels).toHaveLength(MAX_CONTOUR_LEVELS);
    expect(big.levels[999]).toBe(999);
  });

  it('falls back to automatic levels without start/end', () => {
    const r = contourLevels({ zmin: 0.3, zmax: 9.7, autocontour: false, start: 2 });
    expect(r.levels).toEqual(auto(0.3, 9.7).levels);
  });

  it('levelList handles degenerate steps', () => {
    expect(levelList(1, 1, 1)).toEqual([1]);
    expect(levelList(1, 5, 0)).toEqual([1]);
    expect(levelList(NaN, 5, 1)).toEqual([]);
  });
});

describe('color domains', () => {
  const lv = auto(0.3, 9.7); // 1…9 step 1

  it('spans half a band beyond the ends for fill', () => {
    expect(contourColorRange('fill', lv, 0.3, 9.7)).toEqual([0.5, 9.5]);
  });

  it('spans the levels for lines', () => {
    expect(contourColorRange('lines', lv, 0.3, 9.7)).toEqual([1, 9]);
    expect(contourColorRange('none', lv, 0.3, 9.7)).toEqual([1, 9]);
  });

  it('spans zmin/zmax for heatmap', () => {
    expect(contourColorRange('heatmap', lv, 0.3, 9.7)).toEqual([0.3, 9.7]);
  });

  it('never collapses for a single level', () => {
    const one = auto(5, 5);
    expect(contourColorRange('lines', one, 5, 5)).toEqual([4.5, 5.5]);
    expect(contourColorRange('fill', one, 5, 5)).toEqual([4.5, 5.5]);
  });

  it('bandValue is the middle of each band', () => {
    expect(bandValue(lv, -1)).toBe(0.5);
    expect(bandValue(lv, 0)).toBe(1.5);
    expect(bandValue(lv, 8)).toBe(9.5);
  });
});
