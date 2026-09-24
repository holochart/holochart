import { describe, expect, it } from 'vitest';
import { resolveTextLabelMembers, type ResolvedTextLabel } from './text-layout.ts';
import { createFallbackTextMeasurer, createFontMetricsOracle } from './text-metrics.ts';
import {
  layoutTextRuns,
  textLinkAt,
  textRunFont,
  wrapTextRuns,
  type TextRun,
  type TextRunLines,
} from './text-runs.ts';

const oracle = createFontMetricsOracle({ measurer: createFallbackTextMeasurer() });
const font = { family: 'sans-serif', size: 10 };
/** Fallback widths in px at 10 px: a 5.56, space 2.78, b 5.56, bold ×1.05. */
const w = (text: string, f = font) => oracle.measureAdvance(text, f);

describe('layoutTextRuns', () => {
  it('places runs left to right; widths add up and match the plain measure', () => {
    const lines: TextRunLines = [[{ text: 'ab ' }, { text: 'cd', font: { weight: 'bold' } }]];
    const layout = layoutTextRuns(lines, { font }, oracle);
    const [first, second] = layout.items;
    expect(first?.x).toBe(0);
    expect(second?.x).toBeCloseTo(w('ab '));
    expect(second?.width).toBeCloseTo(w('cd', { ...font, weight: 'bold' } as never));
    expect(layout.width).toBeCloseTo(
      w('ab ') + oracle.measureWidth('cd', { ...font, weight: 'bold' }),
    );
    // One plain run measures exactly like the single-run path.
    const plain = layoutTextRuns([[{ text: 'plain text' }]], { font }, oracle);
    expect(plain.width).toBeCloseTo(oracle.measureWidth('plain text', font));
  });

  it('excludes trailing whitespace from the line width, like troika', () => {
    const layout = layoutTextRuns([[{ text: 'ab' }, { text: '   ' }]], { font }, oracle);
    expect(layout.width).toBeCloseTo(oracle.measureWidth('ab', font));
  });

  it('shifts sup/sub runs and keeps baselines per line', () => {
    const lines: TextRunLines = [
      [{ text: 'x' }, { text: '2', font: { size: 7 }, shift: 4.2 }],
      [{ text: 'H' }, { text: '2', font: { size: 7 }, shift: -2.1 }],
    ];
    const layout = layoutTextRuns(lines, { font, lineHeight: 1.3 }, oracle);
    const ys = layout.items.map((i) => i.y);
    expect(ys[0]).toBe(0);
    expect(ys[1]).toBeCloseTo(4.2);
    expect(ys[2]).toBeCloseTo(-13);
    expect(ys[3]).toBeCloseTo(-15.1);
    expect(layout.height).toBeCloseTo(26);
    expect(layout.lineCount).toBe(2);
  });

  it('aligns lines and anchors the block like a single-run label', () => {
    const lines: TextRunLines = [[{ text: 'aaaa' }], [{ text: 'a' }]];
    const wide = oracle.measureWidth('aaaa', font);
    const narrow = oracle.measureWidth('a', font);
    const center = layoutTextRuns(lines, { font, anchorX: 'center' }, oracle);
    expect(center.items[0]?.x).toBeCloseTo(-wide / 2);
    expect(center.items[1]?.x).toBeCloseTo(-narrow / 2);
    const right = layoutTextRuns(lines, { font, anchorX: 'right', align: 'left' }, oracle);
    expect(right.items[0]?.x).toBeCloseTo(-wide);
    expect(right.items[1]?.x).toBeCloseTo(-wide);
    // Vertical: top / middle / bottom use the line box (half leading + ascent to the baseline).
    const m = oracle.measureText('', font, 1.2);
    const toBaseline = (m.lineHeight + m.ascent - m.descent) / 2;
    const top = layoutTextRuns(lines, { font, anchorY: 'top' }, oracle);
    expect(top.items[0]?.y).toBeCloseTo(-toBaseline);
    const middle = layoutTextRuns(lines, { font, anchorY: 'middle' }, oracle);
    expect(middle.items[0]?.y).toBeCloseTo(m.lineHeight - toBaseline);
    const bottom = layoutTextRuns(lines, { font, anchorY: 'bottom' }, oracle);
    expect(bottom.items[1]?.y).toBeCloseTo(2 * m.lineHeight - toBaseline - m.lineHeight);
  });

  it('merges run fonts and decoration lines', () => {
    expect(
      textRunFont(
        { ...font, lineposition: 'under' },
        { text: '', font: { lineposition: 'through' } },
      ),
    ).toEqual({
      ...font,
      lineposition: 'under+through',
    });
    expect(textRunFont(font, { text: '', font: { style: 'italic', size: 7 } })).toEqual({
      ...font,
      style: 'italic',
      size: 7,
    });
  });
});

describe('textLinkAt', () => {
  const link = { href: 'https://x.org', target: '_blank' };
  const lines: TextRunLines = [[{ text: 'go ' }, { text: 'here', link }]];
  const start = w('go ');

  it('finds the linked run under a point (screen px, +y down)', () => {
    expect(textLinkAt(lines, { font }, start + 2, -3, oracle)).toBe(link);
    expect(textLinkAt(lines, { font }, 2, -3, oracle)).toBeNull();
    expect(textLinkAt(lines, { font }, start + 2, -30, oracle)).toBeNull();
    expect(textLinkAt([[{ text: 'plain' }]], { font }, 1, -1, oracle)).toBeNull();
  });

  it('undoes the label offset and rotation', () => {
    // Rotated 90° clockwise: the text runs downward from the anchor.
    expect(textLinkAt(lines, { font, angle: 90 }, 3, start + 2, oracle)).toBe(link);
    expect(textLinkAt(lines, { font, offset: [100, 0] }, 100 + start + 2, -3, oracle)).toBe(link);
  });
});

describe('resolveTextLabelMembers', () => {
  it('resolves plain labels to one member and rich labels to one per non-blank run', () => {
    const out: ResolvedTextLabel[] = [];
    const resolve = () => undefined;
    resolveTextLabelMembers({ text: 'plain', x: 0, y: 0 }, {}, oracle, resolve, 0, out);
    resolveTextLabelMembers(
      {
        text: 'a b',
        x: 1,
        y: 2,
        angle: 30,
        color: [1, 1, 1, 1],
        runs: [
          [
            { text: 'a' },
            { text: ' ' },
            { text: 'b', color: [1, 0, 0, 1], font: { lineposition: 'under' } },
          ],
        ],
        anchorX: 'center',
        anchorY: 'middle',
      },
      { font },
      oracle,
      resolve,
      1,
      out,
    );
    expect(out.map((r) => [r.owner, r.layout.text])).toEqual([
      [0, 'plain'],
      [1, 'a'],
      [1, 'b'],
    ]);
    const [, a, b] = out as [ResolvedTextLabel, ResolvedTextLabel, ResolvedTextLabel];
    expect(a.layout.anchorX).toBe('left');
    expect(a.layout.anchorY).toBe('top-baseline');
    expect(a.color).toEqual([1, 1, 1, 1]);
    expect(b.color).toEqual([1, 0, 0, 1]);
    expect(b.decoration).toEqual({ under: true, over: false, through: false });
    expect(a.rotation).toBeCloseTo((-30 * Math.PI) / 180);
    expect(b.localX).toBeCloseTo(a.localX + w('a '));
    expect(a.localY).toBe(b.localY);
  });
});

describe('wrapTextRuns', () => {
  /** 1 px per character (a space too): wrapping becomes character arithmetic. */
  const mono = { measure: (text: string) => text.length };
  const bold = { weight: 'bold' } as const;
  const texts = (lines: readonly (readonly TextRun[])[]) =>
    lines.map((line) => line.map((r) => r.text).join(''));

  it('fills lines greedily across run boundaries, like the plain wrap', () => {
    // Plain: 'aaa bb c dddd' in 8 px wraps to ['aaa bb', 'c dddd'] (each word + one space).
    const lines: TextRunLines = [
      [{ text: 'aaa ' }, { text: 'bb c', font: bold }, { text: ' dddd' }],
    ];
    const out = wrapTextRuns(lines, font, 8, mono);
    expect(texts(out)).toEqual(['aaa bb', 'c dddd']);
    // Pieces keep their run's style; the space before a word keeps the style it had.
    expect(out).toEqual([
      [{ text: 'aaa ' }, { text: 'bb', font: bold }],
      [{ text: 'c', font: bold }, { text: ' dddd' }],
    ]);
  });

  it('keeps a word that spans runs together', () => {
    const lines: TextRunLines = [[{ text: 'ab' }, { text: 'cd', font: bold }, { text: ' ef' }]];
    expect(wrapTextRuns(lines, font, 4, mono)).toEqual([
      [{ text: 'ab' }, { text: 'cd', font: bold }],
      [{ text: 'ef' }],
    ]);
  });

  it('wraps each <br> line on its own and keeps empty lines', () => {
    const lines: TextRunLines = [[{ text: 'one two' }], [], [{ text: 'three four', font: bold }]];
    expect(texts(wrapTextRuns(lines, font, 5, mono))).toEqual(['one', 'two', '', 'three', 'four']);
  });

  it('gives a word wider than the limit a line of its own, unbroken', () => {
    const lines: TextRunLines = [
      [{ text: 'x ' }, { text: 'longerthanlimit', font: bold }, { text: ' y' }],
    ];
    expect(texts(wrapTextRuns(lines, font, 5, mono))).toEqual(['x', 'longerthanlimit', 'y']);
  });

  it('returns lines that need no break as they are, and keeps links, colors and shifts', () => {
    const link = { href: 'https://x.org' };
    const fits: TextRunLines = [[{ text: 'a ' }, { text: 'b', link }]];
    expect(wrapTextRuns(fits, font, 100, mono)[0]).toBe(fits[0]);
    const styled: TextRunLines = [
      [
        { text: 'go ', color: [1, 0, 0, 1] },
        { text: 'x', shift: 4 },
        { text: ' there now', link },
      ],
    ];
    // 'go x there' is 3 + 2 + 6 px with a space per word; 'now' would make it 15.
    expect(wrapTextRuns(styled, font, 11, mono)).toEqual([
      [
        { text: 'go ', color: [1, 0, 0, 1] },
        { text: 'x', shift: 4 },
        { text: ' there', link },
      ],
      [{ text: 'now', link }],
    ]);
  });

  it('measures words per run face, and the laid-out widths add up within the limit', () => {
    const lines: TextRunLines = [
      [
        { text: 'The quick ' },
        { text: 'brown fox', font: bold },
        { text: ' jumps over the ' },
        { text: 'lazy', font: { style: 'italic' } },
        { text: ' dog' },
      ],
    ];
    const limit = 60;
    const out = wrapTextRuns(lines, font, limit, { oracle });
    expect(out.length).toBeGreaterThan(2);
    // Nothing lost: the lines joined by spaces give the text back.
    expect(texts(out).join(' ')).toBe('The quick brown fox jumps over the lazy dog');
    for (const line of out) {
      const layout = layoutTextRuns([line], { font }, oracle);
      expect(layout.width).toBeLessThanOrEqual(limit);
      // Runs sit end to end.
      layout.items.forEach((item, k) => {
        const next = layout.items[k + 1];
        if (next) expect(next.x).toBeCloseTo(item.x + item.width);
      });
    }
    // One plain run wraps like the plain wrap: each word plus one space, measured between letters.
    const plain = wrapTextRuns([[{ text: 'aa bb cc' }]], font, w('aa bb') + w(' '), { oracle });
    expect(texts(plain)).toEqual(['aa bb', 'cc']);
  });
});
