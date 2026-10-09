# ADR-029: Network graphs are one cartesian `graph` trace with our own layouts, in their own package

- **Status:** Proposed
- **Date:** 2026-10-06
- **Deciders:** G1, with what G2–G10 found while building it; the owner accepts or rejects
- **Related stories:** backlog G1–G10; [ADR-006](006-d3-micro-libraries.md),
  [ADR-011](011-calc-in-web-worker.md), [ADR-019](019-runtime-package.md),
  [ADR-026](026-geo-packages-and-bundles.md)

## Context

The graphs epic asks for node-link charts: force-directed networks, layered DAGs, trees, and the
related forms (arc diagram, chord diagram, adjacency matrix), in 2D and in the 3D scene. Plotly.js
has no graph trace, so there is no schema to follow and nothing for the importer to do. The
backlog left four decisions open: how many trace types, whose layout code, which package, and the
order. The owner decided on 2026-10-06 to build the epic now, ahead of the plugin API freeze
(S3.5) that G1 was waiting for.

Three facts shape the answers.

- **A graph needs zoom, pan and selection more than most charts.** Labels that appear on zoom,
  box and lasso selection over nodes, `uirevision`, subplots and export all exist for cartesian
  subplots. A `domain` trace (sankey, pie) has none of them: `traces-geo` had to build a view
  model, a component and runtime hooks to get them for maps.
- **Layouts are pure and heavy.** A force layout of 10,000 nodes is seconds of arithmetic. It
  should run in calc, in a test and in a worker from the same code, and move between threads
  without copying.
- **Full ESM is at 534.8 of 540 kB.** Nothing new fits in the default bundle.

## Decision

- **One trace type, `graph`, with a pluggable layout, plus `graph3d` and `chord`.** `graph` takes
  `node: { label, x, y, size, color, symbol, group, … }` and `link: { source, target, value, color,
width, dash, arrow, curve, … }`, shaped like sankey's so the same data feeds both, or the
  `ids` / `labels` / `parents` of the hierarchical traces. `arrangement` picks the layout:
  `'preset' | 'force' | 'layered' | 'tree' | 'radial' | 'dendrogram' | 'circular' | 'grid' | 'arc'
| 'hive' | 'custom'`, with one option container per layout (`force`, `layered`, `tree`). The
  attribute cannot be called `layout`, which the figure owns; sankey's `arrangement` is the
  precedent. `graph3d` is the same model in a 3D scene. A chord diagram is not a node-link
  drawing (rings and ribbons), so it is its own trace, `chord`. An adjacency matrix is a heatmap
  with its rows and columns reordered, so it is a helper that returns a `heatmap` trace, not a
  trace type.
- **`graph` is a cartesian trace.** Node positions are linear coordinates on its `xaxis` and
  `yaxis`. With `arrangement: 'preset'` they are data: `node.x` and `node.y` go through the axis
  scales, so a network can sit over a scatter, on date or log axes. With a computed arrangement
  they are **layout units**, one unit being one CSS px at the size the graph was laid out for.
  There is no `domain` placement, which the backlog proposed for graphs without positions.
  Instead a trace module can now ask core for axis defaults (a hook on the core trace contract
  that generalises what core hard-coded for `image` and `funnel`): the axes of a `graph` are
  hidden unless another trace shows them or the figure sets `visible`, and they are locked to
  equal scale when the arrangement is computed. So a figure with one `graph` trace shows no axes
  and keeps its shape, and still zooms, pans and selects like a scatter.
- **Layouts are pure functions over typed arrays** (`LayoutGraph` → `LayoutResult`,
  `src/layout/types.ts`): node count, `source` / `target` / `weight` per link, node half extents,
  given positions with `NaN` for free ones, groups, parents. The result is positions, optional
  link routes (polylines or cubic Bézier control points), reversed links, cluster frames and a
  hidden mask. They are deterministic: no `Math.random`, no time, no hashed iteration order, so
  visual baselines, server rendering and export agree. A layout that settles over time
  (`force`) is a `LayoutSimulation` that the trace steps to rest in calc, or frame by frame.
- **Our own layout code, no new dependencies.** The force engine is ours: Barnes–Hut on flat
  arrays in two or three dimensions, with ForceAtlas2 as a second algorithm. So are the layered
  layout (cycle breaking, layering, crossing reduction, Brandes–Köpf, routing), the tidy and
  radial trees and the dendrogram. An app can bring another engine (elkjs, d3-force, Graphviz on
  a server) two ways: compute positions and use `'preset'`, or register a function with
  `registerGraphLayout(name, layout)` and use `arrangement: 'custom'`.
- **A layout may arrive after calc.** Calc is synchronous, and by default it runs the layout. A
  trace can ask for it to run in the package's layout worker instead (`worker: 'auto' | true`,
  or `config.worker` for every graph; off by default, as [ADR-011](011-calc-in-web-worker.md)
  is not accepted). Calc then returns at once with a cheap placement marked as pending, the view
  asks the worker and draws the positions it reports once per frame, and when the result is
  there calc runs a second time and finds it. `chart.ready` and image export wait for it. The
  result is the one the main thread would have computed, bit for bit, because the layouts are
  deterministic. Where a worker cannot be started the same code runs on the main thread in
  slices. Registered (`'custom'`) layouts are functions and stay on the main thread.
- **A new package, `@mk7s/holochart-traces-graph`, outside the full bundle**, registered by
  `register(...tracesGraph)` (`graph` and `chord`), `register(...tracesGraph3d)` (`graph3d` and
  the scene it needs) or by importing `@mk7s/holochart/graph`, as ADR-026 did for maps. It
  depends on core, render, runtime, traces-basic and, for `graph3d` only, traces-3d; an app
  that registers `tracesGraph` alone bundles no 3D code. Data helpers (adapters for edge lists,
  node-link JSON, adjacency matrices and a DOT subset; degree, components, Louvain) are pure
  exports of the same package. Express builds figures from tables without depending on it.

## Consequences

### Positive

- Zoom, pan, wheel and pinch, box and lasso selection with `layout.selections`, `uirevision`,
  subplot grids, range and aspect constraints and image export are the cartesian ones. Nothing
  about them is written again for graphs.
- A network over a scatter, or beside a bar chart on a second pair of axes, needs nothing
  special.
- The layouts are usable without the trace (they are exported), testable without WebGL, and
  ready for a worker (ADR-011) because their input and output are transferable arrays.
- No new third-party code to notice, license or track.

### Negative

- **No `domain`, `layout.grid` cell or `domain.row` for a graph.** Several graphs in one figure
  are placed with axis domains, like any cartesian subplots. Each graph has two (hidden) axis
  objects in `fullLayout`.
- **A graph alone inherits the cartesian defaults that do not suit it**: `dragmode: 'zoom'` (a
  box zoom, where graph tools usually pan) and `hovermode` in its `x` or `x unified` forms mean
  nothing for it. The trace answers hover as `closest` whatever the mode.
- **We own three layout engines.** d3-force, dagre and d3-hierarchy are better known and more
  tested than ours will be for some time. The layered layout in particular is the kind of code
  that has long-tail bugs on odd inputs.
- **Layouts are not lazy chunks.** Calc runs them synchronously by default, so they are in the
  package's first chunk (25.6 kB of 233.8 kB), and the worker file carries a second copy
  (29.8 kB), because a worker shares no chunk with the page. The package is opt-in, so the size
  is paid only by apps that draw graphs. The pending state that the worker needed would also
  let the layouts load on demand; that is not done.
- **The worker is opt-in.** A figure that does not ask for it lays out 10,000 nodes on the main
  thread, which blocks the page for about a second.
- **Built before the plugin API is frozen (S3.5).** The package uses the experimental trace
  contract and added to it, and S3.5 has to keep or replace each addition: core's `axisHints`
  and the `_staticPlot` and `_worker` fields of the full layout (the config, as far as a trace
  may see it); the runtime's `TracePlotContext.recalc` (the second calc pass), `HoverPoint.selects`
  (a click on a link selects its two ends), a fourth argument to `eventData` (the selection),
  `KeyboardPoint.click` and `KeyboardStops.locate`.

### Follow-ups

- Whether `worker` should default to `'auto'`. It is one line; it waits for ADR-011, and for
  the worker file to be tested with webpack, Parcel and Rollup (Vite and esbuild were).
- Whether a graph alone should default to `dragmode: 'pan'`.
- `graph3d` has no animated layout, worker, level of detail or bundling; the 2D animation code
  carries two coordinates.
- Moving `image` and `funnel` onto the new axis hook, so that core names no trace type there.

## Alternatives considered

### A `domain` trace with its own view

What the backlog proposed for graphs without positions, and how sankey is placed. Rejected: the
trace would need its own zoom and pan state, wheel and pinch handling, a selection area and
keyboard view keys, which is the part of `traces-geo` that cost the most, and a network over a
scatter would need a second, cartesian mode anyway.

### `d3-force` and `d3-hierarchy` (ADR-006 allows them)

Less code of ours. Rejected for the force layout: `d3-force` works on one object per node, is
two-dimensional (the 3D variant is a third-party fork), and the epic needs 3D, a worker and
10,000 nodes in two seconds. Rejected for trees for consistency: the hierarchical traces already
port their layouts rather than depend on `d3-hierarchy`, and a tidy tree is small.

### dagre, d3-dag or elkjs for layered graphs

dagre and d3-dag are small but have seen little maintenance; elkjs is the best layout and far too
large to bundle (figures from memory, not measured). An app that needs ELK can use it through
`'custom'`.

### One trace type per layout (`forcegraph`, `dag`, `tree`)

Rejected: the data, drawing, hover and interaction are the same; only the positions differ, and
switching a figure between layouts should be one attribute.

## References

- `backlog.md`, "epic: network graphs"
- `packages/traces-graph/src/layout/types.ts` (the layout contract)
- `packages/core/src/defaults/axes.ts` (the `image` and `funnel` axis defaults the hook
  generalises)
- [ADR-026](026-geo-packages-and-bundles.md) (an add-on package and its subpath)
