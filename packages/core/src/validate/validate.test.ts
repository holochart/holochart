import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { editDistance, suggest } from './suggest.ts';
import { validate } from './validate.ts';

const registry = fixtureRegistry();

describe('validate', () => {
  it('returns no issues for a valid figure', () => {
    expect(
      validate(
        [
          {
            type: 'scatter',
            x: [1, 2],
            y: new Float64Array(2),
            mode: 'lines+markers',
            marker: { color: ['red', 'blue'] },
          },
          { type: 'bar', y: [1], xaxis: 'x2' },
        ],
        {
          title: { text: 'T' },
          xaxis2: { range: [0, 1] },
          barmode: 'stack',
          annotations: [{ text: 'a' }],
        },
        registry,
        { config: { responsive: true, scrollZoom: 'cartesian+scene' } },
      ),
    ).toEqual([]);
  });

  it('reports invalid values with path, value and expected', () => {
    const issues = validate(
      [{ mode: 'line', opacity: 2 }],
      { width: -3, hovermode: 'nearest' },
      registry,
    );
    expect(issues).toEqual([
      expect.objectContaining({
        path: 'data[0].mode',
        value: 'line',
        code: 'invalid-value',
        severity: 'error',
        expected: "any combination of 'lines', 'markers', 'text' joined with '+', or 'none'",
      }),
      expect.objectContaining({
        path: 'data[0].opacity',
        value: 2,
        expected: 'a number between 0 and 1',
      }),
      expect.objectContaining({ path: 'layout.width', value: -3 }),
      expect.objectContaining({ path: 'layout.hovermode', value: 'nearest' }),
    ]);
  });

  it('suggests close names for unknown attributes', () => {
    const issues = validate(
      [{ y: [1], marker: { colour: 'red', Size: 3, zzzzzz: 1 } }],
      { titel: { text: 'x' }, xaxis3: { rnage: [0, 1] } },
      registry,
    );
    expect(issues.map((i) => [i.path, i.suggestion])).toEqual([
      ['data[0].marker.colour', 'color'],
      ['data[0].marker.Size', 'size'],
      ['data[0].marker.zzzzzz', undefined],
      ['layout.titel', 'title'],
      ['layout.xaxis3.rnage', 'range'],
    ]);
    expect(issues[0]?.message).toBe("unknown attribute 'colour'; did you mean 'color'?");
    expect(issues.every((i) => i.code === 'unknown-attribute' && i.severity === 'warning')).toBe(
      true,
    );
  });

  it('reports unknown trace types, non-object traces and bad containers', () => {
    const issues = validate([{ type: 'scater' }, 3, { marker: 'red' }], 'layout?', registry);
    expect(issues.map((i) => [i.path, i.code, i.suggestion])).toEqual([
      ['data[0].type', 'unknown-trace-type', 'scatter'],
      ['data[1]', 'invalid-container', undefined],
      ['data[2].marker', 'invalid-container', undefined],
      ['layout', 'invalid-container', undefined],
    ]);
    expect(validate('nope', {}, registry)[0]?.path).toBe('data');
  });

  it('flags deprecated attributes, clamped values and item arrays', () => {
    const issues = validate(
      [{ legacy: 2 }],
      { annotations: [{ text: 'a' }, 5, { opacity: 'x' }] },
      registry,
    );
    expect(issues.map((i) => [i.path, i.code])).toEqual([
      ['data[0].legacy', 'deprecated'],
      ['layout.annotations[1]', 'invalid-container'],
      ['layout.annotations[2].opacity', 'invalid-value'],
    ]);
  });

  it('validates config', () => {
    const issues = validate([], {}, registry, {
      config: { scrollZoom: 'wheel', edits: { titleText: 1 }, sttrict: true },
    });
    expect(issues.map((i) => i.path)).toEqual([
      'config.scrollZoom',
      'config.edits.titleText',
      'config.sttrict',
    ]);
    expect(issues[2]?.suggestion).toBe('strict');
  });

  it('ignores internal underscore keys and null/undefined values', () => {
    expect(
      validate([{ _index: 3, y: null, marker: undefined }], { _subplots: {} }, registry),
    ).toEqual([]);
  });

  it('never throws and never mutates, on arbitrary input (E20.2)', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.anything(), (data, layout, config) => {
        const before = fc.stringify([data, layout, config]);
        const issues = validate(data, layout, registry, { config });
        expect(Array.isArray(issues)).toBe(true);
        expect(fc.stringify([data, layout, config])).toBe(before);
      }),
      { numRuns: 500 },
    );
    const traceish = fc.dictionary(
      fc.constantFrom('type', 'mode', 'marker', 'x', 'y', 'xaxis', 'opacity', 'line', 'name'),
      fc.anything(),
    );
    fc.assert(
      fc.property(fc.array(traceish), fc.dictionary(fc.string(), fc.anything()), (data, layout) => {
        for (const issue of validate(data, layout, registry)) {
          expect(typeof issue.path).toBe('string');
          expect(typeof issue.message).toBe('string');
        }
      }),
    );
  });
});

describe('templates with an own `__proto__` key', () => {
  // Regression (CI seed 2064512310): copying template layout keys by assignment replaced the copy's
  // prototype with the `__proto__` value, and the issues then held a fake Map that broke equality.
  it('skips the key like other `_`-prefixed keys, without changing any prototype', () => {
    const layout: Record<string, unknown> = {};
    Object.defineProperty(layout, '__proto__', {
      value: new Map(),
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const run = () => validate([], { template: { layout } }, registry);
    const issues = run();
    expect(issues.filter((i) => i.path.includes('__proto__'))).toEqual([]);
    for (const issue of issues) {
      const v = (issue as { value?: unknown }).value;
      if (v !== null && typeof v === 'object' && !(v instanceof Map)) {
        expect(Object.getPrototypeOf(v)).not.toBeInstanceOf(Map);
      }
    }
    expect(run()).toEqual(issues);
  });
});

describe('suggestions', () => {
  it('computes edit distance with transpositions', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('drak', 'dark')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('abcdef', 'x', 2)).toBe(3);
  });

  it('only suggests close matches', () => {
    expect(suggest('colr', ['color', 'size'])).toBe('color');
    expect(suggest('MARKER', ['marker'])).toBe('marker');
    expect(suggest('x', ['y', 'z'])).toBe('y');
    expect(suggest('opacity', ['line', 'mode'])).toBeUndefined();
  });

  it('edit distance is a symmetric metric-like function', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 8 }), fc.string({ maxLength: 8 }), (a, b) => {
        const d = editDistance(a, b);
        expect(d).toBe(editDistance(b, a));
        expect(d).toBeLessThanOrEqual(Math.max(a.length, b.length));
        expect(d === 0).toBe(a === b);
      }),
    );
  });
});
