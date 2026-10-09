---
'@mk7s/holochart-express': minor
'@mk7s/holochart-traces-graph': minor
---

Express gains three network functions (experimental), which plotly.express does not have: `hx.graph`, `hx.chord` and `hx.adjacencyMatrix`. They read an edge table, one row per link with the ids of its two ends (`source`, `target`, `weight`), and an optional node table (`nodes`, matched by `id`) for labels, colors, sizes, symbols, positions and hover text. `color` groups the nodes, with one color and legend item per value, or maps a numeric column through a colorscale; `size` takes a column or `'degree'`; `directed` draws arrowheads; `arrangement` picks the layout of a `graph`, with its options under the trace's own names (`force`, `layered`, `tree`, `arc`, `hive`). `hx.chord` also takes a square matrix. `hx.adjacencyMatrix` draws the network as a heatmap with rows and columns sorted by `order` (`'input'`, `'degree'`, `'group'`, `'community'` or a list of node indices), so that clusters show as blocks on the diagonal.

The functions only build figures, so Express still depends on no trace package. Drawing a `graph` or a `chord` needs the graph package registered: `import '@mk7s/holochart/graph'`.

`@mk7s/holochart-traces-graph` now exports its data helpers: the adapters `fromEdgeList`, `fromAdjacencyMatrix`, `fromNodeLink` (networkx, d3, graphology and Cytoscape JSON) and `fromDot` (a Graphviz subset), which return the `node` and `link` containers of a trace, and the measures `degrees`, `connectedComponents`, `louvain`, `modularity` and `adjacencyMatrix`. The Express functions take an adapter's result in place of the edge table, and a measure as a node column: `hx.adjacencyMatrix(network, { color: louvain(network), order: 'community' })`.
