/**
 * Shared tsdown configuration of the library packages (ADR-015, ADR-020).
 *
 * - `dist/index.js` (+ bundled `index.d.ts`): the production build, with attribute-schema
 *   descriptions stripped ({@link stripDescriptionsPlugin}). Exported under `import`.
 * - `dist/index.development.js` (packages that have descriptions): the same code with
 *   descriptions kept, exported under the `development` condition, so `plotSchema()` in a dev
 *   server (Vite, webpack `mode: 'development'`, …) still returns them.
 *
 * Set `HOLOCHART_KEEP_DESCRIPTIONS=1` to build `dist/index.js` without stripping (used to measure
 * what stripping saves; never for releases).
 */
import { stripDescriptionsPlugin } from './strip-descriptions.ts';

/** Options of {@link libraryConfig}. */
export interface LibraryConfigOptions {
  /** Also emit `dist/index.development.js` with descriptions (packages that declare schemas). */
  development?: boolean;
}

/** True unless `HOLOCHART_KEEP_DESCRIPTIONS` is set: whether production builds strip descriptions. */
export function stripsDescriptions(): boolean {
  const keep = process.env['HOLOCHART_KEEP_DESCRIPTIONS'];
  return keep === undefined || keep === '' || keep === '0';
}

/** Production plugins shared by every build that ships to users (ESM and IIFE). */
export function productionPlugins(): ReturnType<typeof stripDescriptionsPlugin>[] {
  return stripsDescriptions() ? [stripDescriptionsPlugin()] : [];
}

/**
 * tsdown configs for one library package: ESM + one bundled `index.d.ts`. `dependencies` and
 * `peerDependencies` (e.g. `three`, ADR-003) are external automatically; declarations come from
 * tsc via rolldown-plugin-dts (they never contained descriptions).
 */
export function libraryConfig(options: LibraryConfigOptions = {}): Record<string, unknown>[] {
  const base = {
    entry: ['src/index.ts'],
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    sourcemap: true,
  };
  const production = { ...base, dts: true, clean: true, plugins: productionPlugins() };
  if (!options.development) return [production];
  return [
    production,
    {
      ...base,
      dts: false,
      // Both builds write to dist/; tsdown cleans once for all configs before building.
      clean: false,
      outputOptions: {
        entryFileNames: '[name].development.js',
        chunkFileNames: '[name]-[hash].development.js',
      },
    },
  ];
}
