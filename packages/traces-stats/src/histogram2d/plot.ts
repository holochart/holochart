/**
 * `histogram2d` renderer (plan E10.2, E22.1): the cells as one {@link HeatmapPrimitive} (a single
 * textured quad with the colorscale LUT) and, with `texttemplate`, one batched
 * {@link TextPrimitive} of cell labels. Style edits (colorscale, domain, smoothing, gaps, opacity)
 * set uniforms or swap the LUT; zoom and pan set the transform only, except that automatically
 * sized labels are resized when the cells' size in px changes.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import {
  createHeatmapPrimitive,
  createTextPrimitive,
  type HeatmapData,
  type HeatmapPrimitive,
  type HeatmapSmoothing,
  type TextFont,
  type TextFontStyle,
  type TextFontWeight,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type {
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import type { Histogram2dCalc } from './calc.ts';
import { zColorMapping } from './colorscale.ts';
import { autoCellFontSize, cellLabels, cellTexts, type CellText } from './text.ts';

/**
 * three.js `renderOrder` of heatmap-like traces, as traces-basic orders every trace (plan E2.14):
 * `zorder`, then Plotly's layer of the type (heatmaps and contours under bars and scatter), then
 * trace order. Ranks and steps match `traces-basic/src/shared/render-order.ts`.
 */
export function heatmapRenderOrder(trace: FullTrace, index: number): number {
  const rank = trace.type === 'histogram2dcontour' ? 3 : 1;
  const z = typeof trace['zorder'] === 'number' ? trace['zorder'] : 0;
  return z * 1e6 + rank * 1e4 + index;
}

/** Draw order of labels within the trace: over the cells. */
const TEXT_LAYER = 0.5;

/** `zsmooth` → the primitive's smoothing. */
export function smoothingOf(trace: FullTrace): HeatmapSmoothing {
  const s = trace['zsmooth'];
  return s === 'fast' || s === 'best' ? s : false;
}

function numberOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** The heatmap primitive's data for a calc and trace. */
export function heatmapData(ctx: TracePlotContext<Histogram2dCalc>): HeatmapData {
  const { calc, trace } = ctx;
  const mapping = zColorMapping(trace, ctx.fullLayout, calc.zExtent);
  const smoothing = smoothingOf(trace);
  return {
    z: calc.z,
    nx: calc.nx,
    ny: calc.ny,
    xEdges: calc.x.edges,
    yEdges: calc.y.edges,
    // The mapping's stops already have the interpolation space baked in.
    colorscale: mapping.colorscale,
    interpolation: 'rgb',
    zmin: mapping.zmin,
    zmax: mapping.zmax,
    reversescale: mapping.reversescale,
    smoothing,
    xgap: smoothing ? 0 : numberOr(trace['xgap'], 0),
    ygap: smoothing ? 0 : numberOr(trace['ygap'], 0),
    opacity: numberOr(trace['opacity'], 1),
  };
}

/** The label font of a trace for a size. */
function labelFont(
  trace: FullTrace,
  ctx: TracePlotContext<Histogram2dCalc>,
  size: number,
): TextFont {
  const font = (trace['textfont'] ?? {}) as Record<string, unknown>;
  const layoutFont = ctx.fullLayout.font;
  return {
    family: typeof font['family'] === 'string' ? font['family'] : layoutFont.family,
    size,
    weight: (font['weight'] ?? layoutFont.weight ?? 'normal') as TextFontWeight,
    style: (font['style'] ?? layoutFont.style ?? 'normal') as TextFontStyle,
  };
}

class Histogram2dView implements TraceView<Histogram2dCalc> {
  #heatmap: HeatmapPrimitive | undefined;
  #text: TextPrimitive | undefined;
  #texts: CellText[] = [];
  #fontSize = -1;

  constructor(ctx: TracePlotContext<Histogram2dCalc>) {
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<Histogram2dCalc>, plan: TraceUpdatePlan): void {
    if (!this.#heatmap || plan.calc || plan.plot) {
      this.#sync(ctx);
      return;
    }
    if (plan.style) {
      const data = heatmapData(ctx);
      this.#heatmap.update({
        colorscale: data.colorscale,
        zmin: data.zmin,
        zmax: data.zmax,
        reversescale: data.reversescale,
        smoothing: data.smoothing,
        xgap: data.xgap,
        ygap: data.ygap,
        opacity: data.opacity,
      });
      this.#syncText(ctx, true);
    }
    if (plan.transform) {
      this.#heatmap.setTransform(ctx.transform);
      if (!plan.style) this.#syncText(ctx, false);
    }
  }

  #sync(ctx: TracePlotContext<Histogram2dCalc>): void {
    const { calc } = ctx;
    if (calc.nx === 0 || calc.ny === 0) {
      if (this.#heatmap) ctx.remove(this.#heatmap);
      this.#heatmap = undefined;
      this.#removeText(ctx);
      return;
    }
    const data = heatmapData(ctx);
    if (!this.#heatmap) {
      this.#heatmap = createHeatmapPrimitive(ctx.primitives, data);
      ctx.add(this.#heatmap);
    } else this.#heatmap.update(data);
    this.#heatmap.object.renderOrder = heatmapRenderOrder(ctx.trace, ctx.index);
    this.#heatmap.setTransform(ctx.transform);
    this.#syncText(ctx, true);
  }

  #removeText(ctx: TracePlotContext<Histogram2dCalc>): void {
    if (this.#text) ctx.remove(this.#text);
    this.#text = undefined;
    this.#texts = [];
    this.#fontSize = -1;
  }

  /** Rebuild (`rebuild`) or resize the cell labels. */
  #syncText(ctx: TracePlotContext<Histogram2dCalc>, rebuild: boolean): void {
    const { trace, calc } = ctx;
    if (typeof trace['texttemplate'] !== 'string' || trace['texttemplate'] === '') {
      this.#removeText(ctx);
      return;
    }
    if (rebuild) {
      const mapping = zColorMapping(trace, ctx.fullLayout, calc.zExtent);
      this.#texts = cellTexts(calc, trace, mapping, ctx, ctx.fullLayout);
    }
    const sizeIn = (trace['textfont'] as { size?: unknown } | undefined)?.size;
    const smoothing = smoothingOf(trace);
    const size =
      typeof sizeIn === 'number'
        ? sizeIn
        : autoCellFontSize(
            calc,
            this.#texts,
            ctx.transform,
            {
              xgap: smoothing ? 0 : numberOr(trace['xgap'], 0),
              ygap: smoothing ? 0 : numberOr(trace['ygap'], 0),
            },
            ctx.fullLayout.font.size,
          );
    if (size <= 0 || this.#texts.length === 0) {
      if (this.#text) this.#text.update({ labels: [] });
      this.#fontSize = size;
      return;
    }
    if (rebuild || size !== this.#fontSize || !this.#text) {
      const labels = cellLabels(this.#texts, labelFont(trace, ctx, size));
      if (!this.#text) {
        this.#text = createTextPrimitive(ctx.primitives, { labels });
        ctx.add(this.#text);
      } else this.#text.update({ labels });
      this.#fontSize = size;
    }
    this.#text.object.renderOrder = heatmapRenderOrder(trace, ctx.index) + TEXT_LAYER;
    this.#text.setTransform(ctx.transform);
  }
}

/** The histogram2d `plot` part: one {@link Histogram2dView} per visible trace. */
export const histogram2dRenderer: TraceRenderer<Histogram2dCalc> = {
  create: (ctx) => new Histogram2dView(ctx),
};
