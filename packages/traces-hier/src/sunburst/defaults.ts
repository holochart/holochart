/** `sunburst` supply-defaults (plan E13.2), following plotly.js' `traces/sunburst/defaults.js`. */
import type {
  FullLayout,
  FullTrace,
  LayoutDefaultsContext,
  TraceDefaultsContext,
} from '@mk7s/holochart-core';
import {
  supplyHierarchyDefaults,
  supplyHierarchyLayoutDefaults,
  supplyHierarchyTextDefaults,
} from '../hierarchy/defaults.ts';

/**
 * Supply sunburst defaults: the hierarchy's (rows, levels, colors, labels), then
 * `insidetextorientation` and `rotation`. `domain` was coerced by core before this runs.
 */
export function supplySunburstDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (!supplyHierarchyDefaults(traceIn, traceOut, ctx)) return;
  supplyHierarchyTextDefaults(traceIn, traceOut, ctx);
  ctx.coerce('insidetextorientation');
  ctx.coerce('rotation');
}

/** Layout defaults for sunbursts: `sunburstcolorway` defaults to `colorway`. */
export function supplySunburstLayoutDefaults(
  _layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  supplyHierarchyLayoutDefaults('sunburst', layoutOut, ctx);
}
