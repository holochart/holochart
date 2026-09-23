/**
 * Summarizes `release-artifacts/publish-plan.json` (written by `changeset pack`) for the release
 * workflow: sets the `count` and `version` step outputs and writes the plan to the job summary.
 * Unreleased `0.0.0` placeholders are removed from the plan file, so `changeset publish
 * --from-pack-dir` never publishes them.
 *
 *   node .github/scripts/publish-plan.ts [release-artifacts/publish-plan.json]
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

interface Release {
  kind: 'publish' | 'tag-only';
  name: string;
  version: string;
  tag: string;
}

const file = process.argv[2] ?? 'release-artifacts/publish-plan.json';
const data = JSON.parse(readFileSync(file, 'utf8')) as { version: number; plan: Release[][] };
const isPlaceholder = (r: Release): boolean => r.version === '0.0.0';
const all = data.plan.flat().filter((r) => r.kind === 'publish');
const releases = all.filter((r) => !isPlaceholder(r));
if (releases.length !== all.length) {
  const plan = data.plan.map((group) => group.filter((r) => !isPlaceholder(r)));
  writeFileSync(file, JSON.stringify({ ...data, plan: plan.filter((g) => g.length) }, null, 2));
}
const versions = [...new Set(releases.map((r) => r.version))];

const lines = releases.map((r) => `- ${r.name}@${r.version} (${r.tag})`);
if (releases.length !== all.length) {
  lines.push(`- skipped ${all.length - releases.length} unreleased 0.0.0 package(s)`);
}
const summary = `### Publish plan\n\n${releases.length ? '' : 'Nothing to publish.\n'}${lines.join('\n')}\n`;
console.log(summary);

const { GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env;
if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, summary);
if (GITHUB_OUTPUT) {
  // `version` is set only when every package shares one version (the fixed group).
  const version = versions.length === 1 ? versions[0] : '';
  appendFileSync(GITHUB_OUTPUT, `count=${releases.length}\nversion=${version}\n`);
}
