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
 *
 * Code splitting is on, like in an app: dynamic `import()`s (the SDF text engine, plan E21.5)
 * become separate chunks. `<id>.js` holds the entry's **initial** chunks (the entry chunk and every
 * chunk it imports statically), what a page downloads before it runs; `<id>.lazy.js` holds all
 * other chunks, loaded on demand. Every output chunk lands in exactly one of the two files, so no
 * code drops out of the numbers; the manifest lists what the lazy chunks contain.
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
  lazyFile,
  type EntryImport,
  type ManifestEntry,
} from './entries.ts';

/** The slice of rolldown's API used here (rolldown is not a root dependency, so no types). */
interface Chunk {
  type: 'chunk' | 'asset';
  fileName: string;
  code?: string;
  exports?: string[];
  isEntry?: boolean;
  /** Chunks this one imports statically. */
  imports?: string[];
  moduleIds?: string[];
}
interface Rolldown {
  rolldown(options: Record<string, unknown>): Promise<{
    generate(options: Record<string, unknown>): Promise<{ output: Chunk[] }>;
    close(): Promise<void>;
  }>;
}

/** One entry's output, split into what loads up front and what loads on demand. */
interface Split {
  initial: Chunk[];
  lazy: Chunk[];
}

/** Loads the rolldown that Vite (a root devDependency) depends on. */
async function loadRolldown(): Promise<Rolldown> {
  const vite = realpathSync(fileURLToPath(import.meta.resolve('vite')));
  const rolldownPath = createRequire(vite).resolve('rolldown');
  return (await import(pathToFileURL(rolldownPath).href)) as Rolldown;
}

const VIRTUAL = '\0size-entry';
const THREE = /^three($|\/)/;

async function bundle(rd: Rolldown, code: string, minify: boolean): Promise<Split> {
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
    return split(output.filter((c) => c.type === 'chunk'));
  } finally {
    await build.close();
  }
}

/** Initial = the entry chunk plus its static-import closure; lazy = every other chunk. */
function split(chunks: Chunk[]): Split {
  const entry = chunks.find((c) => c.isEntry);
  if (entry?.code === undefined) throw new Error('rolldown produced no entry chunk');
  const byName = new Map(chunks.map((c) => [c.fileName, c]));
  const initial = new Set<Chunk>();
  const visit = (chunk: Chunk): void => {
    if (initial.has(chunk)) return;
    initial.add(chunk);
    for (const name of chunk.imports ?? []) {
      const dep = byName.get(name);
      if (dep) visit(dep);
    }
  };
  visit(entry);
  return { initial: [...initial], lazy: chunks.filter((c) => !initial.has(c)) };
}

const code = (chunks: readonly Chunk[]): string => chunks.map((c) => c.code ?? '').join('\n');

/** npm packages (or workspace package dirs) whose modules a chunk contains, for the report. */
function packagesIn(chunks: readonly Chunk[]): string[] {
  const names = new Set<string>();
  for (const id of chunks.flatMap((c) => c.moduleIds ?? [])) {
    const nm = /node_modules\/((?:@[^/]+\/)?[^/]+)\/(?!.*node_modules\/)/.exec(id);
    const ws = /\/packages\/([^/]+)\/dist\//.exec(id);
    if (nm?.[1]) names.add(nm[1]);
    else if (ws?.[1]) names.add(`@mk7s/holochart-${ws[1]}`);
  }
  return [...names].sort();
}

/** Export names of a built package entry (probe bundle, not written). */
async function exportsOf(rd: Rolldown, file: string): Promise<Set<string>> {
  const { initial } = await bundle(rd, `export * from ${JSON.stringify(file)};`, false);
  return new Set(initial[0]?.exports ?? []);
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
    if (entry.lazyOf) continue; // measured from another entry's lazy chunks (see below)
    if (!entry.imports) {
      if (entry.file && !existsSync(path.join(ROOT, entry.file))) {
        throw new Error(`${entry.file} not found; build the packages first (pnpm size)`);
      }
      manifest.push({ id: entry.id });
      continue;
    }
    const parts = await Promise.all(entry.imports.map((imp) => entryCode(rd, imp)));
    const source = parts.map((p) => p.code).join('\n');
    const notes = parts.flatMap((p) => (p.note ? [p.note] : []));
    const { initial, lazy } = await bundle(rd, source, true);
    writeFileSync(path.join(OUT_DIR, `${entry.id}.js`), code(initial));
    const item: ManifestEntry = { id: entry.id };
    if (notes.length) item.note = notes.join('; ');
    if (lazy.length) {
      writeFileSync(lazyFile(entry.id), code(lazy));
      item.lazy = { chunks: lazy.length, packages: packagesIn(lazy) };
    }
    manifest.push(item);
    if (notes.length) console.warn(`[size] ${entry.name}: ${notes.join('; ')}`);
  }
  // A lazy row measures another entry's lazy chunks: fail loudly rather than measure nothing.
  for (const entry of SIZE_ENTRIES) {
    if (entry.lazyOf && !manifest.some((m) => m.id === entry.lazyOf && m.lazy)) {
      throw new Error(`${entry.name}: entry "${entry.lazyOf}" produced no lazy chunks`);
    }
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[size] ${manifest.length} entries → ${path.relative(ROOT, OUT_DIR)}/`);
}

await main();
