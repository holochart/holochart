import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import {
  createResourceManager,
  HeatmapPrimitive,
  IDENTITY_TRANSFORM,
  LazyFillPrimitive,
  LinePrimitive,
  TextPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type HoverContext,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import type { ContourTraceCalc } from './calc.ts';
import { contour } from './index.ts';
import { nearestPoint } from './hover.ts';

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

const registry = createChartRegistry().register(contour);

function axis(fullLayout: FullLayout, id: 'x' | 'y', type = 'linear'): AxisInfo {
  const scale = createScale({ type: type as 'linear', range: [-5, 5], length: 400 });
  const full = { ...(fullLayout[`${id}axis`] as FullAxis), type } as FullAxis;
  return { id, name: `${id}axis`, letter: id, type, scale, full } as unknown as AxisInfo;
}

/** A cone: z = 10 − distance from (2, 2), on a 5 × 5 grid. */
function cone(n = 5, c = 2): number[][] {
  const z: number[][] = [];
  for (let j = 0; j < n; j++) {
    const row: number[] = [];
    for (let i = 0; i < n; i++) row.push(10 - Math.hypot(i - c, j - c));
    z.push(row);
  }
  return z;
}

/** z = x on a grid with columns at `xs`, 3 rows. */
function ramp(xs: number[]): number[][] {
  return [0, 1, 2].map(() => xs.slice());
}

function setup(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'contour', ...trace }], layout },
    registry.core,
  );
  const xaxis = axis(fullLayout, 'x');
  const yaxis = axis(fullLayout, 'y');
  const ctx: CalcContext = { fullLayout, index: 0, xaxis, yaxis };
  const t = fullData[0]!;
  const calc = contour.calc!(t, ctx);
  return { trace: t, fullLayout, calc, xaxis, yaxis, ctx };
}

function contours(t: Record<string, unknown>): Record<string, unknown> {
  return t['contours'] as Record<string, unknown>;
}

describe('contour defaults', () => {
  it('needs a usable z', () => {
    expect(setup({}).trace.visible).toBe(false);
    expect(
      setup({
        z: [
          [1, 'a'],
          ['b', 2],
        ],
      }).trace.visible,
    ).toBe(true);
    expect(setup({ z: [['a', 'b']] }).trace.visible).toBe(false);
    // Column z needs x and y.
    expect(setup({ z: [1, 2, 3] }).trace.visible).toBe(false);
    expect(setup({ z: [1, 2, 3], x: [0, 1, 0], y: [0, 0, 1] }).trace.visible).toBe(true);
  });

  it('defaults like Plotly: automatic levels, filled, no automatic colorscale, no legend', () => {
    const { trace } = setup({ z: cone() });
    expect(trace['autocontour']).toBe(true);
    expect(trace['ncontours']).toBe(15);
    expect(contours(trace)['coloring']).toBe('fill');
    expect(contours(trace)['type']).toBe('levels');
    expect(trace['autocolorscale']).toBe(false);
    expect(trace['showlegend']).toBe(false);
    expect(trace['connectgaps']).toBe(false);
    expect((trace['line'] as Record<string, unknown>)['width']).toBe(0.5);
    const col = setup({ z: [1, 2, 3, 4], x: [0, 1, 0, 1], y: [0, 0, 1, 1] }).trace;
    expect(col['connectgaps']).toBe(true);
    const manual = setup({ z: cone(), contours: { start: 6, end: 9 } }).trace;
    expect(manual['autocontour']).toBe(false);
  });

  it('defaults constraint contours: 2 px lines, half-transparent fill, a value per operation', () => {
    const eq = setup({ z: cone(), contours: { type: 'constraint', value: 8 } }).trace;
    expect(contours(eq)['operation']).toBe('=');
    expect(contours(eq)['value']).toBe(8);
    expect(eq['fillcolor']).toBeUndefined();
    const line = eq['line'] as Record<string, unknown>;
    expect(line['width']).toBe(2);
    expect(typeof line['color']).toBe('string');
    expect(eq['colorscale']).toBeUndefined();

    const ge = setup({
      z: cone(),
      contours: { type: 'constraint', operation: '>=', value: 8 },
      line: { color: '#ff0000' },
    }).trace;
    expect(ge['fillcolor']).toBe('rgba(255, 0, 0, 0.5)');
    expect((ge['line'] as Record<string, unknown>)['color']).toBe('rgb(255, 0, 0)');

    const auto = setup({ z: cone(), contours: { type: 'constraint', operation: '<' } }).trace;
    const fill = auto['fillcolor'] as string;
    expect(fill).toMatch(/^rgba\(.*, 0\.5\)$/);
    expect((auto['line'] as Record<string, unknown>)['color']).toBe(
      fill.replace(/^rgba\((.*), 0\.5\)$/, 'rgb($1)'),
    );

    const interval = setup({
      z: cone(),
      contours: { type: 'constraint', operation: '[]', value: 7 },
    }).trace;
    expect(contours(interval)['value']).toEqual([7, 8]);
  });

  it('coerces cell labels only for heatmap coloring', () => {
    const plain = setup({ z: cone(), texttemplate: '%{z}' }).trace;
    expect(plain['texttemplate']).toBeUndefined();
    const heat = setup({
      z: cone(),
      texttemplate: '%{z}',
      contours: { coloring: 'heatmap' },
    }).trace;
    expect(heat['texttemplate']).toBe('%{z}');
  });
});

describe('contour calc', () => {
  it('contours the grid points and autoranges to them', () => {
    const { calc } = setup({ z: cone(), x: [10, 11, 12, 13, 14], y: [0, 2, 4, 6, 8] });
    expect(calc.nx).toBe(5);
    expect(Array.from(calc.x.centers)).toEqual([10, 11, 12, 13, 14]);
    expect(calc.bounds).toEqual({ x0: 10, x1: 14, y0: 0, y1: 8 });
    expect(contour.extremes!(calc, {} as never, {} as never)).toMatchObject({
      x: expect.anything(),
      y: expect.anything(),
    });
    // Cell edges halfway between points, for the heatmap coloring.
    expect(Array.from(calc.x.edges)).toEqual([9.5, 10.5, 11.5, 12.5, 13.5, 14.5]);
    expect(calc.levels.levels.length).toBeGreaterThan(3);
    for (const paths of calc.paths) {
      for (const p of paths) {
        for (let k = 0; k < p.x.length; k++) {
          expect(p.x[k]).toBeGreaterThanOrEqual(10 - 1e-9);
          expect(p.x[k]).toBeLessThanOrEqual(14 + 1e-9);
        }
      }
    }
  });

  it('places crossings by interpolating between uneven grid points', () => {
    // z = column index on uneven x: level 1.5 sits halfway between x = 1 and x = 10.
    const xs = [0, 1, 10, 11];
    const { calc } = setup({
      z: ramp([0, 1, 2, 3]),
      x: xs,
      contours: { start: 1.5, end: 1.5, size: 1, coloring: 'lines' },
      line: { smoothing: 0 },
    });
    expect(calc.levels.levels).toEqual([1.5]);
    const [path] = calc.paths[0]!;
    expect(Array.from(path!.x).every((v) => Math.abs(v - 5.5) < 1e-9)).toBe(true);
  });

  it('reads only the first n x values (Plotly contours never take cell edges)', () => {
    const { calc } = setup({ z: ramp([0, 1, 2]), x: [0, 1, 4, 9] });
    expect(Array.from(calc.x.centers)).toEqual([0, 1, 4]);
  });

  it('uses x0 / dx, transpose and column data', () => {
    const a = setup({ z: cone(3, 1), x0: 5, dx: 2 }).calc;
    expect(Array.from(a.x.centers)).toEqual([5, 7, 9]);
    const t = setup({
      z: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      transpose: true,
    }).calc;
    expect([t.nx, t.ny]).toEqual([2, 3]);
    const col = setup({
      z: [1, 2, 3, 4, 5, 6],
      x: [0, 1, 2, 0, 1, 2],
      y: [0, 0, 0, 5, 5, 5],
    }).calc;
    expect([col.nx, col.ny]).toEqual([3, 2]);
    expect(Array.from(col.y.centers)).toEqual([0, 5]);
  });

  it('follows ncontours and manual levels', () => {
    const auto = setup({ z: cone(), ncontours: 4 }).calc;
    expect(auto.levels.levels.length).toBeLessThanOrEqual(4);
    const manual = setup({ z: cone(), contours: { start: 7, end: 9.5, size: 0.5 } }).calc;
    expect(manual.levels.levels).toEqual([7, 7.5, 8, 8.5, 9, 9.5]);
    expect(manual.regions).toHaveLength(6);
    const lines = setup({ z: cone(), contours: { coloring: 'lines' } }).calc;
    expect(lines.regions).toBeUndefined();
  });

  it('fills gaps for contouring; connectgaps false clips the drawing to the data', () => {
    // z = x with a gap at column 2 of the middle row: the level 2.2 line x = 2.2 runs through
    // the gap's diamond (|dx| + |dy| < 0.9 around (2, 1)) from y = 0.3 to 1.7.
    const z = ramp([0, 1, 2, 3, 4]);
    z[1]![2] = NaN;
    const level = { contours: { start: 2.2, end: 2.2, size: 1, coloring: 'lines' } };
    const clipped = setup({ z, ...level }).calc;
    expect(clipped.zFilled[7]).toBeCloseTo(2, 12);
    expect(Number.isNaN(clipped.z[7]!)).toBe(true);
    expect(clipped.heatmapZ).toBe(clipped.z);
    expect(clipped.mask).toBeDefined();
    const pieces = clipped.paths[0]!;
    expect(pieces).toHaveLength(2);
    const ends = pieces.flatMap((p) => [p.y[0]!, p.y[p.y.length - 1]!]).sort();
    expect(ends[1]).toBeCloseTo(0.3, 9);
    expect(ends[2]).toBeCloseTo(1.7, 9);
    const connected = setup({ z, connectgaps: true, ...level }).calc;
    expect(connected.mask).toBeUndefined();
    expect(connected.paths[0]).toHaveLength(1);
    expect(connected.z[7]).toBeCloseTo(2, 12);
  });

  it('shades constraint regions', () => {
    const above = setup({
      z: ramp([0, 1, 2, 3, 4]),
      contours: { type: 'constraint', operation: '>=', value: 2.5 },
    }).calc;
    expect(above.constraint).toEqual({ operation: '>=', value: 2.5 });
    expect(above.levels.levels).toEqual([2.5]);
    expect(above.regions).toHaveLength(1);
    const eq = setup({
      z: ramp([0, 1, 2, 3, 4]),
      contours: { type: 'constraint', operation: '=', value: 2.5 },
    }).calc;
    expect(eq.regions).toBeUndefined();
    expect(eq.paths[0]!.length).toBe(1);
  });
});

describe('contour view', () => {
  function plotCtx(trace: Record<string, unknown>) {
    const s = setup(trace);
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<ContourTraceCalc> = {
      trace: s.trace,
      calc: s.calc,
      index: 0,
      fullLayout: s.fullLayout,
      subplot: { rect: { x: 0, y: 0, width: 400, height: 300 } } as never,
      xaxis: s.xaxis,
      yaxis: s.yaxis,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 80, scaleY: 60, offsetX: 20, offsetY: 20 },
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

  it('draws fills and lines, a heatmap for heatmap coloring, and labels', () => {
    const filled = plotCtx({ z: cone() });
    contour.plot!.create(filled.ctx);
    expect(filled.added.map((p) => p.constructor)).toEqual([LazyFillPrimitive, LinePrimitive]);
    const heat = plotCtx({ z: cone(), contours: { coloring: 'heatmap' } });
    contour.plot!.create(heat.ctx);
    expect(heat.added[0]).toBeInstanceOf(HeatmapPrimitive);
    const labelled = plotCtx({ z: cone(), contours: { coloring: 'lines', showlabels: true } });
    contour.plot!.create(labelled.ctx);
    expect(labelled.added.some((p) => p instanceof TextPrimitive)).toBe(true);
    // Labels without lines (Plotly positions them on the hidden lines).
    const bare = plotCtx({ z: cone(), contours: { showlines: false, showlabels: true } });
    contour.plot!.create(bare.ctx);
    expect(bare.added.map((p) => p.constructor)).toEqual([LazyFillPrimitive, TextPrimitive]);
  });

  it('fills constraint regions; a = constraint is its line', () => {
    const shaded = plotCtx({
      z: ramp([0, 1, 2, 3, 4]),
      contours: { type: 'constraint', operation: '<', value: 2 },
      fillcolor: 'rgba(0, 0, 255, 0.25)',
    });
    contour.plot!.create(shaded.ctx);
    expect(shaded.added.map((p) => p.constructor)).toEqual([LazyFillPrimitive, LinePrimitive]);
    const eq = plotCtx({ z: ramp([0, 1, 2, 3, 4]), contours: { type: 'constraint', value: 2 } });
    contour.plot!.create(eq.ctx);
    expect(eq.added.map((p) => p.constructor)).toEqual([LinePrimitive]);
    const bare = plotCtx({
      z: ramp([0, 1, 2, 3, 4]),
      contours: { type: 'constraint', operation: '>', value: 2, showlines: false },
    });
    contour.plot!.create(bare.ctx);
    expect(bare.added.map((p) => p.constructor)).toEqual([LazyFillPrimitive]);
  });
});

describe('contour hover, colorbar and description', () => {
  it('snaps to the nearest grid point, halfway between points', () => {
    expect(nearestPoint([0, 1, 10], 5.4)).toBe(1);
    expect(nearestPoint([0, 1, 10], 5.6)).toBe(2);
    expect(nearestPoint([10, 1, 0], 5.6)).toBe(0);
    expect(nearestPoint([0, 1, 10], 11)).toBe(-1);
    const { calc, trace, fullLayout, xaxis, yaxis } = setup({ z: cone(), x: [0, 1, 2, 3, 4] });
    const ctx: HoverContext = { fullLayout, xaxis, yaxis, transform: IDENTITY_TRANSFORM };
    const [p] = contour.hoverPoints!(
      calc,
      trace,
      { px: 0, py: 0, xl: 2.3, yl: 1.8, mode: 'closest', distance: 20 },
      ctx,
    );
    expect(p!.labels).toEqual({ x: '2', y: '2', z: '10' });
    expect(p!.cell).toEqual([2, 2]);
    expect(p!.px).toBe(2);
    expect(
      contour.hoverPoints!(
        calc,
        trace,
        { px: 0, py: 0, xl: 4.2, yl: 1, mode: 'closest', distance: 20 },
        ctx,
      ),
    ).toEqual([]);
  });

  it('hovers gaps drawn as holes with an empty z, or not at all without hoverongaps', () => {
    const z = cone();
    z[2]![2] = NaN;
    const a = setup({ z });
    const ctx: HoverContext = {
      fullLayout: a.fullLayout,
      xaxis: a.xaxis,
      yaxis: a.yaxis,
      transform: IDENTITY_TRANSFORM,
    };
    const query = { px: 0, py: 0, xl: 2, yl: 2, mode: 'closest', distance: 20 } as const;
    expect(contour.hoverPoints!(a.calc, a.trace, query, ctx)[0]!.labels!['z']).toBe('');
    const b = setup({ z, hoverongaps: false });
    expect(contour.hoverPoints!(b.calc, b.trace, query, ctx)).toEqual([]);
    const c = setup({ z, connectgaps: true });
    expect(contour.hoverPoints!(c.calc, c.trace, query, ctx)[0]!.labels!['z']).not.toBe('');
  });

  it('colors constraint hover labels with the fill', () => {
    const s = setup({
      z: cone(),
      contours: { type: 'constraint', operation: '>', value: 8 },
      fillcolor: 'rgba(255, 0, 0, 0.3)',
    });
    const ctx: HoverContext = {
      fullLayout: s.fullLayout,
      xaxis: s.xaxis,
      yaxis: s.yaxis,
      transform: IDENTITY_TRANSFORM,
    };
    const [p] = contour.hoverPoints!(
      s.calc,
      s.trace,
      { px: 0, py: 0, xl: 1, yl: 1, mode: 'closest', distance: 20 },
      ctx,
    );
    expect(p!.color).toBe('rgb(255, 0, 0)');
  });

  it('shows banded colorbars for levels and none for constraints', () => {
    const s = setup({ z: cone() });
    const bar = contour.colorbar!(s.trace, { fullLayout: s.fullLayout } as never);
    expect(bar).not.toBeNull();
    // Hard steps: every stop color appears twice.
    expect(bar!.colorscale.length % 2).toBe(0);
    const c = setup({ z: cone(), contours: { type: 'constraint', operation: '<', value: 8 } });
    expect(contour.colorbar!(c.trace, { fullLayout: c.fullLayout } as never)).toBeNull();
  });

  it('describes the grid and its levels', () => {
    const s = setup({ z: cone(), contours: { start: 7, end: 9, size: 1 } });
    const ctx = {
      trace: s.trace,
      calc: s.calc,
      index: 0,
      fullLayout: s.fullLayout,
      xaxis: s.xaxis,
      yaxis: s.yaxis,
      maxRows: 3,
    };
    const d = contour.describe!(ctx as never);
    expect(d!.summary).toContain('5 × 5 grid, 3 levels from 7 to 9');
    expect(d!.summary).toContain('Highest value 10 at x 2, y 2');
    expect(d!.table!.rows).toHaveLength(3);
    expect(d!.table!.total).toBe(25);
    // Every grid point on demand (the visible data table, E17.3).
    const { rows, row } = d!.table!;
    expect([0, 1, 2].map((k) => row!(k))).toEqual(rows);
    const all = contour.describe!({ ...ctx, maxRows: 100 } as never)!.table!.rows;
    expect(all.map((_, k) => row!(k))).toEqual(all);
    expect(row!(24)).toEqual(['4', '4', all[24]![2]]);
  });
});
