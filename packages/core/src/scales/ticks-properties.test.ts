import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { FullAxis } from '../defaults/types.ts';
import { createScale } from './scale.ts';
import { computeTicks, expandRange } from './ticks.ts';
import type { AxisType, Tick } from './types.ts';

const RANGES: Record<Exclude<AxisType, 'multicategory'>, [number, number]> = {
  linear: [-1e12, 1e12],
  log: [-300, 300],
  // Years ~ -2000 … 9000: inside what Date and the ISO formatter handle.
  date: [-1.3e14, 2.2e14],
  category: [-5, 60],
};

const arbCase = fc
  .record({
    type: fc.constantFrom('linear', 'log', 'date', 'category'),
    a: fc.double({ min: 0, max: 1, noNaN: true }),
    b: fc.double({ min: 0, max: 1, noNaN: true }),
    span: fc.double({ min: -15, max: 0, noNaN: true }),
    length: fc.double({ min: 0, max: 5000, noNaN: true }),
    nticks: fc.integer({ min: 0, max: 60 }),
    ncat: fc.integer({ min: 0, max: 50 }),
    id: fc.constantFrom('x', 'y'),
    minor: fc.boolean(),
    period: fc.boolean(),
    step: fc.integer({ min: 1, max: 4 }),
  })
  .map((c) => {
    const [lo, hi] = RANGES[c.type as keyof typeof RANGES];
    // Mix huge and tiny spans: `span` scales the second end towards the first.
    const r0 = lo + c.a * (hi - lo);
    const r1 = r0 + (c.b - 0.5) * (hi - lo) * 10 ** c.span;
    return { ...c, range: [r0, r1] as [number, number] };
  });

type Case = typeof arbCase extends fc.Arbitrary<infer T> ? T : never;

function run(c: Case): Tick[] {
  const s = createScale({
    type: c.type as AxisType,
    range: c.range,
    length: c.length,
    categories: Array.from({ length: c.ncat }, (_, i) => `c${i}`),
  });
  const axis = {
    _id: c.id,
    nticks: c.nticks,
    ticklabelmode: c.period ? 'period' : 'instant',
    ticklabelstep: c.step,
    minor: c.minor ? { ticks: 'outside' } : {},
  } as unknown as FullAxis;
  return computeTicks(s, axis);
}

function monotonic(v: readonly number[], rev: boolean): boolean {
  for (let i = 1; i < v.length; i++) {
    const d = (v[i] as number) - (v[i - 1] as number);
    if (rev ? d >= 0 : d <= 0) return false;
  }
  return true;
}

describe('computeTicks properties', () => {
  it('gives sorted, bounded, in-range ticks for any finite range', () => {
    fc.assert(
      fc.property(arbCase, (c) => {
        const t = run(c);
        const [r0, r1] = c.range;
        const rev = r1 < r0;
        const [e0, e1] = expandRange(c.range);
        const lo = Math.min(e0, e1);
        const hi = Math.max(e0, e1);
        const maxTicks = Math.max(1000, c.length);
        const ulps = 4 * Number.EPSILON * Math.max(Math.abs(lo), Math.abs(hi));
        const major = t.filter((x) => x.minor !== true);
        const minor = t.filter((x) => x.minor === true);
        // Majors first, then minors.
        expect(t.slice(0, major.length).every((x) => x.minor !== true)).toBe(true);
        expect(major.length).toBeLessThanOrEqual(maxTicks + 2);
        expect(minor.length).toBeLessThanOrEqual(maxTicks + 1);
        expect(
          monotonic(
            major.map((x) => x.l),
            rev,
          ),
        ).toBe(true);
        expect(
          monotonic(
            minor.map((x) => x.l),
            rev,
          ),
        ).toBe(true);
        for (const x of t) {
          expect(Number.isFinite(x.l)).toBe(true);
          expect(typeof x.text).toBe('string');
          // Only the label-only leading period tick may sit before the range.
          // (Within a few ulps: ranges only a few ulps wide round either way.)
          if (x.noTick !== true) {
            expect(x.l).toBeGreaterThanOrEqual(lo - ulps);
            expect(x.l).toBeLessThanOrEqual(hi + ulps);
          }
          if (x.labelL !== undefined) {
            expect(x.labelL).toBeGreaterThanOrEqual(Math.min(r0, r1));
            expect(x.labelL).toBeLessThanOrEqual(Math.max(r0, r1));
          }
        }
        expect(major.filter((x) => x.noTick === true).length).toBeLessThanOrEqual(1);
      }),
      { numRuns: 400 },
    );
  });

  it('is deterministic and does not mutate the axis', () => {
    fc.assert(
      fc.property(arbCase, (c) => {
        expect(run(c)).toEqual(run(c));
      }),
      { numRuns: 50 },
    );
    const axis = { _id: 'x', minor: { ticks: 'outside' }, ticklabelmode: 'period' };
    const copy = structuredClone(axis);
    computeTicks(
      createScale({ type: 'date', range: [0, 1e11], length: 500 }),
      axis as unknown as FullAxis,
    );
    expect(axis).toEqual(copy);
  });
});
