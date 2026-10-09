import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { bundleAppChunks, GRAPH_ENTRY, type OutputChunk } from './esm-app.ts';

/**
 * The full bundle has no graph code (ADR-029): an app that imports `@mk7s/holochart` and draws no
 * network graph gets no module of `@mk7s/holochart-traces-graph`, in its initial chunk or in any
 * lazy one. Graphs come with one more import, `@mk7s/holochart/graph` (`dist/graph.js`), which
 * the second test bundles to show that the check sees them when they are there. The package has
 * no dependencies of its own to look for. Needs the packages built (`pnpm build`).
 */

/** The graph package, built or from sources. */
const TRACES_GRAPH = /[\\/]packages[\\/]traces-graph[\\/]/;

const modulesOf = (chunks: readonly OutputChunk[]): string[] =>
  chunks.flatMap((chunk) => chunk.moduleIds ?? []);

test('ESM: the full bundle contains no module of the graph package', async () => {
  const modules = modulesOf(await bundleAppChunks());
  // The bundle is the real one: the full build's entry and the packages it registers.
  expect(modules.some((id) => /[\\/]packages[\\/]holochart[\\/]dist[\\/]index\.js$/.test(id))).toBe(
    true,
  );
  expect(modules.some((id) => /[\\/]packages[\\/]traces-3d[\\/]dist[\\/]/.test(id))).toBe(true);
  expect(modules.filter((id) => TRACES_GRAPH.test(id))).toEqual([]);
});

test('ESM: `@mk7s/holochart/graph` is what adds the graph package', async () => {
  expect(existsSync(GRAPH_ENTRY), `${GRAPH_ENTRY}: build @mk7s/holochart first`).toBe(true);
  const modules = modulesOf(await bundleAppChunks([GRAPH_ENTRY]));
  expect(modules.filter((id) => TRACES_GRAPH.test(id))).not.toEqual([]);
});
