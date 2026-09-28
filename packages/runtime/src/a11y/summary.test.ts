import { resolveLocale, type FullLayout, type LocaleDefinition } from '@mk7s/holochart-core';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { TraceInsight } from '../contracts.ts';
import {
  binQuantiles,
  correlation,
  summarizeChart,
  summarizeTrace,
  SUMMARY_TEMPLATES,
  trend,
} from './summary.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Millions with one decimal, like an axis with `tickformat: '.2s'`. */
const millions = (v: number): string => `${(v / 1e6).toFixed(1)}M`;
const plain = (v: number): string => String(v);
const indices = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

function series(y: readonly number[], options: { joined?: boolean; x?: number[] } = {}) {
  return {
    kind: 'series',
    length: y.length,
    x: options.x ?? indices(y.length),
    y,
    joined: options.joined ?? true,
    formatX: (i: number) => MONTHS[i] ?? String(i),
    formatY: millions,
  } satisfies TraceInsight;
}

function say(insight: TraceInsight, name = 'Revenue', layout?: FullLayout): string {
  return summarizeTrace(insight, name, layout).join(' ');
}

/** A full layout with a locale defined inline (`config.locales`). */
function localized(def: LocaleDefinition): FullLayout {
  const store = { locales: new Map(), resolved: new Map() };
  return { _locale: resolveLocale('de', store, { defs: { de: def } }) } as unknown as FullLayout;
}

describe('trends (E17.2)', () => {
  it('describes a rising series with its peak, as in the plan', () => {
    const y = [1.2, 1.5, 1.4, 1.9, 2.2, 2.4, 2.3, 2.8, 3.1, 3.3, 3.6, 3.4].map((v) => v * 1e6);
    expect(say(series(y))).toBe(
      'Revenue rises from 1.2M (Jan) to 3.4M (Dec). It peaks at 3.6M (Nov).',
    );
  });

  it('describes falling, flat and trendless series', () => {
    expect(say(series([9e6, 7e6, 8e6, 3e6, 4e6]))).toBe(
      'Revenue falls from 9.0M (Jan) to 4.0M (May). Its lowest point is 3.0M (Apr).',
    );
    expect(say(series([100e6, 101e6, 99e6, 100e6]))).toBe('Revenue stays flat at about 100.0M.');
    expect(say(series([1e6, 9e6, 2e6, 1.2e6]))).toBe(
      'Revenue varies between 1.0M (Jan) and 9.0M (Feb) with no clear trend.',
    );
  });

  it('names a peak or low only when it stands out from both ends', () => {
    // 3.02 is within 5 % of the range of the end value 3: not a peak worth naming.
    expect(trend([1, 2, 3.02, 3], [0, 1, 2, 3])).toMatchObject({ direction: 'rises', peak: false });
    expect(trend([1, 2, 4, 3], [0, 1, 2, 3])).toMatchObject({ direction: 'rises', peak: true });
    expect(trend([5, 5, 5], [0, 1, 2])).toMatchObject({ direction: 'flat', peak: false });
  });

  it('skips missing values and says when there are none', () => {
    expect(say(series([NaN, 1e6, NaN, 2e6]))).toBe('Revenue rises from 1.0M (Feb) to 2.0M (Apr).');
    expect(say(series([NaN]))).toBe('Revenue has no values.');
    expect(say(series([NaN, 5e6]))).toBe('Revenue has a single value, 5.0M (Feb).');
  });

  it('describes unsorted markers by their correlation', () => {
    const x = [3, 1, 4, 2, 5];
    const up = {
      ...series(
        [3, 1, 4, 2, 5].map((v) => v * 1e6),
        { joined: false, x },
      ),
    };
    expect(summarizeTrace(up, 'Sales', undefined, { xTitle: 'Ads', yTitle: 'Sales' })).toEqual([
      'Sales: Sales rises strongly with Ads (correlation 1.00).',
      'Values range from 1.0M to 5.0M.',
    ]);
    const none = series(
      [2, 2.1, 1.9, 1.9, 2.1].map((v) => v * 1e6),
      { joined: false, x },
    );
    expect(say(none)).toMatch(/^Revenue: no clear relationship between x and y \(correlation/);
    // Sorted markers are a series.
    expect(say(series([1e6, 2e6], { joined: false }))).toBe(
      'Revenue rises from 1.0M (Jan) to 2.0M (Feb).',
    );
    expect(correlation([1, 1, 1], [1, 2, 3], [0, 1, 2])).toBeNaN();
  });

  it('classifies consistently with the values (property)', () => {
    const values = fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), {
      minLength: 2,
      maxLength: 40,
    });
    fc.assert(
      fc.property(values, (y) => {
        const t = trend(y, indices(y.length));
        const first = y[0]!;
        const last = y[y.length - 1]!;
        if (t.direction === 'rises') expect(last).toBeGreaterThan(first);
        if (t.direction === 'falls') expect(last).toBeLessThan(first);
        expect(y[t.max]).toBe(Math.max(...y));
        expect(y[t.min]).toBe(Math.min(...y));
        // Deterministic.
        expect(trend(y, indices(y.length))).toEqual(t);
      }),
    );
  });
});

describe('other insights (E17.2)', () => {
  it('names the largest parts of a whole with their shares', () => {
    const labels = ['Chrome', 'Safari', 'Edge', 'Firefox'];
    const pie: TraceInsight = {
      kind: 'shares',
      part: 'slice',
      length: 4,
      values: [641, 187, 52, 120],
      label: (i) => labels[i]!,
      formatValue: plain,
    };
    expect(say(pie, 'Browsers')).toBe(
      'Chrome is the largest slice of Browsers: 64.1% (641). Next: Safari, 18.7% (187), and Firefox, 12% (120).',
    );
    // Hidden slices don't count; a sankey's whole is its flow from sources.
    expect(say({ ...pie, skip: (i) => i === 0 }, 'Browsers')).toMatch(
      /^Safari is the largest slice of Browsers: 52\.1% \(187\)\. Next: Firefox, 33\.4% \(120\), and Edge, 14\.5% \(52\)\.$/,
    );
    expect(say({ ...pie, part: 'flow', length: 2, total: 1000 }, 'Energy')).toBe(
      'Chrome is the largest flow of Energy: 64.1% (641). Next: Safari, 18.7% (187).',
    );
  });

  it('ranks category bars, and parts with negative values', () => {
    const labels = ['Q1', 'Q2', 'Q3'];
    const bars: TraceInsight = {
      kind: 'shares',
      part: 'bar',
      length: 3,
      values: [10, 42, -3],
      label: (i) => labels[i]!,
      formatValue: plain,
    };
    expect(say(bars, 'Profit')).toBe('Profit is highest at Q2 (42) and lowest at Q3 (-3).');
  });

  it('summarizes one box or compares the medians of several', () => {
    const boxes: TraceInsight = {
      kind: 'boxes',
      length: 2,
      label: (i) => ['A', 'B'][i]!,
      min: [1, 2],
      q1: [2, 4],
      median: [3, 6],
      q3: [4, 8],
      max: [5, 9],
      formatValue: plain,
    };
    expect(say({ ...boxes, length: 1 }, 'Scores')).toBe(
      'Scores: median 3; half of the values lie between 2 and 4; range 1 to 5.',
    );
    expect(say(boxes, 'Scores')).toBe('Scores: medians range from 3 (A) to 6 (B).');
  });

  it('describes a histogram: the fullest bin, the quartiles and the skew', () => {
    const counts = [10, 40, 20, 10, 5, 5, 5, 5];
    const bins: TraceInsight = {
      kind: 'bins',
      length: counts.length,
      start: indices(counts.length),
      end: indices(counts.length).map((i) => i + 1),
      values: counts,
      formatPosition: (p) => p.toFixed(2).replace(/\.?0+$/, ''),
      formatValue: plain,
    };
    expect(summarizeTrace(bins, 'Wait', undefined)).toEqual([
      'Wait: the most common range is 1 to 2 (40).',
      'Half of the values lie between 1.38 and 3.5, with a median of about 2.',
      'The distribution is skewed to the right (a long tail of high values).',
    ]);
    expect(binQuantiles({ ...bins, values: [0, 0] } as never)).toBeUndefined();
  });

  it('finds the extremes and hottest row and column of a grid', () => {
    const grid: TraceInsight = {
      kind: 'grid',
      nx: 3,
      ny: 2,
      z: [1, 2, 3, 4, 9, NaN],
      xText: (i) => ['a', 'b', 'c'][i]!,
      yText: (j) => ['r1', 'r2'][j]!,
      formatValue: plain,
    };
    expect(say(grid, 'Heat')).toBe(
      'Heat: values range from 1 to 9. The highest value, 9, is at b, r2; the lowest, 1, at a, r1. Highest average by row: r2 (6.5); by column: b (5.5).',
    );
  });

  it('describes the change of prices from the first open to the last close', () => {
    const prices: TraceInsight = {
      kind: 'prices',
      points: [0, 2],
      x: [0, 1, 2],
      open: [100, 0, 110],
      high: [105, 999, 120],
      low: [95, 0, 108],
      close: [102, 0, 112],
      formatX: (i) => MONTHS[i]!,
      formatY: plain,
    };
    expect(say(prices, 'ACME')).toBe(
      'ACME rises 12% from an open of 100 (Jan) to a close of 112 (Mar). Highest high 120 (Mar); lowest low 95 (Jan).',
    );
    expect(say({ ...prices, close: [102, 0, 90] }, 'ACME')).toMatch(/^ACME falls 10% from/);
  });

  it('describes a value against its reference', () => {
    const value = (v: number, reference?: number): string =>
      say(
        {
          kind: 'value',
          value: v,
          ...(reference === undefined ? {} : { reference }),
          formatValue: (n) => `$${n}`,
        },
        'Revenue',
      );
    expect(value(450, 400)).toBe('Revenue is $450, up $50 (12.5%) from $400.');
    expect(value(350, 400)).toBe('Revenue is $350, down $50 (12.5%) from $400.');
    expect(value(400, 400)).toBe('Revenue is $400, unchanged from $400.');
    expect(value(400)).toBe('Revenue is $400.');
  });
});

describe('chart overview (E17.2)', () => {
  it('starts with the axes and caps the traces it summarizes', () => {
    const traces = Array.from({ length: 12 }, (_, i) => ({
      name: `T${i}`,
      insight: series([1e6, 2e6]),
    }));
    const text = summarizeChart({ fullLayout: undefined, traces, xTitle: 'Month', yTitle: 'k$' });
    expect(text.startsWith('k$ by Month. T0 rises from 1.0M (Jan) to 2.0M (Feb).')).toBe(true);
    expect(text).toContain('T9 rises');
    expect(text).not.toContain('T10 rises');
    expect(text.endsWith('2 more traces are not summarized.')).toBe(true);
  });

  it('translates templates through the locale dictionary, with its number format', () => {
    const layout = localized({
      dictionary: {
        [SUMMARY_TEMPLATES.rises]: '{name} steigt von {start} ({startX}) auf {end} ({endX}).',
        [SUMMARY_TEMPLATES.slice]: '{label} ist das größte Segment von {name}: {share} ({value}).',
      },
      format: { decimal: ',', thousands: '.' },
    });
    expect(say(series([1e6, 2e6]), 'Umsatz', layout)).toBe(
      'Umsatz steigt von 1.0M (Jan) auf 2.0M (Feb).',
    );
    const pie: TraceInsight = {
      kind: 'shares',
      part: 'slice',
      length: 2,
      values: [3, 1],
      label: (i) => ['A', 'B'][i]!,
      formatValue: plain,
    };
    // Untranslated templates stay English; percentages use the locale's decimal comma.
    expect(say(pie, 'Anteile', layout)).toBe(
      'A ist das größte Segment von Anteile: 75% (3). Next: B, 25% (1).',
    );
    expect(say({ ...pie, values: [2, 1] }, 'Anteile', layout)).toContain('66,7%');
  });

  it('keeps every placeholder of every template fillable', () => {
    for (const template of Object.values(SUMMARY_TEMPLATES)) {
      expect(template).toMatch(/^[^{}]*(\{\w+\}[^{}]*)*$/);
    }
  });
});
