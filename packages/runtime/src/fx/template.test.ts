import { describe, expect, it } from 'vitest';
import { formatTemplate, splitExtra } from './template.ts';

describe('formatTemplate', () => {
  it('returns text without placeholders unchanged', () => {
    expect(formatTemplate('plain text', { values: { x: 1 } })).toBe('plain text');
  });

  it('substitutes raw values', () => {
    expect(formatTemplate('x=%{x}, y=%{y}', { values: { x: 'a', y: 2 } })).toBe('x=a, y=2');
  });

  it('applies d3-format number specs', () => {
    expect(formatTemplate('%{y:.2f}', { values: { y: 3.14159 } })).toBe('3.14');
    expect(formatTemplate('%{y:.1f}', { values: { y: '2.25' } })).toBe('2.3');
  });

  it('falls back to the plain value when a number format meets a non-number', () => {
    expect(formatTemplate('%{y:.2f}', { values: { y: 'n/a' } })).toBe('n/a');
  });

  it('applies d3-time-format date specs in UTC', () => {
    const ctx = { values: { x: '2026-03-05', y: 3.14159, customdata: ['a'] } };
    expect(formatTemplate('%{x|%b %d}: %{y:.1f} (%{customdata[0]})', ctx)).toBe('Mar 05: 3.1 (a)');
    expect(formatTemplate('%{x|%Y-%m-%d %H:%M}', { values: { x: '2026-12-31 23:30' } })).toBe(
      '2026-12-31 23:30',
    );
  });

  it('reads indexed and nested paths into the point values', () => {
    const ctx = { values: { customdata: ['a', { k: 'deep' }] } };
    expect(formatTemplate('%{customdata[0]}/%{customdata[1].k}', ctx)).toBe('a/deep');
  });

  it('joins array values with commas', () => {
    expect(formatTemplate('%{customdata}', { values: { customdata: [1, 2, 3] } })).toBe('1,2,3');
  });

  it('prefers flat dotted keys in values over trace attributes', () => {
    const ctx = {
      values: { 'marker.size': 42 },
      fullData: { marker: { size: [1, 2, 3] } },
      pointIndex: 0,
    };
    expect(formatTemplate('%{marker.size}', ctx)).toBe('42');
  });

  it('picks per-point entries of trace array attributes by pointIndex', () => {
    const fullData = { marker: { size: [5, 10, 15], color: 'red' } };
    expect(formatTemplate('%{marker.size}', { fullData, pointIndex: 1 })).toBe('10');
    // Scalars are shared by every point.
    expect(formatTemplate('%{marker.color}', { fullData, pointIndex: 2 })).toBe('red');
    expect(
      formatTemplate('%{marker.size}', {
        fullData: { marker: { size: new Float32Array([7, 8]) } },
        pointIndex: 1,
      }),
    ).toBe('8');
  });

  it('reads fullData, data and meta', () => {
    const ctx = {
      fullData: { name: 'defaulted', meta: ['m0', 'm1'] },
      data: { name: 'input' },
    };
    expect(formatTemplate('%{fullData.name}|%{data.name}|%{meta[1]}', ctx)).toBe(
      'defaulted|input|m1',
    );
    // An explicit meta wins over fullData.meta.
    expect(formatTemplate('%{meta}', { ...ctx, meta: 'own' })).toBe('own');
  });

  it('uses labels when no format is given, and the value when one is', () => {
    const ctx = { values: { y: 3100 }, labels: { y: '3.1k' } };
    expect(formatTemplate('%{y}', ctx)).toBe('3.1k');
    expect(formatTemplate('%{y:.0f}', ctx)).toBe('3100');
    // A label also covers a variable with no value.
    expect(formatTemplate('%{x}', { labels: { x: 'Jan' } })).toBe('Jan');
  });

  it('keeps the literal placeholder for missing values unless a fallback is given', () => {
    const ctx = { values: { y: Number.NaN, z: null } };
    expect(formatTemplate('a %{nope} b', ctx)).toBe('a %{nope} b');
    expect(formatTemplate('%{y:.2f}', ctx)).toBe('%{y:.2f}');
    expect(formatTemplate('%{nope}|%{y}|%{z}', ctx, { fallback: '-' })).toBe('-|-|-');
    expect(formatTemplate('%{nope}', ctx, { fallback: '' })).toBe('');
  });

  it('trims whitespace around the variable name', () => {
    expect(formatTemplate('%{ x }', { values: { x: 1 } })).toBe('1');
  });
});

describe('splitExtra', () => {
  it('reports no extra box when there is no tag', () => {
    expect(splitExtra('x: 1')).toEqual({ text: 'x: 1', extra: undefined });
  });

  it('extracts the extra box and removes it from the text', () => {
    expect(splitExtra('x: 1<extra>trace 0</extra>')).toEqual({ text: 'x: 1', extra: 'trace 0' });
    expect(splitExtra('a<EXTRA>b<br>c</EXTRA>d')).toEqual({ text: 'ad', extra: 'b<br>c' });
  });

  it('returns an empty extra (hide the box) for an empty tag', () => {
    expect(splitExtra('x: 1<extra></extra>')).toEqual({ text: 'x: 1', extra: '' });
  });
});
