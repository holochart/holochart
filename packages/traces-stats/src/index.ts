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

// Grid helpers shared with the `heatmap` and `image` traces of @mk7s/holochart-traces-sci (M4):
// the `z` colorscale, cell labels, cell hover text and gap filling.
export {
  cssStops,
  DEFAULT_Z_COLORSCALE,
  recordZExtent,
  supplyZColoraxisDefaults,
  supplyZColorscaleDefaults,
  zColorbar,
  zColorMapping,
  zColorscaleAttributes,
  zDomain,
} from './histogram2d/colorscale.ts';
export type { ZColorMapping } from './histogram2d/colorscale.ts';
export { heatmapLegendIcon } from './histogram2d/index.ts';
export { cellTextFont } from './histogram2d/attributes.ts';
export { supplyCellTextDefaults } from './histogram2d/defaults.ts';
export { heatmapRenderOrder } from './histogram2d/plot.ts';
export { autoCellFontSize, cellLabels } from './histogram2d/text.ts';
export type { CellText, CellTextGrid } from './histogram2d/text.ts';
export { axisHoverText, cellColor, dataValue, zText } from './histogram2d/hover.ts';
export { fillGaps } from './shared/contour-gaps.ts';
// The keyboard cell cursor of grid traces, loaded on first use (backlog S2.14).
export { gridA11y } from './a11y-loader.ts';

// The contouring shared by `histogram2dcontour` and the `contour` trace of
// @mk7s/holochart-traces-sci (M4, E11.2): attributes, defaults, contouring (levels, constraints,
// gap masks), colors, colorbar, legend glyph and the renderer.
export { contourAttributes as contourCommonAttributes } from './contour/attributes.ts';
export { supplyContourDefaults } from './contour/defaults.ts';
export type { ContourStyleOptions } from './contour/defaults.ts';
export { contourField, emptyContourField, levelsOf as contourLevelsOf } from './contour/field.ts';
export type {
  ContourBounds,
  ContourConstraint,
  ContourField,
  ContourFieldGrid,
} from './contour/field.ts';
export { createContourRenderer, levelText as contourLevelText } from './contour/plot.ts';
export type { ContourAxisGrid, ContourCalc, ContourRendererOptions } from './contour/plot.ts';
export {
  contourColorbar,
  contourLegendIcon,
  contourMapping,
  isConstraint as isConstraintContour,
} from './contour/style.ts';
export { presenceField as contourPresenceField } from './shared/contour-mask.ts';
export type { ContourLevels, ContourPath, ContourRegion } from './shared/contour.ts';

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

/**
 * Figure input types of this package's traces (backlog S1.6): one per trace type (`BoxTrace`, …) and
 * their union, generated from the attribute schemas by `tools/schema-gen`.
 */
export type * from './generated/traces.ts';
