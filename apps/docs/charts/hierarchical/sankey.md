---
title: Sankey
description: Show flows between stages or categories, as links as wide as their value between nodes sized by their throughput.
status: complete
chart: sankey
---

# Sankey

## Overview

A sankey diagram shows how quantities flow through a system: energy from primary sources to final
uses, money from income to spending, users from one step of a funnel to the next. Nodes are
arranged in columns by their depth in the flow and sized by how much passes through them; each
link is as wide as its value. The widths make the big flows, the splits and the losses visible at
a glance, and the whole diagram conserves flow: what enters a node leaves it (or stays, when it is
a sink).

Holochart lays sankeys out with a deterministic port of d3-sankey (the algorithm Plotly uses), so a
Plotly figure keeps its shape, and draws them on the GPU: all link ribbons are one batched polygon
fill (tessellated cubic Bézier bands), the nodes one instanced rect set and the labels one batched
SDF text set. Cycles are drawn as loops around the diagram. Hovering highlights links; dragging a
node rearranges the diagram; animated flow particles can stream along the links.

Pick a different chart when:

- the flow is a strict hierarchy (every part has one parent): use a
  [sunburst](/charts/hierarchical/sunburst), which shows the nesting directly;
- you compare how categorical variables co-occur rather than how a quantity moves: use
  [parallel categories](/charts/statistical/parallel-categories);
- there is a single sequence of stages that items drop out of: use a
  [funnel](/charts/financial/funnel).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'sankey',
      node: { label: ['Salary', 'Freelance', 'Budget', 'Rent', 'Food', 'Savings'] },
      link: {
        source: [0, 1, 2, 2, 2],
        target: [2, 2, 3, 4, 5],
        value: [3200, 800, 1500, 900, 1600],
      },
    },
  ],
});
```

Nodes are numbered by their index in `node.label`; every link names its `source` and `target`
node and carries a `value`. The live example is a (synthetic) national energy balance, with
`valuesuffix: ' TWh'` for the hover labels:

<Example id="sankey/basic" />

## Data format

- **Links.** `link.source`, `link.target` and `link.value` are parallel arrays (typed arrays
  work), one entry per link. Sources and targets are node indices (whole numbers; numeric strings
  are accepted). Links whose value is not positive, or whose ends are not valid indices, are
  dropped, as in Plotly. Several links may join the same two nodes; they stack side by side and
  together form a _flow_.
- **Nodes.** A node exists when a link names it: the node count is one more than the largest index
  a link uses, and nodes no link touches are not drawn. `node.label` gives the labels (Plotly
  pseudo-HTML such as `<b>` works); a node's value is the larger of its inflow and its outflow.
- **Cycles.** Links may form cycles (including self links). The links that close a cycle are drawn
  as loops below or above the diagram; the rest is laid out as usual.
- **Groups.** `node.groups` lists groups of node indices, each drawn as one combined node: links
  inside a group are dropped, the others attach to the group. Group _g_ is node number
  `nodeCount + g`, so its label and color are the entries after the last node a link names.
- **Per-item data.** `node.customdata` and `link.customdata` (one entry per node or link) reach
  templates and events; `link.label` names links in hover labels.

## Variations

### Vertical

`orientation: 'v'` turns the diagram so the flow runs top to bottom. Node labels are then drawn
over the nodes, from their left edge, as in Plotly:

<Example id="sankey/vertical" />

### Fixed node positions

`node.x` and `node.y` place node centers as fractions of the domain (x along the flow, y across
it, from the top), overriding the layout. Give both; a position of exactly 0 counts as unset, as
in Plotly. With positions given, `arrangement` defaults to `'freeform'`:

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'sankey',
      node: {
        label: ['Plant', 'Hub', 'Store'],
        x: [0.1, 0.5, 0.9],
        y: [0.5, 0.3, 0.6],
      },
      link: { source: [0, 1], target: [1, 2], value: [10, 10] },
    },
  ],
});
```

<Example id="sankey/fixed-positions" />

### Circular links

Links that close a cycle — material going back into production, a user returning to an earlier
step — are routed as loops: out of the source's right side, around a corner, along a lane below
(or above) the nodes and back into the target's left side. Loops whose spans overlap get stacked
lanes, and room is reserved for them inside the domain:

<Example id="sankey/circular" />

### Node groups

`node.groups` merges nodes into one combined node; here wind, solar and hydro become
"Renewables":

<Example id="sankey/groups" />

### Concentration colorscales

When several labeled links join the same two nodes, `link.colorscales` colors the links of one
label by their share of that flow (their _concentration_), mapped from `cmin`–`cmax` (default 0–1)
through `colorscale`. Hover labels then show the concentration:

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'sankey',
      node: { label: ['Sciences', 'Engineering', 'Medicine'] },
      link: {
        source: [0, 0, 0, 0],
        target: [1, 1, 2, 2],
        value: [120, 410, 260, 150],
        label: ['Women', 'Men', 'Women', 'Men'],
        colorscales: [{ label: 'Women', colorscale: 'Purples' }],
      },
    },
  ],
});
```

<Example id="sankey/colorscales" />

### Arrows and link colors

`link.arrowlen` ends every link with an arrowhead into its target (at most half the gap between
the columns); `link.color` takes one color per link:

<Example id="sankey/arrows" />

### Flow particles

`link.flow` is a Holochart extension (Plotly has no equivalent): it streams small dots along every
link from its source to its target, loops included, so the direction and the busy paths of a flow
read at a glance. It is off unless you set it; `flow: {}` turns it on with the defaults:

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'sankey',
      node: { label: ['Gas', 'Coal', 'Power', 'Homes', 'Industry'] },
      link: {
        source: [0, 1, 2, 2],
        target: [2, 2, 3, 4],
        value: [60, 40, 55, 45],
        flow: { speed: 60, density: 2 },
      },
    },
  ],
});
```

- `density` (default 2): particles per 100 px of link length for every 10 px of link width, so
  wide links carry more particles, spread across their width (a link thinner than 10 px gets one
  lane). One value, or one per link; 0 draws none on a link.
- `speed` (default 50): px per second along the link, one value or one per link; 0 holds the
  particles still.
- `size` (default 3 px diameter, one or one per link), `color` (default: the link color, opaque;
  one or one per link) and `opacity` (default 1).
- `time`: freezes the particles where they are that many seconds into the animation. Set it for a
  still frame that is always the same, e.g. an exported image or a visual test. The example below
  is frozen 2 s in; without `time` the particles move.

<Example id="sankey/flow" />

The particles move only while the chart is on screen, dim with the links outside a hover
highlight, and follow their links while a node is dragged. With `prefers-reduced-motion: reduce`
they hold still, spread evenly along the links.

## Styling

- **Nodes.** `node.color` (one color, or one per node; default: the colorway at 0.8 opacity, one
  color per node), `node.line.color` / `node.line.width` (outlines, centered on the edge),
  `node.thickness` (size along the flow, default 20 px) and `node.pad` (space between the nodes of
  a column, default 20 px; reduced to fit when a column is crowded).
- **Columns.** `node.align` puts each node in a column: `'justify'` (default: by depth, sinks in
  the last column), `'left'` (by depth), `'right'` (by distance to the sinks) or `'center'`
  (sources next to their first target).
- **Links.** `link.color` (one or one per link; default translucent black on light paper and
  translucent white on dark paper), `link.hovercolor` (the color while hovered; default: 0.2 more
  opaque) and `link.line.color` / `link.line.width` (outlines, default none).
- **Labels.** `textfont` sets the node label font (default: `layout.font` with the automatic
  halo, `shadow: 'auto'`). Labels sit right of their node, left of it in the last column.
- **Default look.** In the default `holochart` template, links are a translucent light gray
  (`rgba(164, 167, 181, 0.3)`), nodes get a thin rim in the background color, and labels use the
  9 px layout font. `layout.template: 'plotly-classic'` gives Plotly's look
  ([themes and templates](/customization/themes-templates)).
- **Placement.** `domain` places the diagram in the figure, like pies.

## Interactivity

- **Hover.** Hovering a node highlights its links (they take their `hovercolor`) and shows its
  label and its incoming and outgoing link counts; hovering a link highlights it and shows its
  label, source and target, with the value (formatted by `valueformat`, default `'.3s'`, and
  `valuesuffix`) in the secondary box. Links sharing a non-empty label highlight together.
  Plotly's hover zone around nodes applies: 10 px either side along the flow.
- **Templates.** `node.hovertemplate` and `link.hovertemplate` format their labels separately:
  `%{label}`, `%{value}` (formatted with `valueformat` and `valuesuffix` unless you give a format),
  `%{customdata}`, `%{color}`, `%{sourceLinks.length}` / `%{targetLinks.length}` for nodes, and
  `%{source.label}`, `%{target.label}`, `%{flow.value}` and `%{flow.labelConcentration}` for links;
  `<extra>…</extra>` replaces the value box:

  ```ts
  import { createChart } from '@mk7s/holochart';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'sankey',
        valuesuffix: ' TWh',
        node: {
          label: ['Gas', 'Power', 'Homes'],
          hovertemplate: '%{label}: %{value}<extra></extra>',
        },
        link: {
          source: [0, 1],
          target: [1, 2],
          value: [80, 50],
          hovertemplate: '%{source.label} → %{target.label}<br>%{value}<extra></extra>',
        },
      },
    ],
  });
  ```

- **Hover control.** `hoverinfo` (`'all'`, `'none'` or `'skip'`) is the default of
  `node.hoverinfo` and `link.hoverinfo`: `'none'` keeps the highlight without labels, `'skip'`
  turns hover and events off for that part.
- **Dragging.** Nodes can be dragged, following `arrangement`: `'snap'` (default: the node moves
  freely, the other nodes of its column make room, and it returns to its column on release),
  `'perpendicular'` (across the flow only), `'freeform'` (anywhere) or `'fixed'` (no dragging).
  Links follow while dragging. A drop restyles `node.x` / `node.y` of every node with the new
  positions (a `restyle` event), as Plotly does.
- **Events.** `hover`, `unhover` and `click` points carry Plotly's node fields (`label`, `value`,
  `color`, `customdata`, `sourceLinks`, `targetLinks`, `group`, `childrenNodes`) or link fields
  (`label`, `value`, `color`, `customdata`, `source` and `target` nodes, `flow`), with
  `curveNumber` and `pointNumber` (the node or link index).

## Performance notes

- A sankey draws in a constant number of draw calls whatever its size: one batched polygon fill
  for the link ribbons (the fill primitive is loaded on first use), one instanced rect set for the
  nodes, one batched SDF text set for the labels, and one line primitive only when links are
  outlined.
- The layout (50 relaxation passes, as Plotly) runs once per data change and domain size; restyling
  colors, hovering and resizing labels never lay out again.
- Hover highlighting only rewrites link colors. While a node is dragged, only the links it can move
  (its own, its neighbours', loops) are re-tessellated, in a separate small fill.
- Flow particles are one more instanced draw, loaded on first use: the vertex shader places every
  particle along its link from a small texture of arc-length samples and a time uniform, so an
  animation frame costs no CPU work beyond setting that uniform and redrawing the chart. Frames are
  requested only while particles move and the chart is on screen.
- Hundreds of nodes and thousands of links stay interactive; readability, not rendering, is
  usually the limit.

## Accessibility notes

- **Screen readers:** the hidden description (see the [accessibility guide](/guides/accessibility))
  reads `Sankey diagram "name": N nodes, M links, total flow from sources T.` and mentions cycles;
  its table lists each link's source, target, value and label.
- **Keyboard:** there is no keyboard navigation between nodes and links yet.
- **Motion:** flow particles hold still under `prefers-reduced-motion: reduce`; they add no
  information the link widths don't carry, so a reader without them misses nothing.
- **Color:** node colors only tell nodes apart; labels carry the meaning. Keep link colors
  translucent so crossings stay readable, and prefer concentration colorscales with a clear
  lightness ramp.

## Attribute reference

See the [sankey attribute reference](/reference/sankey) for every attribute, its type, and its
default.

## Related charts

- [Sunburst](/charts/hierarchical/sunburst): a strict hierarchy as nested rings
- [Parallel categories](/charts/statistical/parallel-categories): how categories co-occur, as
  ribbons between category bands
- [Funnel](/charts/financial/funnel): one sequence of stages that items drop out of

## Plotly migration notes

- Attribute names and defaults match Plotly's `sankey`: `node` (`label`, `groups`, `x`, `y`,
  `color`, `customdata`, `line`, `pad`, `thickness`, `align`, `hoverinfo`, `hovertemplate`),
  `link` (`source`, `target`, `value`, `label`, `color`, `hovercolor`, `customdata`, `line`,
  `arrowlen`, `colorscales`, `hoverinfo`, `hovertemplate`), `orientation`, `arrangement`,
  `valueformat`, `valuesuffix`, `textfont`, `domain`, `hoverinfo` and `hoverlabel`. The layout,
  node and link hover labels and event fields follow Plotly.
- Cycles are laid out with d3-sankey's relaxation (circular links left out) and routed as loops
  after d3-sankey-circular; node placement in cyclic graphs can differ from Plotly's.
- Default node colors cover every node, including nodes without a label and group nodes; a group
  without a label of its own is labeled with its members' labels.
- In a vertical sankey, `node.x` / `node.y` are fractions of the domain's height / width (along /
  across the flow); Plotly scales both by the width and the height as in a horizontal one.
- `'snap'` drags push the other nodes of the column aside deterministically instead of Plotly's
  animated force simulation. Event node objects list their links by index (`sourceLinks`,
  `targetLinks`), so events serialize.
- `link.flow` (flow particles) is a Holochart extension; Plotly ignores it.
- Not supported yet: `node.hoverlabel` / `link.hoverlabel` (the trace `hoverlabel` applies to
  both), grouping nodes with a box or lasso selection, keyboard navigation. Extruded ribbons in a
  2.5D view are a planned Holochart extension.
