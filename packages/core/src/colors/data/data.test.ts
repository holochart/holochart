import { describe, expect, it } from 'vitest';
import { canonicalColor } from '../../coerce/color.ts';
import { CARTO_DIVERGING, CARTO_SEQUENTIAL } from './carto.ts';
import { CMOCEAN_CYCLICAL, CMOCEAN_DIVERGING, CMOCEAN_SEQUENTIAL } from './cmocean.ts';
import { COLORBREWER_DIVERGING, COLORBREWER_SEQUENTIAL } from './colorbrewer.ts';
import { CYCLICAL } from './cyclical.ts';
import { QUALITATIVE } from './qualitative.ts';
import { DIVERGING_PLOTLY, SEQUENTIAL } from './sequential.ts';

const RECORDS: Record<string, Readonly<Record<string, readonly string[]>>> = {
  QUALITATIVE,
  SEQUENTIAL,
  DIVERGING_PLOTLY,
  COLORBREWER_SEQUENTIAL,
  COLORBREWER_DIVERGING,
  CMOCEAN_SEQUENTIAL,
  CMOCEAN_DIVERGING,
  CMOCEAN_CYCLICAL,
  CARTO_SEQUENTIAL,
  CARTO_DIVERGING,
  CYCLICAL,
};

describe('color data', () => {
  for (const [recordName, record] of Object.entries(RECORDS)) {
    it(`${recordName}: every list has >= 2 valid CSS colors`, () => {
      const names = Object.keys(record);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        const list = record[name]!;
        expect(list.length, `${recordName}.${name}`).toBeGreaterThanOrEqual(2);
        for (const c of list)
          expect(canonicalColor(c), `${recordName}.${name}: ${c}`).not.toBeNull();
      }
    });
  }

  it('record sizes match plotly.py', () => {
    expect(Object.keys(QUALITATIVE)).toHaveLength(21);
    expect(Object.keys(SEQUENTIAL)).toHaveLength(13);
    expect(Object.keys(DIVERGING_PLOTLY)).toHaveLength(2);
    expect(Object.keys(COLORBREWER_SEQUENTIAL)).toHaveLength(18);
    expect(Object.keys(COLORBREWER_DIVERGING)).toHaveLength(9);
    expect(Object.keys(CMOCEAN_SEQUENTIAL)).toHaveLength(13);
    expect(Object.keys(CMOCEAN_DIVERGING)).toHaveLength(4);
    expect(Object.keys(CMOCEAN_CYCLICAL)).toHaveLength(1);
    expect(Object.keys(CARTO_SEQUENTIAL)).toHaveLength(21);
    expect(Object.keys(CARTO_DIVERGING)).toHaveLength(7);
    expect(Object.keys(CYCLICAL)).toHaveLength(7);
  });

  it('spot-checks known values', () => {
    expect(QUALITATIVE.Plotly![0]).toBe('#636EFA');
    expect(QUALITATIVE.D3![0]).toBe('#1F77B4');
    expect(QUALITATIVE.Dark24).toHaveLength(24);
    expect(QUALITATIVE.Light24).toHaveLength(24);
    expect(QUALITATIVE.Alphabet).toHaveLength(26);
    expect(QUALITATIVE.Set3).toHaveLength(12);
    expect(QUALITATIVE.Paired).toHaveLength(12);
    expect(SEQUENTIAL.Viridis![0]).toBe('#440154');
    expect(SEQUENTIAL.Viridis!.at(-1)).toBe('#fde725');
    expect(COLORBREWER_SEQUENTIAL.Blues!.at(-1)).toBe('rgb(8,48,107)');
    expect(COLORBREWER_DIVERGING.RdBu).toHaveLength(11);
    expect(CMOCEAN_CYCLICAL.phase![0]).toBe('rgb(167, 119, 12)');
  });

  it('cyclical scales wrap (first color equals last)', () => {
    for (const [name, list] of Object.entries(CYCLICAL)) {
      expect(list.at(-1), name).toBe(list[0]);
    }
  });
});
