import { describe, expect, it, vi } from 'vitest';
import { measure } from '../__testing__/fixtures.ts';
import { overlayTransform, rectTransform, sameTransform } from './host.ts';
import {
  fadeRuns,
  handleLinkPointer,
  inheritFont,
  measureBlock,
  measureStyled,
  plainText,
  rgba,
  styledText,
  textFont,
} from './text.ts';

describe('plainText', () => {
  it('turns <br> into line breaks and strips other tags', () => {
    expect(plainText('Jan 5<br>2026')).toBe('Jan 5\n2026');
    expect(plainText('a<BR/>b<br />c')).toBe('a\nb\nc');
    expect(plainText('<span style="color:red">red</span> and <b>bold</b>')).toBe('red and bold');
  });

  it('drops <sup>/<sub> tags like any other (the runs draw them)', () => {
    expect(plainText('10<sup>−3</sup>')).toBe('10−3');
    expect(plainText('H<sub>2</sub>O')).toBe('H2O');
  });

  it('decodes entities', () => {
    expect(plainText('a &amp; b &lt;c&gt; &#65;&#x42;&nbsp;')).toBe('a & b <c> AB ');
    expect(plainText('&unknown;')).toBe('&unknown;');
    expect(plainText('')).toBe('');
  });
});

describe('styledText', () => {
  const font = { family: 'Inter', size: 12 };

  it('styles labels wholly wrapped in <b>/<i>', () => {
    expect(styledText('<b>Title</b>', font)).toEqual({
      text: 'Title',
      font: { ...font, weight: 'bold' },
    });
    expect(styledText('<i><b>T</b></i>', font).font).toEqual({
      ...font,
      weight: 'bold',
      style: 'italic',
    });
  });

  it('turns partial styling into rich runs', () => {
    expect(styledText('<b>Iris</b> data', font)).toEqual({
      text: 'Iris data',
      font,
      runs: [[{ text: 'Iris', font: { weight: 'bold' } }, { text: ' data' }]],
    });
    // Adjacent runs with the same style merge: this is one bold label.
    expect(styledText('<b>a</b><b>b</b>', font)).toEqual({
      text: 'ab',
      font: { ...font, weight: 'bold' },
    });
    const sup = styledText('x<sup>2</sup>', font);
    expect(sup.text).toBe('x2');
    expect(sup.runs?.[0]?.[1]).toMatchObject({ text: '2', shift: expect.closeTo(0.6 * 8.4, 6) });
  });

  it('keeps plain strings and whole-label colors on the right path', () => {
    expect(styledText('plain\ntext', font)).toEqual({ text: 'plain\ntext', font });
    expect(styledText('a<br>b &amp; c', font)).toEqual({ text: 'a\nb & c', font });
    // A color can't be expressed by the label font: drawn as one run.
    expect(styledText('<span style="color:red">r</span>', font).runs).toEqual([
      [{ text: 'r', color: [1, 0, 0, 1] }],
    ]);
  });
});

describe('rich labels', () => {
  const font = { family: 'Inter', size: 10 };

  it('measures runs like the text primitive lays them out', () => {
    const plain = measureStyled({ text: 'ab', font }, measure);
    expect(plain).toEqual({ width: 10, height: 13, lines: 1 });
    const rich = measureStyled(styledText('<b>ab</b><br>c<sup>2</sup>', font), measure);
    expect(rich.lines).toBe(2);
    expect(rich.height).toBeCloseTo(26);
    expect(rich.width).toBeGreaterThan(0);
  });

  it('fades explicit run colors', () => {
    const runs = styledText('<span style="color:#f00">a</span>b', font).runs ?? [];
    expect(fadeRuns(runs, 0.5)).toEqual([[{ text: 'a', color: [1, 0, 0, 0.5] }, { text: 'b' }]]);
    expect(fadeRuns(runs, 1)).toBe(runs);
  });

  it('handles pointer events over links', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    try {
      const link = { href: 'https://x.org', target: '_self' };
      const event = { type: 'move', x: 0, y: 0, button: 0, cursor: undefined } as never as {
        type: string;
        cursor: string | undefined;
        button: number;
      };
      expect(handleLinkPointer(event as never, link)).toBe(true);
      expect(event.cursor).toBe('pointer');
      event.type = 'click';
      expect(handleLinkPointer(event as never, link)).toBe(true);
      expect(open).toHaveBeenCalledWith('https://x.org', '_self', 'noopener');
      event.type = 'wheel';
      expect(handleLinkPointer(event as never, link)).toBe(false);
      expect(handleLinkPointer(event as never, null)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('fonts and measurement', () => {
  it('inherits unset font fields', () => {
    const base = {
      family: 'Inter',
      size: 12,
      color: '#444',
      weight: 'normal',
      style: 'normal',
    } as const;
    expect(inheritFont({ size: 20 }, base)).toEqual({ ...base, size: 20 });
    expect(inheritFont(undefined, base)).toEqual(base);
    expect(textFont(base, 0.5)).toEqual({
      family: 'Inter',
      size: 6,
      weight: 'normal',
      style: 'normal',
    });
  });

  it('measures multi-line blocks', () => {
    expect(measureBlock('ab\nabcd', { family: 'x', size: 10 }, measure)).toEqual({
      width: 20,
      height: 26,
      lines: 2,
    });
    expect(measureBlock('', { family: 'x', size: 10 }, measure)).toEqual({
      width: 0,
      height: 0,
      lines: 0,
    });
  });

  it('parses colors with a fallback', () => {
    expect(rgba('#ff0000')).toEqual([1, 0, 0, 1]);
    expect(rgba('nope', [0, 0, 0, 1])).toEqual([0, 0, 0, 1]);
    expect(rgba(undefined)).toEqual([0, 0, 0, 0]);
  });
});

describe('transforms', () => {
  it('maps container px to overlay and viewport world px', () => {
    const o = overlayTransform(400);
    // Container (10, 30) → world (10, 370).
    expect(10 * o.scaleX + o.offsetX).toBe(10);
    expect(30 * o.scaleY + o.offsetY).toBe(370);
    const r = rectTransform({ x: 50, y: 20, width: 100, height: 80 });
    // The rect's bottom-left corner (50, 100) is the viewport origin.
    expect(50 * r.scaleX + r.offsetX).toBe(0);
    expect(100 * r.scaleY + r.offsetY).toBe(0);
    expect(sameTransform(o, overlayTransform(400))).toBe(true);
    expect(sameTransform(undefined, o)).toBe(false);
  });
});
