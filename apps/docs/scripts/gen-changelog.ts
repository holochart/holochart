/**
 * Generates the body of the changelog page (`changelog.md`, backlog S2.11) from Changesets' own
 * files, so the page never has to be typed:
 *
 * - **Unreleased:** the pending changesets, `.changeset/*.md`. `changeset version` consumes them
 *   (in pre mode it moves them to `.changeset/pre/`, which is not read here).
 * - **Released versions:** the `CHANGELOG.md` that `changeset version` writes into every package.
 *   A changeset's text only lands in the changelogs of the packages it names
 *   (docs/release/releasing.md), so the files of all packages are merged: one entry per text, with
 *   the packages that carry it.
 *
 * Output: `.vitepress/generated/changelog.md` (gitignored), which `changelog.md` pulls in with a
 * VitePress `@include`. Runs before `dev` and `build` as part of `pnpm run gen`.
 *
 * Usage: `node scripts/gen-changelog.ts`.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const DOCS_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = path.resolve(DOCS_ROOT, '../..');
const CHANGESET_DIR = path.join(REPO_ROOT, '.changeset');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const OUT_FILE = path.join(DOCS_ROOT, '.vitepress/generated/changelog.md');

export type BumpType = 'major' | 'minor' | 'patch';
const BUMP_ORDER: readonly BumpType[] = ['major', 'minor', 'patch'];
const BUMP_HEADINGS: Readonly<Record<BumpType, string>> = {
  major: 'Major changes',
  minor: 'Minor changes',
  patch: 'Patch changes',
};

/** Files in `.changeset/` that are not changesets (same list as `@changesets/read`). */
const NOT_CHANGESETS = new Set(['readme.md', 'agents.md', 'claude.md', 'gemini.md']);

/** One changeset file. */
export interface Changeset {
  /** File name without `.md`. */
  id: string;
  releases: { name: string; type: BumpType }[];
  summary: string;
}

/** One line of the changelog: a change, its bump type and the packages it names. */
export interface Entry {
  type: BumpType;
  summary: string;
  packages: string[];
}

export interface Release {
  version: string;
  entries: Entry[];
}

function isBumpType(value: string): value is BumpType {
  return (BUMP_ORDER as readonly string[]).includes(value);
}

function higher(a: BumpType, b: BumpType): BumpType {
  return BUMP_ORDER.indexOf(a) <= BUMP_ORDER.indexOf(b) ? a : b;
}

/**
 * Parse a changeset file: `---`, one `'package': bump` line per package, `---`, then the summary.
 * Returns `undefined` for a file without frontmatter, and for an empty changeset (no package,
 * which Changesets allows for changes that release nothing).
 */
export function parseChangeset(id: string, source: string): Changeset | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/.exec(source);
  if (!m) return undefined;
  const releases: Changeset['releases'] = [];
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    const r = /^\s*(['"]?)([^'"]+?)\1\s*:\s*(\w+)\s*$/.exec(line);
    if (r && isBumpType(r[3] as string)) {
      releases.push({ name: r[2] as string, type: r[3] as BumpType });
    }
  }
  const summary = (m[2] ?? '').trim();
  if (releases.length === 0 || summary === '') return undefined;
  return { id, releases, summary };
}

/**
 * Pending changesets as entries. The packages are one fixed version group, so a changeset bumps
 * the release by the highest type it names.
 */
export function pendingEntries(changesets: readonly Changeset[]): Entry[] {
  return changesets.map((c) => ({
    type: c.releases.map((r) => r.type).reduce(higher),
    summary: c.summary,
    packages: c.releases.map((r) => r.name).sort(),
  }));
}

/**
 * Entries of one package's `CHANGELOG.md`, as written by `@changesets/changelog-git`:
 * `## <version>`, `### Minor Changes`, then `- [<commit>: ]<first line>` with the rest of the
 * summary indented by two spaces. "Updated dependencies" lines are dropped.
 */
export function parseChangelog(
  source: string,
): { version: string; entry: Omit<Entry, 'packages'> }[] {
  const out: { version: string; entry: Omit<Entry, 'packages'> }[] = [];
  let version: string | undefined;
  let type: BumpType | undefined;
  let item: string[] | undefined;
  const flush = (): void => {
    if (item && version && type) {
      const summary = item
        .join('\n')
        .replace(/^[0-9a-f]{7}: /, '')
        .trim();
      if (summary !== '' && !/^Updated dependencies\b/.test(summary)) {
        out.push({ version, entry: { type, summary } });
      }
    }
    item = undefined;
  };
  for (const line of source.split(/\r?\n/)) {
    const v = /^## (\S+)\s*$/.exec(line);
    const t = /^### (Major|Minor|Patch) Changes\s*$/.exec(line);
    if (v) {
      flush();
      version = v[1];
      type = undefined;
    } else if (t) {
      flush();
      type = (t[1] as string).toLowerCase() as BumpType;
    } else if (/^- /.test(line)) {
      flush();
      item = [line.slice(2)];
    } else if (item) {
      // Continuation lines are indented by two spaces; blank lines stay blank.
      if (line === '' || line.startsWith('  ')) item.push(line.slice(2));
      else flush();
    }
  }
  flush();
  return out;
}

/** `[major, minor, patch, prerelease parts…]`, or `undefined` when not a version. */
function parseVersion(version: string): { core: number[]; pre: (string | number)[] } | undefined {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!m) return undefined;
  const pre = (m[4] ?? '').split('.').filter((p) => p !== '');
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: pre.map((p) => (/^\d+$/.test(p) ? Number(p) : p)),
  };
}

/** Semver precedence, newest first. Strings that are not versions sort last, by name. */
export function compareVersionsDesc(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return va ? -1 : vb ? 1 : a.localeCompare(b);
  for (let i = 0; i < 3; i++) {
    const d = (vb.core[i] as number) - (va.core[i] as number);
    if (d !== 0) return d;
  }
  // A version without a prerelease tag is newer than the same version with one.
  if (va.pre.length === 0 || vb.pre.length === 0) return va.pre.length - vb.pre.length;
  for (let i = 0; i < Math.max(va.pre.length, vb.pre.length); i++) {
    const pa = va.pre[i];
    const pb = vb.pre[i];
    if (pa === undefined) return 1;
    if (pb === undefined) return -1;
    if (pa === pb) continue;
    if (typeof pa === 'number' && typeof pb === 'number') return pb - pa;
    if (typeof pa === 'number') return 1;
    if (typeof pb === 'number') return -1;
    return pb.localeCompare(pa);
  }
  return 0;
}

/** Merge the changelogs of all packages into releases, newest first. */
export function mergeChangelogs(changelogs: ReadonlyMap<string, string>): Release[] {
  const byVersion = new Map<string, Map<string, Entry>>();
  for (const [name, source] of changelogs) {
    for (const { version, entry } of parseChangelog(source)) {
      let entries = byVersion.get(version);
      if (!entries) byVersion.set(version, (entries = new Map()));
      const known = entries.get(entry.summary);
      if (known) {
        known.type = higher(known.type, entry.type);
        if (!known.packages.includes(name)) known.packages.push(name);
      } else {
        entries.set(entry.summary, { ...entry, packages: [name] });
      }
    }
  }
  return [...byVersion.entries()]
    .sort(([a], [b]) => compareVersionsDesc(a, b))
    .map(([version, entries]) => ({
      version,
      entries: [...entries.values()].map((e) => ({ ...e, packages: [...e.packages].sort() })),
    }));
}

function renderPackages(packages: readonly string[], allPackages: readonly string[]): string {
  if (allPackages.length > 0 && allPackages.every((p) => packages.includes(p))) {
    return 'all packages';
  }
  return packages.map((p) => `\`${p}\``).join(', ');
}

/** Entries grouped by bump type; in a group, the changes that name the most packages come first. */
function renderEntries(entries: readonly Entry[], allPackages: readonly string[]): string[] {
  const lines: string[] = [];
  for (const type of BUMP_ORDER) {
    const group = entries
      .filter((e) => e.type === type)
      .sort((a, b) => b.packages.length - a.packages.length || a.summary.localeCompare(b.summary));
    if (group.length === 0) continue;
    lines.push(`### ${BUMP_HEADINGS[type]}`, '');
    for (const e of group) {
      const [first = '', ...rest] = e.summary.split(/\r?\n/).map((l) => l.trimEnd());
      lines.push(`- ${first}`);
      for (const l of rest) lines.push(l === '' ? '' : `  ${l}`);
      lines.push('', `  Packages: ${renderPackages(e.packages, allPackages)}.`, '');
    }
  }
  return lines;
}

export interface ChangelogInput {
  pending: readonly Entry[];
  releases: readonly Release[];
  /** The packages of the fixed version group. */
  allPackages: readonly string[];
  /** Changesets' prerelease tag (`.changeset/pre.json`), when in pre mode. */
  preTag?: string;
}

/** The generated part of the changelog page, as Markdown. */
export function renderChangelog(input: ChangelogInput): string {
  const { pending, releases, allPackages, preTag } = input;
  const lines: string[] = [];
  if (releases.length === 0) {
    lines.push(
      pending.length > 0
        ? 'No version has been published yet. The changes under "Unreleased" ship in the first release.'
        : 'No version has been published yet.',
      '',
    );
  }
  if (pending.length > 0) {
    lines.push('## Unreleased', '');
    lines.push(
      `Merged, but not in a published version yet${
        preTag
          ? `. The next release is a prerelease, published under the \`${preTag}\` npm dist-tag.`
          : '.'
      }`,
      '',
    );
    lines.push(...renderEntries(pending, allPackages));
  }
  for (const release of releases) {
    lines.push(`## ${release.version}`, '', ...renderEntries(release.entries, allPackages));
  }
  return lines.join('\n');
}

async function readPendingChangesets(dir: string): Promise<Changeset[]> {
  if (!existsSync(dir)) return [];
  const out: Changeset[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith('.md') || e.name.startsWith('.')) continue;
    if (NOT_CHANGESETS.has(e.name.toLowerCase())) continue;
    const changeset = parseChangeset(
      e.name.replace(/\.md$/, ''),
      await readFile(path.join(dir, e.name), 'utf8'),
    );
    if (changeset) out.push(changeset);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function readPackageChangelogs(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const manifest = path.join(dir, e.name, 'package.json');
    const changelog = path.join(dir, e.name, 'CHANGELOG.md');
    if (!e.isDirectory() || !existsSync(manifest) || !existsSync(changelog)) continue;
    const { name } = JSON.parse(await readFile(manifest, 'utf8')) as { name: string };
    out.set(name, await readFile(changelog, 'utf8'));
  }
  return out;
}

async function readJson<T>(file: string): Promise<T | undefined> {
  if (!existsSync(file)) return undefined;
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function main(): Promise<void> {
  const changesets = await readPendingChangesets(CHANGESET_DIR);
  const releases = mergeChangelogs(await readPackageChangelogs(PACKAGES_DIR));
  const config = await readJson<{ fixed?: string[][] }>(path.join(CHANGESET_DIR, 'config.json'));
  const pre = await readJson<{ mode?: string; tag?: string }>(path.join(CHANGESET_DIR, 'pre.json'));
  const body = renderChangelog({
    pending: pendingEntries(changesets),
    releases,
    allPackages: config?.fixed?.[0] ?? [],
    ...(pre?.mode === 'pre' && pre.tag ? { preTag: pre.tag } : {}),
  });
  // `v-pre`: a changeset may contain `{{`, which Vue would otherwise read as an expression.
  const page = [
    '<!-- Generated by apps/docs/scripts/gen-changelog.ts from .changeset/ and packages/*/CHANGELOG.md. Do not edit. -->',
    '',
    '<div v-pre>',
    '',
    body.trim(),
    '',
    '</div>',
    '',
  ].join('\n');
  const prettierConfig = await prettier.resolveConfig(OUT_FILE);
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, await prettier.format(page, { ...prettierConfig, filepath: OUT_FILE }));
  console.log(
    `Changelog → ${path.relative(REPO_ROOT, OUT_FILE)}: ${changesets.length} unreleased ` +
      `changesets, ${releases.length} released versions.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await main();
