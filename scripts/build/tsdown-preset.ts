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
 * Declaration options of every published build (`dts` in tsdown):
 *
 * - `stripInternal`: members tagged `@internal` in TSDoc are left out of the shipped `.d.ts`
 *   (docs/release/versioning.md: they are not public API).
 * - No declaration maps: they would point at `../src/*.ts`, which the packages don't ship (`files`
 *   is `dist` only). The JS sourcemaps embed their sources, so debugging is unaffected.
 */
export const DTS_OPTIONS = {
  sourcemap: false,
  compilerOptions: { stripInternal: true },
};

/**
 * Removes the `//# sourceMappingURL=….d.ts.map` comment from the bundled declarations: with
 * declaration maps off ({@link DTS_OPTIONS}), rolldown-plugin-dts drops the map file but rolldown
 * still appends the comment (the JS builds have `sourcemap: true`). Add it to every build that
 * emits declarations.
 */
export function dtsWithoutMapComment() {
  return {
    name: 'holochart:dts-without-map-comment',
    generateBundle(
      _options: unknown,
      bundle: Record<string, { type: string; fileName: string; code?: string }>,
    ): void {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.fileName.endsWith('.d.ts') || !chunk.code) continue;
        chunk.code = chunk.code.replace(/\n\/\/# sourceMappingURL=\S+\.d\.ts\.map\s*$/, '\n');
      }
    },
  };
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
  const production = {
    ...base,
    dts: DTS_OPTIONS,
    clean: true,
    plugins: [...productionPlugins(), dtsWithoutMapComment()],
  };
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
