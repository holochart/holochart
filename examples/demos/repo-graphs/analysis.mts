/**
 * Shared data and analysis for the "This repository as graphs" demo (docs page
 * `demos/repo-graphs`): the workspace packages of this monorepo and their dependencies, the
 * source modules of its packages and their imports, its commits, and the stages of the rendering
 * pipeline, with the numbers the article quotes.
 *
 * The three JSON files under `data/` are written from the repository by `data/generate.mts`
 * (`node examples/demos/repo-graphs/data/generate.mts`); nothing is downloaded. Everything else
 * is computed here, with the measures of the graph package (`degrees`, `connectedComponents`,
 * `louvain`, `modularity`) where it has one.
 *
 * Pure and DOM-free, so the docs page can import it during server-side rendering. A `.mts` file
 * on purpose: the example registry treats every `.ts` file under `examples/` as an example.
 */
import { connectedComponents, degrees, louvain, modularity } from '@mk7s/holochart/graph';
import commitsJson from './data/commits.json';
import importsJson from './data/imports.json';
import packagesJson from './data/packages.json';

/** The commit the data was read at. The working tree it was read from may have been ahead. */
export const HEAD: string = packagesJson.head;

/** A graph as the traces take it: labels, and links as node indices. */
export interface Network {
  label: string[];
  source: number[];
  target: number[];
}

/* ---------------------------------------------------------------------------------------------- */
/* Workspace packages                                                                             */
/* ---------------------------------------------------------------------------------------------- */

export type Kind = 'package' | 'tool' | 'app';

export interface Workspace {
  /** The npm name, `@mk7s/holochart-core`. */
  name: string;
  /** The name without the scope and the prefix: `core`, `traces-basic`; `holochart` for the bundle. */
  short: string;
  dir: string;
  kind: Kind;
  description: string;
  /** Source modules under `src/` (packages only). */
  modules: number;
}

/** What the clusters of the dependency diagram are called. */
export const KIND_LABEL: Readonly<Record<Kind, string>> = {
  package: 'Packages',
  tool: 'Tools',
  app: 'Apps and examples',
};

/** Every workspace package: `packages/*`, `tools/*`, `apps/*` and `examples`. */
export const WORKSPACES: readonly Workspace[] = packagesJson.packages.map((p) => ({
  ...p,
  kind: p.kind as Kind,
  short: p.name === '@mk7s/holochart' ? 'holochart' : p.name.replace('@mk7s/holochart-', ''),
}));

/** Workspace dependencies, from the dependent to what it depends on. */
export const DEPENDENCIES: readonly (readonly [number, number])[] = packagesJson.dependencies.map(
  (d) => [d[0] as number, d[1] as number],
);

/** Successors of every node of a graph of `n` nodes. */
function successors(n: number, links: readonly (readonly [number, number])[]): number[][] {
  const out: number[][] = Array.from({ length: n }, () => []);
  for (const [s, t] of links) out[s]!.push(t);
  return out;
}

/** For every node of a DAG, the nodes it reaches (itself not included). */
function reach(n: number, links: readonly (readonly [number, number])[]): Set<number>[] {
  const next = successors(n, links);
  const memo: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(n).fill(undefined);
  const visit = (i: number): Set<number> => {
    const known = memo[i];
    if (known) return known;
    const set = new Set<number>();
    memo[i] = set;
    for (const j of next[i]!) {
      set.add(j);
      for (const k of visit(j)) set.add(k);
    }
    return set;
  };
  return Array.from({ length: n }, (_, i) => visit(i));
}

/**
 * The dependencies no other dependency implies (the transitive reduction): `a → c` is left out
 * when `a` depends on some `b` that depends on `c`, directly or not. What is left is the least
 * that has to be drawn for every dependency to be a path in the diagram.
 */
export const DIRECT_DEPENDENCIES: readonly (readonly [number, number])[] = (() => {
  const reached = reach(WORKSPACES.length, DEPENDENCIES);
  const next = successors(WORKSPACES.length, DEPENDENCIES);
  return DEPENDENCIES.filter(([s, t]) => !next[s]!.some((b) => b !== t && reached[b]!.has(t)));
})();

/** The longest chain of dependencies, from the dependent at the top to the package at the bottom. */
export function longestChain(): number[] {
  const next = successors(WORKSPACES.length, DEPENDENCIES);
  const memo = new Map<number, number[]>();
  const visit = (i: number): number[] => {
    const known = memo.get(i);
    if (known) return known;
    let best: number[] = [];
    for (const j of next[i]!) {
      const chain = visit(j);
      if (chain.length > best.length) best = chain;
    }
    const out = [i, ...best];
    memo.set(i, out);
    return out;
  };
  let best: number[] = [];
  for (let i = 0; i < WORKSPACES.length; i++) {
    const chain = visit(i);
    if (chain.length > best.length) best = chain;
  }
  return best;
}

/** How many workspace packages depend on each one, directly and through others. */
export function dependents(): { direct: number[]; all: number[] } {
  const direct = WORKSPACES.map(() => 0);
  const all = WORKSPACES.map(() => 0);
  for (const [, t] of DEPENDENCIES) direct[t]!++;
  for (const set of reach(WORKSPACES.length, DEPENDENCIES)) for (const t of set) all[t]!++;
  return { direct, all };
}

/**
 * The workspace packages from the bottom of the dependency graph up: by the length of the longest
 * chain of dependencies below each (0 for a package that depends on no other), then as listed. In
 * this order every dependency of a package comes before it.
 */
export function dependencyOrder(): { order: number[]; depth: number[] } {
  const next = successors(WORKSPACES.length, DEPENDENCIES);
  const depth = new Array<number>(WORKSPACES.length).fill(-1);
  const visit = (i: number): number => {
    if (depth[i]! >= 0) return depth[i]!;
    depth[i] = 0;
    for (const j of next[i]!) depth[i] = Math.max(depth[i]!, visit(j) + 1);
    return depth[i]!;
  };
  WORKSPACES.forEach((_, i) => visit(i));
  const order = WORKSPACES.map((_, i) => i).sort((a, b) => depth[a]! - depth[b]! || a - b);
  return { order, depth };
}

/** The package dependency graph, declared or reduced to its direct links. */
export function packageGraph(direct = false): Network & { group: string[] } {
  const links = direct ? DIRECT_DEPENDENCIES : DEPENDENCIES;
  return {
    label: WORKSPACES.map((w) => w.short),
    group: WORKSPACES.map((w) => KIND_LABEL[w.kind]),
    source: links.map((d) => d[0]),
    target: links.map((d) => d[1]),
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* Modules and imports                                                                            */
/* ---------------------------------------------------------------------------------------------- */

/** How a module names another: a value import, a type-only import or a dynamic `import()`. */
export type ImportKind = 'value' | 'type' | 'dynamic';
const IMPORT_KINDS: readonly ImportKind[] = ['value', 'type', 'dynamic'];

export interface Module {
  /** Index into {@link PACKAGE_DIRS}. */
  pkg: number;
  /** Path under the package's `src/`: `fx/hover.ts`. */
  path: string;
  /** The first directory of the path; `src` for a module at the top. */
  dir: string;
  lines: number;
}

/** The directories under `packages/`, in the order the modules are grouped by. */
export const PACKAGE_DIRS: readonly string[] = importsJson.packages;

/** Every source module of every package (tests and fixtures left out). */
export const MODULES: readonly Module[] = importsJson.modules.map((m) => {
  const file = m[1] as string;
  const slash = file.indexOf('/');
  return {
    pkg: m[0] as number,
    path: file,
    dir: slash < 0 ? 'src' : file.slice(0, slash),
    lines: m[2] as number,
  };
});

/** Every import between two of the modules: `[importing, imported, kind]`. */
export const IMPORTS: readonly (readonly [number, number, ImportKind])[] = importsJson.imports.map(
  (e) => [e[0] as number, e[1] as number, IMPORT_KINDS[e[2] as number] as ImportKind],
);

/** `core/schema/types.ts`: a module's package and path. */
export function moduleName(i: number): string {
  const m = MODULES[i]!;
  return `${PACKAGE_DIRS[m.pkg]!}/${m.path}`;
}

/** A graph of modules, with what the charts color and size them by. */
export interface ModuleGraph extends Network {
  /** Index into {@link MODULES} of every node. */
  module: number[];
  /** The directory of every node (within one package), or its package (across packages). */
  group: string[];
  /** How many of the graph's modules import each node, and how many each node imports. */
  indegree: number[];
  outdegree: number[];
}

function moduleGraph(
  keep: (m: Module) => boolean,
  group: (m: Module) => string,
  label: (m: Module) => string,
): ModuleGraph {
  const module: number[] = [];
  const at = new Map<number, number>();
  MODULES.forEach((m, i) => {
    if (!keep(m)) return;
    at.set(i, module.length);
    module.push(i);
  });
  const source: number[] = [];
  const target: number[] = [];
  for (const [from, to] of IMPORTS) {
    const s = at.get(from);
    const t = at.get(to);
    if (s === undefined || t === undefined) continue;
    source.push(s);
    target.push(t);
  }
  const net = { label: module.map((i) => label(MODULES[i]!)), source, target };
  const d = degrees({ node: { label: net.label }, link: net });
  return {
    ...net,
    module,
    group: module.map((i) => group(MODULES[i]!)),
    indegree: [...d.indegree],
    outdegree: [...d.outdegree],
  };
}

/** The modules of one package (`'runtime'`, `'traces-graph'`, …) and the imports among them. */
export function packageModules(dir: string): ModuleGraph {
  const pkg = PACKAGE_DIRS.indexOf(dir);
  if (pkg < 0) throw new Error(`repo-graphs: no package "${dir}"`);
  return moduleGraph(
    (m) => m.pkg === pkg,
    (m) => m.dir,
    (m) => m.path.replace(/\.ts$/, ''),
  );
}

/** The modules of several packages (all of them by default), grouped by package. */
export function repoModules(dirs: readonly string[] = PACKAGE_DIRS): ModuleGraph {
  const keep = new Set(dirs.map((d) => PACKAGE_DIRS.indexOf(d)));
  return moduleGraph(
    (m) => keep.has(m.pkg),
    (m) => PACKAGE_DIRS[m.pkg]!,
    (m) => `${PACKAGE_DIRS[m.pkg]!}/${m.path.replace(/\.ts$/, '')}`,
  );
}

/** The node of a module graph with the most importers. */
export function mostImported(graph: ModuleGraph): { label: string; importers: number } {
  let best = 0;
  graph.indegree.forEach((v, i) => {
    if (v > graph.indegree[best]!) best = i;
  });
  return { label: graph.label[best]!, importers: graph.indegree[best]! };
}

/** How well a package's directories match the communities its imports form. */
export interface DirectoryMatch {
  /** Louvain community of every node, numbered from 0 in the order of each one's first module. */
  community: number[];
  /** Communities of two modules or more, and the modules outside any (they import nothing here). */
  communities: number;
  loners: number;
  /** Directories with two modules or more. */
  directories: number;
  /** Modularity of the partition into directories, and of the one Louvain found. */
  modularityOfDirectories: number;
  modularityOfCommunities: number;
  /**
   * Modules that are in the community most of their directory is in, and their share of all
   * modules: 1 when every directory is inside one community.
   */
  together: number;
  share: number;
  /** Imports of the graph, and how many of them stay inside a directory, and inside a community. */
  imports: number;
  insideDirectories: number;
  insideCommunities: number;
  /** Per directory: its modules, its largest community and how many of its modules are there. */
  byDirectory: { dir: string; modules: number; community: number; inCommunity: number }[];
}

export function directoryMatch(graph: ModuleGraph): DirectoryMatch {
  const like = { node: { label: graph.label }, link: graph, directed: false };
  // Numbered from 0 in the order of each community's first node, which is the order a trace
  // lists its groups in: "Community 1" is the first item of the legend.
  const community = [...louvain(like)];
  const sizes = new Map<number, number>();
  for (const c of community) sizes.set(c, (sizes.get(c) ?? 0) + 1);
  const order = [...sizes.keys()];

  const dirs = [...new Set(graph.group)];
  const dirIndex = graph.group.map((g) => dirs.indexOf(g));
  const byDirectory = dirs.map((dir, d) => {
    const counts = new Map<number, number>();
    let modules = 0;
    community.forEach((c, i) => {
      if (dirIndex[i] !== d) return;
      modules++;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    });
    let best = -1;
    for (const [c, n] of counts) {
      if (best < 0 || n > counts.get(best)! || (n === counts.get(best)! && c < best)) best = c;
    }
    return { dir, modules, community: best, inCommunity: counts.get(best) ?? 0 };
  });
  const together = byDirectory.reduce((a, d) => a + d.inCommunity, 0);
  const inside = (of: readonly number[]): number =>
    graph.source.filter((s, k) => of[s] === of[graph.target[k]!]).length;
  return {
    imports: graph.source.length,
    insideDirectories: inside(dirIndex),
    insideCommunities: inside(community),
    community,
    communities: order.filter((c) => sizes.get(c)! > 1).length,
    loners: order.filter((c) => sizes.get(c)! === 1).length,
    directories: byDirectory.filter((d) => d.modules > 1).length,
    modularityOfDirectories: modularity(like, dirIndex),
    modularityOfCommunities: modularity(like, community),
    together,
    share: together / graph.label.length,
    byDirectory: byDirectory.sort((a, b) => b.modules - a.modules),
  };
}

/** {@link directoryMatch} of every package with at least `least` modules, best match first. */
export function directoryMatches(
  least = 20,
): (DirectoryMatch & { dir: string; modules: number })[] {
  return PACKAGE_DIRS.map((dir) => {
    const g = packageModules(dir);
    return { dir, modules: g.label.length, ...directoryMatch(g) };
  })
    .filter((r) => r.modules >= least)
    .sort((a, b) => b.share - a.share);
}

/** Parts of a module graph that no import connects. */
export function parts(graph: ModuleGraph): { count: number; largest: number } {
  const c = connectedComponents({ node: { label: graph.label }, link: graph });
  return { count: c.count, largest: Math.max(...c.sizes) };
}

/** Imports by kind: of values, of types only (`import type`), and dynamic (`import()`). */
export function importKinds(): Record<ImportKind, number> {
  const out: Record<ImportKind, number> = { value: 0, type: 0, dynamic: 0 };
  for (const e of IMPORTS) out[e[2]]++;
  return out;
}

/** Lines of source in the modules, blank lines and comments included. */
export const LINES: number = MODULES.reduce((a, m) => a + m.lines, 0);

/**
 * Imports between packages: `matrix[a][b]` is the number of modules of package `a` that import
 * package `b` (its entry module, which is what one package sees of another).
 */
export function packageImports(): { labels: string[]; matrix: number[][]; total: number } {
  const n = PACKAGE_DIRS.length;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let total = 0;
  for (const [from, to] of IMPORTS) {
    const a = MODULES[from]!.pkg;
    const b = MODULES[to]!.pkg;
    if (a === b) continue;
    matrix[a]![b]!++;
    total++;
  }
  return { labels: [...PACKAGE_DIRS], matrix, total };
}

/* ---------------------------------------------------------------------------------------------- */
/* Commits                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

/** What a commit is, from the prefix of its subject line (`feat(core): …`), or a merge. */
export type CommitKind = 'feat' | 'fix' | 'perf' | 'docs' | 'test' | 'chore' | 'merge';
export const COMMIT_KINDS: readonly CommitKind[] = [
  'feat',
  'fix',
  'perf',
  'docs',
  'test',
  'chore',
  'merge',
];
export const COMMIT_KIND_LABEL: Readonly<Record<CommitKind, string>> = {
  feat: 'Feature',
  fix: 'Fix',
  perf: 'Performance',
  docs: 'Docs',
  test: 'Tests',
  chore: 'Build and chores',
  merge: 'Merge',
};

export interface Commit {
  /** The first seven characters of the hash. */
  hash: string;
  /** Indices of the parents, oldest commit first in {@link COMMITS}; a merge has two. */
  parents: number[];
  /** Seconds since 1970, UTC. */
  time: number;
  /** `2026-09-23`, UTC. */
  day: string;
  subject: string;
  kind: CommitKind;
  /** The row the commit is drawn in: 0 for the first-parent line of `HEAD`. */
  lane: number;
}

function commitKind(subject: string, parents: number): CommitKind {
  if (parents > 1) return 'merge';
  const prefix = /^(\w+)(\([^)]*\))?!?:/.exec(subject)?.[1];
  if (prefix === 'feat' || prefix === 'fix' || prefix === 'perf') return prefix;
  if (prefix === 'docs' || prefix === 'test') return prefix;
  return 'chore';
}

/**
 * A lane per commit, by the rule `git log --graph` and most git tools follow, newest commit
 * first: a commit takes the lane that was kept for it (the leftmost, when several branches start
 * from it), its first parent inherits that lane, and every other parent that has no lane yet gets
 * the first free one. So the first-parent line of `HEAD` is lane 0 from end to end.
 */
function lanes(parents: readonly (readonly number[])[]): number[] {
  const lane = new Array<number>(parents.length).fill(0);
  /** The commit each lane is kept for, or -1 when it is free. */
  const kept: number[] = [];
  const free = (): number => {
    const at = kept.indexOf(-1);
    if (at >= 0) return at;
    kept.push(-1);
    return kept.length - 1;
  };
  for (let i = parents.length - 1; i >= 0; i--) {
    let mine = kept.indexOf(i);
    if (mine < 0) mine = free();
    // Other lanes that waited for this commit end here: branches that started from it.
    for (let k = 0; k < kept.length; k++) if (kept[k] === i) kept[k] = -1;
    lane[i] = mine;
    const [first, ...others] = parents[i]!.filter((p) => p >= 0);
    if (first !== undefined) {
      // A first parent that another lane already waits for is drawn in the leftmost of the two.
      const other = kept.indexOf(first);
      if (other < 0) {
        kept[mine] = first;
      } else if (mine < other) {
        kept[other] = -1;
        kept[mine] = first;
      } else {
        kept[mine] = -1;
      }
    }
    for (const p of others) {
      if (!kept.includes(p)) kept[free()] = p;
    }
  }
  return lane;
}

/** Every commit reachable from `HEAD`, oldest first, in an order that puts parents before children. */
export const COMMITS: readonly Commit[] = (() => {
  const rows = commitsJson.commits as [string, number[], number, string][];
  const lane = lanes(rows.map((r) => r[1]));
  return rows.map(([hash, parents, time, subject], i) => ({
    hash,
    parents,
    time,
    day: new Date(time * 1000).toISOString().slice(0, 10),
    subject,
    kind: commitKind(subject, parents.length),
    lane: lane[i]!,
  }));
})();

/** The commit graph: a link from every parent to its child. */
export function commitGraph(): Network {
  const source: number[] = [];
  const target: number[] = [];
  COMMITS.forEach((c, i) => {
    for (const p of c.parents) {
      if (p < 0) continue;
      source.push(p);
      target.push(i);
    }
  });
  return { label: COMMITS.map((c) => c.hash), source, target };
}

/** Counts the article quotes about the history. */
export function commitStats(): {
  commits: number;
  merges: number;
  lanes: number;
  first: string;
  last: string;
  days: number;
  busiest: { day: string; commits: number };
  byKind: Record<CommitKind, number>;
} {
  const byKind = Object.fromEntries(COMMIT_KINDS.map((k) => [k, 0])) as Record<CommitKind, number>;
  const perDay = new Map<string, number>();
  for (const c of COMMITS) {
    byKind[c.kind]++;
    perDay.set(c.day, (perDay.get(c.day) ?? 0) + 1);
  }
  const busiest = [...perDay].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
  return {
    commits: COMMITS.length,
    merges: byKind.merge,
    lanes: Math.max(...COMMITS.map((c) => c.lane)) + 1,
    first: COMMITS[0]!.day,
    last: COMMITS.at(-1)!.day,
    days: perDay.size,
    busiest: { day: busiest[0], commits: busiest[1] },
    byKind,
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* The rendering pipeline                                                                         */
/* ---------------------------------------------------------------------------------------------- */

/** Where a stage of the pipeline runs (the clusters of the diagram). */
export type StageGroup = 'Input' | 'Pure stages' | 'GPU stages' | 'Feedback';

export interface Stage {
  label: string;
  group: StageGroup;
  /** What the stage does, and who owns it, for the hover label. */
  does: string;
  owner: string;
}

/**
 * The stages of the rendering pipeline, as `ARCHITECTURE.md` ("Rendering pipeline") draws and
 * tabulates them: four pure stages that could run in a worker, two that need the GPU, and the
 * loop back from an interaction through the update planner.
 */
export const STAGES: readonly Stage[] = [
  {
    label: 'Figure input',
    group: 'Input',
    does: 'data · layout · config · frames',
    owner: 'the application',
  },
  {
    label: 'Validate & coerce',
    group: 'Pure stages',
    does: 'schema-driven',
    owner: 'core/schema',
  },
  {
    label: 'Supply defaults',
    group: 'Pure stages',
    does: 'template merge → fullData / fullLayout',
    owner: 'core/defaults and each trace module',
  },
  {
    label: 'Calc',
    group: 'Pure stages',
    does: 'bins, stacks, stats, hierarchy, contours → calcdata',
    owner: 'each trace module',
  },
  {
    label: 'Layout',
    group: 'Pure stages',
    does: 'subplot domains, autorange, ticks, automargin',
    owner: 'core/layout',
  },
  {
    label: 'Scene build / diff',
    group: 'GPU stages',
    does: 'trace renderers produce keyed three.js objects',
    owner: 'render and each trace module',
  },
  {
    label: 'Render',
    group: 'GPU stages',
    does: 'on-demand loop, viewports, post-processing',
    owner: 'render',
  },
  {
    label: 'Interaction',
    group: 'Feedback',
    does: 'picking, hover, zoom, select → events',
    owner: 'runtime',
  },
  {
    label: 'Update planner',
    group: 'Feedback',
    does: 'editType → minimal stages',
    owner: 'core/edit and runtime',
  },
];

/**
 * The flow between the stages: `[from, to, what passes]`. The first eight are the pipeline from
 * end to end. The planner's link back to "Supply defaults" closes the loop (defaults always run
 * again on an update), and the two links that skip ahead are what an edit type saves: a `layout`
 * edit does not run calc again, and a `plot` or `style` edit goes straight to the scene.
 */
export const FLOWS: readonly (readonly [number, number, string])[] = [
  [0, 1, 'the figure'],
  [1, 2, 'a valid figure'],
  [2, 3, 'fullData / fullLayout'],
  [3, 4, 'calcdata'],
  [4, 5, 'domains, ranges, ticks'],
  [5, 6, 'three.js objects'],
  [6, 7, 'a frame'],
  [7, 8, 'relayout / restyle'],
  [8, 2, 'the edited figure'],
  [2, 4, 'editType: layout, ticks'],
  [2, 5, 'editType: plot, style'],
];

/* ---------------------------------------------------------------------------------------------- */
/* Formatting                                                                                     */
/* ---------------------------------------------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-23` → `Sep 23`; with `year`, `Sep 23, 2026`. */
export function fmtDay(day: string, year = false): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return `${MONTHS[m - 1]!} ${d}${year ? `, ${y}` : ''}`;
}

/** `0.42` → `42%`. */
export function percent(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/** `4159` → `4,159`. */
export function count(v: number): string {
  return v.toLocaleString('en-US');
}
