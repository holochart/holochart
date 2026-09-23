import { describe, expect, it } from 'vitest';
import { measure } from '../__testing__/fixtures.ts';
import { overlayTransform, rectTransform, sameTransform } from './host.ts';
import { inheritFont, measureBlock, plainText, rgba, styledText, textFont } from './text.ts';

describe('plainText', () => {
  it('turns <br> into line breaks and strips other tags', () => {
    expect(plainText('Jan 5<br>2026')).toBe('Jan 5\n2026');
    expect(plainText('a<BR/>b<br />c')).toBe('a\nb\nc');
    expect(plainText('<span style="color:red">red</span> and <b>bold</b>')).toBe('red and bold');
  });

  it('maps <sup>/<sub> digits and signs to Unicode', () => {
    expect(plainText('10<sup>−3</sup>')).toBe('10⁻³');
    expect(plainText('H<sub>2</sub>O')).toBe('H₂O');
    expect(plainText('x<sup>n+1</sup>')).toBe('xⁿ⁺¹');
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

  it('leaves partial styling to rich text', () => {
    expect(styledText('<b>Iris</b> data', font)).toEqual({ text: 'Iris data', font });
    expect(styledText('<b>a</b><b>b</b>', font)).toEqual({ text: 'ab', font });
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
