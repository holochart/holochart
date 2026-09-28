/**
 * @mk7s/holochart-traces-basic — basic trace types (plan E9). Each export is one trace module
 * object; register it with the runtime: `register(scatter, bar)`, or everything via `basicTraces`.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { bar } from './bar/index.ts';
import { pie } from './pie/index.ts';
import { scatter } from './scatter/index.ts';
import { table } from './table/index.ts';

export * from './scatter/index.ts';
export * from './bar/index.ts';
export * from './pie/index.ts';
export * from './table/index.ts';
export * from './timeline.ts';

/** Every trace module in this package, in registration order (the full bundle registers these). */
export const basicTraces: readonly Registrable[] = [scatter, bar, pie, table];
// Colorscale and colorbar helpers for colorscaled trace types in other packages (histogram2d,
// histogram2dcontour; later heatmap and contour).
export {
  coloraxisLayoutSchema,
  colorbarAttributes,
  colorscaleInterpolation,
  resolveColorscale,
  rgbaToCss,
  supplyColorbarDefaults,
  supplyColorscaleDefaults,
} from './shared/colorscale.ts';
// Draw order of traces (Plotly's layer order), for trace types in other packages (box, violin).
export { traceRenderOrder } from './shared/render-order.ts';
// For the polar traces (traces-sci, M4 wave 1): scatter's line shaping (splines) and bar styles.
export { buildLinePath, type LinePathOptions } from './scatter/line-path.ts';
export { barStyle, type BarStyle } from './bar/style.ts';
// Pattern fills (E8.10) for pattern-capable traces in other packages (funnelarea).
export { patternAttributes, patternFill, supplyPatternDefaults } from './shared/pattern.ts';
// For the bar-like and pie-like financial traces (traces-finance, M4 wave 2: waterfall and funnel
// are laid out, drawn, labeled and hovered as bars; funnelarea aggregates, labels and hovers its
// slices as pie does).
export { barCategoryValues, barExtremes, calcBar } from './bar/calc.ts';
export { barHoverPoints, barSelectPoints } from './bar/hover.ts';
export { placeBarText, valueFormatters, type ValueFormatters } from './bar/text.ts';
export { hasColorscale } from './shared/colorscale.ts';
export {
  layoutBars,
  type StackInput,
  type StackOptions,
  type StackOutput,
} from './shared/stack/index.ts';
export { labelContent, measureLabel } from './shared/rich-text.ts';
export { aggregateSlices } from './pie/calc.ts';
export { castOption, extendColors } from './pie/helpers.ts';
export { pieHoverText } from './pie/hover.ts';
export { insideFont, sliceLabels, sliceText, sliceValues } from './pie/text.ts';
// For the hierarchy traces (traces-hier, M5 wave 0): sunburst sectors fit their labels as pie
// slices do, and hierarchy nodes are colorscaled by their `marker.colors` or values.
export {
  transformInsideText,
  type InsideOrientation,
  type SliceShape,
  type SliceTextTransform,
} from './pie/text.ts';
export {
  colorscaleAttributes,
  mapColor,
  markerColorbar,
  resolveColorMapping,
} from './shared/colorscale.ts';
