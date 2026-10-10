# @mk7s/holochart-traces-graph

## 0.1.0-alpha.0

### Minor Changes

- 0ef6845: Express gains three network functions (experimental), which plotly.express does not have: `hx.graph`, `hx.chord` and `hx.adjacencyMatrix`. They read an edge table, one row per link with the ids of its two ends (`source`, `target`, `weight`), and an optional node table (`nodes`, matched by `id`) for labels, colors, sizes, symbols, positions and hover text. `color` groups the nodes, with one color and legend item per value, or maps a numeric column through a colorscale; `size` takes a column or `'degree'`; `directed` draws arrowheads; `arrangement` picks the layout of a `graph`, with its options under the trace's own names (`force`, `layered`, `tree`, `arc`, `hive`). `hx.chord` also takes a square matrix. `hx.adjacencyMatrix` draws the network as a heatmap with rows and columns sorted by `order` (`'input'`, `'degree'`, `'group'`, `'community'` or a list of node indices), so that clusters show as blocks on the diagonal.

  The functions only build figures, so Express still depends on no trace package. Drawing a `graph` or a `chord` needs the graph package registered: `import '@mk7s/holochart/graph'`.

  `@mk7s/holochart-traces-graph` now exports its data helpers: the adapters `fromEdgeList`, `fromAdjacencyMatrix`, `fromNodeLink` (networkx, d3, graphology and Cytoscape JSON) and `fromDot` (a Graphviz subset), which return the `node` and `link` containers of a trace, and the measures `degrees`, `connectedComponents`, `louvain`, `modularity` and `adjacencyMatrix`. The Express functions take an adapter's result in place of the edge table, and a measure as a node column: `hx.adjacencyMatrix(network, { color: louvain(network), order: 'community' })`.

- 0ef6845: Network graphs. The new package `@mk7s/holochart-traces-graph` has the `graph` trace, which Plotly does not have: nodes (`node.label`, `x`, `y`, `size`, `color`, `symbol`, `group`) and the links between them (`link.source`, `target`, `value`, `color`, `width`, `dash`, `arrow`), shaped like sankey's so the same data feeds both, or the `ids` / `labels` / `parents` of the hierarchical traces. Links can have arrowheads, which stop at the edge of their node, parallel links curve apart and a self-link is a loop. Nodes are markers, sized by `node.size` or by their number of links (`node.sizeby`), or boxes around their labels (`node.shape: 'box'`). Labels are culled where they collide: the most connected nodes keep theirs and the rest appear on zoom. Nodes are colored by group, with one legend item per group, or by value, with a colorbar. Hover works on nodes and links, and box and lasso selection on nodes.

  `arrangement` says where the nodes go. `'preset'` takes `node.x` and `node.y` as data on the trace's axes, so a network can sit over a scatter, on date or log axes. Every other value computes the positions, with a deterministic layout that is also exported as a pure function over typed arrays, and each has an option container of its name:

  - `'force'` (the default without positions; `force`): a force-directed layout, as springs and repulsion (`force.algorithm: 'spring'`) or ForceAtlas2. Nodes with an `x` and a `y` are pinned; when every node has an `x` and none a `y`, the x axis stays a real axis and the layout only moves the nodes along y (a timeline). `force.simulate: true` shows the layout settling and ends on the same picture; it is skipped under `prefers-reduced-motion` and for graphs of more than 2,000 nodes or 10,000 links.
  - `'layered'` (`layered`): a directed graph in layers (`rankdir`, `ranksep`, `nodesep`, `ranker`), with links routed as splines, polylines or right angles (`routing`). Labelled nodes are boxes and links have arrowheads by default; `layered.clusters` frames the nodes of each group under its name; the links of a cyclic graph that had to be turned around are drawn in the `link.secondary` style (dashed).
  - `'tree'`, `'radial'`, `'dendrogram'` (`tree`): a tidy tree, the same tree on rings, and a tree with its leaves on one line and its nodes at the heights `node.value` gives, on a visible axis. They take `ids` / `labels` / `parents` or `node` / `link`; links that are not part of the tree are drawn in the `link.secondary` style. A click on a node that has children folds or unfolds its subtree: the chart restyles `tree.collapsed` and the tree moves to its new shape.
  - `'arc'` (`arc`) and `'hive'` (`hive`): an arc diagram and a hive plot.
  - `'circular'` and `'grid'`, and `'custom'`, which runs a layout the app registered with `registerGraphLayout(name, layout)`.

  New with them: `node.value` (a number per node: a dendrogram's heights, `tree.sort`, `hive.position`, `%{value}` in hover labels) and `link.secondary` (`dash`, `opacity`, `color`). Labels have room where the arrangement leaves some (`node.textposition: 'auto'`): along the radius of a radial tree, upright under an arc diagram or the leaves of a dendrogram. Box nodes of a computed arrangement shrink with the axes, text included, when the diagram is larger than the plot area.

  The trace is cartesian: it draws on its `xaxis` and `yaxis`, so zoom, pan, selection, `uirevision`, subplots and image export work as for a scatter. With a computed arrangement the axes are hidden, unless another trace shows them or the figure sets `visible`, and locked to one scale (a tidy tree and a dendrogram fill the plot area along each axis instead).

  The full bundle does not include it, so an app without a graph downloads no graph code. Add it with one import; `@mk7s/holochart` depends on the package, so there is nothing more to install:

  ```ts
  import * as Holochart from '@mk7s/holochart';
  import '@mk7s/holochart/graph';
  ```

  `@mk7s/holochart/graph` registers the package and re-exports it. A partial bundle registers it like any trace package: `register(...tracesGraph)`. A `graph` trace on a chart without the package is hidden, and the error names the package and that import. The script-tag build has no graphs yet.

  For trace authors (core, experimental): a trace module can give `axisHints(trace)`, which returns a `TraceAxisHints`: `hide` (the axes, or with `'x'` / `'y'` that axis, default to `visible: false` unless another trace is on them), `equal` (the y axis defaults to `scaleanchor` on the trace's x axis), `reverse` (`'x'` or `'y'`: that axis defaults to `autorange: 'reversed'`), and `x` / `y` (the data the trace puts on its axes when that is not its `x` / `y` attribute, for axis type detection).

- 0ef6845: More network graphs: two more trace types in `@mk7s/holochart-traces-graph`, interaction, accessibility and large graphs.

  - **`chord`**: a chord diagram, which Plotly does not have. Flows between nodes as ribbons inside a ring, from the `node` / `link` containers of `graph` and `sankey` or from a square `matrix` with `labels`. `directed` ribbons can end in an arrowhead (`link.arrowlen`), `node.group` adds an outer ring of groups, ribbons are colored by their source, their target or a gradient (`link.colorsource`), and a hover keeps the ribbons of one node. It is placed by `domain`.
  - **`graph3d`**: the `graph` model in a 3D `scene`: a force layout in three dimensions, `'layered'` with one plane per rank, or `'preset'` positions on the scene's axes. Nodes are lit spheres or sprites, links lines or tubes with cone arrowheads, parallel links fan out and a self-link is a ring. Nodes and links are picked on the GPU. Register it with `tracesGraph3d`, which brings the scene; `tracesGraph` alone bundles no 3D code. `import '@mk7s/holochart/graph'` registers both.
  - **Interaction** (`graph`): a hover highlights a node's neighbourhood (`highlight.hops`, `direction`, `dim`, `color`, `nodes`), and two selected nodes highlight a shortest path between them (`highlight.path`, `pathweight`, `pathdirected`; `graphPath(trace)` returns it). Nodes can be dragged under `'preset'` and `'force'` (`node.draggable`): the release restyles `node.x` / `node.y`, which pins a node of a force layout, and a double-click releases it; with `force.simulate` the layout reacts while a node is dragged. `force.start` continues a layout from given positions. Selection points list the links among the selected nodes, and `%{neighbors}` is a hover template variable.
  - **Large graphs** (`graph`): `worker: 'auto' | true` (or `config.worker`) runs the layout in the package's layout worker, `dist/layout-worker.js`, and draws the nodes while they settle; where a worker cannot start, the same code runs on the main thread in slices. `lod` leaves labels, arrowheads and node outlines out of a large graph until a zoom makes them readable, and fades links by how densely they cover the plot. `link.bundle` bundles links (`'hierarchical'` through the nodes' groups, `'force'` for graphs without groups). Exported for apps that lay graphs out themselves: `layoutInWorker`, `setGraphWorkerUrl`, `bundleLinks`.
  - **Accessibility**: the description of a graph names its most-connected nodes, its connected components and its groups, and its data table is the list of links. Arrow keys move from a node along its links (siblings, parent and child in a tree; rank by rank in a layered graph), and Enter folds a tree node. Five new announcement sentences and `Folded.` are translated in the ten locales.

  For trace authors (experimental): `TracePlotContext.recalc()` asks for a second calc pass without a change of the figure (a layout that arrived); `HoverPoint.selects` names the points a click on this one selects; `eventData` gets the selection as a fourth argument; `KeyboardPoint.click` lets Enter reach the click handling of a cartesian trace that handles clicks itself; `KeyboardStops.locate` re-finds the cursor in stops built on demand. `TraceAxisHints` gains `z`, and a 3D scene whose traces all hide their axes hides its own and starts with a closer camera.

### Patch Changes

- Updated dependencies [51001c1]
- Updated dependencies [2e457f5]
- Updated dependencies [f257a14]
- Updated dependencies [d68fbf4]
- Updated dependencies [44953a7]
- Updated dependencies [0ef6845]
- Updated dependencies [0ef6845]
- Updated dependencies [0ef6845]
- Updated dependencies [7227276]
- Updated dependencies [f576f33]
- Updated dependencies [3a7fb9b]
- Updated dependencies [7227276]
- Updated dependencies [e7c92ca]
- Updated dependencies [8f614fa]
- Updated dependencies [0ef6845]
- Updated dependencies [d708828]
  - @mk7s/holochart-traces-3d@0.1.0-alpha.0
  - @mk7s/holochart-runtime@0.1.0-alpha.0
  - @mk7s/holochart-core@0.1.0-alpha.0
  - @mk7s/holochart-render@0.1.0-alpha.0
  - @mk7s/holochart-traces-basic@0.1.0-alpha.0
