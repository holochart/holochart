import { describe, expect, it } from 'vitest';
import {
  lineCount,
  plainText,
  TEXT_LINE_HEIGHT,
  TEXT_POSITIONS,
  textPlacement,
} from './text-position.ts';

describe('textPlacement', () => {
  const fs = 12;

  it('lists the nine Plotly positions', () => {
    expect(TEXT_POSITIONS).toHaveLength(9);
    expect(TEXT_POSITIONS).toContain('middle center');
    expect(TEXT_LINE_HEIGHT).toBe(1.3);
  });

  // Expected values straight from Plotly's formula, one line of text.
  const cases: [string, 'left' | 'center' | 'right', number, number][] = [
    ['top left', 'right', -1, -1],
    ['top center', 'center', 0, -1],
    ['top right', 'left', 1, -1],
    ['middle left', 'right', -1, 0],
    ['middle center', 'center', 0, 0],
    ['middle right', 'left', 1, 0],
    ['bottom left', 'right', -1, 1],
    ['bottom center', 'center', 0, 1],
    ['bottom right', 'left', 1, 1],
  ];

  it.each(cases)('%s without markers', (pos, anchorX, _sh, sv) => {
    const dy = fs * 0.75 + ((sv - 1) * fs) / 2;
    expect(textPlacement(pos, fs, 0, 1)).toEqual({
      anchorX,
      anchorY: 'baseline',
      offset: [0, dy],
    });
  });

  it.each(cases)('%s with markers', (pos, anchorX, sh, sv) => {
    const r = 5 / 0.8 + 1;
    const p = textPlacement(pos, fs, 5, 1);
    expect(p.anchorX).toBe(anchorX);
    expect(p.offset[0]).toBeCloseTo(sh * r, 12);
    expect(p.offset[1]).toBeCloseTo(fs * 0.75 + sv * r + ((sv - 1) * fs) / 2, 12);
  });

  it('gives exact values for a few positions', () => {
    expect(textPlacement('middle center', 12, 0, 1).offset).toEqual([0, 3]);
    expect(textPlacement('top center', 12, 0, 1).offset).toEqual([0, -3]);
    expect(textPlacement('bottom center', 12, 0, 1).offset).toEqual([0, 9]);
    // r = 4 / 0.8 + 1 = 6
    expect(textPlacement('top left', 12, 4, 1).offset).toEqual([-6, -9]);
    expect(textPlacement('bottom right', 12, 4, 1).offset).toEqual([6, 15]);
    expect(textPlacement('middle right', 12, 4, 1).offset).toEqual([6, 3]);
  });

  it('shifts multi-line text by the block height', () => {
    // numLines = (3 − 1)·1.3 + 1 = 3.6
    expect(textPlacement('middle center', 10, 0, 3).offset[1]).toBeCloseTo(7.5 - 18, 12);
    expect(textPlacement('top center', 10, 0, 3).offset[1]).toBeCloseTo(7.5 - 36, 12);
    // Bottom placement starts below the point regardless of the line count.
    expect(textPlacement('bottom center', 10, 0, 3).offset[1]).toBeCloseTo(7.5, 12);
  });

  it('treats unknown positions as middle center', () => {
    expect(textPlacement('nonsense', 12, 4, 1)).toEqual(textPlacement('middle center', 12, 4, 1));
  });

  it('ignores invalid marker radii', () => {
    expect(textPlacement('top center', 12, Number.NaN, 1).offset).toEqual([0, -3]);
  });
});

describe('plainText', () => {
  it('converts <br> variants to newlines', () => {
    expect(plainText('a<br>b<BR>c<br/>d<br />e')).toBe('a\nb\nc\nd\ne');
  });

  it('strips other tags', () => {
    expect(plainText('<b>bold</b> <i>it</i> x<sup>2</sup> <a href="u">link</a>')).toBe(
      'bold it x2 link',
    );
  });

  it('keeps comparison signs that are not tags', () => {
    expect(plainText('a < b > c')).toBe('a < b > c');
  });

  it('decodes entities once', () => {
    expect(plainText('&amp; &lt; &gt; &quot; &#39; &nbsp;|')).toBe('& < > " \'  |');
    expect(plainText('&amp;lt;')).toBe('&lt;');
    expect(plainText('&lt;b&gt;')).toBe('<b>');
    expect(plainText('&#x41;&unknown;')).toBe('A&unknown;');
  });

  it('turns raw newlines into spaces like Plotly', () => {
    expect(plainText('a\nb\r\nc')).toBe('a b c');
  });

  it('returns plain strings unchanged', () => {
    expect(plainText('hello')).toBe('hello');
  });
});

describe('lineCount', () => {
  it('counts lines', () => {
    expect(lineCount('')).toBe(1);
    expect(lineCount('a')).toBe(1);
    expect(lineCount(plainText('a<br>b<br>c'))).toBe(3);
  });
});
