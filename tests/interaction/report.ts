/**
 * Summarizes an interaction run (plan E20.4) for the CI job summary: the totals, every failed test,
 * and every flaky test (failed, then passed on its retry) with the error of its failed attempt. CI
 * retries each test once (tests/interaction/playwright.config.ts): a flake does not fail the job,
 * but it is listed here so it gets looked at.
 *
 *   node tests/interaction/report.ts [report.json]    default: playwright-report/interaction.json
 *
 * Prints Markdown (also appended to $GITHUB_STEP_SUMMARY) and writes `failed=<n>` and
 * `flaky=<n>` to $GITHUB_OUTPUT. Run after `pnpm test:interaction`; it never fails the build.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The parts of Playwright's JSON report read here. */
interface JsonError {
  message?: string;
}
interface JsonResult {
  status: string;
  retry: number;
  duration: number;
  error?: JsonError;
  errors?: JsonError[];
}
interface JsonTest {
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  results: JsonResult[];
}
interface JsonSpec {
  title: string;
  file: string;
  line: number;
  tests: JsonTest[];
}
interface JsonSuite {
  title: string;
  specs?: JsonSpec[];
  suites?: JsonSuite[];
}
interface JsonReport {
  suites?: JsonSuite[];
  stats?: { duration?: number };
  config?: { rootDir?: string; shard?: { current: number; total: number } | null };
}

interface Row {
  title: string;
  where: string;
  test: JsonTest;
}

const ROOT = path.resolve(import.meta.dirname, '../..');
const file = path.resolve(ROOT, process.argv[2] ?? 'playwright-report/interaction.json');

// eslint-disable-next-line no-control-regex -- ANSI color codes in Playwright's error messages
const ANSI = /\u001b\[[0-9;]*m/g;

function firstLine(error: JsonError | undefined): string {
  const text = (error?.message ?? '').replace(ANSI, '').trim();
  const line = text.split('\n').find((l) => l.trim() !== '') ?? '(no message)';
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

function collect(suite: JsonSuite, titles: string[], rootDir: string, out: Row[]): void {
  const here = suite.title && !suite.title.endsWith('.ts') ? [...titles, suite.title] : titles;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      out.push({
        title: [...here, spec.title].join(' › '),
        where: `${path.relative(ROOT, path.resolve(rootDir, spec.file))}:${spec.line}`,
        test,
      });
    }
  }
  for (const child of suite.suites ?? []) collect(child, here, rootDir, out);
}

const cell = (s: string): string => s.replace(/\|/g, '\\|');

const lines: string[] = [];
let failed = 0;
let flaky = 0;
if (!existsSync(file)) {
  lines.push(
    '### Interaction tests',
    '',
    `_No report at \`${path.relative(ROOT, file)}\` (did \`pnpm test:interaction\` run?)._`,
    '',
  );
} else {
  const report = JSON.parse(readFileSync(file, 'utf8')) as JsonReport;
  const rows: Row[] = [];
  const rootDir = report.config?.rootDir ?? path.join(ROOT, 'tests/interaction');
  for (const suite of report.suites ?? []) collect(suite, [], rootDir, rows);
  const by = (status: JsonTest['status']) => rows.filter((r) => r.test.status === status);
  const failures = by('unexpected');
  const flakes = by('flaky');
  failed = failures.length;
  flaky = flakes.length;
  const shard = report.config?.shard;
  const minutes = ((report.stats?.duration ?? 0) / 60_000).toFixed(1);
  lines.push(
    `### Interaction tests${shard ? ` (shard ${shard.current}/${shard.total})` : ''}`,
    '',
    `${rows.length} tests in ${minutes} min: ${by('expected').length} passed, ` +
      `${flaky} flaky (passed on retry), ${failed} failed, ${by('skipped').length} skipped.`,
    '',
  );
  const table = (title: string, list: Row[], note: string) => {
    if (!list.length) return;
    lines.push(
      `#### ${title}`,
      '',
      note,
      '',
      '| Test | Where | First failed attempt |',
      '| --- | --- | --- |',
      ...list.map((r) => {
        const attempt = r.test.results.find((a) => a.status !== 'passed' && a.status !== 'skipped');
        const error = attempt?.error ?? attempt?.errors?.[0];
        return `| ${cell(r.title)} | \`${r.where}\` | ${cell(firstLine(error))} |`;
      }),
      '',
    );
  };
  table('Failed', failures, 'Failed on every attempt. Traces are in the uploaded report.');
  table(
    'Flaky',
    flakes,
    'Failed, then passed on the retry: not blocking, but a flake to fix (traces are in the ' +
      'uploaded report).',
  );
}

const markdown = lines.join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `failed=${failed}\nflaky=${flaky}\n`);
}
console.log(markdown);
