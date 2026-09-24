import { createScale, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import {
  accumulateBins,
  autoBin,
  averageBins,
  BIN_FUNCTIONS,
  BIN_GROUPS_KEY,
  binAxis,
  binIncrement,
  binLabelRounder,
  cleanBinSize,
  makeBins,
  normalizeBins,
  resolveBins,
  supplyBinGroups,
  type BinGroup,
} from './bins.ts';

// Inputs shared with the expected values below, which come from plotly.js 3.5 (`Axes.autoBin`).
const WAVE = Array.from({ length: 200 }, (_, i) => Math.sin(i * 1.7) * 12 + (i % 17) * 0.8 + 40);
const DAY = 86_400_000;
const DAYS = Array.from({ length: 150 }, (_, i) => Date.UTC(2024, 0, 1) + ((i * 37) % 400) * DAY);
const MONTH_STARTS = Array.from({ length: 60 }, (_, i) =>
  Date.UTC(2020 + (i % 4), (i * 5) % 12, 1),
);
const HOURS = Array.from(
  { length: 120 },
  (_, i) => Date.UTC(2024, 2, 1) + ((i * 7919) % 86400) * 3000,
);

describe('autoBin (Plotly reference values)', () => {
  it.each([
    ['all-integer data: edges at k + 0.5', [1, 2, 2, 3, 3, 3, 4, 4, 5], {}, [0.5, 5.5, 1, 4]],
    ['continuous data: 2σ/n^0.4 rounded up to 5', WAVE, {}, [25, 65, 5, 35.48163426689927]],
    ['nbins hint', WAVE, { nbins: 5 }, [20, 70, 10, 35.48163426689927]],
    ['explicit size', WAVE, { size: 2.5 }, [27.5, 65, 2.5, 35.48163426689927]],
    ['large values', WAVE.map((v) => v * 1e6), {}, [25e6, 65e6, 5e6, 35481634.26689927]],
    ['negative values', WAVE.map((v) => 30 - v), {}, [-35, 5, 5, 35.48163426689927]],
    ['values on edges shift half a bin', [0, 5, 10, 15, 20, 25, 30], {}, [-0.5, 39.5, 10, 30]],
    ['one distinct value', [3, 3, 3], {}, [2.5, 3.5, 1, 0]],
  ] as const)('%s', (_name, data, options, [start, end, size, span]) => {
    const r = autoBin(Float64Array.from(data), 'linear', options);
    expect(r.start).toBeCloseTo(start, 9);
    expect(r.end).toBeCloseTo(end, 9);
    expect(r.size).toBe(size);
    expect(r.dataSpan).toBeCloseTo(span, 9);
  });

  it('keeps tiny sizes round', () => {
    const r = autoBin(
      WAVE.map((v) => v / 1e4),
      'linear',
    );
    expect(r.size).toBe(0.0005);
    expect(r.start).toBeCloseTo(0.0025, 12);
    expect(r.end).toBeCloseTo(0.0065, 12);
  });

  it.each([
    ['whole days: 2-month bins shifted half a day', DAYS, {}, [1704024000000, 1740744000000, 'M2']],
    ['M1', DAYS, { size: 'M1' }, [1704024000000, 1740744000000, 'M1']],
    ['M3 (quarters)', DAYS, { size: 'M3' }, [1704024000000, 1743422400000, 'M3']],
    ['month starts: bins centered on them', MONTH_STARTS, {}, [1576497600000, 1702728000000, 'M6']],
    ['years', MONTH_STARTS, { size: 'M12' }, [1576497600000, 1702728000000, 'M12']],
    ['sub-day data: ms sizes', HOURS, {}, [1709229600000, 1709532000000, 43200000]],
  ] as const)('dates: %s', (_name, data, options, [start, end, size]) => {
    const r = autoBin(Float64Array.from(data), 'date', options);
    expect([r.start, r.end, r.size]).toEqual([start, end, size]);
  });

  it('bins categories one (or `size`) per category', () => {
    const data = Float64Array.from([0, 1, 1, 2, 4, 4, 4]);
    expect(autoBin(data, 'category')).toEqual({ start: -0.5, end: 4.5, size: 1, dataSpan: 4 });
    expect(autoBin(data, 'category', { size: 2 }).size).toBe(2);
    expect(autoBin(data, 'category', { nbins: 2 }).size).toBe(1);
  });

  it('bins log axes linearly in data units', () => {
    expect(autoBin(Float64Array.from([1, 2, 2, 3]), 'log')).toMatchObject({ start: 0.5, size: 1 });
  });

  it('gives no bins without finite data and ignores NaN samples', () => {
    const empty = autoBin(Float64Array.from([NaN, NaN]), 'linear');
    expect(Number.isNaN(empty.start)).toBe(true);
    expect(makeBins(empty).count).toBe(0);
    expect(autoBin(Float64Array.from([1, NaN, 2, 2, 3]), 'linear').size).toBe(1);
  });

  it('cleans bin sizes per axis type', () => {
    expect(cleanBinSize('M3', 'date')).toBe('M3');
    expect(cleanBinSize('M3', 'linear')).toBeUndefined();
    expect(cleanBinSize('5', 'linear')).toBe(5);
    expect(cleanBinSize(-1, 'linear')).toBeUndefined();
    expect(cleanBinSize(2.4, 'category')).toBe(2);
  });
});

describe('bin edges and lookup', () => {
  it('lays out uniform bins and finds values (edges belong to the bin they start)', () => {
    const bins = makeBins({ start: 0, end: 10, size: 2.5 });
    expect([...bins.edges]).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(bins.uniform).toBe(true);
    expect([0, 2.4999, 2.5, 9.99, 10, -0.1, NaN].map(bins.find)).toEqual([0, 0, 1, 3, 4, -1, -1]);
  });

  it('stops at `end` less a millionth of a bin', () => {
    expect(makeBins({ start: 0, end: 10.000001, size: 5 }).count).toBe(2);
    expect(makeBins({ start: 0, end: 10.1, size: 5 }).count).toBe(3);
  });

  it('steps calendar months keeping the time of day, month ends mapping to month ends', () => {
    const jan = Date.UTC(2024, 0, 1);
    const bins = makeBins({ start: jan, end: Date.UTC(2024, 3, 1), size: 'M1' });
    expect([...bins.edges].map((v) => new Date(v).toISOString().slice(0, 10))).toEqual([
      '2024-01-01',
      '2024-02-01',
      '2024-03-01',
      '2024-04-01',
    ]);
    expect(bins.uniform).toBe(false);
    expect(bins.find(Date.UTC(2024, 1, 29, 23))).toBe(1);
    expect(bins.find(Date.UTC(2024, 2, 1))).toBe(2);
    // Plotly's incrementMonth: Nov 30 12:00 + 1 month is Dec 31 12:00 (not Dec 30).
    const nov30 = Date.UTC(2023, 10, 30, 12);
    expect(binIncrement(nov30, 'M1')).toBe(Date.UTC(2023, 11, 31, 12));
    expect(binIncrement(Date.UTC(2024, 2, 31), 'M1', true)).toBe(Date.UTC(2024, 1, 29));
  });

  it('steps numbers without float noise', () => {
    expect(binIncrement(0.1, 0.2)).toBe(0.3);
    expect(binIncrement(0.3, 0.1, true)).toBe(0.2);
  });
});

describe('aggregation', () => {
  it('counts, sums and averages; empty avg/min/max bins are NaN', () => {
    const values = [4, 6, 3, 'x', 7];
    const size = new Float64Array(3);
    const counts = new Float64Array(3);
    const bin = [0, 0, 1, 1, 0];
    let total = 0;
    for (let i = 0; i < 5; i++) total += BIN_FUNCTIONS.avg(bin[i]!, i, size, values, counts);
    expect(total).toBe(0);
    expect(averageBins(size, counts)).toBeCloseTo(17 / 3 + 3);
    expect([...size].map((v) => (Number.isNaN(v) ? null : v))).toEqual([17 / 3, 3, null]);

    const sums = new Float64Array(2);
    expect(BIN_FUNCTIONS.sum(0, 0, sums, [5], undefined)).toBe(5);
    expect(BIN_FUNCTIONS.count(1, 0, sums, undefined, undefined)).toBe(1);
    expect([...sums]).toEqual([5, 1]);

    const mins = new Float64Array(1).fill(NaN);
    expect(BIN_FUNCTIONS.min(0, 0, mins, [5, 2, 8], undefined)).toBe(5);
    expect(BIN_FUNCTIONS.min(0, 1, mins, [5, 2, 8], undefined)).toBe(-3);
    expect(BIN_FUNCTIONS.min(0, 2, mins, [5, 2, 8], undefined)).toBe(0);
    expect(mins[0]).toBe(2);
    const maxs = new Float64Array(1).fill(NaN);
    for (let i = 0; i < 3; i++) BIN_FUNCTIONS.max(0, i, maxs, [5, 2, 8], undefined);
    expect(maxs[0]).toBe(8);
  });

  it('normalizes (histnorm); empty bins become 0 as in Plotly', () => {
    const run = (norm: Parameters<typeof normalizeBins>[1], size: number[], total = 10) => {
      const s = Float64Array.from(size);
      normalizeBins(s, norm, total, [0.5, 0.5, 0.25], undefined);
      return [...s];
    };
    expect(run('percent', [2, 3, 5])).toEqual([20, 30, 50]);
    expect(run('probability', [2, 3, 5])).toEqual([0.2, 0.3, 0.5]);
    expect(run('density', [2, 3, 4])).toEqual([1, 1.5, 1]);
    const pd = run('probability density', [2, 3, 4]);
    [0.1, 0.15, 0.1].forEach((v, i) => expect(pd[i]).toBeCloseTo(v, 12));
    expect(run('probability', [NaN, 5, 5])).toEqual([0, 0.5, 0.5]);
    expect(run('', [NaN, 5, 5]).map((v) => (Number.isNaN(v) ? null : v))).toEqual([null, 5, 5]);
    const yinc = Float64Array.from([2]);
    normalizeBins(yinc, 'density', 1, [0.5], 4);
    expect(yinc[0]).toBe(4);
  });

  it.each([
    ['increasing', 'include', [1, 3, 6, 10]],
    ['increasing', 'exclude', [0, 1, 3, 6]],
    ['increasing', 'half', [0.5, 2, 4.5, 8]],
    ['decreasing', 'include', [10, 9, 7, 4]],
    ['decreasing', 'exclude', [9, 7, 4, 0]],
    ['decreasing', 'half', [9.5, 8, 5.5, 2]],
  ] as const)('accumulates %s / %s', (direction, currentbin, expected) => {
    const s = Float64Array.from([1, 2, 3, 4]);
    accumulateBins(s, direction, currentbin);
    expect([...s]).toEqual(expected);
  });

  it('accumulates over empty bins like Plotly (null + v), the untouched first bin stays empty', () => {
    const s = Float64Array.from([NaN, 2, NaN, 4]);
    accumulateBins(s, 'increasing', 'include');
    expect([...s].map((v) => (Number.isNaN(v) ? null : v))).toEqual([null, 2, 2, 6]);
    const d = Float64Array.from([NaN, 2, NaN, 4]);
    accumulateBins(d, 'increasing', 'half');
    expect([...d]).toEqual([0, 1, 2, 4]);
  });
});

describe('bin labels (Plotly getBinSpanLabelRound)', () => {
  it('rounds integer data in bins of 5 to 0 - 4', () => {
    // Samples 1…13 in [-0.5, 4.5), [4.5, 9.5)…: gaps of 0.5 on both sides.
    const round = binLabelRounder(0.5, 0.5, [-0.5, 4.5, 9.5], 'linear');
    expect([round(-0.5), round(4.5, true), round(4.5), round(9.5, true)].map((v) => v + 0)).toEqual(
      [0, 4, 5, 9],
    );
  });

  it('keeps one more digit for continuous data', () => {
    const round = binLabelRounder(0.01, 0.02, [25, 30, 35], 'linear');
    expect([round(25), round(30, true)]).toEqual([25, 29.99]);
  });

  it('rounds month bins shifted half a day to whole months', () => {
    const edges = [
      Date.UTC(2023, 11, 31, 12),
      Date.UTC(2024, 0, 31, 12),
      Date.UTC(2024, 1, 29, 12),
    ];
    const round = binLabelRounder(12 * 3600e3, 12 * 3600e3, edges, 'date');
    expect(new Date(round(edges[0]!)).toISOString().slice(0, 10)).toBe('2024-01-01');
    expect(new Date(round(edges[1]!, true)).toISOString().slice(0, 10)).toBe('2024-01-31');
  });
});

function trace(
  index: number,
  props: Record<string, unknown>,
  categories: readonly string[] = ['histogram'],
): FullTrace {
  return {
    type: 'histogram',
    visible: true,
    xaxis: 'x',
    yaxis: 'y',
    orientation: 'v',
    bingroup: '',
    alignmentgroup: '',
    _index: index,
    _input: props,
    _module: { categories } as FullTrace['_module'],
    ...props,
  } as unknown as FullTrace;
}

function groups(fullData: FullTrace[], barmode: string): Record<string, BinGroup> {
  const fullLayout = { barmode } as unknown as FullLayout;
  supplyBinGroups(fullData, fullLayout);
  return fullLayout[BIN_GROUPS_KEY] as Record<string, BinGroup>;
}

describe('bin groups (Plotly crossTraceDefaults)', () => {
  it('stack and group modes share bins per subplot and direction; overlay does not', () => {
    const data = () => [
      trace(0, { x: [1] }),
      trace(1, { x: [2] }),
      trace(2, { x: [3], yaxis: 'y2' }),
    ];
    const stacked = data();
    const g = groups(stacked, 'stack');
    expect(stacked.map((t) => t['_xbingroup'])).toEqual(['xyx', 'xyx', '\u00002__x']);
    expect(stacked[0]!['bingroup']).toBe('xyx');
    expect(g['xyx']?.traces).toHaveLength(2);
    const overlaid = data();
    groups(overlaid, 'overlay');
    expect(new Set(overlaid.map((t) => t['_xbingroup'])).size).toBe(3);
  });

  it('names must-match groups after the first bingroup and joins others by bingroup', () => {
    const data = [
      trace(0, { x: [1], bingroup: 'a' }),
      trace(1, { x: [2], bingroup: 'b' }),
      trace(2, { x: [3], yaxis: 'y2', bingroup: 'a' }),
    ];
    const g = groups(data, 'group');
    expect(data.map((t) => t['_xbingroup'])).toEqual(['a', 'a', 'a']);
    expect(g['a']?.traces.map((t) => t._index)).toEqual([0, 1, 2]);
  });

  it('matches group-mode histograms with an alignment group across subplots', () => {
    const data = [
      trace(0, { x: [1], alignmentgroup: 'g' }),
      trace(1, { x: [2], alignmentgroup: 'g', yaxis: 'y2' }),
    ];
    groups(data, 'group');
    expect(data[0]!['_xbingroup']).toBe(data[1]!['_xbingroup']);
  });

  it('takes group settings from the first member that sets them; autobinx ignores xbins', () => {
    const data = [
      trace(0, { x: [1], bingroup: 'a', nbinsx: 4 }),
      trace(1, { x: [2], bingroup: 'a', xbins: { size: 2, start: 0 } }),
      trace(2, { x: [3], bingroup: 'a', xbins: { end: 9 }, autobinx: true }),
    ];
    const g = groups(data, 'overlay')['a']!;
    expect(g).toMatchObject({ size: 2, sizeFound: true, start: 0, startFound: true });
    expect(g.endFound).toBeUndefined();
    expect(g.nbinsFound).toBeUndefined();
  });

  it('bins 2D histograms in both directions by xbingroup / ybingroup (default bingroup__x)', () => {
    const t2d = trace(0, { x: [1], y: [1], bingroup: 'm' }, ['histogram', '2dMap']);
    const t1d = trace(1, { x: [2], bingroup: 'm__x' });
    const g = groups([t2d, t1d], 'group');
    expect([t2d['_xbingroup'], t2d['_ybingroup']]).toEqual(['m__x', 'm__y']);
    expect(g['m__x']?.traces).toHaveLength(2);
    expect(g['m__x']?.dirs).toEqual(['x', 'x']);
    expect(g['m__y']?.dirs).toEqual(['y']);
  });
});

describe('resolveBins (Plotly calcAllAutoBins)', () => {
  const axis = binAxis(createScale({ type: 'linear' }));

  function resolve(data: FullTrace[], barmode = 'overlay') {
    const fullLayout = { barmode, xaxis: { type: 'linear' } } as unknown as FullLayout;
    supplyBinGroups(data, fullLayout);
    return data.map((t) => resolveBins(t, 'x', axis, fullLayout));
  }

  it('bins a group from every member’s samples', () => {
    const [a, b] = resolve([trace(0, { x: [1, 2, 2, 3] }), trace(1, { x: [30, 31, 35] })], 'stack');
    expect(a!.spec).toEqual(b!.spec);
    expect(a!.group).toBe('xyx');
    expect([...a!.positions]).toEqual([1, 2, 2, 3]);
  });

  it('moves another member’s explicit start onto the grid below this trace’s data', () => {
    const [a, b] = resolve([
      trace(0, { x: [1, 2, 3], bingroup: 'g', xbins: { start: 0.5, size: 1 } }),
      trace(1, { x: [4.2, 5, 6], bingroup: 'g' }),
    ]);
    expect(a!.spec).toMatchObject({ start: 0.5, size: 1 });
    expect(b!.spec).toMatchObject({ start: 3.5, size: 1 });
  });

  it('ends a member’s bins at its own maximum when another member sets an end', () => {
    const [, b] = resolve([
      trace(0, { x: [1, 2, 3], bingroup: 'g', xbins: { end: 3 } }),
      trace(1, { x: [4, 5, 6], bingroup: 'g' }),
    ]);
    expect(b!.spec.end).toBe(6);
  });

  it('widens cumulative bins that exclude the current bin', () => {
    const [plain] = resolve([trace(0, { x: [1, 2, 2, 3] })]);
    const [cum] = resolve([
      trace(0, { x: [1, 2, 2, 3], cumulative: { enabled: true, currentbin: 'exclude' } }),
    ]);
    expect(cum!.spec.end).toBe((plain!.spec.end as number) + 1);
  });

  it('sizes a single-valued overlaid histogram from the others (Plotly: 6 to 8, size 2)', () => {
    const [, single] = resolve([trace(0, { x: [1, 2, 2, 3, 4, 5] }), trace(1, { x: [7, 7, 7] })]);
    expect(single!.spec).toEqual({ start: 6, end: 8, size: 2 });
  });

  it('shares the label gaps of the whole group', () => {
    const [a] = resolve([trace(0, { x: [1, 2] }), trace(1, { x: [2.25, 3] })], 'stack');
    expect(a!.spec).toEqual({ start: 0.5, end: 3.5, size: 1 });
    expect(a!.gaps.left).toBeCloseTo(0.5);
    expect(a!.gaps.right).toBeCloseTo(0.25);
  });
});
