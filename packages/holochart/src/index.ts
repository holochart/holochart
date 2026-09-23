/**
 * @mk7s/holochart — the full bundle: core, the chart runtime, and every built-in trace and
 * component registered into the shared registry (ADR-019). For smaller bundles, import
 * `@mk7s/holochart-runtime` and register only the modules you use (E21.1).
 */
import { builtinComponents } from '@mk7s/holochart-components';
import * as runtime from '@mk7s/holochart-runtime';
import { basicTraces } from '@mk7s/holochart-traces-basic';

/** Every built-in module, registered through the same public `register` API plugins use (E22.1). */
export const builtins: readonly runtime.Registrable[] = [...basicTraces, ...builtinComponents];

runtime.register(...builtins);

export * from '@mk7s/holochart-core';
export * from '@mk7s/holochart-runtime';
// Core's module types cover only the pure parts; the runtime's add the render parts.
export type { ComponentModule, TraceModule } from '@mk7s/holochart-runtime';

// The entry points are re-bound locally (not only re-exported) so that using any of them keeps this
// module, and with it the registration above, in a tree-shaken build ("sideEffects": false).
export const createChart = runtime.createChart;
export const newPlot = runtime.newPlot;
export const react = runtime.react;
export const restyle = runtime.restyle;
export const relayout = runtime.relayout;
export const update = runtime.update;
export const addTraces = runtime.addTraces;
export const deleteTraces = runtime.deleteTraces;
export const moveTraces = runtime.moveTraces;
export const purge = runtime.purge;
export const register = runtime.register;
export const registry = runtime.registry;

export * from '@mk7s/holochart-traces-basic';
export * from '@mk7s/holochart-components';

/**
 * Low-level GPU primitives and the render root, for plugin authors and custom traces (plan E22).
 * Namespaced so they don't collide with the figure-level API (e.g. core's `Primitive` value type).
 */
export * as render from '@mk7s/holochart-render';
