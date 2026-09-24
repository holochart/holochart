import { defineConfig } from 'tsdown';
import { productionPlugins } from '../../scripts/build/tsdown-preset.ts';

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
    plugins: productionPlugins(),
    inputOptions: {
      resolve: { conditionNames: ['source', 'browser', 'import', 'module', 'default'] },
    },
  },
]);
