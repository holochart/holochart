/**
 * Treemap and icicle cross-trace layout (plan E13.3, E13.4, E4.5), run by the runtime after every
 * layout pass (`TraceModule.crossTraceLayout`). Idempotent: it recomputes everything from the
 * calcs each time.
 *
 * 1. Colors (Plotly's `crossTraceCalc`): one id → color map for all traces of the type, see
 *    `../hierarchy/colors.ts`.
 * 2. Placement: each trace fills its domain (the path bar goes outside it).
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import type {
  DomainLayoutContext,
  DomainTraceEntry,
  TracePlotContext,
} from '@mk7s/holochart-runtime';
import { resolveHierarchyColors } from '../hierarchy/colors.ts';
import type { RectCalc, RectLayout } from './geometry.ts';

/** A treemap or icicle's placement: its domain rect in a figure `figureHeight` px tall. */
export function placeRects(rect: Readonly<ViewportRect>, figureHeight: number): RectLayout {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, figureHeight };
}

/** Resolve the node colors of every trace of `type` of a figure (trace order). */
export function resolveRectColors(
  entries: readonly { readonly trace: FullTrace; readonly calc: RectCalc }[],
  fullLayout: FullLayout,
  type: string,
): void {
  resolveHierarchyColors(
    entries.map((e) => ({
      trace: e.trace,
      hierarchy: e.calc.hierarchy,
      colorscale: e.calc.colorscale,
      explicit: e.calc.explicit,
    })),
    fullLayout,
    type,
  );
}

/**
 * The `crossTraceLayout` of `type` (see the module comment); each type needs its own function,
 * since the runtime groups traces by it.
 */
export function rectCrossTraceLayout(type: string) {
  return (entries: readonly DomainTraceEntry<RectCalc>[], ctx: DomainLayoutContext): void => {
    resolveRectColors(entries, ctx.fullLayout, type);
    for (const e of entries) e.calc.layout = placeRects(e.domain.rect, ctx.height);
  };
}

/**
 * Lay a trace out on its own when the runtime has not run `crossTraceLayout` for it (it always
 * does before `plot`; this keeps hand-built contexts working): colors from this trace only.
 */
export function ensureRectLayout(ctx: TracePlotContext<RectCalc>): void {
  const { calc, trace } = ctx;
  const rect = ctx.domain?.rect;
  if (calc.layout || !rect) return;
  resolveRectColors([{ trace, calc }], ctx.fullLayout, trace.type);
  const size = ctx.viewport.size as { height: number } | undefined;
  calc.layout = placeRects(rect, size?.height ?? rect.y + rect.height);
}
