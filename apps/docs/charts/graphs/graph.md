---
title: Network graph
description: Nodes and the links between them, at positions you give or placed by a layout (force-directed, layered, tree, circular, arc diagram, hive plot).
status: complete
chart: graph
launch-featured: true
---

# Network graph

<ChartOverview />

## Overview

A `graph` trace draws a network: **nodes**, and **links** that each join two of them. Use it for
who works with whom, which module imports which, the states of a machine and the moves between
them, a file tree, a clustering tree. The data is two containers, `node` and `link`, shaped like
[sankey](/charts/hierarchical/sankey)'s: every link names its `source` and its `target` node by
index.

Where the nodes go is the trace's `arrangement`. With `'preset'` they are at the `x` and `y` you
give them. Every other value runs a layout that places them: `'force'`, `'layered'`, `'tree'`,
`'radial'`, `'dendrogram'`, `'circular'`, `'grid'`, `'arc'`, `'hive'`, or `'custom'` for a layout
of your own. Changing a figure from one to another is one attribute.
[Choosing an arrangement](/fundamentals/graphs#choosing-an-arrangement) says which suits which
graph.

The trace is cartesian: it is drawn on an `xaxis` and a `yaxis`, so zoom, pan, box and lasso
selection, subplots and image export are the ones a [scatter](/charts/basic/scatter) has. Under
a computed arrangement the axes are hidden, so a figure with one graph shows no axes (a
[dendrogram](#dendrogram) and a [timeline](#a-timeline) keep one).

Network graphs are not part of the full bundle. Add one import next to it, or register
`tracesGraph` in a partial bundle (see
[adding the package](/fundamentals/graphs#adding-the-package)):

```ts
import '@mk7s/holochart';
import '@mk7s/holochart/graph';
```

Pick a different chart when:

- the links carry a quantity that is conserved from one end of the diagram to the other (energy,
  money, visitors): use a [sankey](/charts/hierarchical/sankey), whose link widths add up at
  every node;
- the question is how much goes between a few groups, in both directions: use a
  [chord diagram](/charts/graphs/chord);
- the graph is dense, most nodes linked to most others: a node-link drawing turns into a ball of
  lines, and [an adjacency matrix](/fundamentals/graphs#the-adjacency-matrix) shows every link as
  a cell;
- the data is a hierarchy whose parts add up to their parent (disk space, a budget): use a
  [treemap](/charts/hierarchical/treemap) or a [sunburst](/charts/hierarchical/sunburst), which
  show the sizes;
- the network is to be looked at in space, turned and flown through: use
  [graph3d](/charts/graphs/graph3d), the same data in a 3D scene.

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph',
      node: { label: ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli'] },
      link: { source: [0, 0, 1, 2, 3], target: [1, 2, 2, 3, 4] },
    },
  ],
});
```

Nodes are numbered by their index in `node.label`, and link _k_ joins node `source[k]` to node
`target[k]`. No positions are given, so the arrangement is `'force'`: linked nodes are pulled
together and all nodes are pushed apart. The axes are hidden. The live example is the same
figure with fifty-six nodes in four teams, colored by `node.group`:

<Example id="graph/force" />

## Data format

- **Nodes.** Everything about nodes is one entry per node index: `node.label`, `node.x`,
  `node.y`, `node.group`, `node.value`, `node.customdata`, and `node.size` and `node.color` when
  they are arrays. The number of nodes is the length of the longest of them. When the trace has
  none of them, it is one more than the largest index a link names, as for a sankey. A trace
  without nodes is not drawn.
- **Links.** `link.source` and `link.target` are parallel arrays (typed arrays work), one entry
  per link; with different lengths the shorter one wins. An entry is a node index: a whole
  number, or a numeric string of one. A link whose source or target is not a node (out of range,
  negative, not a whole number, missing) is dropped. A link from a node to itself is kept and
  drawn as a loop. Several links may join the same two nodes; each is drawn.
- **`link.value`.** A positive number per link: its weight for the layouts, `%{value}` in hover
  labels, and its width with `link.widthby: 'value'`. A link without a value, or with one that is
  not positive, weighs 1.
- **Trees.** A tree can be given the way the [treemap](/charts/hierarchical/treemap) takes one,
  as `labels` and `parents` (and `ids`), instead of links. The trace reads them when `parents`
  is given and `link.source` is not. Every row is a node; its id is `ids[i]`, else `labels[i]`,
  and `parents[i]` is the id of its parent, `''` for a root. Every row with a parent gets a link
  from the parent to it. A parent that is no row's id becomes a node of its own, after the rows.
  When two rows have one id, children attach to the first. A row that names itself as its
  parent, or a chain of parents that comes back to where it started, is cut where it closes.
  `labels` is the default of `node.label`.
- **Positions.** With `arrangement: 'preset'`, `node.x` and `node.y` are data on the trace's
  axes: numbers, dates or categories by the type of the axis. A node without an `x` or a `y` is
  not drawn, and neither are its links. Under a computed arrangement positions are **layout
  units**, CSS px at the size the graph is laid out for, before the result is fitted to the plot
  area. Of the built-in layouts only `'force'` reads given positions then: it holds a node that
  has both where it is (see [pinned nodes](#pinned-nodes)).
- **The default arrangement.** `'preset'` when `node.x` and `node.y` both have an entry for every
  node, else `'force'`.
- **Data per item.** `node.customdata` and `link.customdata` (one entry per node or link) reach
  hover templates and events. `link.label` names a link in its hover label.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

// A tree from labels and parents: every row with a parent gets a link from it.
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph',
      arrangement: 'tree',
      labels: ['Company', 'Product', 'Sales', 'Design', 'Engineering', 'Europe'],
      parents: ['', 'Company', 'Company', 'Product', 'Product', 'Sales'],
    },
  ],
});
```

Data in another shape (a list of pairs, node-link JSON, a DOT file, an adjacency matrix) goes
through an adapter that returns `node` and `link`: see
[getting data in](/fundamentals/graphs#getting-data-in).

## Variations

<ChartVariations />

### Given positions

Giving every node an `x` and a `y` selects `arrangement: 'preset'`. The positions are data, so
the axes would show; this figure hides them and sets `yaxis.scaleanchor: 'x'` to keep the shape
of the graph, which a computed arrangement does by itself:

<ExampleLink id="graph/basic" />

### Force-directed, and ForceAtlas2

`arrangement: 'force'` runs a simulation of forces to rest and draws the result. It has two
models, chosen by `force.algorithm`:

- `'spring'` (default): links are springs with a rest length (`force.linkdistance`, 30 layout
  units) and every two nodes repel (`force.charge`, −60; more negative gives a larger, more open
  layout). Link lengths come out even, which suits most graphs.
- `'forceatlas2'`: links pull in proportion to their length and nodes repel in proportion to
  their number of links, so hubs push each other apart and take their neighbours with them.
  `force.scalingratio` sets the repulsion, and `force.linlog` tightens the clusters.

Both keep nodes from overlapping (`force.collide`, `force.collidepadding`), pull toward the
center so that parts without a link between them stay together (`force.gravity`), and can pull
the nodes of a group toward each other (`force.groupstrength`). `link.value` weighs a link:
`force.linkweight` says whether a larger value pulls harder (`'strength'`, the default), makes
the link shorter (`'distance'`) or does nothing (`'none'`). The layout is
[deterministic](/fundamentals/graphs#determinism): the same figure gives the same picture on
every machine, and `force.seed` gives another, equally valid one.

Here ForceAtlas2 lays out a graph that has hubs, with the nodes sized by their number of links:

<ExampleLink id="graph/force-atlas2" />

### A real network: Les Misérables

The characters of the novel, linked when they appear together, from Knuth's Stanford GraphBase.
The data has no groups: [`louvain`](/fundamentals/graphs) finds the communities from the links,
each named here after its most-connected character, and the legend hides and shows them.
`node.sizeby: 'degree'` sizes a character by the number of others they meet, and
`link.widthby: 'value'` draws a link as wide as the number of times the two appear together.
Hover a character to keep only the ones they meet:

<ExampleLink id="graph/les-miserables" />

### Watching the layout settle

`force.simulate: true` draws the simulation as it cools, a few steps per frame, from a spiral
to the settled layout. The picture it ends on is the one the figure gives without `simulate`,
and the axes are sized for it from the start. Hover and selection follow the nodes while they
move. It runs again when something the layout reads changes (the nodes, the links, their sizes,
the `force` options), not when a color or a label does:

<ExampleLink id="graph/force-simulate" />

### Pinned nodes

Under `'force'`, a node that has both an `x` and a `y` stays there, and the others settle around
it. Give `null` to the nodes that are free. The positions are layout units, and the result is
fitted to the plot area, so what counts is where the pinned nodes are relative to each other.
The three pinned hubs here also have a `node.symbol` and a `node.size` of their own:

<ExampleLink id="graph/force-pinned" />

A pinned node has a ring. On the chart, [dragging a node](#dragging-and-pinning) pins it and a
double-click releases it.

### A timeline

When every node has an `x` and none has a `y`, the x axis of a `'force'` graph is a real axis,
shown and typed from the data (dates work). Each node keeps its `x`, and the layout moves it
along y only. With `y` and no `x` it is the y axis instead:

<ExampleLink id="graph/timeline" />

### Layered diagrams

`arrangement: 'layered'` draws a directed graph in layers, every link pointing the same way:
pipelines, dependencies, state machines. Two defaults follow the arrangement: nodes that have
labels are boxes with the text inside (`node.shape: 'box'`), and links have an arrowhead at
their target (`link.arrow.end`). A link that crosses several layers is routed between the
boxes. `layered.clusters: true` keeps the nodes of a `node.group` together and draws a frame
around each group, tinted in its color, with its name; `layered.ranksep` and `layered.nodesep`
set the room between layers and between the nodes of one:

<ExampleLink id="graph/layered" />

### Direction and routing

`layered.rankdir` is the direction the links point in: `'TB'` (top to bottom, the default),
`'BT'`, `'LR'` or `'RL'`. `layered.routing` is the shape of the links: `'spline'` (smooth
curves, the default), `'polyline'` (straight segments through the same points) or
`'orthogonal'` (horizontal and vertical segments):

<ExampleLink id="graph/layered-orthogonal" />

### Cycles

A graph with cycles cannot have every link point the same way. The layout turns as few links
around as it can, and those are drawn in the `link.secondary` style: dashed and a little
fainter by default (`link.secondary.dash`, `.opacity`, `.color`). Their arrowheads still point
the way the data says:

<ExampleLink id="graph/layered-cycle" />

### A larger diagram

Forty modules and what each imports, left to right, colored by `node.group`. When a diagram of
box nodes is larger than the plot area, the boxes shrink with the axes, text included, so that
it is drawn smaller instead of with its boxes run together; zoom in to read it:

<ExampleLink id="graph/dependencies" />

### Trees

`arrangement: 'tree'` is a tidy tree: every parent in the middle of its children, subtrees as
close as their outlines allow. It grows from the left by default (`tree.orientation: 'LR'`; also
`'RL'`, `'TB'`, `'BT'`), so that labels read along the levels. `tree.links` is `'curved'`
(default), `'straight'` or `'elbow'`, and `tree.sort` orders the children of a node: as given,
by the number of nodes below them (`'size'`) or by `node.value`.

The tree is the one `parents` gives. With `link.source` and `link.target` instead, each node
hangs from the first node that links to it, starting at the nodes without incoming links, and
the links left over are drawn in the `link.secondary` style:

<ExampleLink id="graph/tree" />

### Radial tree

`arrangement: 'radial'` is the same tree on rings around its root. It fits a wide tree into a
square. Labels run along the radius and are never upside down. `tree.sector.start` and
`tree.sector.span` limit the tree to a part of the circle (`span: 180` is a half circle):

<ExampleLink id="graph/radial-tree" />

### Dendrogram

`arrangement: 'dendrogram'` puts the leaves on one line and every other node at the height
`node.value` gives it, the distance at which a clustering joined two clusters; a leaf without a
value is at 0. The axis of the heights is a real axis, with ticks in the units of the data, and
the other one stays hidden. Without `node.value` the levels are `tree.ranksep` apart and both
axes are hidden. A dendrogram grows from the top (`tree.orientation: 'TB'`) with elbow links by
default, and its `node.size` defaults to 6 instead of 10:

<ExampleLink id="graph/dendrogram" />

### Folding a tree

`tree.collapsed` lists the nodes whose subtrees are folded away, as node indices or, with tree
input, as ids. The nodes below a collapsed node are not drawn and take no room, and the node
gets a ring. A click on a node that has children folds or unfolds it, in the three tree
arrangements (see [Interactivity](#interactivity)):

<ExampleLink id="graph/collapsible-tree" />

### On a circle

`arrangement: 'circular'` places the nodes evenly on a circle, clockwise from the top, the nodes
of a group next to each other, with every label pointing away from the center. `link.curve`
bows the links, which separates the short ones near the rim:

<ExampleLink id="graph/circular" />

### In a grid

`arrangement: 'grid'` places the nodes in rows, left to right and top to bottom, in a grid as
close to square as their number allows. They are in the order of the data, or group after group
when the nodes have groups. This graph is given as `labels` and `parents`:

<ExampleLink id="graph/grid" />

### Arc diagram

`arrangement: 'arc'` puts every node on one line and draws every link as an arc over it, so the
order of the nodes is the picture. `arc.order` sets it: `'input'`, `'group'` (the default when
the nodes have groups), `'degree'` (most links first) or `'barycenter'` (the given order
improved so that linked nodes are close). `arc.sides` puts the arcs above the line, below it,
or by direction: above for a link that points forward and below for one that points back.
`arc.orientation: 'v'` makes the line vertical:

<ExampleLink id="graph/arc" />

### Hive plot

`arrangement: 'hive'` puts the nodes on a few axes around a center: one axis per `node.group`,
with the group's name at its end, and along each axis in order of their number of links, the
least linked nearest the center (`hive.position: 'value'` places them by `node.value` instead).
Links run between the axes. A link between two nodes of one axis is not drawn. Without groups,
`hive.assign` and `hive.axes` say how nodes get their axis:

<ExampleLink id="graph/hive" />

### A layout of your own

`registerGraphLayout(name, layout)` adds a layout, and `arrangement: 'custom'` with
`custom.name` runs it. A layout is a function from the graph, as typed arrays, to a position per
node in layout units:

```ts
import { createChart } from '@mk7s/holochart';
import { registerGraphLayout } from '@mk7s/holochart/graph';

// Every node on one line, 40 layout units from the one before.
registerGraphLayout('line', (graph) => ({
  x: Float64Array.from({ length: graph.nodes }, (_, i) => i * 40),
  y: new Float64Array(graph.nodes),
}));

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph',
      arrangement: 'custom',
      custom: { name: 'line' },
      node: { label: ['a', 'b', 'c', 'd'] },
      link: { source: [0, 1, 2], target: [1, 2, 3] },
    },
  ],
});
```

The function gets the node count, `source`, `target` and `weight` per link, the half extents
of the nodes, the positions the figure gives, groups and parents, and `custom.options` as its
second argument. It runs when the chart computes the trace, and has to be deterministic and
return a finite position for every node; a node without one is not drawn. A name that is not
registered, and a layout that throws, are drawn as `'circular'` with a console warning. The
table of layouts is shared by every chart of the page: registering a name again replaces the
layout, and `registerGraphLayout` returns a function that removes it.
[Bringing your own layout](/fundamentals/graphs#bringing-your-own-layout) has the whole
contract. This example registers a spiral with the most linked nodes in the middle:

<ExampleLink id="graph/custom-layout" />

### Node size

`node.size` is a diameter in CSS px, one for all nodes or one per node. `node.sizeby` sizes the
nodes by their links instead: `'degree'` (all links at the node), `'indegree'` (links that end
at it) or `'outdegree'` (links that start at it). The area grows with the count, between the
two diameters of `node.sizerange` (default `[6, 30]`):

<ExampleLink id="graph/size-by-degree" />

### Groups and a legend

`node.group` is a name or a number per node. Each group takes a color of the colorway and gets
a legend item, and the arrangements that can keep the nodes of a group together (`'circular'`,
`'arc'`, `'hive'`, `'layered'` with `clusters`, `'force'` with `groupstrength`) do so. A click
on a legend item hides the group:

<ExampleLink id="graph/groups" />

### Colors from numbers

Numbers in `node.color` go through a colorscale, as scatter's `marker.color` does:
`node.colorscale`, `node.cmin` / `node.cmax`, `node.reversescale`, a shared `node.coloraxis`,
and `node.showscale` for the colorbar. See
[colors and colorscales](/fundamentals/colors-colorscales). `link.color` takes one color for
all links or one per link:

<ExampleLink id="graph/colorscale" />

### Box nodes

`node.shape: 'box'` draws every node as a box as large as its label, with the text inside, in
black or white, whichever reads better on the box. `node.textfont` sets the size of the text and
so of the boxes; `node.size` and `node.sizeby` do not apply. It is the default under
`'layered'`, and works with any arrangement:

<ExampleLink id="graph/boxes" />

### Labels

`node.label` is drawn next to each node. `node.textposition` says where: `'auto'` (default)
puts it where the arrangement leaves room, to the right of the node in general, away from the
center around a circle, beyond the leaves of a tree, under the line of an arc diagram. The nine
positions of scatter's `textposition` (`'top center'`, `'middle left'`, …) fix it, and `'none'`
draws no labels. `node.textfont` sets the font; by default the text has a thin halo so that it
reads over the links.

Labels that would overlap are not all drawn. They are placed in order of the number of links
of their node, most first, and a label is kept when it overlaps neither a label kept before it
nor a node that came before it. So the most connected nodes keep their labels, and the others
appear as zooming in makes room. A label that is not drawn is still the first line of its node's
hover label. Of the 2,000 labels of this graph, the view shows the ones that fit:

<ExampleLink id="graph/large" />

### Directed links, parallel links and loops

`link.arrow.end` draws an arrowhead at the target of every link and `link.arrow.start` one at
the source; `link.arrow.size` is their length (8 px, and at least three times the width of the
link). The tips stop at the edge of the node, whatever its size. Links between the same two
nodes are fanned out into curves so that each shows, and a link from a node to itself is a
loop. `link.curve` sets the bow yourself, in place of the fan: a fraction of the link's length,
positive to the left of its direction, one value or one per link.

<ExampleLink id="graph/directed" />

### Link width by value

`link.width` is a width in CSS px, one for all links or one per link. `link.widthby: 'value'`
takes the widths from `link.value` instead, in proportion to it, between the two widths of
`link.widthrange` (default `[1, 8]`: a value of 0, and the largest value). Here the same values
also shorten the links, with `force.linkweight: 'distance'`:

<ExampleLink id="graph/weighted-links" />

### Edge bundling

`link.bundle.method` draws links that run the same way together, so that a dense graph shows
where its links go. `'hierarchical'` routes each link through the middle of its nodes' groups
(or along the tree, under a tree arrangement), which suits `'circular'` and `'radial'`:

<ExampleLink id="graph/bundle-circular" />

`'force'` lets links that lie alongside each other attract, for graphs without groups; it is
refused above 20,000 links, with a warning. `'auto'` picks by whether the nodes have groups.
`link.bundle.strength` runs from 0 (straight) to 1 (default 0.85). The nodes do not move, the
bundles arrive a moment after them, and hover finds a link on its curve:

<ExampleLink id="graph/bundle-force" />

### Highlighting a neighbourhood

Hovering a node keeps it, its links and the nodes they lead to, and dims the rest; hovering a
link keeps the link and its two ends. `highlight.hops` widens the neighbourhood to the nodes
within that many links, and `highlight.direction` follows the arrows one way only: `'out'` for
what a node leads to, `'in'` for what leads to it. `highlight.nodes` highlights the
neighbourhoods of the nodes it lists without a pointer, as here, two links around one node:

<ExampleLink id="graph/highlight" />

### Dragging and pinning

Under `'force'` and `'preset'` a press on a node drags it. With `force.simulate` the other nodes
give way while it moves. The node stays where it is dropped: it is pinned, has a ring, and a
double-click lets it go again.

<ExampleLink id="graph/drag" />

### A path between two nodes

When exactly two nodes are selected, the shortest path between them is highlighted. It is the
path with the fewest links, or with `highlight.pathweight: 'value'` the one whose `link.value`
entries add up to the least. `highlight.path: [from, to]` asks for a path from the figure:

<ExampleLink id="graph/path" />

### Over another trace, on data axes

Under `'preset'` the positions go through the axis scales like any trace's, so a graph can
share its axes with other traces. Here the x axis is a date axis and the y axis is logarithmic,
and the graph links the releases of a product over a line of its users. A zoom or a pan moves
both:

<ExampleLink id="graph/over-scatter" />

### Several graphs in one figure

A `graph` trace has no `domain`. Like any cartesian trace it is placed by the domains of its
axes: the second trace names a second pair (`xaxis: 'x2'`, `yaxis: 'y2'`), and
`layout.xaxis.domain` and `layout.xaxis2.domain` give each pair its part of the figure (see
[subplots](/fundamentals/layout-axes-subplots#subplots-with-domain-and-anchor)). Each pair is
hidden by its graph and zooms and pans on its own. `layout.hiddenlabels` is one list for the
figure, so a legend item hides its group in every graph that has a group of that name:

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

const link = { source: [0, 0, 1, 2], target: [1, 2, 2, 3] };

createChart(document.getElementById('chart')!, {
  data: [
    { type: 'graph', arrangement: 'force', link },
    { type: 'graph', arrangement: 'circular', xaxis: 'x2', yaxis: 'y2', link },
  ],
  layout: {
    xaxis: { domain: [0, 0.48] },
    xaxis2: { domain: [0.52, 1] },
    yaxis2: { anchor: 'x2' },
  },
});
```

<ExampleLink id="graph/side-by-side" />

### From a table, with Express

[`hx.graph`](/express/mappings#networks) builds the trace from a table of links and, optionally,
a table of nodes: columns for the two ends and the weight of a link, and for the color, the size
and the hover data of a node.

## Styling

- **Nodes.** `node.size` (default 10 px) or `node.sizeby` with `node.sizerange`; `node.symbol`
  (the [marker symbols](/reference/marker-symbols) of scatter, one or one per node);
  `node.opacity`; `node.line.color` and `node.line.width` for the outline (default: 1 px in the
  color of the plot background, which sets nodes off from the links and from each other).
- **Node colors.** In this order: numbers in `node.color` through the colorscale; CSS colors in
  `node.color` as given, one or one per node; else the color of the node's group, from the
  colorway in order of first appearance; else the trace's colorway color.
- **Boxes.** `node.shape: 'box'`, sized by `node.textfont`. A box takes the node's color, and
  its text is black or white unless `node.textfont.color` is set.
- **Labels.** `node.textposition` and `node.textfont` (`family`, `size`, `color`, `weight`,
  `style`, `shadow`). The default is `layout.font` with `shadow: 'auto'`, a halo in the contrast
  color of the text.
- **Links.** `link.color` (one or one per link; default: a translucent gray chosen for the plot
  background, light or dark), `link.width` or `link.widthby`, `link.opacity`, `link.curve`,
  `link.arrow`, and `link.dash` (`'solid'`, `'dot'`, `'dash'`, `'longdash'`, `'dashdot'`,
  `'longdashdot'` or a dash list such as `'5px,10px'`), which is one style for every link of the
  trace.
- **Secondary links.** `link.secondary` (`dash`, `opacity`, `color`) styles the links an
  arrangement sets apart: the back links of a `'layered'` graph, and under the tree arrangements
  the links that are not part of the tree.
- **Selection styles.** `selected.node` and `unselected.node` (`color`, `opacity`). Unless one
  of the two opacities is set, the nodes outside a selection are drawn at 0.2 of their opacity.
- **Draw order.** Links are under arrowheads, arrowheads under nodes and nodes under labels;
  group frames and the axes of a hive plot are under all of them. `zorder` orders the trace
  among the other traces of its subplot, as for scatter.
- **Themes.** The trace takes its colors from the layout: node colors from `layout.colorway`,
  label text from `layout.font`, and the defaults of outlines and links from the plot
  background. So it follows a [template](/customization/themes-templates) without settings of
  its own.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph',
      arrangement: 'circular',
      node: {
        label: ['Draft', 'Review', 'Approved', 'Merged'],
        symbol: 'diamond',
        size: 16,
        color: '#4c78a8',
        line: { color: '#ffffff', width: 1.5 },
        textfont: { size: 13, weight: 'bold' },
      },
      link: {
        source: [0, 1, 1, 2],
        target: [1, 0, 2, 3],
        width: 1.5,
        dash: 'dot',
        color: 'rgba(120, 144, 180, 0.8)',
        arrow: { end: true, size: 10 },
      },
    },
  ],
});
```

## Interactivity

- **Hover.** A node is hit inside its outline (a small node within 3 px of its center), and
  where nodes overlap the one whose center is nearest. Elsewhere the link whose path passes
  within 4 px of the pointer is hit. A node shows its label, its number of links (in and out
  when the trace draws arrowheads), its group and its `node.value`; a link shows the labels of
  its two ends, its `link.label` and its value. The trace answers as `hovermode: 'closest'`
  whatever the mode: the `x` and `x unified` modes mean nothing for a graph.
- **Templates.** `node.hovertemplate` and `link.hovertemplate` format the two kinds of label.
  Nodes have `%{label}`, `%{degree}`, `%{indegree}`, `%{outdegree}`, `%{neighbors}` (the
  number of nodes it is linked to), `%{group}`, `%{value}`,
  `%{size}`, `%{color}`, `%{x}`, `%{y}` and `%{customdata}`; `%{x}` and `%{y}` are the positions
  the figure gives, under `'preset'` and along the real axis of a timeline. Links have
  `%{label}`, `%{value}`, `%{source.label}`, `%{target.label}`, `%{source.index}`,
  `%{target.index}` and `%{customdata}`. `<extra>…</extra>` replaces the trace name. See
  [hover text and templates](/fundamentals/hover-text-templates).

  ```ts
  import { createChart } from '@mk7s/holochart';
  import '@mk7s/holochart/graph';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'graph',
        node: {
          label: ['api', 'auth', 'db'],
          hovertemplate: '%{label}: %{indegree} in, %{outdegree} out<extra></extra>',
        },
        link: {
          source: [0, 0, 1],
          target: [1, 2, 2],
          value: [120, 80, 40],
          arrow: { end: true },
          hovertemplate:
            '%{source.label} → %{target.label}<br>%{value} calls a minute<extra></extra>',
        },
      },
    ],
  });
  ```

- **Hover control.** `hoverinfo` is `'all'`, `'none'` (events without labels) or `'skip'` (no
  hover and no events). The trace's value is the default of `node.hoverinfo` and
  `link.hoverinfo`, which set it for nodes and links apart: `link.hoverinfo: 'skip'` leaves
  hover to the nodes.
- **Zoom and pan.** They are the cartesian ones: see
  [drag modes](/fundamentals/interaction-events#drag-modes). The default `dragmode` is `'zoom'`,
  a zoom box, and the wheel scrolls the page. For the way graph tools usually behave, a drag
  that pans and a wheel that zooms, set `layout.dragmode: 'pan'` and `config.scrollZoom: true`.
  A double-click resets the view. Zooming in brings out more labels.

  ```ts
  import { createChart } from '@mk7s/holochart';
  import '@mk7s/holochart/graph';

  createChart(document.getElementById('chart')!, {
    data: [{ type: 'graph', link: { source: [0, 1, 2], target: [1, 2, 0] } }],
    layout: { dragmode: 'pan' },
    config: { scrollZoom: true },
  });
  ```

- **Selection.** With `dragmode: 'select'` or `'lasso'`, a drag selects the nodes whose center
  is inside the box or the lasso. Selected and unselected nodes take their `selected.node` and
  `unselected.node` styles; links between two selected nodes keep their style and the others are
  dimmed. `selectedpoints` holds the selection as node indices, and the points of `selecting`
  and `selected` events carry the node fields below, with `links`: the indices of the node's
  links to the other selected nodes, so that all the points together list the links among the
  selection. A click on a link selects its two ends. See
  [selections](/fundamentals/interaction-events#selections).
- **Legend.** With `node.group` the legend has one item per group, in order of first
  appearance. A click on an item hides the nodes of the group and their links (it toggles the
  name in `layout.hiddenlabels`, as for the slices of a pie), and a double-click shows that
  group alone. The other nodes stay where they are: a hidden group still takes part in the
  layout. When `node.color` is an array, the colors say nothing about the groups, and the
  legend has one item for the trace instead. A trace without groups has no legend item unless
  `showlegend: true`. Numbers in `node.color` have a colorbar (`node.showscale`).
- **Folding a tree.** Under `'tree'`, `'radial'` and `'dendrogram'`, a click on a node that has
  children folds its subtree away, and a second click unfolds it; the pointer is a hand over
  such a node. From the keyboard, Enter on the node's stop does the same. The chart updates
  `tree.collapsed` itself and emits `restyle`, as for any change
  made on the chart (`uirevision` keeps it), and the tree moves to its new shape.
  `tree.collapsed` then holds ids when the trace gives `ids`, else node indices.
  `tree.collapsible: false` turns the click off.

  ```ts
  chart.on('restyle', ({ update }) => console.log(update['tree.collapsed']));
  ```

- **Highlighting.** A hover highlights a neighbourhood, as [above](#highlighting-a-neighbourhood).
  Only colors and opacities change, so it costs about a millisecond on 2,000 nodes and three on
  10,000; a trace with more than 50,000 nodes and links together is not highlighted. Labels
  that culling had hidden show for the highlighted nodes. `highlight.mode` chooses what
  highlights: `'neighbors'`, `'path'`, both (`'neighbors+path'`, the default) or `'none'`.
  `highlight.dim` is the opacity of what is dimmed (0.15), and `highlight.color` a color for
  the highlighted links in place of their own. While something is highlighted it replaces the
  dimming of a selection. It follows the pointer: the keyboard cursor and `chart.hover()` show
  a label and highlight nothing.

  ```ts
  import { createChart } from '@mk7s/holochart';
  import '@mk7s/holochart/graph';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'graph',
        link: { source: [0, 1, 2, 3], target: [1, 2, 3, 4], arrow: { end: true } },
        // What a node leads to, two links away.
        highlight: { hops: 2, direction: 'out', dim: 0.1 },
      },
    ],
  });
  ```

- **Dragging.** `node.draggable` says whether a press on a node drags it: it is on by default
  under `'preset'` and `'force'` (not on a timeline), off under `'custom'`, and the nodes of the
  other arrangements do not drag, because their layouts place every node. A press that does not
  move is still a click, and a press on empty space is still the chart's own drag (`dragmode`).
  What the release writes depends on the arrangement, and the chart emits it as a `restyle`,
  as for any change made on the chart (`uirevision` keeps it):
  - `'preset'`: the node's `node.x` and `node.y`, as data. A date axis gets a date, a log axis
    a value, and a category axis the nearest category.
  - `'force'`: the node's `node.x` and `node.y`, which [pin](#pinned-nodes) it, and
    `force.start`, the picture on screen, so that the other nodes stay where they are. Only
    the dragged node moves.
  - `'force'` with `force.simulate`: the simulation runs while the node is dragged, with the
    node held at the pointer, so its neighbours follow. The release writes the pin, and a
    second `restyle` of `force.start` follows when the layout is at rest again.

  A pinned node has a ring in its own color. A double-click on it unsets its coordinates and
  warms the layout up again. Once `force.start` holds a settled picture, a change of another
  `force` option does not run the layout until `force.start` is unset.

  ```ts
  chart.on('restyle', ({ update }) => {
    if ('node.x' in update) console.log('a node was dropped or released');
  });
  ```

- **Paths.** With `'path'` in `highlight.mode`, two selected nodes highlight a shortest path
  between them, as [above](#a-path-between-two-nodes). On a trace that draws arrowheads the
  path follows the arrows, tried from each of the two nodes; `highlight.pathdirected: false`
  ignores direction. Nodes that are not drawn are not passed through, and when there is no path
  nothing is highlighted. The points of the `selected` event then carry `path`, with its
  `nodes`, its `links` and its `length`; `graphPath(chart.fullData[i])` returns the same for a
  trace at any time.
- **Events.** `hover`, `unhover` and `click` points say what they are in `kind`: `'node'` or
  `'link'`. `pointNumber` is the node index, or the index of the link in the `link` arrays, next
  to `curveNumber`. A click on a node that folds still emits `click`.

  | Node field                        | Contents                                                  |
  | --------------------------------- | --------------------------------------------------------- |
  | `kind`                            | `'node'`                                                  |
  | `index`                           | The node index                                            |
  | `label`                           | Its label (`''` without one)                              |
  | `degree`, `indegree`, `outdegree` | Its number of links: all, ending at it, starting at it    |
  | `neighbors`                       | The number of nodes it is linked to                       |
  | `group`                           | The name of its group, if it has one                      |
  | `value`                           | Its `node.value`, if it is a number                       |
  | `size`                            | Its diameter in px (a box: its larger side)               |
  | `color`                           | Its `node.color` entry                                    |
  | `customdata`                      | Its `node.customdata` entry                               |
  | `x`, `y`                          | The positions the figure gives, as in the hover templates |

  | Link field         | Contents                                               |
  | ------------------ | ------------------------------------------------------ |
  | `kind`             | `'link'`                                               |
  | `index`            | The index of the link in the `link` arrays             |
  | `label`            | Its `link.label` entry (`''` without one)              |
  | `value`            | Its `link.value`, if it is a number                    |
  | `source`, `target` | Its two nodes, each with `index`, `label` and `degree` |
  | `customdata`       | Its `link.customdata` entry                            |

  ```ts
  chart.on('click', (event) => {
    const point = event.points[0];
    if (point?.kind === 'node') console.log('node', point.label, point.degree);
    if (point?.kind === 'link') console.log('link', point.source, point.target);
  });
  ```

## Performance notes

- **Draw calls.** A trace draws two batches whatever its size: every link in one line primitive
  and every node in one instanced marker set. The others exist only when the figure asks for
  them: the arrowheads, the boxes (in place of the markers), the labels, the secondary links,
  the frames of clusters (one rect per group), the axes of a hive plot and the rings of
  collapsed nodes.
- **Zoom and pan.** Everything is stored in the coordinates of the axes, so a pan or a zoom
  sets a transform and uploads nothing. What is sized in px follows separately: straight links
  never need it; links with arrowheads, loops and routed links are rebuilt when the scale
  changes, because they end on the outlines of the nodes; labels are culled again when the
  scale changes.
- **Large graphs.** From 500 nodes up, labels are placed again once a zoom has been still for
  80 ms, not on every frame of it. Above 20,000 nodes or links the links wait in the same way,
  and keep the geometry of the last scale until then. Above 3,000 nodes only the labels of the
  nodes in view are candidates. Link hover uses a grid over the links, built on the first
  hover: about 0.1 ms on a hairball of 50,000 links. A dragged node rebuilds its own links only.
- **Level of detail.** A graph of more than 3,000 nodes or 5,000 links leaves out what cannot
  be read while it is small on screen (`lod: 'auto'`, the default; `true` for any graph,
  `false` to draw everything). Labels appear once the nodes are 24 px apart and arrowheads once
  the links are 24 px long. Nodes are drawn smaller where they are closer together than one and
  a half times their size, down to dots, and lose their outlines below 4 px. Links fade as they
  cover the plot, so a dense graph stays a texture instead of a block. A zoom brings each back,
  a pan changes nothing, and what a hover highlights is always drawn in full.
- **Layouts run in calc.** By default a computed arrangement runs synchronously, on the main
  thread, when the chart computes the trace, and again when something it reads changes: the
  nodes, the links, the node sizes, the options of the arrangement. Changes of color, width,
  dash, opacity and hover attributes do not run it. A graph whose layout takes too long to
  compute on each change can be laid out once, anywhere, and drawn with `'preset'`.
- **Layouts off the main thread.** A force layout of 10,000 nodes takes a second or more, and
  by default the page waits for it. With `worker: 'auto'` on the trace (or `config.worker:
'auto'` for every graph), a `'force'` layout of 1,000 nodes or 5,000 links, or a `'layered'`
  one of 3,000 nodes or 6,000 links, runs in the package's layout worker; `worker: true` sends
  any such layout there. The chart is drawn at once, the nodes move to their places as the
  worker reports them, and `chart.ready` resolves when the layout has arrived. The picture is
  the one the main thread would have made, and an image export waits for it. Hover and selection
  work on what is on screen while it settles; nodes can be dragged once it is there. Under
  reduced motion and on a static plot nothing is drawn in between. `'preset'`, `'circular'`,
  `'grid'` and `'custom'` never use the worker. Bundlers find the worker file by themselves;
  where it cannot be started, the same code runs on the main thread in slices, with one
  warning in the console. A strict Content Security Policy needs `worker-src 'self'`: see the
  [CSP guide](/guides/csp#graph-layouts-in-a-worker).

  ```ts
  import { createChart } from '@mk7s/holochart';
  import '@mk7s/holochart/graph';

  const chart = createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        worker: 'auto',
        link: { source: [0, 1, 2, 3], target: [1, 2, 3, 0] },
      },
    ],
  });
  // Resolves when the layout has arrived, wherever it ran.
  await chart.ready;
  ```

- **Measured.** On an Apple M1 Max, in Chromium on the GPU (ANGLE Metal, 800 × 600), with the
  machine busy: a force layout of 10,000 nodes and 50,000 links with `worker` on is on screen,
  settled, 1.7 s after `createChart`, and the longest stretch the page does not answer is
  0.13 s (1.1 s without the worker); that graph pans at 60 frames a second; 100,000 nodes and
  150,000 links at given positions pan and zoom at 60 frames a second, 0.36 s after the first
  draw began.
- **`force.ticks`.** The number of steps of the simulation. The default is 600 up to 500 nodes
  and fewer for larger graphs: 300 from 1,000 to 3,000 nodes, 90 at 10,000. More steps untangle
  a graph better and take longer.
- **`force.simulate`.** The animation runs the simulation a second time, a few steps per frame,
  over at most 180 frames. For a graph of more than 2,000 nodes or 10,000 links the settled
  layout is drawn at once.
- **`layered.ranker`.** How nodes get their layer: `'network-simplex'` (default) finds the
  layers that make the links shortest in total; `'tight-tree'` is its starting point, faster and
  nearly as short; `'longest-path'` is the fastest, with longer links.
- **Data.** The trace keeps what it knows per node and per link in typed arrays, and takes
  typed arrays for `link.source`, `link.target` and `link.value`.
- **Bundle size.** The full bundle contains no graph code. A partial bundle of the runtime with
  `tracesGraph` (the `graph` and `chord` traces and their layouts) measures 233.8 kB, minified
  and gzipped, against a budget of 236 kB; the same bundle with scatter in place of the graph
  package measured 155.1 kB. The seven layouts are 25.6 kB of that together, the layered one
  the largest at 11.8 kB. The worker client and the bundling are a chunk of 8.2 kB that loads
  with the first layout that leaves the main thread or the first bundled links, and the worker
  itself is a file of 29.8 kB.

## Accessibility notes

- **Screen readers:** the hidden description (see the
  [accessibility guide](/guides/accessibility)) says what a reader of the picture would take
  from it, in two to four sentences: the numbers of nodes, links and groups, the arrangement,
  whether everything is connected (or the number of connected components and the size of the
  largest), the most-connected nodes by name, and the groups with their sizes. For example:
  `Network graph "Teams": 56 nodes, 163 links, 4 groups, force-directed layout. All nodes are
connected; most connected: A5 (10 links), B8 (10), A7 (9), A9 (8), C11 (8).` It begins
  `Directed network graph` when the trace draws arrowheads, a tree says its roots and levels,
  and a layered graph the links it reversed to break cycles. Give the trace a `name`: it is
  what the description calls the graph.
- **Data table:** the trace's table is its list of links, with the columns `Source` and
  `Target` (`Parent` and `Child` for `labels` and `parents`), `Value` when the links have values
  and `Label` when they have labels.
- **Keyboard:** in every arrangement ↓ goes along a link, ↑ comes back and ← / → move among the
  stops beside the cursor. In a network the stops are the nodes and, below each node, its
  links: ↓ from a node goes to its first link, ← / → turn through that node's links (clockwise
  as drawn), ↓ follows the link to the node at its other end and ↑ returns. A tree is walked
  by siblings, parent and first child; a layered graph rank by rank, with ↑ / ↓ along the links.
  Each stop announces its place and where ↑ and ↓ lead. See
  [keys by chart family](/guides/accessibility#keys-by-chart-family).
- **Motion:** `force.simulate` and the move of a folding tree do not run under
  `prefers-reduced-motion: reduce` or `config.a11y.reducedMotion: true`: the settled layout and
  the new tree are drawn at once.
- **Color:** a group is told by its color in the drawing. The legend names the groups, and the
  hover label of a node names its group; add `node.symbol` per group when the figure has to
  read without color. Under `'hive'` and under `'layered'` with `clusters`, the name of a group
  is written in the drawing.
- **Labels:** a label that is culled is not lost: it is in the hover label of its node, and it
  shows after a zoom. For a graph that has to be read as a still image, name fewer nodes (an
  empty `node.label` entry draws nothing) so that the ones that matter keep their label.
- **Direction:** arrowheads are the only sign of direction on a straight link. Under
  `'layered'` the position says it too: every link that is not dashed points the way of
  `layered.rankdir`.

## Attribute reference

See the [graph attribute reference](/reference/graph) for every attribute, its type and its
default: [`arrangement`](/reference/graph#arrangement), the option containers
[`force`](/reference/graph#force), [`layered`](/reference/graph#layered),
[`tree`](/reference/graph#tree), [`arc`](/reference/graph#arc),
[`hive`](/reference/graph#hive) and [`custom`](/reference/graph#custom), and the
[`node`](/reference/graph#node) and [`link`](/reference/graph#link) containers, for example
[`force.algorithm`](/reference/graph#force.algorithm) and
[`node.sizeby`](/reference/graph#node.sizeby).

## Related charts

- [Chord diagram](/charts/graphs/chord): how much goes between a few groups, as ribbons inside
  a ring
- [Graph in 3D](/charts/graphs/graph3d): the same nodes and links in a 3D scene
- [Sankey](/charts/hierarchical/sankey): flows whose widths add up, from the same `node` and
  `link` containers
- [Treemap](/charts/hierarchical/treemap): a hierarchy by the sizes of its parts, from the same
  `labels` and `parents`
- [Graphs](/fundamentals/graphs): the data model, adapters, measures, the arrangements and how
  to choose one, the adjacency matrix
- [Express networks](/express/mappings#networks): `hx.graph` from a table of links

## Plotly migration notes

- Plotly.js has no graph trace, so there is no Plotly figure with `type: 'graph'` and nothing
  for the Plotly importer to translate. The attribute names here follow Plotly's habits
  (`node` and `link` as in `sankey`, `labels` and `parents` as in `treemap`, colorscales as in
  `marker`), not a Plotly schema.
- Plotly's documentation draws a network as two `scatter` traces, one of lines for the links
  and one of markers for the nodes, at positions computed elsewhere (networkx in its Python
  examples). Such a figure renders here as it is, as two scatters. As a `graph` trace it is
  `arrangement: 'preset'` with the node positions in `node.x` and `node.y`, the marker
  attributes in `node` (`size`, `color` with its colorscale, `label` from `text`), and each
  pair of line ends as one entry of `link.source` and `link.target`. Or leave the positions out
  and choose an arrangement.
- The `node` and `link` containers of a `sankey` trace hold what a graph reads (`node.label`,
  `link.source`, `link.target`, `link.value`): the same data draws both.
