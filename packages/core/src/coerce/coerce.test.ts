import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { attr } from '../schema/attr.ts';
import type { AttrSpec } from '../schema/types.ts';
import { canonicalColor, toRGBA, toRGBAArray } from './color.ts';
import { coerceValue, describeExpected, resolveAttr } from './coerce.ts';

function ok(spec: AttrSpec, v: unknown): unknown {
  const r = coerceValue(spec, v);
  if (!r.ok) throw new Error(`expected ${String(v)} to be valid`);
  return r.value;
}
const bad = (spec: AttrSpec, v: unknown): boolean => !coerceValue(spec, v).ok;

describe('coerceValue', () => {
  it('number: numeric strings, bounds, clamping, extras, arrays', () => {
    const n = attr.number({ min: 0, max: 10 });
    expect(ok(n, 3)).toBe(3);
    expect(ok(n, ' 4.5 ')).toBe(4.5);
    expect(bad(n, 11)).toBe(true);
    expect(bad(n, '')).toBe(true);
    expect(bad(n, NaN)).toBe(true);
    expect(bad(n, Infinity)).toBe(true);
    expect(bad(n, true)).toBe(true);
    expect(bad(n, [1])).toBe(true);
    const clamped = coerceValue(attr.number({ min: 0, max: 1, clamp: true }), 1.5);
    expect(clamped).toEqual({ ok: true, value: 1, note: '1.5 is out of range; clamped to 1' });
    expect(ok(attr.number({ extras: ['auto'] }), 'auto')).toBe('auto');
    const arr = new Float32Array([1, 2]);
    expect(ok(attr.number({ arrayOk: true }), arr)).toBe(arr);
  });

  it('integer rejects fractions', () => {
    const i = attr.integer({ min: 1 });
    expect(ok(i, '7')).toBe(7);
    expect(bad(i, 1.5)).toBe(true);
    expect(bad(i, 0)).toBe(true);
    expect(ok(attr.integer({ extras: ['bold'] }), 'bold')).toBe('bold');
  });

  it('angle normalizes to [-180, 180)', () => {
    const a = attr.angle();
    expect(ok(a, 190)).toBe(-170);
    expect(ok(a, 180)).toBe(-180);
    expect(ok(a, -540)).toBe(-180);
    expect(ok(a, '90')).toBe(90);
    expect(ok(a, 360)).toBe(0);
  });

  it('string: numbers stringified unless strict, noBlank', () => {
    expect(ok(attr.string(), 5)).toBe('5');
    expect(bad(attr.string({ strict: true }), 5)).toBe(true);
    expect(bad(attr.string({ noBlank: true }), '  ')).toBe(true);
    expect(bad(attr.string(), {})).toBe(true);
    expect(ok(attr.string({ arrayOk: true }), ['a'])).toEqual(['a']);
  });

  it('boolean is strict', () => {
    expect(ok(attr.boolean(), false)).toBe(false);
    expect(bad(attr.boolean(), 'true')).toBe(true);
    expect(bad(attr.boolean(), 0)).toBe(true);
  });

  it('enumerated: literal values, including booleans and numeric strings', () => {
    const e = attr.enumerated({ values: ['x', 'closest', false, 3] });
    expect(ok(e, 'closest')).toBe('closest');
    expect(ok(e, false)).toBe(false);
    expect(ok(e, '3')).toBe(3);
    expect(bad(e, 'y')).toBe(true);
    expect(bad(e, true)).toBe(true);
  });

  it('flaglist: combinations, extras alone, no duplicates', () => {
    const f = attr.flaglist({ flags: ['lines', 'markers', 'text'], extras: ['none', true] });
    expect(ok(f, 'lines+markers')).toBe('lines+markers');
    expect(ok(f, 'text')).toBe('text');
    expect(ok(f, 'none')).toBe('none');
    expect(ok(f, true)).toBe(true);
    expect(bad(f, 'lines+none')).toBe(true);
    expect(bad(f, 'lines+lines')).toBe(true);
    expect(bad(f, 'line')).toBe(true);
    expect(bad(f, '')).toBe(true);
  });

  it('color: canonical rgb()/rgba() strings', () => {
    const c = attr.color();
    expect(ok(c, 'red')).toBe('rgb(255, 0, 0)');
    expect(ok(c, '#444')).toBe('rgb(68, 68, 68)');
    expect(ok(c, 'rgba(0,0,255,0.5)')).toBe('rgba(0, 0, 255, 0.5)');
    expect(ok(c, 'hsl(120, 100%, 50%)')).toBe('rgb(0, 255, 0)');
    expect(ok(c, 'transparent')).toBe('rgba(0, 0, 0, 0)');
    expect(bad(c, 'not-a-color')).toBe(true);
    expect(bad(c, 0xff0000)).toBe(true);
    const arr = ['red', 'blue'];
    expect(ok(attr.color({ arrayOk: true }), arr)).toBe(arr);
  });

  it('colorlist and colorscale', () => {
    expect(ok(attr.colorlist(), ['red', '#00f'])).toEqual(['rgb(255, 0, 0)', 'rgb(0, 0, 255)']);
    expect(bad(attr.colorlist(), [])).toBe(true);
    expect(bad(attr.colorlist(), ['red', 'nope'])).toBe(true);
    const cs = attr.colorscale();
    expect(ok(cs, 'Viridis')).toBe('Viridis');
    expect(ok(cs, ['red', 'blue', 'green'])).toEqual([
      [0, 'rgb(255, 0, 0)'],
      [0.5, 'rgb(0, 0, 255)'],
      [1, 'rgb(0, 128, 0)'],
    ]);
    expect(
      ok(cs, [
        [0, 'red'],
        [1, 'blue'],
      ]),
    ).toEqual([
      [0, 'rgb(255, 0, 0)'],
      [1, 'rgb(0, 0, 255)'],
    ]);
    expect(
      bad(cs, [
        [0.2, 'red'],
        [1, 'blue'],
      ]),
    ).toBe(true);
    expect(
      bad(cs, [
        [0, 'red'],
        [0.8, 'blue'],
        [0.5, 'green'],
        [1, 'red'],
      ]),
    ).toBe(true);
  });

  it('subplotid: base, numbered ids, x1 → x, extras', () => {
    const s = attr.subplotId({ dflt: 'x', extras: ['free'] });
    expect(ok(s, 'x')).toBe('x');
    expect(ok(s, 'x2')).toBe('x2');
    expect(ok(s, 'x1')).toBe('x');
    expect(ok(s, 'x10')).toBe('x10');
    expect(ok(s, 'free')).toBe('free');
    expect(bad(s, 'x0')).toBe(true);
    expect(bad(s, 'x02')).toBe(true);
    expect(bad(s, 'y')).toBe(true);
  });

  it('data_array keeps references, rejects DataView', () => {
    const d = attr.dataArray();
    const f64 = new Float64Array(3);
    expect(ok(d, f64)).toBe(f64);
    const dates = [new Date(0)];
    expect(ok(d, dates)).toBe(dates);
    expect(bad(d, new DataView(new ArrayBuffer(4)))).toBe(true);
    expect(bad(d, 'abc')).toBe(true);
  });

  it('info_array: per-position items, fixed length, item defaults', () => {
    const domain = attr.infoArray({
      items: [attr.number({ min: 0, max: 1, dflt: 0 }), attr.number({ min: 0, max: 1, dflt: 1 })],
    });
    expect(ok(domain, ['0.2', 0.8])).toEqual([0.2, 0.8]);
    expect(ok(domain, [0.5])).toEqual([0.5, 1]);
    expect(bad(domain, [0, 2])).toBe(true);
    expect(bad(domain, [0, 1, 1])).toBe(true);
    expect(bad(domain, 'x')).toBe(true);
    const list = attr.infoArray({ items: attr.string(), freeLength: true });
    expect(ok(list, ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('any and function', () => {
    expect(ok(attr.any(), { a: 1 })).toEqual({ a: 1 });
    const f = (): number => 1;
    expect(ok(attr.fn(), f)).toBe(f);
    expect(bad(attr.fn(), 'f')).toBe(true);
  });

  it('never throws on arbitrary input for any valType', () => {
    const specs: AttrSpec[] = [
      attr.number({ min: 0 }),
      attr.integer(),
      attr.angle(),
      attr.string({ noBlank: true }),
      attr.boolean(),
      attr.enumerated({ values: ['a', 1, true] }),
      attr.flaglist({ flags: ['a', 'b'], extras: ['none'] }),
      attr.color({ arrayOk: true }),
      attr.colorlist(),
      attr.colorscale(),
      attr.subplotId({ dflt: 'x' }),
      attr.dataArray(),
      attr.infoArray({ items: [attr.number(), attr.color()] }),
      attr.any(),
      attr.fn(),
    ];
    fc.assert(
      fc.property(fc.anything(), fc.constantFrom(...specs), (v, spec) => {
        const r = coerceValue(spec, v);
        expect(typeof r.ok).toBe('boolean');
        expect(typeof describeExpected(spec)).toBe('string');
      }),
    );
  });

  it('coercion is idempotent: a coerced value coerces to itself', () => {
    const specs: AttrSpec[] = [
      attr.number({ min: -5, max: 5, clamp: true }),
      attr.angle(),
      attr.color(),
      attr.colorlist(),
      attr.colorscale(),
      attr.subplotId({ dflt: 'y' }),
      attr.infoArray({ items: [attr.number(), attr.number()] }),
    ];
    const value = fc.oneof(
      fc.double(),
      fc.string(),
      fc.constantFrom('red', '#abc', 'y1', 'y3', 'rgba(1,2,3,0.25)', ['red', 'blue'], [1, '2']),
    );
    fc.assert(
      fc.property(value, fc.constantFrom(...specs), (v, spec) => {
        const r = coerceValue(spec, v);
        if (!r.ok) return;
        const again = coerceValue(spec, r.value);
        expect(again.ok && again.value).toEqual(r.value);
      }),
    );
  });
});

describe('resolveAttr', () => {
  it('falls back to a canonical default', () => {
    const c = attr.color({ dflt: '#444' });
    expect(resolveAttr(c, undefined)).toBe('rgb(68, 68, 68)');
    expect(resolveAttr(c, null)).toBe('rgb(68, 68, 68)');
    expect(resolveAttr(c, 'bogus')).toBe('rgb(68, 68, 68)');
    expect(resolveAttr(c, 'blue')).toBe('rgb(0, 0, 255)');
    expect(resolveAttr(attr.number(), 'x')).toBeUndefined();
  });
});

describe('colors for the renderer', () => {
  it('toRGBA converts to sRGB 0–1 floats', () => {
    expect(toRGBA('red')).toEqual([1, 0, 0, 1]);
    expect(toRGBA('rgba(0, 0, 255, 0.5)')).toEqual([0, 0, 1, 0.5]);
    expect(toRGBA('transparent')).toEqual([0, 0, 0, 0]);
    expect(toRGBA('nope')).toBeNull();
    expect(Object.isFrozen(toRGBA('red'))).toBe(true);
  });

  it('toRGBAArray packs 4 floats per color with a fallback', () => {
    const out = toRGBAArray(['red', 'bad', '#00ff00'], [0.5, 0.5, 0.5, 1]);
    expect(Array.from(out)).toEqual([1, 0, 0, 1, 0.5, 0.5, 0.5, 1, 0, 1, 0, 1]);
  });

  it('canonicalColor round-trips', () => {
    expect(canonicalColor(canonicalColor('steelblue'))).toBe(canonicalColor('steelblue'));
    expect(canonicalColor(12)).toBeNull();
  });
});
