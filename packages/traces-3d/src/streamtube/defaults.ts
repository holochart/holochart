/**
 * `streamtube` supply-defaults (plan E14.6), following plotly.js `streamtube/defaults.js`: every
 * one of `x`, `y`, `z`, `u`, `v`, `w` must be a non-empty array (else the trace is hidden; lengths
 * may differ, calc uses the shortest); then the starts, `maxdisplayed`, `sizeref`, lighting, the
 * norm colorscale (always on), `text` and the hover formats. Stream tubes are left out of the
 * legend unless asked, as in Plotly.
 */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyColorscaleDefaults } from '@mk7s/holochart-traces-basic';
import { supplySceneLightingDefaults } from '../scene/lighting-attributes.ts';

/** Supply `streamtube` defaults. */
export function supplyStreamtubeDefaults(
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
  ctx.coerce('starts.x');
  ctx.coerce('starts.y');
  ctx.coerce('starts.z');
  ctx.coerce('maxdisplayed');
  ctx.coerce('sizeref');
  supplySceneLightingDefaults(ctx);
  supplyColorscaleDefaults(traceIn, ctx.coerce, '', { inTrace: true, showscale: true });
  ctx.coerce('text');
  for (const k of ['u', 'v', 'w', 'x', 'y', 'z']) ctx.coerce(`${k}hoverformat`);
  if (traceIn['showlegend'] !== true) traceOut['showlegend'] = false;
}
