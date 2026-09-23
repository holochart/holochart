/**
 * Plotly-style error bars (plan E9.7), shared by the traces that support them (scatter, later
 * bar): schema, supply-defaults, calc (bar ends + autorange values) and a GPU layer.
 */
export { ERROR_BAR_TYPES, errorBarAttributes, type ErrorBarType } from './attributes.ts';
export { supplyErrorBarDefaults, type ErrorBarDefaultsOptions } from './defaults.ts';
export {
  calcErrorBars,
  errorBarExtremeValues,
  makeComputeError,
  type ComputeError,
  type ComputeErrorOptions,
  type ErrorBarCalc,
} from './calc.ts';
export {
  createErrorBarLayer,
  ErrorBarLayer,
  errorBarStyle,
  type ErrorBarLayerData,
  type ErrorBarLayerOptions,
  type ErrorBarStyle,
} from './plot.ts';
