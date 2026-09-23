/**
 * Static scans that feed the attribute reference: which examples use which trace types (the
 * "Used in examples" backlinks, plan E19.3) and which docs chart page documents each trace type.
 * Both read files as text; nothing is executed.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** Recursively list files under `dir` (relative, `/`-separated), skipping `node_modules`. */
async function listFiles(dir: string, rel = ''): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path.join(dir, rel), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(dir, child)));
    else out.push(child);
  }
  return out.sort();
}

/**
 * Example ids under `examplesDir`, with the same rules as `examples/index.ts`: every `.ts` file
 * except `_lib/`, `index.ts` and declaration files.
 */
export async function listExampleIds(examplesDir: string): Promise<string[]> {
  return (await listFiles(examplesDir))
    .filter(
      (f) =>
        f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.startsWith('_lib/') && f !== 'index.ts',
    )
    .map((f) => f.replace(/\.ts$/, ''));
}

const TRACE_TYPE = /\btype\s*:\s*['"]([a-z][a-z0-9]*)['"]/g;

/** Trace types referenced as `type: '<name>'` in a source text. */
export function traceTypesInSource(source: string): Set<string> {
  const out = new Set<string>();
  for (const m of source.matchAll(TRACE_TYPE)) out.add(m[1] as string);
  return out;
}

/**
 * Map each known trace type to the ids of examples that reference it.
 *
 * @param traceTypes - Registered trace types; other `type:` strings are ignored.
 */
export async function examplesByTrace(
  examplesDir: string,
  traceTypes: readonly string[],
): Promise<Record<string, string[]>> {
  const known = new Set(traceTypes);
  const out: Record<string, string[]> = {};
  for (const id of await listExampleIds(examplesDir)) {
    const source = await readFile(path.join(examplesDir, `${id}.ts`), 'utf8');
    for (const type of traceTypesInSource(source)) {
      if (known.has(type)) (out[type] ??= []).push(id);
    }
  }
  return out;
}

/** The `chart:` value in a Markdown file's YAML frontmatter, if any. */
export function chartFromFrontmatter(markdown: string): string | undefined {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!fm) return undefined;
  const m = /^chart:\s*['"]?([\w-]+)['"]?\s*$/m.exec(fm[1] as string);
  return m?.[1];
}

/**
 * Map trace types to docs chart pages by reading `chart:` frontmatter under `chartsDir`. Files
 * starting with `_` (templates) are skipped. When several pages document one trace type (the
 * scatter and line pages both use `scatter`), the page named after the type wins, else the first
 * in path order.
 *
 * @param linkPrefix - Site path of `chartsDir`, e.g. `/charts/`.
 */
export async function chartPagesByTrace(
  chartsDir: string,
  linkPrefix: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const file of await listFiles(chartsDir)) {
    const base = path.basename(file, '.md');
    if (!file.endsWith('.md') || base.startsWith('_')) continue;
    const chart = chartFromFrontmatter(await readFile(path.join(chartsDir, file), 'utf8'));
    if (chart && (!(chart in out) || base === chart)) {
      out[chart] = linkPrefix + file.replace(/(index)?\.md$/, '');
    }
  }
  return out;
}
