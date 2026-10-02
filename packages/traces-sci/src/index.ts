/**
 * @mk7s/holochart-traces-sci — scientific trace types (plan E11, milestone M4): `heatmap`,
 * `contour`, `image`, `scatterpolar` and `barpolar`. Register them like any trace module
 * (`register(...sciTraces)`); the `@mk7s/holochart` bundle registers them for you.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { heatmap } from './heatmap/index.ts';
import { image } from './image/index.ts';
import { contour } from './contour/index.ts';
import { scatterpolar } from './scatterpolar/index.ts';
import { barpolar } from './barpolar/index.ts';
import { polarComponent } from './polar/component.ts';

export { heatmap, heatmapAttributes } from './heatmap/index.ts';
export type { HeatmapAxisCells, HeatmapCalc } from './heatmap/index.ts';
export { image, imageAttributes } from './image/index.ts';
export type { Colormodel, ImageCalc } from './image/index.ts';
export { contour, contourAttributes } from './contour/index.ts';
export type { ContourTraceCalc } from './contour/index.ts';
export { scatterpolar, scatterpolarAttributes } from './scatterpolar/index.ts';
export type { ScatterpolarCalc } from './scatterpolar/index.ts';
export { barpolar, barpolarAttributes } from './barpolar/index.ts';
export { polarComponent } from './polar/component.ts';
export { polarAttributes } from './polar/layout-attributes.ts';
export { PolarSubplot } from './polar/subplot.ts';

/** Every scientific trace module, for `register(...sciTraces)`. */
export const sciTraces: readonly Registrable[] = [
  heatmap,
  image,
  contour,
  scatterpolar,
  barpolar,
  // Draws polar subplots (their axes) and runs their drags.
  polarComponent,
];

/**
 * Figure input types of this package's traces (backlog S1.6): one per trace type (`BarpolarTrace`, …) and
 * their union, generated from the attribute schemas by `tools/schema-gen`.
 */
export type * from './generated/traces.ts';
