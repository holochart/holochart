import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearFontRegistry,
  cssFontFamily,
  cssFontString,
  fontWeightRank,
  normalizeFontStyle,
  normalizeFontWeight,
  parseFontFamilyList,
  registerFont,
  resolveFontURL,
  subscribeFontChanges,
} from './text-fonts.ts';

afterEach(() => clearFontRegistry());

describe('font normalization', () => {
  it('maps weight keywords and clamps numbers', () => {
    expect(normalizeFontWeight(undefined)).toBe(400);
    expect(normalizeFontWeight('normal')).toBe(400);
    expect(normalizeFontWeight('bold')).toBe(700);
    expect(normalizeFontWeight(1200)).toBe(1000);
    expect(normalizeFontWeight(Number.NaN)).toBe(400);
  });

  it('treats oblique as italic and anything else as normal', () => {
    expect(normalizeFontStyle('oblique')).toBe('italic');
    expect(normalizeFontStyle('italic')).toBe('italic');
    expect(normalizeFontStyle(undefined)).toBe('normal');
  });
});

describe('CSS family helpers', () => {
  it('parses family lists and strips quotes', () => {
    expect(parseFontFamilyList(`"Open Sans", 'Noto Sans' , arial,, sans-serif`)).toEqual([
      'Open Sans',
      'Noto Sans',
      'arial',
      'sans-serif',
    ]);
  });

  it('quotes named families but not generic keywords', () => {
    expect(cssFontFamily('Open Sans, SANS-SERIF')).toBe('"Open Sans", sans-serif');
    expect(cssFontFamily('')).toBe('sans-serif');
    expect(cssFontString({ family: 'Inter', weight: 'bold', style: 'italic' }, 12)).toBe(
      'italic 700 12px "Inter"',
    );
  });
});

describe('fontWeightRank (CSS matching order)', () => {
  const order = (target: number, weights: number[]): number[] =>
    [...weights].sort((a, b) => fontWeightRank(target, a) - fontWeightRank(target, b));

  it('400: exact, then up to 500, then lighter, then heavier', () => {
    expect(order(400, [300, 500, 700, 100, 400])).toEqual([400, 500, 300, 100, 700]);
  });

  it('700: heavier first, then lighter descending', () => {
    expect(order(700, [400, 900, 300, 800])).toEqual([800, 900, 400, 300]);
  });

  it('300: lighter first, then heavier ascending', () => {
    expect(order(300, [400, 200, 100, 700])).toEqual([200, 100, 400, 700]);
  });
});

describe('font registry', () => {
  it('returns undefined for unregistered families (troika default font)', () => {
    expect(resolveFontURL('Inter, sans-serif')).toBeUndefined();
  });

  it('resolves the first registered family of the list, case-insensitively', () => {
    registerFont({ family: 'Inter', url: 'inter.woff' }, { cssFontFace: false });
    registerFont({ family: 'Roboto', url: 'roboto.woff' }, { cssFontFace: false });
    expect(resolveFontURL('"Missing", roboto, Inter')).toBe('roboto.woff');
    expect(resolveFontURL('INTER')).toBe('inter.woff');
  });

  it('prefers matching style, then the closest weight', () => {
    registerFont({ family: 'Inter', url: 'r.woff' }, { cssFontFace: false });
    registerFont({ family: 'Inter', url: 'b.woff', weight: 700 }, { cssFontFace: false });
    registerFont({ family: 'Inter', url: 'i.woff', style: 'italic' }, { cssFontFace: false });
    expect(resolveFontURL('Inter', 'bold')).toBe('b.woff');
    expect(resolveFontURL('Inter', 600)).toBe('b.woff');
    expect(resolveFontURL('Inter', 450)).toBe('r.woff');
    expect(resolveFontURL('Inter', 700, 'italic')).toBe('i.woff');
  });

  it('replaces an identical face and supports unregistering', () => {
    registerFont({ family: 'Inter', url: 'a.woff' }, { cssFontFace: false });
    const off = registerFont({ family: 'Inter', url: 'b.woff' }, { cssFontFace: false });
    expect(resolveFontURL('Inter')).toBe('b.woff');
    off();
    expect(resolveFontURL('Inter')).toBeUndefined();
  });

  it('notifies subscribers on changes', () => {
    const listener = vi.fn();
    const off = subscribeFontChanges(listener);
    registerFont({ family: 'Inter', url: 'a.woff' });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    registerFont({ family: 'Inter', url: 'b.woff' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
