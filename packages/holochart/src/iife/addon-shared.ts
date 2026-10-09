/**
 * What the script-tag build's 3D add-on needs from the main script beyond the public API
 * (ADR-015): the `@internal` exports of core, traces-basic and components that the 3D package and
 * the 2.5D view import. The add-on bundles none of these packages; it reads their exports from
 * `window.Holochart` (`scripts/build/iife-split.ts`), so `iife.ts` puts these names there next to
 * the public ones (`bundle-2d.ts`). They are not API: `@mk7s/holochart/global` does not type them,
 * and the ESM bundle does not export them.
 *
 * The add-on's build fails, naming the export, when 3D code imports a name of a shared package
 * that is neither public nor listed here.
 */
export {
  annotationItemAttributes,
  autorange,
  autoType,
  axisCategories,
  coerceContainer,
  coerceItems,
  computeTicks,
  createScale,
  formatNumber,
  formatValue,
  getIn,
  getNodeAtPath,
  isArrayLike,
  isPlainObject,
  LIT_MATERIAL_TYPES,
  reducedMotion,
  resolveWithTemplate,
  richTextLabel,
  scaledFontSize,
  setIn,
} from '@mk7s/holochart-core';
export {
  coloraxisLayoutSchema,
  colorscaleAttributes,
  hasColorscale,
  mapColor,
  markerColorbar,
  markerStyle,
  numericExtent,
  resolveColorMapping,
  rgbaToCss,
  supplyColorbarDefaults,
  supplyColorscaleDefaults,
} from '@mk7s/holochart-traces-basic';
export { axisGeometry, axisPlacement, axisTicks, buildAxesScene } from '@mk7s/holochart-components';
