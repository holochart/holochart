/**
 * Docs page lint (plan E19.4), run in CI: `pnpm --filter @mk7s/holochart-docs lint:pages`.
 *
 * Every page:
 * - has frontmatter with `title` and `status: stub | draft | complete`; stubs name a `milestone`.
 * - only embeds examples that exist (`<Example id="…" />` → `examples/<id>.ts`).
 *
 * Chart pages (`charts/<family>/<chart>.md`):
 * - name the trace type they document in `chart:`.
 * - when `status: complete`: have every required H2 section of `charts/_template.md` in order
 *   ("3D-native options" is optional), at least 5 example embeds with at least 4 under
 *   "Variations", and link to the attribute reference `/reference/<chart>`.
 *   Draft and stub chart pages only get warnings for these, so work in progress can merge.
 *
 * Exits with 1 on errors. `--strict` turns warnings into errors. `--root <dir>` lints another docs
 * directory (used to test the linter itself).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const DOCS_ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXAMPLES_DIR = path.resolve(DOCS_ROOT, '../../examples');

/** H2 sections of a chart page, in order (plan E19.4). */
export const CHART_SECTIONS = [
  'Overview',
  'Minimal example',
  'Data format',
  'Variations',
  'Styling',
  'Interactivity',
  '3D-native options',
  'Performance notes',
  'Accessibility notes',
  'Attribute reference',
  'Related charts',
  'Plotly migration notes',
] as const;
export const OPTIONAL_SECTIONS: ReadonlySet<string> = new Set(['3D-native options']);
export const MIN_EXAMPLES = 5;
export const MIN_VARIATIONS = 4;

const STATUSES = new Set(['stub', 'draft', 'complete']);
/** Generated or non-page directories that are not linted. */
const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'public', 'scripts']);
const SKIP_PATHS = ['reference/api/', 'reference/attributes/'];

export interface Finding {
  file: string;
  level: 'error' | 'warning';
  message: string;
}

export interface Page {
  /** Path relative to the docs root, `/`-separated. */
  file: string;
  frontmatter: Record<string, string>;
  /** Body with frontmatter, fenced code blocks and HTML comments removed. */
  body: string;
}

/** Parse flat `key: value` YAML frontmatter (all our pages need). */
export function parsePage(file: string, source: string): Page {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  const frontmatter: Record<string, string> = {};
  for (const line of (fm?.[1] ?? '').split(/\r?\n/)) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (m) frontmatter[m[1] as string] = (m[2] as string).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  const body = source
    .slice(fm ? fm[0].length : 0)
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return { file, frontmatter, body };
}

/** Example ids embedded with `<Example id="…" />`. */
export function exampleIds(body: string): string[] {
  return [...body.matchAll(/<Example\b[^>]*?\bid=(["'])(.+?)\1/g)].map((m) => m[2] as string);
}

/** H2 sections as `[title, content]`, in order. */
export function sections(body: string): [string, string][] {
  const parts = body.split(/^##\s+(.+?)\s*#*\s*$/m);
  const out: [string, string][] = [];
  for (let i = 1; i < parts.length; i += 2) out.push([parts[i] as string, parts[i + 1] ?? '']);
  return out;
}

export function isChartPage(file: string): boolean {
  return /^charts\/.+\.md$/.test(file) && !/(^|\/)(index|_[^/]*)\.md$/.test(file);
}

/** Lint one page. `knownExamples` is the set of existing example ids. */
export function lintPage(page: Page, knownExamples: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = [];
  const add = (level: Finding['level'], message: string): void => {
    findings.push({ file: page.file, level, message });
  };
  const fm = page.frontmatter;
  const status = fm['status'];
  const isTemplate = path.basename(page.file).startsWith('_');

  if (!fm['title']) add('error', 'frontmatter is missing `title`.');
  if (!status || !STATUSES.has(status)) {
    add('error', 'frontmatter `status` must be `stub`, `draft` or `complete`.');
  }
  if (status === 'stub' && !/^M\d+$/.test(fm['milestone'] ?? '')) {
    add('error', 'stub pages need `milestone: M<n>` (the milestone in which content lands).');
  }

  const ids = exampleIds(page.body);
  for (const id of ids) {
    if (!knownExamples.has(id)) add('error', `<Example id="${id}"> does not exist in examples/.`);
  }

  if (!isChartPage(page.file) && !(isTemplate && page.file.startsWith('charts/'))) {
    return findings;
  }

  if (!fm['chart']) add('error', 'chart pages need `chart: <trace type>` in frontmatter.');
  // Structural rules are errors for complete pages and for the template itself (so the template
  // and this linter can't drift apart); drafts only get warnings.
  const level: Finding['level'] = status === 'complete' || isTemplate ? 'error' : 'warning';

  const found = sections(page.body);
  const titles = found.map(([t]) => t);
  const required = CHART_SECTIONS.filter((s) => !OPTIONAL_SECTIONS.has(s));
  const missing = required.filter((s) => !titles.includes(s));
  if (missing.length > 0) add(level, `missing sections: ${missing.join(', ')}.`);
  const order = titles.filter((t) => (CHART_SECTIONS as readonly string[]).includes(t));
  const expected = CHART_SECTIONS.filter((s) => order.includes(s));
  if (order.join('|') !== expected.join('|')) {
    add(level, `sections are out of order; expected: ${expected.join(' → ')}.`);
  }
  const unknown = titles.filter((t) => !(CHART_SECTIONS as readonly string[]).includes(t));
  if (unknown.length > 0) {
    add('warning', `extra H2 sections (use H3 inside a template section): ${unknown.join(', ')}.`);
  }

  if (isTemplate) return findings;

  if (ids.length < MIN_EXAMPLES) {
    add(level, `has ${ids.length} example embeds; chart pages need at least ${MIN_EXAMPLES}.`);
  }
  const variations = found.find(([t]) => t === 'Variations')?.[1] ?? '';
  const variationCount = exampleIds(variations).length;
  if (variationCount < MIN_VARIATIONS) {
    add(level, `"Variations" has ${variationCount} examples; it needs at least ${MIN_VARIATIONS}.`);
  }
  const refSection = found.find(([t]) => t === 'Attribute reference')?.[1] ?? '';
  if (fm['chart'] && !refSection.includes(`/reference/${fm['chart']}`)) {
    add(level, `"Attribute reference" must link to /reference/${fm['chart']}.`);
  }
  return findings;
}

async function listFiles(root: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(root, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      if (SKIP_PATHS.some((p) => `${child}/`.startsWith(p))) continue;
      out.push(...(await listFiles(root, child)));
    } else {
      out.push(child);
    }
  }
  return out.sort();
}

/** Example ids with the rules of `examples/index.ts`. */
async function knownExampleIds(dir: string): Promise<Set<string>> {
  const files = await listFiles(dir);
  return new Set(
    files
      .filter(
        (f) =>
          f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.startsWith('_lib/') && f !== 'index.ts',
      )
      .map((f) => f.replace(/\.ts$/, '')),
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { root: { type: 'string' }, strict: { type: 'boolean', default: false } },
  });
  const root = values.root ? path.resolve(values.root) : DOCS_ROOT;
  const known = await knownExampleIds(EXAMPLES_DIR);
  const files = (await listFiles(root)).filter((f) => f.endsWith('.md') && f !== 'README.md');

  const findings: Finding[] = [];
  const counts: Record<string, number> = {};
  let chartPages = 0;
  for (const file of files) {
    const page = parsePage(file, await readFile(path.join(root, file), 'utf8'));
    const status = page.frontmatter['status'] ?? 'unknown';
    counts[status] = (counts[status] ?? 0) + 1;
    if (isChartPage(file)) chartPages++;
    findings.push(...lintPage(page, known));
  }

  const strict = values.strict === true;
  for (const f of findings) {
    const level = strict ? 'error' : f.level;
    console.log(`${level === 'error' ? 'error' : 'warn '}  ${f.file}: ${f.message}`);
  }
  const errors = findings.filter((f) => strict || f.level === 'error').length;
  const summary = Object.entries(counts)
    .map(([s, n]) => `${n} ${s}`)
    .join(', ');
  console.log(
    `\n${files.length} pages (${summary}); ${chartPages} chart pages; ` +
      `${errors} errors, ${findings.length - errors} warnings.`,
  );
  if (errors > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
