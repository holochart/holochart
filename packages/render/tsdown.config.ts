import path from 'node:path';
import { defineConfig } from 'tsdown';
import { libraryConfig } from '../../scripts/build/tsdown-preset.ts';

/** The lazily loaded fill chunk's entry (plan E21.6, `src/primitives/fill-lazy.ts`). */
const FILL_LAZY = /[\\/]src[\\/]primitives[\\/]fill-lazy\.ts$/;
/** The modules of the fill chunk: the fill primitive and its triangulation code. */
const FILL_MODULE = /[\\/]src[\\/]primitives[\\/]fill(?:-triangulate|-arrangement|\.glsl)?\.ts$/;

/**
 * Main build: the dynamic `import('./fill-lazy.ts')` of `fill-loader.ts` stays a dynamic import of
 * the separately built `./fill-lazy.js` (below) instead of pointing into `index.js`, which also
 * contains the fill code for the public `FillPrimitive` exports.
 */
function lazyFillImport() {
  return {
    name: 'holochart:lazy-fill-import',
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !source.endsWith('fill-lazy.ts')) return null;
      const id = path.resolve(path.dirname(importer), source);
      return FILL_LAZY.test(id) ? { id: './fill-lazy.js', external: true } : null;
    },
  };
}

/**
 * Fill chunk build: the fill modules are bundled; every other workspace module they import (the
 * shared primitive helpers, the colorscale LUT, the transform constants) comes from `./index.js`,
 * which exports all of them, so the chunk holds no second copy of shared code or state.
 */
function sharedFromIndex() {
  return {
    name: 'holochart:fill-shared-from-index',
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !source.startsWith('.')) return null;
      const id = path.resolve(path.dirname(importer), source);
      return FILL_LAZY.test(id) || FILL_MODULE.test(id)
        ? null
        : { id: './index.js', external: true };
    },
  };
}

/**
 * ESM + one bundled `index.d.ts` (ADR-015). The production strip-descriptions plugin (ADR-020)
 * runs here too; this package declares no attribute schemas, so it has no development build.
 * See scripts/build/tsdown-preset.ts.
 *
 * Plus `dist/fill-lazy.js`, the fill code loaded on first use (plan E21.6; see
 * `src/primitives/fill-lazy.ts` for why it is its own build rather than a split chunk).
 */
const [main] = libraryConfig() as [Record<string, unknown>];

export default defineConfig([
  { ...main, plugins: [...(main['plugins'] as unknown[]), lazyFillImport()] },
  {
    entry: { 'fill-lazy': 'src/primitives/fill-lazy.ts' },
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    sourcemap: true,
    dts: false,
    // Both builds write to dist/; tsdown cleans once for all configs before building.
    clean: false,
    plugins: [sharedFromIndex()],
  },
]);
