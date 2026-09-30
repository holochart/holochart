/**
 * Lazy loading of the 3D line and marker primitives (plan E14.2), like the fill primitive
 * (`fill-loader.ts`) and the custom markers (`custom.ts`): `Line3D`, `Markers3D`, `SphereSet` and
 * the depth sorting live in their own chunk (`lines-markers-3d.ts`), fetched with a dynamic
 * `import()` the first time a 3D trace needs them. Bundlers that split code emit it as its own
 * chunk. The script-tag build inlines it into its 3D add-on, which hands it to this loader (the
 * main script's build replaces the `import()`, see `scripts/build/iife-split.ts`).
 *
 * ```ts
 * const m3d = await loadLinesMarkers3D();
 * const line = m3d.createLine3D(ctx, { x, y, z, width: 3, dash: 'dash' });
 * ```
 *
 * Only the types of the lazy modules are exported statically (from the package index).
 */

/** The lazily loaded 3D module (`lines-markers-3d.ts`). */
export type LinesMarkers3DModule = typeof import('./lines-markers-3d.ts');

let loaded: LinesMarkers3DModule | null = null;
let loading: Promise<LinesMarkers3DModule> | null = null;

/**
 * Load the 3D line and marker code once (concurrent callers share the request; a failed load is
 * retried by the next call).
 */
export function loadLinesMarkers3D(): Promise<LinesMarkers3DModule> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= import('./lines-markers-3d.ts').then(
    (mod) => (loaded = mod),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** The 3D line and marker module if it has loaded, else `null` (synchronous creation paths). */
export function linesMarkers3DModule(): LinesMarkers3DModule | null {
  return loaded;
}
