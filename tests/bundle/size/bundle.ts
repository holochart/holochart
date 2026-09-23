/**
 * Builds one minified ESM measurement bundle per entry in `entries.ts` into
 * `tests/bundle/size/dist/`, for size-limit (`.size-limit.ts`) to gzip and check. Run through
 * `pnpm size`, which builds the packages first; this script only reads their `dist/`.
 *
 *   node tests/bundle/size/bundle.ts
 *
 * Bundles with rolldown (the bundler behind tsdown and Vite 8). three is external (peer dependency,
 * ADR-003); every other dependency (d3-*, troika, earcut, flatbush, workspace packages) is bundled
 * and tree-shaken, the way an app bundler would.
 */
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  MANIFEST,
  OUT_DIR,
  ROOT,
  SIZE_ENTRIES,
  packageDist,
  type EntryImport,
  type ManifestEntry,
} from './entries.ts';

/** The slice of rolldown's API used here (rolldown is not a root dependency, so no types). */
interface Chunk {
  type: 'chunk' | 'asset';
  code?: string;
  exports?: string[];
}
interface Rolldown {
  rolldown(options: Record<string, unknown>): Promise<{
    generate(options: Record<string, unknown>): Promise<{ output: Chunk[] }>;
    close(): Promise<void>;
  }>;
}

/** Loads the rolldown that Vite (a root devDependency) depends on. */
async function loadRolldown(): Promise<Rolldown> {
  const vite = realpathSync(fileURLToPath(import.meta.resolve('vite')));
  const rolldownPath = createRequire(vite).resolve('rolldown');
  return (await import(pathToFileURL(rolldownPath).href)) as Rolldown;
}

const VIRTUAL = '\0size-entry';
const THREE = /^three($|\/)/;

async function bundle(rd: Rolldown, code: string, minify: boolean): Promise<Chunk> {
  const build = await rd.rolldown({
    input: VIRTUAL,
    platform: 'browser',
    external: THREE,
    logLevel: 'warn',
    plugins: [
      {
        name: 'size-entry',
        resolveId: (id: string) => (id === VIRTUAL ? id : null),
        load: (id: string) => (id === VIRTUAL ? code : null),
      },
    ],
  });
  try {
    const { output } = await build.generate({ format: 'es', minify });
    const chunk = output.find((c) => c.type === 'chunk');
    if (chunk?.code === undefined) throw new Error('rolldown produced no chunk');
    return chunk;
  } finally {
    await build.close();
  }
}

/** Export names of a built package entry (probe bundle, not written). */
async function exportsOf(rd: Rolldown, file: string): Promise<Set<string>> {
  const chunk = await bundle(rd, `export * from ${JSON.stringify(file)};`, false);
  return new Set(chunk.exports ?? []);
}

/**
 * Entry source for one import. Named imports are used only when all of them exist; until then
 * (e.g. `scatter` before the scatter trace lands) the whole package stands in, and a note says so.
 */
async function entryCode(rd: Rolldown, imp: EntryImport): Promise<{ code: string; note?: string }> {
  const file = packageDist(imp.pkg);
  if (!existsSync(file)) {
    throw new Error(`${path.relative(ROOT, file)} not found; build the packages first (pnpm size)`);
  }
  const spec = JSON.stringify(file);
  if (!imp.names?.length) return { code: `export * from ${spec};` };
  const available = await exportsOf(rd, file);
  const missing = imp.names.filter((n) => !available.has(n));
  if (missing.length === 0) return { code: `export { ${imp.names.join(', ')} } from ${spec};` };
  return {
    code: `export * from ${spec};`,
    note: `${imp.pkg}: ${missing.join(', ')} not exported yet; measured the whole package`,
  };
}

async function main(): Promise<void> {
  const rd = await loadRolldown();
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const manifest: ManifestEntry[] = [];
  for (const entry of SIZE_ENTRIES) {
    if (!entry.imports) {
      if (entry.file && !existsSync(path.join(ROOT, entry.file))) {
        throw new Error(`${entry.file} not found; build the packages first (pnpm size)`);
      }
      manifest.push({ id: entry.id });
      continue;
    }
    const parts = await Promise.all(entry.imports.map((imp) => entryCode(rd, imp)));
    const code = parts.map((p) => p.code).join('\n');
    const notes = parts.flatMap((p) => (p.note ? [p.note] : []));
    const chunk = await bundle(rd, code, true);
    writeFileSync(path.join(OUT_DIR, `${entry.id}.js`), chunk.code ?? '');
    manifest.push(notes.length ? { id: entry.id, note: notes.join('; ') } : { id: entry.id });
    if (notes.length) console.warn(`[size] ${entry.name}: ${notes.join('; ')}`);
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[size] ${manifest.length} entries → ${path.relative(ROOT, OUT_DIR)}/`);
}

await main();
