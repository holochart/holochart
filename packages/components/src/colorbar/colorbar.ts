/**
 * The colorbar component (plan E5.3): asks every visible trace's module for its `colorbar` spec
 * (`TraceModule.colorbar`), draws one bar per color axis and one per trace with its own
 * `showscale`, and pushes the margins so paper-anchored bars fit beside the plot.
 *
 * All bars share one rect batch (backgrounds, gradients, outlines, tick marks) and one text batch
 * (labels and titles) in the overlay, so the draw-call count does not grow with the bar count, and
 * an unchanged redraw (zoom, pan) uploads nothing.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type {
  ComponentDrawContext,
  ComponentLayoutContext,
  ComponentModule,
  ComponentPointerEvent,
  ComponentUpdatePlan,
  ComponentView,
  MarginPush,
  TraceModule,
} from '@mk7s/holochart-runtime';
import type { LabelItem, RectItem } from '../axes/geometry.ts';
import { RectBatch, TextBatch } from '../shared/batches.ts';
import { overlayTransform } from '../shared/host.ts';
import { handleLinkPointer, oracleMeasure, type MeasureLine } from '../shared/text.ts';
import type { RGBA } from '@mk7s/holochart-render';
import {
  colorbarEntries,
  colorbarMarginPush,
  layoutColorbar,
  type ColorbarScene,
  type ModuleOf,
} from './layout.ts';

/** Draw order in the overlay: above axes and titles, below the legend. */
const ORDER = { rects: 6, text: 7 } as const;

function moduleFromTrace(trace: FullTrace): Pick<TraceModule, 'colorbar'> | undefined {
  return trace._module as Pick<TraceModule, 'colorbar'> | undefined;
}

/** Module lookup: the registry's module (via the draw context) else the trace's own `_module`. */
function moduleLookup(
  ctx: Pick<ComponentDrawContext, 'traceModule'> | ComponentLayoutContext,
): ModuleOf {
  return (trace) => ctx.traceModule?.(trace.type) ?? moduleFromTrace(trace);
}

/** Every colorbar of a figure, container px (pure given `measure`). */
export function buildColorbarScenes(
  ctx: Pick<
    ComponentDrawContext,
    'fullLayout' | 'fullData' | 'width' | 'height' | 'plotArea' | 'traceModule'
  >,
  measure: MeasureLine,
): ColorbarScene[] {
  const entries = colorbarEntries(ctx.fullData, ctx.fullLayout, moduleLookup(ctx));
  const env = {
    fullLayout: ctx.fullLayout,
    size: { width: ctx.width, height: ctx.height },
    plotArea: ctx.plotArea,
    measure,
  };
  return entries.map((e) => layoutColorbar(e.spec, env));
}

class ColorbarView implements ComponentView {
  readonly #rects: RectBatch;
  readonly #text: TextBatch;

  constructor(ctx: ComponentDrawContext) {
    this.#rects = new RectBatch(ctx, ctx.primitives, ctx.overlay, ORDER.rects);
    this.#text = new TextBatch(ctx, ctx.primitives, ctx.overlay, ORDER.text);
    this.#draw(ctx);
  }

  update(ctx: ComponentDrawContext, plan: ComponentUpdatePlan): void {
    const s = plan.stages;
    const relevant =
      plan.layout ||
      s.has('colorbars') ||
      s.has('style') ||
      s.has('plot') ||
      s.has('calc') ||
      s.has('ticks');
    if (relevant) this.#draw(ctx);
  }

  #draw(ctx: ComponentDrawContext): void {
    const scenes = buildColorbarScenes(ctx, oracleMeasure);
    const rects: RectItem[] = [];
    const borders: { color: RGBA; width: number }[] = [];
    const labels: LabelItem[] = [];
    for (const s of scenes) {
      rects.push(...s.rects);
      borders.push(...s.borders);
      labels.push(...s.labels);
    }
    const t = overlayTransform(ctx.height);
    this.#rects.setTransform(t);
    this.#rects.set(rects, borders);
    this.#text.setTransform(t);
    this.#text.set(labels);
  }

  /** Links in colorbar titles and tick labels (E2.10). */
  handlePointer(event: ComponentPointerEvent): boolean {
    return handleLinkPointer(event, this.#text.linkAt(event.x, event.y));
  }
}

/** The colorbar component (`marker.colorbar`, `layout.coloraxisN.colorbar`; E5.3). */
export const colorbarComponent: ComponentModule = {
  name: 'colorbar',
  order: 15,
  pushMargin(ctx: ComponentLayoutContext) {
    const entries = colorbarEntries(ctx.fullData, ctx.fullLayout, moduleLookup(ctx));
    if (entries.length === 0) return undefined;
    const m = ctx.fullLayout.margin;
    const plotArea = {
      x: m.l,
      y: m.t,
      width: Math.max(1, ctx.width - m.l - m.r),
      height: Math.max(1, ctx.height - m.t - m.b),
    };
    const env = {
      fullLayout: ctx.fullLayout,
      size: { width: ctx.width, height: ctx.height },
      plotArea,
      measure: oracleMeasure,
    };
    const pushes: MarginPush[] = [];
    for (const e of entries) {
      const p = colorbarMarginPush(e.spec, env, m);
      if (p) pushes.push(p);
    }
    return pushes;
  },
  draw: {
    create: (ctx) => new ColorbarView(ctx),
  },
};
