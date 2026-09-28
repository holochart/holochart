/** `icicle` supply-defaults (plan E13.4), following plotly.js' `traces/icicle/defaults.js`. */
import type {
  FullLayout,
  FullTrace,
  LayoutDefaultsContext,
  TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { supplyHierarchyDefaults, supplyHierarchyLayoutDefaults } from '../hierarchy/defaults.ts';
import { supplyPathbarDefaults } from '../treemap/defaults.ts';

/** Supply icicle defaults: the hierarchy's (rows, levels, colors, labels), `tiling`, the path bar. */
export function supplyIcicleDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (!supplyHierarchyDefaults(traceIn, traceOut, ctx)) return;
  ctx.coerce('tiling.orientation');
  ctx.coerce('tiling.flip');
  ctx.coerce('tiling.pad');
  supplyPathbarDefaults(traceIn, traceOut, ctx);
}

/** Layout defaults for icicles: `iciclecolorway` defaults to `colorway`. */
export function supplyIcicleLayoutDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  supplyHierarchyLayoutDefaults('icicle', layoutIn, layoutOut, ctx);
}
