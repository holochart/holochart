/**
 * `histogram2dcontour` calc (plan E10.3): bin like `histogram2d` (the automatic bins get one empty
 * bin on each side, so density contours close), then contour the bin grid at the bin centers with
 * the contouring shared with `contour` (`../contour/field.ts`): levels or a constraint, gap
 * filling, marching squares per level, `line.smoothing`, and the filled or shaded regions. Pure.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import { linearExtremes, type CalcContext, type TraceExtremes } from '@mk7s/holochart-runtime';
import { contourField, emptyContourField, type ContourField } from '../contour/field.ts';
import { binSamples2d, emptyHistogram2dCalc, type Histogram2dCalc } from '../histogram2d/calc.ts';
import { recordZExtent } from '../histogram2d/colorscale.ts';
import { fillGaps } from '../shared/contour.ts';

/** histogram2dcontour calcdata: the 2D histogram plus its contours. */
export interface Histogram2dContourCalc extends Histogram2dCalc, ContourField {}

/** Contour a binned grid (empty bins filled from their neighbors first). */
export function contourGrid(base: Histogram2dCalc, trace: FullTrace): ContourField {
  const { nx, ny } = base;
  return contourField(
    {
      z: fillGaps(base.z, nx, ny),
      nx,
      ny,
      xc: base.x.centers,
      yc: base.y.centers,
      zExtent: base.zExtent,
    },
    trace,
  );
}

/** The histogram2dcontour `calc`. */
export function calcHistogram2dContour(trace: FullTrace, ctx: CalcContext): Histogram2dContourCalc {
  let base = binSamples2d(trace, ctx);
  // One bin can't be contoured (Plotly needs two centers per direction too).
  if (base.nx < 2 || base.ny < 2) base = emptyHistogram2dCalc();
  if (Number.isFinite(base.zExtent[0])) recordZExtent(trace, base.zExtent);
  if (base.nx === 0) return { ...base, ...emptyContourField(base.z) };
  return { ...base, ...contourGrid(base, trace) };
}

/** Autorange: the bin centers (Plotly draws contours between the first and last center). */
export function histogram2dContourExtremes(calc: Histogram2dContourCalc): TraceExtremes {
  if (calc.nx === 0) return {};
  const b = calc.bounds;
  return { x: linearExtremes([b.x0, b.x1]), y: linearExtremes([b.y0, b.y1]) };
}
