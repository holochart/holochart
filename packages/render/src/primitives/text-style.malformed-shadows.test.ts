import { describe, expect, it } from 'vitest';
import { parseShadowColor, parseTextShadow } from './text-style.ts';

/**
 * `font.shadow` comes straight from figures, so the parser sees whatever users type. These cases
 * are the malformed and loosely formatted inputs: each must end in a usable shadow or in "no
 * shadow" (`null`), never in NaN channels that would reach the outline pass.
 */
describe('parseShadowColor: malformed rgb()', () => {
  it('rejects an alpha that is not a number, in both syntaxes', () => {
    expect(parseShadowColor('rgba(0, 0, 0, opaque)')).toBeNull();
    expect(parseShadowColor('rgb(0 0 0 / half)')).toBeNull();
  });

  it('rejects rgb() with missing or non-numeric channels', () => {
    expect(parseShadowColor('rgb()')).toBeNull();
    expect(parseShadowColor('rgb(10)')).toBeNull();
    expect(parseShadowColor('rgb(red, green, blue)')).toBeNull();
  });

  it('clamps out-of-range channels and alpha like CSS', () => {
    expect(parseShadowColor('rgb(300, -20, 0)')).toEqual([1, 0, 0, 1]);
    expect(parseShadowColor('rgba(0, 0, 0, 7)')).toEqual([0, 0, 0, 1]);
    expect(parseShadowColor('rgb(0 0 0 / 150%)')).toEqual([0, 0, 0, 1]);
    expect(parseShadowColor('rgba(0, 0, 0, -1)')).toEqual([0, 0, 0, 0]);
  });
});

describe('parseTextShadow: loose formatting', () => {
  it('accepts any amount of whitespace between tokens', () => {
    expect(parseTextShadow('1px   2px \t 3px    black')).toEqual({
      offsetX: 1,
      offsetY: 2,
      blur: 3,
      width: 0,
      color: [0, 0, 0, 1],
    });
  });

  it('a list without a single shadow in it is no shadow', () => {
    expect(parseTextShadow(',')).toBeNull();
    expect(parseTextShadow(' , ')).toBeNull();
  });

  it('a malformed color function still yields a shadow, in black', () => {
    // "an unknown color is black": the lengths are valid, so the shadow is kept.
    expect(parseTextShadow('1px 1px rgba(0, 0, 0, opaque)', [1, 0, 0, 1])).toMatchObject({
      offsetX: 1,
      offsetY: 1,
      color: [0, 0, 0, 1],
    });
  });
});
