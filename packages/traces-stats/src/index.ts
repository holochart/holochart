/**
 * @mk7s/holochart-traces-stats — statistical trace types (plan E10, milestone M3): `histogram`,
 * `histogram2d`, `histogram2dcontour`, `box`, `violin`, `parcoords` and `parcats`. Register them like any trace module
 * (`register(...statsTraces)`); the `@mk7s/holochart` bundle registers them for you.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { histogram } from './histogram/index.ts';
import { histogram2d } from './histogram2d/index.ts';
import { histogram2dcontour } from './histogram2dcontour/index.ts';
import { box } from './box/index.ts';
import { violin } from './violin/index.ts';
import { splom } from './splom/index.ts';
import { parcoords } from './parcoords/index.ts';
import { parcats } from './parcats/index.ts';

export { histogram, histogramAttributes } from './histogram/index.ts';
export type { HistogramCalc } from './histogram/index.ts';

export { histogram2d, histogram2dAttributes } from './histogram2d/index.ts';
export type { Histogram2dCalc, Histogram2dAxisBins } from './histogram2d/index.ts';
export { histogram2dcontour, histogram2dcontourAttributes } from './histogram2dcontour/index.ts';
export type { Histogram2dContourCalc } from './histogram2dcontour/index.ts';

export { box, boxAttributes, boxLayoutAttributes } from './box/index.ts';
export type { BoxCalc } from './box/index.ts';
export { violin, violinAttributes, violinLayoutAttributes } from './violin/index.ts';
export type { ViolinCalc } from './violin/index.ts';
export { parcoords, parcoordsAttributes } from './parcoords/index.ts';
export type { ParcoordsCalc, ParcoordsDimension } from './parcoords/index.ts';
export { parcats, parcatsAttributes } from './parcats/index.ts';
export type { ParcatsCalc } from './parcats/index.ts';
export { splom, splomAttributes } from './splom/index.ts';
export type { SplomCalc } from './splom/index.ts';
export { strip } from './strip/strip.ts';
export type { StripData, StripFigure, StripOptions } from './strip/strip.ts';

/** Every statistical trace module, for `register(...statsTraces)`. */
export const statsTraces: readonly Registrable[] = [
  histogram,
  histogram2d,
  histogram2dcontour,
  box,
  violin,
  splom,
  parcoords,
  parcats,
];
