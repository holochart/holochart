/**
 * `scatterpolar` calc (plan E11.4): `r` / `theta` → calc coordinates (see `polar/coordinates.ts`),
 * marker sizes as scatter computes them, and the radial autorange contribution (Plotly: the `r`
 * values padded by the marker size, without the 5 % padding).
 */
import { createScale, findExtremes, type FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import { scatter, type ScatterCalc } from '@mk7s/holochart-traces-basic';
import { polarCoordinates } from '../polar/coordinates.ts';
import type { PolarCalc } from '../polar/cross-trace.ts';

export interface ScatterpolarCalc extends PolarCalc {
  /** Drawn marker diameters in px (one value, or per point), as scatter's calc gives them. */
  readonly markerSize: ScatterCalc['markerSize'];
  readonly ppad: ScatterCalc['ppad'];
}

export function calcScatterpolar(trace: FullTrace, ctx: CalcContext): ScatterpolarCalc {
  const coords = polarCoordinates(trace, ctx.fullLayout);
  // Scatter's calc resolves marker sizes (`sizeref`, `sizemode`, …) and their autorange padding.
  const base = scatter.calc!(
    { ...trace, x: coords.r, y: coords.theta, _length: coords.length } as FullTrace,
    { fullLayout: ctx.fullLayout, index: ctx.index, xaxis: undefined, yaxis: undefined },
  );
  const proxy = createScale({ type: 'linear', range: coords.radialScale.range });
  const extremes = findExtremes(
    proxy,
    coords.r,
    base.ppad !== undefined ? { ppad: base.ppad } : {},
  );
  return {
    coords,
    extremes,
    subplot: undefined,
    markerSize: base.markerSize,
    ppad: base.ppad,
  };
}
