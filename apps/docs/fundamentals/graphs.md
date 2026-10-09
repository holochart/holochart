---
title: Network graphs
description: The graph package — adding it, the node and link model that graph, chord and sankey share, adapters for edge lists, node-link JSON, DOT and matrices, degree, components and communities, choosing an arrangement, layouts as functions, the adjacency matrix and determinism.
status: complete
---

# Network graphs

A network is **nodes** and the **links** between them. Holochart draws one with three trace
types: [`graph`](/charts/graphs/graph), a node-link drawing at positions you give or that a
layout computes; [`chord`](/charts/graphs/chord), a ring of arcs with ribbons between them; and
[`graph3d`](/charts/graphs/graph3d), the node-link drawing in a 3D scene. A fourth form, the
[adjacency matrix](#the-adjacency-matrix), is a heatmap. Plotly.js has none of these, so they
are Holochart's own, and the attribute names follow [sankey](/charts/hierarchical/sankey)'s,
which is a node-link chart already.

This page covers what the three traces share: the package, the data model, getting data into it,
the measures people color and size nodes by, and how to choose where the nodes go. The chart
pages have the attributes of each trace.

## Adding the package

<InstallStatus ecosystem="javascript" />

Use these imports in the [built source workspace](/getting-started/installation#build-from-source-today).
The workspace install already supplies the runtime, extension package and three.js.

The three traces live in `@mk7s/holochart-traces-graph`. Like [maps](/fundamentals/maps), the
package is not registered by the full bundle, so that apps without a network do not download
layout code.

With the full bundle, add one import after it. It registers the three traces and re-exports the
package, so the helpers on this page come from the same place:

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph',
      node: { label: ['a', 'b', 'c', 'd'] },
      link: { source: [0, 0, 1, 2], target: [1, 2, 2, 3] },
    },
  ],
});
```

Nothing else is installed: `@mk7s/holochart` depends on the graph package.

With a [partial bundle](/getting-started/installation#smaller-bundles-with-partial-packages),
import the package alongside the runtime and register what you draw. `tracesGraph` holds `graph`
and `chord`. `tracesGraph3d` holds `graph3d` and the component that draws 3D scenes; it is apart
so that an app with 2D graphs only does not bundle the 3D package:

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { tracesGraph, tracesGraph3d } from '@mk7s/holochart-traces-graph';

register(...tracesGraph); // graph, chord
register(...tracesGraph3d); // graph3d and the 3D scene

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph',
      node: { label: ['a', 'b', 'c'] },
      link: { source: [0, 1], target: [1, 2] },
    },
  ],
});
```

A figure with a `graph`, `chord` or `graph3d` trace on a chart without the package is drawn
without it, and the console warning names the import that is missing.

The adapters, the measures and the layouts on this page are plain functions of the same package.
They register nothing and need no chart: they run in Node, in a test or on a server.

## The data model

`graph`, `chord`, `graph3d` and `sankey` take a network the same way, as two containers:

- **`node`**: one entry per node in every array: `node.label` and whatever else the trace reads
  (`group`, `color`, `x`, `y`, …). A node is its **index** in these arrays.
- **`link`**: `link.source` and `link.target`, one entry per link, each the index of a node.
  `link.value` is the weight of a link: how hard it pulls in a layout, how wide a ribbon or a
  sankey link is.

So one pair of arrays feeds all four, and trying another form is a change of `type`. The live
example is the energy balance of the sankey page as a chord diagram, from the same arrays:

<Example id="chord/links" />

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

const node = { label: ['Coal', 'Gas', 'Power', 'Heat', 'Homes'] };
const link = { source: [0, 1, 1, 2, 3], target: [2, 2, 3, 4, 4], value: [30, 20, 15, 45, 12] };

createChart(document.getElementById('chart')!, {
  data: [{ type: 'chord', node, link }], // or 'graph', 'graph3d', 'sankey'
});
```

What differs is what each trace makes of it:

| Trace     | A node is                     | A link is                 | `link.value` sets               |
| --------- | ----------------------------- | ------------------------- | ------------------------------- |
| `graph`   | a marker or a box at a place  | a line, with an arrowhead | the pull in a layout, the width |
| `graph3d` | a sphere or a sprite in space | a line or a tube          | the pull in a layout, the width |
| `chord`   | an arc of a ring              | a ribbon across the ring  | the width of the ribbon         |
| `sankey`  | a bar in a column             | a band between two bars   | the width of the band           |

Two more inputs exist beside `node` and `link`. `graph` and `graph3d` take a tree as `labels` and
`parents`, [as the hierarchical traces do](/charts/graphs/graph#data-format), and `chord` takes
a square [`matrix`](/charts/graphs/chord#data-format).

A **group** per node (`node.group`: a name or a number) is the one piece of structure all the
traces of the package read: it colors the nodes, gives the legend an item per group, and keeps
the nodes of a group together where the arrangement can (a circle, an arc diagram, the clusters
of a layered diagram, the outer ring of a chord diagram).

## Getting data in

Data rarely arrives as two index arrays. Four adapters turn the usual shapes into them. Each
returns `{ node, link, directed }`: the two containers, and whether the source said that its
links have a direction. They keep the order of the nodes of the source, skip links whose ends
are not nodes, and put attributes they do not recognise in `customdata`.

### Edge lists

`fromEdgeList` takes pairs, or triples with a weight, or objects. The ends are **ids** (names or
numbers), not indices; the nodes are numbered in order of first appearance:

```ts
import { createChart } from '@mk7s/holochart';
import { fromEdgeList } from '@mk7s/holochart/graph';

const { node, link } = fromEdgeList([
  ['Ada', 'Ben'],
  ['Ada', 'Cleo', 3], // a weight
  ['Ben', 'Cleo'],
]);
// node.label: ['Ada', 'Ben', 'Cleo']; link.source: [0, 0, 1]; link.value: [1, 3, 1]

createChart(document.getElementById('chart')!, { data: [{ type: 'graph', node, link }] });
```

For objects, `source`, `target` and `value` name the keys. A node table (`nodes`, with `id`
naming its key) adds nodes without links and attributes per node; its nodes come first, in
order:

```ts
import { fromEdgeList } from '@mk7s/holochart/graph';

const reviews = [
  { reviewer: 'Ada', author: 'Ben', count: 9 },
  { reviewer: 'Cleo', author: 'Ada', count: 4 },
];
const people = [
  { name: 'Ada', group: 'Platform' },
  { name: 'Ben', group: 'Web' },
  { name: 'Cleo', group: 'Web' },
  { name: 'Dev', group: 'Data' }, // no reviews: still a node
];
const network = fromEdgeList(reviews, {
  source: 'reviewer',
  target: 'author',
  value: 'count',
  nodes: people,
  id: 'name',
});
// network.node.group: ['Platform', 'Web', 'Web', 'Data']
```

Links are directed unless `directed: false` says otherwise.

For tables, [Express](/express/mappings#networks) does this and builds the figure:
`hx.graph(edges, { source, target, weight, nodes, color, size })`.

### Node-link JSON

`fromNodeLink` reads the JSON that graph libraries export, whichever of these it is:

- **networkx** `node_link_data` and **d3**: `{ directed, nodes: [{ id, … }], links: [{ source,
target, … }] }` (`edges` works for `links`);
- **graphology** `graph.export()`: `{ options, nodes: [{ key, attributes }], edges: [{ source,
target, attributes }] }`;
- **Cytoscape** `cy.json()`: `{ elements: { nodes: [{ data, position }], edges: [{ data }] } }`,
  or the element list itself. A node's `parent` becomes its group, and `position.y` is negated,
  because Cytoscape's y axis points down.

Attributes named `label` or `name`, `group`, `community` or `cluster`, `value`, `size` or
`weight`, `color`, `x` and `y` fill the arrays of the same meaning. Anything that is none of
these shapes throws a `TypeError`.

```ts
import { createChart } from '@mk7s/holochart';
import { fromNodeLink } from '@mk7s/holochart/graph';

// What networkx's json_graph.node_link_data(G) writes.
const json = {
  directed: true,
  nodes: [
    { id: 'parse', group: 'front' },
    { id: 'check', group: 'front' },
    { id: 'emit', group: 'back' },
  ],
  links: [
    { source: 'parse', target: 'check' },
    { source: 'check', target: 'emit', weight: 2 },
  ],
};
const { node, link, directed } = fromNodeLink(json);

createChart(document.getElementById('chart')!, {
  data: [{ type: 'graph', node, link: { ...link, arrow: { end: directed } } }],
});
```

`directed` is not a trace attribute of `graph`: a figure draws arrowheads with `link.arrow.end`,
as here. When the source has positions, `node.x` and `node.y` are filled, and a graph with a
position for every node is drawn as placed (`arrangement: 'preset'`).

### DOT

`fromDot` reads Graphviz text: `graph` and `digraph`, node and edge statements, chains
(`a -> b -> c`), attribute lists and subgraphs. It keeps `label`, `color`, `weight` (or
`penwidth`) as the value of a link, `pos` as a position, and a `cluster…` subgraph as the group
of its nodes. It lays nothing out: `rank`, `rankdir` and the other layout attributes of Graphviz
are passed through in `customdata`, and the arrangement is yours to choose.

```ts
import { createChart } from '@mk7s/holochart';
import { fromDot } from '@mk7s/holochart/graph';

const { node, link } = fromDot(`
  digraph build {
    lint -> test -> bundle;
    lint -> bundle [weight=2];
    subgraph cluster_ci { label="CI"; test; bundle }
  }
`);
// node.label: ['lint', 'test', 'bundle']; node.group: [null, 'CI', 'CI']

createChart(document.getElementById('chart')!, {
  data: [{ type: 'graph', arrangement: 'layered', layered: { clusters: true }, node, link }],
});
```

Text that is not DOT throws a `SyntaxError` that names the offset.

### Adjacency matrices

`fromAdjacencyMatrix` takes a square matrix: `matrix[i][j]` is the weight of the link from row
`i` to column `j`, and 0 (or anything that is not a finite number) is no link. A symmetric
matrix gives one undirected link per pair; any other is read as directed. `labels` names the
rows, and `threshold` leaves out the entries at or below it, which is how a correlation matrix
becomes a network:

```ts
import { fromAdjacencyMatrix } from '@mk7s/holochart/graph';

const correlation = [
  [1, 0.8, 0.1],
  [0.8, 1, 0.6],
  [0.1, 0.6, 1],
];
const network = fromAdjacencyMatrix(correlation, { labels: ['x', 'y', 'z'], threshold: 0.5 });
// the three self-links (the diagonal), x–y and y–z; x–z is under the threshold
```

The diagonal gives links from a node to itself; set it to 0 to have none.

## Measures

Three measures answer most of "which nodes matter, and which belong together". They are plain
functions over `{ node, link }` (what an adapter returns, or the two containers of a trace), and
they are deterministic: nodes are visited in index order.

| Function              | Returns                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `degrees`             | `degree`, `indegree` and `outdegree` of every node; with `weighted`, the sums of `link.value`    |
| `connectedComponents` | `component` of every node (direction ignored), `count`, and the `sizes`                          |
| `louvain`             | the community of every node, by the Louvain method, links read as undirected and weighted        |
| `modularity`          | how good a partition is: the share of link weight inside its groups, less what chance would give |

Sizing by degree needs none of them: `node.sizeby: 'degree'` (or `'indegree'`, `'outdegree'`) is
[an attribute of the trace](/charts/graphs/graph#node-size). The functions are for the rest: a
color, a filter, a number in a hover label.

```ts
import { createChart } from '@mk7s/holochart';
import { connectedComponents, degrees, fromEdgeList, louvain } from '@mk7s/holochart/graph';

declare const pairs: [string, string][]; // who wrote to whom
const network = fromEdgeList(pairs, { directed: false });

const community = louvain(network); // Int32Array: 0, 0, 1, 2, 1, …
const { count } = connectedComponents(network);
const { degree } = degrees(network);

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph',
      node: {
        ...network.node,
        group: Array.from(community, (c) => `Community ${c + 1}`),
        sizeby: 'degree',
        customdata: Array.from(degree),
        hovertemplate: '%{label}: %{customdata} links<extra>%{group}</extra>',
      },
      link: network.link,
    },
  ],
  layout: { title: { text: `${count} separate parts` } },
});
```

`louvain` numbers the communities from 0 in the order of each one's first node, which is the
order a trace lists its groups in. It takes a `resolution`: above 1 gives more and smaller
communities, below 1 fewer and larger. Anything past these measures (centralities, shortest
paths, other community methods) belongs to a graph library such as graphology or networkx; their
results come back in through the same arrays.

[This repository as graphs](/demos/repo-graphs#inside-one-package) uses `louvain` and
`modularity` on real data: the imports between the modules of a package, compared with its
folders.

## Choosing an arrangement

`arrangement` says where the nodes of a `graph` go. Which one reads best depends on what kind of
graph it is and on what the reader should see:

| The graph is                                              | Use                                                              | It shows                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| already placed (by a server, a map, Graphviz, a user)     | [`'preset'`](/charts/graphs/graph#given-positions)               | what you computed, on real axes                    |
| a general network: people, modules, pages                 | [`'force'`](/charts/graphs/graph#force-directed-and-forceatlas2) | who is close to whom, and clusters                 |
| the same with a few hubs that crush their neighbourhoods  | `'force'` with `force.algorithm: 'forceatlas2'`                  | communities pulled apart                           |
| events or versions with a date each                       | [`'force'` with `node.x` only](/charts/graphs/graph#a-timeline)  | the order in time, links between                   |
| directed, with a flow: a pipeline, dependencies, states   | [`'layered'`](/charts/graphs/graph#layered-diagrams)             | direction: every link points one way               |
| a tree: folders, an organisation                          | [`'tree'`](/charts/graphs/graph#trees)                           | depth and parents; folds on a click                |
| a large tree                                              | [`'radial'`](/charts/graphs/graph#radial-tree)                   | the same on rings, which have more room for leaves |
| a clustering with merge distances                         | [`'dendrogram'`](/charts/graphs/graph#dendrogram)                | the distances, on an axis                          |
| small, and every node should be seen                      | [`'circular'`](/charts/graphs/graph#on-a-circle)                 | every node and label, groups side by side          |
| ordered along one line: chapters, positions in a sequence | [`'arc'`](/charts/graphs/graph#arc-diagram)                      | how far links reach along the order                |
| a few kinds of nodes, links mostly between kinds          | [`'hive'`](/charts/graphs/graph#hive-plot)                       | what goes on between the kinds                     |
| nodes only matter as a list                               | [`'grid'`](/charts/graphs/graph#in-a-grid)                       | the nodes in rows                                  |
| dense: most pairs are linked                              | [an adjacency matrix](#the-adjacency-matrix)                     | every link as a cell, clusters as blocks           |
| volumes between a few groups                              | a [chord diagram](/charts/graphs/chord)                          | how much goes between each pair                    |
| quantities that are conserved through stages              | a [sankey](/charts/hierarchical/sankey)                          | where the quantity goes                            |
| large, and to be explored by turning it                   | [`graph3d`](/charts/graphs/graph3d)                              | the same network with a third dimension of room    |

Two of them, side by side on the same data: a force layout shows that this network has four
groups, and a layered layout shows that a pipeline has a direction.

<Example id="graph/force" />

<Example id="graph/layered" />

With a computed arrangement the positions are **layout units**: CSS px at the size the graph is
laid out for. The trace hides its axes, gives them one scale and fits the result to the plot
area, so the picture keeps its proportions when the chart is resized, and zoom and pan work as
on any cartesian chart.

## Layouts as functions

Every built-in arrangement is a function you can call without a chart: `forceLayout`,
`layeredLayout`, `tidyTreeLayout`, `radialTreeLayout`, `dendrogramLayout`, `circularLayout`,
`gridLayout`, `arcLayout` and `hiveLayout`. Each takes a graph as typed arrays and returns
positions, and for some links a route. They touch no DOM and no WebGL, so they run in Node:
lay a graph out once on a server, store the positions, and draw them with `'preset'`.

```ts
import { forceLayout, type LayoutGraph } from '@mk7s/holochart/graph';

const nodes = 4;
const graph: LayoutGraph = {
  nodes,
  source: Int32Array.of(0, 0, 1, 2),
  target: Int32Array.of(1, 2, 2, 3),
  weight: new Float64Array(4).fill(1), // link.value
  halfWidth: new Float64Array(nodes).fill(5), // half the size of each node
  halfHeight: new Float64Array(nodes).fill(5),
  x: new Float64Array(nodes).fill(NaN), // NaN: the layout places the node
  y: new Float64Array(nodes).fill(NaN),
};
const { x, y } = forceLayout(graph); // Float64Array, layout units, y up
```

`createForceSimulation` gives the force layout one step at a time (`tick`, `alpha`), for an
animation of your own.

### Bringing your own layout

There are two ways to use a layout that is not built in: elkjs, d3-force, Graphviz on a server,
or a function you wrote.

**Compute the positions, then use `'preset'`.** This is the way for an engine that is
asynchronous or runs elsewhere. The positions are data on the axes, so any units work:

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

// What a layout engine returned: here, the shape of elkjs's result.
declare const laidOut: { children: { id: string; x: number; y: number }[] };
declare const link: { source: number[]; target: number[] };

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph',
      arrangement: 'preset',
      node: {
        label: laidOut.children.map((n) => n.id),
        x: laidOut.children.map((n) => n.x),
        y: laidOut.children.map((n) => -n.y), // ELK's y points down
      },
      link,
    },
  ],
  // Keep the proportions the engine chose.
  layout: { yaxis: { scaleanchor: 'x' } },
});
```

Links between preset positions are straight, or bowed with `link.curve`: the routes an engine
computed for them are not used.

**Register a function, then use `'custom'`.** `registerGraphLayout(name, layout)` adds a layout
that the trace runs itself, like its own: with the node sizes it measured (boxes around labels
included), in layout units, fitted to the plot area, with the axes hidden. The function gets the
graph as typed arrays and `custom.options`, and returns `x` and `y` for every node, and may
return routes for links. It must be synchronous and deterministic. A registered layout always runs
on the main thread: a function cannot be sent to the [layout worker](/charts/graphs/graph#performance-notes).

```ts
import { createChart } from '@mk7s/holochart';
import { registerGraphLayout } from '@mk7s/holochart/graph';

// Nodes on a line, 40 units apart, `gap` from the figure.
registerGraphLayout<{ gap?: number }>('line', (graph, options) => {
  const gap = options?.gap ?? 40;
  return {
    x: Float64Array.from({ length: graph.nodes }, (_, i) => i * gap),
    y: new Float64Array(graph.nodes),
  };
});

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph',
      arrangement: 'custom',
      custom: { name: 'line', options: { gap: 60 } },
      node: { label: ['a', 'b', 'c'] },
      link: { source: [0, 1], target: [1, 2] },
    },
  ],
});
```

A layout that is not registered, and one that throws, are drawn as `'circular'`, with a console
warning. [A layout of your own](/charts/graphs/graph#a-layout-of-your-own) on the graph page has
a live example.

## The adjacency matrix

A node-link drawing stops working when most nodes are linked to most others: the links cover
each other. The same graph as a matrix has a row and a column per node and a cell per link, and
no two cells overlap. What makes a matrix readable is the **order** of its rows: sorted by
community, clusters show as blocks on the diagonal.

`adjacencyMatrix` returns the `x`, `y` and `z` of a [heatmap](/charts/scientific/heatmap), with
rows and columns in the order you name: `'community'` (the default: by `louvain` community, the
largest first), `'group'` (by `node.group`), `'degree'`, `'input'`, or a list of node indices.
Rows are the sources of the links and columns their targets; an undirected graph fills both
triangles.

```ts
import { createChart } from '@mk7s/holochart';
import { adjacencyMatrix, fromEdgeList } from '@mk7s/holochart/graph';

declare const pairs: [string, string, number][]; // who wrote to whom, how often
const network = fromEdgeList(pairs, { directed: false });
const { x, y, z } = adjacencyMatrix(network, { order: 'community' });

createChart(document.getElementById('chart')!, {
  data: [{ type: 'heatmap', x, y, z }],
  layout: { yaxis: { autorange: 'reversed' } }, // the first row at the top
});
```

A matrix is a `heatmap`, which the full bundle has: it needs the graph package for the helper
only. From a table, `hx.adjacencyMatrix` of [Express](/express/mappings#networks) builds the
whole figure:

<Example id="express/adjacency-matrix" :height="600" />

## Determinism

The same figure gives the same positions on every machine and on every run. The layouts use no
`Math.random` and no clock, and they visit nodes in index order. Where a force layout has to
separate nodes that start at the same place, it uses a generator seeded by `force.seed`; another
seed gives another, equally valid picture. `force.simulate` shows the layout settling and ends on
the positions the static layout has. `louvain` and the other measures are deterministic in the
same way.

So a chart looks the same after a reload, in a server-rendered export and in a screenshot test,
and a position can be reasoned about: a node moved because the data changed, not because the
page was loaded again. Two things do change a computed layout: the data (a node or a link more
moves others), and the size the graph is laid out for when the arrangement reads it, as the
packing of the separate parts of a layered graph does.

## What the package costs

Measured with the size report in the repository (min + gzip):

- An app on the [runtime](/getting-started/installation#smaller-bundles-with-partial-packages)
  with `tracesGraph` is 233.8 kB, against 155.1 kB with scatter alone: about 79 kB for `graph`,
  `chord`, every layout and the interaction. The seven layouts are 25.6 kB of that, the layered
  one the largest at 11.8 kB. With `tracesGraph3d` alone it is 220.5 kB, which includes the 3D
  scene.
- The layouts are part of the package's main chunk, not loaded on demand: calc runs them
  synchronously by default, and the package is only loaded by apps that draw graphs.
- Three things load when they are first needed: the keyboard stops (3.6 kB, on the first
  keyboard focus), the client of the layout worker with the edge bundling (8.2 kB, with the
  first trace that sets `worker` or `link.bundle`), and the worker itself, a file of 29.8 kB
  that carries its own copy of the layouts.
- The full bundle contains no graph code. `import '@mk7s/holochart/graph'` adds the package to
  it.

## Plotly compatibility

Plotly.js has no graph or chord trace: its documentation draws networks as `scatter` traces, one
for the nodes and one for the links, at positions from networkx. A figure built that way renders
here as it is. To move it to a `graph` trace, pass the same positions as `node.x` and `node.y`
(`'preset'`), or drop them and let an arrangement place the nodes; the links become
`link.source` and `link.target` instead of line segments with gaps. There is nothing for an
importer to translate, and a `graph`, `chord` or `graph3d` trace does not exist in Plotly.
