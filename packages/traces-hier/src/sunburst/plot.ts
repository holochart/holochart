/**
 * `sunburst` renderer (plan E13.2, E22.1): every sector of the trace in ONE instanced
 * {@link ArcPrimitive} (plan §3 principle 6) and one batched {@link TextPrimitive} for the labels.
 * Sunbursts are domain traces: they draw into the overlay viewport, whose world units are container
 * px with a bottom-left origin, so container `(x, y)` is world `(x, height − y)`.
 *
 * ## Outlines
 *
 * Plotly strokes `marker.line` centered on each sector's edge; the arc primitive draws its border
 * inside the wedge. Each sector therefore gets a border of half the width (neighbours make one
 * full-width seam), plus a thin rim wedge of the line color over the outer half at its outer
 * radius: the same primitive, one more instance per sector.
 *
 * ## Drill-down
 *
 * The view takes clicks on its sectors (`handlePointer`): it emits `sunburstclick` (with
 * `nextLevel`) and then `click`; unless a listener returned `false`, a click on a sector sets
 * `level` to it and a click on the center to the level above, with a GUI `restyle` (kept by
 * `uirevision`, Plotly's `_storeDirectGUIEdit`). When that `level` arrives, the sectors tween from
 * where they were to the new layout over 750 ms, linearly (Plotly's click transition; see
 * `tween.ts`), and labels fade in at the end. Other `level` changes (`restyle`, `react`) snap, and
 * so does everything under `prefers-reduced-motion: reduce`. Clicks during a transition emit their
 * events but don't drill (Plotly).
 */
import { toRGBA, type FullTrace, type RGBA } from '@mk7s/holochart-core';
import {
  createArcPrimitive,
  createTextPrimitive,
  fadeTextRuns,
  type ArcData,
  type ArcPrimitive,
  type PatternFill,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import {
  getChart,
  type Chart,
  type ComponentPointerEvent,
  type TracePlotContext,
  type TraceRenderer,
  type TraceView,
} from '@mk7s/holochart-runtime';
import { DEFAULT_LINE } from '../hierarchy/colors.ts';
import { nodeAttr } from '../hierarchy/format.ts';
import { isLeaf } from '../hierarchy/levels.ts';
import { sunburstGeometry, type Sector, type SunburstCalc } from './geometry.ts';
import { sunburstClick } from './hover.ts';
import { placeSunburst, resolveSunburstColors } from './layout.ts';
import { layoutSunburstText, LINE_HEIGHT, type SectorLabel } from './text.ts';
import {
  lerpState,
  planTween,
  stateOf,
  type DrawnSector,
  type SectorState,
  type TweenPlan,
} from './tween.ts';

/** Plotly's `CLICK_TRANSITION_TIME` (ms) and linear `CLICK_TRANSITION_EASING`. */
export const CLICK_TRANSITION_TIME = 750;

/** Labels fade in over the last part of a transition (fraction of its duration). */
const LABEL_FADE = 0.4;

const GREY: RGBA = [0.5, 0.5, 0.5, 1];

/**
 * Render orders in the overlay: sunburst primitives stay in [-10, 0), below figure components
 * (title, legend, annotations). Sectors of all sunbursts, then labels; trace order within each.
 */
const ORDER = { arcs: -9, text: -3 } as const;
const orderOf = (layer: number, index: number): number => layer + Math.min(index, 999) * 1e-3;

/** How a sector is drawn: fill, outline and pattern (Plotly's `styleOne`). */
export interface SectorStyle {
  /** Fill, alpha multiplied by `leaf.opacity` for leaves. */
  readonly fill: RGBA;
  readonly line: RGBA;
  /** Outline width, px. */
  readonly width: number;
  /** `leaf.opacity` for leaves, else 1 (patterns fade with it too). */
  readonly opacity: number;
  /** The sector's `marker.pattern` (array attributes cast to it), when it has a shape. */
  readonly pattern: Record<string, unknown> | undefined;
}

function fade(c: RGBA, alpha: number): RGBA {
  return alpha === 1 ? c : [c[0], c[1], c[2], c[3] * alpha];
}

/**
 * A sector's `marker.pattern`, array attributes cast to its data index, with the background
 * defaulting to `paper` unless the pattern overlays the fill (as pie). `undefined` without a
 * shape or for generated roots.
 */
export function sectorPattern(
  pattern: unknown,
  i: number,
  paper: unknown,
): Record<string, unknown> | undefined {
  if (i < 0 || !pattern || typeof pattern !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(pattern)) out[key] = nodeAttr(value, i);
  if (!out['shape']) return undefined;
  if (out['fillmode'] !== 'overlay') out['bgcolor'] ??= paper;
  return out;
}

/** The {@link SectorStyle} of every sector (Plotly's `styleOne`). */
export function sectorStyles(
  trace: FullTrace,
  sectors: readonly Sector[],
  paper: unknown,
): SectorStyle[] {
  const marker = (trace['marker'] ?? {}) as {
    line?: { color?: unknown; width?: unknown };
    pattern?: unknown;
  };
  const leafOpacity = (trace['leaf'] as { opacity?: unknown } | undefined)?.opacity;
  return sectors.map((s) => {
    const i = s.node.i;
    const lineColor = nodeAttr(marker.line?.color, i);
    const opacity = isLeaf(s.node) && typeof leafOpacity === 'number' ? leafOpacity : 1;
    return {
      fill: fade(toRGBA(s.node.color) ?? GREY, opacity),
      line: fade(
        (typeof lineColor === 'string' ? toRGBA(lineColor) : null) ?? toRGBA(DEFAULT_LINE)!,
        opacity,
      ),
      width: Math.max(0, Number(nodeAttr(marker.line?.width, i)) || 0),
      opacity,
      pattern: sectorPattern(marker.pattern, i, paper),
    };
  });
}

/** Per-instance arc buffers of sectors: each wedge, then its outer rim when outlined. */
export interface SectorArcs {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly innerRadius: Float32Array;
  readonly outerRadius: Float32Array;
  readonly startAngle: Float32Array;
  readonly endAngle: Float32Array;
  readonly fill: Float32Array;
  readonly borderColor: Float32Array;
  readonly borderWidth: Float32Array;
  readonly pattern: PatternFill | null;
}

/**
 * Arc instances of sectors at `states` (partition angles and px radii) around container
 * `(cx, cy)`, in world px (`height` flips y). `paper` is the default pattern background.
 */
export function sectorArcs(
  states: readonly SectorState[],
  styles: readonly SectorStyle[],
  center: { readonly cx: number; readonly cy: number },
  height: number,
  paper?: unknown,
): SectorArcs {
  const n = states.length;
  const count = n * 2;
  const x = new Float64Array(count).fill(NaN);
  const y = new Float64Array(count).fill(NaN);
  const innerRadius = new Float32Array(count);
  const outerRadius = new Float32Array(count);
  const startAngle = new Float32Array(count);
  const endAngle = new Float32Array(count);
  const fill = new Float32Array(count * 4);
  const borderColor = new Float32Array(count * 4);
  const borderWidth = new Float32Array(count);
  const patterns: (Record<string, unknown> | undefined)[] = [];
  const opacity = new Float32Array(count).fill(1);
  const wx = center.cx;
  const wy = height - center.cy;
  const set = (k: number, s: SectorState, r0: number, r1: number, color: RGBA): void => {
    x[k] = wx;
    y[k] = wy;
    innerRadius[k] = r0;
    outerRadius[k] = r1;
    // Partition angles are the arc primitive's (counterclockwise from +x, y up).
    startAngle[k] = s.x0;
    endAngle[k] = s.x1;
    fill.set(color, k * 4);
  };
  for (let k = 0; k < n; k++) {
    const s = states[k]!;
    const style = styles[k]!;
    if (!(s.r1 > s.r0) || !(Math.abs(s.x1 - s.x0) > 0)) continue;
    const base = k * 2;
    set(base, s, s.r0, s.r1, style.fill);
    patterns[base] = style.pattern;
    opacity[base] = style.opacity;
    if (style.width > 0) {
      borderColor.set(style.line, base * 4);
      borderWidth[base] = style.width / 2;
      set(base + 1, s, s.r1, s.r1 + style.width / 2, style.line);
    }
  }
  return {
    x,
    y,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    borderColor,
    borderWidth,
    pattern: patterns.some(Boolean)
      ? { pattern: patterns, color: fill, opacity, background: paper, parse: toRGBA }
      : null,
  };
}

/** Text labels for the text primitive, in world px. `alpha` multiplies their opacity. */
export function sectorTextLabels(
  labels: readonly SectorLabel[],
  height: number,
  alpha: number,
): TextLabel[] {
  return labels.map((l) => {
    const label: TextLabel = {
      text: l.text,
      x: l.x,
      y: height - l.y,
      font: l.font,
      color: [l.color[0], l.color[1], l.color[2], l.color[3] * alpha],
      anchorX: 'center',
      anchorY: 'middle',
      align: 'center',
      angle: l.angle,
      lineHeight: LINE_HEIGHT,
    };
    if (l.runs) label.runs = fadeTextRuns(l.runs, alpha);
    return label;
  });
}

function traceOpacity(trace: FullTrace): number {
  const o = trace['opacity'];
  return typeof o === 'number' && Number.isFinite(o) ? o : 1;
}

function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/** The chart that owns a pointer event's target (the canvas inside the chart's element). */
function chartOf(event: ComponentPointerEvent): Chart | undefined {
  let node = (event.native?.target ?? null) as Node | null;
  while (node) {
    if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) {
      const chart = getChart(node);
      if (chart) return chart;
    }
    node = node.parentNode;
  }
  return undefined;
}

/**
 * Lay the sunburst out on its own when the runtime has not run `crossTraceLayout` for it (it
 * always does before `plot`; this keeps hand-built contexts working): colors from this trace only.
 */
function ensureLayout(ctx: TracePlotContext<SunburstCalc>): void {
  const { calc, trace } = ctx;
  if (calc.layout) return;
  const rect = ctx.domain?.rect;
  if (!rect) return;
  resolveSunburstColors([{ trace, calc }], ctx.fullLayout);
  const size = ctx.viewport.size as { width: number; height: number } | undefined;
  calc.layout = placeSunburst(rect, {
    width: size?.width ?? rect.x + rect.width,
    height: size?.height ?? rect.y + rect.height,
  });
}

/** A running drill-down transition. */
interface Tween {
  readonly plan: TweenPlan;
  readonly styles: readonly SectorStyle[];
  readonly exitStyles: readonly SectorStyle[];
  readonly start: number;
  readonly duration: number;
  frame: number;
}

class SunburstView implements TraceView<SunburstCalc> {
  #arcs: ArcPrimitive | undefined;
  #text: TextPrimitive | undefined;
  #ctx: TracePlotContext<SunburstCalc> | undefined;
  #labels: SectorLabel[] = [];
  /** What is drawn (the layout of the last update), for the next transition. */
  #drawn: DrawnSector[] = [];
  #drawnStyles: SectorStyle[] = [];
  #drawnEntry: string | undefined;
  /** The `level` a click asked for: its arrival animates. */
  #pending: string | undefined;
  #tween: Tween | undefined;
  #chart: Chart | undefined;

  constructor(ctx: TracePlotContext<SunburstCalc>) {
    this.update(ctx);
  }

  /** Whether a drill-down transition is running. */
  get transitioning(): boolean {
    return this.#tween !== undefined;
  }

  update(ctx: TracePlotContext<SunburstCalc>): void {
    this.#ctx = ctx;
    ensureLayout(ctx);
    const { trace, calc } = ctx;
    const geometry = sunburstGeometry(calc, trace);
    const layout = calc.layout;
    const sectors = geometry?.sectors ?? [];
    const styles = sectorStyles(trace, sectors, ctx.fullLayout.paper_bgcolor);
    this.#labels =
      geometry && layout ? layoutSunburstText(trace, calc, geometry, layout, ctx.fullLayout) : [];

    const entryId = geometry?.entry.id;
    const animate =
      this.#pending !== undefined &&
      geometry !== undefined &&
      layout !== undefined &&
      entryId !== this.#drawnEntry &&
      this.#drawn.length > 0 &&
      typeof requestAnimationFrame === 'function' &&
      !reducedMotion();
    this.#pending = undefined;
    this.#stopTween();
    if (animate) {
      const plan = planTween(
        this.#drawn,
        this.#drawnEntry,
        sectors,
        geometry.entry,
        geometry.baseX,
        layout.r,
      );
      this.#tween = {
        plan,
        styles,
        exitStyles: plan.exit.map((e) => this.#drawnStyles[e.index]!),
        start: performance.now(),
        duration: CLICK_TRANSITION_TIME,
        frame: 0,
      };
    }
    this.#drawn = sectors.map((s) => ({
      ...stateOf(s),
      id: s.node.id,
      parentId: s.node.parent?.id,
    }));
    this.#drawnStyles = styles;
    this.#drawnEntry = entryId;
    if (this.#tween) this.#step(this.#tween.start);
    else this.#draw(this.#drawn, styles, 1);
  }

  dispose(): void {
    this.#stopTween();
  }

  /**
   * Clicks on sectors drill down (see the module comment); earlier pointer events tell the view its
   * chart. Other events pass through (hover, the chart's own clicks).
   */
  handlePointer(event: ComponentPointerEvent): boolean {
    if (event.native) this.#chart = chartOf(event) ?? this.#chart;
    if (event.type !== 'click' || event.button !== 0) return false;
    const ctx = this.#ctx;
    const chart = this.#chart;
    if (!ctx || !chart || chart.destroyed) return false;
    const { trace, calc, index } = ctx;
    const click = sunburstClick(
      calc,
      trace,
      chart.data[index],
      index,
      ctx.fullLayout,
      event.x,
      event.y,
    );
    if (!click) return false;
    const { point, nextLevel } = click;
    let proceed = chart.emit('sunburstclick', {
      points: [point],
      ...(nextLevel !== undefined ? { nextLevel } : {}),
    });
    const fx = chart.interaction;
    if (proceed && fx.hovermode !== false && fx.clickEvent) {
      proceed = chart.emit('click', { points: [point] });
    }
    if (!proceed || nextLevel === undefined || this.#tween) return true;
    chart.unhover();
    this.#pending = nextLevel;
    chart.restyle({ level: [nextLevel] }, [index], { gui: true }).catch(() => undefined);
    return true;
  }

  #stopTween(): void {
    const tween = this.#tween;
    if (!tween) return;
    if (tween.frame && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(tween.frame);
    this.#tween = undefined;
  }

  readonly #onFrame = (now: number): void => {
    const tween = this.#tween;
    if (!tween) return;
    tween.frame = 0;
    this.#step(now);
  };

  /** Draw the running transition at time `now`; the last frame draws the new layout exactly. */
  #step(now: number): void {
    const tween = this.#tween;
    const ctx = this.#ctx;
    if (!tween || !ctx) return;
    const t = Math.min(1, Math.max(0, (now - tween.start) / tween.duration));
    if (t >= 1) {
      this.#tween = undefined;
      this.#draw(this.#drawn, this.#drawnStyles, 1);
      ctx.invalidate();
      return;
    }
    const { plan } = tween;
    const states: SectorState[] = [];
    const styles: SectorStyle[] = [];
    // Leaving sectors below the others.
    plan.exit.forEach((e, k) => {
      states.push(lerpState(e.from, e.to, t));
      styles.push(tween.exitStyles[k]!);
    });
    plan.update.forEach((u, k) => {
      states.push(lerpState(u.from, u.to, t));
      styles.push(tween.styles[k]!);
    });
    this.#draw(states, styles, Math.max(0, (t - (1 - LABEL_FADE)) / LABEL_FADE));
    ctx.invalidate();
    tween.frame = requestAnimationFrame(this.#onFrame);
  }

  #draw(states: readonly SectorState[], styles: readonly SectorStyle[], textAlpha: number): void {
    const ctx = this.#ctx;
    if (!ctx) return;
    const { trace, calc } = ctx;
    const layout = calc.layout;
    const height = layout?.height ?? ctx.viewport.size.height;
    const opacity = traceOpacity(trace);
    const arcs = layout
      ? sectorArcs(states, styles, layout, height, ctx.fullLayout.paper_bgcolor)
      : sectorArcs([], [], { cx: 0, cy: 0 }, height);
    const data: Partial<ArcData> = { ...arcs, opacity };
    if (!this.#arcs) {
      this.#arcs = createArcPrimitive(ctx.primitives, data);
      ctx.add(this.#arcs);
    } else this.#arcs.update(data);
    this.#arcs.object.renderOrder = orderOf(ORDER.arcs, ctx.index);
    this.#arcs.setTransform(ctx.transform);

    // Transitions keep the new labels typeset but transparent until they fade in.
    const labels = sectorTextLabels(this.#labels, height, textAlpha * opacity);
    if (labels.length === 0) {
      if (this.#text) ctx.remove(this.#text);
      this.#text = undefined;
      return;
    }
    if (!this.#text) {
      this.#text = createTextPrimitive(ctx.primitives, { labels });
      ctx.add(this.#text);
    } else this.#text.update({ labels });
    this.#text.object.renderOrder = orderOf(ORDER.text, ctx.index);
    this.#text.setTransform(ctx.transform);
  }
}

/** The sunburst `plot` part: one view per visible sunburst. */
export const sunburstRenderer: TraceRenderer<SunburstCalc> = {
  create: (ctx) => new SunburstView(ctx),
};
