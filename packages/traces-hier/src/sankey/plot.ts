/**
 * `sankey` renderer (plan E13.5a, E13.5b). A domain trace: it draws into the overlay viewport,
 * whose world units are container px with a bottom-left origin, so container `(x, y)` is world
 * `(x, height − y)`.
 *
 * Primitives, bottom to top: the link ribbons (one lazily loaded fill, one polygon per link, in
 * link order), the ribbons of the links a drag moves (a second small fill while dragging, so a
 * move re-tessellates and re-triangulates only those), the link outlines (one line primitive,
 * only when some `link.line.width` is set), the nodes (one instanced rect set) and the labels (one
 * text primitive). Hover recolors (a color-only fill update: hovered links take their
 * `hovercolor`); a drag re-lays out only link breadths and moved ribbons.
 *
 * With `link.flow` (plan E13.5c), flow particles (one instanced draw, `flow.ts`, loaded on first
 * use) stream along the ribbons, above the moving ribbons and below the outlines.
 */
import {
  createLazyFillPrimitive,
  createRectPrimitive,
  createTextPrimitive,
  IDENTITY_TRANSFORM,
  LinePrimitive,
  type FillData,
  type LazyFillPrimitive,
  type LineData,
  type Primitive,
  type PrimitiveContext,
  type RectData,
  type RectPrimitive,
  type RGBA,
  type TextFont,
  type TextFontWeight,
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
import { labelContent } from '@mk7s/holochart-traces-basic';
import { Mesh } from 'three';
import type { SankeyCalc } from './calc.ts';
import { SankeyDrag } from './drag.ts';
import type { FlowParticles, FlowState } from './flow.ts';
import {
  eventPoint,
  highlightOf,
  hitTest,
  partHoverinfo,
  traceRect,
  type SankeyHit,
} from './hover.ts';
import {
  modelFor,
  rgba,
  TEXT_PAD,
  type NodeOverrides,
  type Rect,
  type SankeyModel,
} from './model.ts';

type Ctx = TracePlotContext<SankeyCalc>;

/** Render orders in the overlay (like pie and parcats, in [-10, 0)), plus trace order. */
const LAYER = {
  links: -9.6,
  moving: -9.55,
  flow: -9.52,
  lines: -9.5,
  nodes: -9.4,
  text: -9.3,
} as const;
const orderOf = (layer: number, index: number): number => layer + Math.min(index, 999) * 1e-4;

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

/** A defaulted `textfont` → the text primitive's font and color. */
function fontOf(container: unknown): { font: TextFont; color: RGBA } {
  const f = (container ?? {}) as Record<string, unknown>;
  const size = Number(f['size']);
  const weight = f['weight'];
  return {
    font: {
      family: typeof f['family'] === 'string' ? f['family'] : 'sans-serif',
      size: Number.isFinite(size) && size > 0 ? size : 12,
      ...(weight === 'normal' || weight === 'bold' || typeof weight === 'number'
        ? { weight: weight as TextFontWeight }
        : {}),
      ...(f['style'] === 'italic' ? { style: 'italic' as const } : {}),
      ...(typeof f['shadow'] === 'string' && f['shadow'] !== 'none' ? { shadow: f['shadow'] } : {}),
    },
    color: rgba(f['color'], [0.27, 0.27, 0.27, 1]),
  };
}

/** The flow particles' code (`flow.ts`), loaded the first time a trace sets `link.flow`. */
let flowCode: Promise<typeof import('./flow.ts')> | undefined;

/**
 * A trace's flow particles, before and after their code loads: a hidden mesh they then draw into.
 * `ready` covers the load, so `chart.ready` and image export wait for the particles.
 */
class LazyFlow implements Primitive<FlowState> {
  readonly object = new Mesh();
  readonly ready: Promise<void>;
  #particles: FlowParticles | undefined;
  #state: FlowState;
  #disposed = false;

  constructor(context: PrimitiveContext, state: FlowState) {
    this.#state = state;
    this.object.visible = false;
    this.ready = (flowCode ??= import('./flow.ts')).then(
      (mod) => {
        if (this.#disposed) return;
        this.#particles = mod.createFlowParticles(context, this.object);
        this.#particles.update(this.#state);
      },
      (error: unknown) => {
        flowCode = undefined;
        console.error('[holochart] could not load the sankey flow particles:', error);
      },
    );
  }

  update(patch: Partial<FlowState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#particles?.update(this.#state);
  }

  setTransform(): void {}

  setViewport(): void {}

  dispose(): void {
    this.#disposed = true;
    this.#particles?.dispose();
    this.object.removeFromParent();
  }
}

/** Links whose ribbons a drag of `moved` nodes can change: theirs and their neighbours'. */
export function affectedLinks(model: SankeyModel, moved: ReadonlySet<number>): Set<number> {
  const touched = new Set(moved);
  for (const l of model.links) {
    if (moved.has(l.source)) touched.add(l.target);
    if (moved.has(l.target)) touched.add(l.source);
  }
  const out = new Set<number>();
  model.links.forEach((l, k) => {
    if (l.circular || touched.has(l.source) || touched.has(l.target)) out.add(k);
  });
  return out;
}

class SankeyView implements TraceView<SankeyCalc> {
  #ctx: Ctx | undefined;
  #calc: SankeyCalc | undefined;
  #rect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  #model: SankeyModel | undefined;
  /** Node positions of a drag in progress, or of a drop until its restyle arrives. */
  #overrides: NodeOverrides | undefined;
  /** Links in the moving fill during a drag. */
  #moving: Set<number> | undefined;
  #hover: SankeyHit | undefined;
  #lit = new Set<number>();
  /** Chart of the gesture in progress (its later events may carry no DOM event). */
  #chart: Chart | undefined;
  /** Keys of what the fills hold, to skip geometry uploads that would change nothing. */
  #linksKey = '';
  #movingKey = '';
  #textKey = '';

  #links: LazyFillPrimitive | undefined;
  #movingFill: LazyFillPrimitive | undefined;
  #lines: LinePrimitive | undefined;
  #flow: LazyFlow | undefined;
  #nodes: RectPrimitive | undefined;
  #text: TextPrimitive | undefined;

  readonly #drag = new SankeyDrag({
    model: () => this.#model,
    begin: (i) => {
      const model = this.#model;
      const n = model?.graph.nodes[i];
      if (model && n) {
        const moved = new Set<number>([i]);
        // With `snap`, the whole column may move.
        if (model.calc.arrangement === 'snap') {
          model.graph.nodes.forEach((m, k) => Math.abs(m.x0 - n.x0) < 1e-6 && moved.add(k));
        }
        this.#moving = affectedLinks(model, moved);
      }
      this.#setHover(undefined);
      this.#chart?.unhover();
    },
    show: (overrides) => {
      this.#overrides = overrides;
      if (!overrides) this.#moving = undefined;
      this.#redraw();
    },
    drop: (overrides, update) => {
      const ctx = this.#ctx;
      this.#overrides = overrides;
      this.#moving = undefined;
      this.#redraw();
      if (ctx) this.#chart?.restyle(update, [ctx.index], { gui: true }).catch(() => undefined);
    },
    click: (hit) => {
      const ctx = this.#ctx;
      const model = this.#model;
      const chart = this.#chart;
      if (!ctx || !model || !chart || chart.fullLayout?.['hovermode'] === false) return;
      if (partHoverinfo(ctx.trace, 'node') === 'skip') return;
      const data = chart.data[ctx.index];
      chart.emit('click', { points: [eventPoint(model, hit, ctx.index, data)] });
    },
  });

  constructor(ctx: Ctx) {
    this.update(ctx);
  }

  update(ctx: Ctx): void {
    this.#ctx = ctx;
    this.#rect = traceRect(ctx);
    if (ctx.calc !== this.#calc) {
      this.#calc = ctx.calc;
      this.#overrides = undefined;
      this.#moving = undefined;
    }
    this.#hover = undefined;
    this.#lit = new Set();
    this.#redraw();
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    if (event.native) this.#chart = chartOf(event) ?? this.#chart;
    const taken = this.#drag.handle(event);
    if (taken || this.#drag.active) return taken;
    const model = this.#model;
    if (event.type === 'leave' || !model) {
      this.#setHover(undefined);
      return false;
    }
    if (event.type !== 'move') return false;
    const hit = hitTest(model, event.x, event.y);
    this.#setHover(hit);
    // Hover labels come from `hoverPoints`: never consume a plain move.
    return false;
  }

  #setHover(hit: SankeyHit | undefined): void {
    const same =
      hit === this.#hover ||
      (hit && this.#hover && hit.kind === this.#hover.kind && hit.i === this.#hover.i);
    if (same) return;
    this.#hover = hit;
    const model = this.#model;
    this.#lit = model ? highlightOf(model, hit) : new Set();
    this.#recolor();
  }

  /** Link colors with the highlight applied (hovered links take `hovercolor`). */
  #colors(ks: readonly number[]): Float32Array {
    const model = this.#model!;
    const out = new Float32Array(ks.length * 4);
    ks.forEach((k, j) => {
      const l = model.links[k]!;
      out.set(this.#lit.has(k) && !l.scaled ? l.hover : l.color, j * 4);
    });
    return out;
  }

  #recolor(): void {
    const model = this.#model;
    if (!model || !this.#links) return;
    const [still, moving] = this.#split(model);
    this.#links.update({ color: this.#colors(still) });
    if (this.#movingFill && moving.length > 0) {
      this.#movingFill.update({ color: this.#colors(moving) });
    }
    this.#flow?.update({ lit: this.#lit });
    this.#ctx?.invalidate();
  }

  /** Link positions in the base fill and in the moving fill. */
  #split(model: SankeyModel): [number[], number[]] {
    const moving = this.#moving;
    const still: number[] = [];
    const moved: number[] = [];
    model.links.forEach((_, k) => (moving?.has(k) ? moved : still).push(k));
    return [still, moved];
  }

  #redraw(): void {
    const ctx = this.#ctx;
    const calc = this.#calc;
    if (!ctx || !calc) return;
    const model = modelFor(calc, ctx.trace, ctx.fullLayout, this.#rect, this.#overrides);
    this.#model = model;
    if (this.#hover) this.#lit = highlightOf(model, this.#hover);
    const H = ctx.viewport.size.height;

    const [still, moving] = this.#split(model);
    const stillKey = `${H}|${still.map((k) => model.links[k]!.key).join('|')}`;
    if (!this.#links || stillKey !== this.#linksKey) {
      this.#links = this.#fill(
        ctx,
        this.#links,
        fillData(model, still, H, this.#colors(still)),
        LAYER.links,
      );
      this.#linksKey = stillKey;
    } else this.#links.update({ color: this.#colors(still) });
    if (moving.length > 0) {
      const key = `${H}|${moving.map((k) => model.links[k]!.key).join('|')}`;
      if (!this.#movingFill || key !== this.#movingKey) {
        this.#movingFill = this.#fill(
          ctx,
          this.#movingFill,
          fillData(model, moving, H, this.#colors(moving)),
          LAYER.moving,
        );
        this.#movingKey = key;
      } else this.#movingFill.update({ color: this.#colors(moving) });
    } else if (this.#movingFill) {
      ctx.remove(this.#movingFill);
      this.#movingFill = undefined;
      this.#movingKey = '';
    }

    this.#drawFlow(ctx, model, H);
    this.#drawLines(ctx, model, H);
    this.#drawNodes(ctx, model, H);
    this.#drawText(ctx, model, H);
    ctx.invalidate();
  }

  /** Flow particles, when `link.flow` is set (the defaults coerce it only then). */
  #drawFlow(ctx: Ctx, model: SankeyModel, H: number): void {
    const link = (ctx.trace['link'] ?? {}) as Record<string, unknown>;
    if (!link['flow']) {
      if (this.#flow) ctx.remove(this.#flow);
      this.#flow = undefined;
      return;
    }
    // `config.a11y.reducedMotion` (plan E17.5), which supply-defaults keeps on the full layout.
    const { _reducedMotion: reducedMotion } = ctx.fullLayout as {
      _reducedMotion?: 'auto' | boolean;
    };
    const state: FlowState = { model, height: H, lit: this.#lit, reducedMotion };
    if (!this.#flow) {
      this.#flow = new LazyFlow(ctx.primitives, state);
      ctx.add(this.#flow);
    } else this.#flow.update(state);
    this.#flow.object.renderOrder = orderOf(LAYER.flow, ctx.index);
  }

  #drawLines(ctx: Ctx, model: SankeyModel, H: number): void {
    const outlined = model.links.filter((l) => l.lineWidth > 0 && l.lineColor[3] > 0);
    if (outlined.length === 0) {
      if (this.#lines) ctx.remove(this.#lines);
      this.#lines = undefined;
      return;
    }
    const x: number[] = [];
    const y: number[] = [];
    const starts: number[] = [];
    const color: number[] = [];
    const width: number[] = [];
    for (const l of outlined) {
      if (x.length > 0) starts.push(x.length);
      const n = l.outline.x.length;
      for (let k = 0; k <= n; k++) {
        x.push(l.outline.x[k % n]!);
        y.push(H - l.outline.y[k % n]!);
        color.push(...l.lineColor);
        width.push(l.lineWidth);
      }
    }
    const data: Partial<LineData> & Pick<LineData, 'x' | 'y'> = {
      x: Float64Array.from(x),
      y: Float64Array.from(y),
      starts,
      color: Float32Array.from(color),
      width: Float32Array.from(width),
      join: 'miter',
    };
    if (!this.#lines) {
      this.#lines = new LinePrimitive(ctx.primitives, data);
      ctx.add(this.#lines);
    } else this.#lines.update(data);
    this.#lines.object.renderOrder = orderOf(LAYER.lines, ctx.index);
    this.#lines.setTransform(IDENTITY_TRANSFORM);
  }

  #drawNodes(ctx: Ctx, model: SankeyModel, H: number): void {
    const n = model.nodes.length;
    const data: Partial<RectData> & Pick<RectData, 'x0' | 'y0' | 'x1' | 'y1'> = {
      x0: new Float64Array(n),
      y0: new Float64Array(n),
      x1: new Float64Array(n),
      y1: new Float64Array(n),
      fill: new Float32Array(n * 4),
      borderColor: new Float32Array(n * 4),
      borderWidth: new Float32Array(n),
      // Plotly strokes the node rects centered on their edges.
      borderAlign: 'center',
    };
    model.nodes.forEach((b, k) => {
      (data.x0 as Float64Array)[k] = b.x0;
      (data.x1 as Float64Array)[k] = b.x1;
      (data.y0 as Float64Array)[k] = H - b.y1;
      (data.y1 as Float64Array)[k] = H - b.y0;
      (data.fill as Float32Array).set(b.color, k * 4);
      (data.borderColor as Float32Array).set(b.lineColor, k * 4);
      (data.borderWidth as Float32Array)[k] = b.lineWidth;
    });
    if (!this.#nodes) {
      this.#nodes = createRectPrimitive(ctx.primitives, data);
      ctx.add(this.#nodes);
    } else this.#nodes.update(data);
    this.#nodes.object.renderOrder = orderOf(LAYER.nodes, ctx.index);
    this.#nodes.setTransform(IDENTITY_TRANSFORM);
  }

  /**
   * Node labels (Plotly): beside the node, 3 px past its outline — right of it, left of it in the
   * last column — centered on it; over the node, from its left edge, in a vertical sankey.
   */
  #drawText(ctx: Ctx, model: SankeyModel, H: number): void {
    const { font, color } = fontOf(ctx.trace['textfont']);
    const labels: TextLabel[] = [];
    for (const b of model.nodes) {
      if (b.node.label === '') continue;
      const content = labelContent(b.node.label, font);
      const pad = b.lineWidth / 2 + TEXT_PAD;
      const left = b.labelLeft;
      labels.push({
        text: content.text,
        ...(content.runs ? { runs: content.runs } : {}),
        font: content.font,
        color,
        x: model.horizontal ? (left ? b.x0 - pad : b.x1 + pad) : b.x0 + pad,
        y: H - (b.y0 + b.y1) / 2,
        anchorX: model.horizontal && left ? 'right' : 'left',
        anchorY: 'middle',
      });
    }
    const key = JSON.stringify(labels);
    if (this.#text && key === this.#textKey) return;
    this.#textKey = key;
    if (!this.#text) {
      this.#text = createTextPrimitive(ctx.primitives, { labels });
      ctx.add(this.#text);
    } else this.#text.update({ labels });
    this.#text.object.renderOrder = orderOf(LAYER.text, ctx.index);
    this.#text.setTransform(IDENTITY_TRANSFORM);
  }

  #fill(
    ctx: Ctx,
    current: LazyFillPrimitive | undefined,
    data: FillData,
    layer: number,
  ): LazyFillPrimitive {
    let fill = current;
    if (!fill) {
      fill = createLazyFillPrimitive(ctx.primitives, data);
      ctx.add(fill);
    } else fill.update(data);
    fill.object.renderOrder = orderOf(layer, ctx.index);
    fill.setTransform(IDENTITY_TRANSFORM);
    return fill;
  }
}

/** Fill data of the ribbons of links `ks` (world px), one polygon each. */
function fillData(
  model: SankeyModel,
  ks: readonly number[],
  H: number,
  color: Float32Array,
): FillData {
  let n = 0;
  for (const k of ks) n += model.links[k]!.outline.x.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const rings = new Uint32Array(ks.length);
  let v = 0;
  ks.forEach((k, i) => {
    const o = model.links[k]!.outline;
    rings[i] = v;
    for (let j = 0; j < o.x.length; j++) {
      x[v + j] = o.x[j]!;
      y[v + j] = H - o.y[j]!;
    }
    v += o.x.length;
  });
  return { x, y, rings, color };
}

/** The sankey `plot` part: one {@link SankeyView} per visible trace. */
export const sankeyRenderer: TraceRenderer<SankeyCalc> = {
  create: (ctx) => new SankeyView(ctx),
};
