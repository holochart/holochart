import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import {
  createResourceManager,
  HeatmapPrimitive,
  IDENTITY_TRANSFORM,
  LazyFillPrimitive,
  LinePrimitive,
  TextPrimitive,
  triangulateFills,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type HoverContext,
  type TracePlotContext,
  type TraceUpdatePlan,
} from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { histogram2d } from '../histogram2d/index.ts';
import { regionArea } from '../shared/contour.ts';
import type { Histogram2dContourCalc } from './calc.ts';
import { histogram2dcontour } from './index.ts';
import { fillData, labelLayout, levelText, showsLines } from './plot.ts';
import { bandColors, contourMapping } from './style.ts';

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

const registry = createChartRegistry().register(histogram2d, histogram2dcontour);

function axis(fullLayout: FullLayout, id: 'x' | 'y'): AxisInfo {
  const scale = createScale({ type: 'linear', range: [-5, 5], length: 400 });
  const full = { ...(fullLayout[`${id}axis`] as FullAxis), type: 'linear' } as FullAxis;
  return { id, name: `${id}axis`, letter: id, type: 'linear', scale, full } as unknown as AxisInfo;
}

/** A peaked sample cloud: a 2D triangle distribution on a small integer grid. */
function peak(): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      const n = Math.max(0, 4 - Math.abs(i)) * Math.max(0, 4 - Math.abs(j));
      for (let k = 0; k < n; k++) {
        x.push(i);
        y.push(j);
      }
    }
  }
  return { x, y };
}

function setup(trace: Record<string, unknown>) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'histogram2dcontour', ...trace }] },
    registry.core,
  );
  const xaxis = axis(fullLayout, 'x');
  const yaxis = axis(fullLayout, 'y');
  const ctx: CalcContext = { fullLayout, index: 0, xaxis, yaxis };
  const calc = histogram2dcontour.calc!(fullData[0]!, ctx);
  return { trace: fullData[0]!, fullLayout, calc, xaxis, yaxis, ctx };
}

describe('histogram2dcontour defaults', () => {
  it('picks levels automatically unless start and end are both given', () => {
    const a = setup({ x: [1], y: [1] }).trace;
    expect(a['autocontour']).toBe(true);
    expect(a['ncontours']).toBe(15);
    const b = setup({ x: [1], y: [1], contours: { start: 1, end: 5, size: 1 } }).trace;
    expect(b['autocontour']).toBe(false);
    expect(b['ncontours']).toBeUndefined();
    const c = setup({ x: [1], y: [1], contours: { start: 1 } }).trace;
    expect(c['autocontour']).toBe(true);
  });

  it('colors with the automatic colorscale and hides the legend entry, except for plain lines', () => {
    const a = setup({ x: [1], y: [1] }).trace;
    expect((a['contours'] as Record<string, unknown>)['coloring']).toBe('fill');
    expect(a['autocolorscale']).toBe(true);
    expect(a['showlegend']).toBe(false);
    expect((a['line'] as Record<string, unknown>)['color']).toBe('rgb(0, 0, 0)');
    const b = setup({ x: [1], y: [1], contours: { coloring: 'none' } }).trace;
    expect(b['showlegend']).toBe(true);
    expect(b['colorscale']).toBeUndefined();
    const c = setup({ x: [1], y: [1], contours: { coloring: 'lines' } }).trace;
    expect((c['line'] as Record<string, unknown>)['color']).toBeUndefined();
  });

  it('coerces label styling only with showlabels', () => {
    const a = setup({ x: [1], y: [1] }).trace;
    expect((a['contours'] as Record<string, unknown>)['labelfont']).toBeUndefined();
    const b = setup({ x: [1], y: [1], contours: { showlabels: true } }).trace;
    const font = (b['contours'] as Record<string, Record<string, unknown>>)['labelfont']!;
    expect(font['color']).toBe('rgb(0, 0, 0)');
    expect(font['size']).toBeTypeOf('number');
  });
});

describe('histogram2dcontour calc', () => {
  it('pads automatic bins with an empty bin per side and contours the bin centers', () => {
    const { x, y } = peak();
    const { calc } = setup({ x, y });
    // Padding bins hold nothing, so the outer contours close.
    const { nx, ny, z } = calc;
    for (let i = 0; i < nx; i++) expect(z[i]).toBe(0);
    for (let j = 0; j < ny; j++) expect(z[j * nx]).toBe(0);
    expect(calc.levels.levels.length).toBeGreaterThan(2);
    for (const paths of calc.paths) {
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) expect(p.closed).toBe(true);
    }
    expect(calc.bounds.x0).toBe(calc.x.centers[0]);
    const ext = histogram2dcontour.extremes!(calc, {} as never, {} as never);
    expect(ext.x!.min[0]!.l).toBe(calc.x.centers[0]);
  });

  it('builds nested fill regions, one per level, shrinking as levels rise', () => {
    const { x, y } = peak();
    const { calc } = setup({
      x,
      y,
      xbins: { size: 1 },
      ybins: { size: 1 },
      line: { smoothing: 0 },
    });
    const areas = calc.regions!.map(regionArea);
    expect(areas.length).toBe(calc.levels.levels.length);
    for (let k = 1; k < areas.length; k++) expect(areas[k]!).toBeLessThan(areas[k - 1]!);
    expect(areas[0]!).toBeGreaterThan(0);
  });

  it('follows manual levels and keeps regions only for fill coloring', () => {
    const { x, y } = peak();
    const { calc } = setup({
      x,
      y,
      contours: { start: 2, end: 10, size: 4, coloring: 'lines' },
    });
    expect(calc.levels.levels).toEqual([2, 6, 10]);
    expect(calc.regions).toBeUndefined();
  });
});

describe('histogram2dcontour colors', () => {
  it('fills bands with their middle color, background first', () => {
    const { x, y } = peak();
    const { calc, trace, fullLayout } = setup({
      x,
      y,
      colorscale: [
        [0, '#000'],
        [1, '#fff'],
      ],
    });
    const mapping = contourMapping(trace, fullLayout, calc.zExtent)!;
    const colors = bandColors(calc.levels, mapping);
    const n = calc.levels.levels.length;
    expect(colors.length).toBe((n + 1) * 4);
    // The colorscale spans the band middles: the background is black, the top band white.
    for (let k = -1; k < n; k++) expect(colors[(k + 1) * 4]).toBeCloseTo((k + 1) / n, 5);
    const fill = fillData(calc, mapping, 1);
    expect(fill.polygons!.length).toBe(n + 1);
    expect(fill.fillRule).toBe('nonzero');
    expect([...(fill.x as Float64Array).slice(0, 4)]).toEqual([
      calc.bounds.x0,
      calc.bounds.x1,
      calc.bounds.x1,
      calc.bounds.x0,
    ]);
  });

  it('keeps a (skipped) polygon for levels above the data, so colors stay aligned', () => {
    const { x, y } = peak();
    const { calc, trace, fullLayout } = setup({ x, y, contours: { start: 4, end: 40, size: 12 } });
    expect(calc.regions!.map((r) => r.rings.length)).toEqual([1, 0, 0, 0]);
    const fill = fillData(calc, contourMapping(trace, fullLayout, calc.zExtent)!, 1);
    const tri = triangulateFills(fill);
    expect(tri.polygonCount).toBe(5);
    expect(tri.vertexStarts[4]).toBe(tri.vertexStarts[5]);
    expect(tri.indices.length).toBeGreaterThan(0);
  });

  it('draws banded colorbars for fills and continuous ones otherwise', () => {
    const { x, y } = peak();
    const fill = setup({ x, y });
    const spec = histogram2dcontour.colorbar!(fill.trace, { fullLayout: fill.fullLayout })!;
    const n = fill.calc.levels.levels.length;
    // Two stops per band (hard edges at the levels).
    expect(spec.colorscale.length).toBe(2 * (n + 1));
    expect(spec.colorscale[1]![1]).toBe(spec.colorscale[0]![1]);
    expect(spec.cmin).toBeLessThanOrEqual(fill.calc.zExtent[0]);
    const heat = setup({ x, y, contours: { coloring: 'heatmap' } });
    const hs = histogram2dcontour.colorbar!(heat.trace, { fullLayout: heat.fullLayout })!;
    expect([hs.cmin, hs.cmax]).toEqual([...heat.calc.zExtent]);
    const none = setup({ x, y, contours: { coloring: 'none' } });
    expect(histogram2dcontour.colorbar!(none.trace, { fullLayout: none.fullLayout })).toBeNull();
  });
});

describe('histogram2dcontour labels', () => {
  it('formats levels with labelformat', () => {
    expect(levelText(0.25, '.1f')).toBe('0.3');
    expect(levelText(12, '')).toBe('12');
  });

  it('places labels on the lines in px and cuts the lines under them', () => {
    const { x, y } = peak();
    const { calc, trace } = setup({
      x,
      y,
      xbins: { size: 1 },
      ybins: { size: 1 },
      contours: { coloring: 'lines', showlabels: true, start: 4, end: 4, size: 1 },
    });
    const transform = { ...IDENTITY_TRANSFORM, scaleX: 60, scaleY: 60, offsetX: 300, offsetY: 300 };
    const font = { family: 'sans-serif', size: 10 };
    const colors = calc.levels.levels.map(() => [1, 0, 0, 1] as const);
    const out = labelLayout(calc, trace, transform, { width: 600, height: 600 }, colors, font);
    expect(out.labels.length).toBeGreaterThan(0);
    expect(out.labels[0]!.text).toBe('4');
    expect(out.labels[0]!.color).toEqual([1, 0, 0, 1]);
    expect(Math.abs(out.labels[0]!.angle ?? 0)).toBeLessThanOrEqual(90);
    // The closed ring became open pieces around the gap.
    expect(out.lines.every((l) => !l.closed)).toBe(true);
  });
});

describe('histogram2dcontour view and hover', () => {
  const PLAN: TraceUpdatePlan = { calc: false, plot: false, style: false, transform: false };

  function plotCtx(trace: Record<string, unknown>) {
    const s = setup(trace);
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<Histogram2dContourCalc> = {
      trace: s.trace,
      calc: s.calc,
      index: 0,
      fullLayout: s.fullLayout,
      subplot: { rect: { x: 0, y: 0, width: 400, height: 300 } } as never,
      xaxis: s.xaxis,
      yaxis: s.yaxis,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 40, scaleY: 30, offsetX: 200, offsetY: 150 },
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

  it('draws fills (lazily loaded) and lines', () => {
    const { x, y } = peak();
    const { ctx, added } = plotCtx({ x, y });
    histogram2dcontour.plot!.create(ctx);
    expect(added.map((p) => p.constructor)).toEqual([LazyFillPrimitive, LinePrimitive]);
    expect(added[1]!.object.renderOrder).toBeGreaterThan(added[0]!.object.renderOrder);
  });

  it('draws a smoothed heatmap for heatmap coloring and nothing filled for lines', () => {
    const { x, y } = peak();
    const heat = plotCtx({ x, y, contours: { coloring: 'heatmap' } });
    histogram2dcontour.plot!.create(heat.ctx);
    const hm = heat.added[0] as HeatmapPrimitive;
    expect(hm).toBeInstanceOf(HeatmapPrimitive);
    expect(hm.current.smoothing).toBe('best');
    const lines = plotCtx({ x, y, contours: { coloring: 'lines' } });
    histogram2dcontour.plot!.create(lines.ctx);
    expect(lines.added.map((p) => p.constructor)).toEqual([LinePrimitive]);
    expect(showsLines(lines.ctx.trace)).toBe(true);
    const noLines = plotCtx({ x, y, contours: { showlines: false } });
    histogram2dcontour.plot!.create(noLines.ctx);
    expect(noLines.added.map((p) => p.constructor)).toEqual([LazyFillPrimitive]);
  });

  it('re-places labels after a zoom, and only sets transforms otherwise', () => {
    const { x, y } = peak();
    const labelled = plotCtx({ x, y, contours: { showlabels: true } });
    const view = histogram2dcontour.plot!.create(labelled.ctx);
    const text = labelled.added.find((p) => p instanceof TextPrimitive) as TextPrimitive;
    expect(text).toBeDefined();
    const lines = labelled.added.find((p) => p instanceof LinePrimitive) as LinePrimitive;
    const update = vi.spyOn(lines, 'update');
    view.update(labelled.ctx, { ...PLAN, transform: true });
    expect(update).not.toHaveBeenCalled();
    const zoomed = { ...labelled.ctx, transform: { ...labelled.ctx.transform, scaleX: 80 } };
    view.update(zoomed, { ...PLAN, transform: true });
    expect(update).toHaveBeenCalledTimes(1);

    const plain = plotCtx({ x, y });
    const plainView = histogram2dcontour.plot!.create(plain.ctx);
    const plainLines = plain.added[1] as LinePrimitive;
    const plainUpdate = vi.spyOn(plainLines, 'update');
    plainView.update({ ...plain.ctx, transform: zoomed.transform }, { ...PLAN, transform: true });
    expect(plainUpdate).not.toHaveBeenCalled();
  });

  it('hovers bins by their centers (Plotly contour hover)', () => {
    const { x, y } = peak();
    const { calc, trace, fullLayout, xaxis, yaxis } = setup({
      x,
      y,
      xbins: { size: 1 },
      ybins: { size: 1 },
    });
    const ctx: HoverContext = { fullLayout, xaxis, yaxis, transform: IDENTITY_TRANSFORM };
    const [p] = histogram2dcontour.hoverPoints!(
      calc,
      trace,
      { px: 0, py: 0, xl: 0.1, yl: -0.2, mode: 'closest', distance: 20 },
      ctx,
    );
    expect(p!.labels).toEqual({ x: '0', y: '0', z: '16' });
  });
});
