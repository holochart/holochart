import { describe, expect, it } from 'vitest';
import { distinctValues, layoutBars, type StackInput, type StackOptions } from './index.ts';

function input(
  pos: number[],
  size: number[],
  extra: Partial<StackInput> & { base?: number[] } = {},
  key = 'k',
): StackInput {
  const base = extra.base ?? pos.map(() => 0);
  return {
    length: pos.length,
    pos: Float64Array.from(pos),
    size: Float64Array.from(size),
    base: Float64Array.from(base),
    hasBase: Uint8Array.from(
      base.map((_, i) => (extra.base ? (Number.isFinite(extra.base[i]) ? 1 : 0) : 0)),
    ),
    key,
    ...extra,
  };
}

const opts = (o: Partial<StackOptions> = {}): StackOptions => ({
  mode: 'group',
  gap: 0.2,
  groupgap: 0,
  norm: '',
  ...o,
});

const close = (a: ArrayLike<number>) => [...Array.from(a)].map((v) => +v.toFixed(9));

describe('distinctValues', () => {
  it('sorts, dedupes and finds the smallest gap', () => {
    expect(distinctValues([3, 1, 2, 2, 5])).toEqual({ values: [1, 2, 3, 5], minDiff: 1 });
  });
  it('uses 1 for a single value and for no values', () => {
    expect(distinctValues([7, 7]).minDiff).toBe(1);
    expect(distinctValues([]).minDiff).toBe(1);
  });
  it('merges values closer than the tolerance', () => {
    expect(distinctValues([0, 1e-9, 10]).values).toEqual([0, 10]);
  });
});

describe('layoutBars: widths and offsets', () => {
  it('gives a lone trace the slot minus bargap, centered', () => {
    const [a] = layoutBars([input([0, 1, 2], [1, 2, 3])], opts());
    expect(close(a!.width)).toEqual([0.8, 0.8, 0.8]);
    expect(close(a!.center)).toEqual([0, 1, 2]);
    expect(a!.slot).toBe(1);
    // Autorange covers the full slot around every position, unpadded.
    expect([a!.posMin, a!.posMax]).toEqual([-0.5, 2.5]);
  });

  it('groups overlapping traces side by side (with bargroupgap)', () => {
    const [a, b] = layoutBars(
      [input([0, 1], [1, 1], {}, 'a'), input([0, 1], [2, 2], {}, 'b')],
      opts({ groupgap: 0.1 }),
    );
    // Each gets 0.4 of the 0.8 group; 10% of that is gap.
    expect(close(a!.width)).toEqual([0.36, 0.36]);
    expect(close(a!.center)).toEqual([-0.2, 0.8]);
    expect(close(b!.center)).toEqual([0.2, 1.2]);
  });

  it('keeps full width in group mode when no positions overlap', () => {
    const [a, b] = layoutBars([input([0], [1], {}, 'a'), input([1], [1], {}, 'b')], opts());
    expect(close(a!.width)).toEqual([0.8]);
    expect(close(b!.center)).toEqual([1]);
  });

  it('centers bars in overlay, stack and relative modes', () => {
    for (const mode of ['overlay', 'stack', 'relative'] as const) {
      const [a, b] = layoutBars(
        [input([0], [1], {}, 'a'), input([0, 2], [1, 1], {}, 'b')],
        opts({ mode }),
      );
      expect(close(a!.center)).toEqual([0]);
      expect(close(b!.width)).toEqual([1.6, 1.6]);
    }
  });

  it('applies user width (kept centered) and offset, and widens the extent', () => {
    const [a] = layoutBars([input([0, 1], [1, 1], { width: [0.4, 'x'] })], opts());
    expect(close(a!.width)).toEqual([0.4, 0.8]);
    expect(close(a!.center)).toEqual([0, 1]);
    const [b] = layoutBars([input([0, 1], [1, 1], { width: 2, offset: 0 })], opts());
    expect(close(b!.center)).toEqual([1, 2]);
    expect(b!.posMax).toBe(3);
  });

  it('uses the minimum spacing hint for a single position (histogram bins)', () => {
    const [a] = layoutBars([input([5], [1], { minSpacing: 2 })], opts({ gap: 0 }));
    expect(close(a!.width)).toEqual([2]);
  });

  it('sizes date bars in ms', () => {
    const day = 86_400_000;
    const [a] = layoutBars([input([0, day, 2 * day], [1, 1, 1])], opts());
    expect(a!.width[0]).toBeCloseTo(0.8 * day);
  });
});

describe('layoutBars: offset and alignment groups', () => {
  it('lines up traces of one offset group and splits the slot between groups', () => {
    const [a, b, c] = layoutBars(
      [
        input([0], [1], { offsetgroup: 'g1' }, 'a'),
        input([0], [1], { offsetgroup: 'g2' }, 'b'),
        input([0], [1], { offsetgroup: 'g1' }, 'c'),
      ],
      opts(),
    );
    expect(close(a!.center)).toEqual([-0.2]);
    expect(close(b!.center)).toEqual([0.2]);
    expect(close(c!.center)).toEqual([-0.2]);
    expect(close(a!.width)).toEqual([0.4]);
  });

  it('reserves slots of offset groups on other subplots of the same axis', () => {
    const [a] = layoutBars([input([0], [1], { offsetgroup: 'B' })], {
      ...opts(),
      offsetGroups: () => ['A', 'B', 'C'],
    });
    expect(a!.width[0]).toBeCloseTo(0.8 / 3);
    expect(close(a!.center)).toEqual([0]);
  });

  it('lays out alignment groups independently', () => {
    const [a, b, c] = layoutBars(
      [
        input([0], [1], { offsetgroup: 'g1', alignmentgroup: 'L' }, 'a'),
        input([0], [1], { offsetgroup: 'g2', alignmentgroup: 'L' }, 'b'),
        input([0], [1], { offsetgroup: 'g1', alignmentgroup: 'R' }, 'c'),
      ],
      opts(),
    );
    expect(close(a!.width)).toEqual([0.4]);
    expect(close(b!.center)).toEqual([0.2]);
    // Alone in its alignment group: the whole slot.
    expect(close(c!.width)).toEqual([0.8]);
  });

  it('stacks within offset groups side by side in stack mode', () => {
    const [a, b, c] = layoutBars(
      [
        input([0], [1], { offsetgroup: 'g1' }, 'a'),
        input([0], [2], { offsetgroup: 'g1' }, 'b'),
        input([0], [5], { offsetgroup: 'g2' }, 'c'),
      ],
      opts({ mode: 'stack' }),
    );
    expect(close(a!.center)).toEqual([-0.2]);
    expect([b!.base[0], b!.top[0]]).toEqual([1, 3]);
    // g2 starts its own stack.
    expect([c!.base[0], c!.top[0]]).toEqual([0, 5]);
    expect(close(c!.center)).toEqual([0.2]);
  });
});

describe('layoutBars: sizes', () => {
  it('group/overlay: top = base + size, with tozero unless every bar has a base', () => {
    const [a] = layoutBars([input([0, 1], [3, -2])], opts());
    expect([...a!.top]).toEqual([3, -2]);
    expect(a!.tozero).toBe(true);
    expect(a!.padded).toBe(true);
    expect([...a!.sizePoints]).toEqual([3, -2]);
    const [b] = layoutBars([input([0, 1], [3, 1], { base: [1, 2] })], opts({ mode: 'overlay' }));
    expect([...b!.top]).toEqual([4, 3]);
    expect([...b!.sizePoints]).toEqual([4, 1, 3, 2]);
    expect(b!.tozero).toBe(false);
  });

  it('group: stacks bars of one trace at the same position so none is hidden', () => {
    const [a] = layoutBars([input([0, 0, 0], [2, 3, -1])], opts());
    expect([...a!.base]).toEqual([0, 2, 0]);
    expect([...a!.top]).toEqual([2, 5, -1]);
  });

  it('stack: accumulates in trace order and flags the outermost bar', () => {
    const [a, b] = layoutBars(
      [input([0, 1], [1, 2], {}, 'a'), input([0, 1], [3, -1], {}, 'b')],
      opts({ mode: 'stack' }),
    );
    expect([...a!.base, ...a!.top]).toEqual([0, 0, 1, 2]);
    expect([...b!.base, ...b!.top]).toEqual([1, 2, 4, 1]);
    expect([...a!.outmost]).toEqual([0, 0]);
    expect([...b!.outmost]).toEqual([1, 1]);
    // Values keep each bar's own length (hover, labels).
    expect([...b!.value]).toEqual([3, -1]);
    expect(b!.tozero).toBe(true);
  });

  it('relative: negative values stack downwards separately', () => {
    const [a, b, c] = layoutBars(
      [input([0], [2], {}, 'a'), input([0], [-1], {}, 'b'), input([0], [-3], {}, 'c')],
      opts({ mode: 'relative' }),
    );
    expect([a!.base[0], a!.top[0]]).toEqual([0, 2]);
    expect([b!.base[0], b!.top[0]]).toEqual([0, -1]);
    expect([c!.base[0], c!.top[0]]).toEqual([-1, -4]);
    expect([a!.outmost[0], b!.outmost[0], c!.outmost[0]]).toEqual([1, 0, 1]);
  });

  it('stack: a user base shifts a bar within its stack', () => {
    const [a, b] = layoutBars(
      [input([0], [2], {}, 'a'), input([0], [1], { base: [1] }, 'b')],
      opts({ mode: 'stack' }),
    );
    expect([a!.top[0]]).toEqual([2]);
    expect([b!.base[0], b!.top[0]]).toEqual([2, 4]);
  });

  it('skips bars without a position or size', () => {
    const [a] = layoutBars([input([0, NaN, 2], [1, 1, NaN])], opts({ mode: 'stack' }));
    expect([...a!.center].map(Number.isNaN)).toEqual([false, true, true]);
    expect([...a!.sizePoints]).toEqual([1]);
  });
});

describe('layoutBars: barnorm', () => {
  it('stack + percent: each position sums to 100 and the axis is not padded', () => {
    const [a, b] = layoutBars(
      [input([0, 1], [1, 3], {}, 'a'), input([0, 1], [3, 1], {}, 'b')],
      opts({ mode: 'stack', norm: 'percent' }),
    );
    expect(close([...a!.top, ...b!.top])).toEqual([25, 75, 100, 100]);
    expect(close(b!.value)).toEqual([75, 25]);
    expect(b!.padded).toBe(false);
    expect(b!.tozero).toBe(true);
  });

  it('group + fraction: normalizes across traces at each position', () => {
    const [a, b] = layoutBars(
      [input([0], [1], {}, 'a'), input([0], [3], {}, 'b')],
      opts({ norm: 'fraction' }),
    );
    expect(close([a!.top[0]!, b!.top[0]!])).toEqual([0.25, 0.75]);
  });

  it('relative + fraction: signs normalize separately and pad beyond zero', () => {
    const [a, b] = layoutBars(
      [input([0], [2], {}, 'a'), input([0], [-4], {}, 'b')],
      opts({ mode: 'relative', norm: 'fraction' }),
    );
    expect(close([a!.top[0]!, b!.top[0]!])).toEqual([1, -1]);
    expect(a!.padded).toBe(true);
  });
});
