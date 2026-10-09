import { describe, expect, it } from 'vitest';
import type { TextFont } from './text-fonts.ts';
import { createFallbackTextMeasurer, createFontMetricsOracle } from './text-metrics.ts';
import {
  fadeTextRuns,
  layoutTextRuns,
  scaleTextRuns,
  textRunFont,
  type TextRun,
  type TextRunLines,
} from './text-runs.ts';
import { parseLinePosition } from './text-style.ts';

const oracle = createFontMetricsOracle({ measurer: createFallbackTextMeasurer() });
const font: TextFont = { family: 'sans-serif', size: 10 };

describe('textRunFont: a run overrides fields of the label font', () => {
  it('returns the label font itself for a run without overrides', () => {
    expect(textRunFont(font, { text: 'a' })).toBe(font);
  });

  it('overrides the family and weight, keeping the rest', () => {
    const base: TextFont = { ...font, style: 'italic', textcase: 'upper' };
    expect(textRunFont(base, { text: 'a', font: { family: 'Mono', weight: 600 } })).toEqual({
      family: 'Mono',
      size: 10,
      weight: 600,
      style: 'italic',
      textcase: 'upper',
    });
    // The label font is not modified.
    expect(base.family).toBe('sans-serif');
  });

  it("adds a run's decoration lines to the label's", () => {
    const lines = (base: string | undefined, run: string) =>
      parseLinePosition(
        textRunFont(
          { ...font, ...(base !== undefined ? { lineposition: base } : {}) },
          { text: 'a', font: { lineposition: run } },
        ).lineposition,
      );
    expect(lines('over', 'under')).toEqual({ under: true, over: true, through: false });
    expect(lines(undefined, 'over+through')).toEqual({ under: false, over: true, through: true });
    // `none` on a run adds nothing: it does not remove the label's lines.
    expect(lines('under', 'none')).toEqual({ under: true, over: false, through: false });
  });

  it("yields Plotly's `none` when neither the label nor the run has lines", () => {
    expect(textRunFont(font, { text: 'a', font: { lineposition: 'none' } }).lineposition).toBe(
      'none',
    );
  });
});

describe('layoutTextRuns: edge cases', () => {
  it('skips empty runs: they take no item and no width', () => {
    const lines: TextRunLines = [[{ text: '' }, { text: 'ab' }, { text: '' }]];
    const layout = layoutTextRuns(lines, { font }, oracle);
    expect(layout.items.map((i) => i.run.text)).toEqual(['ab']);
    expect(layout.items[0]?.x).toBe(0);
    expect(layout.width).toBeCloseTo(oracle.measureWidth('ab', font));
  });

  it('scales baseline shifts with the size a small-caps label is drawn at', () => {
    // Small caps are drawn at 0.8× the font size, so a 5 px superscript shift becomes 4 px.
    const lines: TextRunLines = [[{ text: 'x' }, { text: '2', shift: 5 }]];
    const layout = layoutTextRuns(lines, { font: { ...font, variant: 'small-caps' } }, oracle);
    expect(layout.items[1]?.y).toBeCloseTo(4);
    // Lines advance by the drawn size too: 0.8 × 10 px × 1.2.
    expect(layout.height).toBeCloseTo(9.6);
  });

  it('keeps positions finite for a zero-size label font', () => {
    const lines: TextRunLines = [[{ text: 'x' }, { text: '2', shift: 3 }], [{ text: 'y' }]];
    const layout = layoutTextRuns(lines, { font: { ...font, size: 0 } }, oracle);
    expect(layout.items).toHaveLength(3);
    for (const item of layout.items) {
      expect(Number.isFinite(item.x)).toBe(true);
      expect(Number.isFinite(item.y)).toBe(true);
    }
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
  });

  it('gives a label without lines the height of one line', () => {
    const layout = layoutTextRuns([], { font, lineHeight: 1.5 }, oracle);
    expect(layout.items).toEqual([]);
    expect(layout.lineCount).toBe(1);
    expect(layout.height).toBeCloseTo(15);
    expect(layout.width).toBe(0);
  });
});

describe('scaleTextRuns: a label shrunk or grown as a whole', () => {
  const sup: TextRun = { text: '2', font: { size: 7, weight: 'bold' }, shift: 4 };
  const plain: TextRun = { text: 'x', color: [1, 0, 0, 1] };

  it('scales absolute run sizes and baseline shifts, and nothing else', () => {
    const [[x, two]] = scaleTextRuns([[plain, sup]], 0.5) as [[TextRun, TextRun]];
    expect(two).toEqual({ text: '2', font: { size: 3.5, weight: 'bold' }, shift: 2 });
    // A run that inherits its size and has no shift is passed through untouched.
    expect(x).toBe(plain);
    // The input is not modified.
    expect(sup).toEqual({ text: '2', font: { size: 7, weight: 'bold' }, shift: 4 });
  });

  it('scales a size without a shift, and a shift without a size', () => {
    const sized: TextRun = { text: 'a', font: { size: 8 } };
    const shifted: TextRun = { text: 'b', font: { style: 'italic' }, shift: -3 };
    expect(scaleTextRuns([[sized], [shifted]], 2)).toEqual([
      [{ text: 'a', font: { size: 16 } }],
      [{ text: 'b', font: { style: 'italic' }, shift: -6 }],
    ]);
  });

  it('returns the same lines for a scale of 1', () => {
    const lines: TextRunLines = [[plain, sup]];
    expect(scaleTextRuns(lines, 1)).toBe(lines);
  });
});

describe('fadeTextRuns: a label faded as a whole', () => {
  const red: TextRun = { text: 'r', color: [1, 0, 0, 0.8] };
  const inherit: TextRun = { text: 'i', shift: 2 };

  it("multiplies the alpha of runs with their own color; the others follow the label's", () => {
    const [[r, i]] = fadeTextRuns([[red, inherit]], 0.5) as [[TextRun, TextRun]];
    expect(r).toEqual({ text: 'r', color: [1, 0, 0, 0.4] });
    expect(i).toBe(inherit);
    expect(red.color).toEqual([1, 0, 0, 0.8]);
  });

  it('returns the same lines for an alpha of 1', () => {
    const lines: TextRunLines = [[red, inherit]];
    expect(fadeTextRuns(lines, 1)).toBe(lines);
  });
});
