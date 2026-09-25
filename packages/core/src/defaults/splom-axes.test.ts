import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import type { TraceModule } from '../registry/types.ts';
import { attr } from '../schema/attr.ts';
import { stripInternal } from '../util/objects.ts';
import {
  getSplomStash,
  splomGridFallback,
  stashSplomAxis,
  stashSplomGridSides,
  stashSplomSubplot,
} from './splom-axes.ts';
import { supplyDefaults } from './supply-defaults.ts';
import type { FigureInput, FullAxis, FullLayout } from './types.ts';

const quiet = { onIssue: () => {} };

/**
 * A tiny matrix trace: every pair of its `columns` as a cell (`x`, `x2`, … by `y`, `y2`, …), with
 * optional per-column `types` / `matches` and edge sides — what `splom` records.
 */
const matrix: TraceModule = {
  type: 'matrix',
  categories: [],
  schema: attr.object({
    columns: attr.any({ editType: 'calc' }),
    types: attr.any({ editType: 'calc' }),
    matches: attr.boolean({ dflt: false, editType: 'calc' }),
    edges: attr.boolean({ dflt: false, editType: 'calc' }),
  }),
  meta: { description: 'Test matrix trace.' },
  supplyDefaults(_in, out, ctx) {
    const columns = (ctx.coerce<unknown[][]>('columns') ?? []) as unknown[][];
    const types = (ctx.coerce<(string | undefined)[]>('types') ?? []) as (string | undefined)[];
    const matches = ctx.coerce<boolean>('matches');
    const id = (letter: string, k: number) => (k === 0 ? letter : `${letter}${k + 1}`);
    columns.forEach((data, k) => {
      const type = types[k];
      for (const [letter, other] of [
        ['x', 'y'],
        ['y', 'x'],
      ] as const) {
        stashSplomAxis(ctx.fullLayout, id(letter, k), {
          label: `col ${k}`,
          data,
          trace: out,
          ...(type ? { type } : {}),
          ...(matches ? { matches: id(other, k) } : {}),
        });
      }
    });
    columns.forEach((_, i) =>
      columns.forEach((__, j) => stashSplomSubplot(ctx.fullLayout, id('x', i) + id('y', j))),
    );
    if (ctx.coerce('edges')) stashSplomGridSides(ctx.fullLayout);
  },
};

const run = (figure: FigureInput) =>
  supplyDefaults(figure, fixtureRegistry().register(matrix), quiet);
const axis = (fl: FullLayout, key: string) => fl[key] as FullAxis;
const trace = (extra: Record<string, unknown> = {}) => ({
  type: 'matrix',
  columns: [
    [1, 2, 3],
    ['a', 'b', 'c'],
  ],
  ...extra,
});

describe('splom axes stash', () => {
  it('records axes in order, the first entry per id winning', () => {
    const fl = { _subplots: { cartesian: [], xaxis: [], yaxis: [] } } as unknown as FullLayout;
    expect(getSplomStash(fl)).toBeUndefined();
    const t = { type: 't', visible: true, _index: 0, _input: {}, _module: undefined };
    expect(stashSplomAxis(fl, 'x2', { label: 'a', trace: t })).toBe(true);
    expect(stashSplomAxis(fl, 'x2', { label: 'b', trace: t })).toBe(false);
    stashSplomAxis(fl, 'x', { label: 'c', trace: t });
    stashSplomSubplot(fl, 'x2y');
    stashSplomSubplot(fl, 'x2y');
    const stash = getSplomStash(fl);
    expect(Object.keys(stash?.axes.x ?? {})).toEqual(['x2', 'x']);
    expect(stash?.axes.x['x2']?.label).toBe('a');
    expect(stash?.subplots).toEqual(['x2y']);
    expect(splomGridFallback(fl)).toEqual({ xaxes: ['x2', 'x'], yaxes: [] });
  });
});

describe('splom axes in supply-defaults', () => {
  it('creates the axes and cell subplots, typed from the data, titled by label', () => {
    const { fullLayout } = run({ data: [trace()] });
    expect(fullLayout._subplots.xaxis).toEqual(['x', 'x2']);
    expect(fullLayout._subplots.yaxis).toEqual(['y', 'y2']);
    expect([...fullLayout._subplots.cartesian].sort()).toEqual(['x2y', 'x2y2', 'xy', 'xy2']);
    expect(axis(fullLayout, 'xaxis').type).toBe('linear');
    expect(axis(fullLayout, 'xaxis2').type).toBe('category');
    expect(axis(fullLayout, 'yaxis2').type).toBe('category');
    expect(axis(fullLayout, 'yaxis2').title.text).toBe('col 1');
  });

  it('lays the axes out as a grid without a layout.grid, with edge sides on request', () => {
    const { fullLayout } = run({ data: [trace()] });
    expect(fullLayout.grid).toMatchObject({
      rows: 2,
      columns: 2,
      xaxes: ['x', 'x2'],
      yaxes: ['y', 'y2'],
      xside: 'bottom plot',
      yside: 'left plot',
    });
    expect(axis(fullLayout, 'xaxis').anchor).toBe('y2');
    const edges = run({ data: [trace({ edges: true })] }).fullLayout;
    expect(edges.grid).toMatchObject({ xside: 'bottom', yside: 'left' });
    expect(axis(edges, 'xaxis2').anchor).toBe('free');
  });

  it('lets the user grid, axis types and matches win', () => {
    const { fullLayout } = run({
      data: [trace({ types: ['log'], matches: true })],
      layout: {
        grid: { xgap: 0, xaxes: ['x2', 'x'] },
        xaxis2: { matches: null, type: 'linear' },
        yaxis: { type: 'linear' },
      },
    });
    expect(fullLayout.grid?.xaxes).toEqual(['x2', 'x']);
    expect(fullLayout.grid?.xgap).toBe(0);
    expect(axis(fullLayout, 'xaxis').type).toBe('log');
    expect(axis(fullLayout, 'yaxis').type).toBe('linear');
    // Matches need equal types: x (log) can't match y (linear, the user's), nor x2 (linear, the
    // user's; `matches: null` is unset, so the default is tried) y2 (category).
    expect(axis(fullLayout, 'xaxis').matches).toBeUndefined();
    expect(axis(fullLayout, 'xaxis2').type).toBe('linear');
    expect(axis(fullLayout, 'yaxis2').type).toBe('category');
    expect(axis(fullLayout, 'xaxis2').matches).toBeUndefined();
  });

  it('matches a column’s x and y axes', () => {
    const { fullLayout } = run({ data: [trace({ matches: true })] });
    expect(axis(fullLayout, 'xaxis').matches).toBe('y');
    expect(axis(fullLayout, 'xaxis2').matches).toBe('y2');
    expect(axis(fullLayout, 'yaxis').matches).toBeUndefined();
    expect(fullLayout._axisMatchGroups).toEqual([
      { x: 1, y: 1 },
      { x2: 1, y2: 1 },
    ]);
  });

  it('is a fixed point', () => {
    const figure = { data: [trace({ matches: true, edges: true })] };
    const first = run(figure);
    const layout = stripInternal(first.fullLayout) as Record<string, unknown>;
    delete layout['template'];
    const again = run({ ...figure, layout });
    expect(stripInternal(again.fullLayout)).toEqual(stripInternal(first.fullLayout));
  });

  it('changes nothing for figures without such traces', () => {
    const { fullLayout } = run({ data: [{ type: 'scatter', y: [1, 2] }] });
    expect(fullLayout.grid).toBeUndefined();
    expect(getSplomStash(fullLayout)).toBeUndefined();
  });
});
