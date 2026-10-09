---
title: This repository as graphs
description: The Holochart monorepo drawn with its own graph traces — the package dependency graph, the imports between a thousand source modules, the commit history and the rendering pipeline, in ten charts.
status: complete
aside: false
pageClass: hc-demo
---

<script setup>
import {
  commitStats,
  count,
  DEPENDENCIES,
  dependencyOrder,
  dependents,
  DIRECT_DEPENDENCIES,
  directoryMatch,
  directoryMatches,
  FLOWS,
  fmtDay,
  HEAD,
  importKinds,
  IMPORTS,
  LINES,
  longestChain,
  MODULES,
  mostImported,
  PACKAGE_DIRS,
  packageImports,
  packageModules,
  percent,
  repoModules,
  STAGES,
  WORKSPACES,
} from '@mk7s/holochart-examples/demos/repo-graphs/analysis.mts';
import StatTiles from './components/StatTiles.vue';

const kinds = (kind) => WORKSPACES.filter((w) => w.kind === kind).length;
const at = (short) => WORKSPACES.findIndex((w) => w.short === short);
const chain = longestChain().map((i) => WORKSPACES[i].short);
const used = dependents();
const ranks = Math.max(...dependencyOrder().depth) + 1;
const needs = (short) => DEPENDENCIES.filter((d) => d[0] === at(short)).length;

const all = repoModules();
const top = mostImported(all);
const importKind = importKinds();
const between = packageImports();
const into = (dir) => {
  const b = between.labels.indexOf(dir);
  return between.matrix.reduce((sum, row) => sum + row[b], 0);
};
const pairs = between.matrix.flat().filter((v) => v > 0).length;

const pkg = packageModules('traces-graph');
const pkgTop = mostImported(pkg);
const match = directoryMatch(pkg);
const dir = (name) => match.byDirectory.find((d) => d.dir === name);
const matches = directoryMatches();
const of = (name) => matches.find((m) => m.dir === name);
const q = (v) => v.toFixed(2);

const stats = commitStats();

const tiles = [
  {
    value: String(WORKSPACES.length),
    label: 'workspace packages',
    aside: `${DEPENDENCIES.length} dependencies declared, ${DIRECT_DEPENDENCIES.length} of them direct`,
  },
  {
    value: count(MODULES.length),
    label: `source modules in ${PACKAGE_DIRS.length} packages`,
    aside: `${count(IMPORTS.length)} imports between them`,
  },
  {
    value: String(top.importers),
    label: `modules import ${top.label}.ts`,
    aside: `${percent(top.importers / MODULES.length)} of all modules`,
  },
  {
    value: String(stats.commits),
    label: `commits, ${fmtDay(stats.first)} – ${fmtDay(stats.last, true)}`,
    aside: `${stats.merges} merges, at most ${stats.lanes} lanes`,
  },
];
</script>

<p class="hc-eyebrow">packages · modules · imports · commits · read from this repository at commit {{ HEAD }}</p>

# This repository as graphs

<p class="hc-verdict">
  <strong>Half of this library imports one file.</strong> Holochart is {{ count(MODULES.length) }}
  source modules in {{ PACKAGE_DIRS.length }} packages, joined by {{ count(IMPORTS.length) }}
  imports. {{ top.importers }} of the modules import the entry module of <code>core</code>, and
  the longest chain of package dependencies is {{ chain.length }} packages deep. The charts below
  are that structure, drawn by the library itself.
</p>

<StatTiles :items="tiles" />

A graph is nodes and the links between them, and a code base is full of them: packages that
depend on packages, modules that import modules, commits that have parents, stages that feed
stages. Every chart on this page is one of those, read from the Holochart repository by a
[script](#sources) and drawn with the [`graph`](/charts/graphs/graph),
[`chord`](/charts/graphs/chord) and [`graph3d`](/charts/graphs/graph3d) traces of the
[graph package](/fundamentals/graphs). They are live: hover a node or a link for what it is,
drag to zoom, click a legend entry to hide a group, drag the 3D charts to orbit.

[The packages](#the-packages) · [Inside one package](#inside-one-package) ·
[Across the packages](#across-the-packages) · [The history](#the-history) ·
[The pipeline](#the-pipeline)

## The packages

The monorepo has {{ WORKSPACES.length }} workspace packages: {{ kinds('package') }} under
`packages/`, {{ kinds('tool') }} tools, and the docs site, the sandbox and the examples. Their
`package.json` files declare {{ DEPENDENCIES.length }} dependencies on each other, and
{{ DIRECT_DEPENDENCIES.length }} of those are enough to draw: the rest are implied, as
`holochart → core` is by `holochart → runtime → core`. Every link points down, so what the rest
stands on is at the bottom. The longest chain is {{ chain.length }} packages:
{{ chain.join(' → ') }}. {{ used.all[at('core')] }} of the other {{ WORKSPACES.length - 1 }}
packages depend on `core`, directly or through others.

<Example id="demos/repo-graphs/packages-dag" bare :height="600" />

All {{ DEPENDENCIES.length }} declared dependencies cross each other as links. As a matrix they
do not: a row per package, and a filled cell where it depends on the package of the column. Rows
and columns run from the bottom of the graph up, so every cell is below the diagonal, and a
dependency cycle would put one above it. The two long columns on the left are `core` and
`render`. The longest row is `holochart`, the bundle, which depends on {{ needs('holochart') }}
packages.

<div class="hc-demo-narrow">
  <Example id="demos/repo-graphs/packages-matrix" bare :height="680" />
</div>

The direct dependencies once more, in space: one plane for each of the {{ ranks }} ranks of the
graph, the apps at the top and `core` and `render` at the bottom. A package sits above what it
depends on. This one has to be turned to be read: several trace packages share a plane, and
from most angles one hides another.

<Example id="demos/repo-graphs/packages-3d" bare :height="640" />

## Inside one package

`packages/traces-graph` is the package that draws these charts: {{ pkg.label.length }} modules
and {{ pkg.source.length }} imports among them. No positions are given here. The force layout
pulls modules that import each other together and pushes the rest apart, and the folders come
apart almost by themselves: `chord/` and `data/` hang from the rest by a few links. A node is as
large as the number of modules that import it. The largest is <code>{{ pkgTop.label }}.ts</code>,
the contract that every layout implements, with {{ pkgTop.importers }} importers. Switch to
ForceAtlas2 to see the clusters pulled tighter.

<Example id="demos/repo-graphs/imports-force" bare :height="640" />

Do the folders match the imports? `louvain` looks for communities, groups of modules that import
each other more than they import the rest, and finds {{ match.communities }}. `chord/` and
`data/` are each one community, whole. `layout/` is not one: of its {{ dir('layout').modules }}
modules, those of the subfolders `force/`, `layered/`, `tree/` and `bundle/` each land in a
different community. In all,
{{ match.together }} of the {{ pkg.label.length }} modules ({{ percent(match.share) }}) are in
the community that holds most of their folder, and {{ match.insideDirectories }} of the
{{ match.imports }} imports stay inside a folder. Switch the colors to see which modules the two
groupings disagree about.

<Example id="demos/repo-graphs/imports-communities" bare :height="640" />

The same comparison for every package with at least 20 modules, as modularity: the share of
imports that stay inside a group, less what chance would give. The folders of `traces-graph`
score {{ q(match.modularityOfDirectories) }} and its communities
{{ q(match.modularityOfCommunities) }}. `traces-stats`, with a folder per trace type, has
{{ percent(of('traces-stats').share) }} of its modules where most of their folder is. In
`render` it is {{ percent(of('render').share) }}: the folder `primitives/` holds
{{ of('render').byDirectory[0].modules }} of its {{ of('render').modules }} modules and splits
into several communities. The folders of `express` and `locales` score below zero: their imports
cross from one folder to another more often than chance would have them.

<Example id="demos/repo-graphs/directory-match" bare :height="460" />

## Across the packages

{{ count(between.total) }} of the {{ count(IMPORTS.length) }} imports cross from one package to
another, each to the entry module of the package it names. An arc is as wide as what its package
imports plus what imports it, and a ribbon has the color of the package that does the importing:
{{ into('core') }} modules import `core`, {{ into('runtime') }} `runtime`, {{ into('render') }}
`render` and {{ into('traces-basic') }} `traces-basic`, on which the other trace packages build.
`core` and `render` import no other package. The imports and the manifests agree: the
{{ pairs }} pairs of packages with an import between them are the {{ pairs }} dependencies that
the packages declare on each other.

<div class="hc-demo-narrow">
  <Example id="demos/repo-graphs/imports-chord" bare :height="720" />
</div>

Every module and every import at once: {{ count(MODULES.length) }} spheres,
{{ count(IMPORTS.length) }} lines and about {{ count(Math.round(LINES / 1000)) }},000 lines of
TypeScript behind them. A plane has no room for this graph; a third dimension gives it some. Each
package gathers around its entry module, and the three large spheres in the middle are the entry
modules of `core`, `runtime` and `render`. Of the imports, {{ count(importKind.value) }} bring in
values, {{ count(importKind.type) }} only types, and {{ importKind.dynamic }} are `import()`
calls, the chunks that load on demand.

<Example id="demos/repo-graphs/imports-3d" bare :height="640" />

## The history

{{ stats.commits }} commits in the {{ stats.days }} days with commits between
{{ fmtDay(stats.first) }} and {{ fmtDay(stats.last, true) }}, oldest on the left, drawn the way
git tools draw them: a lane per line of development, and a link from every parent to its child.
{{ stats.merges }} commits are merges, the diamonds, with two links coming in. The comb on the
left is one pull request after another: a commit or two on a branch, then the merge that brings
it in. Towards the end the rhythm changes to long runs of commits on one line, with a second
line of work beside them. There were never more than {{ stats.lanes }} lanes at once, and the busiest day,
{{ fmtDay(stats.busiest.day) }}, had {{ stats.busiest.commits }} commits.

<Example id="demos/repo-graphs/commits" bare :height="340" />

## The pipeline

What happens to a figure between `createChart` and the screen, from `ARCHITECTURE.md`:
{{ STAGES.length }} stages and {{ FLOWS.length }} links. Four stages are pure functions that
could run in a worker, two need the GPU, and an interaction sends an edit back through the update
planner. That link closes a loop, so the layered layout has to turn it around to keep the others
pointing right, and draws it dashed. The two links that leave "Supply defaults" and skip a stage
are what an attribute's `editType` buys: a change to the layout does not run calc again, and a
change of style goes straight to the scene.

<Example id="demos/repo-graphs/pipeline" bare :height="380" />

## How each chart is drawn

| Chart                    | Trace     | Placed by                                                          |
| ------------------------ | --------- | ------------------------------------------------------------------ |
| Package dependencies     | `graph`   | `arrangement: 'layered'`, box nodes, `layered.clusters`            |
| Dependencies as a matrix | `heatmap` | `hx.adjacencyMatrix` of Express, rows in dependency order          |
| Dependencies in planes   | `graph3d` | `arrangement: 'layered'`: a plane per rank                         |
| Modules of one package   | `graph`   | `arrangement: 'force'`, springs or ForceAtlas2                     |
| Communities              | `graph`   | the same, with `node.group` from `louvain`                         |
| Folders and communities  | `scatter` | `modularity` of the graph package, as a dumbbell                   |
| Imports between packages | `chord`   | a square `matrix`, `directed`, `node.group`                        |
| Every module             | `graph3d` | `arrangement: 'force'` in three dimensions                         |
| Commits                  | `graph`   | `arrangement: 'preset'`: lanes computed, a day axis                |
| Pipeline                 | `graph`   | `arrangement: 'layered'`, `rankdir: 'LR'`, `routing: 'orthogonal'` |

The [graph page](/charts/graphs/graph) has every arrangement, and
[Network graphs](/fundamentals/graphs) the data helpers used here (`degrees`,
`connectedComponents`, `louvain`, `modularity`) and how to choose between a node-link drawing, a
chord diagram and a matrix.

## Sources

<p class="hc-demo-source">
  Everything on this page is read from the repository itself, at commit {{ HEAD }}, by
  <code>node examples/demos/repo-graphs/data/generate.mts</code>: the <code>package.json</code>
  of every workspace package, the <code>import</code> and <code>export … from</code> statements
  of every source module under <code>packages/*/src</code> (tests and fixtures left out), read
  with the TypeScript parser, and <code>git log</code> (hashes, parents, times and subject
  lines; no names). The script reads the working tree, so modules that were not committed yet are
  counted. Details:
  <a href="https://github.com/holochart/holochart/blob/main/examples/demos/repo-graphs/data/SOURCES.md" target="_blank" rel="noopener">SOURCES.md</a>.
  Chart sources: <a href="https://github.com/holochart/holochart/tree/main/examples/demos/repo-graphs" target="_blank" rel="noopener">examples/demos/repo-graphs</a>.
</p>
