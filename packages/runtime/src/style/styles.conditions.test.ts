import { describe, expect, it } from 'vitest';
import { createRegistry, supplyDefaults, type Issue } from '@mk7s/holochart-core';
import { spots } from '../__testing__/spots.ts';
import { applyStyleRules } from './styles.ts';

const RED = 'rgb(255, 0, 0)';
const BLUE = 'rgb(0, 0, 255)';
const xs = [0, 1, 2, 3, 4];
const ys = [5, 12, 8, 20, 11];

/** Supply defaults and apply the rules, like the chart does; returns trace 0 and the issues. */
function styled(trace: Record<string, unknown>): { t: Record<string, unknown>; issues: Issue[] } {
  const core = createRegistry().register(spots);
  const issues: Issue[] = [];
  const full = supplyDefaults({ data: [{ type: 'spots', x: xs, y: ys, ...trace }] }, core, {
    onIssue: (i) => issues.push(i),
  });
  applyStyleRules(full, core, { onIssue: (i) => issues.push(i) });
  return { t: full.fullData[0] as Record<string, unknown>, issues };
}

/** Which points a `when` matches (1) on a trace with blue markers the rule turns red. */
function hits(when: unknown, extra: Record<string, unknown> = {}): number[] {
  const { t, issues } = styled({
    ...extra,
    marker: { color: 'blue' },
    styleRules: [{ when, set: { 'marker.color': 'red' } }],
  });
  expect(issues).toEqual([]);
  const color = (t['marker'] as Record<string, unknown>)['color'] as string[];
  return color.map((c) => (c === RED ? 1 : 0));
}

/** The issues of one invalid `when`, as `path: message`, and whether the rule was still applied. */
function rejected(when: unknown): { issues: string[]; color: unknown } {
  const { t, issues } = styled({
    marker: { color: 'blue' },
    styleRules: [{ when, set: { 'marker.color': 'red' } }],
  });
  return {
    issues: issues.map((i) => `${i.path}: ${i.message}`),
    color: (t['marker'] as Record<string, unknown>)['color'],
  };
}

const WHEN = 'data[0].styleRules[0].when';
const IGNORED = '(the rule is ignored)';

describe('style rule conditions: comparing values of different kinds (E8.5)', () => {
  it('compares dates with a number as milliseconds', () => {
    const days = ['2024-01-01', '2024-03-01', '2024-06-15', '2025-01-01', '2023-12-31'];
    const x = days.map((d) => new Date(`${d}T00:00:00Z`));
    expect(hits({ x: { gte: Date.UTC(2024, 2, 1) } }, { x })).toEqual([0, 1, 1, 1, 0]);
    expect(hits({ x: { between: [Date.UTC(2024, 0, 1), Date.UTC(2024, 5, 15)] } }, { x })).toEqual([
      1, 1, 1, 0, 0,
    ]);
  });

  it('compares numbers with a numeric string as numbers, and never matches a non-numeric one', () => {
    // As numbers: '10' sorts before '5' as text, 10 is greater than 5 as a number.
    expect(hits({ y: { gt: '10' } })).toEqual([0, 1, 0, 1, 1]);
    expect(hits({ y: { lte: '8' } })).toEqual([1, 0, 1, 0, 0]);
    expect(hits({ y: { gt: 'ten' } })).toEqual([0, 0, 0, 0, 0]);
    expect(hits({ y: { lte: 'ten' } })).toEqual([0, 0, 0, 0, 0]);
  });

  it('orders only strings against a string: booleans, objects and gaps never match', () => {
    const customdata = [true, null, 'b', { kind: 'c' }, 'a'];
    expect(hits({ customdata: { gte: 'b' } }, { customdata })).toEqual([0, 0, 1, 0, 0]);
    expect(hits({ customdata: { lt: 'b' } }, { customdata })).toEqual([0, 0, 0, 0, 1]);
    // Equality still tells them apart.
    expect(hits({ customdata: true }, { customdata })).toEqual([1, 0, 0, 0, 0]);
    expect(hits({ customdata: { ne: true } }, { customdata })).toEqual([0, 1, 1, 1, 1]);
  });

  it('reads nothing from a path into an attribute the trace does not have', () => {
    expect(hits({ 'customdata[1]': { gt: 0 } })).toEqual([0, 0, 0, 0, 0]);
    expect(hits({ 'customdata[1]': { ne: 'A' } })).toEqual([1, 1, 1, 1, 1]);
    expect(hits({ 'customdata[1]': null })).toEqual([1, 1, 1, 1, 1]);
    // Nor from a path into a scalar: the marker size (6 on every point) has no `[0]`.
    expect(hits({ 'marker.size[0]': 6 })).toEqual([0, 0, 0, 0, 0]);
  });

  it('gives a scalar attribute to every point', () => {
    expect(hits({ mode: 'markers' })).toEqual([1, 1, 1, 1, 1]);
    expect(hits({ mode: { in: ['lines'] } })).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('style rule conditions: invalid operands (E8.5)', () => {
  it.each([
    [{ eq: { a: 1 } }, 'eq', 'an object', 'a number, string, boolean or null'],
    [{ ne: [1, 2] }, 'ne', 'an array', 'a number, string, boolean or null'],
    [{ gt: null }, 'gt', 'null', 'a number or string'],
    [{ gte: NaN }, 'gte', 'NaN', 'a number or string'],
    [{ lt: true }, 'lt', 'true', 'a number or string'],
    [{ lte: [1] }, 'lte', 'an array', 'a number or string'],
    [{ nin: 'ab' }, 'nin', "'ab'", 'an array of values'],
    [{ between: 3 }, 'between', '3', 'a [low, high] pair of numbers or strings'],
    [{ between: [1, null] }, 'between', 'an array', 'a [low, high] pair of numbers or strings'],
    [{ between: [1, 2, 3] }, 'between', 'an array', 'a [low, high] pair of numbers or strings'],
    [{ regex: 5 }, 'regex', '5', "a valid pattern: '^A' or { pattern: '^a', flags: 'i' }"],
    [
      { regex: { flags: 'i' } },
      'regex',
      'an object',
      "a valid pattern: '^A' or { pattern: '^a', flags: 'i' }",
    ],
    [
      { regex: { pattern: 'a', flags: 'q' } },
      'regex',
      'an object',
      "a valid pattern: '^A' or { pattern: '^a', flags: 'i' }",
    ],
  ])('%j is reported and the rule ignored', (ops, key, shown, expected) => {
    const { issues, color } = rejected({ y: ops });
    expect(issues).toEqual([
      `${WHEN}.y.${key}: invalid operand ${shown}; expected ${expected} ${IGNORED}`,
    ]);
    expect(color).toBe(BLUE);
  });

  it('stops at the first invalid operator of a field', () => {
    const { issues } = rejected({ y: { gt: null, lt: null } });
    expect(issues).toHaveLength(1);
  });

  it('lists the operators for an unknown one that resembles none', () => {
    const { t, issues } = styled({
      marker: { color: 'blue' },
      styleRules: [{ when: { y: { xyzzyplugh: 1 } }, set: { 'marker.color': 'red' } }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      path: `${WHEN}.y.xyzzyplugh`,
      message: `unknown operator 'xyzzyplugh' ${IGNORED}; operators: eq, ne, gt, gte, lt, lte, in, nin, between, regex`,
      severity: 'error',
    });
    expect(issues[0]).not.toHaveProperty('suggestion');
    expect((t['marker'] as Record<string, unknown>)['color']).toBe(BLUE);
  });
});

describe('style rule conditions: invalid fields and nesting (E8.5)', () => {
  it('reports an unknown field that resembles none without a suggestion', () => {
    const { t, issues } = styled({
      marker: { color: 'blue' },
      styleRules: [{ when: { xyzzyplugh: 1 }, set: { 'marker.color': 'red' } }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toBe(
      `unknown field 'xyzzyplugh' ${IGNORED}; conditions test trace attributes such as 'y', 'customdata[1]' or 'marker.size', or 'pointNumber'`,
    );
    expect(issues[0]).toMatchObject({ code: 'unknown-attribute', severity: 'error' });
    expect(issues[0]).not.toHaveProperty('suggestion');
    expect((t['marker'] as Record<string, unknown>)['color']).toBe(BLUE);
  });

  it('reports a field that is not a path', () => {
    const { issues, color } = rejected({ 'y[': 1 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^data\[0\]\.styleRules\[0\]\.when\.y\[: unknown field 'y\['/);
    expect(color).toBe(BLUE);
  });

  it('ignores the whole rule when a condition nested in and / or / not is invalid', () => {
    expect(rejected({ and: [{ y: { gt: 6 } }, { yy: 2 }] })).toEqual({
      issues: [expect.stringContaining(`${WHEN}.and[1].yy: unknown field 'yy'; did you mean 'y'?`)],
      color: BLUE,
    });
    expect(rejected({ or: [{ y: 20 }, 'x'] })).toEqual({
      issues: [
        `${WHEN}.or[1]: expected a condition object such as { y: { gt: 10 } }, got 'x' ${IGNORED}`,
      ],
      color: BLUE,
    });
    expect(rejected({ not: { y: { gtt: 1 } } })).toEqual({
      issues: [
        expect.stringContaining(`${WHEN}.not.y.gtt: unknown operator 'gtt'; did you mean 'gt'?`),
      ],
      color: BLUE,
    });
    expect(rejected({ and: 3 })).toEqual({
      issues: [`${WHEN}.and: expected an array of conditions, got 3 ${IGNORED}`],
      color: BLUE,
    });
  });

  it('matches every point for an empty `and`, none for an empty `or`', () => {
    expect(hits({ and: [] })).toEqual([1, 1, 1, 1, 1]);
    expect(hits({ or: [] })).toEqual([0, 0, 0, 0, 0]);
  });
});
