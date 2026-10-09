---
'@mk7s/holochart-traces-graph': minor
'@mk7s/holochart': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart-traces-3d': minor
'@mk7s/holochart-locales': minor
---

More network graphs: two more trace types in `@mk7s/holochart-traces-graph`, interaction, accessibility and large graphs.

- **`chord`**: a chord diagram, which Plotly does not have. Flows between nodes as ribbons inside a ring, from the `node` / `link` containers of `graph` and `sankey` or from a square `matrix` with `labels`. `directed` ribbons can end in an arrowhead (`link.arrowlen`), `node.group` adds an outer ring of groups, ribbons are colored by their source, their target or a gradient (`link.colorsource`), and a hover keeps the ribbons of one node. It is placed by `domain`.
- **`graph3d`**: the `graph` model in a 3D `scene`: a force layout in three dimensions, `'layered'` with one plane per rank, or `'preset'` positions on the scene's axes. Nodes are lit spheres or sprites, links lines or tubes with cone arrowheads, parallel links fan out and a self-link is a ring. Nodes and links are picked on the GPU. Register it with `tracesGraph3d`, which brings the scene; `tracesGraph` alone bundles no 3D code. `import '@mk7s/holochart/graph'` registers both.
- **Interaction** (`graph`): a hover highlights a node's neighbourhood (`highlight.hops`, `direction`, `dim`, `color`, `nodes`), and two selected nodes highlight a shortest path between them (`highlight.path`, `pathweight`, `pathdirected`; `graphPath(trace)` returns it). Nodes can be dragged under `'preset'` and `'force'` (`node.draggable`): the release restyles `node.x` / `node.y`, which pins a node of a force layout, and a double-click releases it; with `force.simulate` the layout reacts while a node is dragged. `force.start` continues a layout from given positions. Selection points list the links among the selected nodes, and `%{neighbors}` is a hover template variable.
- **Large graphs** (`graph`): `worker: 'auto' | true` (or `config.worker`) runs the layout in the package's layout worker, `dist/layout-worker.js`, and draws the nodes while they settle; where a worker cannot start, the same code runs on the main thread in slices. `lod` leaves labels, arrowheads and node outlines out of a large graph until a zoom makes them readable, and fades links by how densely they cover the plot. `link.bundle` bundles links (`'hierarchical'` through the nodes' groups, `'force'` for graphs without groups). Exported for apps that lay graphs out themselves: `layoutInWorker`, `setGraphWorkerUrl`, `bundleLinks`.
- **Accessibility**: the description of a graph names its most-connected nodes, its connected components and its groups, and its data table is the list of links. Arrow keys move from a node along its links (siblings, parent and child in a tree; rank by rank in a layered graph), and Enter folds a tree node. Five new announcement sentences and `Folded.` are translated in the ten locales.

For trace authors (experimental): `TracePlotContext.recalc()` asks for a second calc pass without a change of the figure (a layout that arrived); `HoverPoint.selects` names the points a click on this one selects; `eventData` gets the selection as a fourth argument; `KeyboardPoint.click` lets Enter reach the click handling of a cartesian trace that handles clicks itself; `KeyboardStops.locate` re-finds the cursor in stops built on demand. `TraceAxisHints` gains `z`, and a 3D scene whose traces all hide their axes hides its own and starts with a closer camera.
