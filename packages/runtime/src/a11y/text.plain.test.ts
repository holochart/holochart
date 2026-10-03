import { describe, expect, it } from 'vitest';
import { accessibleText, countText, formatPlainNumber, listText, traceNameText } from './text.ts';

describe('accessibleText: entities (E17.1)', () => {
  it('decodes the named entities Plotly text uses, whatever their case', () => {
    expect(accessibleText('a &lt; b &GT; c &quot;d&quot; &apos;e&apos; f&nbsp;g &AMP; h')).toBe(
      'a < b > c "d" \'e\' f g & h',
    );
  });

  it('decodes decimal and hexadecimal character references', () => {
    expect(accessibleText('&#8364;5 &#x20AC;5 &#X20ac;5 &#128512;')).toBe('€5 €5 €5 😀');
  });

  it('leaves entities it does not know, and references to no character, as written', () => {
    expect(accessibleText('&copy; 2024 &madeup;')).toBe('&copy; 2024 &madeup;');
    // 0 and anything past U+10FFFF are not code points.
    expect(accessibleText('a&#0;b &#x110000; &#99999999;')).toBe('a&#0;b &#x110000; &#99999999;');
    expect(accessibleText('Fish & chips; R&D')).toBe('Fish & chips; R&D');
  });

  it('turns any value into text, and nothing into the empty string', () => {
    expect(accessibleText(null)).toBe('');
    expect(accessibleText(42)).toBe('42');
    expect(accessibleText(false)).toBe('false');
    expect(accessibleText('<a href="https://example.com">link</a><BR/>next')).toBe('link next');
  });
});

describe('plain-text helpers (E17.1)', () => {
  it('joins lists of any length', () => {
    expect(listText([])).toBe('');
    expect(listText(['line'])).toBe('line');
    expect(listText(['line', 'bar'])).toBe('line and bar');
    expect(listText(['line', 'bar', 'pie', 'box'])).toBe('line, bar, pie and box');
  });

  it('counts with the right noun form and thousands separators', () => {
    expect(countText(1, 'point')).toBe('1 point');
    expect(countText(0, 'point')).toBe('0 points');
    expect(countText(1234567, 'row')).toBe('1,234,567 rows');
    expect(countText(1, 'category', 'categories')).toBe('1 category');
    expect(countText(2, 'category', 'categories')).toBe('2 categories');
  });

  it("names a trace by its plain-text name, or Plotly's default", () => {
    expect(traceNameText('Rev <b>2024</b>', 3)).toBe('Rev 2024');
    expect(traceNameText(undefined, 3)).toBe('trace 3');
    expect(traceNameText('<br>', 0)).toBe('trace 0');
    expect(traceNameText(2024, 0)).toBe('2024');
  });

  it('shows numbers with up to six significant digits and no trailing zeros', () => {
    expect(formatPlainNumber(1234.5)).toBe('1234.5');
    expect(formatPlainNumber(0.000123)).toBe('0.000123');
    expect(formatPlainNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatPlainNumber(2.50000001)).toBe('2.5');
    expect(formatPlainNumber(-7)).toBe('-7');
    expect(formatPlainNumber(Infinity)).toBe('Infinity');
    expect(formatPlainNumber(NaN)).toBe('NaN');
  });
});
