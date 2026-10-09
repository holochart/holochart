/**
 * Loads the code that draws a 3D globe's base layers (`globe-layers.ts`) together with the chunks
 * it draws with: the package's globe geometry, render's meshes and render's 3D lines (ADR-026,
 * ADR-028). A map that is not a globe loads none of it, so none of it is in the package's initial
 * code: the geo component imports this loader and, of `globe-layers.ts`, types only.
 */
import type * as GlobeLayersCode from './globe-layers.ts';

/** `globe-layers.ts`, loaded. */
export type GlobeLayersModule = typeof GlobeLayersCode;

let loaded: GlobeLayersModule | undefined;
let loading: Promise<GlobeLayersModule> | undefined;

/** The code when it and everything it draws with are loaded, else `undefined`. */
export function globeLayersModule(): GlobeLayersModule | undefined {
  return loaded?.globeParts() ? loaded : undefined;
}

/**
 * Load the code (once at a time). Rejects when any of the chunks cannot be loaded; the failure is
 * not remembered, so the next call tries again.
 */
export function loadGlobeLayers(): Promise<GlobeLayersModule> {
  loading ??= import('./globe-layers.ts')
    .then(async (module) => {
      await module.loadGlobeParts();
      loaded = module;
      return module;
    })
    .finally(() => {
      loading = undefined;
    });
  return loading;
}
