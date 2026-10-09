import {
  createBreakMap,
  createScale,
  supplyDefaults,
  type RangeBreakInput,
  type AxisType,
  type FullAxis,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import {
  createResourceManager,
  HeatmapPrimitive,
  IDENTITY_TRANSFORM,
  TextPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type HoverContext,
  type HoverQuery,
  type TracePlotContext,
  type TraceUpdatePlan,
} from '@mk7s/holochart-runtime';
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  calcHeatmapGrid,
  cleanZ,
  distinctValues,
  heatmapSmoothing,
  heatmapZStats,
  isEvenlySpaced,
  makeBoundArray,
  MAX_CELLS,
  sourceCell,
  type HeatmapCalc,
} from './calc.ts';
import { heatmap } from './index.ts';
import { gridA11y } from '@mk7s/holochart-traces-stats';
import { heatmapCellTexts, MAX_LABELLED_CELLS } from './text.ts';

// troika typesets in a worker with browser globals; the view tests only need its object graph.
vi.mock('../../../render/node_modules/troika-three-text', async () => {
  const { Object3D } = await import('three');
  type Node = InstanceType<typeof Object3D>;
  const noopDispose = (o: object): void => {
    Object.assign(o, { dispose: (): void => {} });
  };
  class Text extends Object3D {
    constructor() {
      super();
      noopDispose(this);
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    addText(text: Node): void {
      this.add(text);
    }
    removeText(text: Node): void {
      this.remove(text);
    }
    constructor() {
      super();
      noopDispose(this);
    }
    sync(callback?: () => void): void {
      callback?.();
    }
  }
  return { Text, BatchedText, configureTextBuilder: () => {}, preloadFont: () => {} };
});

const registry = createChartRegistry().register(heatmap);

interface AxisSpec {
  type?: AxisType;
  categories?: string[];
  rangebreaks?: RangeBreakInput[];
}

function axis(fullLayout: FullLayout, id: 'x' | 'y', spec: AxisSpec = {}): AxisInfo {
  const type = spec.type ?? 'linear';
  const breaks = createBreakMap(spec.rangebreaks, type);
  const scale = createScale({
    type,
    range: [-5, 5],
    ...(spec.categories ? { categories: spec.categories } : {}),
    ...(breaks ? { breaks } : {}),
  });
  const full = { ...(fullLayout[`${id}axis`] as FullAxis), type } as FullAxis;
  return { id, name: `${id}axis`, letter: id, type, scale, full } as unknown as AxisInfo;
}

function setup(
  data: Record<string, unknown>[],
  axes: { x?: AxisSpec; y?: AxisSpec } = {},
  layout: Record<string, unknown> = {},
) {
  const traces = data.map((t) => ({ type: 'heatmap', ...t }));
  const { fullData, fullLayout } = supplyDefaults({ data: traces, layout }, registry.core);
  const xaxis = axis(fullLayout, 'x', axes.x);
  const yaxis = axis(fullLayout, 'y', axes.y);
  return { fullData, fullLayout, xaxis, yaxis };
}

function calcOf(
  trace: Record<string, unknown>,
  axes: { x?: AxisSpec; y?: AxisSpec } = {},
  layout: Record<string, unknown> = {},
) {
  const s = setup([trace], axes, layout);
  const calc = heatmap.calc!(s.fullData[0]!, {
    fullLayout: s.fullLayout,
    index: 0,
    xaxis: s.xaxis,
    yaxis: s.yaxis,
  });
  return { ...s, trace: s.fullData[0]!, calc };
}

const sourceCellOf = (calc: HeatmapCalc, i: number) => sourceCell(calc, i, 0);
const nan = (a: ArrayLike<number>) => Array.from(a, (v) => (Number.isNaN(v) ? null : v));
const round = (a: ArrayLike<number>, d = 9) => Array.from(a, (v) => +v.toFixed(d));

describe('heatmap defaults', () => {
  it('accepts a 2D z with a numeric cell, or 1D z with x and y columns', () => {
    const { fullData } = setup([
      { z: [[1, 2]] },
      { z: [['a', null]] },
      { z: [1, 2, 3] },
      { z: [1, 2, 3], x: [1, 2, 3], y: [1, 1, 2, 2] },
      { z: [[1], 5] },
      { z: [] },
    ]);
    expect(fullData.map((t) => t.visible)).toEqual([true, false, false, true, false, false]);
    expect(fullData[3]!['_length']).toBe(3);
  });

  it('coerces x0 / dx only without x, xtype only with it', () => {
    const { fullData } = setup([{ z: [[1]] }, { z: [[1]], x: [3], x0: 5 }]);
    expect(fullData[0]!['x0']).toBe(0);
    expect(fullData[0]!['dx']).toBe(1);
    expect(fullData[0]!['xtype']).toBeUndefined();
    expect(fullData[1]!['xtype']).toBe('array');
    expect(fullData[1]!['x0']).toBeUndefined();
    expect(fullData[1]!['transpose']).toBe(false);
  });

  it('defaults connectgaps on for smoothed column data only, gaps without smoothing', () => {
    const { fullData } = setup([
      { z: [1, 2], x: [1, 2], y: [1, 1], zsmooth: 'best' },
      { z: [1, 2], x: [1, 2], y: [1, 1] },
      { z: [[1, 2]], zsmooth: 'fast', xgap: 2 },
      { z: [[1, 2]], xgap: 2 },
    ]);
    expect(fullData.map((t) => t['connectgaps'])).toEqual([true, false, false, false]);
    expect(fullData[2]!['xgap']).toBeUndefined();
    expect(fullData[3]!['xgap']).toBe(2);
  });

  it("uses Plotly's heatmap colorscale defaults and hides the legend entry", () => {
    const t = setup([{ z: [[1]] }]).fullData[0]!;
    expect(t['colorscale']).toBe('RdBu');
    expect(t['autocolorscale']).toBe(false);
    expect(t['showscale']).toBe(true);
    expect(t['hoverongaps']).toBe(true);
    expect(t['showlegend']).toBe(false);
  });
});

describe('heatmap cell edges (Plotly makeBoundArray)', () => {
  const b = (
    values: number[] | undefined,
    count: number,
    type: AxisType = 'linear',
    v0?: number,
    dv?: number,
  ) => makeBoundArray({ type, values, v0, dv, count });

  it('puts edges halfway between centers, extrapolating the outer ones', () => {
    expect(b([0, 1, 2], 3)).toEqual([-0.5, 0.5, 1.5, 2.5]);
    expect(b([0, 1, 3], 3)).toEqual([-0.5, 0.5, 2, 4]);
    // Fewer centers than cells: the last spacing continues.
    expect(b([0, 1], 4)).toEqual([-0.5, 0.5, 1.5, 2.5, 3.5]);
    // One more value than cells: edges.
    expect(b([0, 1, 3, 7], 3)).toEqual([0, 1, 3, 7]);
    expect(b([5], 1)).toEqual([4.5, 5.5]);
  });

  it('uses geometric means on log axes', () => {
    const edges = b([1, 10, 100], 3, 'log').map((v) => Math.log10(v));
    expect(round(edges)).toEqual([-0.5, 0.5, 1.5, 2.5]);
    // Two values for one cell are its edges; a single center gets a cell of width `dx` (1), in
    // data units on log axes too (Plotly's two-value `numbricks === 1` branch is unreachable).
    expect(b([10, 20], 1, 'log')).toEqual([10, 20]);
    expect(b([10], 1, 'log')).toEqual([9.5, 10.5]);
  });

  it('steps from x0 by dx without coordinates, and ignores arrays on category axes', () => {
    expect(b(undefined, 3, 'linear', 10, 2)).toEqual([9, 11, 13, 15]);
    expect(b(undefined, 2)).toEqual([-0.5, 0.5, 1.5]);
    expect(b([0, 1, 2], 3, 'category')).toEqual([-0.5, 0.5, 1.5, 2.5]);
    expect(b([2], 1, 'category')).toEqual([1.5, 2.5]);
  });

  it('gives strictly increasing edges around increasing centers (property)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.double({ min: -1e6, max: 1e6, noNaN: true }), {
          minLength: 2,
          maxLength: 30,
        }),
        (raw) => {
          const centers = [...raw].sort((a, c) => a - c);
          if (
            !isEvenlySpaced(centers) &&
            centers.some((v, i) => i > 0 && v - centers[i - 1]! < 1e-3)
          )
            return;
          const edges = b(centers, centers.length);
          expect(edges).toHaveLength(centers.length + 1);
          for (let i = 0; i < centers.length; i++) {
            expect(edges[i]!).toBeLessThanOrEqual(centers[i]!);
            expect(edges[i + 1]!).toBeGreaterThanOrEqual(centers[i]!);
          }
        },
      ),
    );
  });
});

describe('heatmap calc', () => {
  it('reads rows of z with centers on x and y', () => {
    const { calc } = calcOf({
      z: [
        [1, 2, 3],
        [4, '5', 'x'],
      ],
      x: [10, 20, 30],
      y: [0, 1],
    });
    expect(calc.nx).toBe(3);
    expect(calc.ny).toBe(2);
    // Numeric strings count; anything else is a gap (Plotly's clean2dArray).
    expect(nan(calc.z)).toEqual([1, 2, 3, 4, 5, null]);
    expect([...calc.x.edges]).toEqual([5, 15, 25, 35]);
    expect([...calc.x.centers]).toEqual([10, 20, 30]);
    expect([...calc.y.edges]).toEqual([-0.5, 0.5, 1.5]);
    expect(calc.zExtent).toEqual([1, 5]);
    expect(calc.pointOf).toBeUndefined();
  });

  it('pads ragged rows with gaps and reads typed rows', () => {
    const { calc } = calcOf({ z: [Float32Array.of(1, NaN, 3), [4]] });
    expect(nan(calc.z)).toEqual([1, null, 3, 4, null, null]);
    expect([...calc.x.edges]).toEqual([-0.5, 0.5, 1.5, 2.5]);
  });

  it('copies typed rows natively with the same values, extent and statistics as a scan', () => {
    const rows = [
      Float32Array.of(1, 2.5, -3, 7),
      Float64Array.of(7, 1e-9, 7, 0),
      Float32Array.of(9, Infinity, -Infinity, NaN), // a non-finite value: the careful loop
      Float64Array.of(8, 8), // short: padded with gaps
      Int16Array.of(-7, 3, 8, 8),
      Float32Array.of(8.5, 1, 8.5, 2, 99), // longer than the grid is wide (the first row)
      ['4', null, 8.5, 'x'],
      new Float64Array(0),
    ];
    const { calc } = calcOf({ z: rows });
    expect([calc.nx, calc.ny]).toEqual([5, 8]);
    const expected = rows.flatMap((row) =>
      Array.from({ length: 5 }, (_, i) => {
        const v = i < row.length ? Number(row[i] ?? NaN) : NaN;
        return Number.isFinite(v) ? v : null;
      }),
    );
    expect(nan(calc.z)).toEqual(expected);
    expect(calc.zExtent).toEqual([-7, 99]);
    // The first of the largest values (row 5, column 4), and the number of values.
    expect(heatmapZStats(calc.z)).toEqual({
      maxAt: 5 * 5 + 4,
      finite: expected.filter((v) => v !== null).length,
    });
    // Equal maxima in different rows and kinds of rows: the first in grid order.
    const ties = calcOf({ z: [Float32Array.of(1, 3, 3), [3, 3, 3], Float64Array.of(3, 0, 3)] });
    expect(heatmapZStats(ties.calc.z)).toEqual({ maxAt: 1, finite: 9 });
    expect(ties.calc.zExtent).toEqual([0, 3]);
    const none = calcOf({ z: [Float32Array.of(NaN, NaN), Float64Array.of(Infinity, NaN)] });
    expect(none.calc.zExtent).toEqual([NaN, NaN]);
    expect(heatmapZStats(none.calc.z)).toEqual({ maxAt: -1, finite: 0 });
  });

  it('transposes', () => {
    const { calc } = calcOf({
      z: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      transpose: true,
    });
    expect([calc.nx, calc.ny]).toEqual([3, 2]);
    expect([...calc.z]).toEqual([1, 3, 5, 2, 4, 6]);
  });

  it("places cells at x0 + i·dx with xtype 'scaled', whatever x says", () => {
    const { calc } = calcOf({ z: [[1, 2]], x: [100, 200], xtype: 'scaled', x0: 1, dx: 0.5 });
    expect([...calc.x.edges]).toEqual([0.75, 1.25, 1.75]);
    expect([...calc.x.centers]).toEqual([1, 1.5]);
  });

  it('places column data on the sorted distinct x and y values', () => {
    const { calc } = calcOf({
      z: [5, 6, 1, 2, 9],
      x: [2, 3, 2, 3, 2],
      y: [20, 20, 10, 10, 10],
    });
    expect([calc.nx, calc.ny]).toEqual([2, 2]);
    // The later point of a duplicate (x 2, y 10) wins, as in Plotly.
    expect([...calc.z]).toEqual([9, 2, 5, 6]);
    expect([...calc.pointOf!]).toEqual([4, 3, 0, 1]);
    expect([...calc.y.centers]).toEqual([10, 20]);
  });

  it('spans the categories of a category axis, matching columns by name', () => {
    const { calc } = calcOf(
      { z: [[1, 2]], x: ['b', 'c'], y: ['r'] },
      {
        x: { type: 'category', categories: ['a', 'b', 'c'] },
        y: { type: 'category', categories: ['r'] },
      },
    );
    expect(calc.nx).toBe(3);
    expect(nan(calc.z)).toEqual([null, 1, 2]);
    expect([...calc.x.edges]).toEqual([-0.5, 0.5, 1.5, 2.5]);
    expect([...calc.x.centers]).toEqual([0, 1, 2]);
  });

  it('reads dates and log axes in calc space', () => {
    const day = 86_400_000;
    const { calc } = calcOf(
      { z: [[1, 2]], x0: '2026-01-01', dx: day, y: [10] },
      { x: { type: 'date' }, y: { type: 'log' } },
    );
    const t0 = Date.UTC(2026, 0, 1);
    expect([...calc.x.edges]).toEqual([t0 - day / 2, t0 + day / 2, t0 + 1.5 * day]);
    expect(round(calc.y.edges)).toEqual(round([Math.log10(9.5), Math.log10(10.5)]));
    // The given center, not the middle of the edges.
    expect(calc.y.centers[0]).toBe(1);
  });

  it('fills gaps with connectgaps like plotly.js interp2d', () => {
    const z = [
      [1, 2, 3],
      [4, null, 6],
      [7, 8, 9],
    ];
    expect(nan(calcOf({ z }).calc.z)[4]).toBeNull();
    expect(calcOf({ z, connectgaps: true }).calc.z[4]).toBe(5);
    // A corner gap averages its two neighbours; a whole missing row interpolates between rows.
    expect(
      calcOf({
        z: [
          [null, 2],
          [3, 4],
        ],
        connectgaps: true,
      }).calc.z[0],
    ).toBe(2.5);
    const rows = calcOf({
      z: [
        [0, 0],
        [null, null],
        [4, 4],
      ],
      connectgaps: true,
    }).calc.z;
    expect([rows[2], rows[3]]).toEqual([2, 2]);
  });

  it("turns zsmooth 'fast' off on log axes and uneven grids (Plotly)", () => {
    const fast = { zsmooth: 'fast' };
    const even = calcOf({ z: [[1, 2, 3]], x: [0, 1, 2], ...fast });
    expect(heatmapSmoothing(even.trace, even.calc)).toBe('fast');
    const uneven = calcOf({ z: [[1, 2, 3]], x: [0, 1, 5], ...fast });
    expect(heatmapSmoothing(uneven.trace, uneven.calc)).toBe(false);
    const log = calcOf({ z: [[1, 2]], ...fast }, { x: { type: 'log' } });
    expect(heatmapSmoothing(log.trace, log.calc)).toBe(false);
    const best = calcOf({ z: [[1, 2, 3]], x: [0, 1, 5], zsmooth: 'best' });
    expect(heatmapSmoothing(best.trace, best.calc)).toBe('best');
  });

  it('refuses grids over MAX_CELLS with a warning', () => {
    const s = setup([{ z: [[1]] }]);
    const warn = vi.fn();
    const big = {
      ...s.fullData[0]!,
      z: { length: 4097, 0: { length: 4097 } },
    } as unknown as FullTrace;
    const calc = calcHeatmapGrid(big, { xaxis: s.xaxis, yaxis: s.yaxis }, { warn });
    expect(calc.nx).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
    expect(4097 * 4097).toBeGreaterThan(MAX_CELLS);
  });

  it('gives value-based category orders the values of each column or row', () => {
    const { calc, trace, fullLayout, xaxis, yaxis } = calcOf(
      {
        z: [
          [1, 2],
          [3, null],
        ],
        x: ['a', 'b'],
      },
      { x: { type: 'category', categories: ['a', 'b'] } },
    );
    const ctx = { fullLayout, index: 0, xaxis, yaxis };
    expect(heatmap.categoryValues!(calc, trace, 'x', ctx)).toEqual({
      index: [0, 1, 0],
      value: [1, 2, 3],
    });
    expect(heatmap.categoryValues!(calc, trace, 'y', ctx)).toBeUndefined();
  });

  it('reports autorange extremes edge to edge', () => {
    const { calc, trace, fullLayout, xaxis, yaxis } = calcOf({ z: [[1, 2]], x: [0, 10] });
    const ext = heatmap.extremes!(calc, trace, { fullLayout, index: 0, xaxis, yaxis });
    expect([ext.x!.min[0]!.l, ext.x!.max[0]!.l]).toEqual([-5, 15]);
    expect(ext.x!.min[0]!.padPx).toBe(0);
  });

  it('cleans z values like fast-isnumeric', () => {
    expect(
      [cleanZ(1), cleanZ(' 2 '), cleanZ(''), cleanZ(true), cleanZ(Infinity), cleanZ(null)].map(
        (v) => (Number.isNaN(v) ? null : v),
      ),
    ).toEqual([1, 2, null, null, null, null]);
    expect(distinctValues([3, 1, 2, 1, 1 + 1e-12])).toEqual({ vals: [1, 2, 3], minDiff: 1 });
  });
});

const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

describe('heatmap periods (xperiod)', () => {
  it('coerces xperiod0 / xperiodalignment only with a period, for both kinds of z', () => {
    const { fullData } = setup([
      { z: [[1]] },
      { z: [[1]], x: [1], xperiod: 2, yperiod: 'M1' },
      { z: [1], x: [1], y: [1], xperiod: 2 },
    ]);
    expect(fullData[0]!['xperiod']).toBeUndefined();
    expect(fullData[0]!['xperiodalignment']).toBeUndefined();
    expect(fullData[1]!['xperiod']).toBe(2);
    expect(fullData[1]!['xperiodalignment']).toBe('middle');
    expect(fullData[1]!['xperiod0']).toBeUndefined();
    expect(fullData[1]!['yperiodalignment']).toBe('middle');
    expect(fullData[2]!['xperiodalignment']).toBe('middle');
  });

  it.each([
    ['start', [0, 2, 6]],
    ['middle', [1, 3, 7]],
    ['end', [2, 4, 8]],
  ] as const)('snaps cell centers to the %s of their period', (alignment, centers) => {
    const { calc } = calcOf({
      z: [[1, 2, 3]],
      x: [1.2, 3.7, 6],
      xperiod: 2,
      xperiodalignment: alignment,
    });
    expect([...calc.x.centers]).toEqual(centers);
    const [a, b, c] = centers;
    expect([...calc.x.edges]).toEqual([a - (b - a) / 2, (a + b) / 2, (b + c) / 2, c + (c - b) / 2]);
    // Hover reads the values as given.
    expect([...calc.x.hoverAt!]).toEqual([1.2, 3.7, 6]);
    // Uneven after alignment: no 'fast' smoothing.
    expect(calc.fastSmoothing).toBe(false);
  });

  it('aligns monthly dates from xperiod0, and given edges (hover: their middle)', () => {
    const { calc } = calcOf(
      { z: [[1, 2]], x: ['2024-01-10', '2024-02-20'], xperiod: 'M1', xperiodalignment: 'start' },
      { x: { type: 'date' } },
    );
    expect([...calc.x.centers]).toEqual([utc('2024-01-01'), utc('2024-02-01')]);
    const edges = calcOf({
      z: [[1]],
      x: [10, 20],
      xperiod: 4,
      xperiod0: 1,
      xperiodalignment: 'end',
    }).calc;
    expect([...edges.x.edges]).toEqual([13, 21]);
    expect([...edges.x.hoverAt!]).toEqual([15]);
  });

  it('aligns column data before placing it (hover shows the aligned values, as Plotly)', () => {
    const { calc } = calcOf({ z: [1, 2, 3], x: [0.5, 1.5, 2.5], y: [0, 0, 0], xperiod: 2 });
    expect([...calc.x.centers]).toEqual([1, 3]);
    expect(nan(calc.z)).toEqual([2, 3]);
    expect(calc.x.hoverAt).toBeUndefined();
  });

  it('labels hover with the value before alignment', () => {
    const s = calcOf(
      { z: [[1, 2]], x: ['2024-01-10', '2024-02-20'], xperiod: 'M1' },
      { x: { type: 'date' } },
    );
    const ctx: HoverContext = {
      fullLayout: s.fullLayout,
      xaxis: s.xaxis,
      yaxis: s.yaxis,
      transform: IDENTITY_TRANSFORM,
    };
    const mid = (utc('2024-02-01') + utc('2024-03-01')) / 2;
    const query: HoverQuery = { px: 0, py: 0, xl: mid, yl: 0, mode: 'closest', distance: 1 };
    const [p] = heatmap.hoverPoints!(s.calc, s.trace, query, ctx);
    expect(p!.x).toBe(utc('2024-02-20'));
    expect(p!.labels!['x']).toContain('Feb 20');
    // Anchored on the drawn (aligned) cell.
    expect(p!.px).toBe(mid);
  });
});

describe('heatmap range breaks', () => {
  const weekends = { type: 'date' as const, rangebreaks: [{ bounds: ['sat', 'mon'] }] };
  const L = (d: string) => createBreakMap(weekends.rangebreaks, 'date')!.toLinear(utc(d));

  it('drops columns whose center is in a break and tiles the compressed axis', () => {
    const s = calcOf(
      {
        z: [[1, 2, 3, 4]],
        x: ['2024-01-04', '2024-01-05', '2024-01-06', '2024-01-08'],
        text: [['a', 'b', 'c', 'd']],
      },
      { x: weekends },
    );
    const { calc } = s;
    expect(calc.nx).toBe(3);
    expect(nan(calc.z)).toEqual([1, 2, 4]);
    // Friday and Monday are a day apart in compressed space: every cell is a day wide.
    expect(L('2024-01-08') - L('2024-01-05')).toBe(DAY);
    expect([...calc.x.edges]).toEqual([
      L('2024-01-04') - DAY / 2,
      L('2024-01-04') + DAY / 2,
      L('2024-01-05') + DAY / 2,
      L('2024-01-08') + DAY / 2,
    ]);
    // Per-cell text follows its value.
    expect(sourceCellOf(calc, 2)).toEqual([0, 3]);
  });

  it('steps x0 + i·dx in real time, hiding the cells in breaks (as scatter)', () => {
    const { calc } = calcOf({ z: [[1, 2, 3, 4, 5]], x0: '2024-01-05', dx: DAY }, { x: weekends });
    expect(nan(calc.z)).toEqual([1, 4, 5]);
    expect([...calc.x.centers]).toEqual([L('2024-01-05'), L('2024-01-08'), L('2024-01-09')]);
  });

  it('clamps given edges to the breaks and drops the cells they swallow', () => {
    const { calc } = calcOf(
      {
        z: [[1, 2, 3, 4]],
        x: ['2024-01-05', '2024-01-06', '2024-01-07', '2024-01-08', '2024-01-09'],
      },
      { x: weekends },
    );
    expect(nan(calc.z)).toEqual([1, 4]);
    expect([...calc.x.edges]).toEqual([L('2024-01-05'), L('2024-01-08'), L('2024-01-09')]);
  });

  it('leaves column data points in breaks out, and axes without breaks alone', () => {
    const col = calcOf(
      { z: [1, 2, 3], x: ['2024-01-05', '2024-01-06', '2024-01-08'], y: [0, 0, 0] },
      { x: weekends },
    ).calc;
    expect(nan(col.z)).toEqual([1, 3]);
    const plain = calcOf(
      { z: [[1, 2]], x: ['2024-01-05', '2024-01-06'] },
      { x: { type: 'date' } },
    ).calc;
    expect(plain.nx).toBe(2);
  });
});

describe('heatmap hover', () => {
  function hover(
    s: {
      calc: HeatmapCalc;
      trace: FullTrace;
      fullLayout: FullLayout;
      xaxis: AxisInfo;
      yaxis: AxisInfo;
    },
    xl: number,
    yl: number,
  ) {
    const ctx: HoverContext = {
      fullLayout: s.fullLayout,
      xaxis: s.xaxis,
      yaxis: s.yaxis,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 10, scaleY: 10, offsetX: 100, offsetY: 100 },
    };
    const query: HoverQuery = { px: 0, py: 0, xl, yl, mode: 'closest', distance: 20 };
    return heatmap.hoverPoints!(s.calc, s.trace, query, ctx);
  }

  it('labels the cell under the pointer with x, y, z and its 2D text', () => {
    const s = calcOf({
      z: [
        [1, 2],
        [3, null],
      ],
      x: [0, 10],
      text: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      zhoverformat: '.1f',
    });
    const [p] = hover(s, 9, 0.2);
    expect(p!.cell).toEqual([0, 1]);
    expect(p!.pointIndex).toBe(1);
    expect(p!.labels).toEqual({ x: '10', y: '0', z: '2.0' });
    expect(p!.hoverText).toBe('x: 10<br>y: 0<br>z: 2.0<br>b');
    expect(p!.fields).toEqual({ z: 2 });
    // Anchored at the cell's middle (edges 5 … 15), in px.
    expect(p!.px).toBe(10 * 10 + 100);
    expect(p!.distance).toBe(20);
    expect(hover(s, 30, 0)).toEqual([]);
  });

  it('shows gaps with an empty z unless hoverongaps is off', () => {
    const on = calcOf({ z: [[1, null]] });
    expect(hover(on, 1, 0)[0]!.hoverText).toBe('x: 1<br>y: 0<br>z: ');
    const off = calcOf({ z: [[1, null]], hoverongaps: false });
    expect(hover(off, 1, 0)).toEqual([]);
  });

  it('anchors at the cell center when smoothed, and reads column data per point', () => {
    const s = calcOf({ z: [7, 8], x: [0, 4], y: [0, 0], text: ['p', 'q'], zsmooth: 'best' });
    const [p] = hover(s, 3.5, 0);
    expect(p!.pointIndex).toBe(1);
    expect(p!.cell).toBeUndefined();
    expect(p!.text).toBe('q');
    expect(p!.px).toBe(4 * 10 + 100);
  });

  it('reads per-cell text where the value came from when categories re-index the grid', () => {
    const s = calcOf(
      { z: [[1, 2]], x: ['b', 'a'], y: ['r'], text: [['tb', 'ta']] },
      {
        x: { type: 'category', categories: ['a', 'b'] },
        y: { type: 'category', categories: ['r'] },
      },
    );
    const [p] = hover(s, 0, 0);
    expect(p!.fields).toEqual({ z: 2 });
    expect(p!.cell).toEqual([0, 1]);
    expect(p!.hoverText).toBe('x: a<br>y: r<br>z: 2<br>ta');
  });

  it('names categories and formats dates', () => {
    const cat = calcOf(
      { z: [[1, 2]], x: ['a', 'b'] },
      { x: { type: 'category', categories: ['a', 'b'] } },
    );
    expect(hover(cat, 1.2, 0)[0]!.x).toBe('b');
    const date = calcOf({ z: [[1]], x0: '2026-02-03' }, { x: { type: 'date' } });
    const t = Date.UTC(2026, 1, 3);
    expect(hover(date, t, 0)[0]!.labels!['x']).toContain('2026');
  });
});

describe('heatmap cell labels (annotated heatmaps)', () => {
  const mapping = {
    colorscale: [
      [0, [0, 0, 0, 1]],
      [1, [1, 1, 1, 1]],
    ] as const,
    zmin: 0,
    zmax: 1,
    reversescale: false,
  };

  it('fills texttemplate per cell with contrasting colors, empty z on gaps', () => {
    const s = calcOf({
      z: [[0, 1, null]],
      text: [['lo', 'hi', 'gap']],
      texttemplate: '%{text}: %{z}',
    });
    const texts = heatmapCellTexts(s.calc, s.trace, mapping as never, s, s.fullLayout);
    expect(texts.map((t) => t.text)).toEqual(['lo: 0', 'hi: 1', 'gap: ']);
    // Black cell → white text; white cell → black text; a gap contrasts with the background.
    expect(texts[0]!.color).toEqual([1, 1, 1, 1]);
    expect(texts[1]!.color).toEqual([0, 0, 0, 1]);
    expect([texts[0]!.x, texts[1]!.x]).toEqual([0, 1]);
  });

  it('uses textfont.color when given and skips huge grids', () => {
    const s = calcOf({ z: [[0.5]], texttemplate: '%{z:.1f}', textfont: { color: '#ff0000' } });
    const [t] = heatmapCellTexts(s.calc, s.trace, mapping as never, s, s.fullLayout);
    expect(t!.text).toBe('0.5');
    expect(t!.color).toEqual([1, 0, 0, 1]);
    const n = Math.ceil(Math.sqrt(MAX_LABELLED_CELLS)) + 1;
    const big = calcOf({
      z: Array.from({ length: n }, () => new Array<number>(n).fill(1)),
      texttemplate: '%{z}',
    });
    expect(heatmapCellTexts(big.calc, big.trace, mapping as never, big, big.fullLayout)).toEqual(
      [],
    );
  });
});

describe('heatmap colorbar', () => {
  it('reports the value range once calc has run, and zmid', () => {
    const s = calcOf({ z: [[-1, 3]], zmid: 0 });
    const spec = heatmap.colorbar!(s.trace, { fullLayout: s.fullLayout });
    expect([spec!.cmin, spec!.cmax]).toEqual([-3, 3]);
  });

  it('shares a color axis with other heatmaps', () => {
    const s = setup([
      { z: [[0, 1]], coloraxis: 'coloraxis' },
      { z: [[5]], coloraxis: 'coloraxis' },
    ]);
    for (const [i, t] of s.fullData.entries()) {
      heatmap.calc!(t, { fullLayout: s.fullLayout, index: i, xaxis: s.xaxis, yaxis: s.yaxis });
    }
    const spec = heatmap.colorbar!(s.fullData[0]!, { fullLayout: s.fullLayout });
    expect(spec?.coloraxis).toBe('coloraxis');
    expect([spec!.cmin, spec!.cmax]).toEqual([0, 5]);
  });
});

describe('heatmap view', () => {
  const PLAN: TraceUpdatePlan = { calc: false, plot: false, style: false, transform: false };

  function plotCtx(trace: Record<string, unknown>) {
    const { calc, fullData, fullLayout, xaxis, yaxis } = calcOf(trace);
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<HeatmapCalc> = {
      trace: fullData[0]!,
      calc,
      index: 1,
      fullLayout,
      subplot: undefined,
      xaxis,
      yaxis,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 50, scaleY: 50 },
      viewport: {} as Viewport,
      primitives: { resources: createResourceManager(), invalidate: vi.fn() },
      add: (p) => {
        added.push(p as Primitive<unknown>);
        return p;
      },
      remove: (p) => {
        added.splice(added.indexOf(p as Primitive<unknown>), 1);
        p.dispose();
      },
      invalidate: vi.fn(),
    };
    return { ctx, added };
  }

  const Z = [
    [1, 2, 3],
    [4, 5, 6],
  ];

  it('draws the grid as one heatmap primitive with the calc range, under other traces', () => {
    const { ctx, added } = plotCtx({ z: Z, xgap: 1 });
    heatmap.plot!.create(ctx);
    expect(added).toHaveLength(1);
    const hm = added[0] as HeatmapPrimitive;
    expect(hm).toBeInstanceOf(HeatmapPrimitive);
    expect([hm.current.nx, hm.current.ny]).toEqual([3, 2]);
    expect(hm.current.xgap).toBe(1);
    expect(hm.current.zRange).toEqual([1, 6]);
    // Plotly's layer order: heatmaps (rank 1) under contours, bars and scatter.
    expect(hm.object.renderOrder).toBe(1e4 + 1);
  });

  it('restyles colorscale and smoothing without re-uploading, zooms through the transform', () => {
    const { ctx, added } = plotCtx({ z: Z });
    const view = heatmap.plot!.create(ctx);
    const hm = added[0] as HeatmapPrimitive;
    const update = vi.spyOn(hm, 'update');
    const setTransform = vi.spyOn(hm, 'setTransform');
    view.update(
      { ...ctx, trace: { ...ctx.trace, zsmooth: 'best', zmin: 0, zmax: 10, zauto: false } },
      { ...PLAN, style: true },
    );
    expect(Object.keys(update.mock.calls[0]![0])).not.toContain('z');
    expect(hm.current.smoothing).toBe('best');
    expect([hm.current.zmin, hm.current.zmax]).toEqual([0, 10]);
    view.update(ctx, { ...PLAN, transform: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(setTransform).toHaveBeenCalledWith(ctx.transform);
  });

  it('adds cell labels with texttemplate and removes them without', () => {
    const { ctx, added } = plotCtx({ z: Z, texttemplate: '%{z}' });
    const view = heatmap.plot!.create(ctx);
    expect(added).toHaveLength(2);
    expect(added[1]).toBeInstanceOf(TextPrimitive);
    view.update({ ...ctx, trace: { ...ctx.trace, texttemplate: '' } }, { ...PLAN, plot: true });
    expect(added).toHaveLength(1);
  });

  it('draws nothing for an empty grid', () => {
    const { ctx, added } = plotCtx({ z: Z });
    const view = heatmap.plot!.create({ ...ctx, calc: { ...ctx.calc, nx: 0, ny: 0 } });
    expect(added).toHaveLength(0);
    view.update(ctx, { ...PLAN, calc: true });
    expect(added).toHaveLength(1);
  });
});

describe('heatmap describe', () => {
  it('summarizes the grid and its highest cell', () => {
    const s = calcOf({
      z: [
        [1, 9],
        [3, null],
      ],
      name: 'field',
    });
    const d = heatmap.describe!({
      trace: s.trace,
      calc: s.calc,
      index: 0,
      fullLayout: s.fullLayout,
      xaxis: s.xaxis,
      yaxis: s.yaxis,
      maxRows: 2,
    } as never);
    expect(d!.summary).toBe(
      'Heatmap "field": 2 × 2 cells. Values from 1 to 9; highest at x 1, y 0.',
    );
    expect(d!.table!.total).toBe(3);
    expect(d!.table!.rows).toHaveLength(2);
    // Every row on demand (the visible data table, E17.3), skipping cells without a value.
    const { rows, row } = d!.table!;
    expect([0, 1].map((k) => row!(k))).toEqual(rows);
    expect(row!(2)).toEqual(['0', '1', '3']);
  });

  it('takes the highest cell and the value count from calc instead of scanning the grid', () => {
    const s = calcOf({
      z: [
        [null, 4, 9],
        [9, 2, null],
      ],
    });
    // The first of equal maxima, and the finite count, as a scan finds them.
    expect(heatmapZStats(s.calc.z)).toEqual({ maxAt: 2, finite: 4 });
    // A grid calc did not build (a contour's filled copy) is scanned once, then remembered.
    const other = Float64Array.of(NaN, 1, Infinity, 7, 7, -Infinity);
    const stats = heatmapZStats(other);
    expect(stats).toEqual({ maxAt: 3, finite: 3 });
    expect(heatmapZStats(other)).toBe(stats);
    expect(heatmapZStats(new Float64Array(3).fill(NaN))).toEqual({ maxAt: -1, finite: 0 });
  });
});

describe('heatmap keyboard stops (the cell cursor loaded on first use)', () => {
  /** A 3 × 2 grid on axes 300 × 200 px showing x in [-0.5, 2.5] and y in [-0.5, 1.5]. */
  async function cursor(xRange: [number, number] = [-0.5, 2.5], trace: object = {}) {
    const s = calcOf({
      z: [
        [1, 2, 3],
        [4, 5, null],
      ],
      name: 'grid',
      ...trace,
    });
    const sized = (a: AxisInfo, range: [number, number], length: number): AxisInfo =>
      ({ ...a, scale: createScale({ type: 'linear', range, length }) }) as AxisInfo;
    const xaxis = sized(s.xaxis, xRange, 300);
    const yaxis = sized(s.yaxis, [-0.5, 1.5], 200);
    const ctx: HoverContext = {
      fullLayout: s.fullLayout,
      xaxis,
      yaxis,
      transform: {
        scaleX: 300 / (xRange[1] - xRange[0]),
        scaleY: 100,
        offsetX: (-xRange[0] * 300) / (xRange[1] - xRange[0]),
        offsetY: 50,
      },
    };
    const parts = (await gridA11y())['heatmap']!;
    return parts.keyboardPoints!(s.calc as never, s.trace, ctx)!;
  }

  it('visits the cells row by row from the top, each its hover point', async () => {
    const stops = await cursor();
    expect(stops.length).toBe(6);
    // The top row on screen is y = 1.
    expect(stops.at(0)).toMatchObject({ cell: [1, 0], hoverText: 'x: 0<br>y: 1<br>z: 4' });
    expect(stops.at(4)).toMatchObject({ cell: [0, 1], hoverText: 'x: 1<br>y: 0<br>z: 2' });
    expect(stops.at(0)!.px).toBeCloseTo(50);
    expect(stops.at(0)!.py).toBeCloseTo(150);
    expect(stops.at(6)).toBeUndefined();
    expect(stops.at(-1)).toBeUndefined();
  });

  it('leads ← / → along the row, ↑ / ↓ along the column, Home / End to the row ends', async () => {
    const stops = await cursor();
    // [←, →, ↑, ↓, Home, End] of the middle cell of the top row, then of the bottom right cell.
    expect(stops.at(1)!.nav).toEqual([0, 2, 1, 4, 0, 2]);
    expect(stops.at(5)!.nav).toEqual([4, 5, 2, 5, 3, 5]);
    expect(stops.at(4)!.say![1]).toEqual({ row: '2', rows: '2', column: '2', columns: '3' });
  });

  it('keeps a stop on a gap that is not hovered, and only the cells in view', async () => {
    const gaps = await cursor([-0.5, 2.5], { hoverongaps: false });
    expect(gaps.at(2)).toMatchObject({ x: 2, y: 1 });
    expect(gaps.at(2)!.hoverText).toBeUndefined();
    // Zoomed to the first two columns.
    const zoomed = await cursor([-0.5, 1.5]);
    expect(zoomed.length).toBe(4);
    expect(zoomed.at(1)!.nav).toEqual([0, 1, 1, 3, 0, 1]);
  });
});
