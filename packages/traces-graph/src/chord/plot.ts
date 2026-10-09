/**
 * `chord` renderer (backlog G8, ADR-029). A domain trace: it draws into the overlay viewport,
 * whose world units are container px with a bottom-left origin, so container `(x, y)` is world
 * `(x, height − y)`.
 *
 * Primitives, bottom to top: the ribbons (one lazily loaded fill, one polygon per ribbon, or per
 * strip of a gradient ribbon, the widest ribbons first so the thin ones stay on top), the arcs
 * (one instanced arc set: the node ring, then the group ring) and the labels (one text
 * primitive).
 *
 * Hover (`handlePointer`) only recolors: the ribbons the pointer is about — the one under it, or
 * those of the node or group whose arc is under it — take their hover color and the others are
 * dimmed, a color-only update of the fill. Hover labels and events come from `hoverPoints`.
 */
import {
  createArcPrimitive,
  createLazyFillPrimitive,
  createTextPrimitive,
  IDENTITY_TRANSFORM,
  type ArcData,
  type ArcPrimitive,
  type FillData,
  type LazyFillPrimitive,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type {
  ComponentPointerEvent,
  TracePlotContext,
  TraceRenderer,
  TraceView,
} from '@mk7s/holochart-runtime';
import type { ChordCalc } from './calc.ts';
import { highlightOf, hitTest, type ChordHit } from './hover.ts';
import { DIM, LINE_HEIGHT, modelFor, traceRect, type ChordModel, type Rect } from './model.ts';

type Ctx = TracePlotContext<ChordCalc>;

/** Render orders in the overlay (like pie and sankey, in [-10, 0)), plus trace order. */
const LAYER = { ribbons: -9.6, arcs: -9.4, text: -9.3 } as const;
const orderOf = (layer: number, index: number): number => layer + Math.min(index, 999) * 1e-4;

/** The arc primitive's angle (counterclockwise from +x, y up) of a layout angle. */
const arcAngle = (a: number): number => Math.PI / 2 - a;

/** Arc instances of the node ring and of the group ring, in world px. */
export function arcData(model: ChordModel, height: number): Partial<ArcData> {
  const { nodes, groups, radii } = model;
  const n = nodes.length + groups.length;
  const data = {
    x: new Float64Array(n).fill(model.cx),
    y: new Float64Array(n).fill(height - model.cy),
    innerRadius: new Float32Array(n),
    outerRadius: new Float32Array(n),
    startAngle: new Float32Array(n),
    endAngle: new Float32Array(n),
    fill: new Float32Array(n * 4),
    borderColor: new Float32Array(n * 4),
    borderWidth: new Float32Array(n),
  };
  nodes.forEach((node, k) => {
    data.innerRadius[k] = radii.inner;
    data.outerRadius[k] = radii.outer;
    data.startAngle[k] = arcAngle(node.arc.start);
    data.endAngle[k] = arcAngle(node.arc.end);
    data.fill.set(node.color, k * 4);
    data.borderColor.set(node.lineColor, k * 4);
    data.borderWidth[k] = node.lineWidth;
  });
  groups.forEach((group, j) => {
    const k = nodes.length + j;
    data.innerRadius[k] = radii.groupInner;
    data.outerRadius[k] = radii.groupOuter;
    data.startAngle[k] = arcAngle(group.arc.start);
    data.endAngle[k] = arcAngle(group.arc.end);
    data.fill.set(group.color, k * 4);
  });
  return data;
}

/**
 * The polygon colors of the ribbons in drawing order: with a highlight, the ribbons in `lit` take
 * their hover color and the others are dimmed.
 */
export function ribbonColors(
  model: ChordModel,
  lit: ReadonlySet<number> | undefined,
): Float32Array {
  let count = 0;
  for (const r of model.ribbons) count += r.parts.length;
  const out = new Float32Array(count * 4);
  let p = 0;
  for (const at of model.order) {
    const r = model.ribbons[at]!;
    const on = lit?.has(at) === true;
    for (let j = 0; j < r.parts.length; j++, p++) {
      const c = on ? r.hover[j]! : r.colors[j]!;
      out.set(c, p * 4);
      if (lit && !on) out[p * 4 + 3] = c[3] * DIM;
    }
  }
  return out;
}

/** Fill data of the ribbons (world px), one polygon per part, in drawing order. */
export function ribbonData(
  model: ChordModel,
  height: number,
  lit: ReadonlySet<number> | undefined,
): FillData {
  let vertices = 0;
  let polygons = 0;
  for (const r of model.ribbons) {
    polygons += r.parts.length;
    for (const o of r.parts) vertices += o.x.length;
  }
  const x = new Float64Array(vertices);
  const y = new Float64Array(vertices);
  const rings = new Uint32Array(polygons);
  let v = 0;
  let p = 0;
  for (const at of model.order) {
    for (const o of model.ribbons[at]!.parts) {
      rings[p++] = v;
      for (let j = 0; j < o.x.length; j++, v++) {
        x[v] = o.x[j]!;
        y[v] = height - o.y[j]!;
      }
    }
  }
  return { x, y, rings, color: ribbonColors(model, lit) };
}

/** The labels for the text primitive, in world px. */
export function textLabels(model: ChordModel, height: number): TextLabel[] {
  return model.labels.map((l) => ({
    text: l.text,
    ...(l.runs ? { runs: l.runs } : {}),
    font: l.font,
    color: l.color,
    x: l.x,
    y: height - l.y,
    anchorX: l.anchor,
    anchorY: 'middle',
    angle: l.angle,
    lineHeight: LINE_HEIGHT,
    ...(l.maxWidth !== undefined ? { maxWidth: l.maxWidth, overflow: 'ellipsis' as const } : {}),
  }));
}

class ChordView implements TraceView<ChordCalc> {
  #ctx: Ctx | undefined;
  #rect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  #model: ChordModel | undefined;
  #hover: ChordHit | undefined;
  #lit: Set<number> | undefined;
  /** What the fill and the text hold, to skip uploads that would change nothing. */
  #height = NaN;
  #textKey = '';

  #ribbons: LazyFillPrimitive | undefined;
  #arcs: ArcPrimitive | undefined;
  #text: TextPrimitive | undefined;

  constructor(ctx: Ctx) {
    this.update(ctx);
  }

  update(ctx: Ctx): void {
    this.#ctx = ctx;
    this.#rect = traceRect(ctx);
    this.#hover = undefined;
    this.#lit = undefined;
    this.#redraw();
  }

  /** Moves highlight what is under the pointer; nothing is consumed (hover labels, clicks). */
  handlePointer(event: ComponentPointerEvent): boolean {
    const model = this.#model;
    if (event.type === 'leave' || !model) this.#setHover(undefined);
    else if (event.type === 'move') this.#setHover(hitTest(model, event.x, event.y));
    return false;
  }

  #setHover(hit: ChordHit | undefined): void {
    const before = this.#hover;
    if (hit?.kind === before?.kind && hit?.i === before?.i) return;
    this.#hover = hit;
    const model = this.#model;
    this.#lit = model && highlightOf(model, hit);
    if (!model || !this.#ribbons) return;
    this.#ribbons.update({ color: ribbonColors(model, this.#lit) });
    this.#ctx?.invalidate();
  }

  #redraw(): void {
    const ctx = this.#ctx;
    if (!ctx) return;
    const model = modelFor(ctx.calc, ctx.trace, ctx.fullLayout, this.#rect);
    const H = ctx.viewport.size.height;

    if (model.ribbons.length === 0) {
      if (this.#ribbons) ctx.remove(this.#ribbons);
      this.#ribbons = undefined;
    } else if (!this.#ribbons) {
      this.#ribbons = createLazyFillPrimitive(ctx.primitives, ribbonData(model, H, this.#lit));
      ctx.add(this.#ribbons);
    } else if (model !== this.#model || H !== this.#height) {
      this.#ribbons.update(ribbonData(model, H, this.#lit));
    } else {
      // The same ribbons: only a highlight this update ended is taken back.
      this.#ribbons.update({ color: ribbonColors(model, this.#lit) });
    }
    this.#height = H;
    if (this.#ribbons) {
      this.#ribbons.object.renderOrder = orderOf(LAYER.ribbons, ctx.index);
      this.#ribbons.setTransform(IDENTITY_TRANSFORM);
    }
    this.#model = model;

    const arcs = arcData(model, H);
    if (!this.#arcs) {
      this.#arcs = createArcPrimitive(ctx.primitives, arcs);
      ctx.add(this.#arcs);
    } else this.#arcs.update(arcs);
    this.#arcs.object.renderOrder = orderOf(LAYER.arcs, ctx.index);
    this.#arcs.setTransform(IDENTITY_TRANSFORM);

    const labels = textLabels(model, H);
    const key = JSON.stringify(labels);
    if (!this.#text || key !== this.#textKey) {
      this.#textKey = key;
      if (!this.#text) {
        this.#text = createTextPrimitive(ctx.primitives, { labels });
        ctx.add(this.#text);
      } else this.#text.update({ labels });
    }
    this.#text.object.renderOrder = orderOf(LAYER.text, ctx.index);
    this.#text.setTransform(IDENTITY_TRANSFORM);
    ctx.invalidate();
  }
}

/** The chord `plot` part: one {@link ChordView} per visible trace. */
export const chordRenderer: TraceRenderer<ChordCalc> = {
  create: (ctx) => new ChordView(ctx),
};
