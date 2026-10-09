---
title: Icicle
description: Show a hierarchy as rows or columns of cells, each level next to the one above it, and drill into any branch with a click.
status: complete
chart: icicle
---

# Icicle

<ChartOverview />

## Overview

An icicle chart draws a hierarchy level by level: the root is a column on one side, its children
the next column, split by value, their children the next, and so on — or rows from the top down.
Every node sits next to its parent, inside its span, so depth reads at a glance and sizes compare
along one axis: a budget by department and team, a file system by folder, a call tree by function.
Click a cell to drill into it; click the current root, or a segment of the path bar above the
chart, to go back up.

Rows name their parent (`labels` and `parents`, or `ids` when labels repeat), exactly as for a
[sunburst](/charts/hierarchical/sunburst) or a [treemap](/charts/hierarchical/treemap); icicles
share the treemap's renderer: every cell in one instanced GPU rect set and all labels in one
batched SDF text set.

From a table of levels (region, country), [`hx.icicle`](/express/hierarchy) builds the tree.

Pick a different chart when:

- readers compare the sizes of many leaves: a [treemap](/charts/hierarchical/treemap) uses the
  area better;
- the hierarchy has one level: use a [bar](/charts/basic/bar) chart;
- the data is a flow between stages rather than a tree: use a [Sankey diagram](/charts/hierarchical/sankey).

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'icicle',
      labels: ['Eve', 'Cain', 'Seth', 'Enos', 'Noam', 'Abel', 'Awan', 'Enoch', 'Azura'],
      parents: ['', 'Eve', 'Eve', 'Seth', 'Seth', 'Eve', 'Eve', 'Awan', 'Eve'],
      values: [10, 14, 12, 10, 2, 6, 6, 4, 4],
    },
  ],
});
```

The root is the column on the left, each level the next column, cells as tall as their values.
First-level cells take the colorway, their descendants inherit the color, and leaves are drawn at
70% opacity:

<Example id="icicle/basic" />

## Data format

- **`labels`** and **`parents`** (both required): one row per node. `parents[i]` is the id of
  node `i`'s parent, `''` for a root. Without `ids`, labels are the ids.
- **`ids`**: node ids, when labels repeat. `parents` then refer to ids.
- **Roots.** Several rows with an empty parent get a generated root above them, drawn transparent;
  without any empty parent, the one parent id that is not a node becomes the root.
- **`values`** with `branchvalues` (`'remainder'`, the default, or `'total'`), or **`count`**
  without values, as for the [sunburst](/charts/hierarchical/sunburst#data-format). A branch
  worth more than its children leaves a gap next to them.
- **`text`**, **`hovertext`** and **`customdata`**: per-node strings and data.
- **Errors.** Rows that can't make a tree are not drawn, and Holochart logs Plotly's warning.
- **Placement.** `domain.x` and `domain.y`, or `domain.row` and `domain.column` in a
  [`layout.grid`](/fundamentals/layout-axes-subplots#pies-and-other-domain-traces). The icicle
  fills its domain; the path bar sits just outside it.

## Variations

<ChartVariations />

### Vertical

`tiling.orientation: 'v'` stacks the levels from the top down, cells as wide as their values
(the default `'h'` goes from left to right). `tiling.pad` spaces the cells:

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'icicle',
      labels: ['All', 'A', 'B', 'a1', 'a2'],
      parents: ['', 'All', 'All', 'A', 'A'],
      values: [0, 0, 30, 25, 15],
      tiling: { orientation: 'v', pad: 2 },
      textposition: 'middle center',
    },
  ],
});
```

<ExampleLink id="icicle/vertical" />

### Flipped

`tiling.flip` mirrors the layout: `'x'` puts the root of a horizontal icicle on the right, `'y'`
the root of a vertical one at the bottom:

<ExampleLink id="icicle/flip" />

### Levels and the path bar

`maxdepth` limits the levels drawn from the current root and stretches them over the chart
(left: two levels); deeper cells appear as you drill in. `level` sets the current root (right),
and the path bar lists its ancestors, here below the chart (`pathbar.side: 'bottom'`):

<ExampleLink id="icicle/levels" />

### Colorscale

Numbers in `marker.colors` (or any colorscale attribute) color the cells through a colorscale,
with a colorbar; `marker.pattern` hatches cells:

<ExampleLink id="icicle/colorscale" />

### Uniform text

`layout.uniformtext` draws every cell label at one size, the size of the smallest label that
still fits, as in Plotly (and as for bars and pies). Labels that would have to shrink below
`minsize` to fit are hidden with `mode: 'hide'`, or drawn at the common size with `'show'`.
Path bar labels are sized with the cells. Drill-down clicks don't animate while it is on:

<ExampleLink id="icicle/uniformtext" />

## Styling

- **Colors.** `marker.colors` (one per node) or `layout.iciclecolorway` (default: the `colorway`)
  on the first level; deeper nodes take their parent's color. `layout.extendiciclecolors`
  (default `true`) extends the colorway with lighter and darker copies. The root is `root.color`
  (default transparent).
- **Colorscales.** `marker.colorscale`, `cmin`, `cmax`, `cmid`, `cauto`, `autocolorscale`,
  `reversescale`, `showscale` and `marker.colorbar`, or `marker.coloraxis` to share
  `layout.coloraxis` with other traces (nodes without `marker.colors` are then colored by
  `values`).
- **Leaves.** `leaf.opacity`: 0.7 by default, 1 with a colorscale.
- **Outlines.** `marker.line.color` (default: `layout.paper_bgcolor`) and `marker.line.width`
  (default 1 px, centered on the edges), per node.
- **Layout.** `tiling.orientation`, `tiling.flip` and `tiling.pad`.
- **Patterns.** `marker.pattern`, see [markers and patterns](/customization/markers-patterns).
- **Labels.** `textinfo` or `texttemplate` (the sunburst's variables) in every cell, placed by
  `textposition` (9 positions, default `'top left'`), shrunk to fit and wrapped at spaces when a
  label is short of width. `textfont`, `insidetextfont` and `outsidetextfont` style them; labels
  contrast with their cell unless you set a text color.
- **Path bar.** `pathbar.visible`, `side`, `edgeshape`, `thickness` and `textfont`, as for
  [treemaps](/charts/hierarchical/treemap#levels-and-the-path-bar).

## Interactivity

- **Drill-down.** Clicking a cell makes it the current root — leaves too — over 750 ms; clicking
  the current root goes up one level, and clicking a path bar segment goes up to that node. The new
  root is written to `level` with a GUI `restyle`; setting `level` yourself jumps there. Under
  `prefers-reduced-motion: reduce` drilling jumps too.
- **Cancelling.** The chart emits `icicleclick` with the clicked point and `nextLevel`, then
  `click`; a listener of either that returns `false` cancels the drill.
- **Hover.** Hovering a cell or path bar segment shows its label, value, `text`, current path and
  percentages, picked with `hoverinfo`, or `hovertemplate`.
- **Events.** `hover`, `unhover`, `click` and `icicleclick` carry the same Plotly-shaped points as
  treemaps. See [Hierarchy clicks](/reference/events#hierarchy-clicks) in the events reference.
- Icicles have no axes or legend entries, so zoom, pan, selection and legend toggling don't apply.

## 3D-native options

Holochart extensions (full bundle), see
[Extrusion & 2.5D](/customization/extrusion-2-5d#pies-treemaps-and-icicles-depth-and-tilt):

- `depth`: each tile's thickness in px, a percentage of its smaller side (`'20%'`), or one number
  per node (per `labels` entry). `0` (default) draws flat tiles.
- `tilt`: lays the chart back, degrees (±80); `0` (default) is the flat view. `perspective` (0–1,
  default 0.5): 0 is a parallel projection, which keeps heights comparable.
- `bevel.size` and `bevel.segments`: rounded edges. `material`: Plotly's lighting model (default),
  `flat`, or a three.js material type.
- Cells stand side by side, each level on the plane; with one `depth` per node, levels (or single
  cells) rise to their own heights.
- Labels sit on the tiles' tops, `marker.line` becomes a gap between tiles, and translucent colors
  (`leaf.opacity`, `marker.depthfade`) are drawn as the flat chart shows them. Hover and click work
  on the tilted tiles; a click still drills down, and the tiles glide to their new places in 3D.

<ExampleLink id="icicle/depth" />

## Performance notes

- An icicle draws in the same few draw calls as a treemap whatever its size: one instanced rect
  set for the cells, one batched text set, and the path bar.
- The partition is linear in the nodes and cached for the current `level`.
- Deep hierarchies make thin levels: use `maxdepth` to show a few at a time.

## Accessibility notes

- **Screen readers:** the hidden description reads `Icicle "name": N nodes on M levels.`, the
  current root when drilled in and the largest branches; its table lists every node with its path,
  value and percent of the root.
- **Keyboard:** Tab moves into the plot area; ← / → then move between sibling cells, ↑ goes to the
  parent and ↓ to the first child, and Enter drills in like a click. See [the keys by chart
  family](/guides/accessibility#keys-by-chart-family). The script-tag build leaves these stops out
  for now.
- **Color:** label cells directly rather than relying on the inherited colors.

## Attribute reference

See the [icicle attribute reference](/reference/icicle) for every attribute, its type, and its
default. [`iciclecolorway`](/reference/layout#iciclecolorway) and
[`extendiciclecolors`](/reference/layout#extendiciclecolors) are in the layout reference.

## Related charts

- [Treemap](/charts/hierarchical/treemap): the same hierarchy as nested rectangles
- [Sunburst](/charts/hierarchical/sunburst): the same hierarchy as rings
- [Sankey](/charts/hierarchical/sankey): flows between stages

## Plotly migration notes

- Attribute names and defaults match Plotly's `icicle`: `labels`, `parents`, `ids`, `values`,
  `branchvalues`, `count`, `level`, `maxdepth`, `sort`, `tiling` (`orientation`, `flip`, `pad`),
  `marker` (`colors` with the colorscale attributes, `line`, `pattern`), `leaf.opacity`,
  `pathbar`, `root.color`, `text`, `textinfo`, `texttemplate`, `textposition`, `hovertext`,
  `hoverinfo`, `hovertemplate`, the fonts, `domain`, and the layout's `iciclecolorway` and
  `extendiciclecolors`. Plotly icicle figures carry over unchanged.
- The partition, label placement, hover, the path bar, event payloads, drilling and
  `plotly_icicleclick` (`icicleclick`) follow Plotly.
- Differences: labels too wide for their cell wrap at spaces before they shrink; a `click`
  listener returning `false` also cancels the drill; the drill is a GUI `restyle` of `level`;
  labels fade in at the end of the transition.
- Not supported yet: `texttemplatefallback` / `hovertemplatefallback`, animated `level` changes
  through `animate` or `react`.
