// @vitest-environment jsdom
/**
 * Multi-subplot traces (M3 wave 2, E10.9) through a real chart with a fake renderer: a `pairs`
 * trace draws every pair of its columns in its own subplot (like splom), declaring its axes and
 * subplots through core's splom stash and its cells through `TraceModule.cells`.
 */
import {
  attr,
  stashSplomAxis,
  stashSplomSubplot,
  type AxisExtremes,
  type FullTrace,
} from '@mk7s/holochart-core';
import { createMarkers, type Primitive, type Viewport } from '@mk7s/holochart-render';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { linearExtremes } from './axes.ts';
import { createChart, type Chart } from './chart.ts';
import type { SubplotInfo, TraceModule, TracePlotContext, TraceUpdatePlan } from './contracts.ts';
import { selectionContains } from './fx/geometry.ts';
import { entrySubplots, extremesOn, traceCells } from './multi-subplot.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

interface PairsCalc {
  columns: Float64Array[];
}

interface Log {
  updates: { plan: TraceUpdatePlan; cells: string[]; selected: readonly number[] | null }[];
  hovered: string[];
  disposed: number;
}

function axisIds(k: number): [string, string] {
  return k === 0 ? ['x', 'y'] : [`x${k + 1}`, `y${k + 1}`];
}

function columnsOf(trace: FullTrace): unknown[][] {
  const c = trace['columns'];
  return Array.isArray(c) ? (c as unknown[][]) : [];
}

/** Column index of axis `id` (`x2` / `y2` → 1). */
function columnOfAxis(id: string): number {
  const n = Number(id.slice(1) || '1');
  return n - 1;
}

function createPairsModule(log: Log): TraceModule<PairsCalc> {
  return {
    type: 'pairs',
    categories: ['showLegend'],
    schema: attr.object({ columns: attr.any({ editType: 'calc' }) }),
    meta: { description: 'Test pairs.' },
    supplyDefaults(_in, out, ctx) {
      const columns = ctx.coerce<unknown[][]>('columns') ?? [];
      columns.forEach((values, k) => {
        const [x, y] = axisIds(k);
        stashSplomAxis(ctx.fullLayout, x, { label: `c${k}`, data: values, trace: out });
        stashSplomAxis(ctx.fullLayout, y, { label: `c${k}`, data: values, trace: out });
      });
      for (let i = 0; i < columns.length; i++) {
        for (let j = 0; j < columns.length; j++) {
          stashSplomSubplot(ctx.fullLayout, axisIds(i)[0] + axisIds(j)[1]);
        }
      }
    },
    cells(trace) {
      const n = columnsOf(trace).length;
      const out = [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) out.push({ xaxis: axisIds(i)[0], yaxis: axisIds(j)[1] });
      }
      return out;
    },
    axisData(trace, id) {
      return columnsOf(trace)[columnOfAxis(id)];
    },
    calc(trace, ctx) {
      return {
        columns: columnsOf(trace).map((values, k) => {
          const axis = ctx.axes?.get(axisIds(k)[0]);
          return axis
            ? axis.scale.d2lArray(values, new Float64Array(values.length))
            : new Float64Array();
        }),
      };
    },
    extremes(calc) {
      const byAxis: Record<string, AxisExtremes> = {};
      calc.columns.forEach((c, k) => {
        const e = linearExtremes(c, 0);
        for (const id of axisIds(k)) byAxis[id] = e;
      });
      return { byAxis };
    },
    hoverPoints(calc, _trace, q, ctx) {
      const xa = ctx.xaxis;
      const ya = ctx.yaxis;
      if (!xa || !ya) return [];
      log.hovered.push(xa.id + ya.id);
      const x = calc.columns[columnOfAxis(xa.id)] as Float64Array;
      const y = calc.columns[columnOfAxis(ya.id)] as Float64Array;
      const t = ctx.transform;
      for (let i = 0; i < x.length; i++) {
        const px = x[i]! * t.scaleX + t.offsetX;
        const py = y[i]! * t.scaleY + t.offsetY;
        const d = Math.hypot(px - q.px, py - q.py);
        if (d <= q.distance) return [{ pointIndex: i, distance: d, px, py, x: x[i], y: y[i] }];
      }
      return [];
    },
    selectPoints(calc, _trace, query, ctx) {
      const x = calc.columns[columnOfAxis(ctx.xaxis?.id ?? 'x')] as Float64Array;
      const y = calc.columns[columnOfAxis(ctx.yaxis?.id ?? 'y')] as Float64Array;
      const out: number[] = [];
      for (let i = 0; i < x.length; i++) if (selectionContains(query, x[i]!, y[i]!)) out.push(i);
      return out;
    },
    plot: {
      create(ctx) {
        const drawn = new Map<string, { marker: Primitive<unknown>; viewport: Viewport }>();
        const sync = (c: TracePlotContext<PairsCalc>, plan: TraceUpdatePlan): void => {
          log.updates.push({
            plan: { ...plan },
            cells: (c.cells ?? []).map((sp) => sp.id),
            selected: c.selectedPoints ?? null,
          });
          const wanted = new Map((c.cells ?? []).map((sp) => [sp.id, sp] as const));
          for (const [id, d] of drawn) {
            if (wanted.get(id)?.viewport === d.viewport) continue;
            c.remove(d.marker);
            drawn.delete(id);
          }
          for (const [id, sp] of wanted) {
            if (!drawn.has(id)) {
              const marker = createMarkers(c.primitives, { x: [0], y: [0] });
              c.add(marker, sp.viewport);
              drawn.set(id, { marker, viewport: sp.viewport });
            }
            drawn.get(id)?.marker.setTransform(sp.transform);
          }
        };
        sync(ctx, { calc: true, plot: true, style: true, transform: true });
        return {
          update: sync,
          dispose() {
            log.disposed++;
          },
        };
      },
    },
  };
}

let t: TestSetup;
let log: Log;
let charts: Chart[] = [];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  log = { updates: [], hovered: [], disposed: 0 };
  t.registry.register(createPairsModule(log));
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
});

async function chart(data: unknown[], layout: Record<string, unknown> = {}): Promise<Chart> {
  const c = createChart(
    t.container,
    { data, layout: { margin: { l: 40, r: 20, t: 20, b: 40 }, ...layout } },
    t.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

const PAIRS = {
  type: 'pairs',
  columns: [
    [0, 1, 2],
    [10, 20, 30],
  ],
};

function fire(c: Chart, type: string, x: number, y: number): void {
  c.three.root.canvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      bubbles: true,
    }),
  );
}

function at(sp: SubplotInfo, x: number, y: number): [number, number] {
  return [sp.xaxis.l2c(x), sp.yaxis.l2c(y)];
}

describe('multi-subplot traces', () => {
  it('draw into every cell subplot through ctx.cells and cell viewports', async () => {
    const c = await chart([PAIRS]);
    expect([...c.subplots.keys()].sort()).toEqual(['x2y', 'x2y2', 'xy', 'xy2']);
    expect(log.updates[0]?.cells.sort()).toEqual(['x2y', 'x2y2', 'xy', 'xy2']);
    for (const sp of c.subplots.values()) expect(sp.viewport.primitives.size).toBe(1);
    expect(c.getTraceObjects(0)).toHaveLength(4);
    // Removing the trace removes its primitives from the cell viewports.
    await c.react({ data: [] });
    expect(log.disposed).toBe(1);
    expect(c.getTraceObjects(0)).toHaveLength(0);
  });

  it('autorange each axis from extremes.byAxis', async () => {
    const c = await chart([PAIRS]);
    const x2 = c.fullLayout?.['xaxis2'] as { range: number[] };
    const y2 = c.fullLayout?.['yaxis2'] as { range: number[] };
    expect(x2.range[0]).toBeLessThanOrEqual(10);
    expect(x2.range[1]).toBeGreaterThanOrEqual(30);
    expect(y2.range).toEqual(x2.range);
    const x = c.fullLayout?.['xaxis'] as { range: number[] };
    expect(x.range[1]).toBeLessThan(10);
  });

  it('collect categories from axisData and recalc when an axis is rescaled', async () => {
    const c = await chart([
      {
        type: 'pairs',
        columns: [
          ['a', 'b', 'c'],
          [1, 2, 3],
        ],
      },
    ]);
    expect((c.fullLayout?.['xaxis'] as { type: string }).type).toBe('category');
    const xa = c.subplots.get('xy')?.xaxis;
    expect(xa?.scale.d2l('c')).toBe(2);
    const updates = log.updates.length;
    await c.relayout({ 'xaxis.categoryorder': 'category descending' });
    expect(xa?.scale.d2l('c')).toBe(0);
    expect(log.updates.slice(updates).some((u) => u.plan.calc)).toBe(true);
  });

  it('hover per cell, with that cell’s axes', async () => {
    const c = await chart([PAIRS]);
    const sp = c.subplots.get('x2y') as SubplotInfo;
    const p = at(sp, 20, 1);
    fire(c, 'pointermove', p[0], p[1]);
    t.scheduler.step();
    expect(log.hovered).toContain('x2y');
    expect(log.hovered).not.toContain('xy2');
  });

  it('re-hover the same point in another cell (the label moves, hover is emitted again)', async () => {
    const c = await chart([PAIRS]);
    const hovers: unknown[] = [];
    c.on('hover', (e) => void hovers.push(e));
    const a = at(c.subplots.get('x2y') as SubplotInfo, 20, 1);
    fire(c, 'pointermove', a[0], a[1]);
    t.scheduler.step();
    const b = at(c.subplots.get('xy2') as SubplotInfo, 1, 20);
    fire(c, 'pointermove', b[0], b[1]);
    t.scheduler.step();
    expect(hovers).toHaveLength(2);
    const points = hovers.map((h) => (h as { points: { pointNumber: number }[] }).points[0]);
    expect(points.map((p) => p?.pointNumber)).toEqual([1, 1]);
  });

  it('select in one cell: the trace’s selection reaches the view (every cell)', async () => {
    const c = await chart([PAIRS], { dragmode: 'select' });
    const sp = c.subplots.get('xy2') as SubplotInfo;
    // x = column 0 in [0.5, 2.5], y = column 1 in [15, 35] → points 1 and 2.
    const from = at(sp, 0.5, 15);
    const to = at(sp, 2.5, 35);
    fire(c, 'pointerdown', from[0], from[1]);
    fire(c, 'pointermove', to[0], to[1]);
    t.scheduler.step();
    fire(c, 'pointerup', to[0], to[1]);
    await c.relayout({});
    const last = log.updates[log.updates.length - 1];
    expect(last?.selected).toEqual([1, 2]);
    expect(last?.cells).toHaveLength(4);
  });

  it('get transform-only updates while panning any cell', async () => {
    const c = await chart([PAIRS], { dragmode: 'pan' });
    const sp = c.subplots.get('x2y2') as SubplotInfo;
    const [x0, y0] = at(sp, 20, 20);
    const before = log.updates.length;
    fire(c, 'pointerdown', x0, y0);
    fire(c, 'pointermove', x0 + 30, y0);
    t.scheduler.step();
    const preview = log.updates.slice(before);
    expect(preview.length).toBeGreaterThan(0);
    expect(preview.every((u) => u.plan.transform && !u.plan.calc && !u.plan.style)).toBe(true);
    expect(preview[0]?.cells).toHaveLength(4);
    fire(c, 'pointerup', x0 + 30, y0);
    await c.relayout({});
  });
});

describe('multi-subplot helpers', () => {
  const module = { cells: () => [{ xaxis: 'x2', yaxis: 'y' }] } as unknown as TraceModule;
  const trace = { type: 't', xaxis: 'x', yaxis: 'y' } as unknown as FullTrace;
  const subplots = new Map([
    ['xy', 'A'],
    ['x2y', 'B'],
  ]);

  it('list cells, or the trace’s own subplot', () => {
    expect(traceCells(module, trace, subplots)).toEqual(['B']);
    expect(traceCells(undefined, trace, subplots)).toBeUndefined();
    expect(entrySubplots(module, trace, subplots)).toEqual(['B']);
    expect(entrySubplots(undefined, trace, subplots)).toEqual(['A']);
  });

  it('read extremes by axis id, or by letter on the trace’s own axes', () => {
    const e = { min: [], max: [] };
    expect(extremesOn({ byAxis: { x2: e } }, trace, { id: 'x2', letter: 'x' })).toBe(e);
    expect(extremesOn({ byAxis: { x2: e } }, trace, { id: 'x', letter: 'x' })).toBeUndefined();
    expect(extremesOn({ x: e }, trace, { id: 'x', letter: 'x' })).toBe(e);
    expect(extremesOn({ x: e }, trace, { id: 'x2', letter: 'x' })).toBeUndefined();
  });
});
