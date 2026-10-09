/**
 * What the globe's chunk is handed by the package's initial code (`globe-loader.ts`) and does not
 * import: the stream sink, which the initial code has anyway, and render's triangulation, which
 * lives in render's own lazy fill chunk. Handing them over keeps this chunk free of modules it
 * would share with the package or with render: a bundler then splits out nothing for it, and
 * earcut stays in the one chunk that has it (ADR-026).
 */
import type { FillGeometryInput, FillTriangulation } from '@mk7s/holochart-render';
import type { GeoInput } from '../sink.ts';
import type { ProjectedPolygons } from '../types.ts';
import type { GeoStreamWrapper } from 'd3-geo';

export interface GlobeDeps {
  /** `projectPolygons` of `sink.ts`. */
  readonly projectPolygons: (
    projection: GeoStreamWrapper,
    height: number,
    object: GeoInput,
  ) => ProjectedPolygons;
  /** `triangulateFills` of render. */
  readonly triangulate: (input: FillGeometryInput) => FillTriangulation;
}

let deps: GlobeDeps | undefined;

/** Hand the chunk what it needs. `loadGlobe` does this before it resolves. */
export function provideGlobeDeps(provided: GlobeDeps): void {
  deps = provided;
}

/** What {@link provideGlobeDeps} handed over; throws when the chunk was not loaded by `loadGlobe`. */
export function globeDeps(): GlobeDeps {
  if (!deps) {
    throw new Error(
      'The globe geometry needs the stream sink and the triangulation: load it with loadGlobe().',
    );
  }
  return deps;
}
