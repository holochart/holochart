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
