import {
  createScale,
  supplyDefaults,
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
  type CalcContext,
  type HoverContext,
  type HoverQuery,
  type TracePlotContext,
  type TraceUpdatePlan,
} from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { histogram2dcontour } from '../histogram2dcontour/index.ts';
import { binSamples2d, MAX_CELLS, type Histogram2dCalc } from './calc.ts';
import { recordedZExtent, zDomain } from './colorscale.ts';
import { binAt } from './hover.ts';
import { histogram2d } from './index.ts';
import { heatmapRenderOrder } from './plot.ts';
import { autoCellFontSize, cellTexts } from './text.ts';

// troika typesets in a worker with browser globals; the view tests only need its object graph.
// Mocked by path: traces-stats does not depend on troika, render does.
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

const registry = createChartRegistry().register(histogram2d, histogram2dcontour);

/** Deterministic PRNG (mulberry32) and normal samples. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normals(n: number, seed: number): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const u = 1 - r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  });
}

function axis(fullLayout: FullLayout, id: 'x' | 'y', type: AxisType = 'linear'): AxisInfo {
  const scale = createScale({ type, range: [-5, 5] });
  const full = { ...(fullLayout[`${id}axis`] as FullAxis), type } as FullAxis;
  return { id, name: `${id}axis`, letter: id, type, scale, full } as unknown as AxisInfo;
}

function setup(data: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  const traces = data.map((t) => ({ type: 'histogram2d', ...t }));
  const { fullData, fullLayout } = supplyDefaults({ data: traces, layout }, registry.core);
  const xaxis = axis(fullLayout, 'x');
  const yaxis = axis(fullLayout, 'y');
  const ctx = (index: number): CalcContext => ({ fullLayout, index, xaxis, yaxis });
  return { fullData, fullLayout, xaxis, yaxis, ctx };
}

function calcOf(data: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  const s = setup(data, layout);
  const calcs = s.fullData.map((t, i) => histogram2d.calc!(t, s.ctx(i)));
  return { ...s, calcs, calc: calcs[0]! };
}

/** Naive reference: bin by scanning the edges, aggregate like Plotly. */
function reference(
  x: readonly number[],
  y: readonly number[],
  xe: ArrayLike<number>,
  ye: ArrayLike<number>,
  func: 'count' | 'sum' | 'avg' | 'min' | 'max' = 'count',
  z?: readonly number[],
): number[] {
  const nx = xe.length - 1;
  const ny = ye.length - 1;
  const find = (e: ArrayLike<number>, v: number): number => {
    for (let i = 0; i < e.length - 1; i++) if (v >= e[i]! && v < e[i + 1]!) return i;
    return -1;
  };
  const init = func === 'min' || func === 'max' ? NaN : 0;
  const out = new Array<number>(nx * ny).fill(init);
  const counts = new Array<number>(nx * ny).fill(0);
  for (let k = 0; k < x.length; k++) {
    const i = find(xe, x[k]!);
    const j = find(ye, y[k]!);
    if (i < 0 || j < 0) continue;
    const c = j * nx + i;
    const v = z?.[k] ?? 1;
    counts[c]!++;
    if (func === 'count') out[c]!++;
    else if (func === 'sum' || func === 'avg') out[c]! += v;
    else if (func === 'min') out[c] = Number.isNaN(out[c]!) ? v : Math.min(out[c]!, v);
    else out[c] = Number.isNaN(out[c]!) ? v : Math.max(out[c]!, v);
  }
  if (func === 'avg') return out.map((s, c) => (counts[c] ? s / counts[c]! : NaN));
  return out;
}

const X = normals(800, 1);
const Y = normals(800, 2).map((v, i) => 0.5 * X[i]! + v);
const Z = normals(800, 3).map((v) => 10 + v);
const BINS = { xbins: { start: -3, end: 3, size: 0.5 }, ybins: { start: -4, end: 4, size: 1 } };

describe('histogram2d defaults', () => {
  it('needs both x and y', () => {
    const { fullData } = setup([{ x: [1, 2] }, { y: [1] }, { x: [1, 2, 3], y: [1, 2] }]);
    expect(fullData[0]!.visible).toBe(false);
    expect(fullData[1]!.visible).toBe(false);
    expect(fullData[2]!.visible).toBe(true);
    expect(fullData[2]!['_length']).toBe(2);
  });

  it('aggregates only with z or marker.color, and hides the legend entry by default', () => {
    const { fullData } = setup([
      { x: [1], y: [1], histfunc: 'sum' },
      { x: [1], y: [1], z: [3], histfunc: 'sum' },
      { x: [1], y: [1], marker: { color: [3] }, histfunc: 'max', showlegend: true },
    ]);
    expect(fullData.map((t) => t['histfunc'])).toEqual(['count', 'sum', 'max']);
    expect(fullData.map((t) => t['showlegend'])).toEqual([false, false, true]);
  });

  it("uses Plotly's heatmap colorscale defaults (RdBu, no autocolorscale, colorbar on)", () => {
    const { fullData } = setup([{ x: [1], y: [1] }]);
    const t = fullData[0]!;
    expect(t['colorscale']).toBe('RdBu');
    expect(t['autocolorscale']).toBe(false);
    expect(t['showscale']).toBe(true);
    expect(t['zauto']).toBe(true);
    expect(t['colorbar']).toBeTypeOf('object');
  });

  it('coerces gaps only without smoothing', () => {
    const { fullData } = setup([
      { x: [1], y: [1], xgap: 2 },
      { x: [1], y: [1], xgap: 2, zsmooth: 'best' },
    ]);
    expect(fullData[0]!['xgap']).toBe(2);
    expect(fullData[1]!['xgap']).toBeUndefined();
  });

  it('keeps only coloraxis when linked to a color axis', () => {
    const { fullData, fullLayout } = setup([{ x: [1], y: [1], coloraxis: 'coloraxis', zmin: 0 }]);
    expect(fullData[0]!['coloraxis']).toBe('coloraxis');
    expect(fullData[0]!['zmin']).toBeUndefined();
    expect(fullLayout['coloraxis']).toBeTypeOf('object');
  });
});

describe('histogram2d calc (CPU binning vs a reference)', () => {
  it('counts samples per cell with explicit bins', () => {
    const { calc } = calcOf([{ x: X, y: Y, ...BINS }]);
    expect(calc.nx).toBe(12);
    expect(calc.ny).toBe(8);
    expect([...calc.x.edges]).toEqual(Array.from({ length: 13 }, (_, i) => -3 + 0.5 * i));
    expect([...calc.z]).toEqual(reference(X, Y, calc.x.edges, calc.y.edges));
    const inside = X.filter((x, i) => x >= -3 && x < 3 && Y[i]! >= -4 && Y[i]! < 4).length;
    expect(calc.binned).toBe(inside);
  });

  it.each(['sum', 'avg', 'min', 'max'] as const)('aggregates z with histfunc %s', (func) => {
    const { calc } = calcOf([{ x: X, y: Y, z: Z, histfunc: func, ...BINS }]);
    const ref = reference(X, Y, calc.x.edges, calc.y.edges, func, Z);
    ref.forEach((v, c) => {
      if (Number.isNaN(v)) expect(calc.z[c]).toBeNaN();
      else expect(calc.z[c]).toBeCloseTo(v, 9);
    });
    if (func !== 'sum') expect([...calc.z].some(Number.isNaN)).toBe(true);
  });

  it('normalizes with histnorm', () => {
    const area = 0.5 * 1;
    const sum = (c: Histogram2dCalc) => c.z.reduce((a, b) => a + b, 0);
    const n = calcOf([{ x: X, y: Y, ...BINS }]).calc.binned;
    expect(sum(calcOf([{ x: X, y: Y, ...BINS, histnorm: 'percent' }]).calc)).toBeCloseTo(100, 9);
    expect(sum(calcOf([{ x: X, y: Y, ...BINS, histnorm: 'probability' }]).calc)).toBeCloseTo(1, 9);
    expect(sum(calcOf([{ x: X, y: Y, ...BINS, histnorm: 'density' }]).calc) * area).toBeCloseTo(
      n,
      6,
    );
    const pd = calcOf([{ x: X, y: Y, ...BINS, histnorm: 'probability density' }]).calc;
    expect(sum(pd) * area).toBeCloseTo(1, 9);
  });

  it('bins every sample with automatic bins (nice, uniform, n^0.25 sizes)', () => {
    const { calc } = calcOf([{ x: X, y: Y }]);
    expect(calc.binned).toBe(X.length);
    expect(calc.x.uniform).toBe(true);
    const w = calc.x.edges[1]! - calc.x.edges[0]!;
    expect([0.1, 0.2, 0.5, 1, 2]).toContain(Number(w.toFixed(6)));
    expect([...calc.z]).toEqual(reference(X, Y, calc.x.edges, calc.y.edges));
  });

  it('honors nbinsx / nbinsy as a maximum', () => {
    const { calc } = calcOf([{ x: X, y: Y, nbinsx: 5, nbinsy: 4 }]);
    expect(calc.nx).toBeLessThanOrEqual(7);
    expect(calc.ny).toBeLessThanOrEqual(6);
  });

  it('shares bins across a bingroup', () => {
    const { calcs } = calcOf([
      { x: X, y: Y, bingroup: 'g' },
      { x: X.map((v) => v * 2 + 3), y: Y, bingroup: 'g' },
    ]);
    expect(calcs[0]!.x.edges[1]! - calcs[0]!.x.edges[0]!).toBe(
      calcs[1]!.x.edges[1]! - calcs[1]!.x.edges[0]!,
    );
    expect(calcs[0]!.y.edges).toEqual(calcs[1]!.y.edges);
  });

  it('lists the samples of every cell', () => {
    const { calc } = calcOf([{ x: X, y: Y, ...BINS }]);
    for (let c = 0; c < calc.nx * calc.ny; c++) {
      const members = calc.cellPoints.subarray(calc.cellStart[c]!, calc.cellStart[c + 1]!);
      expect(members.length).toBe(calc.z[c]);
      for (const k of members) {
        expect(binAt(calc.x, X[k]!) + binAt(calc.y, Y[k]!) * calc.nx).toBe(c);
      }
    }
  });

  it('bins category and log axes in calc space', () => {
    const s = setup([{ x: ['a', 'b', 'b', 'c'], y: [1, 10, 100, 1000] }]);
    const xaxis = {
      ...axis(s.fullLayout, 'x', 'category'),
      scale: createScale({ type: 'category', categories: ['a', 'b', 'c'] }),
    } as AxisInfo;
    const yaxis = axis(s.fullLayout, 'y', 'log');
    const calc = binSamples2d(s.fullData[0]!, { fullLayout: s.fullLayout, xaxis, yaxis });
    expect(calc.binned).toBe(4);
    // Log bins are linear in data units; their edges are drawn in log10.
    for (let j = 0; j < calc.ny; j++) {
      expect(calc.y.edges[j + 1]!).toBeGreaterThan(calc.y.edges[j]!);
    }
  });

  it('refuses grids above MAX_CELLS', () => {
    const warn = vi.fn();
    const s = setup([{ x: [0, 1], y: [0, 1], xbins: { size: 1e-4 }, ybins: { size: 1e-4 } }]);
    const calc = binSamples2d(s.fullData[0]!, s.ctx(0), { warn });
    expect(calc.nx).toBe(0);
    expect(warn).toHaveBeenCalled();
    expect(MAX_CELLS).toBe(4096 * 4096);
  });

  it('bins a million samples fast enough for the CPU path (GPU aggregation deferred)', () => {
    const n = 1_000_000;
    const r = rng(9);
    const x = new Float64Array(n).map(() => r());
    const y = new Float64Array(n).map(() => r());
    const s = setup([{ x, y, xbins: { start: 0, end: 1, size: 0.01 }, ybins: { size: 0.01 } }]);
    const t0 = performance.now();
    const calc = binSamples2d(s.fullData[0]!, s.ctx(0));
    const ms = performance.now() - t0;
    expect(calc.binned).toBe(n);
    // Generous bound (CI machines vary); typically well under 200 ms.
    expect(ms).toBeLessThan(3000);
  });

  it('reports autorange extremes edge to edge', () => {
    const { calc, fullData, ctx } = calcOf([{ x: X, y: Y, ...BINS }]);
    const ext = histogram2d.extremes!(calc, fullData[0]!, ctx(0));
    expect(ext.x!.min[0]!.l).toBe(-3);
    expect(ext.x!.max[0]!.l).toBe(3);
    expect(ext.y!.min[0]!.l).toBe(-4);
  });
});

describe('histogram2d hover', () => {
  function hover(
    calc: Histogram2dCalc,
    trace: FullTrace,
    fullLayout: FullLayout,
    xl: number,
    yl: number,
  ) {
    const s = { xaxis: axis(fullLayout, 'x'), yaxis: axis(fullLayout, 'y') };
    const ctx: HoverContext = {
      fullLayout,
      ...s,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 10, scaleY: 10, offsetX: 100, offsetY: 100 },
    };
    const query: HoverQuery = { px: 0, py: 0, xl, yl, mode: 'closest', distance: 20 };
    return histogram2d.hoverPoints!(calc, trace, query, ctx);
  }

  it('reports the cell under the pointer with bin ranges and its value', () => {
    const x = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const y = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    const { calc, fullData, fullLayout } = calcOf([
      {
        x,
        y,
        xbins: { start: -0.5, end: 9.5, size: 5 },
        ybins: { start: -0.5, end: 1.5, size: 1 },
      },
    ]);
    const [p] = hover(calc, fullData[0]!, fullLayout, 1.2, 0.1);
    expect(p).toBeDefined();
    expect(p!.pointIndex).toBe(0);
    expect(p!.pointIndices).toEqual([0, 1, 2, 3, 4]);
    // Integer data in bins of 5 read `0 - 4` (Plotly's bin-span rounding); one value per y bin.
    expect(p!.labels).toEqual({ x: '0 - 4', y: '0', z: '5' });
    expect(p!.hoverText).toBe('x: 0 - 4<br>y: 0<br>z: 5');
    expect(p!.fields).toEqual({ z: 5 });
    // Anchored at the cell center; heatmaps rank last (the largest distance).
    expect(p!.px).toBe(2 * 10 + 100);
    expect(p!.distance).toBe(20);
    expect(hover(calc, fullData[0]!, fullLayout, 20, 0)).toEqual([]);
  });

  it('follows hoverinfo and zhoverformat', () => {
    const { calc, fullData, fullLayout } = calcOf([
      {
        x: [0, 0.5],
        y: [0, 0],
        xbins: { size: 1 },
        ybins: { size: 1 },
        hoverinfo: 'z',
        zhoverformat: '.2f',
      },
    ]);
    const [p] = hover(calc, fullData[0]!, fullLayout, 0.1, 0.1);
    expect(p!.hoverText).toBe('z: 2.00');
  });

  it('finds bins by bisection', () => {
    const bins = { edges: Float64Array.of(0, 1, 3, 7), count: 3 } as Histogram2dCalc['x'];
    expect([-1, 0, 0.5, 1, 2.9, 3, 7, 8].map((v) => binAt(bins, v))).toEqual([
      -1, 0, 0, 1, 1, 2, 2, -1,
    ]);
  });
});

describe('histogram2d colorbar', () => {
  it('reports the aggregated value range once calc has run', () => {
    const x = [1, 2, 2, 3, 3, 3];
    const s = setup([{ x, y: x }]);
    expect(histogram2d.colorbar!(s.fullData[0]!, { fullLayout: s.fullLayout })).toBeNull();
    const calc = histogram2d.calc!(s.fullData[0]!, s.ctx(0));
    expect(recordedZExtent(s.fullData[0]!)).toEqual(calc.zExtent);
    const spec = histogram2d.colorbar!(s.fullData[0]!, { fullLayout: s.fullLayout });
    expect(spec).not.toBeNull();
    expect([spec!.cmin, spec!.cmax]).toEqual([0, 3]);
    expect(spec!.colorscale.length).toBeGreaterThan(1);
  });

  it('shares one domain across traces on a color axis', () => {
    const a = [0, 0, 0, 0];
    const b = [0, 5];
    const { calcs, fullData, fullLayout } = calcOf([
      { x: a, y: a, coloraxis: 'coloraxis', xbins: { size: 1 }, ybins: { size: 1 } },
      { x: b, y: b, coloraxis: 'coloraxis', xbins: { size: 1 }, ybins: { size: 1 } },
    ]);
    expect(calcs[0]!.zExtent).toEqual([4, 4]);
    expect(zDomain(fullData[1]!, fullLayout)).toEqual([0, 4]);
    const spec = histogram2d.colorbar!(fullData[0]!, { fullLayout });
    expect(spec?.coloraxis).toBe('coloraxis');
    expect([spec!.cmin, spec!.cmax]).toEqual([0, 4]);
  });

  it('honors zmin / zmax and zmid', () => {
    const x = [1, 2, 2];
    const { fullData, fullLayout } = calcOf([
      { x, y: x, zmin: -1, zmax: 10 },
      { x, y: x, zmid: 0 },
    ]);
    expect(zDomain(fullData[0]!, fullLayout)).toEqual([-1, 10]);
    expect(zDomain(fullData[1]!, fullLayout)).toEqual([-2, 2]);
  });
});

describe('histogram2d cell labels', () => {
  it('fills texttemplate per non-empty cell with contrasting colors', () => {
    const x = [0, 0, 1];
    const { calc, fullData, fullLayout } = calcOf([
      { x, y: [0, 0, 0], xbins: { size: 1 }, ybins: { size: 1 }, texttemplate: 'n=%{z}' },
    ]);
    const mapping = {
      colorscale: [
        [0, [0, 0, 0, 1]],
        [1, [1, 1, 1, 1]],
      ] as const,
      zmin: 0,
      zmax: 2,
      reversescale: false,
    };
    const texts = cellTexts(
      calc,
      fullData[0]!,
      mapping as never,
      { xaxis: undefined, yaxis: undefined },
      fullLayout,
    );
    expect(texts.map((t) => t.text)).toEqual(['n=2', 'n=1']);
    // Bright cell → black text; mid-gray cell → white text.
    expect(texts[0]!.color).toEqual([0, 0, 0, 1]);
    expect(texts[1]!.color).toEqual([1, 1, 1, 1]);
    const size = autoCellFontSize(
      calc,
      texts,
      { ...IDENTITY_TRANSFORM, scaleX: 40, scaleY: 40 },
      { xgap: 0, ygap: 0 },
      12,
    );
    expect(size).toBe(Math.min(Math.floor(40 / 3 / 0.65), Math.floor(40 / 1.3), 12));
  });
});

describe('histogram2d view', () => {
  const PLAN: TraceUpdatePlan = { calc: false, plot: false, style: false, transform: false };

  function plotCtx(trace: Record<string, unknown>) {
    const { calc, fullData, fullLayout, xaxis, yaxis } = calcOf([trace]);
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<Histogram2dCalc> = {
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

  it('draws the grid as one heatmap primitive under bars and scatter', () => {
    const { ctx, added } = plotCtx({ x: X, y: Y, ...BINS, xgap: 1 });
    histogram2d.plot!.create(ctx);
    expect(added).toHaveLength(1);
    const heatmap = added[0] as HeatmapPrimitive;
    expect(heatmap).toBeInstanceOf(HeatmapPrimitive);
    expect(heatmap.current.nx).toBe(12);
    expect(heatmap.current.xgap).toBe(1);
    expect(heatmap.object.renderOrder).toBe(heatmapRenderOrder(ctx.trace, 1));
    expect(heatmapRenderOrder(ctx.trace, 1)).toBeLessThan(6e4);
  });

  it('restyles through uniforms and zooms through the transform only', () => {
    const { ctx, added } = plotCtx({ x: X, y: Y, ...BINS });
    const view = histogram2d.plot!.create(ctx);
    const heatmap = added[0] as HeatmapPrimitive;
    const update = vi.spyOn(heatmap, 'update');
    const setTransform = vi.spyOn(heatmap, 'setTransform');
    view.update({ ...ctx, trace: { ...ctx.trace, zsmooth: 'best' } }, { ...PLAN, style: true });
    expect(Object.keys(update.mock.calls[0]![0])).not.toContain('z');
    expect(heatmap.current.smoothing).toBe('best');
    view.update(ctx, { ...PLAN, transform: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(setTransform).toHaveBeenCalledWith(ctx.transform);
    expect(added).toHaveLength(1);
  });

  it('adds cell labels with texttemplate', () => {
    const { ctx, added } = plotCtx({ x: X, y: Y, ...BINS, texttemplate: '%{z}' });
    histogram2d.plot!.create(ctx);
    expect(added).toHaveLength(2);
    expect(added[1]).toBeInstanceOf(TextPrimitive);
  });

  it('draws nothing for an empty grid', () => {
    const { ctx, added } = plotCtx({ x: ['a'], y: ['b'], xbins: { start: 5, end: 4 } });
    const view = histogram2d.plot!.create({ ...ctx, calc: { ...ctx.calc, nx: 0, ny: 0 } });
    expect(added).toHaveLength(0);
    view.update(ctx, { ...PLAN, calc: true });
  });
});
