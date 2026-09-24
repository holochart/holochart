import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { stripInternal } from '../util/objects.ts';
import { findAxisGroup, multiplyScales, updateConstraintGroups } from './constraints.ts';
import { supplyDefaults } from './supply-defaults.ts';
import type { FigureInput, FullAxis, FullLayout } from './types.ts';

const quiet = { onIssue: () => {} };
const run = (layout: Record<string, unknown>, data: unknown[] = []): FullLayout =>
  supplyDefaults({ data, layout } as FigureInput, fixtureRegistry(), quiet).fullLayout;
const ax = (fl: FullLayout, key: string): FullAxis & Record<string, unknown> =>
  fl[key] as FullAxis & Record<string, unknown>;

/** Full layout, and that feeding it back in reproduces it (groups included). */
function runIdempotent(layout: Record<string, unknown>): FullLayout {
  const first = run(layout);
  const again = run(stripInternal(first) as Record<string, unknown>);
  expect(stripInternal(again)).toEqual(stripInternal(first));
  expect(again._axisMatchGroups).toEqual(first._axisMatchGroups);
  expect(again._axisConstraintGroups).toEqual(first._axisConstraintGroups);
  return first;
}

describe('multiplyScales (Plotly)', () => {
  it('multiplies plain ratios', () => {
    expect(multiplyScales(2, 3)).toBe(6);
    expect(multiplyScales('2', 3)).toBe(6);
  });

  it('keeps aspect prefixes of one letter and cancels opposite ones', () => {
    expect(multiplyScales(2, 'y3')).toBe('y6');
    expect(multiplyScales('x2', 3)).toBe('x6');
    expect(multiplyScales('x2', 'x3')).toBe('xx6');
    expect(multiplyScales('x2', 'y3')).toBe(6);
    expect(multiplyScales('xx2', 'y3')).toBe('x6');
    expect(multiplyScales('y2', 'xxx3')).toBe('xx6');
  });
});

describe('updateConstraintGroups (Plotly merge cases)', () => {
  it('starts a group with the scale factor on this axis', () => {
    const groups: Record<string, number | string>[] = [];
    updateConstraintGroups(groups, 'y', 'x', 2);
    expect(groups).toEqual([{ y: 2, x: 1 }]);
    expect(findAxisGroup(groups, 'x')).toBe(groups[0]);
    expect(findAxisGroup(groups, 'x2')).toBeNull();
  });

  it('joins the group of the target', () => {
    const groups: Record<string, number | string>[] = [{ x2: 1, x: 1 }];
    updateConstraintGroups(groups, 'y', 'x2', 3);
    expect(groups).toEqual([{ x2: 1, x: 1, y: 3 }]);
  });

  it('merges this axis group into the target group, rescaled', () => {
    const groups: Record<string, number | string>[] = [
      { x: 2, y: 1 },
      { x2: 1, y2: 5 },
    ];
    updateConstraintGroups(groups, 'y', 'y2', 3);
    // base (y2) 5 × 3 × own ratio.
    expect(groups).toEqual([{ x2: 1, y2: 5, x: 30, y: 15 }]);
  });

  it('rescales this axis group when the target joins it', () => {
    const groups: Record<string, number | string>[] = [{ y: 2, x: 1 }];
    updateConstraintGroups(groups, 'x', 'x3', 2);
    expect(groups).toEqual([{ y: 4, x: 2, x3: 1 }]);
  });
});

describe('constraintoward defaults', () => {
  it('defaults by letter and rejects the other letter', () => {
    const fl = runIdempotent({
      xaxis: {},
      yaxis: {},
      xaxis2: { constraintoward: 'top' },
      yaxis2: { constraintoward: 'top' },
      xaxis3: { constraintoward: 'left' },
      yaxis3: { constraintoward: 'right' },
    });
    expect(ax(fl, 'xaxis').constraintoward).toBe('center');
    expect(ax(fl, 'yaxis').constraintoward).toBe('middle');
    expect(ax(fl, 'xaxis2').constraintoward).toBe('center');
    expect(ax(fl, 'yaxis2').constraintoward).toBe('top');
    expect(ax(fl, 'xaxis3').constraintoward).toBe('left');
    expect(ax(fl, 'yaxis3').constraintoward).toBe('middle');
  });

  it('falls back to a valid template value', () => {
    const fl = run({
      template: {
        layout: { xaxis: { constraintoward: 'right' }, yaxis: { constraintoward: 'x' } },
      },
      xaxis: { constraintoward: 'bottom' },
      yaxis: {},
    });
    expect(ax(fl, 'xaxis').constraintoward).toBe('right');
    expect(ax(fl, 'yaxis').constraintoward).toBe('middle');
  });
});

describe('matches', () => {
  it('chains axes into one match group; the pure-match constraint group is dropped', () => {
    const fl = runIdempotent({ xaxis: {}, xaxis2: { matches: 'x' }, xaxis3: { matches: 'x2' } });
    expect(fl._axisMatchGroups).toEqual([{ x2: 1, x: 1, x3: 1 }]);
    expect(fl._axisConstraintGroups).toEqual([]);
    expect(ax(fl, 'xaxis2').matches).toBe('x');
    expect(ax(fl, 'xaxis3').matches).toBe('x2');
    expect(ax(fl, 'xaxis').matches).toBeUndefined();
  });

  it('rejects loops', () => {
    const fl = runIdempotent({ xaxis: { matches: 'x2' }, xaxis2: { matches: 'x' } });
    expect(ax(fl, 'xaxis').matches).toBe('x2');
    expect(ax(fl, 'xaxis2').matches).toBeUndefined();
    expect(fl._axisMatchGroups).toEqual([{ x: 1, x2: 1 }]);
    // Self links and three-axis loops too.
    const loop3 = runIdempotent({
      xaxis: { matches: 'x2' },
      xaxis2: { matches: 'x3' },
      xaxis3: { matches: 'x' },
    });
    expect(ax(loop3, 'xaxis3').matches).toBeUndefined();
    expect(loop3._axisMatchGroups).toEqual([{ x: 1, x2: 1, x3: 1 }]);
    const self = run({ xaxis: { matches: 'x' }, xaxis2: {} });
    expect(ax(self, 'xaxis').matches).toBeUndefined();
    expect(self._axisMatchGroups).toEqual([]);
  });

  it('rejects other axis types and unknown axes', () => {
    const fl = runIdempotent({
      xaxis: {},
      xaxis2: { type: 'log', matches: 'x' },
      xaxis3: { matches: 'x9' },
    });
    expect(ax(fl, 'xaxis2').matches).toBeUndefined();
    expect(ax(fl, 'xaxis3').matches).toBeUndefined();
    expect(fl._axisMatchGroups).toEqual([]);
  });

  it('links across letters with a prefixed domain ratio', () => {
    const fl = runIdempotent({
      xaxis: { domain: [0, 0.5] },
      yaxis: { matches: 'x' },
      yaxis2: { scaleanchor: 'y' },
    });
    expect(fl._axisMatchGroups).toEqual([{ y: 1, x: 1 }]);
    // y spans twice the domain of x: ratio 'y2' (times the plot aspect at draw time).
    expect(fl._axisConstraintGroups).toEqual([{ y: 'y2', x: 1, y2: 'y2' }]);
  });

  it('adds same-letter domain ratios to the constraint group', () => {
    const fl = runIdempotent({
      xaxis: { domain: [0, 0.25] },
      xaxis2: { domain: [0.5, 1], matches: 'x' },
      yaxis: { scaleanchor: 'x' },
    });
    expect(fl._axisConstraintGroups).toEqual([{ x2: 2, x: 1, y: 1 }]);
  });

  it('ignores template values', () => {
    const fl = runIdempotent({
      template: { layout: { xaxis: { matches: 'x', scaleanchor: 'y' } } },
      xaxis: {},
      xaxis2: {},
    });
    expect(ax(fl, 'xaxis2').matches).toBeUndefined();
    expect(ax(fl, 'xaxis').scaleanchor).toBeUndefined();
    expect(fl._axisMatchGroups).toEqual([]);
    expect(fl._axisConstraintGroups).toEqual([]);
  });
});

describe('scaleanchor', () => {
  it('builds constraint groups with scaleratio products', () => {
    const fl = runIdempotent({
      yaxis: { scaleanchor: 'x', scaleratio: 2 },
      xaxis2: { scaleanchor: 'y', scaleratio: 3 },
    });
    // px per unit: y = 2·x, x2 = 3·y = 6·x.
    expect(fl._axisConstraintGroups).toEqual([{ x2: 6, y: 2, x: 1 }]);
    expect(fl._axisMatchGroups).toEqual([]);
    expect(ax(fl, 'yaxis').scaleanchor).toBe('x');
  });

  it('treats scaleratio 0 as 1', () => {
    const fl = runIdempotent({ yaxis: { scaleanchor: 'x', scaleratio: 0 } });
    expect(ax(fl, 'yaxis').scaleratio).toBe(1);
    expect(fl._axisConstraintGroups).toEqual([{ y: 1, x: 1 }]);
  });

  it('drops the second of two conflicting anchors', () => {
    const fl = runIdempotent({ xaxis: { scaleanchor: 'y' }, yaxis: { scaleanchor: 'x' } });
    expect(ax(fl, 'xaxis').scaleanchor).toBe('y');
    expect(ax(fl, 'yaxis').scaleanchor).toBeUndefined();
    expect(fl._axisConstraintGroups).toEqual([{ x: 1, y: 1 }]);
  });

  it('merges two groups linked by a later anchor', () => {
    const fl = runIdempotent({
      xaxis: { scaleanchor: 'y' },
      xaxis2: { scaleanchor: 'y2', scaleratio: 2 },
      yaxis: {},
      yaxis2: { scaleanchor: 'x', scaleratio: 3 },
    });
    // y2 = 3·x; x2 = 2·y2 = 6·x.
    expect(fl._axisConstraintGroups).toEqual([{ x: 1, y: 1, x2: 6, y2: 3 }]);
  });

  it('is unset for false, unknown ids and together with matches', () => {
    const fl = runIdempotent({
      xaxis: {},
      xaxis2: { scaleanchor: false },
      xaxis3: { scaleanchor: 'y7' },
      yaxis: { matches: 'x', scaleanchor: 'x2' },
    });
    expect(ax(fl, 'xaxis2').scaleanchor).toBeUndefined();
    expect(ax(fl, 'xaxis3').scaleanchor).toBeUndefined();
    expect(ax(fl, 'yaxis').scaleanchor).toBeUndefined();
    expect(ax(fl, 'yaxis').matches).toBe('x');
    // Only the (dropped) pure-match constraint group.
    expect(fl._axisConstraintGroups).toEqual([]);
  });
});

describe('fixedrange', () => {
  it('fixes every axis of a constraint group', () => {
    const fl = runIdempotent({
      xaxis: { fixedrange: true },
      yaxis: { scaleanchor: 'x', fixedrange: false },
      xaxis2: { matches: 'x3' },
      xaxis3: { fixedrange: true },
      xaxis4: {},
    });
    expect(ax(fl, 'yaxis').fixedrange).toBe(true);
    expect(ax(fl, 'xaxis2').fixedrange).toBe(true);
    expect(ax(fl, 'xaxis4').fixedrange).toBe(false);
  });
});

describe('match group attribute sync', () => {
  it("syncs a member's explicit range and turns autorange off", () => {
    const fl = runIdempotent({ xaxis: {}, xaxis2: { matches: 'x', range: [0, 5] } });
    for (const key of ['xaxis', 'xaxis2']) {
      expect(ax(fl, key).range).toEqual([0, 5]);
      expect(ax(fl, key).autorange).toBe(false);
    }
    expect(ax(fl, 'xaxis').range).not.toBe(ax(fl, 'xaxis2').range);
  });

  it("prefers the root axis' value", () => {
    const fl = runIdempotent({
      xaxis: { range: [1, 2], rangemode: 'tozero' },
      xaxis2: { matches: 'x', range: [0, 5], rangemode: 'nonnegative' },
    });
    expect(ax(fl, 'xaxis2').range).toEqual([1, 2]);
    expect(ax(fl, 'xaxis2').rangemode).toBe('tozero');
  });

  it('keeps an explicitly set autorange', () => {
    const fl = runIdempotent({
      xaxis: { autorange: 'reversed' },
      xaxis2: { matches: 'x', range: [0, 5] },
    });
    expect(ax(fl, 'xaxis2').autorange).toBe('reversed');
    expect(ax(fl, 'xaxis').range).toEqual([0, 5]);
  });

  it("uses the root's full value when nobody sets one", () => {
    const fl = runIdempotent({
      xaxis: {},
      xaxis2: { matches: 'x', type: 'category', categoryarray: ['b', 'a'] },
      xaxis3: { matches: 'x', constrain: 'domain' },
    });
    // A categorical x2 cannot match the linear x.
    expect(ax(fl, 'xaxis2').matches).toBeUndefined();
    const cat = runIdempotent({
      xaxis: { type: 'category' },
      xaxis2: { matches: 'x', type: 'category', categoryarray: ['b', 'a'] },
      xaxis3: { matches: 'x', type: 'category', constrain: 'domain' },
    });
    for (const key of ['xaxis', 'xaxis2', 'xaxis3']) {
      expect(ax(cat, key).categoryarray).toEqual(['b', 'a']);
      // categoryorder: nobody set it → the root's full value.
      expect(ax(cat, key).categoryorder).toBe('trace');
      expect(ax(cat, key).constrain).toBe('domain');
      expect(ax(cat, key).autorange).toBe(true);
    }
    expect(ax(cat, 'xaxis').categoryarray).not.toBe(ax(cat, 'xaxis2').categoryarray);
  });

  it('syncs rangebreaks as copies', () => {
    const fl = runIdempotent({
      xaxis: { type: 'date' },
      xaxis2: { type: 'date', matches: 'x', rangebreaks: [{ bounds: ['sat', 'mon'] }] },
    });
    const breaks = ax(fl, 'xaxis').rangebreaks as { bounds?: unknown }[];
    expect(breaks).toHaveLength(1);
    expect(breaks[0]?.bounds).toEqual(['sat', 'mon']);
    expect(breaks).not.toBe(ax(fl, 'xaxis2').rangebreaks);
    expect(breaks[0]).not.toBe((ax(fl, 'xaxis2').rangebreaks as unknown[])[0]);
  });

  it('leaves unlinked axes alone', () => {
    const fl = runIdempotent({ xaxis: { range: [0, 1] }, xaxis2: {}, yaxis: { scaleanchor: 'x' } });
    expect(ax(fl, 'xaxis2').range).toBeUndefined();
    expect(ax(fl, 'yaxis').range).toBeUndefined();
    expect(ax(fl, 'yaxis').autorange).toBe(true);
  });
});

describe('constraint defaults: idempotence (property)', () => {
  it('feeding the full output back in reproduces it and its groups', () => {
    const ids = ['x', 'x2', 'x3', 'y', 'y2', 'y9', false, 'bad', 7] as const;
    const axisIn = fc.record(
      {
        type: fc.constantFrom('-', 'linear', 'log', 'category'),
        matches: fc.constantFrom(...ids),
        scaleanchor: fc.constantFrom(...ids),
        scaleratio: fc.constantFrom(0, 0.5, 2, 'x'),
        constrain: fc.constantFrom('range', 'domain', 'bad'),
        constraintoward: fc.constantFrom('left', 'top', 'middle', 'nope'),
        fixedrange: fc.boolean(),
        range: fc.constantFrom([0, 1], [null, 2], [3, null], 'bad'),
        autorange: fc.constantFrom(true, false, 'reversed', 'max'),
        rangemode: fc.constantFrom('normal', 'tozero'),
        domain: fc.constantFrom([0, 1], [0, 0.5], [0.5, 1]),
        categoryarray: fc.constantFrom(['a', 'b'], []),
      },
      { requiredKeys: [] },
    );
    const layout = fc.record(
      { xaxis: axisIn, xaxis2: axisIn, xaxis3: axisIn, yaxis: axisIn, yaxis2: axisIn },
      { requiredKeys: [] },
    );
    fc.assert(
      fc.property(layout, (l) => {
        runIdempotent(l);
      }),
      { numRuns: 300 },
    );
  });
});
