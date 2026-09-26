/** ECDF (plan E10.7): values against hand-computed ECDFs, and px.ecdf's figure. */
import { describe, expect, it } from 'vitest';
import { ecdf, ecdfValues } from '../index.ts';

describe('ecdfValues', () => {
  const base = [3, 1, 2, 2, null];

  it('standard: share of rows at or below each value, in ascending order', () => {
    // Sorted 1, 2, 2, 3 (stable: the first 2 is row 2): cumulative 1/4, 2/4, 3/4, 4/4.
    expect(ecdfValues(base, undefined)).toEqual({
      order: [1, 2, 3, 0],
      values: [0.25, 0.5, 0.75, 1],
    });
    expect(ecdfValues(base, undefined, 'percent').values).toEqual([25, 50, 75, 100]);
    expect(ecdfValues(base, undefined, null).values).toEqual([1, 2, 3, 4]);
  });

  it('reversed: at or above each value; complementary: above each value', () => {
    // Descending 3, 2, 2, 1 → cumulative 1, 2, 3, 4, then listed ascending.
    expect(ecdfValues(base, undefined, null, 'reversed')).toEqual({
      order: [1, 3, 2, 0],
      values: [4, 3, 2, 1],
    });
    expect(ecdfValues(base, undefined, 'probability', 'complementary').values).toEqual([
      0.75, 0.5, 0.25, 0,
    ]);
  });

  it('weights rows by a column', () => {
    // Sorted 1 (w 5), 2 (w 1), 3 (w 4): cumulative 5, 6, 10 of 10.
    expect(ecdfValues([2, 1, 3], [1, 5, 4])).toEqual({ order: [1, 0, 2], values: [0.5, 0.6, 1] });
    expect(ecdfValues([2, 1], [null, 2], null).values).toEqual([2, 2]);
  });

  it('sorts dates and text too', () => {
    expect(ecdfValues(['2024-02-01', '2024-01-15'], undefined).order).toEqual([1, 0]);
    expect(ecdfValues(['b', 'a'], undefined).order).toEqual([1, 0]);
  });
});

describe('ecdf figures', () => {
  const rows = [
    { v: 3, g: 'a' },
    { v: 1, g: 'a' },
    { v: 2, g: 'b' },
    { v: 5, g: 'b' },
  ];

  it('draws a step line per group with a probability axis from zero', () => {
    const f = ecdf(rows, { x: 'v', color: 'g' });
    expect(f.data.map((t) => [t['x'], t['y'], t['mode'], t['line']])).toEqual([
      [[1, 3], [0.5, 1], 'lines', { dash: 'solid', shape: 'hv' }],
      [[2, 5], [0.5, 1], 'lines', { dash: 'solid', shape: 'hv' }],
    ]);
    expect(f.data[0]?.['hovertemplate']).toBe('g=a<br>v=%{x}<br>probability=%{y}<extra></extra>');
    expect(f.layout['yaxis']).toMatchObject({
      title: { text: 'probability' },
      rangemode: 'tozero',
    });
    expect(f.layout['xaxis']).toMatchObject({ title: { text: 'v' } });
  });

  it('turns horizontal with only y, and takes markers, lines, norm and mode', () => {
    const f = ecdf(rows, { y: 'v', markers: true, ecdfnorm: null, ecdfmode: 'reversed' });
    const t = f.data[0] as Record<string, unknown>;
    expect(t['orientation']).toBe('h');
    expect(t['y']).toEqual([1, 2, 3, 5]);
    expect(t['x']).toEqual([4, 3, 2, 1]);
    expect(t['mode']).toBe('lines+markers');
    expect(t['line']).toEqual({ dash: 'solid', shape: 'hv' });
    expect(f.layout['xaxis']).toMatchObject({ title: { text: 'count' }, rangemode: 'tozero' });
    expect(ecdf(rows, { x: 'v', lines: false, markers: true }).data[0]?.['mode']).toBe('markers');
  });

  it('adds a marginal and rejects no data column', () => {
    const f = ecdf(rows, { x: 'v', marginal: 'histogram' });
    expect(f.data.map((t) => t['type'])).toEqual(['scatter', 'histogram']);
    expect(() => ecdf(rows, {})).toThrow(/give x or y/);
  });
});
