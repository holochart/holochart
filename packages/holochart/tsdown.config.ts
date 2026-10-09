import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsdown';
import {
  ADDON_BANNER,
  ADDON_GLOBALS,
  iife2DPlugin,
  iife3DAddonPlugin,
} from '../../scripts/build/iife-split.ts';
import {
  DTS_OPTIONS,
  dtsWithoutInternalMembers,
  dtsWithoutMapComment,
  productionPlugins,
} from '../../scripts/build/tsdown-preset.ts';
import pkg from './package.json' with { type: 'json' };

const source = (file: string): string => fileURLToPath(new URL(file, import.meta.url));

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

/** The 2D trace packages' loaders of their accessibility chunks (`src/a11y-loader.ts`, S2.14). */
const TRACE_A11Y_LOADER = /[\\/]traces-(?!3d[\\/])[\w-]+[\\/]src[\\/]a11y-loader\.ts$/;

/**
 * 2D script only: leave out the trace packages' lazily loaded accessibility chunks (the keyboard
 * stops of the hierarchy, flow, statistical, grid, polar and funnelarea traces, backlog S2.14).
 * A single-file script would inline them (about 2.9 kB min+gz), which its size budget has no room
 * for (docs/release/bundle-size.md); their loaders become no-ops, so those traces have no
 * `a11y` and keyboard navigation skips them, as before S2.14. The ESM build loads the chunks on a
 * chart's first keyboard focus, and the 3D add-on carries the 3D package's chunk. Remove this
 * plugin from the 2D script's build to ship them in it.
 */
function scriptWithoutTraceA11yPlugin() {
  return {
    name: 'holochart:script-without-trace-a11y',
    load: {
      filter: { id: TRACE_A11Y_LOADER },
      handler: () =>
        'export const lazyA11y = () => undefined;\nexport const gridA11y = undefined;\n',
    },
  };
}

/** The 2.5D view's lazily loaded view (`src/view3d/view.ts`, plan E8.9). */
const VIEW3D_VIEW = /[\\/]src[\\/]view3d[\\/]view\.ts$/;

/**
 * ESM chunk names: the 2.5D view's lazily loaded view is `view3d-<hash>.js`, so apps (and the size
 * report, `tests/bundle/size/entries.ts`) can tell it apart; other chunks keep rolldown's.
 */
function chunkFileNames(chunk: { facadeModuleId: string | null }): string {
  return chunk.facadeModuleId && VIEW3D_VIEW.test(chunk.facadeModuleId)
    ? 'view3d-[hash].js'
    : '[name]-[hash].js';
}

/** Workspace packages resolve through the `source` export condition in the IIFE builds. */
const SOURCE_CONDITIONS = {
  resolve: { conditionNames: ['source', 'browser', 'import', 'module', 'default'] },
};
/** The package version, checked by the 3D add-on against the main script's (`iife/host.ts`). */
const VERSION_DEFINE = { __HOLOCHART_VERSION__: JSON.stringify(pkg.version) };

/**
 * Three builds (ADR-015):
 *
 * - `dist/index.js` + `dist/index.d.ts`: ESM for bundler users, the full bundle (3D included; its
 *   heavy code is in render's lazy chunks). Holochart packages and `three` (peer dependency,
 *   ADR-003) stay external. The same build has a second entry, `dist/geo.js` + `dist/geo.d.ts`
 *   (`@mk7s/holochart/geo`, ADR-026): it registers the geo package, which `dist/index.js` never
 *   imports (`tests/bundle/esm-no-geo.spec.ts`). A third, `dist/graph.js` + `dist/graph.d.ts`
 *   (`@mk7s/holochart/graph`, ADR-029), does the same for the graph package
 *   (`tests/bundle/esm-no-graph.spec.ts`).
 * - `dist/holochart.iife.min.js`: self-contained, minified IIFE for `<script>` / CDN use, exposing
 *   `window.Holochart`: the 2D bundle (`src/iife.ts`, everything but the 3D package). Everything is
 *   bundled, including `three` (which no longer ships a UMD or global build). Workspace packages
 *   resolve through the `source` export condition so the bundle and its sourcemap come straight
 *   from TypeScript sources, so the strip-descriptions plugin (ADR-020) runs on them here: the IIFE
 *   ships without attribute-schema descriptions. The built-in default font (TeX Gyre Heros, plan
 *   E2.18) ships as `dist/fonts/*.otf` with its license, loaded relative to the script when text
 *   first needs a face.
 * - `dist/holochart-3d.iife.min.js`: the 3D add-on (`src/iife-3d.ts`), loaded after the main
 *   script. It bundles only the 3D package and render's 3D chunks; three.js, core, the runtime,
 *   render and traces-basic are the main script's (`scripts/build/iife-split.ts`).
 *
 * The IIFE sourcemaps map to file names and lines but leave out `sourcesContent` (10 MB of
 * TypeScript sources, most of the package's unpacked size); the ESM build's maps keep theirs.
 */
export default defineConfig([
  {
    entry: ['src/index.ts', 'src/geo.ts', 'src/graph.ts'],
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    sourcemap: true,
    dts: DTS_OPTIONS,
    clean: true,
    plugins: [...productionPlugins(), dtsWithoutInternalMembers(), dtsWithoutMapComment()],
    outputOptions: { chunkFileNames },
  },
  {
    entry: { holochart: 'src/iife.ts' },
    format: 'iife',
    globalName: 'Holochart',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    sourcemap: true,
    dts: false,
    clean: false,
    outputOptions: { entryFileNames: '[name].iife.min.js', sourcemapExcludeSources: true },
    deps: { alwaysBundle: [/.*/], onlyBundle: false },
    define: VERSION_DEFINE,
    plugins: [
      ...productionPlugins(),
      scriptFontFilesPlugin(),
      scriptWithoutTraceA11yPlugin(),
      iife2DPlugin(source('./src/iife/host.ts')),
    ],
    inputOptions: SOURCE_CONDITIONS,
    // The font files (and their license) the script loads, next to it.
    copy: [{ from: '../render/fonts/*', to: 'dist/fonts' }],
  },
  {
    entry: { 'holochart-3d': 'src/iife-3d.ts' },
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    sourcemap: true,
    dts: false,
    clean: false,
    outputOptions: {
      entryFileNames: '[name].iife.min.js',
      sourcemapExcludeSources: true,
      globals: { ...ADDON_GLOBALS },
      banner: ADDON_BANNER,
    },
    deps: { alwaysBundle: [/.*/], onlyBundle: false },
    define: VERSION_DEFINE,
    plugins: [
      ...productionPlugins(),
      iife3DAddonPlugin({
        threeModule: source('./src/iife/three.ts'),
        entry: source('./src/iife-3d.ts'),
        globalModules: [source('./src/exports.ts'), source('./src/iife/addon-shared.ts')],
      }),
    ],
    inputOptions: SOURCE_CONDITIONS,
  },
]);
