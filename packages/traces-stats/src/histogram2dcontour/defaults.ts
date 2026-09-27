/**
 * `histogram2dcontour` supply-defaults (plan E10.3), following plotly.js
 * `histogram2dcontour/defaults.js`: the samples of `histogram2d`, then the contour attributes shared
 * with `contour` (`../contour/defaults.ts`; constraint contours included, beyond Plotly).
 */
import type { FullTrace, TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyContourDefaults } from '../contour/defaults.ts';
import { supplyCellTextDefaults, supplySampleDefaults } from '../histogram2d/defaults.ts';

/** Supply `histogram2dcontour` defaults. */
export function supplyHistogram2dContourDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (!supplySampleDefaults(traceIn, traceOut, ctx)) return;
  supplyContourDefaults(traceIn, traceOut, ctx, { autoColorscale: true });
  ctx.coerce('zorder');
  const contours = traceOut['contours'] as { coloring?: unknown } | undefined;
  if (contours?.coloring === 'heatmap') supplyCellTextDefaults(ctx);
}
