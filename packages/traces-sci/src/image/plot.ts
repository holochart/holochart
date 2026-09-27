/**
 * `image` renderer (plan E11.3, E22.1): the pixels as one {@link RasterPrimitive} — an RGBA8
 * texture on a quad from the first pixel's edge to the last one's, row 0 at `y0` (so the default
 * reversed y axis shows it at the top), nearest texels or bilinear with `zsmooth: 'fast'`. A
 * `source` is decoded asynchronously (`chart.ready` waits for it; decoded pictures are cached).
 * Zoom and pan only set the transform; `zsmooth` and opacity restyle in place.
 */
import {
  createRasterPrimitive,
  type RasterPixels,
  type RasterPrimitive,
} from '@mk7s/holochart-render';
import type {
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { traceRenderOrder } from '@mk7s/holochart-traces-basic';
import type { ImageCalc } from './calc.ts';
import { decodedPixels, decodeImageSource } from './source.ts';

function numberOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** Transparent pixels of a size (a source's placeholder until it is decoded). */
function blank(w: number, h: number): RasterPixels {
  return { data: new Uint8Array(w * h * 4), width: w, height: h };
}

class ImageView implements TraceView<ImageCalc> {
  #raster: RasterPrimitive | undefined;

  constructor(ctx: TracePlotContext<ImageCalc>) {
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<ImageCalc>, plan: TraceUpdatePlan): void {
    if (!this.#raster || plan.calc || plan.plot) {
      this.#sync(ctx);
      return;
    }
    if (plan.style) {
      this.#raster.update({
        smoothing: ctx.trace['zsmooth'] === 'fast',
        opacity: numberOr(ctx.trace['opacity'], 1),
      });
    }
    if (plan.transform) this.#raster.setTransform(ctx.transform);
  }

  #sync(ctx: TracePlotContext<ImageCalc>): void {
    const { calc, trace } = ctx;
    if (calc.w === 0 || calc.h === 0) {
      if (this.#raster) ctx.remove(this.#raster);
      this.#raster = undefined;
      return;
    }
    const source = calc.source;
    const pixels =
      calc.pixels ?? (source ? decodedPixels(source) : undefined) ?? blank(calc.w, calc.h);
    const data = {
      pixels,
      x0: calc.xEdges[0],
      x1: calc.xEdges[1],
      y0: calc.yEdges[0],
      y1: calc.yEdges[1],
      smoothing: trace['zsmooth'] === 'fast',
      opacity: numberOr(trace['opacity'], 1),
    };
    if (!this.#raster) {
      this.#raster = createRasterPrimitive(ctx.primitives, data);
      ctx.add(this.#raster);
    } else this.#raster.update(data);
    // The primitive redraws when the pixels arrive.
    if (source && !decodedPixels(source)) this.#raster.load(decodeImageSource(source));
    this.#raster.object.renderOrder = traceRenderOrder(trace, ctx.index);
    this.#raster.setTransform(ctx.transform);
  }
}

/** The image `plot` part: one {@link ImageView} per visible trace. */
export const imageRenderer: TraceRenderer<ImageCalc> = {
  create: (ctx) => new ImageView(ctx),
};
