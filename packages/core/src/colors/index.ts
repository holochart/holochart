// Color system (plan E8.2): named colorscales and colorways, plotly.js's built-in scales, and the
// plotly.py palettes and scales (registered on demand by `registerBuiltinColors`).
export {
  colors,
  colorscaleNames,
  colorscaleRegistryVersion,
  colorwayNames,
  colorways,
  getColorscale,
  getColorway,
  isColorscaleName,
  registerColorscale,
  registerColorscales,
  registerColorway,
  reverseColorscale,
} from './registry.ts';
export type { ColorscaleInput, ColorscaleStops } from './registry.ts';
export { evenStops, PLOTLYJS_COLORSCALES } from './plotlyjs.ts';
export { BUILTIN_COLORSCALE_GROUPS, BUILTIN_PALETTES, registerBuiltinColors } from './builtins.ts';
export type { ColorscaleGroup, ColorscaleKind } from './builtins.ts';
export { CARTO_DIVERGING, CARTO_SEQUENTIAL } from './data/carto.ts';
export { CMOCEAN_CYCLICAL, CMOCEAN_DIVERGING, CMOCEAN_SEQUENTIAL } from './data/cmocean.ts';
export { COLORBREWER_DIVERGING, COLORBREWER_SEQUENTIAL } from './data/colorbrewer.ts';
export { CYCLICAL } from './data/cyclical.ts';
export { QUALITATIVE } from './data/qualitative.ts';
export { DIVERGING_PLOTLY, SEQUENTIAL } from './data/sequential.ts';
