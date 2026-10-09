import path from 'node:path';
import { defineConfig } from 'tsdown';
import { libraryConfig } from '../../scripts/build/tsdown-preset.ts';

/** The lazily loaded fill chunk's entry (plan E21.6, `src/primitives/fill-lazy.ts`). */
const FILL_LAZY = /[\\/]src[\\/]primitives[\\/]fill-lazy\.ts$/;
/** The modules of the fill chunk: the fill primitive and its triangulation code. */
const FILL_MODULE = /[\\/]src[\\/]primitives[\\/]fill(?:-triangulate|-arrangement|\.glsl)?\.ts$/;

/**
 * The lazily loaded picker chunk's entry (GEO8, `src/picking/picker-lazy.ts`): the pickers, for
 * code that picks only in a lazy chunk of its own (a map's 3D globe).
 */
const PICKER_LAZY = /[\\/]src[\\/]picking[\\/]picker-lazy\.ts$/;
/**
 * The modules of the picker chunk: everything of `src/picking/` but the point index, which the
 * 2D hover of every chart uses and `./index.js` therefore has anyway.
 */
const PICKER_MODULE =
  /[\\/]src[\\/]picking[\\/](?:picker|gpu-picking|cpu-picking|pick-id|pick-window|pick-hits|pick\.glsl|mesh-pick-material|types)\.ts$/;

/**
 * Main build: the dynamic `import()` of a lazy entry (`fill-loader.ts` → `./fill-lazy.ts`,
 * `picker-loader.ts` → `./picker-lazy.ts`) stays a dynamic import of the separately built file
 * (below) instead of pointing into `index.js`, which also contains that code for the public
 * exports.
 */
function lazyImport(entry: RegExp, file: string) {
  return {
    name: `holochart:lazy-import:${file}`,
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !source.endsWith(`${file}.ts`)) return null;
      const id = path.resolve(path.dirname(importer), source);
      return entry.test(id) ? { id: `./${file}.js`, external: true } : null;
    },
  };
}

/**
 * Lazy chunk build: the chunk's own modules are bundled; every other workspace module they import
 * (the shared primitive helpers, the colorscale LUT, the transform constants, the point index)
 * comes from `./index.js`, which exports all of them, so the chunk holds no second copy of shared
 * code or state.
 */
function sharedFromIndex(entry: RegExp, own: RegExp) {
  return {
    name: 'holochart:lazy-shared-from-index',
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !source.startsWith('.')) return null;
      const id = path.resolve(path.dirname(importer), source);
      return entry.test(id) || own.test(id) ? null : { id: './index.js', external: true };
    },
  };
}

/** The build of one lazy chunk: `dist/<name>.js`. */
function lazyChunk(name: string, source: string, entry: RegExp, own: RegExp) {
  return {
    entry: { [name]: source },
    format: 'esm' as const,
    platform: 'neutral' as const,
    target: 'es2022',
    sourcemap: true,
    dts: false,
    // Every build writes to dist/; tsdown cleans once for all configs before building.
    clean: false,
    plugins: [sharedFromIndex(entry, own)],
  };
}

/**
 * ESM + one bundled `index.d.ts` (ADR-015). The production strip-descriptions plugin (ADR-020)
 * runs here too; this package declares no attribute schemas, so it has no development build.
 * See scripts/build/tsdown-preset.ts.
 *
 * Plus `dist/fill-lazy.js`, the fill code loaded on first use (plan E21.6; see
 * `src/primitives/fill-lazy.ts` for why it is its own build rather than a split chunk), and
 * `dist/picker-lazy.js`, the pickers for code that picks from a lazy chunk (GEO8; see
 * `src/picking/picker-lazy.ts`).
 */
const [main] = libraryConfig() as [Record<string, unknown>];

export default defineConfig([
  {
    ...main,
    plugins: [
      ...(main['plugins'] as unknown[]),
      lazyImport(FILL_LAZY, 'fill-lazy'),
      lazyImport(PICKER_LAZY, 'picker-lazy'),
    ],
  },
  lazyChunk('fill-lazy', 'src/primitives/fill-lazy.ts', FILL_LAZY, FILL_MODULE),
  lazyChunk('picker-lazy', 'src/picking/picker-lazy.ts', PICKER_LAZY, PICKER_MODULE),
]);
