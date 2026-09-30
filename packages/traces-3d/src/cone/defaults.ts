/**
 * `cone` supply-defaults (plan E14.5), following plotly.js `cone/defaults.js`: every one of `x`,
 * `y`, `z`, `u`, `v`, `w` must be a non-empty array (else the trace is hidden; lengths may differ,
 * calc uses the shortest); `sizeref` defaults to 1 with `sizemode: 'raw'`, else 0.5; the norm
 * colorscale is always on. Cones are left out of the legend unless asked, as in Plotly.
 */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyColorscaleDefaults } from '@mk7s/holochart-traces-basic';

/** Supply `cone` defaults. */
export function supplyConeDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  ctx.coerce('scene');
  for (const k of ['u', 'v', 'w', 'x', 'y', 'z']) {
    const v = ctx.coerce(k);
    if (!isArrayLike(v) || v.length === 0) {
      traceOut.visible = false;
      return;
    }
  }
  const sizemode = ctx.coerce<string>('sizemode');
  ctx.coerce('sizeref', sizemode === 'raw' ? 1 : 0.5);
  ctx.coerce('anchor');
  ctx.coerceContainer('lighting');
  ctx.coerceContainer('lightposition');
  supplyColorscaleDefaults(traceIn, ctx.coerce, '', { inTrace: true, showscale: true });
  ctx.coerce('text');
  for (const k of ['u', 'v', 'w', 'x', 'y', 'z']) ctx.coerce(`${k}hoverformat`);
  if (traceIn['showlegend'] !== true) traceOut['showlegend'] = false;
}
