/**
 * Contouring (Plotly `traces/contour/*`, `heatmap/interp2d.js`), shared by `histogram2dcontour`
 * and the M4 `contour` trace. Pure: no GPU, no three.js.
 *
 * Pipeline, for a row-major z grid `z[j·nx + i]` with cell-center coordinates `xc`, `yc`:
 *
 * 1. **Levels** — {@link contourLevels} resolves `contours.start/end/size` (automatic from the z
 *    range and `ncontours`, or manual) into an exact level list. {@link contourColorRange} gives
 *    the z interval the colorscale spans for `contours.coloring`, {@link bandValue} the z whose
 *    color fills the band above a level (k = −1: below the first level).
 * 2. **Gaps** — {@link fillGaps} replaces empty cells by an iterative neighbour average, as Plotly
 *    does before contouring.
 * 3. **Marching squares** — {@link marchingSquares} per level (or {@link marchLevels}) returns
 *    maximal polylines in fractional INDEX space, above side on the left: closed loops around
 *    maxima counter-clockwise, around minima clockwise (y-up frame x = i, y = j), open paths from
 *    boundary to boundary.
 * 4. **Smoothing** — {@link smoothPath} (Plotly `smoothopen`/`smoothclosed`, `line.smoothing`),
 *    applied in index space.
 * 5. **Index → data** — {@link indexToData} / {@link pathToData} map through the (possibly
 *    non-uniform) cell centers by piecewise-linear interpolation. Axis transforms come after.
 * 6. **Fill** — paint {@link gridBoundary} in the color of band −1, then for each level k in
 *    ascending order {@link levelRegion} (region `z ≥ level_k`, rings for the NONZERO fill rule) in
 *    the color of band k, each over the previous ones. Build regions from the unsmoothed or the
 *    smoothed paths, converting ring vertices with {@link indexToData} like the lines.
 * 7. **Lines and labels** — convert the paths to px (y up), measure the label texts, call
 *    {@link placeContourLabels} (Plotly's label optimizer), then clip every line with the placed
 *    label boxes ({@link clipPolylineByBoxes}) before drawing it.
 * 8. **Constraints** — `contours.type: 'constraint'` contours the constraint's one or two levels
 *    ({@link constraintLevels}) and shades {@link constraintRegion}, composed from the level
 *    regions of step 6.
 */
export {
  bandValue,
  contourColorRange,
  contourLevels,
  levelList,
  MAX_CONTOUR_LEVELS,
  type ContourColoring,
  type ContourLevels,
  type ContourLevelsOptions,
} from './contour-levels.ts';
export { fillGaps } from './contour-gaps.ts';
export {
  indexToData,
  marchingSquares,
  marchLevels,
  pathToData,
  type ContourGrid,
  type ContourPath,
} from './contour-march.ts';
export {
  gridBoundary,
  levelRegion,
  perimeterParam,
  regionArea,
  type ContourRegion,
} from './contour-fill.ts';
export { smoothPath } from './contour-smooth.ts';
export {
  clipPolylineByBoxes,
  cutPath,
  LABEL_CONSTANTS,
  placeContourLabels,
  segmentDistance,
  type ClippedLine,
  type ContourLabel,
  type LabelBox,
  type LabelOptions,
  type LabelPath,
  type LabelPlacement,
  type LabelSize,
  type PlotRect,
} from './contour-labels.ts';
export {
  CONSTRAINT_OPERATIONS,
  CONSTRAINT_REDUCTION,
  concatRegions,
  constraintHasFill,
  constraintLevels,
  constraintRegion,
  constraintValue,
  isIntervalOperation,
  reverseRegion,
  satisfiesConstraint,
  type ConstraintOperation,
  type ReducedOperation,
} from './contour-constraint.ts';
export {
  clipPathToMask,
  hasGaps,
  inMask,
  MASK_LEVEL,
  maskIndex,
  maskRegion,
  presenceField,
  type MaskIndex,
} from './contour-mask.ts';
