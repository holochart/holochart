/**
 * The public API shared by the full bundle (`index.ts`) and the 2D bundle of the script-tag build
 * (`bundle-2d.ts`): everything but the built-in module list, their registration and the 3D
 * package. No side effects.
 */
import * as runtime from '@mk7s/holochart-runtime';

export * from '@mk7s/holochart-core';
export * from '@mk7s/holochart-runtime';
// Core's module types cover only the pure parts; the runtime's add the render parts.
export type { ComponentModule, TraceModule } from '@mk7s/holochart-runtime';

// The entry points are re-bound locally (not only re-exported) so that using any of them keeps the
// bundle module, and with it the registration of the built-ins, in a tree-shaken build
// ("sideEffects": false).
export const createChart = runtime.createChart;
export const newPlot = runtime.newPlot;
export const react = runtime.react;
export const restyle = runtime.restyle;
export const relayout = runtime.relayout;
export const update = runtime.update;
export const addTraces = runtime.addTraces;
export const deleteTraces = runtime.deleteTraces;
export const moveTraces = runtime.moveTraces;
export const extendTraces = runtime.extendTraces;
export const prependTraces = runtime.prependTraces;
export const fromJSON = runtime.fromJSON;
export const chartToJSON = runtime.chartToJSON;
export const toImage = runtime.toImage;
export const downloadImage = runtime.downloadImage;
export const purge = runtime.purge;
export const register = runtime.register;
export const registry = runtime.registry;
export const setDefaultTemplate = runtime.setDefaultTemplate;

export * from '@mk7s/holochart-traces-basic';
export * from '@mk7s/holochart-traces-stats';
export * from '@mk7s/holochart-traces-sci';
export * from '@mk7s/holochart-traces-finance';
export * from '@mk7s/holochart-traces-hier';
export * from '@mk7s/holochart-components';
/** The built-in themes (plan E8.1), namespaced: `themes.THEMES`, `themes.plotly_dark`, … */
export * as themes from '@mk7s/holochart-themes';
/**
 * Plotly Express-style charts from tabular data (plan E23), namespaced because its `scatter`,
 * `strip`, `box`, … share names with the trace modules above: `express.scatter(rows, { x, y })`.
 */
export * as express from '@mk7s/holochart-express';
/** Web fonts for chart text (plan E8.3): `fonts.register('Inter', { regular, bold, … })`. */
export { fonts } from '@mk7s/holochart-render';
/**
 * Custom marker symbols (plan E8.11): `symbols.register('pin', { path: 'M…' })` makes `'pin'` (and
 * `'pin-open'`, …) a `marker.symbol` value.
 */
export { symbols } from '@mk7s/holochart-render';

/**
 * Low-level GPU primitives and the render root, for plugin authors and custom traces (plan E22).
 * Namespaced so they don't collide with the figure-level API (e.g. core's `Primitive` value type).
 */
export * as render from '@mk7s/holochart-render';
