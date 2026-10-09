/**
 * Loads the geometry of the 3D globe (backlog GEO8, ADR-028): the builders of `globe/index.ts`
 * are one lazy chunk, imported the first time a figure draws a `'globe3d'` subplot, so a map that
 * is not a globe carries none of it (ADR-026).
 *
 * The chunk triangulates with render's `triangulateFills`, which lives with earcut in render's
 * own lazy fill chunk. Importing it by name, from here or from the chunk, would make an app's
 * bundler keep it in the initial code (7 kB gzipped, measured). So this loader loads both chunks
 * and hands the globe's what it needs of render and of the package's initial code
 * (`globe/deps.ts`).
 */
import { loadFillTriangulation } from '@mk7s/holochart-render';
import { projectPolygons } from './sink.ts';

/** The globe's lazy chunk: `buildSphereMesh`, `buildSphereLines`, `buildArcs`, `buildPrisms`, … */
export type GlobeModule = typeof import('./globe/index.ts');

/** The chunk once it has loaded. A failed load leaves both of these unset. */
let globe: GlobeModule | null = null;
let loading: Promise<GlobeModule> | undefined;

/** The globe's geometry builders when they are loaded, else `null`: see {@link loadGlobe}. */
export function globeModule(): GlobeModule | null {
  return globe;
}

/**
 * Loads the globe's geometry builders, once, and resolves with them; at once when they are
 * loaded. Concurrent callers share the request.
 *
 * The promise always settles. It rejects with an `Error` that says the globe could not be loaded
 * (the failure is its `cause`). A failed load is not remembered: the next call imports again.
 */
export function loadGlobe(): Promise<GlobeModule> {
  if (globe) return Promise.resolve(globe);
  loading ??= Promise.all([import('./globe/index.ts'), loadFillTriangulation()]).then(
    ([chunk, triangulate]) => {
      chunk.provideGlobeDeps({ projectPolygons, triangulate });
      globe = chunk;
      return chunk;
    },
    (cause: unknown) => {
      // Forget the failure, so the next figure that asks tries the network again.
      loading = undefined;
      throw new Error(
        "Could not load the 3D globe ('globe3d'): the chunk with its geometry, or render's fill " +
          'chunk with the triangulation, failed to load.',
        { cause },
      );
    },
  );
  return loading;
}
