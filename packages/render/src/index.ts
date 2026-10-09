/**
 * @mk7s/holochart-render — the three.js layer: the render root, viewports, GPU primitives, text,
 * picking and marker symbols. `@mk7s/holochart` exposes it as the `render` namespace.
 *
 * The package is experimental until the plugin API is declared stable (plan E22): its exports may
 * change in any minor release (docs/release/versioning.md). The exceptions are tagged `@public`:
 * the `fonts` and `symbols` registries, which the full bundle also exports by name.
 *
 * @experimental
 * @packageDocumentation
 */

export * from './types.ts';
export * from './resources.ts';
export * from './capabilities.ts';
export * from './primitives/index.ts';
export * from './core/index.ts';
export * from './colorscale/index.ts';
export * from './markers/index.ts';
export * from './picking/index.ts';
export * from './primitives/image.ts';
