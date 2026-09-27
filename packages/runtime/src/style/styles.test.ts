import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  createRegistry,
  supplyDefaults,
  type FigureInput,
  type Issue,
  type Registry,
  type SupplyDefaultsResult,
} from '@mk7s/holochart-core';
import { spots } from '../__testing__/spots.ts';
import { applyStyleRules, compileStyleRules, withStyleFunctions } from './styles.ts';

function registry(): Registry {
  return createRegistry().register(spots);
}

const GOLD = 'rgb(255, 215, 0)';
const RED = 'rgb(255, 0, 0)';

/** Supply defaults and apply the rules, like the chart does; returns trace 0 and the issues. */
function styled(
  trace: Record<string, unknown>,
  figure: Omit<FigureInput, 'data'> = {},
): { t: Record<string, unknown>; issues: Issue[]; full: SupplyDefaultsResult } {
  const core = registry();
  const issues: Issue[] = [];
  const input = withStyleFunctions({ ...figure, data: [{ type: 'spots', ...trace }] }, core);
  const full = supplyDefaults(input, core, { onIssue: (i) => issues.push(i) });
  applyStyleRules(full, core, { onIssue: (i) => issues.push(i) });
  return { t: full.fullData[0] as Record<string, unknown>, issues, full };
}

function marker(t: Record<string, unknown>): Record<string, unknown> {
  return t['marker'] as Record<string, unknown>;
}

const xs = [0, 1, 2, 3, 4];
const ys = [5, 12, 8, 20, 11];

describe('style rules: operators', () => {
  const colorsFor = (when: unknown, extra: Record<string, unknown> = {}) =>
    marker(
      styled({
        x: xs,
        y: ys,
        ...extra,
        marker: { color: 'blue' },
        styleRules: [{ when, set: { 'marker.color': 'red' } }],
      }).t,
    )['color'];
  const hits = (when: unknown, extra?: Record<string, unknown>) =>
    (colorsFor(when, extra) as string[]).map((c) => (c === RED ? 1 : 0));

  it.each([
    [{ y: { gt: 11 } }, [0, 1, 0, 1, 0]],
    [{ y: { gte: 11 } }, [0, 1, 0, 1, 1]],
    [{ y: { lt: 8 } }, [1, 0, 0, 0, 0]],
    [{ y: { lte: 8 } }, [1, 0, 1, 0, 0]],
    [{ y: { eq: 20 } }, [0, 0, 0, 1, 0]],
    [{ y: 20 }, [0, 0, 0, 1, 0]],
    [{ y: { ne: 20 } }, [1, 1, 1, 0, 1]],
    [{ y: { in: [5, 8] } }, [1, 0, 1, 0, 0]],
    [{ y: { nin: [5, 8] } }, [0, 1, 0, 1, 1]],
    [{ y: { between: [8, 12] } }, [0, 1, 1, 0, 1]],
    [{ y: { gt: 6, lt: 12 } }, [0, 0, 1, 0, 1]],
    [{ pointNumber: { in: [0, 4] } }, [1, 0, 0, 0, 1]],
    [{ and: [{ y: { gt: 6 } }, { x: { lt: 3 } }] }, [0, 1, 1, 0, 0]],
    [{ or: [{ y: { gt: 15 } }, { x: 0 }] }, [1, 0, 0, 1, 0]],
    [{ not: { y: { gt: 10 } } }, [1, 0, 1, 0, 0]],
    [{ not: { or: [{ x: 1 }, { and: [{ x: { gte: 3 } }, { y: { lt: 15 } }] }] } }, [1, 0, 1, 1, 0]],
  ])('%j', (when, expected) => {
    expect(hits(when)).toEqual(expected);
  });

  it('regex on strings (and numbers), with flags; never on missing values', () => {
    const text = ['Apple', 'banana', 'avocado', 'Cherry', undefined];
    expect(hits({ text: { regex: '^A' } }, { text })).toEqual([1, 0, 0, 0, 0]);
    expect(hits({ text: { regex: { pattern: '^a', flags: 'i' } } }, { text })).toEqual([
      1, 0, 1, 0, 0,
    ]);
    // `g` would make results depend on the previous point; it is ignored.
    expect(hits({ text: { regex: { pattern: 'a', flags: 'g' } } }, { text })).toEqual([
      0, 1, 1, 0, 0,
    ]);
    expect(hits({ y: { regex: '^1' } })).toEqual([0, 1, 0, 0, 1]);
  });

  it('compares strings lexicographically, dates in time order, numeric strings as numbers', () => {
    const x = ['2024-01-01', '2024-03-01', '2024-06-15', '2025-01-01', '2023-12-31'];
    expect(hits({ x: { gte: '2024-03-01', lt: '2025-01-01' } }, { x })).toEqual([0, 1, 1, 0, 0]);
    const dates = x.map((d) => new Date(`${d}T00:00:00Z`));
    expect(hits({ x: { between: ['2024-01-01', '2024-06-15'] } }, { x: dates })).toEqual([
      1, 1, 1, 0, 0,
    ]);
    expect(hits({ x: { eq: '2024-03-01' } }, { x: dates })).toEqual([0, 1, 0, 0, 0]);
    expect(hits({ y: { gt: 10 } }, { y: ['5', '12', 'n/a', null, '11'] })).toEqual([0, 1, 0, 0, 1]);
  });

  it('missing fields and values never match comparisons; eq: null matches them', () => {
    const customdata = [[1, 'A'], [2], null, [4, 'B'], undefined];
    expect(hits({ 'customdata[1]': { in: ['A', 'B'] } }, { customdata })).toEqual([1, 0, 0, 1, 0]);
    expect(hits({ 'customdata[1]': { eq: null } }, { customdata })).toEqual([0, 1, 1, 0, 1]);
    expect(hits({ 'customdata[0]': { gt: 1 } }, { customdata })).toEqual([0, 1, 0, 1, 0]);
    // A trace without `z`: no point has one.
    expect(hits({ z: { gt: 0 } })).toEqual([0, 0, 0, 0, 0]);
    expect(hits({ z: null })).toEqual([1, 1, 1, 1, 1]);
  });

  it('reads nested paths of objects in customdata, and defaulted attributes', () => {
    const customdata = [{ kind: 'a' }, { kind: 'b' }, { kind: 'a' }, {}, { kind: 'b' }];
    expect(hits({ 'customdata.kind': 'b' }, { customdata })).toEqual([0, 1, 0, 0, 1]);
    // marker.size is a default (6) on every point; a per-point array is read per point.
    expect(hits({ 'marker.size': 6 })).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('style rules: resolution', () => {
  it('merges over the scalar value; later rules win; other targets keep theirs', () => {
    const { t } = styled({
      x: xs,
      y: ys,
      marker: { color: 'blue', size: 9 },
      styleRules: [
        { when: { y: { gt: 10 } }, set: { 'marker.color': 'gold', 'marker.size': 14 } },
        { when: { y: { gt: 15 } }, set: { 'marker.color': 'red' } },
      ],
    });
    const BLUE = 'rgb(0, 0, 255)';
    expect(marker(t)['color']).toEqual([BLUE, GOLD, BLUE, RED, GOLD]);
    expect(marker(t)['size']).toEqual(Float64Array.of(9, 14, 9, 14, 14));
  });

  it('merges over per-point arrays and the colorway default', () => {
    const { t, full } = styled({
      x: xs,
      y: ys,
      marker: { color: ['a', 'b', 'c', 'd', 'e'] },
      styleRules: [{ when: { pointNumber: 2 }, set: { 'marker.color': 'gold', text: 'hi' } }],
    });
    expect(marker(t)['color']).toEqual(['a', 'b', GOLD, 'd', 'e']);
    expect(t['text']).toEqual([undefined, undefined, 'hi', undefined, undefined]);
    // The colorway color of the trace fills the points no rule matches.
    const other = styled({
      x: xs,
      y: ys,
      styleRules: [{ when: { y: 20 }, set: { 'marker.color': 'gold' } }],
    });
    const dflt = full.fullLayout.colorway[0];
    expect(marker(other.t)['color']).toEqual([dflt, dflt, dflt, GOLD, dflt].map(String));
  });

  it('keeps typed arrays typed (as Float64Array) and never mutates the input', () => {
    const size = Float32Array.of(1, 2, 3, 4, 5);
    const y = Int16Array.from(ys);
    const { t } = styled({
      x: xs,
      y,
      marker: { size },
      styleRules: [{ when: { y: { gt: 10 } }, set: { 'marker.size': 20 } }],
    });
    expect(marker(t)['size']).toEqual(Float64Array.of(1, 20, 3, 20, 20));
    expect(size).toEqual(Float32Array.of(1, 2, 3, 4, 5));
    // A string value among numbers gives a plain array.
    const mixed = styled({
      x: xs,
      y: ys,
      marker: { color: Float64Array.of(1, 2, 3, 4, 5) },
      styleRules: [{ when: { y: 20 }, set: { 'marker.color': 'gold' } }],
    });
    expect(marker(mixed.t)['color']).toEqual([1, 2, 3, GOLD, 5]);
  });

  it('applies a rule without `when` to every point', () => {
    const { t } = styled({ x: xs, y: ys, styleRules: [{ set: { 'marker.symbol': 'square' } }] });
    expect(marker(t)['symbol']).toEqual(Array(5).fill('square'));
  });

  it('leaves containers the trace does not use alone', () => {
    const { t } = styled({
      x: xs,
      y: ys,
      mode: 'lines',
      styleRules: [{ set: { 'marker.color': 'gold', text: 'x' } }],
    });
    expect(t['marker']).toBeUndefined();
    expect(t['text']).toEqual(Array(5).fill('x'));
  });

  it('reuses its arrays while the trace and its base values are unchanged', () => {
    const core = registry();
    const trace = {
      type: 'spots',
      x: xs,
      y: ys,
      styleRules: [{ when: { y: { gt: 10 } }, set: { 'marker.size': 10 } }],
    };
    const run = (layout: Record<string, unknown> = {}) => {
      const full = supplyDefaults({ data: [trace], layout }, core);
      applyStyleRules(full, core);
      return marker(full.fullData[0] as Record<string, unknown>);
    };
    const a = run();
    expect(run()['size']).toBe(a['size']);
    // A new base value (the colorway color) recomputes the color, not the size.
    const b = run({ colorway: ['#123456'] });
    expect(b['size']).toBe(a['size']);
  });

  it('skips paths a transition is animating', () => {
    const core = registry();
    const full = supplyDefaults(
      {
        data: [
          {
            type: 'spots',
            x: xs,
            y: ys,
            styleRules: [{ set: { 'marker.size': 10, 'marker.color': 'gold' } }],
          },
        ],
      },
      core,
    );
    applyStyleRules(full, core, { skip: (i, path) => i === 0 && path === 'marker.size' });
    const m = marker(full.fullData[0] as Record<string, unknown>);
    expect(m['size']).toBe(6);
    expect(m['color']).toEqual(Array(5).fill(GOLD));
  });
});

describe('style rules: validation', () => {
  const issuesOf = (rules: unknown) =>
    styled({ x: xs, y: ys, styleRules: rules }).issues.map((i) => `${i.path}: ${i.message}`);

  it('reports unknown operators with a suggestion and ignores the rule', () => {
    const { issues, t } = styled({
      x: xs,
      y: ys,
      marker: { size: 3 },
      styleRules: [
        { when: { y: { gtt: 10 } }, set: { 'marker.size': 20 } },
        { when: { y: 20 }, set: { 'marker.size': 30 } },
      ],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      path: 'data[0].styleRules[0].when.y.gtt',
      suggestion: 'gt',
      severity: 'error',
    });
    expect(issues[0]?.message).toMatch(/unknown operator 'gtt'; did you mean 'gt'\?/);
    // The valid rule still applies.
    expect(marker(t)['size']).toEqual(Float64Array.of(3, 3, 3, 30, 3));
  });

  it('reports unknown fields, bad operands, non-arrayOk targets and invalid values', () => {
    expect(
      issuesOf([
        { when: { yy: 1 }, set: { 'marker.color': 'red' } },
        { when: { y: { between: [1] } }, set: { 'marker.color': 'red' } },
        { when: { y: { in: 3 } }, set: { 'marker.color': 'red' } },
        { when: { text: { regex: '(' } }, set: { 'marker.color': 'red' } },
        { when: { or: { y: 1 } }, set: { 'marker.color': 'red' } },
        { when: { y: [1, 2] }, set: { 'marker.color': 'red' } },
        { set: { mode: 'lines', 'marker.colr': 'red', 'marker.size': -1, 'marker.color': 'nope' } },
        { when: 3, set: {} },
        { sett: {} },
        { set: {}, whne: {} },
      ]),
    ).toEqual([
      "data[0].styleRules[0].when.yy: unknown field 'yy'; did you mean 'y'? (the rule is ignored); conditions test trace attributes such as 'y', 'customdata[1]' or 'marker.size', or 'pointNumber'",
      'data[0].styleRules[1].when.y.between: invalid operand an array; expected a [low, high] pair of numbers or strings (the rule is ignored)',
      'data[0].styleRules[2].when.y.in: invalid operand 3; expected an array of values (the rule is ignored)',
      "data[0].styleRules[3].when.text.regex: invalid operand '('; expected a valid pattern: '^A' or { pattern: '^a', flags: 'i' } (the rule is ignored)",
      'data[0].styleRules[4].when.or: expected an array of conditions, got an object (the rule is ignored)',
      'data[0].styleRules[5].when.y: invalid condition an array; expected a value or operators such as { in: [...] } (the rule is ignored)',
      "data[0].styleRules[6].set.mode: 'mode' is not a per-point (arrayOk) attribute; style rules can only set those (ignored)",
      "data[0].styleRules[6].set.marker.colr: unknown attribute 'marker.colr' (ignored)",
      'data[0].styleRules[6].set.marker.size: invalid value -1; expected a number >= 0 (ignored)',
      "data[0].styleRules[6].set.marker.color: invalid value 'nope'; expected a CSS color (ignored)",
      'data[0].styleRules[7].when: expected a condition object such as { y: { gt: 10 } }, got 3 (the rule is ignored)',
      "data[0].styleRules[8].set: expected a rule { when, set } whose set maps per-point attributes to values, e.g. { set: { 'marker.size': 12 } } (the rule is ignored)",
      "data[0].styleRules[9].whne: unknown rule key 'whne'; did you mean 'when'?",
    ]);
    expect(issuesOf({ when: {} })).toEqual([
      'data[0].styleRules: expected an array of { when, set } rules, got an object',
    ]);
  });

  it('reports a rules array once, however many runs', () => {
    const core = registry();
    const rules = [{ when: { y: { gtt: 1 } }, set: { 'marker.color': 'red' } }];
    const onIssue = vi.fn();
    for (let k = 0; k < 3; k++) {
      const full = supplyDefaults(
        { data: [{ type: 'spots', x: xs, y: ys, styleRules: rules }] },
        core,
      );
      applyStyleRules(full, core, { onIssue });
    }
    expect(onIssue).toHaveBeenCalledTimes(1);
  });

  it('throws in strict mode', () => {
    const core = registry();
    const full = supplyDefaults(
      {
        data: [{ type: 'spots', x: xs, y: ys, styleRules: [{ when: { y: { gtt: 1 } }, set: {} }] }],
        config: { strict: true },
      },
      core,
    );
    expect(() => applyStyleRules(full, core)).toThrow(/unknown operator 'gtt'/);
  });

  it('compileStyleRules can be used on its own', () => {
    const report = vi.fn();
    const out = compileStyleRules(
      [{ when: { y: { gt: 1 } }, set: { 'marker.color': 'gold', 'marker.size': 3 } }],
      spots.schema,
      'rules',
      report,
    );
    expect(report).not.toHaveBeenCalled();
    expect(out.targets).toEqual(['marker.color', 'marker.size']);
  });
});

describe('style functions', () => {
  it('evaluates functions on several arrayOk attributes into arrays, with point, i, trace', () => {
    const color = vi.fn((p: { y: number }, _i: number, _trace: { type: string }) =>
      p.y > 10 ? 'gold' : 'gray',
    );
    const trace = {
      x: xs,
      y: ys,
      customdata: ['a', 'b', 'c', 'd', 'e'],
      text: (p: { customdata: string }, i: number) => `${p.customdata}${i}`,
      marker: { color, size: (p: { y: number }) => p.y, line: { width: () => 2 } },
    };
    const { t, issues } = styled(trace);
    expect(issues).toEqual([]);
    // Like a user-given array: kept as is (the trace module converts colors).
    expect(marker(t)['color']).toEqual(['gray', 'gold', 'gray', 'gold', 'gold']);
    expect(marker(t)['size']).toEqual(ys);
    expect((marker(t)['line'] as Record<string, unknown>)['width']).toEqual([2, 2, 2, 2, 2]);
    expect(t['text']).toEqual(['a0', 'b1', 'c2', 'd3', 'e4']);
    expect(color.mock.calls[1]?.[0]).toEqual({
      pointNumber: 1,
      x: 1,
      y: 12,
      customdata: 'b',
    });
    expect(color.mock.calls[1]?.[1]).toBe(1);
    expect(color.mock.calls[1]?.[2].type).toBe('spots');
  });

  it('sees dataset columns, and style rules apply over the evaluated arrays', () => {
    const { t } = styled(
      {
        dataset: 'd',
        x: '@a',
        y: '@b',
        marker: { size: (p: { y: number }) => p.y * 2 },
        styleRules: [{ when: { 'marker.size': { gt: 30 } }, set: { 'marker.size': 1 } }],
      },
      { datasets: { d: { a: [1, 2, 3], b: [10, 20, 30] } } },
    );
    // A plain array stays plain.
    expect(marker(t)['size']).toEqual([20, 1, 1]);
  });

  it('caches per input trace and leaves traces without functions untouched', () => {
    const core = registry();
    const size = vi.fn(() => 3);
    const styledTrace = { type: 'spots', x: xs, y: ys, marker: { size } };
    const plain = { type: 'spots', x: xs, y: ys };
    const figure = { data: [styledTrace, plain] };
    const a = withStyleFunctions(figure, core);
    const b = withStyleFunctions(figure, core);
    expect(size).toHaveBeenCalledTimes(5);
    expect(b.data?.[0]).toBe(a.data?.[0]);
    expect(a.data?.[1]).toBe(plain);
    expect(withStyleFunctions({ data: [plain] }, core).data?.[0]).toBe(plain);
  });

  it('drops a function that throws, with a warning, and rejects non-arrayOk functions', () => {
    const core = registry();
    const warn = vi.spyOn(core, 'warnOnce').mockImplementation(() => undefined);
    const out = withStyleFunctions(
      {
        data: [
          {
            type: 'spots',
            x: xs,
            y: ys,
            mode: () => 'lines',
            marker: {
              color: () => {
                throw new Error('boom');
              },
            },
          },
        ],
      },
      core,
    );
    const trace = out.data?.[0] as Record<string, unknown>;
    expect(trace['marker']).toEqual({});
    expect(warn.mock.calls[0]?.[0].message).toMatch(/style function threw \(boom\)/);
    const issues: Issue[] = [];
    supplyDefaults(out, core, { onIssue: (i) => issues.push(i) });
    expect(issues[0]?.message).toMatch(
      /style functions work only on per-point \(arrayOk\) attributes/,
    );
  });
});

describe('style rules: properties', () => {
  // Rules resolve like evaluating them point by point, the last matching rule winning.
  it('matches a naive per-point evaluation', () => {
    const cmp = fc.constantFrom('gt', 'gte', 'lt', 'lte', 'eq', 'ne');
    const cond = fc.record({
      field: fc.constantFrom('x', 'y'),
      op: cmp,
      value: fc.integer({ min: -5, max: 5 }),
    });
    const naive = (op: string, v: number, a: number) =>
      op === 'gt'
        ? v > a
        : op === 'gte'
          ? v >= a
          : op === 'lt'
            ? v < a
            : op === 'lte'
              ? v <= a
              : op === 'eq'
                ? v === a
                : v !== a;
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -5, max: 5 }), fc.integer({ min: -5, max: 5 })), {
          minLength: 1,
          maxLength: 30,
        }),
        fc.array(fc.record({ c: cond, size: fc.integer({ min: 0, max: 50 }) }), { maxLength: 5 }),
        (points, rules) => {
          const x = points.map((p) => p[0]);
          const y = points.map((p) => p[1]);
          const { t } = styled({
            x,
            y,
            marker: { size: 1 },
            styleRules: rules.map((r) => ({
              when: { [r.c.field]: { [r.c.op]: r.c.value } },
              set: { 'marker.size': r.size },
            })),
          });
          const expected = points.map((p) => {
            let s = 1;
            for (const r of rules) {
              const v = r.c.field === 'x' ? p[0] : p[1];
              if (naive(r.c.op, v, r.c.value)) s = r.size;
            }
            return s;
          });
          const size = marker(t)['size'];
          const got =
            typeof size === 'number' ? points.map(() => size) : Array.from(size as Float64Array);
          expect(got).toEqual(expected);
        },
      ),
    );
  });
});

describe('style rules: performance', () => {
  // Generous bound: a compiled predicate per rule, one pass per rule. ~50 ms on a laptop.
  it('resolves 1M points with two rules and a nested condition quickly', () => {
    const n = 1_000_000;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const customdata = new Array<string>(n);
    for (let i = 0; i < n; i++) {
      x[i] = i;
      y[i] = Math.sin(i / 1000) * 20;
      customdata[i] = i % 3 === 0 ? 'A' : 'C';
    }
    const t0 = performance.now();
    const { t } = styled({
      x,
      y,
      customdata,
      styleRules: [
        { when: { y: { gt: 10 }, customdata: { in: ['A', 'B'] } }, set: { 'marker.size': 14 } },
        {
          when: { or: [{ y: { lt: -15 } }, { pointNumber: { between: [0, 99] } }] },
          set: { 'marker.color': 'gold', 'marker.size': 3 },
        },
      ],
    });
    const ms = performance.now() - t0;
    const size = marker(t)['size'] as Float64Array;
    expect(size).toBeInstanceOf(Float64Array);
    expect(size.length).toBe(n);
    expect(size[0]).toBe(3);
    expect(ms).toBeLessThan(3000);
  });
});
