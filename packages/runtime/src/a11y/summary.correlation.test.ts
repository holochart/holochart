import { resolveLocale, type FullLayout, type LocaleDefinition } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import type { TraceInsight } from '../contracts.ts';
import {
  correlation,
  sayer,
  summarizeChart,
  summarizeTrace,
  SUMMARY_TEMPLATES,
} from './summary.ts';

const plain = (v: number): string => String(v);

/** Markers that are not joined: described by their correlation once `x` is out of order. */
function markers(x: readonly number[], y: readonly number[]): TraceInsight {
  return { kind: 'series', length: y.length, x, y, joined: false, formatX: plain, formatY: plain };
}

const TITLES = { xTitle: 'Ads', yTitle: 'Sales' };
const sentences = (insight: TraceInsight): string[] =>
  summarizeTrace(insight, 'Shops', undefined, TITLES);

/** A full layout with a locale defined inline (`config.locales`). */
function localized(def: LocaleDefinition): FullLayout {
  const store = { locales: new Map(), resolved: new Map() };
  return { _locale: resolveLocale('de', store, { defs: { de: def } }) } as unknown as FullLayout;
}

describe('unsorted markers: the strength and direction of the correlation (E17.2)', () => {
  // x out of order in every case, so none of these is read as a trend over x.
  const X = [2, 1, 3, 4];

  it('says "tends to rise" for a moderate positive correlation', () => {
    // dx = [-.5, -1.5, .5, 1.5], dy = [-1.5, -.5, 1.5, .5]: r = 3 / sqrt(5 * 5) = 0.6.
    const y = [1, 2, 4, 3];
    expect(correlation(X, y, [0, 1, 2, 3])).toBeCloseTo(0.6, 12);
    expect(sentences(markers(X, y))).toEqual([
      'Shops: Sales tends to rise with Ads (correlation 0.60).',
      'Values range from 1 to 4.',
    ]);
  });

  it('says "tends to fall" for a moderate negative correlation', () => {
    // The same points mirrored in y: r = -0.6.
    const y = [4, 3, 1, 2];
    expect(correlation(X, y, [0, 1, 2, 3])).toBeCloseTo(-0.6, 12);
    const [first, range] = sentences(markers(X, y));
    expect(first).toMatch(/^Shops: Sales tends to fall as Ads rises \(correlation [-−]0\.60\)\.$/);
    expect(range).toBe('Values range from 1 to 4.');
  });

  it('says "falls strongly" for a perfect negative correlation', () => {
    const [first] = sentences(markers(X, [-2, -1, -3, -4]));
    expect(first).toMatch(/^Shops: Sales falls strongly as Ads rises \(correlation [-−]1\.00\)\.$/);
  });

  it('claims no relationship when y does not vary: the values are flat', () => {
    const y = [5, 5, 5, 5];
    expect(correlation(X, y, [0, 1, 2, 3])).toBeNaN();
    const out = sentences(markers(X, y));
    expect(out[0]).toBe('Shops stays flat at about 5.');
    expect(out.join(' ')).not.toContain('correlation');
  });

  it('leaves points with a missing coordinate out of the correlation', () => {
    // Without the NaN points this is the r = 0.6 case above; with them counted it could not be.
    const x = [2, NaN, 1, 3, 9, 4];
    const y = [1, 50, 2, 4, NaN, 3];
    expect(sentences(markers(x, y))).toEqual([
      'Shops: Sales tends to rise with Ads (correlation 0.60).',
      'Values range from 1 to 4.',
    ]);
  });
});

describe('the overview and its templates (E17.2)', () => {
  const rising: TraceInsight = {
    kind: 'series',
    length: 2,
    x: [0, 1],
    y: [1, 2],
    joined: true,
    formatX: (v) => ['Jan', 'Feb'][v] ?? String(v),
    formatY: plain,
  };
  const traces = [{ name: 'Revenue', insight: rising }];

  it('names the axes only when both have a title', () => {
    const sentence = 'Revenue rises from 1 (Jan) to 2 (Feb).';
    expect(summarizeChart({ fullLayout: undefined, traces, xTitle: 'Month', yTitle: 'k$' })).toBe(
      `k$ by Month. ${sentence}`,
    );
    expect(summarizeChart({ fullLayout: undefined, traces, xTitle: 'Month' })).toBe(sentence);
    expect(summarizeChart({ fullLayout: undefined, traces, yTitle: 'k$' })).toBe(sentence);
    expect(summarizeChart({ fullLayout: undefined, traces })).toBe(sentence);
  });

  it('says nothing about more traces when all of them are summarized', () => {
    const two = [...traces, { name: 'Costs', insight: rising }];
    expect(summarizeChart({ fullLayout: undefined, traces: two })).toBe(
      'Revenue rises from 1 (Jan) to 2 (Feb). Costs rises from 1 (Jan) to 2 (Feb).',
    );
  });

  it('lets a translation reorder and drop placeholders, and keeps ones it does not know', () => {
    const layout = localized({
      dictionary: {
        [SUMMARY_TEMPLATES.rises]: '{endX}: {end} (seit {startX}: {start}) – {name} {tippfehler}',
      },
    });
    expect(summarizeTrace(rising, 'Umsatz', layout)).toEqual([
      'Feb: 2 (seit Jan: 1) – Umsatz {tippfehler}',
    ]);
    // The same through the exported sentence builder trace modules can use.
    expect(
      sayer(layout)('rises', { name: 'N', start: 'a', startX: 'b', end: 'c', endX: 'd' }),
    ).toBe('d: c (seit b: a) – N {tippfehler}');
  });
});
