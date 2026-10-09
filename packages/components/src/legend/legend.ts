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
 * One rect batch (background, bar/fill glyphs and glyph rects), one line batch per dash pattern
 * (line glyphs and glyph segments), one marker set (marker glyphs) and one text batch (names and
 * title), all in the overlay.
 *
 * ## Pointer input
 *
 * The runtime offers pointer events to component views first (`ComponentView.handlePointer`); the
 * legend claims those over its box, so dragging or double-clicking the legend never zooms.
 */
import { isArrayLike, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { createMarkers, type MarkerSet, type RGBA, type Viewport } from '@mk7s/holochart-render';
import type {
  Chart,
  ComponentDrawContext,
  ComponentLayoutContext,
  ComponentModule,
  ComponentPointerEvent,
  ComponentUpdatePlan,
  ComponentView,
  LegendGlyph,
  LegendIconContext,
  LegendItem,
  MarginPush,
  TraceModule,
} from '@mk7s/holochart-runtime';
import { subplotTitlePush } from '../annotations/layout.ts';
import type { DashItem, LabelItem, RectItem } from '../axes/geometry.ts';
import { DashBatch, RectBatch, TextBatch } from '../shared/batches.ts';
import { findChart, fireAndForget, overlayTransform } from '../shared/host.ts';
import { PendingViewPrimitive } from '../shared/lazy-view.ts';
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
  type LegendLayoutOptions,
} from './layout.ts';
import {
  legendAttributes,
  legendIdOf,
  legendIds,
  supplyLegendDefaults,
  type FullLegend,
} from './schema.ts';
import type { LegendKeys } from './legend-keys.ts';
import type { LegendScroller } from './legend-scroll.ts';
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
 * @internal
 */
export function legendGlyphOf(
  trace: FullTrace,
  fullLayout: Pick<FullLayout, 'colorway'>,
): LegendGlyph {
  const module = trace._module as
    { legendIcon?: (t: FullTrace, ctx?: LegendIconContext) => LegendGlyph } | undefined;
  if (typeof module?.legendIcon === 'function') {
    try {
      // The layout resolves `coloraxis` references (and other layout-level styling) in glyphs.
      return module.legendIcon(trace, { fullLayout: fullLayout as FullLayout });
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

/** Everything the legend draws, in container px (pure given `measure`). @internal */
export interface LegendScene {
  /** Legend box in container px (hit region), or `undefined` when nothing is drawn. */
  box: { left: number; top: number; width: number; height: number } | undefined;
  /**
   * Height of the whole content when it is taller than the box (`maxheight`): the content (items,
   * title, their hit regions) is laid out unscrolled from the box's top and scrolls inside it.
   */
  contentHeight: number | undefined;
  /**
   * Item hit regions, container px (`key`: per-point items, see `LegendEntry.key`; `group`: a
   * group title, which toggles its `legendgroup`).
   */
  hits: {
    index: number;
    key?: string;
    group?: true;
    /** Item text, and whether the item is hidden (for keyboard access, E17.4). */
    label: string;
    hidden: boolean;
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
    /** Image sprite (`marker.image`, E8.11), or null. */
    image: string | null;
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

/** Options of {@link buildLegendScene}. */
export interface LegendSceneOptions {
  /** Which legend: `'legend'` (default), `'legend2'`, …. */
  id?: string;
}

/** The entries and boxes of legend `legend` (shared by drawing and margin pushes). */
function legendBoxes(
  legend: FullLegend,
  fullLayout: FullLayout,
  fullData: readonly FullTrace[],
  itemsOf: ((trace: FullTrace) => readonly LegendItem[] | undefined) | undefined,
  options: LegendLayoutOptions,
): LegendBoxes {
  const entries = legendEntries(
    fullData.filter((t) => legendIdOf(t) === legend._id),
    legend.traceorder,
    (t) => legendGlyphOf(t, fullLayout),
    itemsOf,
    legend.grouptitlefont,
  );
  return layoutLegend(legend, entries, options);
}

/** Legend geometry for the current layout. @internal */
export function buildLegendScene(
  fullLayout: FullLayout,
  fullData: readonly FullTrace[],
  size: { width: number; height: number },
  plotArea: { x: number; y: number; width: number; height: number },
  measure: MeasureLine,
  itemsOf?: (trace: FullTrace) => readonly LegendItem[] | undefined,
  options: LegendSceneOptions = {},
): LegendScene {
  const id = options.id ?? 'legend';
  const empty: LegendScene = {
    box: undefined,
    contentHeight: undefined,
    hits: [],
    rects: [],
    rectBorders: [],
    lines: [],
    markers: [],
    labels: [],
  };
  if (!legendShown(fullLayout, id)) return empty;
  const legend = fullLayout[id] as FullLegend;
  const boxes = legendBoxes(legend, fullLayout, fullData, itemsOf, {
    measure,
    maxWidth: legend.xref === 'paper' ? plotArea.width : size.width,
    plotWidth: plotArea.width,
    figureHeight: size.height,
    plotHeight: plotArea.height,
  });
  if (boxes.width <= 0 || boxes.height <= 0) return empty;
  const origin = legendOrigin(legend, size, plotArea, boxes);
  const left = origin.left;
  const top = origin.top - legendTitleLift(legend, fullLayout, measure);
  const scene: LegendScene = {
    ...empty,
    box: { left, top, width: boxes.width, height: boxes.height },
    contentHeight: boxes.contentHeight,
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
    const title = e.groupTitle;
    if (title) {
      // A group title (`legendgrouptitle`): text only, faded when its whole group is hidden.
      scene.labels.push({
        text: item.text.text,
        x: left + item.textX,
        y: top + item.textY,
        anchorX: 'left',
        anchorY: 'middle',
        angle: 0,
        font: item.text.font,
        color: faded(rgba(title.font.color), hidden),
        ...(item.text.runs ? { runs: fadeRuns(item.text.runs, hidden ? HIDDEN_ALPHA : 1) } : {}),
      });
      // Clickable with `groupclick: 'togglegroup'` only (plotly.js makes no toggle otherwise).
      if (title.clickable && legend.groupclick === 'togglegroup') {
        scene.hits.push({
          index: e.index,
          group: true,
          label: item.text.text,
          hidden,
          left: left + item.x,
          top: top + item.y,
          width: item.width,
          height: item.height,
        });
      }
      continue;
    }
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
      const color = rgba(g.fill.color, [0.5, 0.5, 0.5, 1]);
      const attributes = g.fill.pattern;
      scene.rects.push({
        x0: gx - w,
        x1: gx + w,
        y0: gy - h,
        y1: gy + h,
        color: faded(color, hidden),
        ...(attributes && {
          pattern: {
            attributes,
            color,
            opacity: hidden ? HIDDEN_ALPHA : 1,
            background: fullLayout.paper_bgcolor,
          },
        }),
      });
      scene.rectBorders.push({
        color: faded(rgba(g.fill.lineColor), hidden),
        width: Math.min(g.fill.lineWidth ?? 0, 2),
      });
    }
    for (const p of g.parts ?? []) {
      if ('rect' in p) {
        const [x0, y0, x1, y1] = p.rect;
        scene.rects.push({
          x0: gx + x0,
          x1: gx + x1,
          y0: gy + y0,
          y1: gy + y1,
          color: faded(rgba(p.color), hidden),
        });
        scene.rectBorders.push({
          color: faded(rgba(p.lineColor), hidden),
          width: Math.min(p.lineWidth ?? 0, 2),
        });
      } else {
        const [x0, y0, x1, y1] = p.segment;
        scene.lines.push({
          x0: gx + x0,
          x1: gx + x1,
          y0: gy + y0,
          y1: gy + y1,
          color: faded(rgba(p.color, [0, 0, 0, 1]), hidden),
          width: Math.min(p.width, MAX_LINE_WIDTH),
          dash: p.dash ?? 'solid',
        });
      }
    }
    if ((g.kind === 'marker' || g.kind === 'lines+markers') && g.marker) {
      const m = g.marker;
      scene.markers.push({
        x: gx,
        y: gy,
        size: constant ? CONSTANT_MARKER_SIZE : Math.min(m.size ?? 6, MAX_MARKER_SIZE),
        color: rgba(m.color, [0, 0, 0, 1]),
        symbol: m.symbol ?? 'circle',
        image: m.image ?? null,
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
      label: item.text.text,
      hidden,
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

function inBox(b: LegendScene['box'], x: number, y: number): boolean {
  return (
    b !== undefined && x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height
  );
}

/**
 * The item (or clickable group title) under a container point: only inside the legend box, and
 * with the content scrolled up by `offset` px (hit regions are unscrolled).
 */
export function legendHitAt(
  scene: Pick<LegendScene, 'box' | 'hits'>,
  x: number,
  y: number,
  offset = 0,
): LegendScene['hits'][number] | undefined {
  if (!inBox(scene.box, x, y)) return undefined;
  const cy = y + offset;
  return scene.hits.find(
    (h) => x >= h.left && x <= h.left + h.width && cy >= h.top && cy <= h.top + h.height,
  );
}

function toggleTraces(fullData: readonly FullTrace[]): ToggleTrace[] {
  return fullData.map((t) => ({
    index: t._index,
    visible: t.visible,
    legendgroup: typeof t['legendgroup'] === 'string' ? t['legendgroup'] : '',
    inLegend: hasLegendEntry(t),
    legend: legendIdOf(t),
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

/**
 * Click-dispatch id of a legend hit: the trace, one per-point item of it, or the title of the
 * group whose first item it is.
 */
function hitId(hit: { index: number; key?: string; group?: true }): string {
  if (hit.group) return `g${hit.index}`;
  return hit.key === undefined ? `t${hit.index}` : `k${hit.index}\u0000${hit.key}`;
}

function parseHitId(id: string): { index: number; key: string | undefined } {
  if (id.startsWith('t') || id.startsWith('g'))
    return { index: Number(id.slice(1)), key: undefined };
  const sep = id.indexOf('\u0000');
  return { index: Number(id.slice(1, sep)), key: id.slice(sep + 1) };
}

type ScrollModule = typeof import('./legend-scroll.ts');
/** The scrolling code, once loaded (by any chart). */
let scrollModule: ScrollModule | undefined;
let scrollLoad: Promise<ScrollModule> | undefined;

/** Where one legend's DOM (its keyboard toolbar) goes in the chart: see {@link LegendView}. */
type Mount = (legend: OneLegend, node: ChildNode) => void;

/** One legend (`legend`, `legend2`, …): its primitives, clicks, keys and scrolling. */
class OneLegend {
  readonly id: string;
  #ctx: ComponentDrawContext;
  readonly #mount: Mount;
  /** Where the content draws: the overlay, or a scrolling legend's viewport. */
  #target: Viewport | undefined;
  #rects: RectBatch | undefined;
  #text: TextBatch | undefined;
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
  /** Keyboard access (E17.4): buttons over the items, their code loaded with the first legend. */
  #keys: LegendKeys | undefined;
  #keysLoad: Promise<void> | undefined;
  /** The keyboard toolbar's place in the chart until its code has loaded. */
  #anchor: Comment | undefined;
  /** Scrolling (content taller than `maxheight`), its code loaded with the first such legend. */
  #scroller: LegendScroller | undefined;
  #scrollWait: PendingViewPrimitive | undefined;
  #disposed = false;

  constructor(id: string, ctx: ComponentDrawContext, mount: Mount) {
    this.id = id;
    this.#ctx = ctx;
    this.#mount = mount;
  }

  /** The legend's DOM node in the chart (keyboard toolbar or its placeholder), if any. */
  get node(): ChildNode | undefined {
    return this.#keys?.root ?? this.#anchor;
  }

  draw(ctx: ComponentDrawContext): void {
    this.#ctx = ctx;
    const chart = findChart(ctx);
    const staticPlot = chart?.fullConfig?.staticPlot === true;
    let scene = buildLegendScene(
      ctx.fullLayout,
      ctx.fullData,
      ctx,
      ctx.plotArea,
      oracleMeasure,
      legendItemsFor(ctx),
      { id: this.id },
    );
    this.#fullData = ctx.fullData;
    this.#fullLayout = ctx.fullLayout;
    this.#legend = ctx.fullLayout[this.id] as FullLegend | undefined;

    let target = ctx.overlay;
    let rects = scene.rects;
    let borders = scene.rectBorders;
    if (scene.contentHeight === undefined || !scene.box) {
      if (this.#scroller) {
        // The content leaves the scroller's viewport before it goes.
        this.#retarget(ctx, target);
        this.#scroller.dispose();
        this.#scroller = undefined;
      }
    } else if (!scrollModule) {
      // Nothing to show until the scrolling code is here (chart readiness waits for it).
      this.#loadScroll();
      scene = { ...scene, box: undefined, hits: [], rects: [], lines: [], markers: [], labels: [] };
      rects = [];
    } else {
      const scroller = (this.#scroller ??= new scrollModule.LegendScroller(ctx, () =>
        this.#scrolled(),
      ));
      scroller.set(ctx, {
        box: scene.box,
        contentHeight: scene.contentHeight,
        background: scene.rects[0] as RectItem,
        border: scene.rectBorders[0] as { color: RGBA; width: number },
        interactive: !staticPlot,
      });
      target = scroller.viewport;
      rects = rects.slice(1);
      borders = borders.slice(1);
    }
    this.#scene = scene;
    this.#retarget(ctx, target);
    const rectBatch = (this.#rects ??= new RectBatch(ctx, ctx.primitives, target, ORDER.box));
    const text = (this.#text ??= new TextBatch(ctx, ctx.primitives, target, ORDER.text));
    rectBatch.set(rects, borders);
    text.set(scene.labels);

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
        batch = new DashBatch(ctx, ctx.primitives, target, ORDER.lines);
        this.#lines.set(dash, batch);
      }
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
        image: m.some((d) => d.image) ? m.map((d) => d.image) : null,
      };
      if (!this.#markers) {
        this.#markers = createMarkers(ctx.primitives, data, { renderOrder: ORDER.markers });
        ctx.add(this.#markers, target);
      } else {
        this.#markers.update(data);
      }
    }
    this.#markerKey = markerKey;
    this.#transform();
    this.#syncKeys();
  }

  /** Move the content's primitives to `target` (the overlay, or a scrolling legend's viewport). */
  #retarget(ctx: ComponentDrawContext, target: Viewport): void {
    if (this.#target === target) return;
    this.#disposeContent(ctx);
    this.#target = target;
  }

  #disposeContent(ctx: Pick<ComponentDrawContext, 'remove'>): void {
    this.#rects?.dispose();
    this.#text?.dispose();
    for (const batch of this.#lines.values()) batch.dispose();
    if (this.#markers) ctx.remove(this.#markers);
    this.#rects = this.#text = this.#markers = undefined;
    this.#lines.clear();
    this.#markerKey = '';
  }

  /** Place the content: at the scroll offset in a scrolling legend's viewport, else unmoved. */
  #transform(): void {
    const t = this.#scroller?.transform() ?? overlayTransform(this.#ctx.height);
    this.#rects?.setTransform(t);
    this.#text?.setTransform(t);
    for (const batch of this.#lines.values()) batch.setTransform(t);
    this.#markers?.setTransform(t);
  }

  #scrolled(): void {
    this.#transform();
    this.#syncKeys();
    this.#ctx.invalidate();
  }

  /** Load the scrolling code, then redraw; chart readiness waits for it meanwhile. */
  #loadScroll(): void {
    if (this.#scrollWait) return;
    scrollLoad ??= import('./legend-scroll.ts').then((m) => (scrollModule = m));
    const wait = new PendingViewPrimitive(
      scrollLoad.then(
        () => {
          this.#ctx.remove(wait);
          this.#scrollWait = undefined;
          if (this.#disposed) return undefined;
          this.draw(this.#ctx);
          return this.#text?.ready;
        },
        (error: unknown) => {
          scrollLoad = undefined;
          console.warn('holochart: loading legend scrolling failed', error);
        },
      ),
    );
    this.#scrollWait = wait;
    this.#ctx.add(wait);
  }

  /** How far the content is scrolled, px. */
  get #offset(): number {
    return this.#scroller?.offset ?? 0;
  }

  /** Keep the items' key targets in step (interactive charts with `config.a11y.keyboard`). */
  #syncKeys(): void {
    const chart = findChart(this.#ctx);
    const config = chart?.fullConfig;
    const on = config?.staticPlot !== true && config?.a11y.keyboard !== false;
    const box = this.#scene?.box;
    const dy = this.#offset;
    const items =
      on && box
        ? (this.#scene?.hits ?? []).map((h) => ({
            ...h,
            // Items scrolled out of the box wait at its edge (focusing one scrolls it in).
            top: Math.max(box.top, Math.min(h.top - dy, box.top + box.height - h.height)),
            id: hitId(h),
            pressed: !h.hidden,
          }))
        : [];
    if (this.#keys) this.#keys.update(items, this.#fullLayout, this.id);
    else if (items.length > 0 && chart && !this.#keysLoad) {
      // Hold the legend's place in the tab order while the code loads.
      const anchor = chart.element.ownerDocument.createComment('holochart: legend keys');
      this.#anchor = anchor;
      this.#mount(this, anchor);
      this.#keysLoad = import('./legend-keys.ts').then(
        (m) => {
          this.#anchor = undefined;
          if (this.#disposed) return anchor.remove();
          this.#keys = new m.LegendKeys(
            anchor,
            (id, double) => this.#act(id, double ? 'double' : 'single'),
            (id) => this.#reveal(id),
          );
          this.#syncKeys();
        },
        (error: unknown) => {
          this.#anchor = undefined;
          anchor.remove();
          console.warn('holochart: loading legend keys failed', error);
        },
      );
    }
  }

  /** Scroll the item with click-dispatch id `id` into view (it got the keyboard focus). */
  #reveal(id: string): void {
    const hit = this.#scene?.hits.find((h) => hitId(h) === id);
    if (hit) this.#scroller?.reveal(hit.top, hit.height);
  }

  /** Is the container point inside the legend box? */
  hitTest(x: number, y: number): boolean {
    return inBox(this.#scene?.box, x, y);
  }

  /** The item under a container point, if any. */
  hitAt(x: number, y: number): LegendScene['hits'][number] | undefined {
    return this.#scene ? legendHitAt(this.#scene, x, y, this.#offset) : undefined;
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    // Scrolling first: the wheel, the scrollbar, a finger dragging the items.
    if (this.#scroller?.handle(event)) return true;
    // Links in item names and the title (E2.10) take the event before the item toggles.
    const inside = this.hitTest(event.x, event.y);
    const link =
      inside || !this.#scroller ? this.#text?.linkAt(event.x, event.y + this.#offset) : null;
    if (handleLinkPointer(event, link ?? null)) return true;
    if (event.type === 'leave' || !inside) return false;
    const hit = this.hitAt(event.x, event.y);
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
    // A group title acts on its whole group (plotly.js: its pseudo-trace carries the group's
    // first item's visibility).
    const groupclick = id.startsWith('g') ? 'togglegroup' : legend.groupclick;
    const changes = legendToggle(toggleTraces(this.#fullData), index, mode, groupclick);
    if (changes.size === 0) return;
    const indices = [...changes.keys()];
    fireAndForget(chart.restyle({ visible: indices.map((i) => changes.get(i)) }, indices));
  }

  dispose(): void {
    this.#disposed = true;
    this.#clicks.cancel();
    this.#keys?.destroy();
    this.#anchor?.remove();
    this.#disposeContent(this.#ctx);
    if (this.#scrollWait) this.#ctx.remove(this.#scrollWait);
    this.#scroller?.dispose();
    this.#scroller = undefined;
  }
}

/**
 * The legends of a chart: `legend` and the `legend2`, … its traces use (`fullLayout._legends`),
 * each drawn, clicked, scrolled and reached by keyboard on its own. Pointer events go to the legend
 * under the pointer; a gesture that one legend took (a scrollbar drag) stays with it.
 */
class LegendView implements ComponentView {
  #ctx: ComponentDrawContext;
  readonly #legends = new Map<string, OneLegend>();
  /** The legend that took the current gesture's `down`. */
  #active: OneLegend | undefined;

  constructor(ctx: ComponentDrawContext) {
    this.#ctx = ctx;
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
    this.#ctx = ctx;
    const ids = legendIds(ctx.fullLayout);
    for (const [id, legend] of this.#legends) {
      if (ids.includes(id)) continue;
      legend.dispose();
      this.#legends.delete(id);
      if (this.#active === legend) this.#active = undefined;
    }
    for (const id of ids) {
      let legend = this.#legends.get(id);
      if (!legend) {
        legend = new OneLegend(id, ctx, this.#mount);
        this.#legends.set(id, legend);
      }
      legend.draw(ctx);
    }
  }

  /**
   * Put a legend's DOM in the chart's tab order: next to the other legends' (in legend order), or
   * at the end of the chart (after the plot area's focus target, before the controls mounted
   * later).
   */
  readonly #mount = (legend: OneLegend, node: ChildNode): void => {
    const list = [...this.#legends.values()];
    const k = list.indexOf(legend);
    const before = list
      .slice(0, k)
      .reverse()
      .find((l) => l.node?.isConnected)?.node;
    const after = list.slice(k + 1).find((l) => l.node?.isConnected)?.node;
    if (before) before.after(node);
    else if (after) after.before(node);
    else findChart(this.#ctx)?.element.appendChild(node);
  };

  /** Is the container point inside a legend box? (For the runtime's pointer routing.) */
  hitTest(x: number, y: number): boolean {
    for (const legend of this.#legends.values()) if (legend.hitTest(x, y)) return true;
    return false;
  }

  /** The trace index of the item under a container point, if any. */
  itemAt(x: number, y: number): number | undefined {
    for (const legend of this.#legends.values()) {
      const hit = legend.hitAt(x, y);
      if (hit) return hit.index;
    }
    return undefined;
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    const active = this.#active;
    if (active && event.type !== 'down') {
      if (event.type === 'up' || event.type === 'leave') this.#active = undefined;
      if (active.handlePointer(event)) return true;
    }
    let handled = false;
    // Later legends draw on top: they get the event first.
    for (const legend of [...this.#legends.values()].reverse()) {
      if (legend === active && event.type !== 'down') continue;
      if (handled) {
        if (event.type === 'leave') legend.handlePointer(event);
        continue;
      }
      if (legend.handlePointer(event)) {
        handled = true;
        if (event.type === 'down') this.#active = legend;
      }
    }
    return handled;
  }

  dispose(): void {
    for (const legend of this.#legends.values()) legend.dispose();
    this.#legends.clear();
    this.#active = undefined;
  }
}

/** The legend component (`layout.legend`, `legend2`, …, `showlegend`; E5.2). */
export const legendComponent: ComponentModule = {
  name: 'legend',
  order: 20,
  layoutSchema: { legend: legendAttributes },
  supplyLayoutDefaults(layoutIn, layoutOut, ctx) {
    supplyLegendDefaults(layoutIn, layoutOut, ctx);
  },
  pushMargin(ctx: ComponentLayoutContext) {
    const pushes: MarginPush[] = [];
    const m = ctx.fullLayout.margin;
    const plotWidth = Math.max(1, ctx.width - m.l - m.r);
    for (const id of legendIds(ctx.fullLayout)) {
      if (!legendShown(ctx.fullLayout, id)) continue;
      const legend = ctx.fullLayout[id] as FullLegend;
      const boxes = legendBoxes(legend, ctx.fullLayout, ctx.fullData, legendItemsFor(ctx), {
        measure: oracleMeasure,
        maxWidth: legend.xref === 'paper' ? plotWidth : ctx.width,
        plotWidth,
        figureHeight: ctx.height,
        plotHeight: Math.max(1, ctx.height - m.t - m.b),
      });
      const push = legendMarginPush(legend, ctx, m, boxes);
      const lift = legendTitleLift(legend, ctx.fullLayout, oracleMeasure);
      if (push)
        pushes.push(lift > 0 && push.t !== undefined ? { ...push, t: push.t + lift } : push);
    }
    return pushes.length > 1 ? pushes : pushes[0];
  },
  draw: {
    create: (ctx) => new LegendView(ctx),
  },
};
