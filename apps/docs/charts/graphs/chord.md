---
title: Chord diagram
description: Show how much flows between the members of one set, as ribbons across a ring whose arcs are as wide as each member's flow.
status: complete
chart: chord
---

# Chord diagram

<ChartOverview />

## Overview

A chord diagram shows how much flows between the members of one set: trips between districts,
moves between regions, messages between teams. Every node is an arc of a ring, as wide as the
flow that leaves it plus the flow that enters it, and every link is a ribbon across the ring, as
wide as its value where it meets an arc. Use it when the same items are sources and targets
alike and the question is who exchanges how much with whom: the widest arcs are the busiest
nodes and the widest ribbons the largest flows.

A `chord` trace takes its flows as `node` and `link` containers, shaped like those of
[sankey](/charts/hierarchical/sankey) and of the [graph](/charts/graphs/graph) trace, or as a
square matrix. Ribbons can have a direction and end in an arrowhead, `node.group` keeps the
nodes of a group together under an outer ring, and hovering an arc or a ribbon dims the rest.

Chord diagrams are not part of the full bundle. Add one import next to it, or register
`tracesGraph` in a partial bundle (see
[adding the package](/fundamentals/graphs#adding-the-package)):

```ts
import '@mk7s/holochart';
import '@mk7s/holochart/graph';
```

Pick a different chart when:

- there are many nodes, or who is linked to whom matters more than how much flows: use a
  [network graph](/charts/graphs/graph), which places the nodes by their links. On a ring every
  node added leaves the others a shorter arc, and the label of an arc too short for a line of
  text is left out;
- the flow runs through stages, from sources to sinks: use a
  [sankey](/charts/hierarchical/sankey), which puts the stages in columns;
- the matrix is dense and every cell should be readable: use a
  [heatmap](/charts/scientific/heatmap) of it, the
  [adjacency matrix](/fundamentals/graphs#the-adjacency-matrix). Ribbons that cross hide each
  other; cells do not.

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'chord',
      labels: ['Harbor', 'Old Town', 'Campus'],
      matrix: [
        [12, 34, 9],
        [31, 8, 22],
        [7, 25, 15],
      ],
    },
  ],
});
```

`matrix[i][j]` is the flow from node `i` to node `j`, and `labels` names the nodes, one per row.
Every positive cell is a ribbon in the color of the node it starts at. The diagonal is the flow
of a node to itself, drawn as a hill on its own arc. The live example has five districts and
`valuesuffix: 'k'` for the hover labels; hover an arc to see its ribbons:

<Example id="chord/basic" />

## Data format

A trace gives its flows in one of two ways. When it has both, `link` wins: `matrix` and `labels`
are read only when `link.source` and `link.target` are missing or empty.

- **`matrix` and `labels`.** A square array of arrays (plain or typed rows). The number of nodes
  is the number of rows, or the length of the longest row when that is larger; missing cells
  count as 0. `labels` is the default of `node.label`, which wins when both are given.
- **`node` and `link`.** `link.source`, `link.target` and `link.value` are parallel arrays, one
  entry per link; sources and targets are node indices (whole numbers; numeric strings are
  accepted). Without `link.value` every link is worth 1. `node.label` names the nodes. The
  number of nodes is the length of the longest per-node array (`node.label`, `node.group`,
  `node.customdata`, and `node.color` when it is an array); without any of them it is one more
  than the largest index a link names. These are the arrays a `sankey` and a `graph` trace take,
  so one data set feeds all three; see [the data model](/fundamentals/graphs#the-data-model).
- **`directed`** (default `true`) says whether a link has a direction. Either way a link takes
  its value of its source's arc and of its target's arc, so an arc is as wide as the outgoing
  plus the incoming flow of its node. Directed links can end in an arrowhead or short of the
  ring, and hover labels tell outgoing from incoming flow. It also decides how a matrix is read:

  | `directed`       | Ribbons                                         | Width of a ribbon                                 | Width of arc `i`                                   |
  | ---------------- | ----------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
  | `true` (default) | one per positive cell                           | `matrix[i][j]` at both ends                       | row `i` plus column `i`, the diagonal counted once |
  | `false`          | one per pair of nodes with a flow in either way | `matrix[i][j]` at node `i`, `matrix[j][i]` at `j` | row `i`                                            |

  With `directed: false`, a symmetric matrix gives ribbons as wide at both ends, and a ribbon
  wider at one end shows an uneven exchange.

- **Self links.** A link from a node to itself (a cell on the diagonal) is drawn as a hill on
  the node's arc and takes its value of the arc once.
- **What is left out.** A link whose source or target is not a node index, a link whose value
  is not a positive number (when `link.value` is given), and a matrix cell that is negative or
  not a number are not drawn. They are counted, and the chart's description says how many links
  were left out. A node without any link has no arc.
- **Per-item data.** `node.customdata` and `link.customdata` reach templates and events, and
  `link.label` names a link in its hover label. For a matrix, the per-link arrays (`link.label`,
  `link.customdata`, `link.color`, `link.hovercolor`) are indexed by cell: the link of
  `matrix[i][j]` is entry `i × n + j` for `n` nodes.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

// Four links between three nodes; the same `node` and `link` draw a sankey or a graph.
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'chord',
      node: { label: ['North', 'East', 'South'] },
      link: {
        source: [0, 0, 1, 2],
        target: [1, 2, 2, 0],
        value: [42, 18, 55, 8],
      },
    },
  ],
});
```

A chord is a `domain` trace, like a pie or a sankey: it has no axes, and `domain` (`x` and `y`
as fractions of the plot area, or `row` and `column` of a `layout.grid`) places the ring, which
is centered in its domain.

## Variations

<ChartVariations />

### From nodes and links

The energy balance of the [sankey examples](/charts/hierarchical/sankey#minimal-example), from
the same three arrays. Each arc is as wide as what its node gives plus what it takes. The labels
do not fit along their arcs here, so they are written along the radius (see
[many nodes](#many-nodes-sorting-and-labels)):

<ExampleLink id="chord/links" />

### Directed, with arrowheads

`link.arrowlen` draws the target end of every ribbon as an arrowhead that many px long. A
`link.targetgap` larger than `link.gap` also stops the ribbon short of the ring there, so a
ribbon touches the arc it leaves and points at the arc it enters. Both apply to directed traces
only:

<ExampleLink id="chord/directed" />

### Ribbon colors: source or target

A ribbon without a `link.color` takes the color of one of its nodes: `link.colorsource` is
`'source'` (the default), `'target'` or `'gradient'`. Colored by target, an arc's own color
marks what it receives. This example shows direction without arrowheads, with `targetgap` alone,
orders the arcs with `sort: 'value'` and runs the ring with `direction: 'counterclockwise'`:

<ExampleLink id="chord/light" />

### Gradient ribbons from a symmetric matrix

With `directed: false` every pair of nodes has one ribbon. `link.colorsource: 'gradient'` runs
its color from one node's to the other's, in 24 steps along the ribbon, so neither end is
favored:

<ExampleLink id="chord/dark" />

### Groups and the outer ring

`node.group` gives every node a group, by name or by number. The nodes of a group sit next to
each other and share a color, `groups.padangle` separates the groups (default: twice
`padangle`), and an outer ring draws one labeled arc around each. The legend lists the groups;
click one to take it out of the ring. `groups.visible: false` leaves the outer ring out and
keeps the rest:

<ExampleLink id="chord/groups" />

### Many nodes: sorting and labels

Thirty-six nodes in six groups and about 150 links. Three attributes keep a ring this full
readable:

- **`sort`** orders the arcs: `'input'` (default: by node index), `'value'` (widest first) or
  `'group'` (groups by name, numbers by value; nodes by index). The nodes of a group stay
  together whatever the sort: `'input'` then orders the groups by their first node and `'value'`
  by their width, with the widest node first within each.
- **`link.sort`** orders the ends of the ribbons within an arc: `'position'` (default: by where
  the other end is on the ring, so that ribbons cross as little as possible), `'value'` (widest
  first) or `'input'` (by link index).
- **`textorientation`** places the labels: `'tangential'` (across the radius, turned around on
  the lower half), `'radial'` (along the radius, turned around on the left half, so that none is
  upside down), `'none'`, or `'auto'` (the default): tangential when every label fits along its
  arc, else radial. A label that does not fit its arc is not drawn, and a radial label too long
  for the room around the ring ends in an ellipsis. Every label still shows on hover.

<ExampleLink id="chord/large" />

### Several rings, rotated

`domain` puts two traces side by side. `rotation` is where the first arc starts, in degrees
clockwise from 12 o'clock (here 90, at 3 o'clock), `direction` is the way the arcs follow each
other, and `padangle` is the gap between two arcs in degrees (default 2; the gaps together take
at most half the ring). Two rings compare well when their nodes are in the same order, which
`sort: 'input'` keeps:

<ExampleLink id="chord/side-by-side" />

### From a table, with Express

[`hx.chord`](/express/mappings#networks) builds the trace from an edge table, with one row per
link, and optionally a node table; `weight` is the width of the ribbons and `color` groups the
nodes. It also takes a square matrix:

<ExampleLink id="express/chord" />

## Styling

- **Arcs.** `node.color` (one color, or one per node; default: the colorway, one color per
  node, or one per group when `node.group` is given), `node.thickness` (the ring's thickness,
  default 12 px) and `node.line.color` / `node.line.width` (outlines; no outline by default, and
  the color defaults to the paper color, which separates neighbouring arcs).
- **Ribbons.** `link.color` (one color, or one per link) or `link.colorsource`, and
  `link.opacity` (default 0.6), which multiplies the color's own alpha so that crossing ribbons
  show through each other. `link.gap` is the space between the ring and the ends of the ribbons
  (default 2 px). The widest ribbons are drawn first, so thin ones stay on top.
- **Hover color.** `link.hovercolor` (one, or one per link) is the color of a ribbon while it,
  or a node it connects, is hovered. Default: its own color, 0.25 more opaque.
- **Labels.** `textfont` (default: `layout.font`) and `textorientation`. `node.label` accepts
  Plotly's pseudo-HTML such as `<b>`.
- **Groups.** `groups.color` (one, or one per group in order of first appearance; default: the
  colorway), `groups.thickness` (default 8 px), `groups.gap` (between the node labels and the
  outer ring, default 4 px) and `groups.textfont` (default: `textfont` in bold).
- **Themes.** Arc and group colors come from the template's colorway, and labels and outlines
  from its font and paper colors, so a chord follows
  [themes and templates](/customization/themes-templates) without settings of its own.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'chord',
      directed: false,
      labels: ['Piano', 'Bass', 'Drums', 'Sax'],
      matrix: [
        [0, 48, 44, 21],
        [48, 0, 52, 24],
        [44, 52, 0, 27],
        [21, 24, 27, 0],
      ],
      padangle: 4,
      textfont: { size: 13 },
      node: {
        color: ['#4c78a8', '#f58518', '#54a24b', '#b279a2'],
        thickness: 16,
        line: { width: 1 },
      },
      link: { colorsource: 'gradient', opacity: 0.7, gap: 3 },
    },
  ],
});
```

## Interactivity

- **Hover.** Hovering a ribbon highlights it; hovering an arc highlights every ribbon of its
  node, and hovering a group arc those of the group's nodes. The highlighted ribbons take their
  `hovercolor` and the others are dimmed to 15% of their opacity. The label of an arc shows its
  name and its share of the ring, and for a directed trace its outgoing and its incoming flow,
  with the arc's width in the secondary box. The label of a ribbon shows `link.label`, its two
  ends (`A → B` when directed, `A — B` when not) and its share of the total flow, with its value
  in the secondary box. A ribbon of an undirected matrix shows both flows of its pair. A group
  arc shows its name, its number of nodes and its share.
- **Values.** `valueformat` (a d3-format, default `',.4~g'`) and `valuesuffix` (a unit such as
  `' TWh'`) format every value in the labels.
- **Templates.** `node.hovertemplate` and `link.hovertemplate` format their labels separately.
  Both take `%{label}`, `%{value}` (formatted with `valueformat` and `valuesuffix` unless you
  give a format), `%{percent}`, `%{color}` and `%{customdata}`. Nodes add `%{out}`, `%{in}` and
  `%{group}`, and `%{percent}` is their share of the ring; links add `%{source.label}`,
  `%{target.label}` and `%{reverse}` (the flow back, for a pair of matrix cells drawn as one
  ribbon), and `%{percent}` is their share of the total flow. `<extra>…</extra>` replaces the
  value box:

  ```ts
  import { createChart } from '@mk7s/holochart';
  import '@mk7s/holochart/graph';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'chord',
        valuesuffix: 'k',
        node: {
          label: ['North', 'East', 'South'],
          hovertemplate: '%{label}<br>%{out} left, %{in} arrived<extra>%{percent}</extra>',
        },
        link: {
          source: [0, 0, 1, 2],
          target: [1, 2, 2, 0],
          value: [42, 18, 55, 8],
          hovertemplate: '%{source.label} → %{target.label}<br>%{value}<extra></extra>',
        },
      },
    ],
  });
  ```

- **Hover control.** `hoverinfo` (`'all'`, `'none'` or `'skip'`) is the default of
  `node.hoverinfo` and `link.hoverinfo`: `'none'` keeps the highlight without labels, `'skip'`
  turns hover and events off for that part. Group arcs follow `node.hoverinfo`.
- **Legend.** With `node.group` the legend has one item per group. Without groups it has one
  item per node that has a link, and `showlegend` is off by default, since the labels around the
  ring name the nodes already. A click on an item hides it: its nodes get no arc, their links no
  ribbon, and the rest of the ring closes up, as a pie does without a hidden slice. The hidden
  names are in `layout.hiddenlabels`, the list pies use.
- **Events.** `hover`, `unhover` and `click` points say what they are in `kind` (`'node'`,
  `'link'` or `'group'`), with `curveNumber` and `pointNumber`: the node index, the group index,
  or the link's index in the `link` arrays (for a matrix, the cell: `i × n + j`). All three
  carry `label`, `value`, `percent` and `color`. A node adds `out`, `in`, `group` and
  `customdata`; a link adds `customdata`, `reverse` for a pair of matrix cells, and `source` and
  `target`, each a node with those fields; a group adds `nodes`, the indices of its nodes in
  ring order.

  ```ts
  chart.on('click', (e) => {
    const p = e.points[0];
    if (p?.kind === 'link') console.log(p.source, p.target, p.value);
  });
  ```

## Performance notes

- A chord draws with three primitives whatever its size: one batched polygon fill for the
  ribbons (the fill primitive is loaded on first use), one instanced arc set for the node ring
  and the group ring, and one text set for the labels.
- A ribbon is one polygon, flattened from its two arcs and two curves. A gradient ribbon is 24
  polygons, one per color step, so `link.colorsource: 'gradient'` costs the most vertices;
  prefer `'source'` or `'target'` for a ring with very many links.
- The layout runs in calc and works in angles, which do not depend on the size of the chart, so
  the laid-out ring is kept with the calc data and only placed again when the domain changes
  size. Colors, outlines and opacities are style edits: they recolor without a new layout.
- Hover highlighting rewrites the colors of the ribbons and nothing else.
- With the default `link.sort: 'position'`, ribbons cross as little as the order of the arcs
  allows. A ring with many nodes is limited by its labels and by overlapping ribbons before it
  is limited by rendering: sort by value, group the nodes, and lower `link.opacity`.
- Bundle size: the chord trace adds 9.5 kB (minified and gzipped) to an entry that has the
  `graph` trace. Registering `tracesGraph` on the runtime, both traces with every layout of
  `graph`, is budgeted at 223 kB, without three.js.

## Accessibility notes

- **Screen readers:** the hidden description (see the
  [accessibility guide](/guides/accessibility)) reads
  `Chord diagram "name": N nodes, M links, G groups, total flow T.` (`Directed chord diagram` for
  a directed trace), then the three largest flows with their ends and values, and how many
  links were left out, if any. Its data table has one row per drawn link: source, target and
  value, and the label when links have labels. The generated summary reads the links as shares
  of the total flow.
- **Keyboard:** Tab moves into the plot area. The stops are the node arcs, in ring order, then
  the ribbons, and each shows the hover label a pointer would get there. On an arc, ← / → move
  around the ring and ↓ goes to the first ribbon that starts at the node. On a ribbon, ← / →
  move between the ribbons that start at the same node, ↑ goes to its source node and ↓ to its
  target node. Home and End go to the first and the last of the stops ← / → move between. A
  part with `hoverinfo: 'skip'` has no stops. The stops load with the chart's first keyboard
  focus.
- **Reading the chart:** the width of a ribbon where it meets an arc is its value; its length
  and its curve mean nothing. With `directed`, a ribbon looks the same at both ends unless you
  set `link.arrowlen` or `link.targetgap`, so use one of them, and let the hover label tell
  outgoing from incoming flow.
- **Color:** arcs are labeled, so color is not the only way to tell nodes apart; if you set
  `textorientation: 'none'`, keep the legend. Ribbons are translucent and their colors mix where
  they cross: in a ring with many nodes, do not rely on telling ribbon colors apart, and let
  hover single out the ribbons of one node.

## Attribute reference

See the [chord attribute reference](/reference/chord) for every attribute, its type and its
default: for instance [`link.colorsource`](/reference/chord#link.colorsource),
[`textorientation`](/reference/chord#textorientation) and
[`groups`](/reference/chord#groups).

## Related charts

- [Network graph](/charts/graphs/graph): the same `node` and `link` as a node-link drawing,
  for structure rather than volumes
- [Sankey](/charts/hierarchical/sankey): flows through stages, from the same `node` and `link`
- [Heatmap](/charts/scientific/heatmap): the matrix itself, cell by cell
- [Graphs](/fundamentals/graphs): the data model the graph traces share, the adapters and the
  measures
- [Express networks](/express/mappings#networks): `hx.chord` from an edge table or a matrix

## Plotly migration notes

- Plotly.js has no chord trace: `chord` is a Holochart trace type, and there is no Plotly
  figure to migrate or to compare with.
- The containers use sankey's names where the two overlap: `node.label`, `node.color`,
  `node.customdata`, `node.thickness`, `node.line`, `link.source`, `link.target`, `link.value`,
  `link.label`, `link.color`, `link.hovercolor`, `link.customdata`, `link.arrowlen`,
  `valueformat`, `valuesuffix`, `textfont` and `domain`. The `node.label` and the `link.source`,
  `link.target` and `link.value` of a Plotly sankey figure draw as a chord once `type` is
  changed; sankey's layout attributes (`node.pad`, `node.groups`, `arrangement`, …) have no
  meaning on a ring and are not attributes of `chord`.
- Two defaults differ from sankey's: `valueformat` is `',.4~g'` (sankey: `'.3s'`), and a ribbon
  takes the color of its source node, where sankey links share one neutral color.
- A matrix is read as d3-chord reads it: like `chordDirected` by default and like `chord` with
  `directed: false`. The layout is Holochart's own code, not d3's.
