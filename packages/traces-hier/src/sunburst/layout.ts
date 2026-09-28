/**
 * `sunburst` cross-trace layout (plan E13.2, E4.5), run by the runtime after every layout pass
 * (`TraceModule.crossTraceLayout`). Idempotent: it recomputes everything from the calcs each time.
 *
 * 1. Colors (Plotly's sunburst `crossTraceCalc`): one id → color map for all sunbursts, see
 *    `../hierarchy/colors.ts`.
 * 2. Placement (Plotly's `plot.js`): each sunburst centered in its domain, with a radius of half
 *    the domain's smaller side.
 */
import type { FullLayout } from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import type { DomainLayoutContext, DomainTraceEntry } from '@mk7s/holochart-runtime';
import { resolveHierarchyColors } from '../hierarchy/colors.ts';
import type { SunburstCalc, SunburstLayout } from './geometry.ts';

/** Center and radius of a sunburst in its domain rect (container px). */
export function placeSunburst(
  rect: Readonly<ViewportRect>,
  size: { readonly width: number; readonly height: number },
): SunburstLayout {
  return {
    cx: rect.x + rect.width / 2,
    cy: rect.y + rect.height / 2,
    r: Math.max(0, Math.min(rect.width, rect.height) / 2),
    width: size.width,
    height: size.height,
  };
}

/** Resolve the node colors of every sunburst of a figure (trace order). */
export function resolveSunburstColors(
  entries: readonly { readonly trace: DomainTraceEntry['trace']; readonly calc: SunburstCalc }[],
  fullLayout: FullLayout,
): void {
  resolveHierarchyColors(
    entries.map((e) => ({
      trace: e.trace,
      hierarchy: e.calc.hierarchy,
      colorscale: e.calc.colorscale,
      explicit: e.calc.explicit,
    })),
    fullLayout,
    'sunburst',
  );
}

/** The `crossTraceLayout` of `sunburst`: colors, then placement (see the module comment). */
export function crossTraceLayoutSunburst(
  entries: readonly DomainTraceEntry<SunburstCalc>[],
  ctx: DomainLayoutContext,
): void {
  resolveSunburstColors(entries, ctx.fullLayout);
  for (const e of entries) {
    e.calc.layout = placeSunburst(e.domain.rect, { width: ctx.width, height: ctx.height });
  }
}
