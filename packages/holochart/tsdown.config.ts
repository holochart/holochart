import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsdown';
import { productionPlugins } from '../../scripts/build/tsdown-preset.ts';

/** The built-in default font's face table (render), and its IIFE replacement. */
const FONT_FILES_MODULE = /[\\/]render[\\/]src[\\/]fonts[\\/]default-font-files\.ts$/;
const SCRIPT_FONT_FILES = fileURLToPath(
  new URL('../render/src/fonts/default-font-files.script.ts', import.meta.url),
);

/**
 * IIFE only: resolve the default font's faces to the OTF files shipped next to the script
 * (`dist/fonts/`) instead of the ESM build's lazy `data:` URL chunks, which a single-file bundle
 * would inline (four fonts, ~720 kB) — see render's `src/fonts/default-font-files.script.ts`.
 */
function scriptFontFilesPlugin() {
  return {
    name: 'holochart:script-font-files',
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !source.endsWith('default-font-files.ts')) return null;
      const id = path.resolve(path.dirname(importer), source);
      return FONT_FILES_MODULE.test(id) ? SCRIPT_FONT_FILES : null;
    },
  };
}

/**
 * Two builds of the full bundle (ADR-015):
 *
 * - `dist/index.js` + `dist/index.d.ts`: ESM for bundler users. Holochart packages and `three`
 *   (peer dependency, ADR-003) stay external.
 * - `dist/holochart.iife.min.js`: self-contained, minified IIFE for `<script>` / CDN use, exposing
 *   `window.Holochart`. Everything is bundled, including `three` (which no longer ships a UMD or
 *   global build). Workspace packages resolve through the `source` export condition so the bundle
 *   and its sourcemap come straight from TypeScript sources, so the strip-descriptions plugin
 *   (ADR-020) runs on them here: the IIFE ships without attribute-schema descriptions.
 *   The built-in default font (TeX Gyre Heros, plan E2.18) ships as `dist/fonts/*.otf` with its
 *   license, loaded relative to the script when text first needs a face.
 */
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    sourcemap: true,
    dts: true,
    clean: true,
    plugins: productionPlugins(),
  },
  {
    entry: { holochart: 'src/index.ts' },
    format: 'iife',
    globalName: 'Holochart',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    sourcemap: true,
    dts: false,
    clean: false,
    outputOptions: { entryFileNames: '[name].iife.min.js' },
    deps: { alwaysBundle: [/.*/], onlyBundle: false },
    plugins: [...productionPlugins(), scriptFontFilesPlugin()],
    inputOptions: {
      resolve: { conditionNames: ['source', 'browser', 'import', 'module', 'default'] },
    },
    // The font files (and their license) the script loads, next to it.
    copy: [{ from: '../render/fonts/*', to: 'dist/fonts' }],
  },
]);
