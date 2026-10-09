/** Export canonical examples with local helpers/data/assets inlined and public packages external. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build, type Rollup } from 'vite';
import type { LegacyGalleryEntry } from './manifest.ts';

export interface StandaloneArtifact {
  source: string;
  javascript: string;
  dependencies: string[];
  inputs: string[];
  hash: string;
  /** Generation/compile evidence is separate from the canonical example's browser baseline. */
  verification: 'compiled' | 'rendered';
  browserEvidence?: { hash: string; runner: string; checkedAt: string };
  notes: string[];
}
export interface StandaloneIndex {
  version: 1;
  examples: Record<string, StandaloneArtifact>;
  failures: Record<string, string>;
}

const packageName = (id: string): string =>
  id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0]!;

export async function bundleStandalone(
  entry: LegacyGalleryEntry,
  root: string,
): Promise<{ code: string; artifact: StandaloneArtifact }> {
  const inputs = new Set<string>();
  const result = await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'holochart-source-inputs',
        load(id) {
          if (path.isAbsolute(id.split('?')[0]!) && existsSync(id.split('?')[0]!))
            inputs.add(path.relative(root, id.split('?')[0]!).split(path.sep).join('/'));
          return null;
        },
      },
    ],
    build: {
      write: false,
      target: 'es2022',
      minify: false,
      sourcemap: false,
      lib: {
        entry: path.join(root, `examples/${entry.id}.ts`),
        formats: ['es'],
        fileName: 'example',
      },
      rollupOptions: {
        external: (id) => !id.startsWith('.') && !path.isAbsolute(id) && !id.startsWith('\0'),
        output: { inlineDynamicImports: true },
      },
    },
  });
  const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput;
  const chunk = output.output.find((item): item is Rollup.OutputChunk => item.type === 'chunk');
  if (!chunk) throw new Error('No source output produced.');
  if (output.output.some((item) => item.type === 'asset'))
    throw new Error('Source needs separate assets; use the repository example.');
  const dependencies = [
    ...new Set([...chunk.imports, ...chunk.dynamicImports].map(packageName)),
  ].sort();
  const code = `/**
 * ${entry.title.replace(/\*\//g, '* /')}
 * ${entry.description.replace(/\*\//g, '* /')}
 *
 * Save as src/main.ts (or main.js) in a Vite browser app with these public dependencies:
 * ${dependencies.join(', ')}
 * Holochart is currently installed from the source workspace; see the installation guide.
 * All example-private helpers, data fixtures and local assets are included in this file.
 * Canonical source: examples/${entry.id}.ts
 */
${chunk.code}
// Mount into your page. A fixed height is required; width adapts to its container.
const container = document.createElement('div');
container.id = 'holochart-example';
container.style.cssText = 'width: 100%; max-width: ${entry.size.width}px; height: ${entry.size.height}px; margin: 0 auto;';
document.body.append(container);
const example = run(container);
await example.ready;
// Dispose GPU resources when the page closes. Call cleanup() earlier when removing the chart.
function cleanup() { example.dispose(); container.remove(); }
window.addEventListener('pagehide', cleanup, { once: true });
export { cleanup };
`;
  const artifact: StandaloneArtifact = {
    source: `gallery/sources/${entry.id}.js`,
    javascript: `gallery/sources/${entry.id}.js`,
    dependencies,
    inputs: [...inputs].sort(),
    hash: createHash('sha256').update(code).digest('hex'),
    verification: 'compiled',
    notes: [
      'Uses a browser application with WebGL2 and public workspace packages.',
      'Local helpers and fixtures are bundled. Public packages stay as imports.',
      ...(code.includes('fetch(')
        ? [
            'Some example data is fetched at runtime; inspect network requirements before running offline.',
          ]
        : []),
    ],
  };
  return { code, artifact };
}

export function writeStandalone(
  result: { code: string; artifact: StandaloneArtifact },
  publicDir: string,
): void {
  for (const rel of new Set([result.artifact.source, result.artifact.javascript])) {
    const file = path.join(publicDir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, result.code);
  }
}

/** Hash source inputs for incremental generation; never use a stale bundle after a helper edit. */
export function inputsHash(inputs: readonly string[], root: string): string {
  const hash = createHash('sha256');
  // Wrapper/bundler changes invalidate cached exports just like canonical source edits.
  hash.update(readFileSync(new URL('./standalone.ts', import.meta.url)));
  for (const input of [...inputs].sort())
    hash.update(input).update(readFileSync(path.join(root, input)));
  return hash.digest('hex');
}
