/**
 * The scatter `colorbar` hook (plan E5.3): the bar of `marker`'s colorscale, when shown.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { ColorbarSpec, LegendIconContext } from '@mk7s/holochart-runtime';
import { markerColorbar } from '../shared/colorscale.ts';

/** `marker.showscale` (or the referenced `coloraxis`' `showscale`) → a colorbar spec. */
export function scatterColorbar(trace: FullTrace, ctx: LegendIconContext): ColorbarSpec | null {
  return markerColorbar(trace, ctx.fullLayout, 'marker');
}
