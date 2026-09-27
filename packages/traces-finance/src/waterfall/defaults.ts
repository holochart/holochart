/** `waterfall` supply-defaults (plan E12.4), following plotly.js' `waterfall/defaults.js`. */
import type {
  FullLayout,
  FullTrace,
  LayoutDefaultsContext,
  TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { supplyAlignmentGroups, supplyCoordinates, supplyTextDefaults } from '../bars/defaults.ts';
import { WATERFALL_COLORS } from './attributes.ts';

/**
 * Supply waterfall defaults: coordinates (hidden without data), `measure`, `orientation` (`'h'`
 * when only `x` is given), `base`, the bar extent and groups, labels (`textinfo` only without a
 * `texttemplate`), each direction's style and the connector.
 */
export function supplyWaterfallDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (supplyCoordinates(traceOut, ctx) === 0) {
    traceOut.visible = false;
    return;
  }
  ctx.coerce('measure');
  const onlyX = traceOut['x'] !== undefined && traceOut['y'] === undefined;
  ctx.coerce('orientation', onlyX ? 'h' : 'v');
  ctx.coerce('base');
  ctx.coerce('offset');
  ctx.coerce('width');
  ctx.coerce('offsetgroup');
  ctx.coerce('alignmentgroup');
  ctx.coerce('text');
  if (supplyTextDefaults(traceIn, traceOut, ctx) !== 'none') {
    const template = ctx.coerce('texttemplate');
    if (!template) ctx.coerce('textinfo');
  }
  for (const d of ['increasing', 'decreasing', 'totals'] as const) {
    ctx.coerce(`${d}.marker.color`, WATERFALL_COLORS[d]);
    ctx.coerce(`${d}.marker.line.color`);
    ctx.coerce(`${d}.marker.line.width`);
  }
  if (ctx.coerce('connector.visible')) {
    ctx.coerce('connector.mode');
    if (ctx.coerce('connector.line.width')) {
      ctx.coerce('connector.line.color');
      ctx.coerce('connector.line.dash');
    }
  }
  ctx.coerce('zorder');
}

/** Layout defaults: the offset groups of each alignment group (grouped bars across subplots). */
export function supplyWaterfallLayoutDefaults(
  _layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  supplyAlignmentGroups('waterfall', layoutOut, ctx);
}
