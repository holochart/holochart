import { A11Y_PATTERN_SHAPES, supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bar } from '../bar/index.ts';
import { pie } from '../pie/index.ts';
import { scatter } from '../scatter/index.ts';

/**
 * `config.a11y.patterns` (plan E17.5): a distinct pattern per trace (per slice for pies) as an
 * encoding redundant with color, unless the trace or its template sets one.
 */
const registry = createChartRegistry().register(bar, pie, scatter);

function defaults(data: unknown[], layout: Record<string, unknown> = {}, patterns = true) {
  return supplyDefaults({ data, layout, config: { a11y: { patterns } } }, registry.core).fullData;
}

const shape = (t: Record<string, unknown>, path = 'marker'): unknown =>
  (t[path] as { pattern?: { shape?: unknown } } | undefined)?.pattern?.shape;

describe('a11y patterns', () => {
  it('gives bars and filled areas one shape each, in order, overlaid on their color', () => {
    const full = defaults([
      { type: 'bar', y: [1, 2] },
      { type: 'scatter', y: [1, 2] },
      { type: 'bar', y: [1, 2] },
      { type: 'scatter', y: [1, 2], fill: 'tozeroy' },
      { type: 'scatter', y: [1, 2], stackgroup: 'a' },
    ]);
    expect(shape(full[0]!)).toBe(A11Y_PATTERN_SHAPES[0]);
    expect(full[0]!['marker']).toMatchObject({ pattern: { fillmode: 'overlay' } });
    // Unfilled scatter traces have no area to pattern and take no shape.
    expect(full[1]!['fillpattern']).toBeUndefined();
    expect(shape(full[2]!)).toBe(A11Y_PATTERN_SHAPES[1]);
    expect((full[3]!['fillpattern'] as { shape: string }).shape).toBe(A11Y_PATTERN_SHAPES[2]);
    expect((full[4]!['fillpattern'] as { shape: string }).shape).toBe(A11Y_PATTERN_SHAPES[3]);
  });

  it('gives pie slices one shape each, by input index', () => {
    const [p] = defaults([{ type: 'pie', labels: ['a', 'b', 'c'], values: [3, 2, 1] }]);
    expect(shape(p!)).toEqual(A11Y_PATTERN_SHAPES.slice(0, 3));
  });

  it("keeps the trace's and the template's own pattern, and is off by default", () => {
    const full = defaults(
      [
        { type: 'bar', y: [1], marker: { pattern: { shape: '' } } },
        { type: 'bar', y: [1], marker: { pattern: { shape: '+' } } },
        { type: 'bar', y: [1] },
      ],
      { template: { data: { bar: [{}, {}, { marker: { pattern: { shape: '|' } } }] } } },
    );
    expect(full.map((t) => shape(t))).toEqual(['', '+', '|']);
    expect(shape(defaults([{ type: 'bar', y: [1] }], {}, false)[0]!)).toBeUndefined();
  });

  it('hands out distinct shapes to neighbouring traces (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), (n) => {
        const full = defaults(Array.from({ length: n }, () => ({ type: 'bar', y: [1] })));
        const shapes = full.map((t) => shape(t));
        for (let i = 1; i < n; i++) expect(shapes[i]).not.toBe(shapes[i - 1]);
        const distinct = new Set(shapes.slice(0, A11Y_PATTERN_SHAPES.length));
        expect(distinct.size).toBe(Math.min(n, A11Y_PATTERN_SHAPES.length));
      }),
      { numRuns: 20 },
    );
  });
});
