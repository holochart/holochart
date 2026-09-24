import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { supplyDefaults } from '../defaults/supply-defaults.ts';
import type { FullAxis } from '../defaults/types.ts';
import { stripInternal } from '../util/objects.ts';
import { validate } from '../validate/validate.ts';
import {
  makeSubplots,
  SUBPLOT_TITLE_NAME,
  type SubplotCell,
  type SubplotSpec,
} from './make-subplots.ts';

const close = (actual: unknown, expected: readonly number[]) => {
  const a = actual as number[];
  expect(a).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(a[i]).toBeCloseTo(v, 12));
};
const ax = (layout: Record<string, unknown>, key: string) =>
  layout[key] as { domain?: number[]; anchor?: string; overlaying?: string; side?: string };

describe('makeSubplots: layout', () => {
  it('defaults to one xy subplot filling the plot area', () => {
    const { layout, cells } = makeSubplots();
    expect(layout).toEqual({
      xaxis: { domain: [0, 1], anchor: 'y' },
      yaxis: { domain: [0, 1], anchor: 'x' },
    });
    expect(cells).toHaveLength(1);
    expect(cells[0]?.[0]).toMatchObject({ row: 1, col: 1, xaxis: 'x', yaxis: 'y' });
  });

  it("matches Python's domains for a 2×2 grid (spacing 0.2/cols, 0.3/rows, row 1 on top)", () => {
    const { layout } = makeSubplots({ rows: 2, cols: 2 });
    expect(Object.keys(layout)).toEqual([
      'xaxis',
      'xaxis2',
      'xaxis3',
      'xaxis4',
      'yaxis',
      'yaxis2',
      'yaxis3',
      'yaxis4',
    ]);
    close(ax(layout, 'xaxis').domain, [0, 0.45]);
    close(ax(layout, 'xaxis2').domain, [0.55, 1]);
    close(ax(layout, 'xaxis3').domain, [0, 0.45]);
    close(ax(layout, 'yaxis').domain, [0.575, 1]);
    close(ax(layout, 'yaxis3').domain, [0, 0.425]);
    expect(ax(layout, 'xaxis4').anchor).toBe('y4');
    expect(ax(layout, 'yaxis4').anchor).toBe('x4');
  });

  it("puts row 1 at the bottom with startCell 'bottom-left'", () => {
    const { layout } = makeSubplots({ rows: 2, startCell: 'bottom-left' });
    close(ax(layout, 'yaxis').domain, [0, 0.425]);
    close(ax(layout, 'yaxis2').domain, [0.575, 1]);
  });

  it('sizes rows and columns by relative weights and spacing', () => {
    const { layout } = makeSubplots({
      rows: 2,
      cols: 2,
      rowHeights: [3, 1],
      columnWidths: [1, 3],
      horizontalSpacing: 0,
      verticalSpacing: 0,
    });
    close(ax(layout, 'xaxis').domain, [0, 0.25]);
    close(ax(layout, 'xaxis2').domain, [0.25, 1]);
    close(ax(layout, 'yaxis').domain, [0.25, 1]);
    close(ax(layout, 'yaxis3').domain, [0, 0.25]);
  });

  it('spans and pads cells, and leaves null cells empty', () => {
    const { layout, cells } = makeSubplots({
      rows: 2,
      cols: 2,
      horizontalSpacing: 0.1,
      verticalSpacing: 0.1,
      specs: [
        [{ rowspan: 2 }, { l: 0.05 }],
        [null, null],
      ],
    });
    close(ax(layout, 'yaxis').domain, [0, 1]);
    close(ax(layout, 'xaxis2').domain, [0.6, 1]);
    expect(cells[1]).toEqual([null, null]);
    expect(Object.keys(layout)).toHaveLength(4);
  });

  it('builds domain cells without axes', () => {
    const { layout, cells } = makeSubplots({
      cols: 2,
      specs: [[{ type: 'domain' }, {}]],
    });
    expect(Object.keys(layout)).toEqual(['xaxis', 'yaxis']);
    close(ax(layout, 'xaxis').domain, [0.55, 1]);
    expect(cells[0]?.[0]).toMatchObject({ type: 'domain', domain: { x: [0, 0.45], y: [0, 1] } });
    expect(cells[0]?.[0]?.xaxis).toBeUndefined();
  });

  it('adds a secondary y axis overlaying the cell y axis on the right', () => {
    const { layout, cells } = makeSubplots({
      cols: 2,
      specs: [[{ secondaryY: true }, {}]],
    });
    expect(ax(layout, 'yaxis2')).toEqual({ anchor: 'x', overlaying: 'y', side: 'right' });
    // Python numbering: the secondary axis takes the next y id.
    expect(cells[0]?.[1]).toMatchObject({ xaxis: 'x2', yaxis: 'y3' });
  });

  it('adds subplot titles as paper annotations over each subplot', () => {
    const { layout } = makeSubplots({
      rows: 2,
      cols: 2,
      specs: [
        [{}, { rowspan: 2 }],
        [{}, null],
      ],
      subplotTitles: ['A', 'B', null],
    });
    const annotations = layout['annotations'] as Record<string, unknown>[];
    expect(annotations).toHaveLength(2);
    expect(annotations[0]).toMatchObject({
      text: 'A',
      xref: 'paper',
      yref: 'paper',
      xanchor: 'center',
      yanchor: 'bottom',
      showarrow: false,
      name: SUBPLOT_TITLE_NAME,
    });
    // The size follows layout.font (the annotations component applies the 4/3 scale).
    expect(annotations[0]?.['font']).toBeUndefined();
    expect(annotations[0]?.['x']).toBeCloseTo(0.225, 12);
    expect(annotations[0]?.['y']).toBe(1);
    expect(annotations[1]).toMatchObject({ text: 'B', x: 0.775, y: 1 });
    expect(makeSubplots({ subplotTitles: [''] }).layout['annotations']).toBeUndefined();
  });
});

describe('makeSubplots: shared axes (one axis instead of matches)', () => {
  it('sharedX: one x axis per column, anchored to the bottom row', () => {
    const { layout, cells } = makeSubplots({ rows: 2, cols: 2, sharedX: true });
    const ids = cells.flat().map((c) => `${c?.xaxis}${c?.yaxis}`);
    expect(ids).toEqual(['xy', 'x2y2', 'xy3', 'x2y4']);
    expect(ax(layout, 'xaxis')).toMatchObject({ anchor: 'y3' });
    expect(ax(layout, 'xaxis2')).toMatchObject({ anchor: 'y4' });
    expect(layout['xaxis3']).toBeUndefined();
    expect(ax(layout, 'yaxis3').anchor).toBe('x');
  });

  it("sharedX with startCell 'bottom-left' anchors to the bottom row (row 1)", () => {
    const { layout } = makeSubplots({ rows: 2, sharedX: 'columns', startCell: 'bottom-left' });
    expect(ax(layout, 'xaxis').anchor).toBe('y');
  });

  it('sharedY: one y axis per row, anchored to the left column', () => {
    const { layout, cells } = makeSubplots({ rows: 2, cols: 2, sharedY: true });
    const ids = cells.flat().map((c) => `${c?.xaxis}${c?.yaxis}`);
    expect(ids).toEqual(['xy', 'x2y', 'x3y2', 'x4y2']);
    expect(ax(layout, 'yaxis')).toMatchObject({ anchor: 'x' });
    expect(ax(layout, 'yaxis2')).toMatchObject({ anchor: 'x3' });
  });

  it('shares both ways', () => {
    const { layout, cells } = makeSubplots({ rows: 2, cols: 2, sharedX: true, sharedY: true });
    const ids = cells.flat().map((c) => `${c?.xaxis}${c?.yaxis}`);
    expect(ids).toEqual(['xy', 'x2y', 'xy2', 'x2y2']);
    expect(ax(layout, 'xaxis').anchor).toBe('y2');
    expect(ax(layout, 'yaxis2').anchor).toBe('x');
  });

  it("'all' works when every cell has the same extent", () => {
    const { cells } = makeSubplots({ rows: 3, sharedX: 'all' });
    expect(new Set(cells.flat().map((c) => c?.xaxis))).toEqual(new Set(['x']));
  });

  it('a spanning cell in a shared column keeps its own axis', () => {
    const { cells } = makeSubplots({
      rows: 2,
      cols: 2,
      sharedX: true,
      specs: [
        [{ colspan: 2 }, null],
        [{}, {}],
      ],
    });
    expect(cells.flat().map((c) => c?.xaxis)).toEqual(['x', undefined, 'x2', 'x3']);
  });

  it('throws when sharing needs linked axes (E3.9)', () => {
    expect(() => makeSubplots({ cols: 2, sharedX: 'rows' })).toThrow(/matches.*E3\.9/);
    expect(() => makeSubplots({ rows: 2, cols: 2, sharedX: 'all' })).toThrow(/different x extents/);
    expect(() => makeSubplots({ rows: 2, sharedY: 'columns' })).toThrow(/different y extents/);
    expect(() => makeSubplots({ sharedX: 'yes' as unknown as boolean })).toThrow(/sharedX must be/);
  });
});

describe('makeSubplots: place', () => {
  const sp = makeSubplots({
    rows: 2,
    cols: 2,
    specs: [
      [{ secondaryY: true }, { type: 'domain' }],
      [{ colspan: 2 }, null],
    ],
  });

  it('points xy traces at the cell axes, returning a copy', () => {
    const trace = { type: 'scatter', y: [1, 2] };
    const placed = sp.place(trace, 2, 1);
    expect(placed).toEqual({ type: 'scatter', y: [1, 2], xaxis: 'x2', yaxis: 'y3' });
    expect(trace).toEqual({ type: 'scatter', y: [1, 2] });
    expect(sp.place(trace, 1, 1, { secondaryY: true })).toMatchObject({ xaxis: 'x', yaxis: 'y2' });
  });

  it('sets domain x/y for domain cells, keeping other domain fields', () => {
    const trace = { type: 'pie', values: [1], domain: { row: 3 } };
    const placed = sp.place(trace, 1, 2);
    expect(placed.domain).toMatchObject({ row: 3 });
    close(placed.domain?.x, [0.55, 1]);
    close(placed.domain?.y, [0.575, 1]);
    expect(trace.domain).toEqual({ row: 3 });
  });

  it('explains bad placements', () => {
    expect(() => sp.place({}, 3, 1)).toThrow(/row must be an integer from 1 to 2/);
    expect(() => sp.place({}, 1, 0)).toThrow(/col must be an integer from 1 to 2/);
    expect(() => sp.place({}, 2, 2)).toThrow(
      /covered by the span of the subplot at \(row, col\) = \(2, 1\)/,
    );
    expect(() => sp.place({}, 2, 1, { secondaryY: true })).toThrow(/no secondary y axis/);
    expect(() => sp.place({}, 1, 2, { secondaryY: true })).toThrow(/'domain' subplot/);
    const empty = makeSubplots({ cols: 2, specs: [[{}, null]] });
    expect(() => empty.place({}, 1, 2)).toThrow(/is empty/);
  });
});

describe('makeSubplots: validation', () => {
  it.each([
    [{ rows: 0 }, /rows must be a positive integer/],
    [{ cols: 1.5 }, /cols must be a positive integer/],
    [{ rows: 2, specs: [[{}]] }, /specs must be an array of 2 row/],
    [{ cols: 2, specs: [[{}]] }, /specs\[0\] must be an array of 2 cell/],
    [{ cols: 2, specs: [[{ colspan: 3 }, null]] }, /colspan 3 runs past column 2/],
    [{ rows: 2, specs: [[{ rowspan: 3 }], [null]] }, /rowspan 3 runs past row 2/],
    [{ cols: 2, specs: [[{ colspan: 2 }, {}]] }, /which has its own spec/],
    [{ rows: 2, cols: 2, rowHeights: [1] }, /rowHeights must have one entry per row \(2\)/],
    [{ cols: 2, columnWidths: [1, -1] }, /positive numbers/],
    [{ cols: 3, horizontalSpacing: 0.5 }, /horizontalSpacing must be below/],
    [{ specs: [[{ l: 0.6, r: 0.6 }]] }, /padding leaves no room/],
    [{ subplotTitles: ['a', 'b'] }, /2 titles for 1 subplot/],
    [{ specs: [[{ type: 'domain', secondaryY: true }]] }, /secondaryY needs an 'xy' subplot/],
    [{ startCell: 'top-right' }, /startCell must be/],
  ] as [object, RegExp][])('rejects %j', (options, message) => {
    expect(() => makeSubplots(options)).toThrow(message);
  });

  it.each([
    ['scene', /not supported until milestone M6 \(3D scenes, plan E14\.1\)/],
    ['polar', /milestone M4 \(polar subplots, plan E11\.4\)/],
    ['ternary', /plan E11\.6/],
    ['geo', /plan E15\.1/],
    ['mapbox', /plan E15\.5/],
    ['smith', /not in the plan/],
    ['bogus', /unknown subplot type 'bogus'/],
  ])("explains why type '%s' is not available", (type, message) => {
    const specs = [[{ type } as unknown as SubplotSpec]];
    expect(() => makeSubplots({ specs })).toThrow(message);
  });

  it('rejects overlapping spans', () => {
    expect(() =>
      makeSubplots({
        rows: 2,
        cols: 2,
        specs: [
          [{ rowspan: 2 }, null],
          [{}, null],
        ],
      }),
    ).toThrow(/has its own spec/);
  });
});

describe('makeSubplots: properties', () => {
  const options = fc.record({
    rows: fc.integer({ min: 1, max: 4 }),
    cols: fc.integer({ min: 1, max: 4 }),
    sharedX: fc.constantFrom(false, true, 'columns' as const),
    sharedY: fc.constantFrom(false, true, 'rows' as const),
    startCell: fc.constantFrom('top-left' as const, 'bottom-left' as const),
    secondary: fc.boolean(),
  });

  const specsFor = (rows: number, cols: number, secondary: boolean) =>
    Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({ secondaryY: secondary && (r + c) % 2 === 0 })),
    );

  it('cells lie inside the plot area and never overlap', () => {
    fc.assert(
      fc.property(options, ({ rows, cols, sharedX, sharedY, startCell, secondary }) => {
        const { cells } = makeSubplots({
          rows,
          cols,
          sharedX,
          sharedY,
          startCell,
          specs: specsFor(rows, cols, secondary),
        });
        const all = cells.flat().filter((c): c is SubplotCell => c !== null);
        expect(all).toHaveLength(rows * cols);
        for (const a of all) {
          for (const d of [a.domain.x, a.domain.y]) {
            expect(d[0]).toBeGreaterThanOrEqual(0);
            expect(d[1]).toBeLessThanOrEqual(1);
            expect(d[0]).toBeLessThan(d[1]);
          }
          for (const b of all) {
            if (a === b) continue;
            const apart =
              a.domain.x[1] <= b.domain.x[0] ||
              b.domain.x[1] <= a.domain.x[0] ||
              a.domain.y[1] <= b.domain.y[0] ||
              b.domain.y[1] <= a.domain.y[0];
            expect(apart).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('gives a figure whose defaults keep the layout, validate, and are a fixed point', () => {
    const registry = fixtureRegistry();
    const quiet = { onIssue: () => {} };
    fc.assert(
      fc.property(options, ({ rows, cols, sharedX, sharedY, startCell, secondary }) => {
        const sp = makeSubplots({
          rows,
          cols,
          sharedX,
          sharedY,
          startCell,
          specs: specsFor(rows, cols, secondary),
          subplotTitles: Array.from({ length: rows * cols }, (_, i) => `P${i}`),
        });
        const data = sp.cells
          .flat()
          .flatMap((c) =>
            c === null
              ? []
              : [
                  sp.place({ type: 'scatter', y: [1, 2] }, c.row, c.col),
                  ...(c.secondaryYaxis
                    ? [sp.place({ type: 'bar', y: [3] }, c.row, c.col, { secondaryY: true })]
                    : []),
                ],
          );
        const first = supplyDefaults({ data, layout: sp.layout }, registry, quiet);
        for (const [key, value] of Object.entries(sp.layout)) {
          if (key === 'annotations') continue;
          const full = first.fullLayout[key] as FullAxis;
          const given = value as { domain?: number[]; anchor?: string; overlaying?: string };
          expect(full.anchor).toBe(given.anchor);
          if (given.overlaying !== undefined) {
            expect(full.overlaying).toBe(given.overlaying);
            const base = first.fullLayout[`yaxis${given.overlaying.slice(1)}`] as FullAxis;
            expect(full.domain).toEqual(base.domain);
          } else {
            expect(full.domain).toEqual(given.domain);
          }
        }
        const layout = stripInternal(first.fullLayout);
        expect(validate(stripInternal(first.fullData), layout, registry)).toEqual([]);
        const again = supplyDefaults(
          { data: stripInternal(first.fullData) as unknown[], layout },
          registry,
          quiet,
        );
        expect(stripInternal(again.fullLayout)).toEqual(layout);
      }),
      { numRuns: 100 },
    );
  });
});
