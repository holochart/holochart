import { describe, expect, it } from 'vitest';
import { registerColorscale, type FullLayout } from '@mk7s/holochart-core';
import {
  coloraxisLayoutSchema,
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

describe('E8.2: registry names, reversed names, layout colorscales and interpolation', () => {
  const layout = (extra: Record<string, unknown>) => extra as unknown as FullLayout;

  it('resolves `_r` names and registered scales (the cache follows the registry)', () => {
    const jet = resolveColorscale('Jet')!;
    const jetR = resolveColorscale('jet_r')!;
    expect(jetR[0]![1]).toEqual(jet[jet.length - 1]![1]);
    expect(jetR[jetR.length - 1]![1]).toEqual(jet[0]![1]);
    expect(resolveColorscale('Wave')).toBeUndefined();
    const undo = registerColorscale('Wave', ['#000000', '#ffffff']);
    try {
      expect(resolveColorscale('wave')).toEqual([
        [0, [0, 0, 0, 1]],
        [1, [1, 1, 1, 1]],
      ]);
      expect(hasColorscale({ colorscale: 'Wave_r' })).toBe(true);
    } finally {
      undo();
    }
    expect(resolveColorscale('Wave')).toBeUndefined();
  });

  it('autocolorscale picks from layout.colorscale (templates), else Reds/Blues/RdBu', () => {
    const container = { color: [1, 2, 3], cauto: true, autocolorscale: true };
    const plasma = resolveColorMapping(
      container,
      layout({ colorscale: { sequential: 'Plasma', diverging: 'RdBu' } }),
    )!;
    expect(plasma.colorscale).toBe(resolveColorscale('Plasma'));
    expect(resolveColorMapping(container, layout({}))!.colorscale).toBe(resolveColorscale('Reds'));
    const diverging = resolveColorMapping(
      { ...container, color: [-1, 2] },
      layout({
        colorscale: {
          diverging: [
            [0, 'rgb(0, 0, 0)'],
            [1, 'rgb(255, 255, 255)'],
          ],
        },
      }),
    )!;
    expect(diverging.colorscale[1]![1]).toEqual([1, 1, 1, 1]);
  });

  it('bakes layout.colorscaleInterpolation into the mapping (known midpoints)', () => {
    const container = {
      color: [0, 1],
      cauto: true,
      autocolorscale: false,
      colorscale: [
        [0, 'rgb(0, 0, 0)'],
        [1, 'rgb(255, 255, 255)'],
      ],
    };
    const mid = (space: string): number => {
      const m = resolveColorMapping(container, layout({ colorscaleInterpolation: space }))!;
      expect(m.interpolation).toBe(space);
      return mapColor(0.5, m)[0];
    };
    expect(mid('rgb')).toBeCloseTo(0.5, 6);
    expect(mid('oklab')).toBeCloseTo(0.3885, 2);
    expect(mid('lab')).toBeCloseTo(0.4663, 2);
    expect(mid('hcl')).toBeCloseTo(0.4663, 2);
    // Unknown values fall back to Plotly's sRGB.
    expect(
      resolveColorMapping(container, layout({ colorscaleInterpolation: 'hsv' }))!.interpolation,
    ).toBe('rgb');
    // The densified scale is cached per resolved scale and space.
    const a = resolveColorMapping(container, layout({ colorscaleInterpolation: 'lab' }))!;
    const b = resolveColorMapping(container, layout({ colorscaleInterpolation: 'lab' }))!;
    expect(a.colorscale).toBe(b.colorscale);
  });

  it('declares layout.colorscale and colorscaleInterpolation with Plotly defaults', () => {
    const cs = coloraxisLayoutSchema.colorscale.children;
    expect(cs.sequential.dflt).toBe('Reds');
    expect(cs.sequentialminus.dflt).toBe('Blues');
    expect(cs.diverging.dflt).toBe('RdBu');
    expect(coloraxisLayoutSchema.colorscaleInterpolation.dflt).toBe('rgb');
  });
});
