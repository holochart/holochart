/**
 * Trendlines (plan E23.5) against plotly.py's `px.scatter(trendline=…)`: one `scatter` line per
 * group after the group's traces (hidden from the legend), px's hover header with the fit, the
 * `Overall Trendline` of `trendline_scope='overall'`, and `get_trendline_results`.
 */
import { DEFAULT_COLORWAY } from '@mk7s/holochart-core';
import { describe, expect, it, vi } from 'vitest';
import { formatF, formatG } from '../core/trendline.ts';
import hx, { densityContour, getTrendlineResults, ols, scatter } from '../index.ts';

vi.mock('@mk7s/holochart-runtime', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  newPlot: vi.fn(async (el: unknown, figure: unknown) => ({ el, figure })),
}));

const [C0, C1, C2] = DEFAULT_COLORWAY as unknown as [string, string, string];

// Unsorted x within each group; Female: y = 2 + 0.5x + noise, Male: y = 1 + 0.25x + noise.
const tips = [
  { bill: 20, tip: 12.4, sex: 'Female', day: 'Sun' },
  { bill: 10, tip: 7.1, sex: 'Female', day: 'Sat' },
  { bill: 14, tip: 8.6, sex: 'Male', day: 'Sun' },
  { bill: 16, tip: 9.8, sex: 'Female', day: 'Sun' },
  { bill: 30, tip: 8.4, sex: 'Male', day: 'Sat' },
  { bill: 12, tip: 8.1, sex: 'Female', day: 'Sat' },
  { bill: 22, tip: 6.4, sex: 'Male', day: 'Sun' },
  { bill: 18, tip: 5.7, sex: 'Male', day: 'Sat' },
];
const opts = { x: 'bill', y: 'tip', template: 'plotly-classic' } as const;

function sortedBy<T>(rows: T[], key: (r: T) => number): T[] {
  return [...rows].sort((a, b) => key(a) - key(b));
}

describe('px parity: per-trace trendlines', () => {
  it('px.scatter(df, x, y, color, trendline="ols")', () => {
    const figure = scatter(tips, { ...opts, color: 'sex', trendline: 'ols' });
    expect(figure.data.map((t) => [t['name'], t['mode']])).toEqual([
      ['Female', 'markers'],
      ['Female', 'lines'],
      ['Male', 'markers'],
      ['Male', 'lines'],
    ]);
    const female = sortedBy(
      tips.filter((r) => r.sex === 'Female'),
      (r) => r.bill,
    );
    const fit = ols(
      female.map((r) => r.bill),
      female.map((r) => r.tip),
    );
    const [b0, b1] = fit.params as [number, number];
    expect(figure.data[1]).toEqual({
      type: 'scatter',
      name: 'Female',
      legendgroup: 'Female',
      showlegend: false,
      marker: { color: C0, symbol: 'circle' },
      mode: 'lines',
      x: [10, 12, 16, 20],
      y: fit.fitted,
      hovertemplate:
        `<b>OLS trendline</b><br>tip = ${formatG(b1)} * bill + ${formatG(b0)}<br>` +
        `R<sup>2</sup>=${formatF(fit.rsquared)}<br><br>` +
        'sex=Female<br>bill=%{x}<br>tip=%{y} <b>(trend)</b><extra></extra>',
      xaxis: 'x',
      yaxis: 'y',
    });
    expect(figure.data[3]?.['marker']).toEqual({ color: C1, symbol: 'circle' });
    // The legend lists the groups once (the markers' entries).
    expect(figure.data.filter((t) => t['showlegend']).map((t) => t['name'])).toEqual([
      'Female',
      'Male',
    ]);
  });

  it('hover header: px %g / %f formatting, add_constant, log_x / log_y', () => {
    expect(formatG(0.105025)).toBe('0.105025');
    expect(formatG(0.920269613)).toBe('0.92027');
    expect(formatG(1234567)).toBe('1.23457e+06');
    expect(formatG(123456.7)).toBe('123457');
    expect(formatG(0.0000123456)).toBe('1.23456e-05');
    expect(formatG(0.0001)).toBe('0.0001');
    expect(formatG(-2.5)).toBe('-2.5');
    expect(formatG(0)).toBe('0');
    expect(formatG(NaN)).toBe('nan');
    expect(formatF(0.4566166)).toBe('0.456617');

    const origin = scatter(tips, {
      ...opts,
      trendline: 'ols',
      trendlineOptions: { addConstant: false },
    });
    expect(origin.data[1]?.['hovertemplate']).toMatch(
      /^<b>OLS trendline<\/b><br>tip = [\d.]+ \* bill<br>R<sup>2<\/sup>=/,
    );
    const logs = scatter(tips, {
      ...opts,
      trendline: 'ols',
      trendlineOptions: { logX: true, logY: true },
    });
    const all = sortedBy(tips, (r) => r.bill);
    const logFit = ols(
      all.map((r) => Math.log10(r.bill)),
      all.map((r) => Math.log10(r.tip)),
    );
    expect(logs.data[1]?.['hovertemplate']).toContain(
      `log10(tip) = ${formatG(logFit.params[1] as number)} * log10(bill) + ${formatG(logFit.params[0] as number)}<br>`,
    );
    (logs.data[1]?.['y'] as number[]).forEach((v, i) =>
      expect(v).toBeCloseTo(10 ** (logFit.fitted[i] as number), 12),
    );
    expect(getTrendlineResults(logs)[0]).toMatchObject({ logX: true, logY: true });
    expect(() =>
      scatter([...tips, { bill: -1, tip: 1, sex: 'Male', day: 'Sun' }], {
        ...opts,
        trendline: 'ols',
        trendlineOptions: { logX: true },
      }),
    ).toThrow(/logX when x contains non-positive/);
  });

  it('LOWESS and the pandas trendlines: headers and values of the sorted rows', () => {
    const low = scatter(tips, { ...opts, trendline: 'lowess', trendlineOptions: { frac: 0.8 } });
    expect(low.data[1]?.['hovertemplate']).toBe(
      '<b>LOWESS trendline</b><br><br>bill=%{x}<br>tip=%{y} <b>(trend)</b><extra></extra>',
    );
    const roll = scatter(tips, { ...opts, trendline: 'rolling', trendlineOptions: { window: 3 } });
    const ys = sortedBy(tips, (r) => r.bill).map((r) => r.tip);
    const expected = ys.map((_, i) =>
      i < 2 ? null : ((ys[i - 2] as number) + (ys[i - 1] as number) + (ys[i] as number)) / 3,
    );
    (roll.data[1]?.['y'] as (number | null)[]).forEach((v, i) =>
      expected[i] === null
        ? expect(v).toBeNull()
        : expect(v).toBeCloseTo(expected[i] as number, 12),
    );
    expect(roll.data[1]?.['hovertemplate']).toMatch(/^<b>Rolling mean trendline<\/b><br><br>/);
    const ewmFig = scatter(tips, {
      ...opts,
      trendline: 'ewm',
      trendlineOptions: { halflife: 2, function: 'std' },
    });
    expect(ewmFig.data[1]?.['hovertemplate']).toMatch(
      /^<b>Exponentially Weighted std trendline<\/b>/,
    );
    const exp = scatter(tips, {
      ...opts,
      trendline: 'expanding',
      trendlineOptions: { function: 'max' },
    });
    expect(exp.data[1]?.['y']).toEqual([7.1, 8.1, 8.6, 9.8, 9.8, 12.4, 12.4, 12.4]);
    expect(exp.data[1]?.['hovertemplate']).toMatch(/^<b>Expanding max trendline<\/b>/);
    // No OLS, no results (as px).
    expect(getTrendlineResults(low)).toEqual([]);
  });

  it('missing values: kept in the pandas series, dropped from the line', () => {
    const rows = [
      { x: 4, y: 4 },
      { x: 1, y: 1 },
      { x: 2, y: null },
      { x: 3, y: 3 },
      { x: null, y: 9 },
    ];
    const f = scatter(rows, {
      x: 'x',
      y: 'y',
      trendline: 'rolling',
      trendlineOptions: { window: 2 },
    });
    // Series sorted by x (missing last): [1, NaN, 3, 4, 9] → rolling(2) = [NaN, NaN, NaN, 3.5, 6.5].
    expect(f.data[1]?.['x']).toEqual([1, 3, 4]);
    expect(f.data[1]?.['y']).toEqual([null, null, 3.5]);
    const o = scatter(rows, { x: 'x', y: 'y', trendline: 'ols' });
    expect(o.data[1]?.['x']).toEqual([1, 3, 4]);
    expect(getTrendlineResults(o)[0]?.fit.nobs).toBe(3);
  });

  it('dates on x are fit in Unix seconds and drawn at the dates', () => {
    const rows = [
      { d: '2026-01-03', v: 5 },
      { d: '2026-01-01', v: 1 },
      { d: '2026-01-02', v: 3 },
    ];
    const f = scatter(rows, { x: 'd', y: 'v', trendline: 'ols' });
    expect(f.data[1]?.['x']).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    const [result] = getTrendlineResults(f);
    expect(result?.fit.params[1]).toBeCloseTo(2 / 86_400, 12);
    // A time-span rolling window over the dates.
    const r = scatter(rows, {
      x: 'd',
      y: 'v',
      trendline: 'rolling',
      trendlineOptions: { window: '2D' },
    });
    expect(r.data[1]?.['y']).toEqual([1, 2, 4]);
  });

  it('groups with fewer than two points get an empty line', () => {
    const f = scatter(tips.slice(0, 3), { ...opts, color: 'sex', trendline: 'ols' });
    const male = f.data[3] as Record<string, unknown>;
    expect(male['x']).toBeUndefined();
    expect(male['hovertemplate']).toBe('sex=Male<extra></extra>');
    expect(getTrendlineResults(f).map((r) => r.groups)).toEqual([{ sex: 'Female' }]);
  });

  it('trendlineColorOverride, facets and densityContour', () => {
    const f = scatter(tips, {
      ...opts,
      color: 'sex',
      facetCol: 'day',
      trendline: 'ols',
      trendlineColorOverride: 'black',
    });
    const lines = f.data.filter((t) => t['mode'] === 'lines');
    expect(lines).toHaveLength(4);
    for (const t of lines) expect(t['line']).toEqual({ color: 'black' });
    expect(lines.map((t) => t['xaxis'])).toEqual(['x', 'x2', 'x', 'x2']);
    expect(getTrendlineResults(f).map((r) => r.groups)).toEqual([
      { sex: 'Female', day: 'Sun' },
      { sex: 'Female', day: 'Sat' },
      { sex: 'Male', day: 'Sun' },
      { sex: 'Male', day: 'Sat' },
    ]);
    expect(getTrendlineResults(f).map((r) => r.traceIndex)).toEqual([1, 3, 5, 7]);
    const contour = densityContour(tips, { ...opts, color: 'sex', trendline: 'ols' });
    expect(contour.data[1]).toMatchObject({
      type: 'scatter',
      mode: 'lines',
      line: { color: C0 },
      name: 'Female',
    });
  });

  it('marginals come before the trendline, which sits on the main plot', () => {
    const f = scatter(tips, { ...opts, color: 'sex', marginalX: 'box', trendline: 'lowess' });
    expect(f.data.slice(0, 3).map((t) => [t['type'], t['yaxis']])).toEqual([
      ['scatter', 'y'],
      ['box', 'y2'],
      ['scatter', 'y'],
    ]);
  });

  it('animation frames: a trendline per group and frame', () => {
    const f = scatter(tips, { ...opts, animationFrame: 'day', trendline: 'ols' });
    expect(f.frames).toHaveLength(2);
    expect(f.frames?.[1]?.data[1]?.['x']).toEqual([10, 12, 18, 30]);
    expect(getTrendlineResults(f).map((r) => [r.frame, r.groups])).toEqual([
      ['Sun', { day: 'Sun' }],
      ['Sat', { day: 'Sat' }],
    ]);
  });

  it('checks the kind and options as px', () => {
    expect(() => scatter(tips, { ...opts, trendline: 'loess' as never })).toThrow(/must be one of/);
    expect(() =>
      scatter(tips, { ...opts, trendline: 'ols', trendlineOptions: { frac: 0.5 } }),
    ).toThrow(
      /ols trendlineOptions keys must be one of \[addConstant, logX, logY\] but got 'frac'/,
    );
    expect(() => scatter(tips, { ...opts, trendline: 'rolling' })).toThrow(/window/);
    expect(() =>
      scatter(tips, {
        ...opts,
        trendline: 'ewm',
        trendlineOptions: { alpha: 0.5, function: 'median' },
      }),
    ).toThrow(/ewm trendline's function/);
    expect(() =>
      scatter(tips, { ...opts, trendline: 'ols', trendlineScope: 'all' as never }),
    ).toThrow(/trendlineScope/);
    expect(() =>
      scatter(
        [
          { a: 'x', b: 1 },
          { a: 'y', b: 2 },
        ],
        { x: 'a', y: 'b', trendline: 'ols' },
      ),
    ).toThrow(/could not convert value of 'x'/);
  });
});

describe('px parity: trendline_scope="overall"', () => {
  it('one fit over all rows in every facet, one legend entry, the next color', () => {
    const f = scatter(tips, {
      ...opts,
      color: 'sex',
      facetCol: 'day',
      trendline: 'ols',
      trendlineScope: 'overall',
    });
    expect(f.data).toHaveLength(6);
    const all = sortedBy(tips, (r) => r.bill);
    const fit = ols(
      all.map((r) => r.bill),
      all.map((r) => r.tip),
    );
    const overall = f.data.slice(4);
    expect(overall[0]).toEqual({
      type: 'scatter',
      name: 'Overall Trendline',
      legendgroup: 'Overall Trendline',
      showlegend: false,
      mode: 'lines',
      line: { color: C2 },
      x: all.map((r) => r.bill),
      y: fit.fitted,
      hovertemplate: expect.stringMatching(
        /^<b>OLS trendline<\/b><br>tip = .*<br><br>bill=%\{x\}<br>tip=%\{y\} <b>\(trend\)<\/b><extra><\/extra>$/,
      ),
      xaxis: 'x',
      yaxis: 'y',
    });
    expect(overall.map((t) => [t['xaxis'], t['showlegend']])).toEqual([
      ['x', false],
      ['x2', true],
    ]);
    expect(getTrendlineResults(f)).toEqual([
      { groups: {}, traceIndex: 4, fit, logX: false, logY: false },
    ]);
    // Without a color column: the sequence's second color; the override wins.
    expect(
      scatter(tips, { ...opts, trendline: 'ols', trendlineScope: 'overall' }).data[1]?.['line'],
    ).toEqual({ color: C1 });
    expect(
      scatter(tips, {
        ...opts,
        trendline: 'ols',
        trendlineScope: 'overall',
        trendlineColorOverride: 'gray',
      }).data[1]?.['line'],
    ).toEqual({ color: 'gray' });
  });

  it('marginal cells get no copy; frames keep only the groups', () => {
    const m = scatter(tips, {
      ...opts,
      marginalY: 'histogram',
      trendline: 'lowess',
      trendlineScope: 'overall',
    });
    expect(m.data.filter((t) => t['name'] === 'Overall Trendline').map((t) => t['xaxis'])).toEqual([
      'x',
    ]);
    const a = scatter(tips, {
      ...opts,
      animationFrame: 'day',
      trendline: 'lowess',
      trendlineScope: 'overall',
    });
    expect(a.data).toHaveLength(2);
    expect(a.frames?.[0]?.data).toHaveLength(1);
  });
});

describe('getTrendlineResults', () => {
  it('keeps the fits beside the figure, not in its JSON', () => {
    const figure = hx.scatter(tips, { ...opts, color: 'sex', trendline: 'ols' });
    const results = hx.getTrendlineResults(figure);
    expect(results).toHaveLength(2);
    expect(results[0]?.fit.paramNames).toEqual(['const', 'x1']);
    expect(JSON.stringify(figure)).not.toContain('rsquared');
    expect(getTrendlineResults(structuredClone(figure))).toEqual([]);
    expect(getTrendlineResults({})).toEqual([]);
  });

  it('works on the chart an Express function rendered', async () => {
    const el = { nodeType: 1, tagName: 'DIV' } as unknown as HTMLElement;
    const chart = await hx.scatter(el, tips, { ...opts, trendline: 'ols' });
    expect(getTrendlineResults(chart)).toHaveLength(1);
    expect(getTrendlineResults(chart)[0]?.groups).toEqual({});
  });
});
