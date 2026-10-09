# @mk7s/holochart-traces-graph

Network graphs for Holochart. Three trace types: `graph`, nodes and the links between them, at
positions you give or placed by a layout (force-directed, layered, trees, a dendrogram, an arc
diagram, a hive plot); `graph3d`, the same in a 3D scene; and `chord`, flows between nodes as
ribbons inside a ring. Part of [Holochart](https://github.com/holochart/holochart),
declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases.

> **Not in the full bundle.** `@mk7s/holochart` registers every other trace package but this one
> and the geo package, so that apps without a graph do not download graph code. Add it with one
> import (below).

## Install

With the full bundle there is nothing more to install: `@mk7s/holochart` depends on this package
and registers it from its `graph` entry.

```sh
pnpm add @mk7s/holochart@alpha three
```

For a partial bundle, install it next to the runtime:

```sh
pnpm add @mk7s/holochart-runtime@alpha @mk7s/holochart-traces-graph@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

## Usage

With the full bundle, import `@mk7s/holochart/graph` once, after `@mk7s/holochart`. It registers
this package and re-exports it:

```ts
import { newPlot } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

newPlot(el, [
  {
    type: 'graph',
    arrangement: 'circular',
    node: { label: ['a', 'b', 'c', 'd'] },
    link: { source: [0, 0, 1, 2], target: [1, 2, 2, 3] },
  },
]);
```

With the runtime, register the package yourself:

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { tracesGraph } from '@mk7s/holochart-traces-graph';

register(...tracesGraph, ...builtinComponents);

createChart(el, {
  data: [
    {
      type: 'graph',
      node: { label: ['a', 'b', 'c'], x: [0, 1, 2], y: [0, 1, 0] },
      link: { source: [0, 1], target: [1, 2] },
    },
  ],
});
```

A figure with a `graph` trace on a chart without this package is not drawn, and the error names
the import that is missing.

## What it exports

- **`tracesGraph`:** the 2D trace modules (`graph`, `chord`), to register at once. An app that
  registers only these bundles no 3D code
- **`tracesGraph3d`:** `graph3d` and the 3D scene it is drawn in
  (`@mk7s/holochart-traces-3d`). `import '@mk7s/holochart/graph'` registers both arrays
- **Trace modules:** `graph`, `graph3d`, `chord`
- **Attribute schemas:** `graphAttributes`, `graph3dAttributes`, `chordAttributes`
- **Data in:** `fromEdgeList`, `fromAdjacencyMatrix`, `fromNodeLink` (networkx, d3, graphology
  and Cytoscape JSON) and `fromDot` (a Graphviz subset), which return the `node` and `link`
  containers of a trace
- **Measures:** `degrees`, `connectedComponents`, `louvain`, `modularity`, and
  `adjacencyMatrix`, which returns the `x`, `y` and `z` of a heatmap with rows and columns in an
  order that shows clusters
- **`graphPath`:** the highlighted shortest path of a trace, as node and link indices
- **Layouts:** `GRAPH_ARRANGEMENTS` (the values of `arrangement`), `registerGraphLayout`, and the
  built-in layouts as pure functions over typed arrays, with their option types: `forceLayout`
  (and `createForceSimulation`, to step it yourself), `layeredLayout`, `tidyTreeLayout`,
  `radialTreeLayout`, `dendrogramLayout`, `arcLayout`, `hiveLayout`, `circularLayout`,
  `gridLayout` and `presetLayout`
- **The layout worker:** `layoutInWorker` (a layout off the main thread, with positions reported
  while it settles), `setGraphWorkerUrl`, and the protocol and handler for hosts that run the
  worker themselves
- **Link bundling:** `bundleLinks`, `hierarchicalBundle` and `forceBundle`, pure functions from
  positions and links to routes

`node` and `link` are shaped like sankey's: `link.source` and `link.target` are node indices. A
tree can be given as `ids` / `labels` / `parents` instead, as the hierarchical traces take it.

## Arrangements

`arrangement` says where the nodes go. With `'preset'` they are at `node.x` and `node.y`, which
are data on the trace's `xaxis` and `yaxis`. Every other arrangement computes the positions, in
layout units (CSS px at the size the graph is laid out for), hides the axes and fits the result to
the plot area. The trace is cartesian either way, so zoom, pan, selection and subplots work as
for a scatter.

| `arrangement`  | What it draws                                                            | Options   |
| -------------- | ------------------------------------------------------------------------ | --------- |
| `'force'`      | Linked nodes pulled together, all nodes pushed apart (the default)       | `force`   |
| `'layered'`    | A directed graph in layers, every link pointing the same way             | `layered` |
| `'tree'`       | A tidy tree                                                              | `tree`    |
| `'radial'`     | The same tree on rings around its root                                   | `tree`    |
| `'dendrogram'` | A tree with its leaves on one line and its nodes at heights `node.value` | `tree`    |
| `'circular'`   | Nodes on a circle, the nodes of a group next to each other               |           |
| `'grid'`       | Nodes in rows                                                            |           |
| `'arc'`        | Nodes on a line, links as arcs over it                                   | `arc`     |
| `'hive'`       | Nodes on a few axes around a center, links between the axes              | `hive`    |
| `'custom'`     | A layout of your own                                                     | `custom`  |

The layouts are deterministic: the same figure gives the same picture on every machine.

**Force.** `force.algorithm` is `'spring'` (springs and repulsion, the d3-force model) or
`'forceatlas2'`. A node that has both `node.x` and `node.y` is pinned there. When every node has
an `x` and none has a `y`, the x axis is a real axis (dates work): the nodes stay at their values
and the layout moves them along y only, which makes a timeline. `force.simulate: true` shows the
layout settling, a few steps per frame, and ends on the same picture as without it; the settled
layout is drawn at once under `prefers-reduced-motion` and for graphs of more than 2,000 nodes or
10,000 links.

```ts
{ type: 'graph', arrangement: 'force', force: { simulate: true },
  node: { label, group }, link: { source, target } }
```

**Layered.** Nodes with labels are boxes with the text inside and links have arrowheads, both by
default. `layered.rankdir` is `'TB'`, `'BT'`, `'LR'` or `'RL'`, and `layered.routing` is
`'spline'`, `'polyline'` or `'orthogonal'`. `layered.clusters: true` keeps the nodes of a group
together in a frame with the group's name. A graph with cycles is drawn too: the links the layout
had to turn around are drawn in the `link.secondary` style, dashed by default.

```ts
{ type: 'graph', arrangement: 'layered', layered: { rankdir: 'LR', clusters: true },
  node: { label, group }, link: { source, target } }
```

**Trees.** `'tree'`, `'radial'` and `'dendrogram'` take `ids` / `labels` / `parents`, or `node` and
`link`: each node then hangs from the first node that links to it, and the links left over are
drawn in the `link.secondary` style. A click on a node that has children folds its subtree away,
and a second click unfolds it: the chart updates `tree.collapsed` (node indices, or ids) and
emits `restyle`. A dendrogram with `node.value` shows the axis of its heights, in the data's
units.

```ts
{ type: 'graph', arrangement: 'radial', ids, labels, parents, tree: { collapsed: ['docs'] } }
```

Box nodes of a computed arrangement shrink with the axes when the diagram is larger than the plot
area, text included, so a large diagram is drawn smaller instead of with its boxes run together.

`'custom'` runs a layout of your own, named by `custom.name`:

```ts
import { registerGraphLayout } from '@mk7s/holochart-traces-graph';

registerGraphLayout('line', (graph) => {
  const x = Float64Array.from({ length: graph.nodes }, (_, i) => i * 40);
  return { x, y: new Float64Array(graph.nodes) };
});
```

A layout is a pure function from the graph (typed arrays) to positions, and must be
deterministic. A custom layout that is not registered, and a layout that throws, are drawn as
`'circular'`, with a warning.

## On the chart

- **Highlighting.** Hovering a node keeps it, its links and its neighbours and dims the rest
  (`highlight.hops`, `direction`, `dim`); two selected nodes highlight a shortest path between
  them (`highlight.pathweight: 'value'` weighs it by `link.value`).
- **Dragging.** Under `'preset'` and `'force'` a node can be dragged (`node.draggable`). The
  release restyles its `node.x` and `node.y`; under `'force'` that pins it (a ring shows it) and
  a double-click releases it. With `force.simulate` the other nodes give way during the drag.
- **Folding.** A click on a tree node that has children folds its subtree (`tree.collapsed`).
- **Selection.** Box and lasso select nodes; the selection's points list the links among them.
- **Keyboard and screen readers.** The description names the most-connected nodes, the
  components and the groups, and the data table is the list of links. Arrow keys move from a
  node along its links; Enter folds a tree node.

## Large graphs

**Layouts off the main thread.** `worker` says where the layout is computed: `false` (the
default, from `config.worker`) with the rest of the figure, `true` in the package's layout worker,
`'auto'` in the worker where the wait would be felt (a `'force'` layout of 1,000 nodes or 5,000
links, a `'layered'` one of 3,000 nodes or 6,000 links). The chart is drawn at once; a force
layout is drawn while it settles, from the positions the worker reports, and `chart.ready`
resolves when the layout has arrived. The result is the picture `worker: false` gives.

```ts
{ type: 'graph', arrangement: 'force', worker: 'auto', node: { label, group }, link: { source, target } }
```

The worker is `dist/layout-worker.js`, which Vite, webpack 5 and other bundlers find by
themselves. Where it cannot be started (a Content Security Policy without `worker-src`, a bundler
that left the file out) the same code runs on the main thread in slices, with one warning; to fix
that, serve the file yourself and call `setGraphWorkerUrl(url)`.

**Level of detail.** A graph of more than 3,000 nodes or 5,000 links leaves out what cannot be
read while it is small on screen (`lod: 'auto'`; `true` for any graph, `false` never): labels
until the nodes are 24 px apart, arrowheads until the links are 24 px long, node sizes and
outlines where the nodes are closer than their size, and the full opacity of links that cover the
plot several times over. A zoom brings each back.

**Link bundling.** `link.bundle.method` draws links that run the same way together:
`'hierarchical'` along the groups of the nodes (or the tree of a tree arrangement), `'force'` by
the links themselves, `'auto'` whichever fits. `link.bundle.strength` is 0 (straight) to 1.

```ts
{ type: 'graph', arrangement: 'circular', node: { group },
  link: { source, target, bundle: { method: 'hierarchical' } } }
```

## License

MIT (see [LICENSE](LICENSE)).
