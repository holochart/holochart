/// <reference types="vite/client" />
import type { ExampleModule } from './_lib/types.ts';

/**
 * Example registry: example id → lazy loader.
 *
 * Every `.ts` file under `examples/` is an example, except the shared helpers in `_lib/` and this
 * file. The id is the path relative to `examples/` without the extension, e.g. `_dev/hello-cube`
 * or `scatter/basic`.
 *
 * Built with Vite's `import.meta.glob`, so this module only works in Vite-processed code (the dev
 * sandbox, docs, gallery). Node-side tooling (the visual test suite) enumerates the same files from
 * the filesystem with the same rules and cross-checks the result against `exampleIds` in the page.
 */
export type ExampleLoader = () => Promise<ExampleModule>;

/** Tag that excludes an example from the visual regression suite (benchmarks, interactive demos). */
export const NO_VISUAL_TEST_TAG = 'no-visual-test';

const modules = import.meta.glob<ExampleModule>([
  './**/*.ts',
  '!./_lib/**',
  '!./index.ts',
  '!./**/*.d.ts',
  '!./**/node_modules/**',
]);

/** Converts `./_dev/hello-cube.ts` to `_dev/hello-cube`. */
function exampleIdFromPath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\.ts$/, '');
}

export const examples: Readonly<Record<string, ExampleLoader>> = Object.freeze(
  Object.fromEntries(
    Object.entries(modules)
      .map(([path, load]) => [exampleIdFromPath(path), load] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  ),
);

/** All example ids, sorted. */
export const exampleIds: readonly string[] = Object.keys(examples);

/** Loads an example module by id; rejects with a descriptive error for unknown or malformed ones. */
export async function loadExample(id: string): Promise<ExampleModule> {
  const load = examples[id];
  if (!load) throw new Error(`Unknown example "${id}".`);
  const mod = await load();
  if (typeof mod.run !== 'function' || typeof mod.meta !== 'object' || mod.meta === null) {
    throw new Error(
      `Example "${id}" must export \`meta\` and \`run(el)\` (see examples/_lib/types.ts).`,
    );
  }
  return mod;
}
