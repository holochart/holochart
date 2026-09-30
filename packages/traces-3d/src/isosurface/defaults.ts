/**
 * `isosurface` supply-defaults (plan E14.8), following plotly.js `isosurface/defaults.js`
 * (`supplyIsoDefaults`, which `volume` shares): `isomin` above `isomax` drops both; `x`, `y`, `z`
 * and `value` must be non-empty arrays (else the trace is hidden); the options of `caps`, `slices`,
 * `spaceframe` and `surface` only when shown; the value colorscale; mesh traces are left out of
 * the legend unless asked.
 */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyColorscaleDefaults } from '@mk7s/holochart-traces-basic';
import { supplySceneLightingDefaults } from '../scene/lighting-attributes.ts';

const given = (v: unknown): v is number => typeof v === 'number';

/** Supply the defaults `isosurface` and `volume` share (Plotly's `supplyIsoDefaults`). */
export function supplyIsoDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  ctx.coerce('scene');
  const isomin = ctx.coerce<number | undefined>('isomin');
  const isomax = ctx.coerce<number | undefined>('isomax');
  if (given(isomin) && given(isomax) && isomin > isomax) {
    delete traceOut['isomin'];
    delete traceOut['isomax'];
  }
  for (const k of ['x', 'y', 'z', 'value']) {
    const v = ctx.coerce(k);
    if (!isArrayLike(v) || v.length === 0) {
      traceOut.visible = false;
      return;
    }
  }
  ctx.coerce('valuehoverformat');
  for (const d of ['x', 'y', 'z']) {
    ctx.coerce(`${d}hoverformat`);
    if (ctx.coerce<boolean>(`caps.${d}.show`)) ctx.coerce(`caps.${d}.fill`);
    if (ctx.coerce<boolean>(`slices.${d}.show`)) {
      ctx.coerce(`slices.${d}.fill`);
      ctx.coerce(`slices.${d}.locations`);
    }
  }
  if (ctx.coerce<boolean>('spaceframe.show')) ctx.coerce('spaceframe.fill');
  if (ctx.coerce<boolean>('surface.show')) {
    ctx.coerce('surface.count');
    ctx.coerce('surface.fill');
    ctx.coerce('surface.pattern');
  }
  ctx.coerce('text');
  supplySceneLightingDefaults(ctx);
  ctx.coerce('flatshading');
  supplyColorscaleDefaults(traceIn, ctx.coerce, '', { inTrace: true, showscale: true });
  // Shown in the legend only on request (Plotly's `showlegend` default for these traces).
  if (traceIn['showlegend'] !== true) traceOut['showlegend'] = false;
}
