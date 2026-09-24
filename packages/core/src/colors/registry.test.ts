import { afterEach, describe, expect, it } from 'vitest';
import { canonicalColor } from '../coerce/color.ts';
import { BUILTIN_COLORSCALE_GROUPS, BUILTIN_PALETTES, registerBuiltinColors } from './builtins.ts';
import { COLORBREWER_SEQUENTIAL } from './data/colorbrewer.ts';
import { PLOTLYJS_COLORSCALES } from './plotlyjs.ts';
import {
  colors,
  colorscaleNames,
  colorscaleRegistryVersion,
  colorways,
  getColorscale,
  isColorscaleName,
  registerColorscale,
  reverseColorscale,
} from './registry.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const undo of cleanups.splice(0)) undo();
});

describe('colorscale registry', () => {
  it('resolves plotly.js names without registration, case-insensitively', () => {
    expect(getColorscale('Viridis')).toBe(PLOTLYJS_COLORSCALES['Viridis']);
    expect(getColorscale('viridis')).toBe(PLOTLYJS_COLORSCALES['Viridis']);
    expect(getColorscale(' RdBu ')).toBe(PLOTLYJS_COLORSCALES['RdBu']);
    expect(getColorscale('NotAScale')).toBeUndefined();
    expect(isColorscaleName('jet')).toBe(true);
    expect(isColorscaleName(42)).toBe(false);
  });

  it('reverses with a `_r` suffix: mirrored positions, reversed order', () => {
    const jet = PLOTLYJS_COLORSCALES['Jet']!;
    const reversed = getColorscale('Jet_r')!;
    expect(reversed).toHaveLength(jet.length);
    expect(reversed[0]).toEqual([0, jet[jet.length - 1]![1]]);
    expect(reversed[reversed.length - 1]).toEqual([1, jet[0]![1]]);
    // Jet's 0.125 stop becomes 0.875.
    expect(reversed.map(([p]) => +p.toFixed(6))).toEqual([0, 0.125, 0.375, 0.625, 0.875, 1]);
    expect(getColorscale('jet_R')).toBe(reversed);
    expect(reverseColorscale(reverseColorscale(jet))).toEqual(jet);
    expect(getColorscale('Nope_r')).toBeUndefined();
  });

  it('registers stops or evenly spaced colors, and unregisters', () => {
    const v0 = colorscaleRegistryVersion();
    cleanups.push(colors.register('Brand', ['#000', '#888', '#fff']));
    expect(colorscaleRegistryVersion()).toBeGreaterThan(v0);
    expect(getColorscale('brand')).toEqual([
      [0, '#000'],
      [0.5, '#888'],
      [1, '#fff'],
    ]);
    expect(getColorscale('Brand_r')?.[0]).toEqual([0, '#fff']);
    const undo = registerColorscale('Traffic', [
      [0, 'green'],
      [0.3, 'gold'],
      [1, 'red'],
    ]);
    expect(getColorscale('Traffic')?.[1]).toEqual([0.3, 'gold']);
    expect(colorscaleNames()).toContain('Traffic');
    undo();
    expect(getColorscale('Traffic')).toBeUndefined();
    expect(() => registerColorscale('', ['red'])).toThrow(RangeError);
    expect(() => registerColorscale('Empty', [])).toThrow(RangeError);
  });

  it('a registered scale overrides a built-in name; an exact `_r` name wins over reversal', () => {
    cleanups.push(registerColorscale('Viridis', ['red', 'blue']));
    expect(getColorscale('Viridis')?.[0]).toEqual([0, 'red']);
    cleanups.push(registerColorscale('Odd_r', ['black', 'white']));
    expect(getColorscale('odd_r')?.[0]).toEqual([0, 'black']);
  });
});

describe('built-in palettes and colorscales (E8.2)', () => {
  it('registerBuiltinColors adds ~95 names (190 with _r) but keeps plotly.js meanings', () => {
    expect(isColorscaleName('Tempo')).toBe(false);
    registerBuiltinColors();
    registerBuiltinColors(); // idempotent
    const names = colorscaleNames();
    expect(names.length).toBe(94);
    for (const name of [
      'Plotly3',
      'Inferno',
      'Magma',
      'Turbo',
      'BuPu',
      'Oranges',
      'thermal',
      'tempo',
      'Burg',
      'Sunsetdark',
      'Spectral',
      'balance',
      'Tropic',
      'Twilight',
      'IceFire',
      'HSV',
      'mrybm',
      'mygbm',
      'Tempo_r',
    ]) {
      expect(isColorscaleName(name), name).toBe(true);
    }
    // plotly.py's ColorBrewer Blues exists as data, but the string keeps plotly.js's scale.
    expect(getColorscale('Blues')).toBe(PLOTLYJS_COLORSCALES['Blues']);
    expect(COLORBREWER_SEQUENTIAL['Blues']).toBeDefined();
    expect(colorways.get('dark24')).toHaveLength(24);
    expect(colorways.get('Plotly')?.[0]).toBe('#636EFA');
    expect(colorways.names()).toEqual(expect.arrayContaining(Object.keys(BUILTIN_PALETTES)));
  });

  it('every built-in scale and palette is made of valid colors', () => {
    let count = 0;
    for (const group of BUILTIN_COLORSCALE_GROUPS) {
      for (const [name, scale] of Object.entries(group.scales)) {
        count++;
        expect(scale.length, name).toBeGreaterThanOrEqual(2);
        for (const entry of scale) {
          const color = typeof entry === 'string' ? entry : entry[1];
          expect(canonicalColor(color), `${name}: ${color}`).not.toBeNull();
        }
      }
    }
    expect(count).toBeGreaterThanOrEqual(100);
    expect(Object.keys(BUILTIN_PALETTES).length).toBeGreaterThanOrEqual(20);
  });

  it('colorways register and unregister', () => {
    const undo = colorways.register('Mine', ['red', 'green']);
    expect(colorways.get('MINE')).toEqual(['red', 'green']);
    undo();
    expect(colorways.get('Mine')).toBeUndefined();
    expect(() => colorways.register('x', [])).toThrow(RangeError);
  });
});
