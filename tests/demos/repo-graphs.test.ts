import { describe, expect, it } from 'vitest';
import {
  COMMITS,
  commitGraph,
  commitStats,
  DEPENDENCIES,
  dependencyOrder,
  dependents,
  DIRECT_DEPENDENCIES,
  directoryMatch,
  directoryMatches,
  FLOWS,
  HEAD,
  IMPORTS,
  longestChain,
  MODULES,
  mostImported,
  PACKAGE_DIRS,
  packageGraph,
  packageImports,
  packageModules,
  parts,
  repoModules,
  STAGES,
  WORKSPACES,
} from '../../examples/demos/repo-graphs/analysis.mts';
import commitsJson from '../../examples/demos/repo-graphs/data/commits.json';
import importsJson from '../../examples/demos/repo-graphs/data/imports.json';

/** The nodes reachable from each node over `links`. */
function reachable(n: number, links: readonly (readonly [number, number])[]): Set<number>[] {
  const next: number[][] = Array.from({ length: n }, () => []);
  for (const [s, t] of links) next[s]!.push(t);
  return next.map((_, start) => {
    const seen = new Set<number>();
    const stack = [...next[start]!];
    while (stack.length > 0) {
      const i = stack.pop()!;
      if (seen.has(i)) continue;
      seen.add(i);
      stack.push(...next[i]!);
    }
    return seen;
  });
}

describe('repo-graphs demo: workspace packages', () => {
  it('lists every workspace once, with the three files read at one commit', () => {
    expect(new Set(WORKSPACES.map((w) => w.name)).size).toBe(WORKSPACES.length);
    expect(new Set(WORKSPACES.map((w) => w.short)).size).toBe(WORKSPACES.length);
    expect(HEAD).toMatch(/^[0-9a-f]{7}$/);
    expect(importsJson.head).toBe(HEAD);
    expect(commitsJson.head).toBe(HEAD);
    for (const w of WORKSPACES) {
      expect(['package', 'tool', 'app']).toContain(w.kind);
      if (w.kind === 'package') expect(w.modules).toBeGreaterThan(0);
    }
  });

  it('has no dependency cycle: every dependency comes before its dependent', () => {
    const { order, depth } = dependencyOrder();
    const at = new Map(order.map((node, i) => [node, i]));
    for (const [from, to] of DEPENDENCIES) {
      expect(at.get(to)!).toBeLessThan(at.get(from)!);
      expect(depth[to]!).toBeLessThan(depth[from]!);
    }
  });

  it('reduces the dependencies without losing a path', () => {
    const declared = new Set(DEPENDENCIES.map((d) => d.join('>')));
    for (const d of DIRECT_DEPENDENCIES) expect(declared.has(d.join('>'))).toBe(true);
    expect(DIRECT_DEPENDENCIES.length).toBeLessThan(DEPENDENCIES.length);
    const all = reachable(WORKSPACES.length, DEPENDENCIES);
    const direct = reachable(WORKSPACES.length, DIRECT_DEPENDENCIES);
    all.forEach((set, i) => expect([...direct[i]!].sort()).toEqual([...set].sort()));
    // No direct dependency is implied by the others.
    for (const [s, t] of DIRECT_DEPENDENCIES) {
      const rest = DIRECT_DEPENDENCIES.filter((d) => d[0] !== s || d[1] !== t);
      expect(reachable(WORKSPACES.length, rest)[s]!.has(t)).toBe(false);
    }
    const g = packageGraph(true);
    expect(g.source).toHaveLength(DIRECT_DEPENDENCIES.length);
    expect(packageGraph().source).toHaveLength(DEPENDENCIES.length);
  });

  it('finds the longest chain, which is a chain and ends at a package that depends on nothing', () => {
    const chain = longestChain();
    const declared = new Set(DEPENDENCIES.map((d) => d.join('>')));
    for (let i = 1; i < chain.length; i++) {
      expect(declared.has(`${chain[i - 1]!}>${chain[i]!}`)).toBe(true);
    }
    expect(DEPENDENCIES.some((d) => d[0] === chain.at(-1))).toBe(false);
    expect(chain.length).toBe(Math.max(...dependencyOrder().depth) + 1);
    const used = dependents();
    used.all.forEach((n, i) => expect(n).toBeGreaterThanOrEqual(used.direct[i]!));
  });
});

describe('repo-graphs demo: modules and imports', () => {
  it('has the modules of every package and imports between existing modules', () => {
    PACKAGE_DIRS.forEach((dir, p) => {
      const n = MODULES.filter((m) => m.pkg === p).length;
      expect(WORKSPACES.find((w) => w.dir === `packages/${dir}`)!.modules).toBe(n);
    });
    const seen = new Set<string>();
    for (const [from, to, kind] of IMPORTS) {
      expect(MODULES[from]).toBeDefined();
      expect(MODULES[to]).toBeDefined();
      expect(from).not.toBe(to);
      expect(['value', 'type', 'dynamic']).toContain(kind);
      expect(seen.has(`${from}>${to}`)).toBe(false);
      seen.add(`${from}>${to}`);
    }
    for (const m of MODULES) expect(m.path.endsWith('.ts')).toBe(true);
  });

  it('agrees with itself on imports within and between packages', () => {
    const all = repoModules();
    expect(all.label).toHaveLength(MODULES.length);
    expect(all.source).toHaveLength(IMPORTS.length);
    const within = PACKAGE_DIRS.reduce((sum, dir) => sum + packageModules(dir).source.length, 0);
    const between = packageImports();
    expect(within + between.total).toBe(IMPORTS.length);
    expect(between.matrix.flat().reduce((a, v) => a + v, 0)).toBe(between.total);
    between.matrix.forEach((row, i) => expect(row[i]).toBe(0));
    const top = mostImported(all);
    expect(top.importers).toBe(Math.max(...all.indegree));
    expect(parts(all).largest).toBeLessThanOrEqual(MODULES.length);
  });

  it('only imports a package that the importing package declares as a dependency', () => {
    const index = new Map(WORKSPACES.map((w, i) => [w.dir, i]));
    const declared = new Set(DEPENDENCIES.map((d) => d.join('>')));
    const { matrix, labels } = packageImports();
    matrix.forEach((row, a) =>
      row.forEach((n, b) => {
        if (n === 0) return;
        const from = index.get(`packages/${labels[a]!}`)!;
        const to = index.get(`packages/${labels[b]!}`)!;
        expect(declared.has(`${from}>${to}`), `${labels[a]!} imports ${labels[b]!}`).toBe(true);
      }),
    );
  });

  it('finds the same communities every time, never worse than the directories', () => {
    for (const dir of PACKAGE_DIRS) {
      const g = packageModules(dir);
      const a = directoryMatch(g);
      const b = directoryMatch(g);
      expect(a.community).toEqual(b.community);
      expect(a.community).toHaveLength(g.label.length);
      expect(a.modularityOfCommunities).toBeGreaterThanOrEqual(a.modularityOfDirectories - 1e-9);
      expect(a.together).toBeLessThanOrEqual(g.label.length);
      expect(a.share).toBeGreaterThan(0);
      expect(a.share).toBeLessThanOrEqual(1);
      expect(a.byDirectory.reduce((sum, d) => sum + d.modules, 0)).toBe(g.label.length);
      // Communities are numbered in the order of their first module, as a trace lists groups.
      const firsts = [...new Set(a.community)];
      expect(firsts).toEqual(firsts.map((_, i) => i));
    }
  });
});

describe('repo-graphs demo: commits', () => {
  it('puts every parent before its child and keeps the first-parent line in lane 0', () => {
    COMMITS.forEach((c, i) => {
      for (const p of c.parents) expect(p).toBeLessThan(i);
      expect(c.hash).toMatch(/^[0-9a-f]{7}$/);
      expect(c.lane).toBeGreaterThanOrEqual(0);
    });
    expect(COMMITS.at(-1)!.hash).toBe(HEAD);
    let i = COMMITS.length - 1;
    while (i >= 0) {
      expect(COMMITS[i]!.lane).toBe(0);
      i = COMMITS[i]!.parents[0] ?? -1;
    }
  });

  it('never draws two commits of one lane on top of a third', () => {
    // Between a commit and its first parent in the same lane, no other commit is in that lane.
    COMMITS.forEach((c, i) => {
      const p = c.parents[0];
      if (p === undefined || p < 0 || COMMITS[p]!.lane !== c.lane) return;
      for (let k = p + 1; k < i; k++) expect(COMMITS[k]!.lane, `${c.hash}`).not.toBe(c.lane);
    });
  });

  it('counts what it says', () => {
    const stats = commitStats();
    const g = commitGraph();
    expect(stats.commits).toBe(COMMITS.length);
    expect(stats.merges).toBe(COMMITS.filter((c) => c.parents.length > 1).length);
    expect(Object.values(stats.byKind).reduce((a, v) => a + v, 0)).toBe(COMMITS.length);
    expect(g.source).toHaveLength(COMMITS.reduce((a, c) => a + c.parents.length, 0));
    expect(stats.lanes).toBe(new Set(COMMITS.map((c) => c.lane)).size);
    expect(stats.first <= stats.last).toBe(true);
  });

  it('stores no author names or e-mail addresses', () => {
    for (const row of commitsJson.commits) {
      expect(row).toHaveLength(4);
      expect(String(row[3])).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    }
  });
});

describe('repo-graphs demo: pipeline', () => {
  it('is the pipeline end to end, one link back and two that skip a stage', () => {
    for (const [from, to] of FLOWS) {
      expect(STAGES[from]).toBeDefined();
      expect(STAGES[to]).toBeDefined();
    }
    const forward = FLOWS.filter(([from, to]) => to === from + 1);
    expect(forward).toHaveLength(STAGES.length - 1);
    expect(FLOWS.filter(([from, to]) => to < from)).toHaveLength(1);
    expect(FLOWS.filter(([from, to]) => to > from + 1)).toHaveLength(2);
  });
});

/**
 * What the article (`apps/docs/demos/repo-graphs.md`) says in words, not in numbers it reads from
 * the analysis. When the data is generated again and one of these fails, the sentence it names
 * needs another look.
 */
describe('repo-graphs demo: what the article says', () => {
  it('"Half of this library imports one file", and the three large spheres', () => {
    const all = repoModules();
    const top = mostImported(all);
    expect(top.label).toBe('core/index');
    expect(top.importers / MODULES.length).toBeGreaterThan(0.45);
    expect(top.importers / MODULES.length).toBeLessThan(0.55);
    const largest = all.label
      .map((label, i) => ({ label, n: all.indegree[i]! }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((m) => m.label);
    expect(largest).toEqual(['core/index', 'runtime/index', 'render/index']);
  });

  it('holochart → core is implied, and holochart has the longest row of the matrix', () => {
    const at = (short: string): number => WORKSPACES.findIndex((w) => w.short === short);
    const has = (list: typeof DEPENDENCIES, a: string, b: string): boolean =>
      list.some((d) => d[0] === at(a) && d[1] === at(b));
    expect(has(DEPENDENCIES, 'holochart', 'core')).toBe(true);
    expect(has(DIRECT_DEPENDENCIES, 'holochart', 'core')).toBe(false);
    expect(has(DEPENDENCIES, 'holochart', 'runtime')).toBe(true);
    expect(has(DEPENDENCIES, 'runtime', 'core')).toBe(true);
    const needs = WORKSPACES.map((_, i) => DEPENDENCIES.filter((d) => d[0] === i).length);
    expect(needs.indexOf(Math.max(...needs))).toBe(at('holochart'));
    const used = dependents().direct;
    const columns = [...used.keys()].sort((a, b) => used[b]! - used[a]!).slice(0, 2);
    expect(columns.map((i) => WORKSPACES[i]!.short).sort()).toEqual(['core', 'render']);
  });

  it('the folders of traces-graph: chord and data whole, layout split by its subfolders', () => {
    const g = packageModules('traces-graph');
    expect(mostImported(g).label).toBe('layout/types');
    const match = directoryMatch(g);
    for (const name of ['chord', 'data']) {
      const d = match.byDirectory.find((x) => x.dir === name)!;
      expect(d.inCommunity, name).toBe(d.modules);
    }
    const majority = (prefix: string): number => {
      const counts = new Map<number, number>();
      g.label.forEach((label, i) => {
        if (!label.startsWith(prefix)) return;
        counts.set(match.community[i]!, (counts.get(match.community[i]!) ?? 0) + 1);
      });
      return [...counts].sort((a, b) => b[1] - a[1])[0]![0];
    };
    const subfolders = ['layout/force/', 'layout/layered/', 'layout/tree/', 'layout/bundle/'];
    expect(new Set(subfolders.map(majority)).size).toBe(subfolders.length);
    expect(match.modularityOfCommunities).toBeGreaterThan(match.modularityOfDirectories);
  });

  it('traces-stats matches its folders best of the three named, render splits, two score below zero', () => {
    const of = (dir: string) => directoryMatches().find((m) => m.dir === dir)!;
    expect(of('traces-stats').share).toBeGreaterThan(0.9);
    expect(of('render').share).toBeLessThan(of('traces-graph').share);
    const primitives = of('render').byDirectory[0]!;
    expect(primitives.dir).toBe('primitives');
    expect(primitives.inCommunity).toBeLessThan(primitives.modules / 2);
    expect(of('express').modularityOfDirectories).toBeLessThan(0);
    expect(of('locales').modularityOfDirectories).toBeLessThan(0);
    for (const m of directoryMatches()) {
      if (m.dir === 'express' || m.dir === 'locales') continue;
      expect(m.modularityOfDirectories, m.dir).toBeGreaterThan(0);
    }
  });

  it('imports and manifests agree, and core and render import no other package', () => {
    const { matrix, labels } = packageImports();
    const pairs = matrix.flat().filter((v) => v > 0).length;
    const declared = DEPENDENCIES.filter(
      ([s, t]) => WORKSPACES[s]!.kind === 'package' && WORKSPACES[t]!.kind === 'package',
    );
    expect(declared).toHaveLength(pairs);
    for (const name of ['core', 'render']) {
      expect(matrix[labels.indexOf(name)]!.every((v) => v === 0)).toBe(true);
    }
    const into = (dir: string): number =>
      matrix.reduce((sum, row) => sum + row[labels.indexOf(dir)]!, 0);
    const order = [...labels].sort((a, b) => into(b) - into(a)).slice(0, 4);
    expect(order).toEqual(['core', 'runtime', 'render', 'traces-basic']);
  });

  it('the history: merges on the first lane, then long runs', () => {
    const stats = commitStats();
    expect(stats.merges).toBeGreaterThan(30);
    const merges = COMMITS.filter((c) => c.kind === 'merge');
    expect(merges.filter((c) => c.lane === 0).length / merges.length).toBeGreaterThan(0.8);
    // A run of twenty or more commits in a row on one lane, in the last third of the history.
    let run = 0;
    let longest = 0;
    COMMITS.forEach((c, i) => {
      run = i > 0 && COMMITS[i - 1]!.lane === c.lane ? run + 1 : 1;
      if (i > (COMMITS.length * 2) / 3) longest = Math.max(longest, run);
    });
    expect(longest).toBeGreaterThanOrEqual(20);
  });
});
