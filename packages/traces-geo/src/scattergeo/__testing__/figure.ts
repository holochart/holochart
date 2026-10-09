/**
 * Test helpers: default a geo figure, calc its `scattergeo` traces and run the geo
 * `crossTraceLayout` on a fixed plot area, as the runtime does before drawing; and a plot context
 * with real primitives (they need no WebGL until a frame is rendered) in recording viewports.
 */
import {
  createRegistry,
  supplyDefaults,
  type FigureInput,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import { createResourceManager, Viewport, type Primitive } from '@mk7s/holochart-render';
import type {
  DomainTraceEntry,
  HoverContext,
  HoverQuery,
  SubplotViewportOptions,
  TracePlotContext,
} from '@mk7s/holochart-runtime';
import { geoCrossTraceLayout } from '../../geo/cross-trace.ts';
import { geoOf } from '../../geo/layout-defaults.ts';
import type { GeoSubplot } from '../../geo/subplot.ts';
import type { ScattergeoCalc } from '../calc.ts';
import { scattergeo } from '../index.ts';

/** The plot area: off the container's corner, so that offsets are exercised. */
export const PLOT_AREA = { x: 40, y: 30, width: 800, height: 400 } as const;
/** The figure the plot area is in. */
export const FIGURE = { width: 880, height: 480 } as const;

export const registry = createRegistry().register(scattergeo);

export interface LaidOutFigure {
  fullData: FullTrace[];
  fullLayout: FullLayout;
  calcs: (ScattergeoCalc | undefined)[];
  /** Run the layout pass again (a relayout), with the calcs kept. */
  layout(): void;
  subplot(id?: string): GeoSubplot;
}

/**
 * `chart` stands for the chart whose subplots keep their views from one pass to the next (the
 * layout step asks it to `resize` when a projection's code arrives).
 */
export function layoutFigure(
  figure: FigureInput,
  chart: object = { resize: () => {} },
): LaidOutFigure {
  const { fullData, fullLayout } = supplyDefaults(figure, registry, { validate: false });
  const calcs: (ScattergeoCalc | undefined)[] = [];
  const entries: DomainTraceEntry<ScattergeoCalc>[] = [];
  fullData.forEach((trace, index) => {
    if (trace.visible !== true) {
      calcs.push(undefined);
      return;
    }
    const calc = scattergeo.calc!(trace, { fullLayout, index, xaxis: undefined, yaxis: undefined });
    calcs.push(calc);
    entries.push({ trace, index, calc, domain: { x: [0, 1], y: [0, 1], rect: PLOT_AREA } });
  });
  const layout = (): void =>
    geoCrossTraceLayout(entries, {
      fullLayout,
      width: FIGURE.width,
      height: FIGURE.height,
      plotArea: PLOT_AREA,
      chart: chart as never,
    });
  layout();
  return {
    fullData,
    fullLayout,
    calcs,
    layout,
    subplot(id = 'geo') {
      const calc = calcs.find((c, i) => c && geoOf(fullData[i]!) === id);
      if (!calc?.subplot) throw new Error(`no laid out subplot ${id}`);
      return calc.subplot;
    },
  };
}

/** A viewport that records what was asked of it. */
export interface FakeViewport {
  readonly key: string;
  background: unknown;
  rect: unknown;
}

export interface PlotHarness {
  ctx: TracePlotContext<ScattergeoCalc>;
  /** Every primitive of the view, with the viewport it was added to. */
  added: Map<Primitive<unknown>, FakeViewport>;
  /** The subplot viewports asked for, by key. */
  viewports: Map<string, FakeViewport>;
  overlay: FakeViewport;
  invalidate: { calls: number };
  /** The options of every `subplotViewport` call. */
  asked: SubplotViewportOptions[];
}

/** Options of {@link plotContext}. */
export interface PlotContextOptions {
  /**
   * Hand out render's own viewports for the subplots, as the runtime does (a 3D globe draws in
   * one: its scene, its camera), and add the primitives to them. Default: recording stand-ins.
   */
  readonly real?: boolean;
}

/** What a real viewport needs of its render root. */
const HOST = {
  invalidate: () => {},
  canvasWidth: FIGURE.width,
  canvasHeight: FIGURE.height,
  pixelRatio: 1,
};

/** The plot context of trace `index` of a laid out figure. */
export function plotContext(
  f: LaidOutFigure,
  index = 0,
  options: PlotContextOptions = {},
): PlotHarness {
  const added = new Map<Primitive<unknown>, FakeViewport>();
  const viewports = new Map<string, FakeViewport>();
  /** What the runtime does for a key: one viewport, its kind fixed by the first call. */
  const realViewport = (key: string, o: SubplotViewportOptions): FakeViewport => {
    let vp = viewports.get(key) as unknown as Viewport | undefined;
    if (!vp) {
      vp = new Viewport(
        HOST,
        o.kind === '2d'
          ? { kind: '2d', clip: true, rect: o.rect, name: key }
          : { kind: '3d', projection: o.projection ?? 'perspective', rect: o.rect, name: key },
      );
      (vp as unknown as { key: string }).key = key;
      viewports.set(key, vp as unknown as FakeViewport);
    }
    vp.setRect(o.rect);
    if (vp.kind === '3d') vp.setProjection(o.projection ?? 'perspective');
    vp.background = o.background ?? null;
    return vp as unknown as FakeViewport;
  };
  const overlay: FakeViewport = { key: 'overlay', background: null, rect: undefined };
  const invalidate = { calls: 0 };
  const asked: SubplotViewportOptions[] = [];
  const ctx: TracePlotContext<ScattergeoCalc> = {
    trace: f.fullData[index]!,
    calc: f.calcs[index]!,
    index,
    fullLayout: f.fullLayout,
    subplot: undefined,
    xaxis: undefined,
    yaxis: undefined,
    transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
    viewport: overlay as unknown as Viewport,
    plotArea: PLOT_AREA,
    primitives: { resources: createResourceManager(), invalidate: () => {} },
    add: (p, vp) => {
      added.set(p as Primitive<unknown>, (vp ?? overlay) as unknown as FakeViewport);
      if (vp instanceof Viewport) vp.add(p);
      return p;
    },
    remove: (p) => {
      const vp = added.get(p as Primitive<unknown>);
      added.delete(p as Primitive<unknown>);
      if (vp instanceof Viewport) vp.remove(p);
      p.dispose();
    },
    invalidate: () => {
      invalidate.calls++;
    },
    subplotViewport: (key, viewportOptions) => {
      asked.push(viewportOptions);
      if (options.real) return realViewport(key, viewportOptions) as unknown as Viewport;
      let vp = viewports.get(key);
      if (!vp) viewports.set(key, (vp = { key, background: null, rect: undefined }));
      // As the runtime does: every call sets the rect and the background.
      vp.rect = viewportOptions.rect;
      vp.background = viewportOptions.background ?? null;
      return vp as unknown as Viewport;
    },
  };
  return { ctx, added, viewports, overlay, invalidate, asked };
}

/** The hover context of a domain trace, as the runtime builds it. */
export function hoverContext(f: LaidOutFigure): HoverContext {
  return {
    fullLayout: f.fullLayout,
    xaxis: undefined,
    yaxis: undefined,
    transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
    height: FIGURE.height,
  };
}

/** The runtime's hover query for the container point `(cx, cy)`. */
export function hoverQuery(cx: number, cy: number, distance = 20): HoverQuery {
  const py = FIGURE.height - cy;
  return { px: cx, py, xl: cx, yl: py, mode: 'closest', distance, cx, cy };
}

/** Where `(lon, lat)` is drawn now, in container px (top-left origin). */
export function containerPoint(sp: GeoSubplot, lon: number, lat: number): [number, number] {
  const p = sp.view!.project(lon, lat);
  if (!p) throw new Error(`(${lon}, ${lat}) is hidden`);
  return [sp.rect.x + p[0], sp.rect.y + sp.rect.height - p[1]];
}
