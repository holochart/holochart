import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';
import { libraryConfig } from '../../scripts/build/tsdown-preset.ts';

/** The slice of an output chunk {@link standalone} reads. */
interface OutputChunk {
  type: string;
  fileName: string;
  imports?: readonly string[];
  dynamicImports?: readonly string[];
}

/**
 * Fails the build when the worker file imports anything. It has to be one file: an app may copy
 * it and serve it by itself (`setGraphWorkerUrl`, for a strict Content Security Policy), and a
 * bare import of a package would not load in a worker without a bundler at all.
 */
const standalone = {
  name: 'holochart:standalone-worker',
  generateBundle(
    this: { emitFile(file: { type: 'asset'; fileName: string; source: string }): unknown },
    _options: unknown,
    bundle: Record<string, OutputChunk>,
  ): void {
    // The file is a script for `new Worker(url)`, with nothing to import: its declarations say
    // so, so that the `./layout-worker.js` export resolves to types (the package lint checks).
    this.emitFile({
      type: 'asset',
      fileName: 'layout-worker.d.ts',
      source:
        '/** The layout worker of `graph` traces: a script for `new Worker(url)`. */\nexport {};\n',
    });
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== 'chunk') continue;
      const imports = [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])];
      if (imports.length > 0) {
        throw new Error(
          `${chunk.fileName} must stand alone, but imports ${imports.join(', ')}: keep ` +
            'src/worker/handler.ts and the layouts free of package and lazy imports.',
        );
      }
    }
  },
};

const WORKER_SOURCE = "new URL('./layout-worker.ts', import.meta.url)";
const WORKER_BUILT = "new URL('./layout-worker.js', import.meta.url)";

/**
 * Points the client at the worker file as built. `src/worker/client.ts` names
 * `./layout-worker.ts`, so that a bundler which reads the sources (the docs and the sandbox, by
 * the `source` export condition) finds the file; in `dist/` the file is `layout-worker.js`. The
 * build fails when the expression is not found, so a reworded client cannot ship a dead URL.
 */
function workerUrl(): {
  name: string;
  transform(code: string, id: string): string | undefined;
  buildEnd(): void;
} {
  let rewritten = false;
  return {
    name: 'holochart:worker-url',
    transform(code, id) {
      // The client, and its copy in the lazy chunk ({@link lazyLayoutCode}).
      if (!/[\\/]src[\\/]worker[\\/]client\.ts(\?lazy)?$/.test(id)) return undefined;
      if (!code.includes(WORKER_SOURCE)) return undefined;
      rewritten = true;
      return code.replace(WORKER_SOURCE, WORKER_BUILT);
    },
    buildEnd() {
      if (!rewritten) {
        throw new Error(
          `src/worker/client.ts no longer contains ${WORKER_SOURCE}: nothing to rewrite.`,
        );
      }
    },
  };
}

/** What marks the id of a module of the lazy copy (see {@link lazyLayoutCode}). */
const LAZY = '?lazy';
/** The modules the copy is made of: the client, the handler, the protocol and the bundling. */
const LAYOUT_CODE =
  /[\\/]src[\\/](worker[\\/](client|handler|layouts|protocol)|layout[\\/]bundle[\\/][^\\/]+|graph[\\/]layout-code)\.ts$/;
/** The `import()` of `src/graph/pending.ts` (not the `typeof import(…)` next to it). */
const LAZY_IMPORT = /(?<!typeof )import\('\.\/layout-code\.ts'\)/;

/** The slice of rolldown's plugin context {@link lazyLayoutCode} uses. */
interface ResolveContext {
  resolve(
    source: string,
    importer: string | undefined,
    options: { skipSelf: boolean },
  ): Promise<{ id: string; external?: boolean | string } | null>;
}

/**
 * Builds the code the `graph` trace loads lazily as a copy of its own (backlog G7).
 *
 * The trace loads the worker's client and the bundling of links with a dynamic `import()`
 * (`src/graph/layout-code.ts`), the first time a layout runs off the main thread or links are
 * bundled. The entry also exports them: an app may call `layoutInWorker`, `setGraphWorkerUrl` or
 * `bundleLinks` itself. A module that the entry imports is in the entry's chunk, whoever else
 * imports it lazily, and an app's bundler then keeps it in its first chunk: 8 kB that most
 * charts never run (measured on `partial: core + graph`, tests/bundle/size).
 *
 * So the lazy import is pointed at copies of those modules under ids of their own (`…?lazy`),
 * which end up in a chunk the entry does not import. What the copies import in turn is shared
 * with the entry as usual: the layouts, and `src/worker/shared.ts`, which holds the one worker
 * of the page for both. An app that uses none of the entry's exports drops the entry's copy, as
 * it drops any unused code; an app that uses both pays for the client twice, about 4 kB, in two
 * chunks. The declarations are those of the sources: nothing here touches them.
 *
 * The build fails when the `import()` is not found, so a reworded source cannot ship without
 * the copy.
 */
function lazyLayoutCode(): {
  name: string;
  transform(code: string, id: string): string | undefined;
  resolveId(
    this: ResolveContext,
    source: string,
    importer: string | undefined,
  ): Promise<{ id: string } | null | undefined>;
  load(id: string): { code: string; moduleType: 'ts' } | undefined;
  buildEnd(): void;
} {
  let pointed = false;
  return {
    name: 'holochart:lazy-layout-code',
    transform(code, id) {
      if (!/[\\/]src[\\/]graph[\\/]pending\.ts$/.test(id) || !LAZY_IMPORT.test(code)) {
        return undefined;
      }
      pointed = true;
      return code.replace(LAZY_IMPORT, `import('./layout-code.ts${LAZY}')`);
    },
    async resolveId(source, importer) {
      if (source.endsWith(LAZY)) {
        const found = await this.resolve(source.slice(0, -LAZY.length), importer, {
          skipSelf: true,
        });
        return found ? { id: found.id + LAZY } : null;
      }
      if (!importer?.endsWith(LAZY)) return undefined;
      // An import of a copy: another module of the set is the copy too, anything else is shared.
      const found = await this.resolve(source, importer.slice(0, -LAZY.length), {
        skipSelf: true,
      });
      if (!found || found.external) return found as { id: string } | null;
      return LAYOUT_CODE.test(found.id) ? { id: found.id + LAZY } : { id: found.id };
    },
    load(id) {
      if (!id.endsWith(LAZY)) return undefined;
      return { code: readFileSync(id.slice(0, -LAZY.length), 'utf8'), moduleType: 'ts' };
    },
    buildEnd() {
      if (!pointed) {
        throw new Error(
          "src/graph/pending.ts no longer contains import('./layout-code.ts'): nothing to copy.",
        );
      }
    },
  };
}

/**
 * ESM + one bundled `index.d.ts` (ADR-015). `dist/index.js` has attribute-schema descriptions
 * stripped; `dist/index.development.js` keeps them (`development` export condition, ADR-020).
 * See scripts/build/tsdown-preset.ts.
 *
 * Plus the layout worker (backlog G7), `dist/layout-worker.js`: a build of its own, so that it
 * shares no chunk with the entry and is one file. `src/worker/client.ts` starts it with
 * `new Worker(new URL('./layout-worker.js', import.meta.url), { type: 'module' })` once
 * {@link workerUrl} has rewritten it, which names this file from `dist/index.js` and from
 * `dist/index.development.js` alike (the worker has no
 * descriptions, so one file serves both). Minified, because an app that hosts the file itself
 * serves it as it is.
 */
export default defineConfig([
  ...libraryConfig({ development: true }).map((config) => ({
    ...config,
    plugins: [...((config.plugins as unknown[] | undefined) ?? []), lazyLayoutCode(), workerUrl()],
  })),
  {
    entry: { 'layout-worker': 'src/worker/layout-worker.ts' },
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    sourcemap: true,
    minify: true,
    dts: false,
    // The library build above cleans dist/ once for all the configs.
    clean: false,
    plugins: [standalone],
  },
]);
