import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { layoutTickLabels, LINE_SPACING, requiredLabelSpacing } from './labels.ts';

/** Monospace-ish measurement: 6 px per character. */
const measure = (t: string): number => t.length * 6;
const positions = (n: number, step: number): number[] =>
  Array.from({ length: n }, (_, i) => i * step);

describe('requiredLabelSpacing', () => {
  it('needs the width when horizontal and the height when vertical (x axis)', () => {
    expect(requiredLabelSpacing(60, 12, 0, 'x')).toBe(60);
    expect(requiredLabelSpacing(60, 12, 90, 'x')).toBeCloseTo(12, 9);
    expect(requiredLabelSpacing(60, 12, 30, 'x')).toBeCloseTo(24, 9);
  });

  it('swaps the roles on y axes', () => {
    expect(requiredLabelSpacing(60, 12, 0, 'y')).toBe(12);
    expect(requiredLabelSpacing(60, 12, 90, 'y')).toBeCloseTo(60, 9);
  });
});

describe('layoutTickLabels', () => {
  const base = { measure, fontSize: 10, axisLetter: 'x' as const, tickangle: 'auto' as const };

  it('keeps labels horizontal when they fit', () => {
    const r = layoutTickLabels({
      ...base,
      positions: positions(5, 80),
      texts: ['0', '20', '40', '60', '80'],
    });
    expect(r).toEqual({ angle: 0, visible: [true, true, true, true, true] });
  });

  it('rotates to the first autotickangle that fits', () => {
    // 10 chars → 60 px wide, 13 px high; spacing 40 px: 0° fails, 30° needs 26 + gap.
    const texts = Array.from({ length: 6 }, (_, i) => `category-${i}`);
    expect(layoutTickLabels({ ...base, positions: positions(6, 40), texts }).angle).toBe(30);
    // 20 px spacing: only 90° (13 px + gap) fits.
    expect(layoutTickLabels({ ...base, positions: positions(6, 20), texts }).angle).toBe(90);
    expect(
      layoutTickLabels({ ...base, positions: positions(6, 40), texts, autotickangles: [0, 45] })
        .angle,
    ).toBe(45);
  });

  it('skips labels when even the best angle overlaps', () => {
    const texts = Array.from({ length: 9 }, (_, i) => `label ${i}`);
    const r = layoutTickLabels({ ...base, positions: positions(9, 6), texts });
    expect(r.angle).toBe(90);
    // Needs 13 + 2.5 px: every 3rd label.
    expect(r.visible).toEqual([true, false, false, true, false, false, true, false, false]);
    const noSkip = layoutTickLabels({
      ...base,
      positions: positions(9, 6),
      texts,
      autoskip: false,
    });
    expect(noSkip.visible.every(Boolean)).toBe(true);
  });

  it('never rotates y-axis labels automatically but skips stacked ones', () => {
    const texts = ['a', 'b', 'c', 'd'];
    const r = layoutTickLabels({ ...base, axisLetter: 'y', positions: positions(4, 8), texts });
    expect(r.angle).toBe(0);
    expect(r.visible).toEqual([true, false, true, false]);
  });

  it('honors a fixed tickangle', () => {
    const texts = ['long label one', 'long label two'];
    const r = layoutTickLabels({ ...base, tickangle: 45, positions: [0, 200], texts });
    expect(r).toEqual({ angle: 45, visible: [true, true] });
  });

  it('measures multi-line labels by their widest line, ignoring tags', () => {
    let widest = 0;
    const spy = (t: string): number => {
      widest = Math.max(widest, t.length);
      return measure(t);
    };
    const texts = ['Jan 5<br>2026', 'Jan 6', '<b>x</b>'];
    const r = layoutTickLabels({ ...base, measure: spy, positions: [0, 40, 80], texts });
    expect(widest).toBe(5);
    // Two lines: 2 × 10 × 1.3 = 26 px high; 30 px wide fits 40 px spacing horizontally.
    expect(r.angle).toBe(0);
    expect(2 * 10 * LINE_SPACING).toBe(26);
  });

  it('ignores empty and non-finite labels', () => {
    const r = layoutTickLabels({
      ...base,
      positions: [0, NaN, 10, 20],
      texts: ['a', 'b', '', 'c'],
    });
    expect(r.visible).toEqual([true, false, false, true]);
    expect(layoutTickLabels({ ...base, positions: [], texts: [] })).toEqual({
      angle: 0,
      visible: [],
    });
    // Coincident labels: keep only the first.
    const same = layoutTickLabels({ ...base, positions: [5, 5, 5], texts: ['a', 'b', 'c'] });
    expect(same.visible).toEqual([true, false, false]);
  });

  it('visible labels never overlap at the chosen angle (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 1, maxLength: 40 }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        fc.constantFrom<'x' | 'y'>('x', 'y'),
        (texts, step, axisLetter) => {
          const r = layoutTickLabels({
            ...base,
            axisLetter,
            positions: positions(texts.length, step),
            texts,
          });
          const shown = r.visible.flatMap((v, i) => (v ? [i * step] : []));
          const w = Math.max(...texts.map(measure));
          const need = requiredLabelSpacing(w, 10 * LINE_SPACING, r.angle, axisLetter);
          for (let k = 1; k < shown.length; k++) {
            expect((shown[k] as number) - (shown[k - 1] as number)).toBeGreaterThanOrEqual(need);
          }
        },
      ),
    );
  });
});
