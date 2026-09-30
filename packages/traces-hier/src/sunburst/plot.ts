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
 * The view takes clicks on its sectors (`handlePointer`) as every hierarchy trace does (see
 * `../hierarchy/view.ts`): `sunburstclick`, then `click`, then a GUI `restyle` of `level` to the
 * sector, or to the level above for the center. When that `level` arrives, the sectors tween from
 * where they were to the new layout (see `tween.ts`), and labels fade in at the end.
 */
import {
  toRGBA,
  uniformTextOf,
  uniformTextSize,
  type FullTrace,
  type RGBA,
  type UniformText,
} from '@mk7s/holochart-core';
import {
  createArcPrimitive,
  createTextPrimitive,
  type ArcData,
  type ArcPrimitive,
  type PatternFill,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import { negotiateUniformText, releaseUniformText } from '@mk7s/holochart-traces-basic';
import type {
  Chart,
  ComponentPointerEvent,
  TracePlotContext,
  TraceRenderer,
  TraceView,
} from '@mk7s/holochart-runtime';
import { DEFAULT_LINE } from '../hierarchy/colors.ts';
import { nodeAttr } from '../hierarchy/format.ts';
import { isLeaf } from '../hierarchy/levels.ts';
import type { UniformTextPass } from '../hierarchy/text.ts';
import {
  canAnimate,
  chartOf,
  drillTo,
  emitNodeClick,
  fadeColor as fade,
  labelAlpha,
  nodePattern,
  orderOf,
  syncPrimitive,
  traceOpacity,
  Transition,
  worldLabels,
} from '../hierarchy/view.ts';
import { sunburstGeometry, type Sector, type SunburstCalc } from './geometry.ts';
import { sunburstClick } from './hover.ts';
import { placeSunburst, resolveSunburstColors } from './layout.ts';
import { layoutSunburstText, type SectorLabel } from './text.ts';
import {
  lerpState,
  planTween,
  stateOf,
  type DrawnSector,
  type SectorState,
  type TweenPlan,
} from './tween.ts';

export { CLICK_TRANSITION_TIME } from '../hierarchy/view.ts';

const GREY: RGBA = [0.5, 0.5, 0.5, 1];

/**
 * Render orders in the overlay: sunburst primitives stay in [-10, 0), below figure components
 * (title, legend, annotations). Sectors of all sunbursts, then labels; trace order within each.
 */
const ORDER = { arcs: -9, text: -3 } as const;

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

/** A sector's `marker.pattern` (see {@link nodePattern}). */
export const sectorPattern = nodePattern;

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
  return worldLabels(labels, height, alpha);
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
  readonly #clock = new Transition();
  #chart: Chart | undefined;

  constructor(ctx: TracePlotContext<SunburstCalc>) {
    this.update(ctx);
  }

  /** Whether a drill-down transition is running. */
  get transitioning(): boolean {
    return this.#clock.running;
  }

  update(ctx: TracePlotContext<SunburstCalc>): void {
    this.#ctx = ctx;
    ensureLayout(ctx);
    const { trace, calc } = ctx;
    const geometry = sunburstGeometry(calc, trace);
    const layout = calc.layout;
    const sectors = geometry?.sectors ?? [];
    const styles = sectorStyles(trace, sectors, ctx.fullLayout.paper_bgcolor);
    this.#labels = this.#layoutLabels(ctx, geometry);

    const entryId = geometry?.entry.id;
    const animate =
      this.#pending !== undefined &&
      geometry !== undefined &&
      layout !== undefined &&
      entryId !== this.#drawnEntry &&
      this.#drawn.length > 0 &&
      canAnimate(ctx.fullLayout);
    this.#pending = undefined;
    this.#clock.stop();
    this.#tween = undefined;
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
      };
    }
    this.#drawn = sectors.map((s) => ({
      ...stateOf(s),
      id: s.node.id,
      parentId: s.node.parent?.id,
    }));
    this.#drawnStyles = styles;
    this.#drawnEntry = entryId;
    if (this.#tween) this.#clock.start(this.#step);
    else this.#draw(this.#drawn, styles, 1);
  }

  dispose(): void {
    this.#clock.stop();
    const ctx = this.#ctx;
    if (ctx) releaseUniformText(ctx.primitives, ctx.trace.type, this, false);
  }

  /**
   * The labels of the last context, sized with `layout.uniformtext` (E4.6) as negotiated with the
   * other sunbursts of the chart (Plotly's `_sunburstText_minsize`).
   */
  #layoutLabels(
    ctx: TracePlotContext<SunburstCalc>,
    geometry: ReturnType<typeof sunburstGeometry>,
    uniform = uniformTextOf(ctx.fullLayout),
  ): SectorLabel[] {
    const { trace, calc, fullLayout } = ctx;
    const layout = calc.layout;
    if (!geometry || !layout) {
      if (uniform.mode) releaseUniformText(ctx.primitives, trace.type, this);
      return [];
    }
    const pass: UniformTextPass = { uniform, items: [] };
    const labels = layoutSunburstText(trace, calc, geometry, layout, fullLayout, pass);
    const size = negotiateUniformText(ctx.primitives, trace.type, this, pass.items, uniform, (u) =>
      this.#refresh(u),
    );
    if (size === uniformTextSize(pass.items, uniform)) return labels;
    return layoutSunburstText(trace, calc, geometry, layout, fullLayout, {
      uniform,
      size,
      items: [],
    });
  }

  /** Redraw the labels with another sunburst's `uniformtext` negotiation. */
  #refresh(uniform: UniformText): void {
    const ctx = this.#ctx;
    if (!ctx) return;
    this.#labels = this.#layoutLabels(ctx, sunburstGeometry(ctx.calc, ctx.trace), uniform);
    if (!this.#clock.running) this.#draw(this.#drawn, this.#drawnStyles, 1);
    ctx.invalidate();
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
    // Like plotly.js (`gd._transitioning`): a click during a drill transition does nothing, not
    // even its events (which would announce a drill that doesn't happen).
    if (this.#clock.running) return true;
    const { point, nextLevel } = click;
    const proceed = emitNodeClick(chart, 'sunburstclick', point, nextLevel);
    if (!proceed || nextLevel === undefined) return true;
    this.#pending = nextLevel;
    drillTo(chart, index, nextLevel);
    return true;
  }

  /** Draw the running transition at time `t`; the last frame draws the new layout exactly. */
  readonly #step = (t: number): void => {
    const tween = this.#tween;
    const ctx = this.#ctx;
    if (!tween || !ctx) return;
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
    this.#draw(states, styles, labelAlpha(t));
    ctx.invalidate();
  };

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
    this.#arcs = syncPrimitive(
      ctx,
      this.#arcs,
      data,
      (d) => createArcPrimitive(ctx.primitives, d),
      orderOf(ORDER.arcs, ctx.index),
    );

    // Transitions keep the new labels typeset but transparent until they fade in.
    const labels = sectorTextLabels(this.#labels, height, textAlpha * opacity);
    this.#text = syncPrimitive(
      ctx,
      this.#text,
      labels.length > 0 ? { labels } : undefined,
      (d) => createTextPrimitive(ctx.primitives, d),
      orderOf(ORDER.text, ctx.index),
    );
  }
}

/** The sunburst `plot` part: one view per visible sunburst. */
export const sunburstRenderer: TraceRenderer<SunburstCalc> = {
  create: (ctx) => new SunburstView(ctx),
};
