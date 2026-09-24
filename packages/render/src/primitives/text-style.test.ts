import { describe, expect, it } from 'vitest';
import {
  PETITE_CAPS_SCALE,
  SMALL_CAPS_SCALE,
  applyTextCase,
  hasDecorationLines,
  parseLinePosition,
  parseShadowColor,
  parseTextShadow,
  resolveTextTransform,
  textContrastColor,
} from './text-style.ts';

describe('applyTextCase', () => {
  it('upper / lower / normal', () => {
    expect(applyTextCase('Hello World', 'upper')).toBe('HELLO WORLD');
    expect(applyTextCase('Hello World', 'lower')).toBe('hello world');
    expect(applyTextCase('Hello World', 'normal')).toBe('Hello World');
    expect(applyTextCase('Hello World', undefined)).toBe('Hello World');
    expect(applyTextCase('straße', 'upper')).toBe('STRASSE');
  });

  it('word caps capitalizes the first letter of each word, Unicode-aware', () => {
    expect(applyTextCase('élan vital', 'word caps')).toBe('Élan Vital');
    expect(applyTextCase('hello  wORLD\nnew line', 'word caps')).toBe('Hello  WORLD\nNew Line');
    expect(applyTextCase('ωμέγα άλφα', 'word caps')).toBe('Ωμέγα Άλφα');
    // Leading punctuation is skipped; words starting with a digit are left alone (CSS).
    expect(applyTextCase('"quoted" (paren) 3d', 'word caps')).toBe('"Quoted" (Paren) 3d');
    // Letters inside a word are not word starts.
    expect(applyTextCase('x-axis', 'word caps')).toBe('X-axis');
  });
});

describe('resolveTextTransform (variant approximation)', () => {
  it('is the identity for normal text', () => {
    const t = resolveTextTransform({});
    expect(t.identity).toBe(true);
    expect(t.sizeScale).toBe(1);
    expect(t.transform('Abc')).toBe('Abc');
    expect(resolveTextTransform({ textcase: 'normal', variant: 'normal' }).identity).toBe(true);
  });

  it('small and petite caps: uppercase at a reduced size', () => {
    for (const variant of ['small-caps', 'all-small-caps'] as const) {
      const t = resolveTextTransform({ variant });
      expect(t.transform('Small Caps')).toBe('SMALL CAPS');
      expect(t.sizeScale).toBe(SMALL_CAPS_SCALE);
    }
    for (const variant of ['petite-caps', 'all-petite-caps'] as const) {
      const t = resolveTextTransform({ variant });
      expect(t.transform('Petite')).toBe('PETITE');
      expect(t.sizeScale).toBe(PETITE_CAPS_SCALE);
    }
    expect(SMALL_CAPS_SCALE).toBe(0.8);
    expect(PETITE_CAPS_SCALE).toBe(0.72);
  });

  it('unicase: uppercase at full size', () => {
    const t = resolveTextTransform({ variant: 'unicase' });
    expect(t.transform('Uni')).toBe('UNI');
    expect(t.sizeScale).toBe(1);
    expect(t.identity).toBe(false);
  });

  it('applies textcase, then the variant; the transform is idempotent', () => {
    const lower = resolveTextTransform({ textcase: 'lower' });
    expect(lower.transform('ABC')).toBe('abc');
    expect(lower.sizeScale).toBe(1);
    const both = resolveTextTransform({ textcase: 'lower', variant: 'small-caps' });
    expect(both.transform('Abc')).toBe('ABC');
    expect(both.sizeScale).toBe(SMALL_CAPS_SCALE);
    const caps = resolveTextTransform({ textcase: 'word caps' });
    expect(caps.transform(caps.transform('élan vital'))).toBe('Élan Vital');
  });
});

describe('parseLinePosition', () => {
  it('parses the flaglist', () => {
    expect(parseLinePosition('under')).toEqual({ under: true, over: false, through: false });
    expect(parseLinePosition('over+through')).toEqual({ under: false, over: true, through: true });
    expect(parseLinePosition(' Under + OVER + through ')).toEqual({
      under: true,
      over: true,
      through: true,
    });
  });

  it('treats none, empty, unknown, and unset as no lines', () => {
    for (const value of ['none', '', 'sideways', undefined, null]) {
      const lines = parseLinePosition(value);
      expect(lines).toEqual({ under: false, over: false, through: false });
      expect(hasDecorationLines(lines)).toBe(false);
    }
    expect(hasDecorationLines(parseLinePosition('through'))).toBe(true);
  });
});

describe('parseShadowColor', () => {
  it('parses hex colors', () => {
    expect(parseShadowColor('#fff')).toEqual([1, 1, 1, 1]);
    expect(parseShadowColor('#0008')).toEqual([0, 0, 0, 0x88 / 255]);
    expect(parseShadowColor('#FF0000')).toEqual([1, 0, 0, 1]);
    expect(parseShadowColor('#00ff0080')).toEqual([0, 1, 0, 0x80 / 255]);
  });

  it('parses rgb()/rgba() in legacy and modern syntax', () => {
    expect(parseShadowColor('rgb(255, 0, 0)')).toEqual([1, 0, 0, 1]);
    expect(parseShadowColor('rgba(0,0,0,0.5)')).toEqual([0, 0, 0, 0.5]);
    expect(parseShadowColor('rgb(0 0 255 / 25%)')).toEqual([0, 0, 1, 0.25]);
    expect(parseShadowColor('rgb(100%, 50%, 0%)')).toEqual([1, 0.5, 0, 1]);
  });

  it('parses a few names and rejects the rest', () => {
    expect(parseShadowColor('black')).toEqual([0, 0, 0, 1]);
    expect(parseShadowColor('White')).toEqual([1, 1, 1, 1]);
    expect(parseShadowColor('transparent')).toEqual([0, 0, 0, 0]);
    expect(parseShadowColor('grey')).toEqual(parseShadowColor('gray'));
    expect(parseShadowColor('rebeccapurple')).toBeNull();
    expect(parseShadowColor('#12')).toBeNull();
    expect(parseShadowColor('rgb(1, 2)')).toBeNull();
  });
});

describe('parseTextShadow', () => {
  const red = [1, 0, 0, 1] as const;

  it('parses offsets, blur, and color in either order', () => {
    expect(parseTextShadow('1px 2px 3px black')).toEqual({
      offsetX: 1,
      offsetY: 2,
      blur: 3,
      width: 0,
      color: [0, 0, 0, 1],
    });
    expect(parseTextShadow('rgba(0, 0, 0, 0.5) -1px 0 2px')).toMatchObject({
      offsetX: -1,
      offsetY: 0,
      blur: 2,
      color: [0, 0, 0, 0.5],
    });
    expect(parseTextShadow('0.5em 1px', [0, 0, 0, 1], 10)).toMatchObject({
      offsetX: 5,
      offsetY: 1,
      blur: 0,
    });
  });

  it('uses the text color when none is given and black for unknown colors', () => {
    expect(parseTextShadow('1px 1px', red)?.color).toEqual(red);
    expect(parseTextShadow('1px 1px currentColor', red)?.color).toEqual(red);
    expect(parseTextShadow('1px 1px 1px papayawhip', red)?.color).toEqual([0, 0, 0, 1]);
  });

  it('uses only the first shadow of a list', () => {
    expect(parseTextShadow('rgb(255, 0, 0) 1px 1px, 2px 2px blue')).toMatchObject({
      offsetX: 1,
      offsetY: 1,
      color: [1, 0, 0, 1],
    });
  });

  it("'auto' is a thin halo in the text's contrast color", () => {
    expect(parseTextShadow('auto', [0.1, 0.1, 0.1, 1])).toEqual({
      offsetX: 0,
      offsetY: 0,
      blur: 1,
      width: 1,
      color: [1, 1, 1, 1],
    });
    expect(parseTextShadow('AUTO', [1, 1, 0.9, 1])?.color).toEqual([0, 0, 0, 1]);
    // Default text color is black → white halo.
    expect(parseTextShadow('auto')?.color).toEqual([1, 1, 1, 1]);
  });

  it("returns null for 'none', empty, and invalid values", () => {
    for (const value of [
      'none',
      ' None ',
      '',
      undefined,
      null,
      'black',
      '1px',
      '1px 2px 3px 4px',
    ]) {
      expect(parseTextShadow(value)).toBeNull();
    }
  });

  it('textContrastColor uses perceived brightness', () => {
    expect(textContrastColor([0, 0, 1, 1])).toEqual([1, 1, 1, 1]); // blue is dark
    expect(textContrastColor([1, 1, 0, 1])).toEqual([0, 0, 0, 1]); // yellow is light
  });
});
