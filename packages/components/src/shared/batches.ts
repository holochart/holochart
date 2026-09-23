/**
 * Reusable primitive wrappers for components: each owns one GPU primitive for its whole life and
 * re-uploads only when its content changed, so zoom/pan updates reuse objects (plan E3.4) and an
 * unchanged update costs a comparison, not an upload.
 *
 * Geometry is given in container px; a {@link DataTransform} (see `host.ts`) maps it to the world
 * space of the viewport the primitive lives in.
 */
import {
  createRectPrimitive,
  createTextPrimitive,
  LinePrimitive,
  type DataTransform,
  type Primitive,
  type PrimitiveContext,
  type RectPrimitive,
  type TextLabel,
  type TextPrimitive,
  type Viewport,
} from '@mk7s/holochart-render';
import type { ComponentDrawContext } from '@mk7s/holochart-runtime';
import type { DashItem, LabelItem, RectItem } from '../axes/geometry.ts';
import { sameTransform } from './host.ts';
import { LINE_HEIGHT } from './text.ts';

/** Draw order inside a subplot viewport for things that must stay below every trace. */
export const BELOW_TRACES_ORDER = -1e12;

type Adder = Pick<ComponentDrawContext, 'add' | 'remove'>;

function sameArray(a: ArrayLike<number> | undefined, b: ArrayLike<number>): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Base: a primitive attached to one viewport, with a cached transform. */
abstract class Batch<P extends Primitive<unknown>> {
  readonly primitive: P;
  readonly viewport: Viewport;
  #transform: DataTransform | undefined;
  readonly #ctx: Adder;

  protected constructor(ctx: Adder, primitive: P, viewport: Viewport, renderOrder?: number) {
    this.#ctx = ctx;
    this.primitive = primitive;
    this.viewport = viewport;
    if (renderOrder !== undefined) primitive.object.renderOrder = renderOrder;
    ctx.add(primitive, viewport);
  }

  setTransform(t: DataTransform): void {
    if (sameTransform(this.#transform, t)) return;
    this.#transform = t;
    this.primitive.setTransform(t);
  }

  /** Remove from the viewport and free the primitive. */
  dispose(): void {
    this.#ctx.remove(this.primitive);
  }
}

/** Axis-aligned, pixel-snapped rects (lines, ticks, grid, legend boxes). */
export class RectBatch extends Batch<RectPrimitive> {
  #x0: Float64Array | undefined;
  #y0: Float64Array | undefined;
  #x1: Float64Array | undefined;
  #y1: Float64Array | undefined;
  #fill: Float32Array | undefined;
  #border: Float32Array | undefined;
  #borderWidth: Float32Array | undefined;

  constructor(ctx: Adder, primitives: PrimitiveContext, viewport: Viewport, renderOrder?: number) {
    super(
      ctx,
      createRectPrimitive(primitives, { snap: true, borderAlign: 'inside' }),
      viewport,
      renderOrder,
    );
  }

  /** Replace the rects. `borders` gives per-rect border color and width (inside the rect). */
  set(
    items: readonly RectItem[],
    borders?: readonly { color: readonly number[]; width: number }[],
  ): void {
    const n = items.length;
    const x0 = new Float64Array(n);
    const y0 = new Float64Array(n);
    const x1 = new Float64Array(n);
    const y1 = new Float64Array(n);
    const fill = new Float32Array(n * 4);
    items.forEach((r, i) => {
      x0[i] = r.x0;
      y0[i] = r.y0;
      x1[i] = r.x1;
      y1[i] = r.y1;
      fill.set(r.color, i * 4);
    });
    const border = new Float32Array(n * 4);
    const borderWidth = new Float32Array(n);
    if (borders) {
      borders.forEach((b, i) => {
        if (i >= n) return;
        border.set(b.color.slice(0, 4), i * 4);
        borderWidth[i] = b.width;
      });
    }
    const geometry =
      sameArray(this.#x0, x0) &&
      sameArray(this.#y0, y0) &&
      sameArray(this.#x1, x1) &&
      sameArray(this.#y1, y1);
    const style =
      sameArray(this.#fill, fill) &&
      sameArray(this.#border, border) &&
      sameArray(this.#borderWidth, borderWidth);
    if (geometry && style) return;
    this.#x0 = x0;
    this.#y0 = y0;
    this.#x1 = x1;
    this.#y1 = y1;
    this.#fill = fill;
    this.#border = border;
    this.#borderWidth = borderWidth;
    this.primitive.update(
      geometry
        ? { fill, borderColor: border, borderWidth }
        : { x0, y0, x1, y1, fill, borderColor: border, borderWidth },
    );
  }
}

/**
 * Straight dashed segments sharing one dash pattern (dashed grid lines). Centers are snapped so a
 * `width`-px line covers whole device pixels.
 */
export class DashBatch extends Batch<LinePrimitive> {
  #key = '';

  constructor(ctx: Adder, primitives: PrimitiveContext, viewport: Viewport, renderOrder?: number) {
    super(ctx, new LinePrimitive(primitives, { cap: 'butt' }), viewport, renderOrder);
  }

  set(items: readonly DashItem[], pixelRatio: number): void {
    const n = items.length;
    const x = new Float64Array(n * 2);
    const y = new Float64Array(n * 2);
    const color = new Float32Array(n * 8);
    const width = new Float32Array(n * 2);
    const starts: number[] = [];
    const snap = (p: number, w: number): number => {
      const dpr = pixelRatio > 0 ? pixelRatio : 1;
      return (Math.round(p * dpr - (w * dpr) / 2) + (w * dpr) / 2) / dpr;
    };
    items.forEach((d, i) => {
      const vertical = d.x0 === d.x1;
      x[2 * i] = vertical ? snap(d.x0, d.width) : d.x0;
      x[2 * i + 1] = vertical ? snap(d.x1, d.width) : d.x1;
      y[2 * i] = vertical ? d.y0 : snap(d.y0, d.width);
      y[2 * i + 1] = vertical ? d.y1 : snap(d.y1, d.width);
      color.set(d.color, 8 * i);
      color.set(d.color, 8 * i + 4);
      width[2 * i] = d.width;
      width[2 * i + 1] = d.width;
      if (i > 0) starts.push(2 * i);
    });
    const dash = items[0]?.dash ?? 'solid';
    const key = `${dash}|${Array.from(x).join()}|${Array.from(y).join()}|${Array.from(color).join()}|${Array.from(width).join()}`;
    if (key === this.#key) return;
    this.#key = key;
    this.primitive.update({ x, y, starts, color, width, dash });
  }
}

/** Convert a layout label to a text-primitive label. */
export function toTextLabel(l: LabelItem): TextLabel {
  return {
    text: l.text,
    x: l.x,
    y: l.y,
    anchorX: l.anchorX,
    anchorY: l.anchorY,
    angle: l.angle,
    font: l.font,
    color: l.color,
    lineHeight: LINE_HEIGHT,
    ...(l.align ? { align: l.align } : {}),
  };
}

/** Batched SDF labels (one draw call); only labels whose layout changed are re-typeset. */
export class TextBatch extends Batch<TextPrimitive> {
  #key = '';

  constructor(ctx: Adder, primitives: PrimitiveContext, viewport: Viewport, renderOrder?: number) {
    super(
      ctx,
      createTextPrimitive(primitives, { mode: 'fixed', sizing: 'screen' }),
      viewport,
      renderOrder,
    );
  }

  set(labels: readonly LabelItem[]): void {
    const key = JSON.stringify(labels);
    if (key === this.#key) return;
    this.#key = key;
    this.primitive.update({ labels: labels.map(toTextLabel) });
  }

  /** Resolves when every label requested so far is typeset. */
  get ready(): Promise<void> {
    return this.primitive.ready;
  }
}
