import { describe, expect, it } from 'vitest';
import { stackAreas, type AreaStackOptions } from './area.ts';

const PLAIN: AreaStackOptions = { groupnorm: '', stackgaps: 'infer zero' };

const arr = (v: ArrayLike<number>): number[] => Array.from(v);

describe('stackAreas (E9.4, Plotly scatter cross_trace_calc)', () => {
  it('adds sizes in trace order at shared positions', () => {
    const [a, b, c] = stackAreas(
      [
        { pos: [0, 1, 2], size: [1, 2, 3] },
        { pos: [0, 1, 2], size: [10, 20, 30] },
        { pos: [0, 1, 2], size: [100, 200, 300] },
      ],
      PLAIN,
    );
    expect(arr(a!.top)).toEqual([1, 2, 3]);
    expect(arr(b!.top)).toEqual([11, 22, 33]);
    expect(arr(c!.top)).toEqual([111, 222, 333]);
    // Each trace keeps its own value for hover.
    expect(arr(c!.value)).toEqual([100, 200, 300]);
    expect(arr(c!.pointTop)).toEqual([111, 222, 333]);
    expect(arr(a!.pos)).toEqual([0, 1, 2]);
  });

  it('sorts each trace by position and maps points back to their slots', () => {
    const [a, b] = stackAreas(
      [
        { pos: [2, 0, 1], size: [3, 1, 2] },
        { pos: [1, 2, 0], size: [20, 30, 10] },
      ],
      PLAIN,
    );
    expect(arr(a!.index)).toEqual([1, 2, 0]);
    expect(arr(b!.top)).toEqual([11, 22, 33]);
    // Point order is the input's.
    expect(arr(b!.pointTop)).toEqual([22, 33, 11]);
  });

  it("'infer zero': a missing position contributes 0 and is a gap", () => {
    const [a, b] = stackAreas(
      [
        { pos: [0, 1, 2, 3], size: [1, 1, 1, 1] },
        { pos: [0, 3], size: [5, 5] },
      ],
      PLAIN,
    );
    expect(arr(b!.pos)).toEqual([0, 1, 2, 3]);
    expect(arr(b!.top)).toEqual([6, 1, 1, 6]);
    expect(arr(b!.index)).toEqual([0, -1, -1, 1]);
    expect(arr(b!.gap)).toEqual([0, 1, 1, 0]);
    expect(arr(a!.gap)).toEqual([0, 0, 0, 0]);
  });

  it("'interpolate': linear inside a trace, constant beyond its ends", () => {
    const [, b] = stackAreas(
      [
        { pos: [0, 1, 2, 3, 4], size: [0, 0, 0, 0, 0] },
        { pos: [1, 3], size: [10, 30] },
      ],
      { groupnorm: '', stackgaps: 'interpolate' },
    );
    expect(arr(b!.top)).toEqual([10, 10, 20, 30, 30]);
    expect(arr(b!.gap)).toEqual([1, 0, 1, 0, 1]);
  });

  it('a point without a valid size is a gap: 0 or interpolated, never drawn', () => {
    const zero = stackAreas([{ pos: [0, 1, 2], size: [2, NaN, 4] }], PLAIN)[0]!;
    expect(arr(zero.top)).toEqual([2, 0, 4]);
    expect(arr(zero.pointTop)).toEqual([2, NaN, 4]);
    const interp = stackAreas([{ pos: [0, 1, 2], size: [2, NaN, 4] }], {
      groupnorm: '',
      stackgaps: 'interpolate',
    })[0]!;
    expect(arr(interp.top)).toEqual([2, 3, 4]);
    expect(arr(interp.gap)).toEqual([0, 1, 0]);
    expect(arr(interp.pointTop)).toEqual([2, NaN, 4]);
    // No valid size at all: zeros (Plotly).
    const none = stackAreas([{ pos: [0, 1], size: [NaN, NaN] }], {
      groupnorm: '',
      stackgaps: 'interpolate',
    })[0]!;
    expect(arr(none.top)).toEqual([0, 0]);
  });

  it('drops points without a valid position', () => {
    const [a] = stackAreas([{ pos: [0, NaN, 2], size: [1, 2, 3] }], PLAIN);
    expect(arr(a!.pos)).toEqual([0, 2]);
    expect(arr(a!.pointTop)).toEqual([1, NaN, 3]);
  });

  it('repeats the last value where another trace has a position more often', () => {
    const [a, b] = stackAreas(
      [
        { pos: [1, 1, 2], size: [1, 2, 3] },
        { pos: [1, 2], size: [10, 20] },
      ],
      PLAIN,
    );
    expect(arr(a!.pos)).toEqual([1, 1, 2]);
    expect(arr(b!.pos)).toEqual([1, 1, 2]);
    // Trace b duplicates its value at x = 1 (and its point index), as Plotly's insertBlank.
    expect(arr(b!.index)).toEqual([0, 0, 1]);
    expect(arr(b!.top)).toEqual([11, 12, 23]);
    // The point sits at its first slot.
    expect(arr(b!.pointTop)).toEqual([11, 23]);
  });

  it("groupnorm 'fraction' / 'percent' scales every position's total", () => {
    const inputs = [
      { pos: [0, 1], size: [1, 3] },
      { pos: [0, 1], size: [3, 1] },
    ];
    const [f0, f1] = stackAreas(inputs, { groupnorm: 'fraction', stackgaps: 'infer zero' });
    expect(arr(f0!.top)).toEqual([0.25, 0.75]);
    expect(arr(f1!.top)).toEqual([1, 1]);
    expect(arr(f1!.value)).toEqual([0.75, 0.25]);
    const [p0, p1] = stackAreas(inputs, { groupnorm: 'percent', stackgaps: 'infer zero' });
    expect(arr(p0!.top)).toEqual([25, 75]);
    expect(arr(p1!.top)).toEqual([100, 100]);
    expect(arr(p0!.pointValue)).toEqual([25, 75]);
  });

  it('a zero total normalizes by 1 (no NaN)', () => {
    const [a] = stackAreas([{ pos: [0], size: [0] }], {
      groupnorm: 'percent',
      stackgaps: 'infer zero',
    });
    expect(arr(a!.top)).toEqual([0]);
  });

  it('stacks negative values downwards like any other value', () => {
    const [, b] = stackAreas(
      [
        { pos: [0, 1], size: [2, 2] },
        { pos: [0, 1], size: [-3, 1] },
      ],
      PLAIN,
    );
    expect(arr(b!.top)).toEqual([-1, 3]);
  });

  it('handles empty traces', () => {
    const [a, b] = stackAreas(
      [
        { pos: [], size: [] },
        { pos: [0, 1], size: [1, 2] },
      ],
      PLAIN,
    );
    expect(arr(a!.pos)).toEqual([0, 1]);
    expect(arr(a!.top)).toEqual([0, 0]);
    expect(arr(b!.top)).toEqual([1, 2]);
  });
});
