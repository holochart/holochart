import { describe, expect, it } from 'vitest';
import {
  colorDomain,
  hasColorscale,
  mapColor,
  NAMED_COLORSCALES,
  numericExtent,
  resolveColorMapping,
  resolveColorscale,
  rgbaToCss,
} from './colorscale.ts';

describe('named and custom colorscales', () => {
  it('resolves names case-insensitively to sRGB stops', () => {
    const viridis = resolveColorscale('viridis');
    expect(viridis).toBe(resolveColorscale('Viridis'));
    expect(viridis).toHaveLength(NAMED_COLORSCALES['Viridis']!.length);
    expect(viridis![0]).toEqual([0, [0x44 / 255, 0x01 / 255, 0x54 / 255, 1]]);
    expect(resolveColorscale('Nope')).toBeUndefined();
  });

  it('resolves defaulted stops', () => {
    const stops = [
      [0, 'rgb(0, 0, 0)'],
      [1, 'rgb(255, 0, 0)'],
    ];
    expect(resolveColorscale(stops)).toEqual([
      [0, [0, 0, 0, 1]],
      [1, [1, 0, 0, 1]],
    ]);
    expect(resolveColorscale([[0, 'not a color']])).toBeUndefined();
  });

  it('every named scale spans 0 to 1 in order', () => {
    for (const scale of Object.values(NAMED_COLORSCALES)) {
      expect(scale[0]![0]).toBe(0);
      expect(scale[scale.length - 1]![0]).toBe(1);
      for (let i = 1; i < scale.length; i++) expect(scale[i]![0]).toBeGreaterThan(scale[i - 1]![0]);
    }
  });
});

describe('hasColorscale (Plotly rule on input containers)', () => {
  it('turns on for numbers, bounds, scales, showscale and colorbars', () => {
    expect(hasColorscale({ color: ['red', 2] })).toBe(true);
    expect(hasColorscale({ color: ['red', 'blue'] })).toBe(false);
    expect(hasColorscale({ cmin: 0, cmax: 1 })).toBe(true);
    expect(hasColorscale({ colorscale: 'Jet' })).toBe(true);
    expect(hasColorscale({ showscale: true })).toBe(true);
    expect(hasColorscale({ colorbar: {} })).toBe(true);
    expect(hasColorscale(undefined)).toBe(false);
  });
});

describe('color domain', () => {
  it('uses the data extent with cauto, symmetric around cmid', () => {
    expect(colorDomain({ cauto: true }, [2, 10])).toEqual([2, 10]);
    expect(colorDomain({ cauto: true, cmid: 0 }, [-2, 10])).toEqual([-10, 10]);
    expect(colorDomain({ cauto: true, cmid: 8 }, [2, 10])).toEqual([2, 14]);
  });

  it('uses explicit bounds without cauto, and widens a zero-width domain', () => {
    expect(colorDomain({ cauto: false, cmin: 0, cmax: 5 }, [2, 10])).toEqual([0, 5]);
    expect(colorDomain({ cauto: true }, [3, 3])).toEqual([2.5, 3.5]);
    expect(colorDomain({ cauto: true }, [Infinity, -Infinity])).toEqual([0, 1]);
  });

  it('caches extents per array and length', () => {
    const values = [1, 'x', 7, NaN, -3];
    expect(numericExtent(values)).toEqual([-3, 7]);
    values.push(20);
    expect(numericExtent(values)).toEqual([-3, 20]);
  });
});

describe('resolveColorMapping', () => {
  it('ignores containers without colorscale defaults (CSS color arrays)', () => {
    expect(resolveColorMapping({ color: ['red'] }, undefined)).toBeUndefined();
    expect(resolveColorMapping({ color: 'red', cauto: true }, undefined)).toBeUndefined();
  });

  it('picks the automatic scale from the sign of the domain', () => {
    const auto = (color: number[]) =>
      resolveColorMapping({ color, cauto: true, autocolorscale: true }, undefined)!.colorscale;
    expect(auto([1, 2])).toBe(resolveColorscale('Reds'));
    expect(auto([-2, -1])).toBe(resolveColorscale('Blues'));
    expect(auto([-1, 2])).toBe(resolveColorscale('RdBu'));
  });

  it('uses an explicit scale and reversescale', () => {
    const m = resolveColorMapping(
      {
        color: [0, 10],
        cauto: true,
        autocolorscale: false,
        colorscale: 'Greys',
        reversescale: true,
      },
      undefined,
    )!;
    expect(m).toMatchObject({ cmin: 0, cmax: 10, reversescale: true });
    expect(rgbaToCss(mapColor(0, m))).toBe('rgb(255, 255, 255)');
    expect(rgbaToCss(mapColor(10, m))).toBe('rgb(0, 0, 0)');
    expect(rgbaToCss(mapColor(NaN, m))).toBe('rgb(128, 128, 128)');
  });

  it('takes scale and cross-trace domain from a color axis', () => {
    const fullLayout = {
      coloraxis: { cauto: true, autocolorscale: false, colorscale: 'Viridis', _min: -5, _max: 5 },
    } as never;
    const m = resolveColorMapping({ color: [0, 1], coloraxis: 'coloraxis' }, fullLayout)!;
    expect(m).toMatchObject({ cmin: -5, cmax: 5 });
    expect(m.colorscale).toBe(resolveColorscale('Viridis'));
  });
});
