import {
  collectCategories,
  createScale,
  supplyDefaults,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import { IDENTITY_TRANSFORM } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CrossTraceEntry,
  type HoverContext,
} from '@mk7s/holochart-runtime';
import { bar, type BarCalc } from '@mk7s/holochart-traces-basic';
import { describe, expect, it } from 'vitest';
import { histogram, type HistogramCalc } from './index.ts';
import { histogramPositionValue, selectedBars } from './hover.ts';

const registry = createChartRegistry().register(bar, histogram);

interface Run {
  fullData: FullTrace[];
  fullLayout: FullLayout;
  calcs: (HistogramCalc | BarCalc | undefined)[];
  axis(id: string): AxisInfo;
}

/** Defaults, calc and cross-trace calc of a figure on one subplot, like the runtime. */
function run(data: Record<string, unknown>[], layout: Record<string, unknown> = {}): Run {
  const { fullData, fullLayout } = supplyDefaults({ data, layout }, registry.core);
  const axes = new Map<string, AxisInfo>();
  const axis = (id: string): AxisInfo => {
    let info = axes.get(id);
    if (info) return info;
    const name = `${id.charAt(0)}axis${id.slice(1)}`;
    const full = fullLayout[name] as { type?: string } | undefined;
    const type = (full?.type ?? 'linear') as 'linear';
    const letter = id.charAt(0) as 'x' | 'y';
    const categories =
      (type as string) === 'category'
        ? collectCategories(
            fullData.filter((t) => t[`${letter}axis`] === id).map((t) => t[letter] as string[]),
          )
        : undefined;
    const scale = createScale({ type, range: [0, 1], ...(categories ? { categories } : {}) });
    info = { id, name, letter, type, scale, full: full ?? { type } } as unknown as AxisInfo;
    axes.set(id, info);
    return info;
  };
  const calcs = fullData.map((trace, index) => {
    if (trace.visible !== true) return undefined;
    const module = trace.type === 'bar' ? bar : histogram;
    const calc = module.calc as (t: FullTrace, ctx: unknown) => HistogramCalc | BarCalc;
    return calc(trace, {
      fullLayout,
      index,
      xaxis: axis(String(trace['xaxis'])),
      yaxis: axis(String(trace['yaxis'])),
    });
  });
  const entries = fullData
    .map((trace, index) => ({ trace, index, calc: calcs[index] }))
    .filter((e): e is CrossTraceEntry<HistogramCalc> => e.calc !== undefined);
  const first = entries[0]?.trace.type === 'bar' ? bar : histogram;
  (first.crossTraceCalc as (e: unknown, ctx: unknown) => void)(entries, {
    fullLayout,
    xaxis: axis('x'),
    yaxis: axis('y'),
    subplot: {},
  });
  return { fullData, fullLayout, calcs, axis };
}

function hist(r: Run, i = 0): HistogramCalc {
  return r.calcs[i] as HistogramCalc;
}

/** Bars as Plotly's calcdata reads them: `[position, value, base, samples, center, width]`. */
function bars(r: Run, i = 0): number[][] {
  const c = r.calcs[i] as HistogramCalc;
  return Array.from({ length: c.length }, (_, k) => [
    Number(c.positionValues?.[k] ?? c.pos[k]),
    c.bars.value[k]!,
    c.bars.base[k]!,
    c.points?.[k]?.length ?? -1,
    c.bars.center[k]!,
    c.bars.width[k]!,
  ]);
}

function labels(r: Run, i = 0): unknown[] {
  const c = hist(r, i);
  const pa = r.axis(c.orientation === 'h' ? 'y' : 'x');
  return Array.from({ length: c.length }, (_, k) => histogramPositionValue(c, k, pa));
}

function closeTo(actual: number[][], expected: number[][]): void {
  expect(actual.length).toBe(expected.length);
  actual.forEach((row, k) => row.forEach((v, j) => expect(v).toBeCloseTo(expected[k]![j]!, 6)));
}

const INTS = [1, 2, 2, 3, 3, 3, 4, 4, 5, 6, 6, 7, 8, 9, 12, 13];
const WAVE = Array.from({ length: 200 }, (_, i) =>
  Number((Math.sin(i * 1.7) * 12 + (i % 17) * 0.8 + 40).toFixed(2)),
);
const DAY = 86_400_000;
const DAYS = Array.from({ length: 90 }, (_, i) =>
  new Date(Date.UTC(2024, 0, 1) + ((i * 37) % 200) * DAY).toISOString().slice(0, 10),
);

describe('histogram defaults', () => {
  it('infers the orientation, counts samples and hides traces without samples', () => {
    const { fullData } = supplyDefaults(
      {
        data: [
          { type: 'histogram', x: [1, 2] },
          { type: 'histogram', y: [1, 2, 3] },
          { type: 'histogram', x: [1, 2, 3], y: [4, 5] },
          { type: 'histogram' },
        ],
      },
      registry.core,
    );
    expect(fullData.map((t) => t['orientation'])).toEqual(['v', 'h', 'v', 'v']);
    expect(fullData.map((t) => t['_length'])).toEqual([2, 3, 2, undefined]);
    expect(fullData[3]!.visible).toBe(false);
    // `histfunc` only matters (and is only coerced) with values to aggregate.
    expect(fullData[0]!['histfunc']).toBeUndefined();
    expect(fullData[2]!['histfunc']).toBe('count');
    expect(fullData[0]!['histnorm']).toBe('');
    expect(fullData[0]!['marker']).toMatchObject({ opacity: 1 });
  });

  it('defaults bargap to 0 next to a histogram, as Plotly', () => {
    const gap = (data: Record<string, unknown>[], layout = {}) =>
      supplyDefaults({ data, layout }, registry.core).fullLayout['bargap'];
    expect(gap([{ type: 'histogram', x: [1, 2] }])).toBe(0);
    // Two bar-like traces grouped on one subplot keep a gap.
    expect(
      gap([
        { type: 'histogram', x: [1] },
        { type: 'histogram', x: [2] },
      ]),
    ).toBe(0.2);
    expect(
      gap(
        [
          { type: 'histogram', x: [1] },
          { type: 'histogram', x: [2] },
        ],
        { barmode: 'stack' },
      ),
    ).toBe(0);
    // Category samples keep a gap; bars alone are unchanged.
    expect(gap([{ type: 'histogram', x: ['a', 'b'] }])).toBe(0.2);
    expect(gap([{ type: 'bar', x: [1], y: [1] }])).toBe(0.2);
    expect(
      gap(
        [
          { type: 'bar', x: [1], y: [1] },
          { type: 'histogram', x: [1] },
        ],
        { barmode: 'stack' },
      ),
    ).toBe(0);
    expect(gap([{ type: 'histogram', x: [1] }], { bargap: 0.1 })).toBe(0.1);
  });
});

// Expected values: plotly.js 3.5 calcdata (`p`, `s`, `b`, `pts.length`, bar center, `w`) and
// hover labels (`hoverLabelText` of `ph0` / `ph1`) for the same figures.
describe('histogram calc (Plotly reference figures)', () => {
  it('bins integers with Plotly’s auto size and labels bins 0 - 4, 5 - 9', () => {
    const r = run([{ type: 'histogram', x: INTS }]);
    closeTo(bars(r), [
      [2, 8, 0, 8, 2, 5],
      [7, 6, 0, 6, 7, 5],
      [12, 2, 0, 2, 12, 5],
    ]);
    expect(labels(r)).toEqual(['0 - 4', '5 - 9', '10 - 14']);
    expect(r.fullLayout['bargap']).toBe(0);
  });

  it('bins dates by calendar month, labelled with whole months', () => {
    const r = run([{ type: 'histogram', x: DAYS, xbins: { size: 'M1' } }]);
    const c = hist(r);
    expect(Array.from(c.positionValues as ArrayLike<number>)).toEqual([
      1705363200000, 1707955200000, 1710547200000, 1713182400000, 1715817600000, 1718452800000,
      1721088000000,
    ]);
    expect(Array.from(c.bars.value)).toEqual([14, 14, 13, 14, 13, 12, 10]);
    // Bars share the smallest spacing between bin centers (Plotly).
    expect(c.bars.width[0]).toBe(2592000000);
    expect(labels(r).slice(0, 2)).toEqual([
      'Jan 1, 2024 - Jan 31, 2024',
      'Feb 1, 2024 - Feb 29, 2024',
    ]);
  });

  it('counts categories one per bin and labels them by name', () => {
    const r = run([{ type: 'histogram', x: ['b', 'a', 'b', 'c', 'b', 'a'] }]);
    closeTo(bars(r), [
      [0, 3, 0, 3, 0, 0.8],
      [1, 2, 0, 2, 1, 0.8],
      [2, 1, 0, 1, 2, 0.8],
    ]);
    expect(labels(r)).toEqual(['b', 'a', 'c']);
  });

  it('normalizes to percent and accumulates (cumulative sums reach 100)', () => {
    const r = run([
      { type: 'histogram', x: WAVE, histnorm: 'percent', cumulative: { enabled: true } },
    ]);
    expect(Array.from(hist(r).bars.value)).toEqual([2, 15, 30.5, 46.5, 61, 77.5, 93, 100]);
    expect(Array.from(hist(r).positionValues as ArrayLike<number>)[0]).toBe(27.5);
    // Cumulative bars have no samples; hover shows the bin center.
    expect(hist(r).points[0]).toEqual([]);
    expect(labels(r)[0]).toBe(27.5);
  });

  it('averages the other coordinate (histfunc avg) with probability norm; empty bins are 0', () => {
    const r = run([
      {
        type: 'histogram',
        x: [1, 1, 2, 5, 5, 9],
        y: [4, 6, 3, 10, 'x', 7],
        histfunc: 'avg',
        histnorm: 'probability',
        xbins: { size: 1 },
      },
    ]);
    const values = Array.from(hist(r).bars.value);
    [0.2, 0.12, 0, 0, 0.4, 0, 0, 0, 0.28].forEach((v, k) => expect(values[k]).toBeCloseTo(v, 12));
    // Every sample of a bin has the same value: the label is that value.
    expect(labels(r).slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('takes the minimum per bin (histfunc min) with density norm', () => {
    const r = run([
      {
        type: 'histogram',
        x: [0.5, 1.5, 1.7, 3.2, 3.9],
        y: [5, 2, 8, 1, 4],
        histfunc: 'min',
        histnorm: 'density',
        xbins: { start: 0, end: 4, size: 1 },
      },
    ]);
    expect(Array.from(hist(r).bars.value)).toEqual([5, 2, 0, 1]);
    expect(labels(r)).toEqual(['0 - 0.9', '1 - 1.9', '2 - 2.9', '3 - 3.9']);
  });

  it('overlaid histograms bin (and size their bars) independently', () => {
    const r = run(
      [
        { type: 'histogram', x: WAVE },
        { type: 'histogram', x: WAVE.map((v) => v / 4 + 20) },
      ],
      { barmode: 'overlay' },
    );
    expect(hist(r, 0).bars.width[0]).toBe(5);
    expect(hist(r, 1).bars.width[0]).toBe(1);
    expect(labels(r, 0)[0]).toBe('25 - 29.99');
    expect(labels(r, 1)[0]).toBe('26.5 - 27.499');
  });

  it('grouped histograms share bins and split each slot', () => {
    const r = run([
      { type: 'histogram', x: WAVE },
      { type: 'histogram', x: WAVE.map((v) => v / 4 + 20) },
    ]);
    expect(r.fullLayout['bargap']).toBe(0.2);
    closeTo(bars(r, 1), [
      [28, 31, 0, 31, 28.4, 0.8],
      [30, 57, 0, 57, 30.4, 0.8],
      [32, 48, 0, 48, 32.4, 0.8],
      [34, 50, 0, 50, 34.4, 0.8],
      [36, 14, 0, 14, 36.4, 0.8],
    ]);
    closeTo(bars(r, 0).slice(0, 1), [[28, 2, 0, 2, 27.6, 0.8]]);
    expect(labels(r, 1)[0]).toBe('27 - 28.99');
  });

  it('bins y for horizontal histograms', () => {
    const r = run([{ type: 'histogram', y: INTS, ybins: { size: 5 } }]);
    expect(hist(r).orientation).toBe('h');
    closeTo(bars(r), [
      [2, 8, 0, 8, 2, 5],
      [7, 6, 0, 6, 7, 5],
      [12, 2, 0, 2, 12, 5],
    ]);
    expect(labels(r)).toEqual(['0 - 4', '5 - 9', '10 - 14']);
  });

  it('sizes a lone bin by its bin width (Plotly width1)', () => {
    const r = run([{ type: 'histogram', x: [3, 3.2, 3.4], xbins: { start: 0, size: 10 } }]);
    expect(hist(r).length).toBe(1);
    expect(hist(r).bars.width[0]).toBe(10);
  });
});

describe('stacking with bars', () => {
  it('stacks bars on histogram bins at the same positions (one stack group, Plotly)', () => {
    const r = run(
      [
        { type: 'histogram', x: INTS, xbins: { start: -0.5, size: 5 } },
        { type: 'bar', x: [2, 7, 12], y: [1, 2, 3] },
      ],
      { barmode: 'stack' },
    );
    const b = r.calcs[1] as BarCalc;
    expect(Array.from(b.bars.base)).toEqual([8, 6, 2]);
    expect(Array.from(b.bars.top)).toEqual([9, 8, 5]);
    expect(Array.from(b.bars.width)).toEqual([5, 5, 5]);
    expect(r.fullLayout['bargap']).toBe(0);
  });

  it('stacks in any trace order and normalizes with barnorm', () => {
    const r = run(
      [
        { type: 'bar', x: [2, 7], y: [2, 6] },
        { type: 'histogram', x: [1, 2, 3, 6, 8], xbins: { start: -0.5, size: 5 } },
      ],
      { barmode: 'stack', barnorm: 'percent' },
    );
    const h = hist(r, 1);
    expect(Array.from(h.bars.base)).toEqual([40, 75]);
    expect(Array.from(h.bars.top)).toEqual([100, 100]);
  });
});

describe('histogram hover and selection', () => {
  const r = run([{ type: 'histogram', x: INTS }]);
  const c = hist(r);
  const ctx: HoverContext = {
    fullLayout: r.fullLayout,
    xaxis: r.axis('x'),
    yaxis: r.axis('y'),
    // l → px: x = 10·l, y = 10·l.
    transform: { ...IDENTITY_TRANSFORM, scaleX: 10, offsetX: 0, scaleY: 10, offsetY: 0 },
  };

  it('labels the bin range and reports the bin’s samples', () => {
    const points = histogram.hoverPoints!(
      c,
      r.fullData[0]!,
      { px: 70, py: 30, xl: 7, yl: 3, mode: 'closest', distance: 20 },
      ctx,
    );
    expect(points).toHaveLength(1);
    const p = points[0]!;
    expect(p.pointIndex).toBe(1);
    expect(p.x).toBe('5 - 9');
    expect(p.y).toBe(6);
    expect(p.pointIndices).toEqual([8, 9, 10, 11, 12, 13]);
    expect(p.fields).toMatchObject({ binNumber: 1, pointIndices: [8, 9, 10, 11, 12, 13] });
  });

  it('selects the samples of the bars inside a box', () => {
    const samples = histogram.selectPoints!(
      c,
      r.fullData[0]!,
      { kind: 'rect', x: [4, 8], y: [0, 10] },
      ctx,
    );
    expect(samples).toEqual([8, 9, 10, 11, 12, 13]);
    // `selectedpoints` (samples) → bars drawn selected.
    expect(selectedBars(c, [0, 14])).toEqual([0, 2]);
    expect(selectedBars(c, [])).toEqual([]);
    expect(selectedBars(c, null)).toBeNull();
  });
});

describe('histogram describe', () => {
  it('summarizes samples, bins and the largest bin, with a table of bin ranges', () => {
    const r = run([{ type: 'histogram', x: INTS, name: 'Scores' }]);
    const d = histogram.describe!({
      trace: r.fullData[0]!,
      calc: hist(r),
      index: 0,
      fullLayout: r.fullLayout,
      xaxis: r.axis('x'),
      yaxis: r.axis('y'),
      maxRows: 100,
    })!;
    expect(d.kind).toBe('histogram');
    expect(d.summary).toBe(
      'Histogram "Scores": 16 samples in 3 bins from −0.5 to 14.5. Largest count: 8 (−0.5 to 4.5).',
    );
    expect(d.table?.rows).toEqual([
      ['−0.5 to 4.5', '8'],
      ['4.5 to 9.5', '6'],
      ['9.5 to 14.5', '2'],
    ]);
  });
});
