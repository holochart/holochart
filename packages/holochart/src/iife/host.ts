/**
 * The handle the script-tag build's add-ons use (ADR-015): `Holochart.__iife`, set by the main
 * script (`holochart.iife.min.js`, `iife.ts`) and read by `holochart-3d.iife.min.js`
 * (`iife-3d.ts`). Internal: not part of the public API, and not in the ESM bundle.
 *
 * The add-on is built with the packages it shares mapped to the main script's instances
 * (`scripts/build/iife-split.ts`): `three` → {@link IIFEHost.three}, `@mk7s/holochart-render` →
 * `Holochart.render`, and core, the runtime, traces-basic and components → `Holochart` itself (the
 * main script has their public exports, and the `@internal` ones the add-on imports:
 * `addon-shared.ts`; the add-on's build checks every name it imports). So a page has one
 * three.js, one registry, one render root implementation and one copy of render's module state.
 */
import type * as Render from '@mk7s/holochart-render';
import type * as Three from './three.ts';

/** Render's lazily loaded 3D chunks, which the 3D add-on provides to the main script. */
export interface Lazy3DModules {
  mesh: Render.MeshModule;
  'lines-markers-3d': Render.LinesMarkers3DModule;
  /** The 2.5D view and the extrusion primitive (`layout.view3d`, `depth`; plan E8.9). */
  extrusion: Render.ExtrusionModule;
  /** The full bundle's 2.5D view component's view (`view3d/view.ts`). */
  view3d: typeof import('../view3d/view.ts');
}

export interface IIFEHost {
  /** The package version the main script was built from; the add-on must match it. */
  readonly version: string;
  /** The three.js exports add-ons may use (`three.ts`), from the main script's three.js. */
  readonly three: typeof Three;
  /** Provide one of render's lazily loaded 3D chunks (the add-on, once, when it loads). */
  provideLazy3D<K extends keyof Lazy3DModules>(name: K, module: Lazy3DModules[K]): void;
}

const provided = new Map<keyof Lazy3DModules, unknown>();

/** See {@link IIFEHost.provideLazy3D}. */
export function provideLazy3D<K extends keyof Lazy3DModules>(
  name: K,
  module: Lazy3DModules[K],
): void {
  provided.set(name, module);
}

/**
 * In the main script, render's 3D loaders (`loadMeshModule`, `loadLinesMarkers3D`,
 * `loadExtrusionModule`) call this in
 * place of their dynamic `import()` (the build rewrites them, see `tsdown.config.ts`): the chunk
 * the 3D add-on provided, or a rejection that says to load the add-on.
 */
export function lazy3D<K extends keyof Lazy3DModules>(name: K): Promise<Lazy3DModules[K]> {
  const module = provided.get(name) as Lazy3DModules[K] | undefined;
  if (module) return Promise.resolve(module);
  return Promise.reject(
    new Error(
      `[holochart] 3D code (${name}) is in holochart-3d.iife.min.js: load it after holochart.iife.min.js.`,
    ),
  );
}
