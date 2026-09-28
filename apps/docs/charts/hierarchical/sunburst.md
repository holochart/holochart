---
title: Sunburst
description: Show a hierarchy as rings of sectors around its root, sized by value, and drill into any branch with a click.
status: complete
chart: sunburst
---

# Sunburst

## Overview

A sunburst draws a hierarchy as rings: the root is a disc in the middle, its children the first
ring around it, their children the next ring, and so on. Each sector spans an angle proportional
to its value, and children sit just outside their parent, inside its span. It shows both the
structure of a tree and how a total divides down it: a budget by department and team, a file
system by folder, sales by region and product. Click a sector to drill into it; click the center
to go back up.

Rows name their parent (`labels` and `parents`, or `ids` when labels repeat), so any table with a
parent column is a sunburst. Holochart draws every sector of a trace in one instanced GPU arc set
and all labels in one batched SDF text set.

Pick a different chart when:

- the hierarchy has one level: use a [pie](/charts/basic/pie);
- readers compare the sizes of leaves precisely: rectangles compare better than angles in rings
  (treemap and icicle charts are planned for this milestone), or use [bars](/charts/basic/bar);
- the data is a flow between stages rather than a tree (Sankey diagrams are planned).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'sunburst',
      labels: ['Eve', 'Cain', 'Seth', 'Enos', 'Noam', 'Abel', 'Awan', 'Enoch', 'Azura'],
      parents: ['', 'Eve', 'Eve', 'Seth', 'Seth', 'Eve', 'Eve', 'Awan', 'Eve'],
      values: [10, 14, 12, 10, 2, 6, 6, 4, 4],
    },
  ],
});
```

The root (`''` parent) is the disc in the middle. First-level sectors take the colorway, their
descendants inherit the color, and leaves are drawn at 70% opacity. Siblings are sorted by value,
largest first, starting at 3 o'clock and going counterclockwise:

<Example id="sunburst/basic" />

## Data format

- **`labels`** and **`parents`** (both required): one row per node. `parents[i]` is the id of
  node `i`'s parent, `''` for a root. Without `ids`, labels are the ids, so labels used as parents
  must be unique.
- **`ids`**: node ids, when labels repeat (the same product under several regions). `parents`
  then refer to ids.
- **Roots.** Several rows with an empty parent get a generated root above them, which is not
  drawn: the chart starts at their ring. Without any empty parent, the one parent id that is not a
  node becomes the root (an _implied_ root, labeled with its id).
- **`values`**: the size of each node, a number ≥ 0; rows with other values are dropped.
  `branchvalues` says how branches add up:
  - `'remainder'` (default): a node's value is its own share, added to its descendants'. A branch
    is bigger than its children; the difference shows as a gap in the next ring.
  - `'total'`: a node's value is the branch total. Its children must not add up to more (the trace
    is not drawn then, and a warning names the node); what they don't use stays a gap.
- **Without `values`**, nodes are sized by `count`: the leaves below them (default), their
  branches (`'branches'`), or both (`'branches+leaves'`).
- **`text`**, **`hovertext`** and **`customdata`**: per-node strings and data for labels, hover
  and events.
- **Errors.** Rows that can't make a tree — a parent that is no node, a parent id used by several
  nodes, parents that loop, several implied roots — are not drawn, and Holochart logs Plotly's
  warning (`Failed to build sunburst hierarchy of trace 0. Error: missing: X`).
- **Placement.** `domain.x` and `domain.y` (fractions of the plot area), or `domain.row` and
  `domain.column` in a [`layout.grid`](/fundamentals/layout-axes-subplots#pies-and-other-domain-traces).
  The sunburst is centered in its domain, with a radius of half its smaller side.

## Variations

### Remainder and total values

The same values read both ways: with `'remainder'` Eve's own 65 adds to her children's 42; with
`'total'` the 65 is the family's total, so her children fill 42/65 of the ring. Labels show each
sector's percent of its parent (`textinfo: 'label+percent parent'`):

<Example id="sunburst/branchvalues" />

### Ids and repeated labels

With `ids`, every region can have its own "Bikes" sector. This example has no empty parent: the
parent id `'total'` names no row, so it becomes the implied root. Region values are their product
lines' sums (`branchvalues: 'total'`):

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'sunburst',
      ids: ['North', 'North/Bikes', 'North/Parts', 'South', 'South/Bikes', 'South/Parts'],
      labels: ['North', 'Bikes', 'Parts', 'South', 'Bikes', 'Parts'],
      parents: ['total', 'North', 'North', 'total', 'South', 'South'],
      values: [600, 420, 180, 530, 310, 220],
      branchvalues: 'total',
      textinfo: 'label+value',
      insidetextorientation: 'radial',
    },
  ],
});
```

<Example id="sunburst/ids" />

### Colorscale

Numbers in `marker.colors` (or any of `marker.colorscale`, `cmin` / `cmax`, `showscale`) color
the sectors through a colorscale instead of the colorway. Here size is headcount and color is
growth, on a diverging scale centered on zero (`cmid`), with a colorbar. Without `marker.colors`,
a colorscale colors by `values`, or by counts without values:

<Example id="sunburst/colorscale" />

### Levels and depth

`maxdepth` limits the rings drawn from the current root (left: two levels); deeper levels appear
as you drill in. `level` sets the current root to a node's id (right: what clicking "Mammals"
does), and `rotation` turns the diagram counterclockwise:

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'sunburst',
      labels: ['Animals', 'Mammals', 'Birds', 'Rodents', 'Bats', 'Songbirds'],
      parents: ['', 'Animals', 'Animals', 'Mammals', 'Mammals', 'Birds'],
      values: [0, 0, 0, 24, 14, 6],
      level: 'Mammals',
      maxdepth: 2,
      rotation: 90,
    },
  ],
});
```

<Example id="sunburst/levels" />

### Label orientation

Labels are fitted inside their sector like pie labels: shrunk to fit, never grown, and dropped
when they would be smaller than a pixel. `insidetextorientation` picks the direction:
`'horizontal'`, `'radial'` (along the radius), `'tangential'` (along the ring) or `'auto'` (the
default: whichever fits largest):

<Example id="sunburst/text-orientation" />

### Patterns

`marker.pattern` hatches sectors (one shape per node, or one for all). With `fillmode: 'overlay'`
the hatches are drawn over the sector colors; with the default `'replace'` the background is the
paper color:

<Example id="sunburst/patterns" />

## Styling

- **Colors.** `marker.colors` (one per node) or, for nodes without one, `layout.sunburstcolorway`
  (default: the `colorway`) on the first level; deeper nodes take their parent's color, and a
  node id keeps its color in every sunburst of the figure. With `layout.extendsunburstcolors`
  (default `true`) the colorway is extended to three times its length, every color 20% lighter
  then every color 20% darker. The root is `root.color` (default transparent).
- **Colorscales.** `marker.colorscale`, `cmin`, `cmax`, `cmid`, `cauto`, `autocolorscale`,
  `reversescale`, `showscale` and `marker.colorbar`, as for other colorscaled traces.
- **Leaves.** `leaf.opacity`: 0.7 by default, 1 with a colorscale.
- **Outlines.** `marker.line.color` (default: `layout.paper_bgcolor`, which separates the
  sectors) and `marker.line.width` (default 1 px, centered on the edges); both take one value per
  node.
- **Patterns.** `marker.pattern` (`shape`, `fillmode`, `size`, `solidity`, `fgcolor`, `bgcolor`,
  `fgopacity`), see [markers and patterns](/customization/markers-patterns).
- **Labels.** `textinfo` combines `label`, `text`, `value`, `current path`, `percent parent`,
  `percent entry` and `percent root`, one per line (default `'label'`, or `'text+label'` when
  `text` is an array). Several percentages say which is which (`'25% of parent'`); the root never
  shows a path or percentage. `texttemplate` takes `%{label}`, `%{value}`, `%{currentPath}`,
  `%{percentParent}`, `%{parent}`, `%{percentEntry}`, `%{entry}`, `%{percentRoot}`, `%{root}`,
  `%{text}`, `%{color}` and `%{customdata}`. `textfont` and `insidetextfont` style them; unless you
  set a text color, labels contrast with their sector. The transparent root's label sits on the
  background and uses `outsidetextfont`.
- **Order.** `sort` (default `true`) orders siblings by value, largest first; `rotation` turns
  the whole diagram.
- **Default look.** Sectors take the template's colorway and are outlined in its paper color, so
  they follow the theme in use ([themes and templates](/customization/themes-templates)).

## Interactivity

- **Drill-down.** Clicking a sector makes it the current root: the chart zooms into its branch
  over 750 ms (sectors of the branch move out to fill the circle, the others fold away). Clicking
  the center goes up one level. Leaves and the whole hierarchy's root don't drill. The new root is
  written to the trace's `level` with a GUI `restyle` (so a `restyle` event follows, and
  `uirevision` keeps it across `react`); setting `level` yourself jumps there without animation.
  Under `prefers-reduced-motion: reduce` drilling jumps too.
- **Cancelling.** Before drilling, the chart emits `sunburstclick` with the clicked point and
  `nextLevel` (the level it is about to show), then `click`. A listener of either that returns
  `false` cancels the drill (a cancelled `sunburstclick` also skips `click`):

  ```ts
  import { createChart } from '@mk7s/holochart';

  const chart = createChart(document.getElementById('chart')!, {
    data: [{ type: 'sunburst', labels: ['All', 'A', 'a1'], parents: ['', 'All', 'A'] }],
  });
  chart.on('sunburstclick', (event) => {
    console.log('drilling to', event.nextLevel);
    return event.nextLevel !== 'A'; // keep "A" closed
  });
  ```

- **Hover.** Hovering a sector shows its label beside the middle of its outer edge: the label,
  value, `text`, current path and percentages of its parent, the current root and the whole
  (`'25% of Seth'`), picked with `hoverinfo` (default `'label+text+value+name'`).
  `hovertemplate` takes the `texttemplate` variables; `%{value}` and the percentages are
  preformatted without a format of their own.
- **Events.** `hover`, `unhover`, `click` and `sunburstclick` carry Plotly-shaped points:
  `curveNumber`, `pointNumber`, `label`, `value`, `id`, `parent` (the parent's label),
  `currentPath`, `entry`, `root`, `percentParent`, `percentEntry`, `percentRoot`, `customdata`
  and `text`.
- Sunbursts have no axes or legend entries, so zoom, pan, box or lasso selection and legend
  toggling don't apply to them.

## Performance notes

- A sunburst draws in two draw calls whatever its size: one instanced arc set for all sectors
  (and their outline rims) and one batched SDF text set for the labels.
- Building the hierarchy is linear in the rows; the layout for the current `level` is cached, so
  hovering doesn't recompute it.
- A drill transition rewrites the arc buffers once per frame for 750 ms and redraws nothing else.
- Thousands of sectors draw fast, but labels stop being readable long before: use `maxdepth` to
  show a few levels at a time and let readers drill in.

## Accessibility notes

- **Screen readers:** the hidden description (see the [accessibility guide](/guides/accessibility))
  reads `Sunburst "name": N nodes on M levels.`, the current root when drilled in, and the largest
  branches with their shares; its table lists every node with its path, value and percent of the
  root.
- **Keyboard:** there is no keyboard navigation or drilling between sectors yet.
- **Color:** children inherit their parent's color, so label sectors directly
  (`textinfo: 'label+percent parent'`) rather than relying on color, and keep the outlines in the
  background color to separate neighbors.

## Attribute reference

See the [sunburst attribute reference](/reference/sunburst) for every attribute, its type, and
its default. [`sunburstcolorway`](/reference/layout#sunburstcolorway) and
[`extendsunburstcolors`](/reference/layout#extendsunburstcolors) are in the layout reference.

## Related charts

- [Pie](/charts/basic/pie): one level of parts of a whole
- [Funnel area](/charts/financial/funnelarea): ordered stages of a process
- [Bar](/charts/basic/bar): exact comparisons, stacked by group

## Plotly migration notes

- Attribute names and defaults match Plotly's `sunburst`: `labels`, `parents`, `ids`, `values`,
  `branchvalues`, `count`, `level`, `maxdepth`, `rotation`, `sort`, `marker.colors` (with the
  colorscale attributes), `marker.line`, `marker.pattern`, `leaf.opacity`, `root.color`, `text`,
  `textinfo`, `texttemplate`, `hovertext`, `hoverinfo`, `hovertemplate`, `textfont`,
  `insidetextfont`, `outsidetextfont`, `insidetextorientation`, `domain`, and the layout's
  `sunburstcolorway` and `extendsunburstcolors`. Plotly sunburst figures carry over unchanged.
- Hierarchy building (implied and generated roots, errors and their warnings), values, counts,
  sorting, colors, label and hover text, event payloads, drilling and `plotly_sunburstclick`
  (`sunburstclick`) follow Plotly.
- Differences: a `click` listener returning `false` also cancels the drill; the drill is a GUI
  `restyle` of `level` (a `restyle` event) rather than an `animate` call; labels fade in at the
  end of the transition instead of moving with their sectors; sectors wider than half a turn fit
  their labels like pie slices.
- Not supported yet: `marker.coloraxis`, `layout.uniformtext`, `texttemplatefallback` /
  `hovertemplatefallback`, animated `level` changes through `animate` or `react` with a
  transition, keyboard navigation.
- A layered 3D extrusion (`depth`, `depthstep`) is a planned Holochart extension.
