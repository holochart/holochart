import { getColorway, getIn, toRGBA, type Template } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { THEMES } from './index.ts';

/**
 * WCAG 2.2 contrast of the high-contrast themes (plan E17.5): text at AAA (7:1), axis lines and
 * the colorway above the 3:1 of non-text contrast (1.4.11) — and at the levels the themes' docs
 * promise.
 */

/** WCAG relative luminance of a CSS color. */
function luminance(color: string): number {
  const rgba = toRGBA(color);
  if (!rgba) throw new Error(`not a color: ${color}`);
  const [r, g, b] = rgba.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio of two CSS colors, 1 to 21. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const at = (t: Template, path: string): string => {
  const v = getIn(t, path);
  if (typeof v !== 'string') throw new Error(`${path} is not set`);
  return v;
};

describe('contrast ratios (E17.5)', () => {
  it('computes WCAG ratios', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrast('#777', '#fff')).toBeCloseTo(4.48, 2);
    expect(contrast('#fff', '#fff')).toBe(1);
  });

  it('high-contrast: AAA text, colorway at 3:1 or more (the first four at 5:1) on white', () => {
    const t = THEMES['high-contrast'];
    const paper = at(t, 'layout.paper_bgcolor');
    expect(contrast(at(t, 'layout.font.color'), paper)).toBeGreaterThanOrEqual(7);
    expect(contrast(at(t, 'layout.xaxis.color'), paper)).toBeGreaterThanOrEqual(7);
    expect(
      contrast(at(t, 'layout.hoverlabel.font.color'), at(t, 'layout.hoverlabel.bgcolor')),
    ).toBeGreaterThanOrEqual(7);
    const colorway = getIn(t, 'layout.colorway') as string[];
    colorway.forEach((c, i) => {
      expect(contrast(c, paper), c).toBeGreaterThanOrEqual(i < 4 ? 5 : 3);
    });
  });

  it('high-contrast-dark: AAA text, titles, axes and colorway on black', () => {
    const t = THEMES['high-contrast-dark'];
    const paper = at(t, 'layout.paper_bgcolor');
    expect(at(t, 'layout.plot_bgcolor')).toBe(paper);
    for (const path of [
      'layout.font.color',
      'layout.title.font.color',
      'layout.xaxis.color',
      'layout.hoverlabel.font.color',
      'layout.hoverlabel.bordercolor',
      'layout.modebar.activecolor',
    ]) {
      expect(contrast(at(t, path), paper), path).toBeGreaterThanOrEqual(7);
    }
    expect(at(t, 'layout.hoverlabel.bgcolor')).toBe(paper);
    for (const c of getIn(t, 'layout.colorway') as string[]) {
      expect(contrast(c, paper), c).toBeGreaterThanOrEqual(7);
    }
    // The grid stays visible but quieter than the data (non-text, decorative).
    const grid = contrast(at(t, 'layout.xaxis.gridcolor'), paper);
    expect(grid).toBeGreaterThanOrEqual(2);
    expect(grid).toBeLessThan(7);
    expect(getIn(t, 'layout.font.size')).toBeGreaterThanOrEqual(16);
  });

  it('the Safe palette keeps 3:1 on neither background for every color (use it with care)', () => {
    // Documented in the accessibility guide: Safe is for color-vision deficiency, not low vision.
    const safe = getColorway('Safe')!;
    expect(safe.some((c) => contrast(c, '#ffffff') < 3)).toBe(true);
    expect(safe.some((c) => contrast(c, '#000000') < 3)).toBe(true);
  });
});
