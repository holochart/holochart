/**
 * The legend component (plan E5.2): one item per trace with a glyph from its module's
 * `legendIcon` (a colored marker when a module has none), vertical or horizontal, positioned by
 * `x`/`y`/anchors/refs with a background and border, a title, grouping and ranking, margin
 * pushes, and click (toggle) / double-click (isolate) through the public `restyle` API.
 *
 * Traces whose module has `legendItems` (pie, M2 wave 1) show one item per label instead; clicking
 * one toggles its label in `layout.hiddenlabels` through `relayout` (Plotly's pie-like legends).
 *
 * ## Primitives (constant draw calls whatever the item count)
 *
 * One rect batch (background and bar/fill glyphs), one line batch per dash pattern (line glyphs),
 * one marker set (marker glyphs) and one text batch (names and title), all in the overlay.
 *
 * ## Pointer input
 *
 * The runtime offers pointer events to component views first (`ComponentView.handlePointer`); the
 * legend claims those over its box, so dragging or double-clicking the legend never zooms.
 */
import { isArrayLike, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { createMarkers, type MarkerSet, type RGBA } from '@mk7s/holochart-render';
import type {
  Chart,
  ComponentDrawContext,
  ComponentLayoutContext,
  ComponentModule,
  ComponentPointerEvent,
  ComponentUpdatePlan,
  ComponentView,
  LegendGlyph,
  LegendItem,
  TraceModule,
} from '@mk7s/holochart-runtime';
import { subplotTitlePush } from '../annotations/layout.ts';
import type { DashItem, LabelItem, RectItem } from '../axes/geometry.ts';
import { DashBatch, RectBatch, TextBatch } from '../shared/batches.ts';
import { findChart, fireAndForget, overlayTransform } from '../shared/host.ts';
import {
  fadeRuns,
  handleLinkPointer,
  oracleMeasure,
  rgba,
  type MeasureLine,
} from '../shared/text.ts';
import {
  hasLegendEntry,
  layoutLegend,
  legendAnchors,
  legendEntries,
  legendMarginPush,
  legendOrigin,
  legendShown,
  type LegendBoxes,
  type LegendEntry,
} from './layout.ts';
import { legendAttributes, supplyLegendDefaults, type FullLegend } from './schema.ts';
import { ClickDispatcher, hiddenLabelsToggle, legendToggle, type ToggleTrace } from './toggle.ts';

/** Marker size used for every item with `itemsizing: 'constant'`, px (Plotly). */
const CONSTANT_MARKER_SIZE = 12;
/** Largest marker drawn in the legend with `itemsizing: 'trace'`, px (Plotly). */
const MAX_MARKER_SIZE = 16;
/** Widest line drawn in the legend, px. */
const MAX_LINE_WIDTH = 5;
/** Opacity multiplier of `legendonly` items (Plotly). */
const HIDDEN_ALPHA = 0.5;
/** Draw order in the overlay: above axes and titles. */
const ORDER = { box: 10, lines: 11, markers: 12, text: 13 } as const;

function firstString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (isArrayLike(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
  return undefined;
}

function firstNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (isArrayLike(v) && v.length > 0 && typeof v[0] === 'number') return v[0];
  return undefined;
}

/**
 * The glyph of a trace: its module's `legendIcon`, else a marker (and a line for `lines` modes)
 * in the trace's color.
 */
export function legendGlyphOf(
  trace: FullTrace,
  fullLayout: Pick<FullLayout, 'colorway'>,
): LegendGlyph {
  const module = trace._module as { legendIcon?: (t: FullTrace) => LegendGlyph } | undefined;
  if (typeof module?.legendIcon === 'function') {
    try {
      return module.legendIcon(trace);
    } catch {
      // A failing icon must not break the legend: fall back below.
    }
  }
  const marker = trace['marker'] as Record<string, unknown> | undefined;
  const line = trace['line'] as Record<string, unknown> | undefined;
  const colorway = fullLayout.colorway;
  const color =
    firstString(marker?.['color']) ??
    firstString(line?.['color']) ??
    (colorway[trace._index % colorway.length] as string);
  const mode = typeof trace['mode'] === 'string' ? trace['mode'] : 'markers';
  const markerGlyph = {
    color,
    symbol: firstString(marker?.['symbol']) ?? firstNumber(marker?.['symbol']) ?? 'circle',
    size: firstNumber(marker?.['size']) ?? 6,
    opacity: firstNumber(marker?.['opacity']) ?? 1,
  };
  const lineGlyph = {
    color: firstString(line?.['color']) ?? color,
    width: firstNumber(line?.['width']) ?? 2,
    dash: typeof line?.['dash'] === 'string' ? line['dash'] : 'solid',
  };
  if (mode.includes('lines') && mode.includes('markers')) {
    return { kind: 'lines+markers', marker: markerGlyph, line: lineGlyph };
  }
  if (mode.includes('lines')) return { kind: 'line', line: lineGlyph };
  return { kind: 'marker', marker: markerGlyph };
}

/** What a legend needs to ask traces for per-point items: their modules and calcs. */
type ItemsSource = Pick<ComponentDrawContext, 'fullLayout' | 'traceModule' | 'calcdata'>;

/**
 * Per-point legend items of a trace (`TraceModule.legendItems`, pie labels), or `undefined` for
 * a regular one-item trace — also before the trace's first calc.
 */
export function legendItemsFor(
  source: ItemsSource,
): (trace: FullTrace) => readonly LegendItem[] | undefined {
  return (trace) => {
    const module: TraceModule | undefined = source.traceModule?.(trace.type);
    if (!module?.legendItems) return undefined;
    const calc = source.calcdata?.(trace._index);
    if (calc === undefined) return undefined;
    try {
      return module.legendItems(calc, trace, { fullLayout: source.fullLayout });
    } catch {
      // A failing module must not break the legend: fall back to one item per trace.
      return undefined;
    }
  };
}

function faded(c: RGBA, hidden: boolean): RGBA {
  return hidden ? [c[0], c[1], c[2], c[3] * HIDDEN_ALPHA] : c;
}

/** Everything the legend draws, in container px (pure given `measure`). */
export interface LegendScene {
  /** Legend box in container px (hit region), or `undefined` when nothing is drawn. */
  box: { left: number; top: number; width: number; height: number } | undefined;
  /** Item hit regions, container px (`key`: per-point items, see `LegendEntry.key`). */
  hits: {
    index: number;
    key?: string;
    left: number;
    top: number;
    width: number;
    height: number;
  }[];
  /** Background (first, with its border) and bar/fill glyphs. */
  rects: RectItem[];
  rectBorders: { color: RGBA; width: number }[];
  lines: DashItem[];
  markers: {
    x: number;
    y: number;
    size: number;
    color: RGBA;
    symbol: string | number;
    lineColor: RGBA;
    lineWidth: number;
    opacity: number;
  }[];
  labels: LabelItem[];
}

/**
 * How far a legend on top of the plot area (paper `y >= 1`, bottom-anchored, like the default
 * look's) moves up so the top row's subplot titles (`makeSubplots`, Express facet labels) stay
 * visible beneath it: their height above the plot area. A Holochart extension; Plotly's legends
 * sit at the right, clear of them.
 */
export function legendTitleLift(
  legend: FullLegend,
  fullLayout: FullLayout,
  measure: MeasureLine,
): number {
  if (legend.yref !== 'paper' || legend.y < 1 || legendAnchors(legend).y !== 'bottom') return 0;
  return subplotTitlePush(fullLayout, measure)?.t ?? 0;
}

/** Legend geometry for the current layout. */
export function buildLegendScene(
  fullLayout: FullLayout,
  fullData: readonly FullTrace[],
  size: { width: number; height: number },
  plotArea: { x: number; y: number; width: number; height: number },
  measure: MeasureLine,
  itemsOf?: (trace: FullTrace) => readonly LegendItem[] | undefined,
): LegendScene {
  const empty: LegendScene = {
    box: undefined,
    hits: [],
    rects: [],
    rectBorders: [],
    lines: [],
    markers: [],
    labels: [],
  };
  if (!legendShown(fullLayout)) return empty;
  const legend = fullLayout['legend'] as FullLegend;
  const entries = legendEntries(
    fullData,
    legend.traceorder,
    (t) => legendGlyphOf(t, fullLayout),
    itemsOf,
  );
  const maxWidth = legend.xref === 'paper' ? plotArea.width : size.width;
  const boxes: LegendBoxes = layoutLegend(legend, entries, {
    measure,
    maxWidth,
    plotWidth: plotArea.width,
    figureHeight: size.height,
  });
  if (boxes.width <= 0 || boxes.height <= 0) return empty;
  const origin = legendOrigin(legend, size, plotArea, boxes);
  const left = origin.left;
  const top = origin.top - legendTitleLift(legend, fullLayout, measure);
  const scene: LegendScene = {
    ...empty,
    box: { left, top, width: boxes.width, height: boxes.height },
  };
  scene.rects.push({
    x0: left,
    y0: top,
    x1: left + boxes.width,
    y1: top + boxes.height,
    color: rgba(legend.bgcolor),
  });
  scene.rectBorders.push({ color: rgba(legend.bordercolor), width: legend.borderwidth });

  const textColor = rgba(legend.font.color);
  const constant = legend.itemsizing === 'constant';
  for (const item of boxes.items) {
    const e: LegendEntry = item.entry;
    const hidden = e.visible === 'legendonly';
    const gx = left + item.glyphX;
    const gy = top + item.glyphY;
    const half = legend.itemwidth / 2;
    const g = e.glyph;
    if ((g.kind === 'line' || g.kind === 'lines+markers') && g.line) {
      const width = Math.min(g.line.width ?? 2, MAX_LINE_WIDTH);
      if (width > 0) {
        scene.lines.push({
          x0: gx - half,
          x1: gx + half,
          y0: gy,
          y1: gy,
          color: faded(rgba(g.line.color, [0, 0, 0, 1]), hidden),
          width,
          dash: g.line.dash ?? 'solid',
        });
      }
    }
    if ((g.kind === 'bar' || g.kind === 'fill') && g.fill) {
      const w = g.kind === 'bar' ? 6 : half - 3;
      const h = g.kind === 'bar' ? 6 : 5;
      scene.rects.push({
        x0: gx - w,
        x1: gx + w,
        y0: gy - h,
        y1: gy + h,
        color: faded(rgba(g.fill.color, [0.5, 0.5, 0.5, 1]), hidden),
      });
      scene.rectBorders.push({
        color: faded(rgba(g.fill.lineColor), hidden),
        width: Math.min(g.fill.lineWidth ?? 0, 2),
      });
    }
    if ((g.kind === 'marker' || g.kind === 'lines+markers') && g.marker) {
      const m = g.marker;
      scene.markers.push({
        x: gx,
        y: gy,
        size: constant ? CONSTANT_MARKER_SIZE : Math.min(m.size ?? 6, MAX_MARKER_SIZE),
        color: rgba(m.color, [0, 0, 0, 1]),
        symbol: m.symbol ?? 'circle',
        lineColor: rgba(m.lineColor),
        lineWidth: Math.min(m.lineWidth ?? 0, MAX_LINE_WIDTH),
        opacity: (m.opacity ?? 1) * (hidden ? HIDDEN_ALPHA : 1),
      });
    }
    if (item.text.text !== '') {
      scene.labels.push({
        text: item.text.text,
        x: left + item.textX,
        y: top + item.textY,
        anchorX: 'left',
        anchorY: 'middle',
        angle: 0,
        font: item.text.font,
        color: faded(textColor, hidden),
        ...(item.text.runs ? { runs: fadeRuns(item.text.runs, hidden ? HIDDEN_ALPHA : 1) } : {}),
      });
    }
    scene.hits.push({
      index: e.index,
      ...(e.key === undefined ? {} : { key: e.key }),
      left: left + item.x,
      top: top + item.y,
      width: item.width,
      height: item.height,
    });
  }
  if (boxes.title) {
    scene.labels.push({
      text: boxes.title.text,
      x: left + boxes.title.x,
      y: top + boxes.title.y,
      anchorX: 'left',
      anchorY: 'top',
      angle: 0,
      font: boxes.title.font,
      color: rgba(legend.title.font.color),
      ...(boxes.title.runs ? { runs: boxes.title.runs } : {}),
    });
  }
  return scene;
}

function toggleTraces(fullData: readonly FullTrace[]): ToggleTrace[] {
  return fullData.map((t) => ({
    index: t._index,
    visible: t.visible,
    legendgroup: typeof t['legendgroup'] === 'string' ? t['legendgroup'] : '',
    inLegend: hasLegendEntry(t),
  }));
}

/**
 * Emit `legendclick` / `legenddoubleclick`; `false` when a listener cancelled the default.
 * Per-point items (pie) also carry their `label`, as in Plotly.
 */
function emitLegendEvent(
  chart: Chart,
  type: 'legendclick' | 'legenddoubleclick',
  index: number,
  fullData: readonly FullTrace[],
  key: string | undefined,
): boolean {
  const trace = fullData.find((t) => t._index === index);
  return chart.emit(type, {
    curveNumber: index,
    data: chart.data,
    ...(trace ? { fullData: trace } : {}),
    ...(key === undefined ? {} : { label: key }),
  });
}

/** Click-dispatch id of a legend hit: the trace, or one per-point item of it. */
function hitId(hit: { index: number; key?: string }): string {
  return hit.key === undefined ? `t${hit.index}` : `k${hit.index}\u0000${hit.key}`;
}

function parseHitId(id: string): { index: number; key: string | undefined } {
  if (id.startsWith('t')) return { index: Number(id.slice(1)), key: undefined };
  const sep = id.indexOf('\u0000');
  return { index: Number(id.slice(1, sep)), key: id.slice(sep + 1) };
}

class LegendView implements ComponentView {
  readonly #ctx: ComponentDrawContext;
  readonly #rects: RectBatch;
  readonly #text: TextBatch;
  readonly #lines = new Map<string, DashBatch>();
  #markers: MarkerSet | undefined;
  #markerKey = '';
  #scene: LegendScene | undefined;
  #fullData: readonly FullTrace[] = [];
  #legend: FullLegend | undefined;
  #fullLayout: FullLayout | undefined;
  readonly #clicks = new ClickDispatcher<string>(
    (id) => this.#act(id, 'single'),
    (id) => this.#act(id, 'double'),
  );

  constructor(ctx: ComponentDrawContext) {
    this.#ctx = ctx;
    this.#rects = new RectBatch(ctx, ctx.primitives, ctx.overlay, ORDER.box);
    this.#text = new TextBatch(ctx, ctx.primitives, ctx.overlay, ORDER.text);
    this.#draw(ctx);
  }

  update(ctx: ComponentDrawContext, plan: ComponentUpdatePlan): void {
    const s = plan.stages;
    if (!plan.layout && !s.has('legend') && !s.has('style') && !s.has('plot') && !s.has('calc')) {
      return;
    }
    this.#draw(ctx);
  }

  #draw(ctx: ComponentDrawContext): void {
    const scene = buildLegendScene(
      ctx.fullLayout,
      ctx.fullData,
      ctx,
      ctx.plotArea,
      oracleMeasure,
      legendItemsFor(ctx),
    );
    this.#scene = scene;
    this.#fullData = ctx.fullData;
    this.#fullLayout = ctx.fullLayout;
    this.#legend = ctx.fullLayout['legend'] as FullLegend | undefined;
    const t = overlayTransform(ctx.height);

    this.#rects.setTransform(t);
    this.#rects.set(scene.rects, scene.rectBorders);
    this.#text.setTransform(t);
    this.#text.set(scene.labels);

    const byDash = new Map<string, DashItem[]>();
    for (const l of scene.lines) {
      const list = byDash.get(l.dash);
      if (list) list.push(l);
      else byDash.set(l.dash, [l]);
    }
    for (const [dash, batch] of this.#lines) {
      if (byDash.has(dash)) continue;
      batch.dispose();
      this.#lines.delete(dash);
    }
    for (const [dash, items] of byDash) {
      let batch = this.#lines.get(dash);
      if (!batch) {
        batch = new DashBatch(ctx, ctx.primitives, ctx.overlay, ORDER.lines);
        this.#lines.set(dash, batch);
      }
      batch.setTransform(t);
      batch.set(items, ctx.overlay.size.pixelRatio);
    }

    const m = scene.markers;
    const markerKey = JSON.stringify(m);
    if (m.length === 0) {
      if (this.#markers) ctx.remove(this.#markers);
      this.#markers = undefined;
    } else if (markerKey !== this.#markerKey || !this.#markers) {
      const data = {
        x: Float64Array.from(m, (d) => d.x),
        y: Float64Array.from(m, (d) => d.y),
        size: Float32Array.from(m, (d) => d.size),
        color: Float32Array.from(m.flatMap((d) => [...d.color])),
        lineColor: Float32Array.from(m.flatMap((d) => [...d.lineColor])),
        lineWidth: Float32Array.from(m, (d) => d.lineWidth),
        opacity: Float32Array.from(m, (d) => d.opacity),
        symbol: m.map((d) => d.symbol),
      };
      if (!this.#markers) {
        this.#markers = createMarkers(ctx.primitives, data, { renderOrder: ORDER.markers });
        ctx.add(this.#markers);
      } else {
        this.#markers.update(data);
      }
    }
    this.#markerKey = markerKey;
    this.#markers?.setTransform(t);
  }

  /** Is the container point inside the legend box? (For the runtime's pointer routing.) */
  hitTest(x: number, y: number): boolean {
    const b = this.#scene?.box;
    return (
      b !== undefined && x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height
    );
  }

  /** The trace index of the item under a container point, if any. */
  itemAt(x: number, y: number): number | undefined {
    return this.#hitAt(x, y)?.index;
  }

  #hitAt(x: number, y: number): LegendScene['hits'][number] | undefined {
    for (const h of this.#scene?.hits ?? []) {
      if (x >= h.left && x <= h.left + h.width && y >= h.top && y <= h.top + h.height) return h;
    }
    return undefined;
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    // Links in item names and the title (E2.10) take the event before the item toggles.
    if (handleLinkPointer(event, this.#text.linkAt(event.x, event.y))) return true;
    if (event.type === 'leave' || !this.hitTest(event.x, event.y)) return false;
    const hit = this.#hitAt(event.x, event.y);
    const id = hit ? hitId(hit) : undefined;
    switch (event.type) {
      case 'move':
        if (id !== undefined) event.cursor = 'pointer';
        break;
      case 'click':
        if (id !== undefined && event.button === 0) {
          const legend = this.#legend;
          const chart = findChart(this.#ctx);
          const delay =
            legend?.itemdoubleclick === false
              ? 0
              : Number(chart?.fullConfig?.doubleClickDelay ?? 300);
          this.#clicks.click(id, delay);
        }
        break;
      case 'dblclick':
        if (id !== undefined) this.#clicks.doubleClick(id);
        break;
      default:
        break;
    }
    return true;
  }

  #act(id: string, kind: 'single' | 'double'): void {
    const legend = this.#legend;
    const chart = findChart(this.#ctx);
    if (!legend || !chart || chart.destroyed) return;
    const { index, key } = parseHitId(id);
    const mode = kind === 'single' ? legend.itemclick : legend.itemdoubleclick;
    if (
      !emitLegendEvent(
        chart,
        kind === 'single' ? 'legendclick' : 'legenddoubleclick',
        index,
        this.#fullData,
        key,
      )
    ) {
      return;
    }
    if (mode === false) return;
    if (key !== undefined) {
      // Per-point item (pie label): toggle it in `hiddenlabels`, a user edit kept by `uirevision`.
      const current = this.#fullLayout?.['hiddenlabels'];
      const hidden = Array.isArray(current) ? current.map(String) : [];
      const keys = (this.#scene?.hits ?? []).flatMap((h) => (h.key === undefined ? [] : [h.key]));
      const next = hiddenLabelsToggle(hidden, keys, key, mode);
      if (next) fireAndForget(chart.relayout({ hiddenlabels: next }, { gui: true }));
      return;
    }
    const changes = legendToggle(toggleTraces(this.#fullData), index, mode, legend.groupclick);
    if (changes.size === 0) return;
    const indices = [...changes.keys()];
    fireAndForget(chart.restyle({ visible: indices.map((i) => changes.get(i)) }, indices));
  }

  dispose(): void {
    this.#clicks.cancel();
  }
}

/** The legend component (`layout.legend`, `showlegend`; E5.2). */
export const legendComponent: ComponentModule = {
  name: 'legend',
  order: 20,
  layoutSchema: { legend: legendAttributes },
  supplyLayoutDefaults(_layoutIn, layoutOut, ctx) {
    supplyLegendDefaults(layoutOut, ctx);
  },
  pushMargin(ctx: ComponentLayoutContext) {
    if (!legendShown(ctx.fullLayout)) return undefined;
    const legend = ctx.fullLayout['legend'] as FullLegend;
    const m = ctx.fullLayout.margin;
    const plotWidth = Math.max(1, ctx.width - m.l - m.r);
    const entries = legendEntries(
      ctx.fullData,
      legend.traceorder,
      (t) => legendGlyphOf(t, ctx.fullLayout),
      legendItemsFor(ctx),
    );
    const boxes = layoutLegend(legend, entries, {
      measure: oracleMeasure,
      maxWidth: legend.xref === 'paper' ? plotWidth : ctx.width,
      plotWidth,
      figureHeight: ctx.height,
    });
    const push = legendMarginPush(legend, ctx, m, boxes);
    const lift = legendTitleLift(legend, ctx.fullLayout, oracleMeasure);
    return push && lift > 0 && push.t !== undefined ? { ...push, t: push.t + lift } : push;
  },
  draw: {
    create: (ctx) => new LegendView(ctx),
  },
};
