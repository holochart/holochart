/**
 * Treemap and icicle renderer (plan E13.3, E13.4, E22.1): every tile of the trace in ONE instanced
 * {@link RectPrimitive} (fill, centered outline, corner radius and pattern per tile; plan §3
 * principle 6), the path bar as one fill batch with its outlines, and one batched
 * {@link TextPrimitive} for the labels. These are domain traces: they draw into the overlay
 * viewport, whose world units are container px with a bottom-left origin.
 *
 * Hovering a treemap tile or path bar segment outlines it (Plotly's `_hovered` style); hover labels
 * come from `hoverPoints`. Clicks drill down as in every hierarchy trace (`../hierarchy/view.ts`),
 * with `treemapclick` / `icicleclick`: into a tile (leaves too), up from the entry, or up to a path
 * bar segment. When the new `level` arrives, tiles and segments tween over 750 ms (`tween.ts`) and
 * labels fade in at the end.
 */
import { toRGBA, type FullTrace } from '@mk7s/holochart-core';
import {
  createLazyFillPrimitive,
  createRectPrimitive,
  createTextPrimitive,
  LinePrimitive,
  type FillData,
  type LineData,
  type LazyFillPrimitive,
  type RectData,
  type RectPrimitive,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type {
  Chart,
  ComponentPointerEvent,
  TracePlotContext,
  TraceRenderer,
  TraceView,
} from '@mk7s/holochart-runtime';
import type { HierNode } from '../hierarchy/build.ts';
import {
  canAnimate,
  chartOf,
  drillTo,
  emitNodeClick,
  labelAlpha,
  orderOf,
  syncPrimitive,
  traceOpacity,
  Transition,
  worldLabels,
  type NodeLabel,
} from '../hierarchy/view.ts';
import {
  numberIn,
  pathbarBand,
  rectAt,
  rectGeometry,
  type RectCalc,
  type RectGeometry,
  type RectLayout,
} from './geometry.ts';
import { rectClick } from './hover.ts';
import { ensureRectLayout } from './layout.ts';
import { hoveredStyle, rectStyles, type RectStyle } from './style.ts';
import { layoutRectText, padsOf, textSpot } from './text.ts';
import {
  lerpRect,
  planPathbarTween,
  planRectTween,
  rectKey,
  stateOf,
  type DrawnRect,
  type RectState,
  type RectTweenPlan,
} from './tween.ts';

/** Render orders in the overlay (in [-10, 0), below figure components). */
const ORDER = { tiles: -9, pathbar: -8.5, outlines: -8, text: -3 } as const;

/** Rect instances of tiles in world px (`layout` places the domain; `height` flips y). */
export function tileRects(
  trace: FullTrace,
  states: readonly RectState[],
  styles: readonly RectStyle[],
  layout: RectLayout,
  labelled: readonly boolean[],
  paper: unknown,
): Pick<RectData, 'x0' | 'y0' | 'x1' | 'y1' | 'fill' | 'borderColor' | 'borderWidth'> &
  Pick<RectData, 'cornerRadius' | 'pattern'> & {
    borderColor: Float32Array;
    borderWidth: Float32Array;
  } {
  const n = states.length;
  const x0 = new Float64Array(n);
  const y0 = new Float64Array(n);
  const x1 = new Float64Array(n);
  const y1 = new Float64Array(n);
  const fill = new Float32Array(n * 4);
  const borderColor = new Float32Array(n * 4);
  const borderWidth = new Float32Array(n);
  const cornerRadius = new Float32Array(n);
  const opacity = new Float32Array(n);
  const patterns: (Record<string, unknown> | undefined)[] = [];
  const radius = numberIn(trace['marker'], 'cornerradius');
  const pads = padsOf(trace);
  const spot = textSpot(trace['textposition']);
  // Plotly keeps corners out of the label's padding.
  let labelRadius = radius;
  if (spot.top) labelRadius = Math.min(labelRadius, pads.t);
  if (spot.left) labelRadius = Math.min(labelRadius, pads.l);
  if (spot.right) labelRadius = Math.min(labelRadius, pads.r);
  if (spot.bottom) labelRadius = Math.min(labelRadius, pads.b);
  const H = layout.figureHeight;
  for (let k = 0; k < n; k++) {
    const s = states[k]!;
    const style = styles[k]!;
    x0[k] = layout.x + s.x0;
    x1[k] = layout.x + s.x1;
    y0[k] = H - layout.y - s.y0;
    y1[k] = H - layout.y - s.y1;
    for (let c = 0; c < 4; c++) {
      fill[k * 4 + c] = style.fill[c]!;
      borderColor[k * 4 + c] = style.line[c]!;
    }
    borderWidth[k] = style.width;
    cornerRadius[k] = labelled[k] ? labelRadius : radius;
    opacity[k] = style.opacity;
    patterns[k] = style.pattern;
  }
  return {
    x0,
    y0,
    x1,
    y1,
    fill,
    borderColor,
    borderWidth,
    cornerRadius,
    pattern: patterns.some(Boolean)
      ? { pattern: patterns, color: fill, opacity, background: paper, parse: toRGBA }
      : null,
  };
}

/**
 * The outline of a path bar segment (Plotly's `pathAncestor`), domain px: a rectangle whose left
 * and right edges take `edgeshape`, kept right of the domain's left edge.
 */
export function segmentPolygon(
  s: RectState,
  edgeshape: unknown,
  thickness: number,
  width: number,
): [number, number][] {
  const x0 = Math.max(s.x0, 0);
  const x1 = Math.min(s.x1, width);
  const h = thickness / 2;
  const mid = (s.y0 + s.y1) / 2;
  // A, B (top), R (right), C, D (bottom), L (left): x offsets per edge shape.
  const [top, bottom, side] =
    edgeshape === '>'
      ? [h, h, 0]
      : edgeshape === '/'
        ? [0, h, h / 2]
        : edgeshape === '\\'
          ? [h, 0, h / 2]
          : edgeshape === '<'
            ? [0, 0, h]
            : [0, 0, 0];
  const p = (x: number, y: number): [number, number] => [Math.max(x, 0), y];
  return [
    p(x0 - top, s.y0),
    p(x1 - top, s.y0),
    p(x1 - side, mid),
    p(x1 - bottom, s.y1),
    p(x0 - bottom, s.y1),
    p(x0 - side, mid),
  ];
}

/** A running drill-down transition. */
interface Tween {
  readonly tiles: RectTweenPlan;
  readonly segments: RectTweenPlan;
  readonly tileExitStyles: readonly RectStyle[];
  readonly segmentExitStyles: readonly RectStyle[];
}

/** What is drawn. */
interface Drawn {
  readonly tiles: DrawnRect[];
  readonly tileStyles: RectStyle[];
  readonly segments: DrawnRect[];
  readonly segmentStyles: RectStyle[];
  readonly labelled: boolean[];
  readonly entry: string | undefined;
}

const EMPTY: Drawn = {
  tiles: [],
  tileStyles: [],
  segments: [],
  segmentStyles: [],
  labelled: [],
  entry: undefined,
};

class RectView implements TraceView<RectCalc> {
  #rects: RectPrimitive | undefined;
  #fill: LazyFillPrimitive | undefined;
  #lines: LinePrimitive | undefined;
  #text: TextPrimitive | undefined;
  #ctx: TracePlotContext<RectCalc> | undefined;
  #geometry: RectGeometry | undefined;
  #labels: NodeLabel[] = [];
  #drawn: Drawn = EMPTY;
  /** The outline buffers of the tiles drawn, patched for hover. */
  #outlines: { borderColor: Float32Array; borderWidth: Float32Array } | undefined;
  /** The hovered tile (≥ 0) or path bar segment (< 0: `-1 - index`) of a treemap. */
  #hover: number | undefined;
  /** The `level` a click asked for: its arrival animates. */
  #pending: string | undefined;
  #tween: Tween | undefined;
  readonly #clock = new Transition();
  #chart: Chart | undefined;

  constructor(ctx: TracePlotContext<RectCalc>) {
    this.update(ctx);
  }

  /** Whether a drill-down transition is running. */
  get transitioning(): boolean {
    return this.#clock.running;
  }

  update(ctx: TracePlotContext<RectCalc>): void {
    this.#ctx = ctx;
    ensureRectLayout(ctx);
    const { trace, calc, fullLayout } = ctx;
    const paper = fullLayout.paper_bgcolor;
    const geometry = rectGeometry(calc, trace);
    this.#geometry = geometry;
    const layout = calc.layout;
    const tiles = geometry?.tiles ?? [];
    const segments = geometry?.pathbar ?? [];
    const options = { colorscale: calc.colorscale };
    const tileStyles = geometry ? rectStyles(trace, tiles, geometry, paper, options) : [];
    const segmentStyles = geometry
      ? rectStyles(trace, segments, geometry, paper, { ...options, onPathbar: true })
      : [];
    this.#labels =
      geometry && layout
        ? layoutRectText(trace, calc, geometry, fullLayout).map((l) => ({
            ...l,
            x: l.x + layout.x,
            y: l.y + layout.y,
          }))
        : [];

    const prev = this.#drawn;
    const entry = geometry ? rectKey(geometry.entry) : undefined;
    const animate =
      this.#pending !== undefined &&
      geometry !== undefined &&
      layout !== undefined &&
      entry !== prev.entry &&
      prev.tiles.length > 0 &&
      canAnimate(ctx.fullLayout);
    this.#pending = undefined;
    this.#hover = undefined;
    this.#clock.stop();
    this.#tween = undefined;
    if (animate) {
      const tiling = trace['tiling'] as Record<string, unknown> | undefined;
      const flip = typeof tiling?.['flip'] === 'string' ? tiling['flip'] : '';
      const band = pathbarBand(trace, layout.height);
      const origin = { x0: layout.width, x1: layout.width, y0: band?.y0 ?? 0, y1: band?.y1 ?? 0 };
      const tilePlan = planRectTween({
        prev: prev.tiles,
        prevEntry: prev.entry,
        next: tiles,
        entry: geometry.entry,
        pad: numberIn(tiling, 'pad'),
        width: layout.width,
        height: layout.height,
        ...(trace.type === 'icicle'
          ? {
              icicle: {
                orientation: String(tiling?.['orientation']),
                flipX: flip.includes('x'),
                flipY: flip.includes('y'),
              },
            }
          : {}),
      });
      const segmentPlan = planPathbarTween(prev.segments, segments, origin);
      this.#tween = {
        tiles: tilePlan,
        segments: segmentPlan,
        tileExitStyles: tilePlan.exit.map((e) => prev.tileStyles[e.index]!),
        segmentExitStyles: segmentPlan.exit.map((e) => prev.segmentStyles[e.index]!),
      };
    }
    const drawn = (r: RectState & { node: HierNode }): DrawnRect => ({
      ...stateOf(r),
      key: rectKey(r.node),
    });
    this.#drawn = {
      tiles: tiles.map(drawn),
      tileStyles,
      segments: segments.map(drawn),
      segmentStyles,
      labelled: tiles.map((t) => t.node.label !== ''),
      entry,
    };
    if (this.#tween) this.#clock.start(this.#step);
    else this.#drawFinal();
  }

  dispose(): void {
    this.#clock.stop();
  }

  /**
   * Moves outline the hovered treemap tile; clicks drill down (see the module comment). Earlier
   * pointer events tell the view its chart. Nothing is consumed but clicks on the trace.
   */
  handlePointer(event: ComponentPointerEvent): boolean {
    if (event.native) this.#chart = chartOf(event) ?? this.#chart;
    const ctx = this.#ctx;
    const chart = this.#chart;
    if (event.type === 'move' || event.type === 'leave') {
      this.#setHover(event.type === 'move' ? this.#hoverIndex(event.x, event.y) : undefined);
      return false;
    }
    if (event.type !== 'click' || event.button !== 0) return false;
    if (!ctx || !chart || chart.destroyed) return false;
    const { trace, calc, index } = ctx;
    const click = rectClick(
      calc,
      trace,
      chart.data[index],
      index,
      ctx.fullLayout,
      event.x,
      event.y,
    );
    if (!click) return false;
    const type = trace.type === 'icicle' ? 'icicleclick' : 'treemapclick';
    const proceed = emitNodeClick(chart, type, click.point, click.nextLevel);
    if (proceed && click.drills && !this.#clock.running) {
      this.#pending = click.nextLevel;
      drillTo(chart, index, click.nextLevel);
    }
    return true;
  }

  /** The treemap tile or segment to outline at container `(x, y)` (Plotly's `_hovered`). */
  #hoverIndex(x: number, y: number): number | undefined {
    const ctx = this.#ctx;
    const geometry = this.#geometry;
    const layout = ctx?.calc.layout;
    if (!ctx || !geometry || !layout || ctx.trace.type !== 'treemap' || this.#clock.running) {
      return undefined;
    }
    if (this.#chart?.interaction.hovermode === false) return undefined;
    const hit = rectAt(geometry, x - layout.x, y - layout.y);
    if (!hit || hit.node.generated === 'multiple') return undefined;
    return hit.onPathbar
      ? -1 - geometry.pathbar.indexOf(hit.rect as (typeof geometry.pathbar)[number])
      : geometry.tiles.indexOf(hit.rect as (typeof geometry.tiles)[number]);
  }

  /** The segment styles with the hovered one outlined. */
  #segmentStyles(): RectStyle[] {
    const styles = this.#drawn.segmentStyles;
    const k = this.#hover !== undefined && this.#hover < 0 ? -1 - this.#hover : -1;
    if (!styles[k]) return styles;
    const out = styles.slice();
    out[k] = hoveredStyle(styles[k], this.#ctx?.fullLayout.paper_bgcolor);
    return out;
  }

  /** Outline the hovered tile or segment in place (tiles: just their outline buffers). */
  #setHover(hover: number | undefined): void {
    const old = this.#hover;
    if (hover === old) return;
    this.#hover = hover;
    const ctx = this.#ctx;
    const outlines = this.#outlines;
    if (!ctx || !outlines || this.#clock.running) return;
    const { tileStyles, segments } = this.#drawn;
    let tiles = false;
    for (const k of [old, hover]) {
      if (k === undefined) continue;
      const style = tileStyles[k];
      if (k < 0 || !style) continue;
      const s = k === hover ? hoveredStyle(style, ctx.fullLayout.paper_bgcolor) : style;
      outlines.borderColor.set(s.line, k * 4);
      outlines.borderWidth[k] = s.width;
      tiles = true;
    }
    if (tiles) this.#rects?.update(outlines);
    if ((old ?? 0) < 0 || (hover ?? 0) < 0) {
      const layout = ctx.calc.layout;
      const H = layout?.figureHeight ?? ctx.viewport.size.height;
      this.#drawPathbar(segments, this.#segmentStyles(), layout, H, traceOpacity(ctx.trace));
    }
    ctx.invalidate();
  }

  /** Draw what `update` laid out. */
  #drawFinal(): void {
    const d = this.#drawn;
    this.#hover = undefined;
    this.#draw(d.tiles, d.tileStyles, d.segments, d.segmentStyles, d.labelled, 1);
    this.#ctx?.invalidate();
  }

  /** Draw the running transition at time `t`; the last frame draws the new layout exactly. */
  readonly #step = (t: number): void => {
    const tween = this.#tween;
    if (!tween) return;
    if (t >= 1) {
      this.#tween = undefined;
      this.#drawFinal();
      return;
    }
    const d = this.#drawn;
    const frame = (plan: RectTweenPlan, styles: RectStyle[], exitStyles: readonly RectStyle[]) => {
      const states: RectState[] = [];
      const out: RectStyle[] = [];
      // Leaving rects below the others.
      plan.exit.forEach((e, k) => {
        states.push(lerpRect(e.from, e.to, t));
        out.push(exitStyles[k]!);
      });
      plan.update.forEach((u, k) => {
        states.push(lerpRect(u.from, u.to, t));
        out.push(styles[k]!);
      });
      return [states, out] as const;
    };
    const [tiles, tileStyles] = frame(tween.tiles, d.tileStyles, tween.tileExitStyles);
    const [segments, segmentStyles] = frame(
      tween.segments,
      d.segmentStyles,
      tween.segmentExitStyles,
    );
    const labelled = [...tween.tiles.exit.map(() => false), ...d.labelled];
    this.#draw(tiles, tileStyles, segments, segmentStyles, labelled, labelAlpha(t));
    this.#ctx?.invalidate();
  };

  #draw(
    tiles: readonly RectState[],
    tileStyles: readonly RectStyle[],
    segments: readonly RectState[],
    segmentStyles: readonly RectStyle[],
    labelled: readonly boolean[],
    textAlpha: number,
  ): void {
    const ctx = this.#ctx;
    const layout = ctx?.calc.layout;
    if (!ctx) return;
    const { trace, fullLayout } = ctx;
    const opacity = traceOpacity(trace);
    const H = layout?.figureHeight ?? ctx.viewport.size.height;

    const rects = layout
      ? tileRects(trace, tiles, tileStyles, layout, labelled, fullLayout.paper_bgcolor)
      : undefined;
    this.#outlines = rects;
    const data: Partial<RectData> = {
      ...(rects ?? { x0: [], y0: [], x1: [], y1: [] }),
      borderAlign: 'center',
      opacity,
    };
    this.#rects = syncPrimitive(
      ctx,
      this.#rects,
      data,
      (d) => createRectPrimitive(ctx.primitives, d),
      orderOf(ORDER.tiles, ctx.index),
    );

    this.#drawPathbar(segments, segmentStyles, layout, H, opacity);

    // Transitions keep the new labels typeset but transparent until they fade in.
    const labels = worldLabels(this.#labels, H, textAlpha * opacity);
    this.#text = syncPrimitive(
      ctx,
      this.#text,
      labels.length > 0 ? { labels } : undefined,
      (d) => createTextPrimitive(ctx.primitives, d),
      orderOf(ORDER.text, ctx.index),
    );
  }

  /** The path bar: one fill batch of segment polygons and their outlines. */
  #drawPathbar(
    segments: readonly RectState[],
    styles: readonly RectStyle[],
    layout: RectLayout | undefined,
    H: number,
    opacity: number,
  ): void {
    const ctx = this.#ctx!;
    const pathbar = ctx.trace['pathbar'] as Record<string, unknown> | undefined;
    const x: number[] = [];
    const y: number[] = [];
    const rings: number[] = [];
    const fill: number[] = [];
    const lx: number[] = [];
    const ly: number[] = [];
    const lc: number[] = [];
    const lw: number[] = [];
    if (layout) {
      segments.forEach((s, k) => {
        const style = styles[k]!;
        const ring = segmentPolygon(
          s,
          pathbar?.['edgeshape'],
          numberIn(pathbar, 'thickness'),
          layout.width,
        ).map(([px, py]) => [layout.x + px, H - layout.y - py] as const);
        rings.push(x.length);
        for (const [px, py] of ring) {
          x.push(px);
          y.push(py);
        }
        fill.push(...style.fill);
        if (!(style.width > 0)) return;
        if (lx.length > 0) {
          lx.push(NaN);
          ly.push(NaN);
          lc.push(0, 0, 0, 0);
          lw.push(0);
        }
        for (const [px, py] of [...ring, ring[0]!]) {
          lx.push(px);
          ly.push(py);
          lc.push(...style.line);
          lw.push(style.width);
        }
      });
    }
    this.#fill = syncPrimitive(
      ctx,
      this.#fill,
      rings.length > 0 ? { x, y, rings, color: Float32Array.from(fill), opacity } : undefined,
      (d) => createLazyFillPrimitive(ctx.primitives, d as FillData),
      orderOf(ORDER.pathbar, ctx.index),
    );
    this.#lines = syncPrimitive<LineData, LinePrimitive>(
      ctx,
      this.#lines,
      lx.length > 0
        ? {
            x: Float64Array.from(lx),
            y: Float64Array.from(ly),
            color: Float32Array.from(lc),
            width: Float32Array.from(lw),
            opacity,
            join: 'miter',
          }
        : undefined,
      (d) => new LinePrimitive(ctx.primitives, d),
      orderOf(ORDER.outlines, ctx.index),
    );
  }
}

/** The treemap and icicle `plot` part: one view per visible trace. */
export const rectRenderer: TraceRenderer<RectCalc> = {
  create: (ctx) => new RectView(ctx),
};
