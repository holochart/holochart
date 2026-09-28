/** `treemap` supply-defaults (plan E13.3), following plotly.js' `traces/treemap/defaults.js`. */
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

/** Bar text padding (Plotly's `TEXTPAD`), px. */
export const TEXTPAD = 3;

/**
 * `pathbar` (Plotly's treemap and icicle defaults): `visible` first, since the text defaults coerce
 * `pathbar.textfont` for visible path bars; the rest after them (the thickness follows the font).
 */
export function supplyPathbarDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const visible = ctx.coerce<boolean>('pathbar.visible');
  supplyHierarchyTextDefaults(traceIn, traceOut, ctx);
  ctx.coerce('textposition');
  if (!visible) return;
  const size = (traceOut['pathbar'] as { textfont?: { size?: unknown } }).textfont?.size;
  ctx.coerce('pathbar.thickness', (typeof size === 'number' ? size : 12) + 2 * TEXTPAD);
  ctx.coerce('pathbar.side');
  ctx.coerce('pathbar.edgeshape');
}

/**
 * Supply treemap defaults: the hierarchy's (rows, levels, colors, labels), `tiling`, the path bar,
 * `depthfade` (on unless `marker.colors` is set; not with a colorscale) and `marker.pad`, which
 * leaves room for headers: twice the label size on their side, half of it elsewhere.
 */
export function supplyTreemapDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (!supplyHierarchyDefaults(traceIn, traceOut, ctx, { leaf: false })) return;
  if (ctx.coerce('tiling.packing') === 'squarify') ctx.coerce('tiling.squarifyratio');
  ctx.coerce('tiling.flip');
  ctx.coerce('tiling.pad');
  supplyPathbarDefaults(traceIn, traceOut, ctx);
  const marker = traceOut['marker'] as { colors?: ArrayLike<unknown> };
  if (!traceOut['_hasColorscale']) ctx.coerce('marker.depthfade', !marker.colors?.length);
  const size = (traceOut['textfont'] as { size?: unknown } | undefined)?.size;
  const header = (typeof size === 'number' ? size : 12) * 2;
  const bottom = String(traceOut['textposition']).startsWith('bottom');
  ctx.coerce('marker.pad.t', bottom ? header / 4 : header);
  ctx.coerce('marker.pad.l', header / 4);
  ctx.coerce('marker.pad.r', header / 4);
  ctx.coerce('marker.pad.b', bottom ? header : header / 4);
  ctx.coerce('marker.cornerradius');
}

/** Layout defaults for treemaps: `treemapcolorway` defaults to `colorway`. */
export function supplyTreemapLayoutDefaults(
  _layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  supplyHierarchyLayoutDefaults('treemap', layoutOut, ctx);
}
