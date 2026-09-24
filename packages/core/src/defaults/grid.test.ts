import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureRegistry, scatter } from '../__fixtures__/modules.ts';
import { createRegistry } from '../registry/registry.ts';
import type { TraceModule } from '../registry/types.ts';
import { attr } from '../schema/attr.ts';
import { stripInternal } from '../util/objects.ts';
import { validate } from '../validate/validate.ts';
import { gridCellExtents } from './grid.ts';
import { supplyDefaults } from './supply-defaults.ts';
import type { FigureInput, FullAxis, FullLayout } from './types.ts';

const quiet = { onIssue: () => {} };

/** A tiny domain trace (pie-like): placed by `domain`, no axes. */
const donut: TraceModule = {
  type: 'donut',
  categories: ['domain'],
  schema: attr.object({ values: attr.dataArray({ editType: 'calc' }) }),
  meta: { description: 'Test domain trace.' },
  supplyDefaults(_in, _out, ctx) {
    ctx.coerce('values');
  },
};

const registry = () => fixtureRegistry().register(donut);
const run = (figure: FigureInput) => supplyDefaults(figure, registry(), quiet);
const axis = (fl: FullLayout, key: string) => fl[key] as FullAxis;

/** Scatter traces on the given `[xaxis, yaxis]` pairs. */
const on = (...pairs: [string, string][]) =>
  pairs.map(([xaxis, yaxis]) => ({ type: 'scatter', xaxis, yaxis, y: [1, 2] }));

const close = (actual: readonly number[] | undefined, expected: readonly number[]) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual?.[i]).toBeCloseTo(v, 12));
};

// 2 cells, gap 0.1: step = 1 / 1.9, cell = 0.9 / 1.9.
const LO: [number, number] = [0, 0.9 / 1.9];
const HI: [number, number] = [1 / 1.9, 1];

describe('gridCellExtents', () => {
  it('splits the domain into equal cells separated by gap × step', () => {
    const cells = gridCellExtents([0, 1], 0.1, 2);
    close(cells[0], LO);
    close(cells[1], HI);
  });

  it('reverses the order (row 0 on top) when asked', () => {
    const cells = gridCellExtents([0, 1], 0.1, 2, true);
    close(cells[0], HI);
    close(cells[1], LO);
  });

  it('gives one cell the whole domain, whatever the gap', () => {
    expect(gridCellExtents([0.2, 0.8], 1, 1)).toEqual([[0.2, 0.8]]);
  });

  it('property: cells lie inside the domain, in order, without overlap when gap > 0', () => {
    const domain = fc
      .tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }))
      .filter(([a, b]) => b - a > 1e-6)
      .map(([a, b]) => [a, b] as [number, number]);
    fc.assert(
      fc.property(
        domain,
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        fc.integer({ min: 1, max: 40 }),
        fc.boolean(),
        ([d0, d1], gap, len, reversed) => {
          const cells = gridCellExtents([d0, d1], gap, len, reversed);
          expect(cells).toHaveLength(len);
          const ordered = reversed ? [...cells].reverse() : cells;
          ordered.forEach(([a, b], i) => {
            expect(a).toBeGreaterThanOrEqual(d0);
            expect(b).toBeLessThanOrEqual(d1);
            expect(a).toBeLessThanOrEqual(b);
            const next = ordered[i + 1];
            if (next) expect(b).toBeLessThan(next[0]);
          });
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('layout.grid sizing', () => {
  it('makes no grid without layout.grid, or with a single cell', () => {
    expect(run({ data: on(['x', 'y']) }).fullLayout.grid).toBeUndefined();
    expect(run({ layout: { grid: { rows: 1, columns: 1 } } }).fullLayout.grid).toBeUndefined();
    expect(run({ layout: { grid: { rows: 2 } } }).fullLayout.grid).toBeUndefined();
    expect(run({ layout: { grid: {} } }).fullLayout.grid).toBeUndefined();
  });

  it('ignores a grid that only a template defines', () => {
    const { fullLayout } = run({
      layout: { template: { layout: { grid: { rows: 2, columns: 2 } } } },
    });
    expect(fullLayout.grid).toBeUndefined();
  });

  it('coerces a coupled grid with 0.1 gaps and row 0 on top', () => {
    const { grid } = run({ layout: { grid: { rows: 2, columns: 2 } } }).fullLayout;
    expect(stripInternal(grid)).toEqual({
      rows: 2,
      columns: 2,
      roworder: 'top to bottom',
      pattern: 'coupled',
      xgap: 0.1,
      ygap: 0.1,
      domain: { x: [0, 1], y: [0, 1] },
      xside: 'bottom plot',
      yside: 'left plot',
      // An empty figure shows the blank 'xy' subplot; nothing fills the other column/row.
      xaxes: ['x', ''],
      yaxes: ['y', ''],
    });
    expect(grid?._hasSubplotGrid).toBe(false);
    close(grid?._domains.x[0], LO);
    close(grid?._domains.x[1], HI);
    close(grid?._domains.y[0], HI);
    close(grid?._domains.y[1], LO);
  });

  it('puts row 0 at the bottom with roworder bottom to top', () => {
    const { grid } = run({
      layout: { grid: { rows: 2, columns: 1, roworder: 'bottom to top' } },
    }).fullLayout;
    close(grid?._domains.y[0], LO);
    close(grid?._domains.y[1], HI);
  });

  it('defaults the gaps to 0.2 / 0.3 for a grid of independent subplots', () => {
    const independent = run({ layout: { grid: { rows: 2, columns: 2, pattern: 'independent' } } });
    expect(independent.fullLayout.grid).toMatchObject({ xgap: 0.2, ygap: 0.3 });
    expect(independent.fullLayout.grid?._hasSubplotGrid).toBe(true);
    const subplots = run({ layout: { grid: { subplots: [['xy', 'x2y2']] } } });
    expect(subplots.fullLayout.grid).toMatchObject({ rows: 1, columns: 2, xgap: 0.2, ygap: 0.3 });
    const given = run({ layout: { grid: { rows: 2, columns: 2, xgap: 0.5, ygap: 0 } } });
    expect(given.fullLayout.grid).toMatchObject({ xgap: 0.5, ygap: 0 });
  });

  it('defaults rows and columns to the lengths of subplots or xaxes/yaxes', () => {
    const fromSubplots = run({
      layout: {
        grid: {
          subplots: [
            ['xy', ''],
            ['', 'x2y2'],
            ['', ''],
          ],
        },
      },
    });
    expect(fromSubplots.fullLayout.grid).toMatchObject({ rows: 3, columns: 2 });
    const fromAxes = run({ layout: { grid: { xaxes: ['x', 'x2', 'x3'], yaxes: ['y'] } } });
    expect(fromAxes.fullLayout.grid).toMatchObject({ rows: 1, columns: 3 });
    const explicit = run({ layout: { grid: { rows: 2, xaxes: ['x', 'x2', 'x3'] } } });
    expect(explicit.fullLayout.grid).toMatchObject({ rows: 2, columns: 3 });
  });

  it('places the cells inside grid.domain, and falls back to [0, 1] for a reversed one', () => {
    const { grid } = run({
      layout: { grid: { rows: 1, columns: 2, xgap: 0, domain: { x: [0.5, 1], y: [0.2, 0.4] } } },
    }).fullLayout;
    close(grid?._domains.x[0], [0.5, 0.75]);
    close(grid?._domains.x[1], [0.75, 1]);
    close(grid?._domains.y[0], [0.2, 0.4]);
    const reversed = run({ layout: { grid: { rows: 1, columns: 2, domain: { x: [0.8, 0.2] } } } });
    expect(reversed.fullLayout.grid?.domain.x).toEqual([0, 1]);
  });

  it('rejects more than 100 rows or columns', () => {
    expect(run({ layout: { grid: { rows: 101, columns: 2 } } }).fullLayout.grid).toBeUndefined();
  });
});

describe('layout.grid axis placement', () => {
  const coupledData = on(['x', 'y'], ['x2', 'y'], ['x', 'y2'], ['x2', 'y2']);

  it('coupled: one x axis per column and one y axis per row, anchored to the outer plots', () => {
    const { fullLayout } = run({ data: coupledData, layout: { grid: { rows: 2, columns: 2 } } });
    expect(fullLayout.grid).toMatchObject({ xaxes: ['x', 'x2'], yaxes: ['y', 'y2'] });
    close(axis(fullLayout, 'xaxis').domain, LO);
    close(axis(fullLayout, 'xaxis2').domain, HI);
    close(axis(fullLayout, 'yaxis').domain, HI);
    close(axis(fullLayout, 'yaxis2').domain, LO);
    // x axes sit under the bottom row (y2), y axes left of the left column (x).
    expect(axis(fullLayout, 'xaxis')).toMatchObject({ anchor: 'y2', side: 'bottom' });
    expect(axis(fullLayout, 'xaxis2')).toMatchObject({ anchor: 'y2', side: 'bottom' });
    expect(axis(fullLayout, 'yaxis')).toMatchObject({ anchor: 'x', side: 'left' });
    expect(axis(fullLayout, 'yaxis2')).toMatchObject({ anchor: 'x', side: 'left' });
    expect(fullLayout.grid?._axisMap).toEqual({ x: 0, x2: 1, y: 0, y2: 1 });
  });

  it('coupled: only existing axes fill the columns, each once', () => {
    const { fullLayout } = run({
      data: on(['x', 'y']),
      layout: { grid: { rows: 2, columns: 2 } },
    });
    expect(fullLayout.grid).toMatchObject({ xaxes: ['x', ''], yaxes: ['y', ''] });
    const reused = run({
      data: on(['x', 'y'], ['x2', 'y']),
      layout: { grid: { xaxes: ['x2', 'x2', 'x'], yaxes: ['y'] } },
    });
    expect(reused.fullLayout.grid).toMatchObject({ xaxes: ['x2', '', 'x'] });
  });

  it('coupled: anchors skip rows without a subplot in that column', () => {
    // Column 2 has no subplot in the bottom row (y2): its x axis anchors to y.
    const { fullLayout } = run({
      data: on(['x', 'y'], ['x2', 'y'], ['x', 'y2']),
      layout: { grid: { rows: 2, columns: 2 } },
    });
    expect(axis(fullLayout, 'xaxis').anchor).toBe('y2');
    expect(axis(fullLayout, 'xaxis2').anchor).toBe('y');
  });

  it('independent: one subplot per cell, row-major', () => {
    const { fullLayout } = run({
      data: on(['x', 'y'], ['x2', 'y2'], ['x3', 'y3']),
      layout: { grid: { rows: 2, columns: 2, pattern: 'independent' } },
    });
    expect(fullLayout.grid?.subplots).toEqual([
      ['xy', 'x2y2'],
      ['x3y3', ''],
    ]);
    expect(fullLayout.grid?.xaxes).toBeUndefined();
    const cols = gridCellExtents([0, 1], 0.2, 2);
    const rows = gridCellExtents([0, 1], 0.3, 2, true);
    close(axis(fullLayout, 'xaxis2').domain, cols[1] as [number, number]);
    close(axis(fullLayout, 'yaxis3').domain, rows[1] as [number, number]);
    expect(axis(fullLayout, 'xaxis2').anchor).toBe('y2');
    expect(axis(fullLayout, 'yaxis3').anchor).toBe('x3');
  });

  it('subplots: drops a subplot whose axis already sits in another column or row', () => {
    const { fullLayout } = run({
      data: on(['x', 'y'], ['x2', 'y'], ['x2', 'y2']),
      layout: {
        grid: {
          subplots: [
            ['xy', 'x2y'],
            ['x2y2', 'nope'],
          ],
        },
      },
    });
    expect(fullLayout.grid?.subplots).toEqual([
      ['xy', 'x2y'],
      ['', ''],
    ]);
    expect(fullLayout.grid?._axisMap).toEqual({ x: 0, y: 0, x2: 1 });
    // y2 is not in the grid: it keeps the plain defaults.
    expect(axis(fullLayout, 'yaxis2')).toMatchObject({ domain: [0, 1], anchor: 'x2' });
  });

  it.each([
    ['bottom', 'free', 'bottom', 0.1],
    ['top', 'free', 'top', 0.9],
    ['bottom plot', 'y2', 'bottom', 0],
    ['top plot', 'y', 'top', 0],
  ] as const)('xside %s → anchor %s, side %s', (xside, anchor, side, position) => {
    const { fullLayout } = run({
      data: coupledData,
      layout: { grid: { rows: 2, columns: 2, xside, domain: { y: [0.1, 0.9] } } },
    });
    expect(axis(fullLayout, 'xaxis')).toMatchObject({ anchor, side });
    if (anchor === 'free') expect(axis(fullLayout, 'xaxis').position).toBeCloseTo(position, 12);
  });

  it.each([
    ['left', 'free', 'left', 0.2],
    ['right', 'free', 'right', 0.6],
    ['left plot', 'x', 'left', 0],
    ['right plot', 'x2', 'right', 0],
  ] as const)('yside %s → anchor %s, side %s', (yside, anchor, side, position) => {
    const { fullLayout } = run({
      data: coupledData,
      layout: { grid: { rows: 2, columns: 2, yside, domain: { x: [0.2, 0.6] } } },
    });
    expect(axis(fullLayout, 'yaxis2')).toMatchObject({ anchor, side });
    if (anchor === 'free') expect(axis(fullLayout, 'yaxis2').position).toBeCloseTo(position, 12);
  });

  it('roworder bottom to top: bottom plot anchors to row 0', () => {
    const { fullLayout } = run({
      data: coupledData,
      layout: { grid: { rows: 2, columns: 2, roworder: 'bottom to top' } },
    });
    expect(axis(fullLayout, 'xaxis').anchor).toBe('y');
    close(axis(fullLayout, 'yaxis').domain, LO);
  });

  it('values on the axis win over grid defaults', () => {
    const { fullLayout } = run({
      data: coupledData,
      layout: {
        grid: { rows: 2, columns: 2 },
        xaxis: { domain: [0, 0.3], anchor: 'y', side: 'top' },
        yaxis2: { position: 0.5, anchor: 'free' },
      },
    });
    expect(axis(fullLayout, 'xaxis')).toMatchObject({ domain: [0, 0.3], anchor: 'y', side: 'top' });
    expect(axis(fullLayout, 'yaxis2')).toMatchObject({ anchor: 'free', position: 0.5 });
    close(axis(fullLayout, 'yaxis2').domain, LO);
  });

  it('axes outside the grid keep their plain defaults', () => {
    const { fullLayout } = run({
      data: on(['x', 'y'], ['x3', 'y3']),
      layout: { grid: { rows: 1, columns: 2 } },
    });
    expect(axis(fullLayout, 'xaxis3')).toMatchObject({ domain: [0, 1], anchor: 'y3' });
    expect(axis(fullLayout, 'yaxis3')).toMatchObject({ domain: [0, 1], anchor: 'x3' });
  });
});

describe('domain traces in a grid (E4.5)', () => {
  it('take the extent of their grid cell', () => {
    const { fullData, fullLayout } = run({
      data: [
        { type: 'donut', values: [1, 2], domain: { row: 1, column: 1 } },
        { type: 'donut', values: [1, 2], domain: { row: 0, column: 0, x: [0, 0.2] } },
      ],
      layout: { grid: { rows: 2, columns: 2 } },
    });
    const [a, b] = fullData.map((t) => t['domain'] as { x: number[]; y: number[] });
    close(a?.x, fullLayout.grid?._domains.x[1] as number[]);
    close(a?.y, fullLayout.grid?._domains.y[1] as number[]);
    expect(b?.x).toEqual([0, 0.2]);
    close(b?.y, fullLayout.grid?._domains.y[0] as number[]);
  });

  it('ignore row/column outside the grid, or without one', () => {
    const outside = run({
      data: [{ type: 'donut', values: [1], domain: { row: 5, column: 1 } }],
      layout: { grid: { rows: 2, columns: 2 } },
    });
    const d = outside.fullData[0]?.['domain'] as Record<string, unknown>;
    // Kept (so the output is a fixed point) but ignored: the default extent is the full height.
    expect(d['row']).toBe(5);
    expect(d['y']).toEqual([0, 1]);
    const none = run({ data: [{ type: 'donut', values: [1], domain: { row: 1, column: 1 } }] });
    expect((none.fullData[0]?.['domain'] as Record<string, unknown>)['x']).toEqual([0, 1]);
  });
});

describe('axis overlaying', () => {
  it('is unset by default', () => {
    const { fullLayout } = run({ data: on(['x', 'y']) });
    expect('overlaying' in axis(fullLayout, 'yaxis')).toBe(false);
  });

  it('shares the domain of the overlaid axis', () => {
    const { fullLayout } = run({
      data: on(['x', 'y'], ['x', 'y2']),
      layout: {
        yaxis: { domain: [0.5, 1] },
        yaxis2: { overlaying: 'y', side: 'right', domain: [0, 0.2] },
      },
    });
    expect(axis(fullLayout, 'yaxis2')).toMatchObject({
      overlaying: 'y',
      side: 'right',
      domain: [0.5, 1],
      anchor: 'x',
    });
  });

  it('is dropped for itself, missing axes, and axes that overlay another', () => {
    const { fullLayout } = run({
      data: on(['x', 'y'], ['x', 'y2'], ['x', 'y3'], ['x', 'y4']),
      layout: {
        yaxis2: { overlaying: 'y2' },
        yaxis3: { overlaying: 'y9' },
        yaxis4: { overlaying: 'y5' },
        yaxis5: { overlaying: 'y' },
        xaxis: { overlaying: 'free' },
      },
    });
    for (const key of ['yaxis2', 'yaxis3', 'yaxis4']) {
      expect(axis(fullLayout, key).overlaying).toBeUndefined();
    }
    expect(axis(fullLayout, 'yaxis5').overlaying).toBe('y');
    expect(axis(fullLayout, 'xaxis').overlaying).toBe('free');
  });

  it('ignores templates', () => {
    const { fullLayout } = run({
      data: on(['x', 'y'], ['x', 'y2']),
      layout: { template: { layout: { yaxis: { overlaying: 'y' } } } },
    });
    expect(axis(fullLayout, 'yaxis2').overlaying).toBeUndefined();
  });
});

describe('grid defaults: fixed point and validity (property)', () => {
  const ids = (letter: string) => fc.constantFrom(letter, `${letter}2`, `${letter}3`, `${letter}4`);
  const cell = fc.oneof(
    fc.constant(''),
    fc.tuple(ids('x'), ids('y')).map(([x, y]) => x + y),
  );
  const gridArb = fc.record(
    {
      rows: fc.integer({ min: 1, max: 4 }),
      columns: fc.integer({ min: 1, max: 4 }),
      roworder: fc.constantFrom('top to bottom', 'bottom to top'),
      pattern: fc.constantFrom('independent', 'coupled'),
      subplots: fc.array(fc.array(cell, { maxLength: 4 }), { maxLength: 4 }),
      xaxes: fc.array(fc.oneof(ids('x'), fc.constant('')), { maxLength: 4 }),
      yaxes: fc.array(fc.oneof(ids('y'), fc.constant('')), { maxLength: 4 }),
      xgap: fc.double({ min: 0, max: 1, noNaN: true }),
      ygap: fc.double({ min: 0, max: 1, noNaN: true }),
      domain: fc.record(
        {
          x: fc.constantFrom([0, 1], [0.1, 0.9], [0.5, 0.2]),
          y: fc.constantFrom([0, 1], [0.25, 1]),
        },
        { requiredKeys: [] },
      ),
      xside: fc.constantFrom('bottom', 'bottom plot', 'top plot', 'top'),
      yside: fc.constantFrom('left', 'left plot', 'right plot', 'right'),
    },
    { requiredKeys: [] },
  );
  const traceArb = fc.oneof(
    fc
      .tuple(ids('x'), ids('y'))
      .map(([xaxis, yaxis]) => ({ type: 'scatter', xaxis, yaxis, y: [1, 2] })),
    // Cell 0 always exists; out-of-range cells are the known issue tested below.
    fc
      .constantFrom({}, { row: 0 }, { column: 0 }, { row: 0, column: 0 })
      .map((domain) => ({ type: 'donut', values: [1, 2], domain })),
  );
  const axisArb = fc.record(
    {
      domain: fc.constantFrom([0, 0.5], [0.2, 1]),
      anchor: fc.constantFrom('free', 'y', 'x'),
      overlaying: fc.constantFrom('y', 'y2', 'x', 'free'),
    },
    { requiredKeys: [] },
  );
  const layoutArb = fc.record(
    { grid: gridArb, xaxis2: axisArb, yaxis2: axisArb, yaxis3: axisArb },
    { requiredKeys: ['grid'] },
  );

  it('feeding the stripped output back in reproduces it, and the output validates', () => {
    const reg = registry();
    fc.assert(
      fc.property(fc.array(traceArb, { maxLength: 6 }), layoutArb, (data, layout) => {
        const first = supplyDefaults({ data, layout }, reg, quiet);
        const fullLayout = stripInternal(first.fullLayout);
        const again = supplyDefaults(
          { data: stripInternal(first.fullData) as unknown[], layout: fullLayout },
          reg,
          quiet,
        );
        expect(stripInternal(again.fullLayout)).toEqual(fullLayout);
        expect(stripInternal(again.fullData)).toEqual(stripInternal(first.fullData));
        expect(validate(stripInternal(first.fullData), fullLayout, reg)).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('axis domains in the grid lie inside grid.domain', () => {
    const reg = registry();
    fc.assert(
      fc.property(fc.array(traceArb, { maxLength: 6 }), gridArb, (data, grid) => {
        const { fullLayout } = supplyDefaults({ data, layout: { grid } }, reg, quiet);
        const g = fullLayout.grid;
        if (!g) return;
        for (const [id, at] of Object.entries(g._axisMap ?? {})) {
          const letter = id.charAt(0) as 'x' | 'y';
          const ax = axis(fullLayout, `${letter}axis${id.slice(1)}`);
          if (ax.overlaying !== undefined) continue;
          expect(ax.domain).toEqual(g._domains[letter][at]);
          expect(ax.domain[0]).toBeGreaterThanOrEqual(g.domain[letter][0]);
          expect(ax.domain[1]).toBeLessThanOrEqual(g.domain[letter][1]);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('domain traces outside the grid', () => {
  // Plotly deletes an out-of-range `domain.row`/`column`, which re-defaults to 0 (a valid cell)
  // on the next pass; `defaults/domain.ts` keeps it (ignored) so the output is a fixed point.
  it('an out-of-range domain.column is a fixed point', () => {
    const reg = registry();
    const first = supplyDefaults(
      {
        data: [{ type: 'donut', values: [1], domain: { row: 0, column: 1 } }],
        layout: { grid: { rows: 2, columns: 1 } },
      },
      reg,
      quiet,
    );
    const again = supplyDefaults(
      { data: stripInternal(first.fullData) as unknown[], layout: stripInternal(first.fullLayout) },
      reg,
      quiet,
    );
    expect(stripInternal(again.fullData)).toEqual(stripInternal(first.fullData));
  });
});

describe('grid with the scatter-only registry', () => {
  it('does not need domain traces', () => {
    const reg = createRegistry().register(scatter);
    const { fullLayout } = supplyDefaults(
      { data: on(['x', 'y'], ['x2', 'y2']), layout: { grid: { rows: 1, columns: 2 } } },
      reg,
      quiet,
    );
    expect(fullLayout.grid?.xaxes).toEqual(['x', 'x2']);
  });
});
