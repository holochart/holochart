import { describe, expect, it } from 'vitest';
import {
  assignLabelSlots,
  labelFontRequests,
  resolveTextLabel,
  resolveTextLabelMembers,
  type ResolvedTextLabel,
  type TextLabel,
  type TextStyle,
} from './text-layout.ts';
import {
  TEXT_DEFAULT_LINE_HEIGHT,
  createFallbackTextMeasurer,
  createFontMetricsOracle,
} from './text-metrics.ts';

const oracle = createFontMetricsOracle({ measurer: createFallbackTextMeasurer() });
const noFonts = (): undefined => undefined;

function members(label: TextLabel, style: TextStyle = {}): ResolvedTextLabel[] {
  const out: ResolvedTextLabel[] = [];
  resolveTextLabelMembers(label, style, oracle, noFonts, 0, out);
  return out;
}

describe('labelFontRequests: the faces a label needs', () => {
  it('a plain label needs its own face; an empty one needs none', () => {
    expect(labelFontRequests({ text: 'a', x: 0, y: 0 }, {})).toEqual([
      { family: 'sans-serif', weight: 400, style: 'normal' },
    ]);
    expect(
      labelFontRequests(
        { text: 'a', x: 0, y: 0, font: { weight: 'bold' } },
        { font: { family: 'Inter', weight: 300, style: 'italic' } },
      ),
    ).toEqual([{ family: 'Inter', weight: 700, style: 'italic' }]);
    expect(labelFontRequests({ text: '', x: 0, y: 0, font: { weight: 'bold' } }, {})).toEqual([]);
    // Figures from plain JS may carry no text at all.
    expect(labelFontRequests({ text: null as unknown as string, x: 0, y: 0 }, {})).toEqual([]);
  });

  it('a rich label needs one face per non-blank run, with the run overrides applied', () => {
    const label: TextLabel = {
      text: 'a b c d',
      x: 0,
      y: 0,
      font: { family: 'Inter', style: 'italic' },
      runs: [
        [
          { text: 'a' },
          { text: '  ' },
          { text: 'b', font: { weight: 'bold' } },
          { text: 'c', font: { family: 'Mono', style: 'normal' } },
        ],
        [{ text: 'd', font: { style: 'oblique' as 'italic', weight: 300 } }],
      ],
    };
    expect(labelFontRequests(label, {})).toEqual([
      { family: 'Inter', weight: 400, style: 'italic' },
      { family: 'Inter', weight: 700, style: 'italic' },
      { family: 'Mono', weight: 400, style: 'normal' },
      { family: 'Inter', weight: 300, style: 'italic' },
    ]);
  });

  it('a rich label of blank runs needs no face, whatever its plain text says', () => {
    expect(labelFontRequests({ text: 'x', x: 0, y: 0, runs: [[{ text: ' ' }], []] }, {})).toEqual(
      [],
    );
  });
});

describe('resolveTextLabelMembers: label styling reaches every run', () => {
  const halo = { width: 2, color: [1, 1, 1, 1] as const };
  const runs = [[{ text: 'a' }], [{ text: 'b' }]];
  const base: TextLabel = { text: 'a\nb', x: 1, y: 2, font: { size: 10 }, runs };

  it('passes offset, outline and line height on, and spaces lines by the line height', () => {
    const [a, b] = members({ ...base, offset: [3, -4], outline: halo, lineHeight: 2 });
    for (const m of [a!, b!]) {
      expect(m.offsetX).toBe(3);
      expect(m.offsetY).toBe(-4);
      expect(m.outline).toBe(halo);
      expect(m.layout.lineHeight).toBe(2);
    }
    // Baseline anchor: the first baseline is on the anchor, the next one line advance (2 × 10 px)
    // below it.
    expect(a!.localY).toBe(0);
    expect(b!.localY).toBeCloseTo(-20);
  });

  it('falls back to the shared style for fields the label leaves unset', () => {
    const [a, b] = members(base, { outline: halo, lineHeight: 1.5, offset: [7, 0] });
    expect(a!.outline).toBe(halo);
    expect(a!.offsetX).toBe(7);
    expect(b!.layout.lineHeight).toBe(1.5);
    expect(b!.localY).toBeCloseTo(-15);
  });

  it("lets the label turn the shared style's outline off for all its runs", () => {
    const out = members({ ...base, outline: null }, { outline: halo });
    expect(out.map((m) => m.outline)).toEqual([null, null]);
  });

  it('hides every run of a label whose depth is not finite, and shows them otherwise', () => {
    expect(members({ ...base, z: 5 }).map((m) => m.visible)).toEqual([true, true]);
    expect(members({ ...base, z: Infinity }).map((m) => m.visible)).toEqual([false, false]);
  });
});

describe('resolveTextLabel: input from untyped figures', () => {
  const resolve = (label: Partial<TextLabel>, style: TextStyle = {}) =>
    resolveTextLabel({ text: 'Label', x: 0, y: 0, ...label }, style, oracle, noFonts);

  it('treats missing text as empty (hidden) and stringifies other values', () => {
    for (const text of [null, undefined]) {
      const r = resolve({ text: text as unknown as string });
      expect(r.layout.text).toBe('');
      expect(r.visible).toBe(false);
    }
    const n = resolve({ text: 42 as unknown as string });
    expect(n.layout.text).toBe('42');
    expect(n.visible).toBe(true);
  });

  it('uses the default line height unless a positive one is given', () => {
    expect(resolve({}).layout.lineHeight).toBe(TEXT_DEFAULT_LINE_HEIGHT);
    expect(resolve({ lineHeight: 1.5 }).layout.lineHeight).toBe(1.5);
    expect(resolve({}, { lineHeight: 1.4 }).layout.lineHeight).toBe(1.4);
    expect(resolve({ lineHeight: 0 }).layout.lineHeight).toBe(TEXT_DEFAULT_LINE_HEIGHT);
    expect(resolve({ lineHeight: -2 }, { lineHeight: 1.4 }).layout.lineHeight).toBe(
      TEXT_DEFAULT_LINE_HEIGHT,
    );
  });
});

describe('assignLabelSlots: several idle members with the same glyphs', () => {
  it('hands them out one per label, lowest candidate first, and re-typesets only the rest', () => {
    // No label keeps its index. Two idle 'a' members serve the two 'a' labels as they are, 'q'
    // serves the 'q' label, and 'x' finds nothing left to reuse: a new member.
    const { slot, resync } = assignLabelSlots(['a', 'a', 'q'], ['q', 'x', 'a', 'a']);
    expect(Array.from(slot)).toEqual([2, -1, 0, 1]);
    expect(Array.from(resync)).toEqual([0, 1, 0, 0]);
  });

  it('re-typesets a leftover member for a label no member matches', () => {
    const { slot, resync } = assignLabelSlots(['a', 'a', 'a'], ['x', 'a']);
    // 'a' at index 1 stays in place; 'x' takes the first unused member and is re-typeset.
    expect(Array.from(slot)).toEqual([0, 1]);
    expect(Array.from(resync)).toEqual([1, 0]);
  });
});
