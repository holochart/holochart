/**
 * `barpolar` calc (plan E11.5): `r` / `theta` → calc coordinates. The bars' extents and the
 * radial autorange come from the stacking step of the polar `crossTraceLayout`
 * (`polar/cross-trace.ts`), which sees every bar trace of the subplot.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import { polarCoordinates } from '../polar/coordinates.ts';
import type { PolarCalc } from '../polar/cross-trace.ts';

export type BarpolarCalc = PolarCalc;

export function calcBarpolar(trace: FullTrace, ctx: CalcContext): BarpolarCalc {
  return {
    coords: polarCoordinates(trace, ctx.fullLayout),
    extremes: undefined,
    subplot: undefined,
  };
}
