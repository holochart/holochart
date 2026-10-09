---
'@mk7s/holochart-traces-graph': minor
'@mk7s/holochart': minor
'@mk7s/holochart-core': minor
---

Network graphs. The new package `@mk7s/holochart-traces-graph` has the `graph` trace, which Plotly does not have: nodes (`node.label`, `x`, `y`, `size`, `color`, `symbol`, `group`) and the links between them (`link.source`, `target`, `value`, `color`, `width`, `dash`, `arrow`), shaped like sankey's so the same data feeds both, or the `ids` / `labels` / `parents` of the hierarchical traces. Links can have arrowheads, which stop at the edge of their node, parallel links curve apart and a self-link is a loop. Nodes are markers, sized by `node.size` or by their number of links (`node.sizeby`), or boxes around their labels (`node.shape: 'box'`). Labels are culled where they collide: the most connected nodes keep theirs and the rest appear on zoom. Nodes are colored by group, with one legend item per group, or by value, with a colorbar. Hover works on nodes and links, and box and lasso selection on nodes.

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
