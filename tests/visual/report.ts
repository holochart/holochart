/**
 * Summarizes the last visual run (plan E20.9): for every compared example, the pixelmatch count
 * that the test gates on next to the exact diff (pixels whose RGBA differs at all, and the largest
 * channel delta), which shows drift hidden inside the tolerance.
 *
 *   node tests/visual/report.ts            print Markdown (also appended to $GITHUB_STEP_SUMMARY)
 *
 * Run after `pnpm test:visual`; it reads the records the spec wrote and never fails the build.
 */
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DIFF_REPORT_DIR, type DiffRecord } from './report-data.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const dir = path.join(ROOT, DIFF_REPORT_DIR);

const records: DiffRecord[] = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as DiffRecord)
  : [];
records.sort((a, b) => b.exactPixels - a.exactPixels || a.id.localeCompare(b.id));

const pct = (x: number): string => `${(x * 100).toFixed(4)}%`;
const exactMatch = records.filter((r) => r.exactPixels === 0).length;
const failed = records.filter((r) => !r.pass).length;

const lines = [
  '### Visual diff (pixelmatch vs exact)',
  '',
  records.length
    ? `${records.length} examples compared: ${exactMatch} bit-exact, ` +
      `${records.length - exactMatch - failed} within tolerance, ${failed} failed.`
    : '_No diff records found (did `pnpm test:visual` run?)._',
  '',
];
const drifted = records.filter((r) => r.exactPixels > 0);
if (drifted.length) {
  lines.push(
    '| Example | pixelmatch px | ratio | tolerance | exact px | max Δ | |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...drifted.map(
      (r) =>
        `| \`${r.id}\` | ${r.diffPixels} | ${pct(r.ratio)} | ${pct(r.tolerance)} | ` +
        `${r.exactPixels} | ${r.maxDelta} | ${r.pass ? '✅' : '❌'} |`,
    ),
    '',
    'Exact counts are informational: tests gate on pixelmatch only (ADR-018). Non-zero exact ' +
      'diffs mean a baseline is no longer bit-exact (plan E20.9).',
    '',
  );
}

const markdown = lines.join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
