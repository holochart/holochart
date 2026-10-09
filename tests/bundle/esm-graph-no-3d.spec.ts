import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import type { OutputChunk } from './esm-app.ts';

/**
 * A partial bundle with 2D graphs has no 3D code (backlog G6, ADR-029): `graph3d` is exported
 * from `@mk7s/holochart-traces-graph`, which therefore depends on `@mk7s/holochart-traces-3d`,
 * but it is not in `tracesGraph`. An app that registers `tracesGraph` alone gets no module of the
 * 3D package, in its initial chunk or in any lazy one (the package is `sideEffects: false`);
 * `tracesGraph3d` is what brings it. Needs the packages built (`pnpm build`).
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RUNTIME = resolve(ROOT, 'packages/runtime/dist/index.js');
const TRACES_GRAPH = resolve(ROOT, 'packages/traces-graph/dist/index.js');
const TRACES_3D = /[\\/]packages[\\/]traces-3d[\\/]/;

/** The modules of an app that registers `names` of the graph package on the runtime. */
async function modulesOf(names: string): Promise<string[]> {
  const vite = realpathSync(fileURLToPath(import.meta.resolve('vite')));
  const rolldown = (await import(pathToFileURL(createRequire(vite).resolve('rolldown')).href)) as {
    rolldown(options: Record<string, unknown>): Promise<{
      generate(options: Record<string, unknown>): Promise<{ output: OutputChunk[] }>;
      close(): Promise<void>;
    }>;
  };
  const build = await rolldown.rolldown({
    input: 'app',
    platform: 'browser',
    logLevel: 'warn',
    plugins: [
      {
        name: 'app-entry',
        resolveId: (id: string) => (id === 'app' ? id : null),
        load: (id: string) =>
          id === 'app'
            ? `import { createChart, register } from ${JSON.stringify(RUNTIME)};\n` +
              `import { ${names} } from ${JSON.stringify(TRACES_GRAPH)};\n` +
              `register(${names
                .split(', ')
                .map((n) => `...${n}`)
                .join(', ')});\nwindow.createChart = createChart;`
            : null,
      },
    ],
  });
  try {
    const { output } = await build.generate({ format: 'es', entryFileNames: 'app.js' });
    return output.filter((c) => c.type === 'chunk').flatMap((chunk) => chunk.moduleIds ?? []);
  } finally {
    await build.close();
  }
}

test('ESM: `tracesGraph` alone bundles no module of the 3D package', async () => {
  expect(existsSync(TRACES_GRAPH), `${TRACES_GRAPH}: build the packages first`).toBe(true);
  const modules = await modulesOf('tracesGraph');
  // The bundle is the real one: the runtime and the graph package.
  expect(modules.some((id) => /[\\/]packages[\\/]traces-graph[\\/]dist[\\/]/.test(id))).toBe(true);
  expect(modules.filter((id) => TRACES_3D.test(id))).toEqual([]);
});

test('ESM: `tracesGraph3d` is what adds the 3D package', async () => {
  const modules = await modulesOf('tracesGraph, tracesGraph3d');
  expect(modules.some((id) => TRACES_3D.test(id))).toBe(true);
});
