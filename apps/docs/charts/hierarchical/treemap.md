---
title: Treemap
description: Show a hierarchy as nested rectangles sized by value, and drill into any branch with a click.
status: complete
chart: treemap
---

# Treemap

## Overview

A treemap draws a hierarchy as nested rectangles: the root fills the chart, its children split
its area by value, their children split theirs, and so on. Branches keep a header band with their
label, so the structure stays readable while the areas show how a total divides down the tree: a
budget by department and team, disk usage by folder, sales by department and category. Click a
tile to drill into it; click the header of the current root, or a segment of the path bar above
the chart, to go back up.

Rows name their parent (`labels` and `parents`, or `ids` when labels repeat), exactly as for a
[sunburst](/charts/hierarchical/sunburst). Holochart draws every tile of a trace in one instanced
GPU rect set and all labels in one batched SDF text set, so treemaps of a hundred thousand nodes
stay interactive.

From a table of levels (department, category), [`hx.treemap`](/express/hierarchy) builds the
tree.

Pick a different chart when:

- the hierarchy's depth matters more than its sizes: an [icicle](/charts/hierarchical/icicle) or a
  [sunburst](/charts/hierarchical/sunburst) lines levels up;
- the data has one level and few parts: use a [bar](/charts/basic/bar) or [pie](/charts/basic/pie)
  chart;
- the data is a flow between stages rather than a tree: use a [Sankey diagram](/charts/hierarchical/sankey).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'treemap',
      labels: ['Eve', 'Cain', 'Seth', 'Enos', 'Noam', 'Abel', 'Awan', 'Enoch', 'Azura'],
      parents: ['', 'Eve', 'Eve', 'Seth', 'Seth', 'Eve', 'Eve', 'Awan', 'Eve'],
      values: [10, 14, 12, 10, 2, 6, 6, 4, 4],
    },
  ],
});
```

The root (`''` parent) fills the chart. First-level tiles take the colorway, their descendants
inherit the color, and branches fade towards the background (`marker.depthfade`) so their
children stand out. Tiles are squarified: siblings are sorted by value and laid out in rows that
keep them close to square:

<Example id="treemap/basic" />

## Data format

- **`labels`** and **`parents`** (both required): one row per node. `parents[i]` is the id of
  node `i`'s parent, `''` for a root. Without `ids`, labels are the ids, so labels used as parents
  must be unique.
- **`ids`**: node ids, when labels repeat (the same category under several departments).
  `parents` then refer to ids.
- **Roots.** Several rows with an empty parent get a generated root above them, drawn transparent.
  Without any empty parent, the one parent id that is not a node becomes the root (an _implied_
  root, labeled with its id).
- **`values`**: the size of each node, a number ≥ 0; rows with other values are dropped.
  `branchvalues` says how branches add up:
  - `'remainder'` (default): a node's value is its own share, added to its descendants'. A branch
    is bigger than its children; the difference stays empty in its tile.
  - `'total'`: a node's value is the branch total. Its children must not add up to more (the trace
    is not drawn then, and a warning names the node).
- **Without `values`**, nodes are sized by `count`: the leaves below them (default), their
  branches (`'branches'`), or both (`'branches+leaves'`).
- **`text`**, **`hovertext`** and **`customdata`**: per-node strings and data for labels, hover
  and events.
- **Errors.** Rows that can't make a tree are not drawn, and Holochart logs Plotly's warning
  (`Failed to build treemap hierarchy of trace 0. Error: missing: X`).
- **Placement.** `domain.x` and `domain.y` (fractions of the plot area), or `domain.row` and
  `domain.column` in a [`layout.grid`](/fundamentals/layout-axes-subplots#pies-and-other-domain-traces).
  The treemap fills its domain; the path bar sits just outside it.

## Variations

### Remainder and total values

The same budget read both ways: with `'remainder'` each department's own value is added to its
teams', so the departments carry an overhead besides their teams; with `'total'` a department's
value is its total, and what its teams don't use stays empty:

<Example id="treemap/branchvalues" />

### Tilings

`tiling.packing` picks how children share their parent's area, as d3-hierarchy's tilings do:
`'squarify'` (the default, tiles close to `tiling.squarifyratio`, 1 by default), `'binary'`
(balanced splits), `'dice'` (side by side), `'slice'` (stacked), and `'slice-dice'` or
`'dice-slice'` (alternating by level). `tiling.flip` mirrors the layout along `'x'` and / or `'y'`:

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'treemap',
      labels: ['All', 'A', 'B', 'C', 'a1', 'a2'],
      parents: ['', 'All', 'All', 'All', 'A', 'A'],
      values: [0, 0, 30, 20, 25, 15],
      tiling: { packing: 'slice-dice', flip: 'x' },
    },
  ],
});
```

<Example id="treemap/tilings" />

### Padding and corners

`tiling.pad` (default 3 px) spaces siblings; `marker.pad.t`, `.l`, `.r` and `.b` set the room
around each branch's children. By default the header side gets twice the label size and the other
sides half of it. `marker.cornerradius` rounds the tiles, never more than the padding on the label
side:

<Example id="treemap/padding" />

### Depth fade and colorscales

`marker.depthfade` (on unless `marker.colors` is set) fades branches towards the background, more
the more levels they hold; `'reversed'` keeps the top saturated and fades the leaves. Numbers in
`marker.colors` (or any colorscale attribute) color the tiles through a colorscale instead, with a
colorbar:

<Example id="treemap/depthfade" />

### Levels and the path bar

`maxdepth` limits the levels drawn from the current root (left: the store and its departments);
deeper tiles appear as you drill in. `level` sets the current root to a node's id (right), and
the path bar above the chart lists its ancestors, root first:

<Example id="treemap/levels" />

The path bar's `side` (`'top'` or `'bottom'`), `edgeshape` (`'>'`, `'<'`, `'|'`, `'/'`, `'\'`),
`thickness` (default: `pathbar.textfont.size` plus 6 px) and `textfont` style it; `visible: false`
hides it:

<Example id="treemap/pathbar" />

### Label positions

`textposition` places labels in their tiles: `'top left'` (the default) through `'bottom right'`,
9 positions. Headers stay in their band — at the bottom for the `bottom` positions, which move the
larger padding there too. Labels shrink to fit their tile; one that is short of width wraps at
spaces first when that keeps it larger:

<Example id="treemap/text-position" />

### Uniform text

`layout.uniformtext` draws every tile label at one size, the size of the smallest label that
still fits, as in Plotly (and as for bars and pies). Labels that would have to shrink below
`minsize` to fit are hidden with `mode: 'hide'`, or drawn at the common size with `'show'`.
Headers and path bar labels are sized with the tiles. Drill-down clicks don't animate while it
is on:

<Example id="treemap/uniformtext" />

### Patterns

`marker.pattern` hatches tiles (one shape per node, or one for all). With `fillmode: 'overlay'`
the hatches are drawn over the tile colors; with the default `'replace'` the background is the
paper color:

<Example id="treemap/patterns" />

## Styling

- **Colors.** `marker.colors` (one per node) or, for nodes without one, `layout.treemapcolorway`
  (default: the `colorway`) on the first level; deeper nodes take their parent's color, and a node
  id keeps its color in every treemap of the figure. With `layout.extendtreemapcolors` (default
  `true`) the colorway is extended to three times its length, every color 20% lighter then every
  color 20% darker. The root is `root.color` (default transparent, without an outline).
- **Depth fade.** `marker.depthfade`: `true` (default without `marker.colors`), `false` or
  `'reversed'`, as described above. Not with a colorscale.
- **Colorscales.** `marker.colorscale`, `cmin`, `cmax`, `cmid`, `cauto`, `autocolorscale`,
  `reversescale`, `showscale` and `marker.colorbar`, as for other colorscaled traces, or
  `marker.coloraxis` to share `layout.coloraxis` (its colorscale, domain and one colorbar) with
  other traces. On a color axis, nodes without `marker.colors` are colored by `values`.
- **Outlines.** `marker.line.color` (default: `layout.paper_bgcolor`) and `marker.line.width`
  (default 1 px, centered on the edges); both take one value per node.
- **Shape.** `tiling.pad`, `marker.pad` and `marker.cornerradius`, see above.
- **Patterns.** `marker.pattern` (`shape`, `fillmode`, `size`, `solidity`, `fgcolor`, `bgcolor`,
  `fgopacity`), see [markers and patterns](/customization/markers-patterns).
- **Labels.** Tiles show `textinfo` — `label`, `text`, `value`, `current path`, `percent parent`,
  `percent entry` and `percent root`, one per line (default `'label'`) — or `texttemplate` (the
  sunburst's variables); branches above the last level drawn show their label in the header band,
  unless its padding is 0. `textfont` and `insidetextfont` style labels; unless you set a text
  color, they contrast with their tile. The transparent root's label uses `outsidetextfont`.
- **Path bar.** `pathbar.visible`, `side`, `edgeshape`, `thickness` and `textfont`.
- **Default look.** Tiles take the template's colorway and are outlined in its paper color, so
  they follow the theme in use ([themes and templates](/customization/themes-templates)).

## Interactivity

- **Drill-down.** Clicking a tile makes it the current root — leaves too: the chart zooms into it
  over 750 ms (its tiles grow to fill the chart, the others slide out of the way). Clicking the
  current root's header goes up one level, and clicking a path bar segment goes up to that node.
  The new root is written to the trace's `level` with a GUI `restyle` (so a `restyle` event
  follows, and `uirevision` keeps it across `react`); setting `level` yourself jumps there without
  animation. Under `prefers-reduced-motion: reduce` drilling jumps too.
- **Cancelling.** Before drilling, the chart emits `treemapclick` with the clicked point and
  `nextLevel`, then `click`. A listener of either that returns `false` cancels the drill:

  ```ts
  import { createChart } from '@mk7s/holochart';

  const chart = createChart(document.getElementById('chart')!, {
    data: [{ type: 'treemap', labels: ['All', 'A', 'a1'], parents: ['', 'All', 'A'] }],
  });
  chart.on('treemapclick', (event) => {
    console.log('drilling to', event.nextLevel);
    return event.nextLevel !== 'a1'; // don't zoom into leaves
  });
  ```

- **Hover.** Hovering a tile outlines it (2 px, contrasting the paper) and shows its label at the
  right end of its header band: the label, value, `text`, current path and percentages of its
  parent, the current root and the whole, picked with `hoverinfo`. Path bar segments hover too,
  without the percentage of the current root. `hovertemplate` takes the `texttemplate` variables.
- **Events.** `hover`, `unhover`, `click` and `treemapclick` carry Plotly-shaped points:
  `curveNumber`, `pointNumber`, `label`, `value`, `id`, `parent`, `currentPath`, `entry`, `root`,
  `percentParent`, `percentEntry`, `percentRoot`, `customdata` and `text`. See
  [Hierarchy clicks](/reference/events#hierarchy-clicks) in the events reference.
- Treemaps have no axes or legend entries, so zoom, pan, box or lasso selection and legend
  toggling don't apply to them.

## 3D-native options

Holochart extensions (full bundle), see
[Extrusion & 2.5D](/customization/extrusion-2-5d#pies-treemaps-and-icicles-depth-and-tilt):

- `depth`: each tile's thickness in px, a percentage of its smaller side (`'20%'`), or one number
  per node (per `labels` entry). `0` (default) draws flat tiles.
- `tilt`: lays the chart back, degrees (±80); `0` (default) is the flat view. `perspective` (0–1,
  default 0.5): 0 is a parallel projection, which keeps heights comparable.
- `bevel.size` and `bevel.segments`: rounded edges. `material`: Plotly's lighting model (default),
  `flat`, or a three.js material type.
- A tile stands on its parent's top, so the hierarchy rises in terraces, one per level; with one
  `depth` per node the tiles become a "city" whose heights show a second measure (a height
  treemap).
- Labels sit on the tiles' tops, `marker.line` becomes a gap between tiles, and translucent colors
  (`leaf.opacity`, `marker.depthfade`) are drawn as the flat chart shows them. Hover and click work
  on the tilted tiles; a click still drills down, and the tiles glide to their new places in 3D.

<Example id="treemap/depth" />

<Example id="treemap/depth-height" />

## Performance notes

- A treemap draws its tiles in one instanced rect draw whatever its size, its labels in one
  batched SDF text set, and the path bar in one fill batch with its outlines.
- Building the hierarchy is linear in the rows; the tiling of the current `level` is cached, so
  hovering doesn't recompute it, and the hover outline patches one tile's outline in place.
- Labels are measured only for tiles that can hold one; tiny tiles stay unlabelled.
- The `treemap/large` benchmark (100,011 nodes) builds, tiles, labels and uploads everything on the
  main thread in about a third of a second; the rest of the first frame is the GPU's.
- A drill transition rewrites the rect buffers once per frame for 750 ms.

## Accessibility notes

- **Screen readers:** the hidden description (see the [accessibility guide](/guides/accessibility))
  reads `Treemap "name": N nodes on M levels.`, the current root when drilled in, and the largest
  branches with their shares; its table lists every node with its path, value and percent of the
  root.
- **Keyboard:** there is no keyboard navigation or drilling between tiles yet.
- **Color:** children inherit their parent's color, so label tiles directly (`textinfo`) rather
  than relying on color, and keep the outlines in the background color to separate neighbors.

## Attribute reference

See the [treemap attribute reference](/reference/treemap) for every attribute, its type, and its
default. [`treemapcolorway`](/reference/layout#treemapcolorway) and
[`extendtreemapcolors`](/reference/layout#extendtreemapcolors) are in the layout reference.

## Related charts

- [Icicle](/charts/hierarchical/icicle): the same hierarchy as rows of cells by level
- [Sunburst](/charts/hierarchical/sunburst): the same hierarchy as rings
- [Pie](/charts/basic/pie): one level of parts of a whole

## Plotly migration notes

- Attribute names and defaults match Plotly's `treemap`: `labels`, `parents`, `ids`, `values`,
  `branchvalues`, `count`, `level`, `maxdepth`, `sort`, `tiling` (`packing`, `squarifyratio`,
  `flip`, `pad`), `marker` (`colors` with the colorscale attributes, `line`, `pattern`, `pad`,
  `depthfade`, `cornerradius`), `pathbar`, `root.color`, `text`, `textinfo`, `texttemplate`,
  `textposition`, `hovertext`, `hoverinfo`, `hovertemplate`, `textfont`, `insidetextfont`,
  `outsidetextfont`, `domain`, and the layout's `treemapcolorway` and `extendtreemapcolors`.
  Plotly treemap figures carry over unchanged.
- Tilings (d3-hierarchy's, with Plotly's squarify ratio of 1), paddings, depth fade colors,
  headers, label placement, hover, the path bar, event payloads, drilling and
  `plotly_treemapclick` (`treemapclick`) follow Plotly.
- Differences: labels too wide for their tile wrap at spaces before they shrink; a `click`
  listener returning `false` also cancels the drill; the drill is a GUI `restyle` of `level`
  rather than an `animate` call; labels fade in at the end of the transition instead of moving
  with their tiles; path bar segments are hit-tested as rectangles.
- Not supported yet: `texttemplatefallback` / `hovertemplatefallback`, animated `level` changes
  through `animate` or `react` with a transition, keyboard navigation.
- `depth`, `tilt` and `perspective` (3D-native options above) are Holochart extensions.
