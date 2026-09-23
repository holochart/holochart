import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getIn, parsePath, setIn, stringifyPath } from './path.ts';

describe('parsePath', () => {
  it('parses dotted keys and bracket indices', () => {
    expect(parsePath('marker.line.color')).toEqual(['marker', 'line', 'color']);
    expect(parsePath('annotations[2].text')).toEqual(['annotations', 2, 'text']);
    expect(parsePath('xaxis.range[0]')).toEqual(['xaxis', 'range', 0]);
    expect(parsePath('a[0][1].b')).toEqual(['a', 0, 1, 'b']);
    expect(parsePath('x')).toEqual(['x']);
  });

  it('rejects malformed paths', () => {
    for (const bad of ['', '.a', 'a.', 'a..b', 'a[', 'a[x]', 'a[-1]', '[0]', 'a[0]b', 'a[01]']) {
      expect(() => parsePath(bad), bad).toThrow(/Invalid attribute path/);
    }
  });

  it('rejects prototype-polluting segments', () => {
    expect(() => parsePath('__proto__.polluted')).toThrow();
    expect(() => parsePath('a.constructor.prototype')).toThrow();
  });

  it('round-trips through stringifyPath', () => {
    const key = fc.stringMatching(/^[a-z_][a-z0-9_]{0,8}$/).filter((k) => k !== '__proto__');
    const seg = fc.oneof(key, fc.nat({ max: 50 }));
    fc.assert(
      fc.property(key, fc.array(seg, { maxLength: 6 }), (first, rest) => {
        const segs = [first, ...rest];
        expect(parsePath(stringifyPath(segs))).toEqual(segs);
      }),
    );
  });
});

describe('getIn / setIn', () => {
  it('reads nested values and missing paths', () => {
    const obj = { marker: { line: { color: 'red' } }, annotations: [{ text: 'a' }, { text: 'b' }] };
    expect(getIn(obj, 'marker.line.color')).toBe('red');
    expect(getIn(obj, 'annotations[1].text')).toBe('b');
    expect(getIn(obj, 'annotations[5].text')).toBeUndefined();
    expect(getIn(obj, 'marker.size')).toBeUndefined();
    expect(getIn({}, 'toString')).toBeUndefined();
    expect(getIn(null, 'a')).toBeUndefined();
  });

  it('creates intermediate objects and arrays', () => {
    const obj: Record<string, unknown> = {};
    setIn(obj, 'annotations[1].font.size', 14);
    setIn(obj, 'marker.color', 'red');
    expect(obj).toEqual({
      annotations: [undefined, { font: { size: 14 } }],
      marker: { color: 'red' },
    });
  });

  it('deletes object keys on undefined and does not create containers for it', () => {
    const obj: Record<string, unknown> = { marker: { color: 'red', size: 3 } };
    setIn(obj, 'marker.color', undefined);
    setIn(obj, 'line.width', undefined);
    expect(obj).toEqual({ marker: { size: 3 } });
  });

  it('refuses to write through a scalar', () => {
    expect(() => setIn({ marker: 'red' }, 'marker.color', 'blue')).toThrow(/not an object/);
  });

  it('setIn then getIn returns the value', () => {
    const key = fc.stringMatching(/^[a-z]{1,4}$/);
    fc.assert(
      fc.property(key, fc.array(key, { maxLength: 4 }), fc.integer(), (first, rest, value) => {
        const obj = {};
        const path = [first, ...rest];
        setIn(obj, path, value);
        expect(getIn(obj, path)).toBe(value);
      }),
    );
  });
});
