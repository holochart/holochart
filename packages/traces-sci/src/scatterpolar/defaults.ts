/**
 * `scatterpolar` supply-defaults (plan E11.4), following plotly.js `scatterpolar/defaults.js`:
 * `r` / `theta`, then scatter's own mode, marker, line, text, fill and hover defaults (run through
 * a context restricted to the scatterpolar schema), then `cliponaxis`.
 */
import type { FullTrace, TraceDefaultsContext } from '@mk7s/holochart-core';
import { scatter } from '@mk7s/holochart-traces-basic';
import { restrictedContext, supplyRThetaDefaults } from '../polar/defaults.ts';
import { scatterpolarAttributes } from './attributes.ts';

function hasFlag(mode: unknown, flag: string): boolean {
  return typeof mode === 'string' && mode.split('+').includes(flag);
}

export function supplyScatterpolarDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const len = supplyRThetaDefaults(traceOut, ctx);
  if (len === 0) return;
  // Scatter reads the point count from `x` / `y`: give it arrays of the polar length.
  const points = new Array<undefined>(len);
  scatter.supplyDefaults(
    traceIn,
    traceOut,
    restrictedContext(ctx, scatterpolarAttributes, {
      x: points,
      y: points,
      'error_x.visible': false,
      'error_y.visible': false,
    }),
  );
  const mode = traceOut['mode'];
  if (hasFlag(mode, 'markers') || hasFlag(mode, 'text')) ctx.coerce('cliponaxis');
}
