/**
 * `heatmap` renderer (plan E11.1, E22.1): the grid as one {@link HeatmapPrimitive} — the values in
 * a single float texture, colored through the shared colorscale LUT in the fragment shader, uneven
 * cells found by a binary search of an edge texture, gaps (`xgap` / `ygap`) and smoothing
 * (`zsmooth`) in the same shader — and, with `texttemplate`, one batched {@link TextPrimitive} of
 * cell labels. The primitive is the one histogram2d draws with.
 *
 * Restyling the colorscale swaps the LUT, and `zmin` / `zmax` / `zmid`, `reversescale`, gaps,
 * smoothing and opacity only set uniforms; zoom and pan set the transform (automatically sized
 * labels are resized when the cells' size in px changes). Only new data uploads the texture.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import {
  createHeatmapPrimitive,
  createTextPrimitive,
  type HeatmapData,
  type HeatmapPrimitive,
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
import { traceRenderOrder } from '@mk7s/holochart-traces-basic';
import {
  autoCellFontSize,
  cellLabels,
  zColorMapping,
  type CellText,
} from '@mk7s/holochart-traces-stats';
import { heatmapSmoothing, type HeatmapCalc } from './calc.ts';
import { heatmapCellTexts } from './text.ts';

/** Draw order of labels within the trace: over the cells. */
const TEXT_LAYER = 0.5;

function numberOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** The gaps in effect: `xgap` / `ygap` without smoothing, else none. */
function gapsOf(ctx: TracePlotContext<HeatmapCalc>): { xgap: number; ygap: number } {
  const smooth = heatmapSmoothing(ctx.trace, ctx.calc) !== false;
  return {
    xgap: smooth ? 0 : numberOr(ctx.trace['xgap'], 0),
    ygap: smooth ? 0 : numberOr(ctx.trace['ygap'], 0),
  };
}

/** The heatmap primitive's data for a calc and trace. */
export function heatmapPrimitiveData(ctx: TracePlotContext<HeatmapCalc>): HeatmapData {
  const { calc, trace } = ctx;
  const mapping = zColorMapping(trace, ctx.fullLayout, calc.zExtent);
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
    smoothing: heatmapSmoothing(trace, calc),
    ...gapsOf(ctx),
    opacity: numberOr(trace['opacity'], 1),
    // Saves the primitive a pass over large grids.
    ...(Number.isFinite(calc.zExtent[0]) ? { zRange: calc.zExtent } : {}),
  };
}

/** The label font of a trace for a size. */
function labelFont(trace: FullTrace, ctx: TracePlotContext<HeatmapCalc>, size: number): TextFont {
  const font = (trace['textfont'] ?? {}) as Record<string, unknown>;
  const layoutFont = ctx.fullLayout.font;
  return {
    family: typeof font['family'] === 'string' ? font['family'] : layoutFont.family,
    size,
    weight: (font['weight'] ?? layoutFont.weight ?? 'normal') as TextFontWeight,
    style: (font['style'] ?? layoutFont.style ?? 'normal') as TextFontStyle,
  };
}

class HeatmapView implements TraceView<HeatmapCalc> {
  #heatmap: HeatmapPrimitive | undefined;
  #text: TextPrimitive | undefined;
  #texts: CellText[] = [];
  #fontSize = -1;

  constructor(ctx: TracePlotContext<HeatmapCalc>) {
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<HeatmapCalc>, plan: TraceUpdatePlan): void {
    if (!this.#heatmap || plan.calc || plan.plot) {
      this.#sync(ctx);
      return;
    }
    if (plan.style) {
      const data = heatmapPrimitiveData(ctx);
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

  #sync(ctx: TracePlotContext<HeatmapCalc>): void {
    const { calc } = ctx;
    if (calc.nx === 0 || calc.ny === 0) {
      if (this.#heatmap) ctx.remove(this.#heatmap);
      this.#heatmap = undefined;
      this.#removeText(ctx);
      return;
    }
    const data = heatmapPrimitiveData(ctx);
    if (!this.#heatmap) {
      this.#heatmap = createHeatmapPrimitive(ctx.primitives, data);
      ctx.add(this.#heatmap);
    } else this.#heatmap.update(data);
    this.#heatmap.object.renderOrder = traceRenderOrder(ctx.trace, ctx.index);
    this.#heatmap.setTransform(ctx.transform);
    this.#syncText(ctx, true);
  }

  #removeText(ctx: TracePlotContext<HeatmapCalc>): void {
    if (this.#text) ctx.remove(this.#text);
    this.#text = undefined;
    this.#texts = [];
    this.#fontSize = -1;
  }

  /** Rebuild (`rebuild`) or resize the cell labels. */
  #syncText(ctx: TracePlotContext<HeatmapCalc>, rebuild: boolean): void {
    const { trace, calc } = ctx;
    if (typeof trace['texttemplate'] !== 'string' || trace['texttemplate'] === '') {
      this.#removeText(ctx);
      return;
    }
    if (rebuild) {
      const mapping = zColorMapping(trace, ctx.fullLayout, calc.zExtent);
      this.#texts = heatmapCellTexts(calc, trace, mapping, ctx, ctx.fullLayout);
    }
    const sizeIn = (trace['textfont'] as { size?: unknown } | undefined)?.size;
    const size =
      typeof sizeIn === 'number'
        ? sizeIn
        : autoCellFontSize(calc, this.#texts, ctx.transform, gapsOf(ctx), ctx.fullLayout.font.size);
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
    this.#text.object.renderOrder = traceRenderOrder(trace, ctx.index) + TEXT_LAYER;
    this.#text.setTransform(ctx.transform);
  }
}

/** The heatmap `plot` part: one {@link HeatmapView} per visible trace. */
export const heatmapRenderer: TraceRenderer<HeatmapCalc> = {
  create: (ctx) => new HeatmapView(ctx),
};
