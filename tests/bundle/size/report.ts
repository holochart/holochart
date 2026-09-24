/**
 * Markdown bundle-size report for CI (plan E21.1): runs size-limit on the bundles from bundle.ts,
 * compares with a baseline report from `main` when one is given, and writes a table.
 *
 *   node tests/bundle/size/report.ts [--json <out.json>] [--base <main.json>] [--markdown <out.md>]
 *
 * The table is appended to `$GITHUB_STEP_SUMMARY` when set. Always exits 0: `pnpm size` is the
 * gate; this script only reports.
 *
 * "Size" is each entry's initial chunk. The "Lazy" column is the same entry's dynamically imported
 * chunks (the SDF text engine, E21.5), gzipped like size-limit does (level 9); the budgeted
 * `lazyOf` row gates them.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { MANIFEST, ROOT, SIZE_ENTRIES, lazyFile, type ManifestEntry } from './entries.ts';

/** Marker the CI workflow uses to find and update its PR comment. */
const COMMENT_MARKER = '<!-- holochart-size-report -->';

interface SizeResult {
  name: string;
  size: number;
  passed?: boolean;
  sizeLimit?: number;
  /** Gzipped size of the entry's lazy chunks (added by this script; absent when none). */
  lazy?: number;
}

const { values: args } = parseArgs({
  options: {
    json: { type: 'string' },
    base: { type: 'string' },
    markdown: { type: 'string' },
  },
});

function runSizeLimit(): SizeResult[] {
  const bin = path.join(ROOT, 'node_modules/size-limit/bin.js');
  const run = spawnSync(process.execPath, [bin, '--json'], { cwd: ROOT, encoding: 'utf8' });
  try {
    return JSON.parse(run.stdout) as SizeResult[];
  } catch {
    throw new Error(`size-limit --json failed (exit ${run.status}):\n${run.stderr}${run.stdout}`);
  }
}

function readJson<T>(file: string | undefined): T | undefined {
  if (!file || !existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

const kB = (bytes: number): string => `${(bytes / 1000).toFixed(2)} kB`;

function delta(size: number, before: number | undefined): string {
  if (before === undefined) return 'new';
  const diff = size - before;
  if (diff === 0) return '0';
  const pct = before ? ` (${diff > 0 ? '+' : ''}${((diff / before) * 100).toFixed(1)}%)` : '';
  return `${diff > 0 ? '+' : '−'}${kB(Math.abs(diff))}${pct}`;
}

/** Gzipped size of an entry's lazy chunks (bundle.ts writes them only when there are any). */
function lazySize(id: string): number | undefined {
  const file = lazyFile(id);
  return existsSync(file) ? gzipSync(readFileSync(file), { level: 9 }).length : undefined;
}

const results = runSizeLimit();
const base = readJson<SizeResult[]>(args.base);
const baseByName = new Map(base?.map((r) => [r.name, r.size]));
const manifest = new Map(readJson<ManifestEntry[]>(MANIFEST)?.map((m) => [m.id, m]));
const entryByName = new Map(SIZE_ENTRIES.map((e) => [e.name, e]));
for (const r of results) {
  const id = entryByName.get(r.name)?.id;
  const lazy = id && manifest.get(id)?.lazy ? lazySize(id) : undefined;
  if (lazy !== undefined) r.lazy = lazy;
}

const rows = results.map((r) => {
  const status = r.passed === undefined ? '' : r.passed ? '✅' : '❌ over budget';
  const entry = entryByName.get(r.name);
  const note = manifest.get(entry?.id ?? '')?.note;
  const name = note ? `${r.name} ¹` : r.name;
  // The IIFE is one file: its dynamic imports are inlined, so it has no lazy chunks by design.
  const lazy = r.lazy !== undefined ? kB(r.lazy) : entry?.file ? 'inlined' : '—';
  const cells = [name, kB(r.size), lazy, r.sizeLimit ? kB(r.sizeLimit) : '—'];
  if (base) cells.push(delta(r.size, baseByName.get(r.name)));
  cells.push(status);
  return `| ${cells.join(' | ')} |`;
});

const header = base
  ? [
      '| Entry | Size (min+gz) | Lazy (min+gz) | Budget | Δ vs main | |',
      '| --- | ---: | ---: | ---: | ---: | --- |',
    ]
  : ['| Entry | Size (min+gz) | Lazy (min+gz) | Budget | |', '| --- | ---: | ---: | ---: | --- |'];
const notes = [...manifest.values()].map((m) => m.note);
const footnotes = notes.filter(Boolean);
const lazyPackages = [...new Set([...manifest.values()].flatMap((m) => m.lazy?.packages ?? []))];
const failed = results.filter((r) => r.passed === false).length;

const markdown = [
  COMMENT_MARKER,
  '### Bundle size',
  '',
  failed
    ? `**${failed} entr${failed === 1 ? 'y is' : 'ies are'} over budget.**`
    : 'All entries are within budget.',
  '',
  ...header,
  ...rows,
  '',
  'ESM entries exclude `three` (peer dependency); the IIFE bundles it. 1 kB = 1000 bytes.',
  'Size is what loads up front (the initial chunks); Lazy is what the entry loads on demand' +
    (lazyPackages.length ? ` (${lazyPackages.join(', ')})` : '') +
    ', gated by its own row.',
  ...(base ? [] : ['', '_No baseline from `main` was available, so no deltas are shown._']),
  ...(footnotes.length ? ['', ...footnotes.map((n) => `¹ ${n}`)] : []),
  '',
].join('\n');

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  writeFileSync(file, text);
}

if (args.json) write(args.json, `${JSON.stringify(results, null, 2)}\n`);
if (args.markdown) write(args.markdown, markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
