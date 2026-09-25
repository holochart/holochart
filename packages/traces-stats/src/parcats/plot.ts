/**
 * `parcats` renderer (plan E10.11). A domain trace: it draws into the overlay viewport, whose world
 * units are container px with a bottom-left origin, so container `(x, y)` is world
 * `(x, height − y)`.
 *
 * Primitives, bottom to top: the path ribbons (one lazily loaded fill, one polygon per path at
 * 60 % alpha, in color order), the hovered paths (a second small fill at 80 %, while the base
 * copies are hidden by a color-only update), the colored bands and the category outlines
 * (instanced rects) and the labels (one text primitive). Hover only recolors; a drag re-lays out.
 */
import {
  createLazyFillPrimitive,
  createRectPrimitive,
  createTextPrimitive,
  IDENTITY_TRANSFORM,
  type FillData,
  type LazyFillPrimitive,
  type RectData,
  type RectPrimitive,
  type RGBA,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type {
  ComponentPointerEvent,
  TracePlotContext,
  TraceRenderer,
  TraceView,
} from '@mk7s/holochart-runtime';
import { chartOf, inkColor, rgba, textFontOf, traceRect } from '../parcoords/common.ts';
import type { ParcatsCalc } from './calc.ts';
import { ParcatsDrag } from './drag.ts';
import { highlightOf } from './hover.ts';
import {
  DIM_WIDTH,
  hitTest,
  layoutFor,
  pathOutline,
  type CatBox,
  type ParcatsLayout,
  type ParcatsOrder,
  type ParcatsState,
  type Rect,
} from './layout.ts';

type Ctx = TracePlotContext<ParcatsCalc>;

/** Render orders in the overlay (like table and pie, in [-10, 0)), plus trace order. */
const LAYER = { paths: -9.6, hover: -9.5, bands: -9.4, cats: -9.3, text: -9.2 } as const;
const orderOf = (layer: number, index: number): number => layer + Math.min(index, 999) * 1e-4;

const PATH_ALPHA = 0.6;
const HOVER_OPACITY = 0.8;

/** Plotly pseudo-HTML label → plain text lines. */
const plainText = (s: string): string => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');

class ParcatsView implements TraceView<ParcatsCalc> {
  #ctx: Ctx | undefined;
  #calc: ParcatsCalc | undefined;
  #rect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  #layout: ParcatsLayout | undefined;
  /** Path outlines of `#layout` in world px, in draw order. */
  #outlines: { x: number[]; y: number[] }[] = [];
  #drag: ParcatsState | undefined;
  /** Order shown after a drop until the restyle it triggered arrives. */
  #pending: ParcatsOrder | undefined;
  #hover: { paths: Set<number>; cat?: CatBox } | undefined;

  #paths: LazyFillPrimitive | undefined;
  #hovered: LazyFillPrimitive | undefined;
  #bands: RectPrimitive | undefined;
  #cats: RectPrimitive | undefined;
  #text: TextPrimitive | undefined;

  readonly #interaction = new ParcatsDrag({
    layout: () => this.#layout,
    arrangement: () => this.#ctx?.trace['arrangement'],
    show: (state) => {
      this.#drag = state;
      this.#redraw();
    },
    drop: (order, update, event) => {
      const ctx = this.#ctx;
      this.#drag = undefined;
      this.#pending = order;
      this.#redraw();
      if (ctx) {
        chartOf(event)
          ?.restyle(update, [ctx.index], { gui: true })
          .catch(() => undefined);
      }
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
      this.#pending = undefined;
      this.#drag = undefined;
    }
    this.#hover = undefined;
    this.#redraw();
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    const dragging = this.#interaction.handle(event);
    if (dragging || this.#interaction.active) {
      this.#setHover(undefined);
      return dragging;
    }
    const layout = this.#layout;
    const ctx = this.#ctx;
    if (event.type === 'leave' || !layout || !ctx) {
      this.#setHover(undefined);
      return false;
    }
    if (event.type !== 'move') return false;
    const hit = hitTest(layout, event.x, event.y);
    this.#setHover(highlightOf(layout.calc, ctx.trace, hit));
    const arrangement = ctx.trace['arrangement'];
    // The runtime applies a cursor only from a consumed move; hover needs the move unconsumed.
    if (hit?.kind === 'category' && arrangement !== 'fixed') {
      event.cursor = arrangement === 'freeform' ? 'move' : 'ns-resize';
    }
    // Hover labels come from `hoverPoints`: never consume a plain move.
    return false;
  }

  #setHover(hover: { paths: Set<number>; cat?: CatBox } | undefined): void {
    const key = (h: typeof hover): string =>
      h ? `${[...h.paths].join()}|${h.cat ? `${h.cat.dim}:${h.cat.cat}` : ''}` : '';
    if (key(hover) === key(this.#hover)) return;
    this.#hover = hover;
    this.#redraw();
  }

  #redraw(): void {
    const ctx = this.#ctx;
    const calc = this.#calc;
    if (!ctx || !calc) return;
    const state = this.#drag ?? (this.#pending ? { order: this.#pending } : {});
    const layout = layoutFor(calc, ctx.trace, ctx.fullLayout, this.#rect, state);
    const H = ctx.viewport.size.height;
    const changed = layout !== this.#layout;
    this.#layout = layout;
    if (changed) {
      this.#outlines = layout.paths.map((p) => {
        const o = pathOutline(
          layout.dims.map((d) => d.x),
          p.ys,
          p.height,
          layout.curvature,
        );
        return { x: o.x, y: o.y.map((y) => H - y) };
      });
    }
    const hover = this.#hover;
    const colors = new Float32Array(layout.paths.length * 4);
    const hovered: number[] = [];
    layout.paths.forEach((p, k) => {
      const c = rgba(p.color, [0.5, 0.5, 0.5, 1]);
      const lit = hover?.paths.has(p.index) === true;
      if (lit) hovered.push(k);
      colors.set([c[0], c[1], c[2], lit ? 0 : c[3] * PATH_ALPHA], k * 4);
    });
    if (changed || !this.#paths) {
      this.#paths = this.#fill(
        ctx,
        this.#paths,
        fillData(
          this.#outlines,
          layout.paths.map((_, k) => k),
          colors,
        ),
        LAYER.paths,
      );
    } else this.#paths.update({ color: colors });
    const lit = new Float32Array(hovered.length * 4);
    hovered.forEach((k, i) =>
      lit.set([...rgba(layout.paths[k]!.color, [0.5, 0.5, 0.5, 1])], i * 4),
    );
    this.#hovered = this.#fill(
      ctx,
      this.#hovered,
      fillData(this.#outlines, hovered, lit),
      LAYER.hover,
    );
    this.#hovered.update({ opacity: HOVER_OPACITY });

    const ink = inkColor(ctx.fullLayout, 1);
    const bands = new Rects();
    const cats = new Rects();
    for (const dim of layout.dims) {
      for (const cat of dim.cats) {
        for (const b of cat.bands) {
          const c = rgba(b.color, [0.5, 0.5, 0.5, 1]);
          bands.push(
            cat.x,
            H - (b.y + b.height),
            cat.x + DIM_WIDTH,
            H - b.y,
            [c[0], c[1], c[2], 1],
            ink,
            0,
          );
        }
        const thick = hover?.cat?.dim === cat.dim && hover.cat.cat === cat.cat;
        cats.push(
          cat.x,
          H - (cat.y + cat.height),
          cat.x + DIM_WIDTH,
          H - cat.y,
          [0, 0, 0, 0],
          ink,
          thick ? 2.5 : 1,
        );
      }
    }
    this.#bands = this.#rects(ctx, this.#bands, bands, LAYER.bands);
    this.#cats = this.#rects(ctx, this.#cats, cats, LAYER.cats);

    if (changed || !this.#text) {
      const labels = this.#labels(ctx, layout, H);
      if (!this.#text) {
        this.#text = createTextPrimitive(ctx.primitives, { labels });
        ctx.add(this.#text);
      } else this.#text.update({ labels });
      this.#text.object.renderOrder = orderOf(LAYER.text, ctx.index);
      this.#text.setTransform(IDENTITY_TRANSFORM);
    }
    ctx.invalidate();
  }

  /** Category labels (left of their band, right of it in the last column) and dimension labels. */
  #labels(ctx: Ctx, layout: ParcatsLayout, H: number): TextLabel[] {
    const tick = textFontOf(ctx.trace['tickfont']);
    const title = textFontOf(ctx.trace['labelfont']);
    const paper = rgba(ctx.fullLayout['paper_bgcolor'], [1, 1, 1, 1]);
    const n = layout.dims.length;
    const labels: TextLabel[] = [];
    for (const dim of layout.dims) {
      const right = n > 1 && dim.display === n - 1;
      for (const cat of dim.cats) {
        labels.push({
          text: plainText(cat.label),
          x: right ? cat.x + DIM_WIDTH + 5 : cat.x - 5,
          y: H - (cat.y + cat.height / 2),
          anchorX: right ? 'left' : 'right',
          anchorY: 'middle',
          font: tick.font,
          color: tick.color,
          // Plotly's text shadow in the paper color.
          outline: { width: 1, color: paper, blur: 1 },
        });
      }
      const top = dim.cats[0];
      if (top && dim.label) {
        labels.push({
          text: plainText(dim.label),
          x: dim.x + DIM_WIDTH / 2,
          y: H - (top.y - 5),
          anchorX: 'center',
          anchorY: 'bottom',
          font: title.font,
          color: title.color,
        });
      }
    }
    return labels;
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

  #rects(ctx: Ctx, current: RectPrimitive | undefined, batch: Rects, layer: number): RectPrimitive {
    const data = batch.data();
    let rects = current;
    if (!rects) {
      rects = createRectPrimitive(ctx.primitives, data);
      ctx.add(rects);
    } else rects.update(data);
    rects.object.renderOrder = orderOf(layer, ctx.index);
    rects.setTransform(IDENTITY_TRANSFORM);
    return rects;
  }
}

/** Fill data of the outlines at draw positions `ks`, one ring (polygon) each. */
function fillData(
  outlines: readonly { x: number[]; y: number[] }[],
  ks: readonly number[],
  color: Float32Array,
): FillData {
  let n = 0;
  for (const k of ks) n += outlines[k]!.x.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const rings = new Uint32Array(ks.length);
  let v = 0;
  ks.forEach((k, i) => {
    const o = outlines[k]!;
    rings[i] = v;
    x.set(o.x, v);
    y.set(o.y, v);
    v += o.x.length;
  });
  return { x, y, rings, color };
}

/** Rect instances for one rect primitive. */
class Rects {
  readonly #c: number[][] = [[], [], [], [], [], [], []];

  push(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    fill: RGBA,
    border: RGBA,
    width: number,
  ): void {
    const c = this.#c;
    c[0]!.push(x0);
    c[1]!.push(y0);
    c[2]!.push(x1);
    c[3]!.push(y1);
    c[4]!.push(...fill);
    c[5]!.push(...border);
    c[6]!.push(width);
  }

  data(): Partial<RectData> & Pick<RectData, 'x0' | 'y0' | 'x1' | 'y1'> {
    const [x0, y0, x1, y1, fill, border, width] = this.#c as [
      number[],
      number[],
      number[],
      number[],
      number[],
      number[],
      number[],
    ];
    return {
      x0: Float64Array.from(x0),
      y0: Float64Array.from(y0),
      x1: Float64Array.from(x1),
      y1: Float64Array.from(y1),
      fill: Float32Array.from(fill),
      borderColor: Float32Array.from(border),
      borderWidth: Float32Array.from(width),
      // Plotly strokes the category rects centered on their edges, crisp.
      borderAlign: 'center',
      snap: true,
    };
  }
}

/** The parcats `plot` part: one {@link ParcatsView} per visible trace. */
export const parcatsRenderer: TraceRenderer<ParcatsCalc> = {
  create: (ctx) => new ParcatsView(ctx),
};
