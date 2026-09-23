/**
 * @mk7s/holochart-components — figure components (axes, title, legend, modebar, …; plan E3.4, E5).
 * Each is a runtime `ComponentModule`; register them with `register(...)`, or all via
 * `builtinComponents`.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { axesComponent } from './axes/axes.ts';
import { legendComponent } from './legend/legend.ts';
import { modebarComponent } from './modebar/index.ts';
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

// Modebar (E5.8)
export * from './modebar/index.ts';

// Shared
export { componentsReady } from './shared/ready.ts';
export { plainText } from './shared/text.ts';

/** Every component in this package, in registration order (the full bundle registers these). */
export const builtinComponents: readonly Registrable[] = [
  axesComponent,
  titleComponent,
  legendComponent,
  modebarComponent,
];
