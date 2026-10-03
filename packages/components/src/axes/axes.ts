/**
 * The cartesian axes component (plan E3.4, E4.2): axis lines, ticks, tick labels, grid, zero lines,
 * minor ticks and grid, mirrors, free axes, multicategory dividers and titles for every axis, plus
 * automargin pushes.
 *
 * ## Primitives (constant draw calls)
 *
 * - Overlay (above traces): one pixel-snapped rect batch for every axis line, tick and divider,
 *   and one batched text primitive for every tick label and title.
 * - Per subplot viewport (below traces, `renderOrder` far below any trace): one rect batch for the
 *   grid, minor grid and zero lines (plus the in-plot ticks and lines of `layer: 'below traces'`
 *   axes), and one line batch per dash pattern for dashed grids. Subplots on `overlaying` axes
 *   draw these in their main subplot's viewport, under the traces of both.
 *
 * All geometry is in container px; each batch maps it with a transform, so zoom/pan re-computes
 * ticks (tens of items) and re-uploads small buffers into the same primitives, and text labels that
 * only move are not re-typeset.
 *
 * Subplots drawn in perspective (the 2.5D view, E8.9: their viewport has a `projector`) draw their
 * axes and grid themselves, tilted with them (the `view3d` component): they are left out here.
 *
 * ## Automargin
 *
 * `pushMargin` measures each automargin axis with its current scale. The runtime iterates its
 * layout (pushes → margins → ranges → pushes, ≤ 3 passes, E4.2), so later passes measure labels
 * against the solved ranges; the view itself never triggers extra passes.
 */
import type { FullLayout } from '@mk7s/holochart-core';
import type {
  AxisInfo,
  ComponentDrawContext,
  ComponentLayoutContext,
  ComponentModule,
  ComponentPointerEvent,
  ComponentUpdatePlan,
  ComponentView,
  SubplotInfo,
} from '@mk7s/holochart-runtime';
import { overlayTransform, rectTransform } from '../shared/host.ts';
import { BELOW_TRACES_ORDER, DashBatch, RectBatch, TextBatch } from '../shared/batches.ts';
import { handleLinkPointer, oracleMeasure, type MeasureLine } from '../shared/text.ts';
import {
  axisGeometry,
  axisTicks,
  gridGeometry,
  type DashItem,
  type LabelItem,
  type RectItem,
} from './geometry.ts';
import { axisMarginNeeds, marginPushOf } from './margins.ts';
import { AxisShifts, axisPlacement, lineCrossings, mainAxisOf, mainSubplots } from './placement.ts';

/** Stages after which the axes redraw (anything that can move ticks, labels or colors). */
const REDRAW_STAGES = new Set(['calc', 'crossTraceCalc', 'layout', 'ticks', 'plot', 'style']);

interface SubplotBatches {
  viewport: SubplotInfo['viewport'];
  grid: RectBatch;
  dashes: Map<string, DashBatch>;
}

/** Everything the axes draw for the current layout, in container px. @internal */
export interface AxesScene {
  /** Lines, ticks and dividers drawn above traces. */
  over: RectItem[];
  labels: LabelItem[];
  /** Per subplot id: grid/zero/below-layer rects and dashed grid lines. */
  under: Map<string, { rects: RectItem[]; dashed: DashItem[] }>;
}

function inside(r: RectItem, rect: { x: number; y: number; width: number; height: number }) {
  return (
    Math.min(r.x0, r.x1) >= rect.x - 0.5 &&
    Math.max(r.x0, r.x1) <= rect.x + rect.width + 0.5 &&
    Math.min(r.y0, r.y1) >= rect.y - 0.5 &&
    Math.max(r.y0, r.y1) <= rect.y + rect.height + 0.5
  );
}

/**
 * Compute everything the axes draw (pure given `measure`): per axis its lines, ticks and labels;
 * per subplot the grid of both its axes, then zero lines, then in-plot items of `below traces`
 * axes. A subplot on an `overlaying` axis gets none: its items go to its main subplot's (see
 * {@link mainSubplots}), in axis order within each of the three groups.
 * @internal
 */
export function buildAxesScene(
  ctx: Pick<
    ComponentDrawContext,
    'axes' | 'subplots' | 'plotArea' | 'fullLayout' | 'width' | 'height'
  >,
  measure: MeasureLine,
): AxesScene {
  const pad = ctx.fullLayout.margin.pad;
  const over: RectItem[] = [];
  const labels: LabelItem[] = [];
  const grids = new Map<string, { rects: RectItem[]; zero: RectItem[]; below: RectItem[] }>();
  const dashed = new Map<string, DashItem[]>();
  for (const id of ctx.subplots.keys()) {
    grids.set(id, { rects: [], zero: [], below: [] });
    dashed.set(id, []);
  }
  const subplots = [...ctx.subplots.values()];
  // Subplots on `overlaying` axes draw what goes under traces with their main subplot's, under
  // every trace of the group (Plotly's shared `gridlayer` / `zerolinelayer` / `overlinesBelow`):
  // their own viewport is drawn after the main one and would cover its traces.
  const mains = mainSubplots(subplots);
  const slotOf = (id: string): string => mains.get(id) ?? id;
  // Main subplots first, so an axis' grid is measured against the main counter axis.
  const gridOrder = [
    ...subplots.filter((sp) => !mains.has(sp.id)),
    ...subplots.filter((sp) => mains.has(sp.id)),
  ];
  const placements = new Map<string, ReturnType<typeof axisPlacement>>();
  for (const axis of ctx.axes.values()) {
    placements.set(axis.id, axisPlacement(axis, ctx.axes, subplots, ctx.plotArea, pad));
  }

  const shifts = new AxisShifts(ctx.axes.values());
  for (const axis of ctx.axes.values()) {
    if (!axis.full.visible) continue;
    let placement = placements.get(axis.id);
    if (!placement) continue;
    // Free y axes with `shift` / `autoshift` move sideways (E3.9).
    const shift = shifts.begin(axis);
    if (shift !== 0) {
      placement = {
        ...placement,
        frame: { ...placement.frame, cross: placement.frame.cross + shift },
      };
      placements.set(axis.id, placement);
    }
    const ticks = axisTicks(axis);
    const geo = axisGeometry(axis, placement.frame, ticks, {
      measure,
      width: ctx.width,
      height: ctx.height,
      mirrors: placement.mirrors,
      lineOverhang: placement.overhang,
    });
    labels.push(...geo.labels);
    shifts.end(axis, geo.extent);

    // `layer: 'below traces'`: what lies inside the axis' own subplot goes under the traces
    // (outside the plot area nothing overlaps traces, so the rest stays in the overlay).
    const home =
      axis.full.layer === 'below traces' && placement.counter
        ? subplots.find((sp) =>
            axis.letter === 'x'
              ? sp.xaxis.id === axis.id && sp.yaxis.id === placement.counter?.id
              : sp.yaxis.id === axis.id && sp.xaxis.id === placement.counter?.id,
          )
        : undefined;
    for (const r of geo.rects) {
      if (home && inside(r, home.rect)) grids.get(slotOf(home.id))?.below.push(r);
      else over.push(r);
    }

    // One grid per main counter axis: overlaying subplots share their area (Plotly's
    // `finishedGrids` in `axes.drawOne`).
    const gridded = new Set<string>();
    for (const sp of gridOrder) {
      const mine = axis.letter === 'x' ? sp.xaxis : sp.yaxis;
      if (mine.id !== axis.id) continue;
      const counter = axis.letter === 'x' ? sp.yaxis : sp.xaxis;
      const key = mainAxisOf(counter);
      if (gridded.has(key)) continue;
      gridded.add(key);
      // Grid lines under an axis line of the counter axis would only thicken it: skip them.
      const cp = placements.get(counter.id);
      const edges =
        cp && counter.full.visible && counter.full.showline ? lineCrossings(cp, pad) : [];
      const g = gridGeometry(axis, ticks, counter.start, counter.end, edges);
      const slot = grids.get(slotOf(sp.id));
      slot?.rects.push(...g.rects);
      slot?.zero.push(...g.zero);
      dashed.get(slotOf(sp.id))?.push(...g.dashed);
    }
  }

  const under = new Map<string, { rects: RectItem[]; dashed: DashItem[] }>();
  for (const [id, g] of grids) {
    under.set(id, { rects: [...g.rects, ...g.zero, ...g.below], dashed: dashed.get(id) ?? [] });
  }
  return { over, labels, under };
}

/** Length a scale that has not been laid out yet is measured at (first automargin pass). */
function lengthHint(fullLayout: FullLayout, width: number, height: number) {
  return (axis: { letter: 'x' | 'y'; full: { domain: unknown } }): number => {
    const d = axis.full.domain as readonly number[];
    const span = Math.abs((d[1] ?? 1) - (d[0] ?? 0));
    const m = fullLayout.margin;
    return axis.letter === 'x' ? span * (width - m.l - m.r) : span * (height - m.t - m.b);
  };
}

class AxesView implements ComponentView {
  readonly #over: RectBatch;
  readonly #text: TextBatch;
  readonly #subplots = new Map<string, SubplotBatches>();

  constructor(ctx: ComponentDrawContext) {
    this.#over = new RectBatch(ctx, ctx.primitives, ctx.overlay);
    this.#text = new TextBatch(ctx, ctx.primitives, ctx.overlay);
    this.#draw(ctx);
  }

  update(ctx: ComponentDrawContext, plan: ComponentUpdatePlan): void {
    if (!plan.layout && ![...plan.stages].some((s) => REDRAW_STAGES.has(s))) return;
    this.#draw(ctx);
  }

  #draw(ctx: ComponentDrawContext): void {
    const axes = new Map(ctx.axes);
    for (const sp of ctx.subplots.values()) {
      if (sp.viewport.projector) for (const a of [sp.xaxis, sp.yaxis]) axes.delete(a.id);
    }
    const scene = buildAxesScene({ ...ctx, axes }, oracleMeasure);
    const overlay = overlayTransform(ctx.height);
    this.#over.setTransform(overlay);
    this.#over.set(scene.over);
    this.#text.setTransform(overlay);
    this.#text.set(scene.labels);

    for (const [id, batches] of this.#subplots) {
      const sp = ctx.subplots.get(id);
      if (sp && sp.viewport === batches.viewport) continue;
      // The subplot (and its viewport, with our primitives) is gone or was rebuilt.
      if (sp && !batches.viewport.disposed) {
        batches.grid.dispose();
        for (const d of batches.dashes.values()) d.dispose();
      }
      this.#subplots.delete(id);
    }
    for (const sp of ctx.subplots.values()) {
      const content = scene.under.get(sp.id) ?? { rects: [], dashed: [] };
      let batches = this.#subplots.get(sp.id);
      if (!batches) {
        batches = {
          viewport: sp.viewport,
          grid: new RectBatch(ctx, ctx.primitives, sp.viewport, BELOW_TRACES_ORDER),
          dashes: new Map(),
        };
        this.#subplots.set(sp.id, batches);
      }
      const t = rectTransform(sp.rect);
      batches.grid.setTransform(t);
      batches.grid.set(content.rects);
      const byDash = new Map<string, DashItem[]>();
      for (const d of content.dashed) {
        const list = byDash.get(d.dash);
        if (list) list.push(d);
        else byDash.set(d.dash, [d]);
      }
      for (const [dash, batch] of batches.dashes) {
        if (byDash.has(dash)) continue;
        batch.dispose();
        batches.dashes.delete(dash);
      }
      for (const [dash, items] of byDash) {
        let batch = batches.dashes.get(dash);
        if (!batch) {
          batch = new DashBatch(ctx, ctx.primitives, sp.viewport, BELOW_TRACES_ORDER + 1);
          batches.dashes.set(dash, batch);
        }
        batch.setTransform(t);
        batch.set(items, sp.viewport.size.pixelRatio);
      }
    }
  }

  /** Links in tick labels and axis titles (E2.10). */
  handlePointer(event: ComponentPointerEvent): boolean {
    return handleLinkPointer(event, this.#text.linkAt(event.x, event.y));
  }

  dispose(): void {
    // Primitives added through the context are removed and disposed by the runtime.
    this.#subplots.clear();
  }
}

/**
 * The axes component: register it (the full bundle does) to draw every cartesian axis.
 *
 * @example
 * ```ts
 * import { register } from '@mk7s/holochart-runtime';
 * import { axesComponent } from '@mk7s/holochart-components';
 * register(axesComponent);
 * ```
 */
export const axesComponent: ComponentModule = {
  name: 'axes',
  // Below other components: titles and legends may overlap axis labels.
  order: -10,
  pushMargin(ctx: ComponentLayoutContext) {
    const needs = axisMarginNeeds(
      ctx.axes as ReadonlyMap<string, AxisInfo>,
      ctx.fullLayout,
      ctx,
      oracleMeasure,
      lengthHint(ctx.fullLayout, ctx.width, ctx.height),
    );
    return marginPushOf(needs);
  },
  draw: {
    create: (ctx) => new AxesView(ctx),
  },
};
