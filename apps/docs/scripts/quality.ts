/**
 * Docs quality gates (plan E19.10), run in CI: `pnpm --filter @mk7s/holochart-docs quality`.
 * Offline and static: nothing is fetched, no example is executed.
 *
 * Hard gates (exit 1 when they fail):
 * 1. Every leaf attribute of the trace/layout/config schema has a description.
 * 3. Every released trace type (named by `chart:` of a `status: complete` chart page) has at least
 *    5 examples.
 * 4. Every ```ts / ```typescript block of the hand-written pages type-checks
 *    (opt out with `<!-- docs-gates: no-typecheck -->` just before the fence).
 * 5. Internal Markdown links resolve to a page.
 *
 * Report only: attribute usage in examples (target ≥ 70%), draft chart pages' example counts,
 * container descriptions, link anchors, external links per host, and spelling (common
 * misspellings and doubled words; full dictionary spell checking is deferred).
 *
 * Options: `--json <file>` writes the numbers as JSON. When `GITHUB_STEP_SUMMARY` is set, a
 * Markdown summary is appended to it.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isChartPage } from './lint-pages.ts';
import {
  attributeUsage,
  examplesPerTrace,
  scanExamples,
  type Coverage,
  type TraceExamples,
  type UsageReport,
} from './quality/examples.ts';
import { checkLinks, type LinkReport } from './quality/links.ts';
import { codeBlocks, frontmatter, listDocsPages } from './quality/markdown.ts';
import { checkDescriptions, loadNamespaces, type DescriptionReport } from './quality/schema.ts';
import { checkSnippets, TS_LANGS, type Snippet, type SnippetReport } from './quality/snippets.ts';
import { checkSpelling, parseDictionary, type SpellingFinding } from './quality/spelling.ts';

const DOCS_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = path.resolve(DOCS_ROOT, '../..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples');
const CACHE_DIR = path.join(DOCS_ROOT, 'node_modules/.cache/docs-gates');
const DICTIONARY = fileURLToPath(new URL('quality/dictionary.txt', import.meta.url));

/** Released trace types need this many examples. */
export const MIN_TRACE_EXAMPLES = 5;
/** Target share of attributes used in at least one example (report only). */
export const USAGE_TARGET = 0.7;

/** Everything the gates measured. */
export interface QualityReport {
  descriptions: DescriptionReport;
  usage: UsageReport;
  traces: TraceExamples[];
  snippets: SnippetReport;
  links: LinkReport;
  spelling: SpellingFinding[];
  /** Non-fatal problems (packages that failed to import, …). */
  warnings: string[];
}

/** One hard gate's outcome. */
export interface GateResult {
  name: string;
  ok: boolean;
  summary: string;
}

export function pct(used: number, total: number): string {
  return total === 0 ? 'n/a' : `${((100 * used) / total).toFixed(1)}%`;
}

function cov(c: Coverage): string {
  return `${pct(c.used, c.total)} (${c.used}/${c.total})`;
}

/** Evaluate the hard gates of a report. */
export function hardGates(r: QualityReport): GateResult[] {
  const released = r.traces.filter((t) => t.status === 'released');
  const short = released.filter((t) => t.examples.length < MIN_TRACE_EXAMPLES);
  return [
    {
      name: 'Attribute descriptions',
      ok: r.descriptions.missing.length === 0,
      summary: `${pct(r.descriptions.described, r.descriptions.attributes)} of ${r.descriptions.attributes} attributes described`,
    },
    {
      name: `Released trace types with ≥ ${MIN_TRACE_EXAMPLES} examples`,
      ok: short.length === 0,
      summary: `${released.length - short.length}/${released.length} (${released.map((t) => `${t.type}: ${t.examples.length}`).join(', ')})`,
    },
    {
      name: 'Snippet type-check',
      ok: r.snippets.errors.length === 0,
      summary: `${r.snippets.checked} checked, ${r.snippets.optedOut.length} opted out, ${r.snippets.errors.length} errors`,
    },
    {
      name: 'Internal links',
      ok: r.links.dead.length === 0,
      summary: `${r.links.internal} checked, ${r.links.dead.length} dead, ${r.links.skipped.length} skipped`,
    },
  ];
}

/** Run every gate. */
export async function runQuality(): Promise<QualityReport> {
  const { namespaces, warnings } = await loadNamespaces(REPO_ROOT);
  const traceTypes = namespaces.filter((n) => n.kind === 'trace').map((n) => n.name);

  const scans = await scanExamples(EXAMPLES_DIR, traceTypes);
  const usage = attributeUsage(
    namespaces,
    scans.flatMap((s) => s.keyPaths),
  );

  const files = await listDocsPages(DOCS_ROOT);
  const sources = new Map<string, string>();
  for (const f of files) sources.set(f, await readFile(path.join(DOCS_ROOT, f), 'utf8'));

  const chartPages: { file: string; chart: string; status: string }[] = [];
  const snippets: Snippet[] = [];
  const sitePages = new Map<string, string>();
  const allowed = parseDictionary(await readFile(DICTIONARY, 'utf8'));
  const spelling: SpellingFinding[] = [];
  for (const [file, source] of sources) {
    const fm = frontmatter(source);
    if (isChartPage(file) && fm['chart']) {
      chartPages.push({ file, chart: fm['chart'], status: fm['status'] ?? '' });
    }
    for (const block of codeBlocks(source)) {
      if (TS_LANGS.has(block.lang)) snippets.push({ page: file, block });
    }
    // `_*.md` files (templates) are excluded from the site (srcExclude), so their links never ship.
    if (!path.basename(file).startsWith('_')) sitePages.set(file, source);
    spelling.push(...checkSpelling(file, source, allowed));
  }

  return {
    descriptions: checkDescriptions(namespaces),
    usage,
    traces: examplesPerTrace(scans, chartPages),
    snippets: await checkSnippets(snippets, { repoRoot: REPO_ROOT, cacheDir: CACHE_DIR }),
    links: checkLinks(DOCS_ROOT, sitePages),
    spelling,
    warnings,
  };
}

function list(items: readonly string[], limit = Infinity): string[] {
  const shown = items.slice(0, limit).map((i) => `    - ${i}`);
  if (items.length > limit) shown.push(`    … and ${items.length - limit} more`);
  return shown;
}

/** Human-readable report. */
export function formatReport(r: QualityReport, gates: readonly GateResult[]): string {
  const out: string[] = ['Docs quality gates (plan E19.10)', ''];
  const mark = (ok: boolean): string => (ok ? 'PASS' : 'FAIL');
  const [g1, g3, g4, g5] = gates as [GateResult, GateResult, GateResult, GateResult];

  out.push(`1. [${mark(g1.ok)}] Attribute descriptions (hard, 100%): ${g1.summary}`);
  out.push(...list(r.descriptions.missing));
  const cm = r.descriptions.containersMissing;
  out.push(
    `   Containers (object/items, report only): ${r.descriptions.containers - cm.length}/${r.descriptions.containers} described`,
    ...list(cm),
  );

  const u = r.usage;
  const onTarget = u.overall.total > 0 && u.overall.used / u.overall.total >= USAGE_TARGET;
  out.push(
    '',
    `2. [${onTarget ? 'ok' : 'below target'}] Attributes used in examples (report only, target ≥ ${USAGE_TARGET * 100}%): ${cov(u.overall)}`,
    ...u.namespaces.map((n) => `    - ${n.name}: ${cov(n)}`),
    '   Least covered groups:',
    ...[...u.groups]
      .sort((a, b) => a.used / a.total - b.used / b.total || b.total - a.total)
      .slice(0, 10)
      .map((g) => `    - ${g.name}: ${cov(g)}`),
  );

  out.push(
    '',
    `3. [${mark(g3.ok)}] Trace types with ≥ ${MIN_TRACE_EXAMPLES} examples (hard for released types)`,
  );
  for (const t of r.traces) {
    const flag =
      t.examples.length >= MIN_TRACE_EXAMPLES ? 'ok' : t.status === 'released' ? 'FAIL' : 'warn';
    const canonical = t.examples.filter((id) => !id.startsWith('_')).length;
    out.push(
      `    - ${t.type} (${t.status}; ${t.pages.join(', ')}): ${t.examples.length} examples, ${canonical} outside _dev/_spikes [${flag}]`,
    );
  }

  out.push(
    '',
    `4. [${mark(g4.ok)}] Snippet type-check (hard): ${g4.summary} of ${r.snippets.total} ts blocks`,
  );
  out.push(...r.snippets.errors.map((e) => `    - ${e.location}: ${e.message}`));
  if (r.snippets.optedOut.length > 0) {
    out.push('   Opted out (<!-- docs-gates: no-typecheck -->):', ...list(r.snippets.optedOut));
  }

  const l = r.links;
  out.push('', `5. [${mark(g5.ok)}] Internal links (hard): ${g5.summary}`);
  out.push(...list(l.dead));
  if (l.skipped.length > 0) out.push('   Skipped:', ...list(l.skipped, 5));
  out.push(`   Anchors not found (report only): ${l.badAnchors.length}`, ...list(l.badAnchors, 20));
  const hosts = Object.entries(l.hosts).sort((a, b) => b[1] - a[1]);
  out.push(
    `   External links (report only, not fetched): ${l.external} to ${hosts.length} hosts`,
    ...hosts.map(([h, n]) => `    - ${h}: ${n}`),
  );
  out.push('   Dead internal links also fail `vitepress build` (no ignoreDeadLinks).');

  out.push(
    '',
    `6. Spelling (report only): ${r.spelling.length} findings`,
    '   Common misspellings and doubled words only; full dictionary spell checking is deferred.',
    ...r.spelling.map((s) => `    - ${s.location}: ${s.message}`),
  );

  if (r.warnings.length > 0) out.push('', 'Warnings:', ...list(r.warnings));
  const failed = gates.filter((g) => !g.ok);
  out.push(
    '',
    failed.length === 0
      ? 'All hard gates pass.'
      : `Hard gates failing: ${failed.map((g) => g.name).join('; ')}.`,
  );
  return out.join('\n');
}

/** Short Markdown summary for `GITHUB_STEP_SUMMARY`. */
export function formatSummary(r: QualityReport, gates: readonly GateResult[]): string {
  const rows = gates.map((g) => `| ${g.ok ? '✅' : '❌'} | ${g.name} | ${g.summary} |`);
  return [
    '## Docs quality gates',
    '',
    '| | Hard gate | Result |',
    '| --- | --- | --- |',
    ...rows,
    '',
    `Report only: attributes used in examples **${cov(r.usage.overall)}** (target ≥ ${USAGE_TARGET * 100}%), ` +
      `${r.links.badAnchors.length} unknown anchors, ${r.links.external} external links, ` +
      `${r.spelling.length} spelling findings (misspelling list + doubled words; full spell check deferred).`,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { json: { type: 'string' } } });
  const started = performance.now();
  const report = await runQuality();
  const gates = hardGates(report);
  console.log(formatReport(report, gates));
  console.log(`\nDone in ${((performance.now() - started) / 1000).toFixed(1)} s.`);

  if (values.json) {
    const file = path.resolve(values.json);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ gates, ...report }, null, 2)}\n`);
  }
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary) await appendFile(summary, formatSummary(report, gates));
  if (gates.some((g) => !g.ok)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
