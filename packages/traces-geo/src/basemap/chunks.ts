/**
 * Where the bundled basemap data comes from (ADR-024, ADR-026). Each module of `generated/` is a
 * TopoJSON topology as a JSON string, written by `tools/geo-data` from Natural Earth and imported
 * with a static-string dynamic `import()`: every bundler splits it into its own lazy chunk
 * without configuration, and nothing is loaded until a `geo` subplot needs that resolution.
 *
 * A build that cannot split chunks (the script-tag add-on of ADR-026) replaces this module.
 */
import type { GeoResolution } from '../geo/types.ts';

/** The two data chunks of a resolution. */
export type BasemapPart = 'base' | 'extras';

/** The JSON text of one data chunk, loading it on first call. */
export function loadChunk(part: BasemapPart, resolution: GeoResolution): Promise<string> {
  const chunk =
    part === 'base'
      ? resolution === 50
        ? import('./generated/base-50m.ts')
        : import('./generated/base-110m.ts')
      : resolution === 50
        ? import('./generated/extras-50m.ts')
        : import('./generated/extras-110m.ts');
  return chunk.then((module) => module.default);
}
