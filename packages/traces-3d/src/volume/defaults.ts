/**
 * `volume` supply-defaults (plan E14.7), following plotly.js `volume/defaults.js`: `isosurface`'s
 * (`supplyIsoDefaults`), then `opacityscale` (Plotly's `opacityscaleDefaults`: the named scales
 * expanded to stops, `'uniform'` and invalid scales dropped), and the `render` extension with its
 * `raymarch` options.
 */
import type { FullTrace, TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyIsoDefaults } from '../isosurface/defaults.ts';
import { opacityscaleStops } from '../surface/defaults.ts';

/** Supply `volume` defaults. */
export function supplyVolumeDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  supplyIsoDefaults(traceIn, traceOut, ctx);
  if (traceOut.visible === false) return;
  const scale = opacityscaleStops(traceIn['opacityscale'] ?? ctx.template?.['opacityscale']);
  if (scale) traceOut['opacityscale'] = scale;
  if (ctx.coerce<string>('render') === 'raymarch') {
    ctx.coerce('raymarch.step');
    ctx.coerce('raymarch.shading');
  }
}
