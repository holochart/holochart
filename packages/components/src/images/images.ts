/**
 * The layout images component (plan E5.6): `layout.images[]` pictures (logos, backgrounds) in
 * paper, domain or data coordinates.
 *
 * Each image is one textured quad (`ImagePrimitive`) per placement (see `shared/layers.ts`). The
 * box is kept in class coordinates (axis linear units, or container px), so zoom and pan only set a
 * transform; the primitive fits the picture in its box in screen px (`contain` / `fill` /
 * `stretch`). Pictures load asynchronously: the primitive's `ready` promise holds `chart.ready`
 * until they are drawn, and a failed load warns once and draws nothing.
 */
import { createImagePrimitive, type ImageFit, type ImagePrimitive } from '@mk7s/holochart-render';
import type {
  ComponentDrawContext,
  ComponentModule,
  ComponentUpdatePlan,
  ComponentView,
} from '@mk7s/holochart-runtime';
import { anchorFraction } from '../shared/placement.ts';
import { axisAffine, classTransform, LayerHost, type LayerStack } from '../shared/layers.ts';
import { shapeDim, type ShapeAxis, type ShapeEnv } from '../shapes/geometry.ts';
import { subplotOf } from '../shapes/shapes.ts';
import { imagesAttributes, supplyImageDefaults, type FullLayoutImage } from './schema.ts';

/** Plotly `sizing` → the primitive's fit. */
const FIT: Record<FullLayoutImage['sizing'], ImageFit> = {
  contain: 'contain',
  fill: 'cover',
  stretch: 'stretch',
};

/** The defaulted images of a layout. */
export function imagesOf(fullLayout: Record<string, unknown>): FullLayoutImage[] {
  const list = fullLayout['images'];
  return Array.isArray(list) ? (list as FullLayoutImage[]) : [];
}

/** One dimension of an image box: its class axis (undefined: container px) and extent. */
export interface ImageSpan {
  /** Data axis whose linear units `lo`/`hi` are in (`undefined`: container px). */
  readonly axis: ShapeAxis | undefined;
  /** The axis of an axis or domain reference. */
  readonly owner: ShapeAxis | undefined;
  readonly paper: boolean;
  /** Box edges: left/right (x) or top/bottom (y) in screen terms. */
  readonly lo: number;
  readonly hi: number;
}

/**
 * The box of an image along one dimension (plotly.js `images/draw.js`): `pos` is the anchor side
 * of the box, `size` its extent in reference units (range units on data axes, so exponents on log
 * axes, as Plotly).
 */
export function imageSpan(
  ref: string,
  pos: unknown,
  size: number,
  anchor: string,
  letter: 'x' | 'y',
  env: ShapeEnv,
): ImageSpan | undefined {
  const dim = shapeDim(ref, letter, false, undefined, env);
  if (!dim) return undefined;
  const off = -anchorFraction(anchor);
  const base = { axis: dim.axis, owner: dim.owner, paper: dim.paper };
  if (dim.axis) {
    const l = dim.axis.scale.r2l(pos);
    // The box extends in screen direction (right / down) from its anchor side.
    const sgn = Math.sign(axisAffine(dim.axis).m) || 1;
    return { ...base, lo: l + off * size * sgn, hi: l + (off + 1) * size * sgn };
  }
  const p = dim.toClass(pos);
  const w = Math.abs(dim.toClass(size) - dim.toClass(0));
  return { ...base, lo: p + off * w, hi: p + (off + 1) * w };
}

/** Where an image sits in Plotly's layer stack. */
export function imageStack(
  im: Pick<FullLayoutImage, 'layer'>,
  x: ImageSpan,
  y: ImageSpan,
): LayerStack {
  if (im.layer === 'above') return 'upper';
  return x.paper || y.paper ? 'lower' : 'below';
}

class ImagesView implements ComponentView {
  #ctx: ComponentDrawContext;
  readonly #layers: LayerHost;
  readonly #prims = new Map<string, ImagePrimitive>();

  constructor(ctx: ComponentDrawContext) {
    this.#ctx = ctx;
    this.#layers = new LayerHost(ctx, 'images');
    this.#draw();
  }

  update(ctx: ComponentDrawContext, plan: ComponentUpdatePlan): void {
    this.#ctx = ctx;
    const s = plan.stages;
    if (!plan.layout && !s.has('plot') && !s.has('style') && !s.has('calc')) return;
    this.#draw();
  }

  #draw(): void {
    const ctx = this.#ctx;
    const env: ShapeEnv = { plotArea: ctx.plotArea, axes: ctx.axes };
    const used = new Set<string>();
    this.#layers.begin(ctx);
    for (const im of imagesOf(ctx.fullLayout)) {
      if (!im.visible || typeof im.source !== 'string') continue;
      const x = imageSpan(im.xref, im.x, im.sizex, im.xanchor, 'x', env);
      const y = imageSpan(im.yref, im.y, im.sizey, im.yanchor, 'y', env);
      if (!x || !y || ![x.lo, x.hi, y.lo, y.hi].every(Number.isFinite)) continue;
      const placements = this.#layers.place({
        stack: imageStack(im, x, y),
        clipX: x.axis,
        clipY: y.axis,
        subplot: subplotOf(ctx.subplots, x.owner, y.owner),
      });
      const data = {
        source: im.source,
        x0: x.lo,
        x1: x.hi,
        y0: y.lo,
        y1: y.hi,
        fit: FIT[im.sizing],
        alignX: anchorFraction(im.xanchor),
        alignY: anchorFraction(im.yanchor),
        opacity: im.opacity,
      };
      for (const p of placements) {
        const key = `${im._index}|${p.key}`;
        used.add(key);
        let prim = this.#prims.get(key);
        if (!prim) {
          prim = createImagePrimitive(ctx.primitives, data);
          ctx.add(prim, p.viewport);
          this.#prims.set(key, prim);
        } else prim.update(data);
        // Later images draw over earlier ones in the same layer.
        prim.object.renderOrder = p.order + Math.max(0, im._index) * 1e-3;
        prim.setTransform(classTransform(x.axis, y.axis, p.world));
      }
    }
    for (const [key, prim] of this.#prims) {
      if (used.has(key)) continue;
      ctx.remove(prim);
      this.#prims.delete(key);
    }
    this.#layers.end();
  }

  dispose(): void {
    for (const prim of this.#prims.values()) this.#ctx.remove(prim);
    this.#prims.clear();
    this.#layers.dispose();
  }
}

/** The layout images component (`layout.images`, E5.6). */
export const imagesComponent: ComponentModule = {
  name: 'images',
  order: 34,
  layoutSchema: { images: imagesAttributes },
  supplyLayoutDefaults(_layoutIn, layoutOut) {
    supplyImageDefaults(layoutOut);
  },
  draw: {
    create: (ctx) => new ImagesView(ctx),
  },
};
