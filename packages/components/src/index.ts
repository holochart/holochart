/**
 * @mk7s/holochart-components — figure components (axes, title, legend, colorbar, annotations,
 * modebar, …; plan E3.4, E5).
 * Each is a runtime `ComponentModule`; register them with `register(...)`, or all via
 * `builtinComponents`.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { annotationsComponent } from './annotations/annotations.ts';
import { axesComponent } from './axes/axes.ts';
import { colorbarComponent } from './colorbar/colorbar.ts';
import { imagesComponent } from './images/images.ts';
import { legendComponent } from './legend/legend.ts';
import { modebarComponent } from './modebar/index.ts';
import { shapesComponent } from './shapes/shapes.ts';
import { titleComponent } from './title/title.ts';

// Axes (E3.4) and automargin (E4.2)
export { axesComponent, buildAxesScene } from './axes/axes.ts';
export type { AxesScene } from './axes/axes.ts';
export {
  axisGeometry,
  axisTicks,
  gridGeometry,
  labelBounds,
  tickLabelAnchor,
} from './axes/geometry.ts';
export type {
  AxisFrame,
  AxisGeometry,
  AxisGeometryOptions,
  AxisLike,
  DashItem,
  LabelItem,
  MirrorFrame,
  RectItem,
} from './axes/geometry.ts';
export { axisMarginNeeds, marginPushOf } from './axes/margins.ts';
export type { AxisMarginNeed } from './axes/margins.ts';
export { automarginAllows, axisMarginSide, axisPlacement } from './axes/placement.ts';
export type { AxisPlacement, MarginSide } from './axes/placement.ts';

// Title (E5.1)
export { titleAttributes, titleComponent, titleLayout } from './title/title.ts';
export type { TitleLayout } from './title/title.ts';

// Legend (E5.2)
export { buildLegendScene, legendComponent, legendGlyphOf } from './legend/legend.ts';
export type { LegendScene } from './legend/legend.ts';
export { layoutLegend, legendEntries, legendMarginPush, legendOrigin } from './legend/layout.ts';
export type { LegendBoxes, LegendEntry, LegendItemBox } from './legend/layout.ts';
export { legendAttributes, supplyLegendDefaults } from './legend/schema.ts';
export type { FullLegend } from './legend/schema.ts';
export { legendToggle } from './legend/toggle.ts';

// Colorbar (E5.3)
export { buildColorbarScenes, colorbarComponent } from './colorbar/colorbar.ts';
export {
  colorbarEntries,
  colorbarMarginPush,
  fullColorbar,
  gradientRects,
  layoutColorbar,
} from './colorbar/layout.ts';
export type {
  ColorbarEntry,
  ColorbarEnv,
  ColorbarScene,
  FullColorbar,
  ModuleOf,
} from './colorbar/layout.ts';

// Annotations (E5.4)
export {
  annotationBatches,
  annotationsComponent,
  annotationsOf,
  buildAnnotationGeometries,
} from './annotations/annotations.ts';
export type { AnnotationBatches } from './annotations/annotations.ts';
export {
  annotationGeometry,
  ARROWHEADS,
  arrowGeometry,
  hitAnnotation,
  parseRef,
  pxToRef,
  refToPx,
  resolveAnchors,
} from './annotations/layout.ts';
export type {
  AnnotationEnv,
  AnnotationGeometry,
  ArrowGeometry,
  ArrowOptions,
  AxisRef,
  DragOffset,
  ParsedRef,
  Point,
  RotatedBox,
} from './annotations/layout.ts';
export {
  annotationItemAttributes,
  annotationsAttributes,
  supplyAnnotationDefaults,
} from './annotations/schema.ts';
export type { FullAnnotation } from './annotations/schema.ts';

// Shapes (E5.5)
export {
  accumulateShape,
  closedPolyline,
  dragOverride,
  hitShape,
  movePath,
  shapesComponent,
  shapesOf,
  shapeStack,
} from './shapes/shapes.ts';
export {
  cachedPath,
  labelPosition,
  quantizeScale,
  shapeDim,
  shapeGeometry,
} from './shapes/geometry.ts';
export type { Ring, ShapeAxis, ShapeDim, ShapeEnv, ShapeGeometry } from './shapes/geometry.ts';
export { addHline, addHrect, addShape, addVline, addVrect } from './shapes/helpers.ts';
export type { ShapeOptions } from './shapes/helpers.ts';
// Renamed: core exports `parsePath` / `PathSegment` for attribute paths.
export {
  ellipsePoints,
  flattenPath as flattenShapePath,
  parsePath as parseShapePath,
} from './shapes/path.ts';
export type {
  FlatRing,
  FlattenOptions,
  ParsedPath as ParsedShapePath,
  PathSegment as ShapePathSegment,
  PathValue as ShapePathValue,
} from './shapes/path.ts';
export { shapeItemAttributes, shapesAttributes, supplyShapeDefaults } from './shapes/schema.ts';
export type { FullShape, ShapeLabelPosition } from './shapes/schema.ts';

// Layout images (E5.6)
export { imageSpan, imageStack, imagesComponent, imagesOf } from './images/images.ts';
export type { ImageSpan } from './images/images.ts';
export { imageItemAttributes, imagesAttributes, supplyImageDefaults } from './images/schema.ts';
export type { FullLayoutImage } from './images/schema.ts';

// Layers shared by shapes and images
export { axisAffine, classTransform, clipRect, LayerHost } from './shared/layers.ts';
export type { LayerKind, LayerPlacement, LayerRequest, LayerStack } from './shared/layers.ts';

// Placement shared by boxed components
export {
  anchorFraction,
  anchoredMarginPush,
  anchoredOrigin,
  anchorPoint,
} from './shared/placement.ts';
export type { AnchoredBox } from './shared/placement.ts';

// Modebar (E5.8)
export * from './modebar/index.ts';

// Shared
export { componentsReady } from './shared/ready.ts';
export { plainText } from './shared/text.ts';

/** Every component in this package, in registration order (the full bundle registers these). */
export const builtinComponents: readonly Registrable[] = [
  axesComponent,
  titleComponent,
  colorbarComponent,
  legendComponent,
  imagesComponent,
  shapesComponent,
  annotationsComponent,
  modebarComponent,
];
