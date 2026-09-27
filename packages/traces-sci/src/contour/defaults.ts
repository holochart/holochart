/**
 * `contour` supply-defaults (plan E11.2), following plotly.js `contour/defaults.js`: the grid of
 * `heatmap` (`heatmap/xyz_defaults.js`), hover options, `connectgaps` (true for 1D `z`), then
 * levels and their style, or a constraint (traces-stats `contour/defaults.ts`; the colorscale is
 * not automatic by default, unlike histogram2dcontour), and cell labels for `coloring: 'heatmap'`.
 */
import type { FullTrace, TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyCellTextDefaults, supplyContourDefaults } from '@mk7s/holochart-traces-stats';
import { isColumnZ, supplyGridDefaults } from '../heatmap/defaults.ts';

/** Supply `contour` defaults. */
export function supplyContourTraceDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (!supplyGridDefaults(traceOut, ctx)) {
    traceOut.visible = false;
    return;
  }
  ctx.coerce('xhoverformat');
  ctx.coerce('yhoverformat');
  ctx.coerce('text');
  ctx.coerce('hovertext');
  ctx.coerce('hoverongaps');
  ctx.coerce('connectgaps', isColumnZ(traceOut['z']));
  supplyContourDefaults(traceIn, traceOut, ctx, { autoColorscale: false });
  const contours = traceOut['contours'] as { coloring?: unknown; type?: unknown } | undefined;
  if (contours?.type !== 'constraint' && contours?.coloring === 'heatmap') {
    supplyCellTextDefaults(ctx);
  }
  ctx.coerce('zhoverformat');
  ctx.coerce('zorder');
}
