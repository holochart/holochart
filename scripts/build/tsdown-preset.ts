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
import ts from 'typescript';
import { stripDescriptionsPlugin } from './strip-descriptions.ts';

/** Options of {@link libraryConfig}. */
export interface LibraryConfigOptions {
  /** Also emit `dist/index.development.js` with descriptions (packages that declare schemas). */
  development?: boolean;
  /**
   * Modules that are data and nothing else, each loaded by a dynamic `import()` of its own
   * (traces-geo's basemap, ADR-024: 0.1 to 0.7 MB each). A chunk made of them is written once,
   * as `dist/<name>.js`, without a hash and without a sourcemap: the production build writes it
   * and the development build imports that same file ({@link dataChunks}). Without this,
   * each would ship four times: in both builds, and again in each one's sourcemap.
   */
  dataModules?: RegExp;
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
 * - No `stripInternal`: an export tagged `@internal` is plumbing the Holochart packages share
 *   (docs/release/versioning.md). It stays in the entry point, so its declaration has to stay
 *   too: the compiler option would remove the declaration and leave the entry's re-export of it
 *   dangling (the build fails), and other packages' declarations refer to these types. Members
 *   tagged `@internal` are still left out of the shipped `.d.ts`, by
 *   {@link dtsWithoutInternalMembers}.
 * - No declaration maps: they would point at `../src/*.ts`, which the packages don't ship (`files`
 *   is `dist` only). The JS sourcemaps embed their sources, so debugging is unaffected.
 */
export const DTS_OPTIONS = {
  sourcemap: false,
};

/** Whether the comment right before `node` is tagged `@internal` (the compiler's own test). */
function isInternal(code: string, node: ts.Node): boolean {
  const comments = ts.getLeadingCommentRanges(code, node.getFullStart());
  const last = comments?.[comments.length - 1];
  return last !== undefined && code.slice(last.pos, last.end).includes('@internal');
}

/**
 * `code` (a bundled declaration file) without the class, interface and type-literal members whose
 * doc comment is tagged `@internal`: what `stripInternal` does to members. Top-level declarations
 * tagged `@internal` are kept (see {@link DTS_OPTIONS}).
 */
export function stripInternalMembers(code: string): string {
  if (!code.includes('@internal')) return code;
  const source = ts.createSourceFile('index.d.ts', code, ts.ScriptTarget.Latest, true);
  const cuts: { from: number; to: number }[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isClassElement(node) || ts.isTypeElement(node)) && isInternal(code, node)) {
      cuts.push({ from: node.getFullStart(), to: node.end });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  let out = code;
  for (const { from, to } of cuts.reverse()) out = out.slice(0, from) + out.slice(to);
  return out;
}

/**
 * Removes the members tagged `@internal` from the bundled declarations
 * ({@link stripInternalMembers}). Add it to every build that emits declarations.
 */
export function dtsWithoutInternalMembers() {
  return {
    name: 'holochart:dts-without-internal-members',
    generateBundle(
      _options: unknown,
      bundle: Record<string, { type: string; fileName: string; code?: string }>,
    ): void {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.fileName.endsWith('.d.ts') || !chunk.code) continue;
        chunk.code = stripInternalMembers(chunk.code);
      }
    },
  };
}

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

/** The slice of an output chunk the plugins below read (rolldown is not resolvable from here). */
interface OutputChunk {
  type: string;
  fileName: string;
  code?: string;
  moduleIds?: readonly string[];
}

/**
 * The output of {@link LibraryConfigOptions.dataModules}, shared by the production and the
 * development build.
 *
 * - `chunkFileNames`: a chunk whose entry is a data module is `<name>.js` in both builds (the
 *   other chunks keep `otherChunks`), so the two entry files import the same file.
 * - `plugin(write)`: of the chunks made only of data modules, the production build (`write`)
 *   drops the sourcemap, which would be the data a second time, and the development build drops
 *   the chunk itself, which the production build writes. Data has no descriptions to strip, so
 *   the two would be byte for byte the same.
 */
export function dataChunks(dataModules: RegExp, otherChunks: string) {
  const isData = (chunk: OutputChunk): boolean =>
    chunk.type === 'chunk' &&
    chunk.moduleIds !== undefined &&
    chunk.moduleIds.length > 0 &&
    chunk.moduleIds.every((id) => dataModules.test(id));
  return {
    chunkFileNames: (chunk: { facadeModuleId?: string | null }): string =>
      chunk.facadeModuleId && dataModules.test(chunk.facadeModuleId) ? '[name].js' : otherChunks,
    plugin: (write: boolean) => ({
      name: 'holochart:data-chunks',
      generateBundle(_options: unknown, bundle: Record<string, OutputChunk>): void {
        for (const chunk of Object.values(bundle)) {
          if (!isData(chunk)) continue;
          delete bundle[`${chunk.fileName}.map`];
          if (!write) delete bundle[chunk.fileName];
          else if (chunk.code) {
            chunk.code = chunk.code.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n');
          }
        }
      },
    }),
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
  const data = (otherChunks: string) =>
    options.dataModules ? dataChunks(options.dataModules, otherChunks) : undefined;
  const productionData = data('[name]-[hash].js');
  const production = {
    ...base,
    dts: DTS_OPTIONS,
    clean: true,
    plugins: [
      ...productionPlugins(),
      dtsWithoutInternalMembers(),
      dtsWithoutMapComment(),
      ...(productionData ? [productionData.plugin(true)] : []),
    ],
    ...(productionData ? { outputOptions: { chunkFileNames: productionData.chunkFileNames } } : {}),
  };
  if (!options.development) return [production];
  const DEVELOPMENT_CHUNKS = '[name]-[hash].development.js';
  const developmentData = data(DEVELOPMENT_CHUNKS);
  return [
    production,
    {
      ...base,
      dts: false,
      // Both builds write to dist/; tsdown cleans once for all configs before building.
      clean: false,
      outputOptions: {
        entryFileNames: '[name].development.js',
        chunkFileNames: developmentData?.chunkFileNames ?? DEVELOPMENT_CHUNKS,
      },
      ...(developmentData ? { plugins: [developmentData.plugin(false)] } : {}),
    },
  ];
}
