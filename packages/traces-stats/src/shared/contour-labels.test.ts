import { describe, expect, it } from 'vitest';
import { cutPath, placeContourLabels, type LabelPath } from './contour-labels.ts';

const rect = { x0: 0, y0: 0, x1: 1000, y1: 100 };
const size = { width: 40, height: 12 };

function line(x0: number, y0: number, x1: number, y1: number, n = 11): LabelPath {
  const x: number[] = [];
  const y: number[] = [];
  for (let k = 0; k < n; k++) {
    x.push(x0 + ((x1 - x0) * k) / (n - 1));
    y.push(y0 + ((y1 - y0) * k) / (n - 1));
  }
  return { x, y, closed: false };
}

describe('placeContourLabels', () => {
  it('spreads labels evenly along long paths', () => {
    const { labels, gaps } = placeContourLabels([line(0, 50, 1000, 50)], [size], rect);
    // Default spacing max(300, 8·40) = 320 px → 3 labels.
    expect(labels).toHaveLength(3);
    expect(labels.map((l) => +l.s.toFixed(6))).toEqual([166.666667, 500, 833.333333]);
    for (const l of labels) {
      expect(l.path).toBe(0);
      expect(l.angle).toBe(0);
      expect(l.y).toBeCloseTo(50, 12);
      expect(l.x).toBeCloseTo(l.s, 9);
    }
    const g = gaps.get(0)!;
    expect(g).toHaveLength(3);
    expect(g[1]![0]).toBeCloseTo(500 - 23, 9);
    expect(g[1]![1]).toBeCloseTo(500 + 23, 9);
  });

  it('honours the spacing option', () => {
    const { labels } = placeContourLabels([line(0, 50, 1000, 50)], [size], rect, { spacing: 200 });
    expect(labels).toHaveLength(5);
  });

  it('keeps angles readable and clockwise-positive', () => {
    const big = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    const up = placeContourLabels([line(100, 100, 900, 900)], [size], big).labels;
    const down = placeContourLabels([line(900, 900, 100, 100)], [size], big).labels;
    // Rising to the right (y up) is a counter-clockwise rotation: −45° clockwise.
    expect(up[0]!.angle).toBeCloseTo(-45, 9);
    expect(down[0]!.angle).toBeCloseTo(-45, 9);
    const left = placeContourLabels([line(1000, 50, 0, 50)], [size], rect).labels;
    expect(left.every((l) => l.angle === 0)).toBe(true);
    const vertical = placeContourLabels([line(500, 900, 500, 100)], [size], big).labels;
    expect(vertical[0]!.angle).toBe(90);
    for (const l of [...up, ...down, ...vertical]) {
      expect(l.angle).toBeGreaterThan(-90);
      expect(l.angle).toBeLessThanOrEqual(90);
    }
  });

  it('skips paths shorter than minPathFactor label widths', () => {
    expect(placeContourLabels([line(0, 50, 100, 50)], [size], rect).labels).toHaveLength(0);
    expect(placeContourLabels([line(0, 50, 130, 50)], [size], rect).labels).toHaveLength(1);
    const opt = { minPathFactor: 4 };
    expect(placeContourLabels([line(0, 50, 130, 50)], [size], rect, opt).labels).toHaveLength(0);
    expect(placeContourLabels([line(0, 50, 1000, 50)], [undefined], rect).labels).toHaveLength(0);
  });

  it('rejects positions whose box leaves the plot', () => {
    expect(placeContourLabels([line(0, 5, 1000, 5)], [size], rect).labels).toHaveLength(0);
    // Half height 6 + padding 3 = 9 px from the edge is just enough.
    expect(placeContourLabels([line(0, 9, 1000, 9)], [size], rect).labels).toHaveLength(3);
    // A path that leaves the plot: labels slide back inside.
    const labels = placeContourLabels([line(-600, 50, 1000, 50)], [size], rect).labels;
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l.x).toBeGreaterThanOrEqual(23);
  });

  it('rejects or slides labels that would overlap earlier ones', () => {
    const paths = [line(0, 50, 1000, 50), line(0, 55, 1000, 55)];
    const tight = placeContourLabels(paths, [size, size], rect, { spacing: 60 });
    expect(tight.labels.filter((l) => l.path === 0)).toHaveLength(16);
    expect(tight.labels.filter((l) => l.path === 1)).toHaveLength(0);
    expect(tight.gaps.has(1)).toBe(false);
    const loose = placeContourLabels(paths, [size, size], rect);
    const first = loose.labels.filter((l) => l.path === 0);
    const second = loose.labels.filter((l) => l.path === 1);
    expect(second.length).toBeGreaterThan(0);
    for (const a of first)
      for (const b of second) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(46);
  });

  it('labels closed paths and wraps their gaps', () => {
    const n = 64;
    const x: number[] = [];
    const y: number[] = [];
    for (let k = 0; k < n; k++) {
      x.push(500 + 100 * Math.cos((2 * Math.PI * k) / n));
      y.push(500 + 100 * Math.sin((2 * Math.PI * k) / n));
    }
    const big = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    const { labels, gaps } = placeContourLabels([{ x, y, closed: true }], [size], big, {
      spacing: 150,
    });
    expect(labels).toHaveLength(4);
    for (const l of labels) expect(Math.hypot(l.x - 500, l.y - 500)).toBeCloseTo(100, 0);
    for (const [a, b] of gaps.get(0)!) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThan(a);
    }
  });

  it('is deterministic', () => {
    const paths = [line(0, 50, 1000, 50), line(0, 20, 1000, 80)];
    expect(placeContourLabels(paths, [size, size], rect)).toEqual(
      placeContourLabels(paths, [size, size], rect),
    );
  });
});

describe('cutPath', () => {
  const straight = { x: [0, 50, 100], y: [0, 0, 0] };

  it('removes gaps from open paths', () => {
    const pieces = cutPath(straight.x, straight.y, false, [[40, 60]]);
    expect(pieces).toHaveLength(2);
    expect(Array.from(pieces[0]!.x)).toEqual([0, 40]);
    expect(Array.from(pieces[1]!.x)).toEqual([60, 100]);
  });

  it('merges overlapping gaps and clips them to the path', () => {
    const pieces = cutPath(straight.x, straight.y, false, [
      [30, 45],
      [40, 60],
      [90, 120],
      [-10, 5],
    ]);
    expect(pieces.map((p) => Array.from(p.x))).toEqual([
      [5, 30],
      [60, 90],
    ]);
  });

  it('returns the whole path without gaps, nothing when fully cut', () => {
    expect(cutPath(straight.x, straight.y, false, []).map((p) => Array.from(p.x))).toEqual([
      [0, 50, 100],
    ]);
    expect(cutPath(straight.x, straight.y, false, [[-1, 200]])).toHaveLength(0);
  });

  it('joins the pieces of closed paths across the start', () => {
    const sq = { x: [0, 100, 100, 0], y: [0, 0, 100, 100] };
    const whole = cutPath(sq.x, sq.y, true, []);
    expect(whole).toHaveLength(1);
    expect(Array.from(whole[0]!.x)).toEqual([0, 100, 100, 0, 0]);
    const one = cutPath(sq.x, sq.y, true, [[150, 250]]);
    expect(one).toHaveLength(1);
    expect(Array.from(one[0]!.x)).toEqual([50, 0, 0, 100, 100]);
    expect(Array.from(one[0]!.y)).toEqual([100, 100, 0, 0, 50]);
    const wrapped = cutPath(sq.x, sq.y, true, [[-10, 10]]);
    expect(wrapped).toHaveLength(1);
    expect(Array.from(wrapped[0]!.x)).toEqual([10, 100, 100, 0, 0]);
    expect(Array.from(wrapped[0]!.y)).toEqual([0, 0, 100, 100, 10]);
    const two = cutPath(sq.x, sq.y, true, [
      [50, 60],
      [350, 420],
    ]);
    expect(two).toHaveLength(2);
    expect(Array.from(two[0]!.x)).toEqual([20, 50]);
    expect(Array.from(two[1]!.x)).toEqual([60, 100, 100, 0, 0]);
    expect(Array.from(two[1]!.y)).toEqual([0, 0, 100, 100, 50]);
  });
});
