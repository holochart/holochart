/**
 * `barpolar` supply-defaults (plan E11.5), following plotly.js `barpolar/defaults.js`: `r` /
 * `theta`, `base`, `offset`, `width`, the hover text, then bar's marker and selection defaults
 * (run through a context restricted to the barpolar schema).
 */
import type { FullTrace, TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyBarStyleDefaults } from '@mk7s/holochart-traces-basic';
import { restrictedContext, supplyRThetaDefaults } from '../polar/defaults.ts';
import { barpolarAttributes } from './attributes.ts';

export function supplyBarpolarDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (supplyRThetaDefaults(traceOut, ctx) === 0) return;
  ctx.coerce('base');
  ctx.coerce('offset');
  ctx.coerce('width');
  ctx.coerce('text');
  supplyBarStyleDefaults(
    traceIn,
    traceOut,
    restrictedContext(ctx, barpolarAttributes, {
      'error_x.visible': false,
      'error_y.visible': false,
    }),
  );
}
