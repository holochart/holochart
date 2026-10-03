import { describe, expect, it } from 'vitest';
import type { BinsInsight, BoxesInsight } from '../contracts.ts';
import { binQuantiles, summarizeTrace } from './summary.ts';

const plain = (v: number): string => String(v);
const indices = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Unit-wide bins `[i, i + 1)` holding `counts`. */
function histogram(counts: readonly number[]): BinsInsight {
  return {
    kind: 'bins',
    length: counts.length,
    start: indices(counts.length),
    end: indices(counts.length).map((i) => i + 1),
    values: counts,
    formatPosition: plain,
    formatValue: plain,
  };
}

function boxes(median: readonly number[]): BoxesInsight {
  return {
    kind: 'boxes',
    length: median.length,
    label: (i) => ['A', 'B', 'C'][i]!,
    min: median.map((m) => m - 2),
    q1: median.map((m) => m - 1),
    median,
    q3: median.map((m) => m + 1),
    max: median.map((m) => m + 2),
    formatValue: plain,
  };
}

const sentences = (insight: BinsInsight | BoxesInsight): string[] =>
  summarizeTrace(insight, 'Wait', undefined);

describe('histogram summaries (E17.2)', () => {
  it('interpolates quartiles inside bins and skips empty and missing bins', () => {
    // 20 values: the first 10 in [0, 1), the last 10 in [3, 4). Q1 is the 5th value (halfway
    // through the first bin), the median the 10th (its end), Q3 the 15th (halfway through the last).
    expect(binQuantiles(histogram([10, 0, NaN, 10]))).toEqual([0.5, 1, 3.5]);
  });

  it('names a long tail of low values as a skew to the left', () => {
    // 100 values. Q1 = 25th: 20 lie below bin 4, which holds 10, so 4.5. Median = 50th: the end of
    // bin 5, so 6. Q3 = 75th: 25 into the 40 of bin 6, so 6.625. Bowley skew = (Q3 + Q1 - 2 median) /
    // (Q3 - Q1) = -0.875 / 2.125, about -0.41.
    expect(sentences(histogram([5, 5, 5, 5, 10, 20, 40, 10]))).toEqual([
      'Wait: the most common range is 6 to 7 (40).',
      'Half of the values lie between 4.5 and 6.625, with a median of about 6.',
      'The distribution is skewed to the left (a long tail of low values).',
    ]);
  });

  it('does not call a symmetric distribution skewed', () => {
    // Q1 = 12.5th value: 1.75; median 2.5; Q3 3.25: the quartiles are symmetric about the median.
    expect(sentences(histogram([5, 10, 20, 10, 5]))).toEqual([
      'Wait: the most common range is 2 to 3 (20).',
      'Half of the values lie between 1.75 and 3.25, with a median of about 2.5.',
    ]);
  });

  it('gives the quartiles but no skew for fewer than five bins', () => {
    // Q1 0.375, median 0.75, Q3 1.5: a Bowley skew of 1/3, which five bins would call skewed.
    expect(sentences(histogram([40, 10, 5, 5]))).toEqual([
      'Wait: the most common range is 0 to 1 (40).',
      'Half of the values lie between 0.375 and 1.5, with a median of about 0.75.',
    ]);
    expect(sentences(histogram([40, 10, 5, 5, 0])).at(-1)).toBe(
      'The distribution is skewed to the right (a long tail of high values).',
    );
  });

  it('gives only the fullest bin for one or two bins', () => {
    expect(sentences(histogram([3, 7]))).toEqual(['Wait: the most common range is 1 to 2 (7).']);
  });

  it('gives no quartiles when a bin is negative (sums, not counts)', () => {
    expect(sentences(histogram([3, -1, 2, 4, 1]))).toEqual([
      'Wait: the most common range is 3 to 4 (4).',
    ]);
  });

  it('ignores bins without a value, and says so when there is none at all', () => {
    // 8 values in bins 1 to 3: Q1 = 2nd value, the end of bin 1; median = 4th: 2 into the 5 of
    // bin 2; Q3 = 6th: 4 into the 5 of bin 2.
    expect(sentences(histogram([NaN, 2, 5, 1, NaN]))).toEqual([
      'Wait: the most common range is 2 to 3 (5).',
      'Half of the values lie between 2 and 2.8, with a median of about 2.4.',
    ]);
    expect(sentences(histogram([NaN, NaN, NaN]))).toEqual(['Wait has no values.']);
    expect(sentences(histogram([]))).toEqual(['Wait has no values.']);
  });

  it('keeps the first of equally full bins as the most common range', () => {
    expect(sentences(histogram([4, 9, 9]))[0]).toBe('Wait: the most common range is 1 to 2 (9).');
  });
});

describe('box summaries (E17.2)', () => {
  it('compares medians whatever the order of the boxes', () => {
    expect(sentences(boxes([6, 9, 3]))).toEqual(['Wait: medians range from 3 (C) to 9 (B).']);
  });

  it('leaves boxes without a median out', () => {
    expect(sentences(boxes([6, NaN, 3]))).toEqual(['Wait: medians range from 3 (C) to 6 (A).']);
    // One box left: its five-number summary, not a comparison.
    expect(sentences(boxes([NaN, 7, NaN]))).toEqual([
      'Wait: median 7; half of the values lie between 6 and 8; range 5 to 9.',
    ]);
    expect(sentences(boxes([NaN, NaN]))).toEqual(['Wait has no values.']);
  });
});
