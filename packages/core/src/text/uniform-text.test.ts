import { describe, expect, it } from 'vitest';
import {
  isUniformTextHidden,
  uniformFontSize,
  uniformTextOf,
  uniformTextScale,
  uniformTextSize,
  type UniformText,
} from './uniform-text.ts';

const hide: UniformText = { mode: 'hide', minsize: 8 };
const show: UniformText = { mode: 'show', minsize: 8 };
const off: UniformText = { mode: false, minsize: 0 };

describe('uniformtext', () => {
  it('reads the defaulted layout', () => {
    expect(uniformTextOf({})).toEqual(off);
    expect(uniformTextOf({ uniformtext: { mode: false, minsize: 10 } })).toEqual(off);
    expect(uniformTextOf({ uniformtext: { mode: 'hide', minsize: 10 } })).toEqual({
      mode: 'hide',
      minsize: 10,
    });
  });

  it('raises fonts to minsize only when a mode is set', () => {
    expect(uniformFontSize(6, hide)).toBe(8);
    expect(uniformFontSize(12, hide)).toBe(12);
    expect(uniformFontSize(6, off)).toBe(6);
  });

  it('finds the smallest fitted size across labels, ignoring hidden candidates', () => {
    const items = [
      { fontSize: 12, scale: 1 }, // 12
      { fontSize: 12, scale: 0.75 }, // 9
      { fontSize: 12, scale: 0.5 }, // 6 < 8: hidden candidate
    ];
    expect(uniformTextSize(items, hide)).toBe(9);
    expect(isUniformTextHidden(items[2]!, hide)).toBe(true);
    expect(uniformTextSize(items, off)).toBeUndefined();
    expect(uniformTextSize([{ fontSize: 12, scale: 0.1 }], hide)).toBe(Infinity);
    // max(size, minsize): a label exactly at minsize counts as minsize.
    expect(uniformTextSize([{ fontSize: 10, scale: 0.8 }], hide)).toBe(8);
  });

  it('scales every label to the uniform size; hides or shows the small ones', () => {
    expect(uniformTextScale({ fontSize: 12, scale: 1 }, 9, hide)).toBe(0.75);
    expect(uniformTextScale({ fontSize: 18, scale: 1 }, 9, hide)).toBe(0.5);
    expect(uniformTextScale({ fontSize: 12, scale: 0.5 }, 9, hide)).toBe(0);
    expect(uniformTextScale({ fontSize: 12, scale: 0.5 }, 9, show)).toBe(0.75);
    // Everything hidden: `show` falls back to minsize.
    expect(uniformTextScale({ fontSize: 16, scale: 0.1 }, Infinity, show)).toBe(0.5);
    // Off, or a zero uniform size (Plotly's falsy `minSize`): unchanged.
    expect(uniformTextScale({ fontSize: 12, scale: 0.5 }, undefined, off)).toBe(0.5);
    expect(uniformTextScale({ fontSize: 12, scale: 0.5 }, 0, { mode: 'show', minsize: 0 })).toBe(
      0.5,
    );
  });
});
