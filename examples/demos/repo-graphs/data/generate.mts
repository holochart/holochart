/**
 * Writes the data of the "This repository as graphs" demo from the repository itself: nothing is
 * downloaded. Run it from anywhere in the repo, with Node 22 or newer:
 *
 *   node examples/demos/repo-graphs/data/generate.mts
 *   pnpm exec prettier --write "examples/demos/repo-graphs/data/*.json"
 *
 * It reads three things and writes one JSON file for each (see SOURCES.md next to this file):
 *
 * - `packages.json`: every workspace package (`packages/*`, `tools/*`, `apps/*` and `examples`,
 *   as `pnpm-workspace.yaml` lists them) and which of the others its `package.json` depends on.
 * - `imports.json`: every source module of every package under `packages/` (tests and fixtures
 *   left out) and every import between them, read with the TypeScript parser.
 * - `commits.json`: the commits reachable from `HEAD`, oldest first by commit time with no commit
 *   before its parents (`git log --date-order`): short hash, parents, time and subject line. No author names or e-mail addresses.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const OUT = import.meta.dirname;
/** At most this many commits, newest first. */
const MAX_COMMITS = 400;

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

const subdirs = (dir: string): string[] =>
  readdirSync(path.join(ROOT, dir))
    .filter((name) => statSync(path.join(ROOT, dir, name)).isDirectory())
    .sort()
    .map((name) => `${dir}/${name}`);

/* ---------------------------------------------------------------------------------------------- */
/* Workspace packages                                                                             */
/* ---------------------------------------------------------------------------------------------- */

type Kind = 'package' | 'tool' | 'app';

interface Workspace {
  name: string;
  dir: string;
  kind: Kind;
  description: string;
  manifest: Record<string, unknown>;
}

function workspaces(): Workspace[] {
  const dirs: [string, Kind][] = [
    ...subdirs('packages').map((d): [string, Kind] => [d, 'package']),
    ...subdirs('tools').map((d): [string, Kind] => [d, 'tool']),
    ...subdirs('apps').map((d): [string, Kind] => [d, 'app']),
    ['examples', 'app'],
  ];
  const out: Workspace[] = [];
  for (const [dir, kind] of dirs) {
    const file = path.join(ROOT, dir, 'package.json');
    if (!existsSync(file)) continue;
    const manifest = readJson(file);
    out.push({
      name: String(manifest['name']),
      dir,
      kind,
      description: String(manifest['description'] ?? ''),
      manifest,
    });
  }
  return out;
}

/** Workspace dependencies: `[dependent, dependency, field]`, as indices into the packages. */
function dependencies(all: readonly Workspace[]): [number, number, string][] {
  const index = new Map(all.map((w, i) => [w.name, i]));
  const out: [number, number, string][] = [];
  all.forEach((w, from) => {
    const seen = new Set<number>();
    for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) {
      const deps = (w.manifest[field] ?? {}) as Record<string, string>;
      for (const name of Object.keys(deps).sort()) {
        const to = index.get(name);
        if (to === undefined || seen.has(to)) continue;
        seen.add(to);
        out.push([from, to, field]);
      }
    }
  });
  return out;
}

/* ---------------------------------------------------------------------------------------------- */
/* Module imports                                                                                 */
/* ---------------------------------------------------------------------------------------------- */

/** Test files, fixtures and snapshots are not part of what a package ships. */
const SKIP_DIR = new Set(['__testing__', '__fixtures__', '__snapshots__', 'node_modules']);
const isSource = (name: string): boolean =>
  name.endsWith('.ts') && !/\.(test|test-d|spec|d)\.ts$/.test(name);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) out.push(...sourceFiles(full));
    } else if (isSource(entry.name)) {
      out.push(full);
    }
  }
  return out.sort();
}

/** How a module names another: `0` an import of values, `1` of types only, `2` an `import()`. */
type ImportKind = 0 | 1 | 2;

/** Module specifiers of a source file, with their kind. */
function specifiers(file: string): [string, ImportKind][] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    false,
  );
  const out: [string, ImportKind][] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push([node.moduleSpecifier.text, node.importClause?.isTypeOnly ? 1 : 0]);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push([node.moduleSpecifier.text, node.isTypeOnly ? 1 : 0]);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      out.push([node.arguments[0].text, 2]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

interface ImportData {
  /** Directory names under `packages/`. */
  packages: string[];
  /** `[package, path under its src/, lines]`. */
  modules: [number, string, number][];
  /** `[importing module, imported module, kind]`; one entry per pair, the strongest kind. */
  imports: [number, number, ImportKind][];
}

function imports(all: readonly Workspace[]): ImportData {
  const packages = all.filter((w) => w.kind === 'package');
  const modules: [number, string, number][] = [];
  const files: string[] = [];
  const byFile = new Map<string, number>();
  packages.forEach((w, p) => {
    const src = path.join(ROOT, w.dir, 'src');
    for (const file of sourceFiles(src)) {
      byFile.set(file, files.length);
      files.push(file);
      const lines = readFileSync(file, 'utf8').split('\n').length;
      modules.push([p, path.relative(src, file).split(path.sep).join('/'), lines]);
    }
  });

  /** `@mk7s/holochart-core` and `@mk7s/holochart/graph` to the source file their `exports` name. */
  const entries = new Map<string, string>();
  for (const w of packages) {
    const exports = (w.manifest['exports'] ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(exports)) {
      const source = (value as { source?: unknown } | null)?.source;
      if (typeof source !== 'string') continue;
      entries.set(path.posix.join(w.name, key), path.join(ROOT, w.dir, source));
    }
  }

  // Value imports win over type imports, and both over dynamic ones, when a pair has several.
  const rank: Record<ImportKind, number> = { 0: 2, 1: 1, 2: 0 };
  const pairs = new Map<string, [number, number, ImportKind]>();
  files.forEach((file, from) => {
    for (const [spec, kind] of specifiers(file)) {
      const target = spec.startsWith('.')
        ? path.resolve(path.dirname(file), spec)
        : entries.get(spec);
      const to = target === undefined ? undefined : byFile.get(target);
      if (to === undefined || to === from) continue;
      const key = `${from}>${to}`;
      const known = pairs.get(key);
      if (!known || rank[kind] > rank[known[2]]) pairs.set(key, [from, to, kind]);
    }
  });
  return {
    packages: packages.map((w) => path.basename(w.dir)),
    modules,
    imports: [...pairs.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* Commits                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

/** `[short hash, parents as indices (-1: older than the window), unix time, subject]`. */
type Commit = [string, number[], number, string];

function commits(): Commit[] {
  const SEP = '\u001f';
  const rows = git(
    'log',
    '--date-order',
    `--format=%H${SEP}%P${SEP}%ct${SEP}%s`,
    '-n',
    String(MAX_COMMITS),
    'HEAD',
  )
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split(SEP) as [string, string, string, string])
    .reverse();
  const index = new Map(rows.map((r, i) => [r[0], i]));
  return rows.map(([hash, parents, time, subject]) => [
    hash.slice(0, 7),
    parents
      .split(' ')
      .filter((p) => p.length > 0)
      .map((p) => index.get(p) ?? -1),
    Number(time),
    subject,
  ]);
}

/* ---------------------------------------------------------------------------------------------- */

function write(name: string, data: unknown): void {
  writeFileSync(path.join(OUT, name), `${JSON.stringify(data)}\n`);
}

const all = workspaces();
const head = git('rev-parse', '--short=7', 'HEAD').trim();
const importData = imports(all);
const perPackage = importData.packages.map(
  (_, p) => importData.modules.filter((m) => m[0] === p).length,
);
const commitData = commits();

write('packages.json', {
  head,
  packages: all.map((w) => ({
    name: w.name,
    dir: w.dir,
    kind: w.kind,
    description: w.description,
    modules:
      w.kind === 'package' ? perPackage[importData.packages.indexOf(path.basename(w.dir))] : 0,
  })),
  dependencies: dependencies(all),
});
write('imports.json', { head, ...importData });
write('commits.json', { head, commits: commitData });

console.log(
  `repo-graphs data at ${head}: ${all.length} workspace packages, ` +
    `${importData.modules.length} modules, ${importData.imports.length} imports, ` +
    `${commitData.length} commits.`,
);
