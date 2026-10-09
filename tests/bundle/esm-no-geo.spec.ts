import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { bundleAppChunks, GEO_ENTRY, type OutputChunk } from './esm-app.ts';

/**
 * The full bundle has no geographic code (ADR-026): an app that imports `@mk7s/holochart` and
 * draws no map gets no module of `@mk7s/holochart-traces-geo` and none of its dependencies, in
 * its initial chunk or in any lazy one. Maps come with one more import, `@mk7s/holochart/geo`
 * (`dist/geo.js`), which the second test bundles to show that the check sees them when they are
 * there. Needs the packages built (`pnpm build`).
 */

/** The geo package (built or from sources) and the dependencies only it has. */
const GEO_MODULE =
  /[\\/]packages[\\/]traces-geo[\\/]|[\\/]node_modules[\\/](?:d3-geo|d3-geo-projection|topojson-client)[\\/]/;
const TRACES_GEO = /[\\/]packages[\\/]traces-geo[\\/]/;
const D3_GEO = /[\\/]node_modules[\\/]d3-geo[\\/]/;

const modulesOf = (chunks: readonly OutputChunk[]): string[] =>
  chunks.flatMap((chunk) => chunk.moduleIds ?? []);

test('ESM: the full bundle contains no module of the geo package', async () => {
  const chunks = await bundleAppChunks();
  const modules = modulesOf(chunks);
  // The bundle is the real one: the full build's entry and the packages it registers.
  expect(modules.some((id) => /[\\/]packages[\\/]holochart[\\/]dist[\\/]index\.js$/.test(id))).toBe(
    true,
  );
  expect(modules.some((id) => /[\\/]packages[\\/]traces-3d[\\/]dist[\\/]/.test(id))).toBe(true);
  expect(modules.filter((id) => GEO_MODULE.test(id))).toEqual([]);
  // Nor a chunk named after one (the basemap data, the extra projections).
  expect(
    chunks
      .map((chunk) => chunk.fileName)
      .filter((name) => /^(?:base|extras|projections)-/.test(name)),
  ).toEqual([]);
});

test('ESM: `@mk7s/holochart/geo` is what adds the geo package', async () => {
  expect(existsSync(GEO_ENTRY), `${GEO_ENTRY}: build @mk7s/holochart first`).toBe(true);
  const modules = modulesOf(await bundleAppChunks([GEO_ENTRY]));
  expect(modules.filter((id) => TRACES_GEO.test(id))).not.toEqual([]);
  // Its projections are d3-geo's, in the package's initial code.
  expect(modules.filter((id) => D3_GEO.test(id))).not.toEqual([]);
});
