/**
 * @mk7s/holochart-traces-basic — basic trace types (plan E9). Each export is one trace module
 * object; register it with the runtime: `register(scatter)`.
 */
export { markerStyle, scatter, scatterAttributes, SCATTER_SYMBOLS } from './scatter/index.ts';
export type { ScatterCalc } from './scatter/index.ts';
