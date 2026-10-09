---
title: 3D network graph
description: Draw a network in a 3D scene, with nodes as lit spheres or sprites and links as lines or tubes, at given positions or placed in space by a force or a layered layout.
status: complete
chart: graph3d
---

# 3D network graph

<ChartOverview />

## Overview

A `graph3d` trace draws a network in a [3D scene](/fundamentals/3d-scenes): the nodes as lit
spheres or as flat sprites, and the links between them as lines or as tubes. It takes the data
of the 2D [`graph`](/charts/graphs/graph) trace, `node` and `link` containers in which a link
names its two ends by node index, and adds `node.z`. The positions are given, or computed in
space: by a force-directed layout in three dimensions, or by a layered one that gives every rank
of a directed graph a plane of its own.

Use it when the positions are three-dimensional data (the atoms of a crystal, sensors in a
building), or when a network is too tangled for the plane and its reader can turn it: with a
third dimension a force layout has more room, and clusters that overlap in a 2D drawing can sit
beside, above and behind one another.

That last condition matters. A 3D drawing has to be turned to be read: in any one view, nodes
hide other nodes, and it is hard to tell what is near from what is far. If the chart will be
read as a still picture (a report, a slide, a printed page), if every node needs its label, or
if the structure has a 2D arrangement of its own (a tree, a pipeline, a ring), the 2D
[graph](/charts/graphs/graph) reads better.

`graph3d` is not part of the full bundle. With the full bundle, add one import next to it. In a
partial bundle, register `tracesGraph3d`, which brings the 3D scene with it; it is apart from
`tracesGraph` so that an app with 2D graphs only does not load the 3D package (see
[adding the package](/fundamentals/graphs#adding-the-package)):

```ts
import '@mk7s/holochart';
import '@mk7s/holochart/graph';
```

Pick a different chart when:

- a flat drawing is enough, or the chart must work without interaction: use the 2D
  [graph](/charts/graphs/graph), which also has trees, layered diagrams with routed links,
  circular, arc and hive arrangements, and box and lasso selection;
- the points in space have no links: use [scatter3d](/charts/3d/scatter3d);
- how much flows between the nodes matters more than how they are connected: use a
  [chord diagram](/charts/graphs/chord) or a [sankey](/charts/hierarchical/sankey).

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph3d',
      node: { label: ['Ada', 'Bo', 'Cy', 'Dee', 'Eli'] },
      link: { source: [0, 0, 1, 2, 3], target: [1, 2, 2, 3, 4] },
    },
  ],
});
```

Nodes are numbered by their index in `node.label`, and every link names its `source` and its
`target` node. The nodes have no positions, so the 3D force layout places them
(`arrangement: 'force'`). The trace creates the default scene, `layout.scene`, whose axes are
hidden because layout positions are not a scale to read. Drag to turn the scene and scroll to
move closer.

The live example has fourteen people and `link.value`, the number of reviews between two of
them. It pulls the two together in the layout and, with `link.widthby: 'value'`, sets the width
of their link:

<Example id="graph3d/basic" />

## Data format

- **Nodes and links.** As for [graph](/charts/graphs/graph): `link.source` and `link.target`
  are parallel arrays of node indices (whole numbers; numeric strings are accepted), and
  `node.label` names the nodes. The number of nodes is the length of the longest per-node array
  (`node.label`, `x`, `y`, `group`, `customdata`, and `size` and `color` when they are arrays);
  without any of them it is one more than the largest index a link names. See
  [the data model](/fundamentals/graphs#the-data-model) and
  [getting data in](/fundamentals/graphs#getting-data-in) for the adapters that build these
  containers.
- **`link.value`.** A positive number per link: its weight for the layout (`force.linkweight`
  says how it is used) and `%{value}` in hover labels. It sets the width only with
  `link.widthby: 'value'`. A missing or non-positive value counts as 1 for the layout.
- **Positions.** `node.x`, `node.y` and `node.z`, one value per node. What they mean depends on
  the arrangement (below).
- **Trees.** `labels` and `parents`, as the hierarchical traces take them, are a second way to
  give a tree when the trace has no `link.source`: every row is a node, and every row with a
  parent gets a link from its parent. A parent is named by its id (`ids`, else its label), `''`
  marks a root, and a parent that is no row becomes a node of its own.
- **Left out.** A link whose source or target is not a node index is dropped. A link from a
  node to itself is not drawn. A node that is not drawn (no position under `'preset'`, or a
  group hidden through the legend) takes its links with it.
- **Scene.** `scene: 'scene2'` puts the trace in another scene (default `'scene'`); see
  [several scenes](/fundamentals/3d-scenes#several-scenes).

`arrangement` picks what places the nodes. The default is `'preset'` when `node.x`, `node.y` and
`node.z` cover every node, else `'force'`:

| `arrangement` | Positions                                                                                                                                                                                                                                                           | Scene axes |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `'preset'`    | `node.x` / `y` / `z` are data on the scene's axes: numbers, dates or categories, by the axis type. A node without all three is not drawn.                                                                                                                           | shown      |
| `'force'`     | A force-directed layout in three dimensions (options: `force`). A node given `x`, `y` and `z` stays where it is, in layout units, and one given some of them is held along those axes.                                                                              | hidden     |
| `'layered'`   | A directed graph in planes, one per rank; the nodes of a plane are spread by the force layout (options: `layered` and `force`).                                                                                                                                     | hidden     |
| `'custom'`    | The layout registered under `custom.name` with `registerGraphLayout`, called with the graph and `custom.options`. It returns `z` as well as `x` and `y`; without `z` the graph is drawn flat. See [your own layout](/fundamentals/graphs#bringing-your-own-layout). | hidden     |

The computed arrangements return **layout units**. The trace asks the scene for the same extent
on all three axes, so one unit is as long along x, y and z and the layout keeps its
proportions, and its longest side fills the scene's box.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

// Methane: positions are data (here in ångström), so the arrangement is 'preset'.
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph3d',
      node: {
        label: ['C', 'H', 'H', 'H', 'H'],
        x: [0, 0.629, -0.629, -0.629, 0.629],
        y: [0, 0.629, -0.629, 0.629, -0.629],
        z: [0, 0.629, 0.629, -0.629, -0.629],
        size: [30, 18, 18, 18, 18],
        color: ['#555b6e', '#c7c7c7', '#c7c7c7', '#c7c7c7', '#c7c7c7'],
      },
      link: { source: [0, 0, 0, 0], target: [1, 2, 3, 4], width: 5 },
    },
  ],
});
```

### What the 2D trace has and this one does not

`graph3d` has the attributes of `graph` wherever one means the same in space. These are left
out:

- **Arrangements.** `'tree'`, `'radial'`, `'dendrogram'`, `'circular'`, `'grid'`, `'arc'` and
  `'hive'`, with their option containers, and `node.value`, which only they read. The 2D
  `layered` options that order nodes and route links (`rankdir`, `nodesep`, `routing`,
  `clusters`, …) are replaced by `layered.axis` and the planes.
- **Box nodes** (`node.shape`): a node is a sphere or a sprite.
- **The style of set-apart links** (`link.secondary`): with `'layered'`, a link that closes a
  cycle is drawn like the others, in the direction the data gives it.
- **Selection styles** (`selected`, `unselected`) and the path between two selected nodes: a
  scene has no box or lasso selection. `highlight.path` still draws a path the figure names.
- **Dragging nodes** (`node.draggable`): a drag in a scene turns the camera.
- **`force.simulate`**: the layout is drawn settled; its cooling is not animated in a scene.
- **Large-graph options** (`worker`, `lod`, `link.bundle`): the layout runs on the main thread,
  everything is drawn at every zoom, and links are not bundled.

## Variations

<ChartVariations />

### Force layout with groups

`node.group` gives every node a group: its color, and one legend item, which a click hides.
`force.groupstrength` pulls the nodes of a group together even where their links do not.
`node.sizeby: 'degree'` sizes the nodes by their number of links, between the two diameters of
`node.sizerange`. The layout is deterministic, so this figure looks the same on every machine:

<ExampleLink id="graph3d/force" />

### Layered: one plane per rank

`arrangement: 'layered'` breaks the cycles of a directed graph and gives every node a rank, as
the 2D layered layout does (`layered.ranker` picks how), and makes each rank a plane. The planes
are `layered.ranksep` apart (default 80 layout units) along `layered.axis` (default `'z'`), the
first rank at the top, so links run down. Within its plane a node is placed by the force layout,
whose links rest at the distance between two planes, so linked nodes end up above one another.
`layered.showplanes` (default `true`) outlines every plane, in `layered.planecolor`.

Arrowheads are on by default under `'layered'` (`link.arrow.end`), as in the 2D trace, and off
under the other arrangements unless you set `link.arrow.end` or `start`. They are lit cones,
`link.arrow.size` long, whose tips stop at the surface of the node they point at:

<ExampleLink id="graph3d/layered" />

### Given positions on the scene's axes

With `node.x`, `node.y` and `node.z` for every node, positions are data. The scene's axes are
drawn, with ticks and titles, and `scene.aspectmode` shapes the box as for any 3D trace. Here
the ions of rock salt sit on a cubic lattice; the bonds are 7 px wide, which makes them tubes:

<ExampleLink id="graph3d/preset" />

### Spheres or sprites, tubes or lines

Each part of the graph can be an object in the scene or a mark on the screen:

| Attribute     | Value                | Drawn as                                                                                              | Size                                                                           |
| ------------- | -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `node.render` | `'sphere'` (default) | lit spheres                                                                                           | `node.size` px at the middle of the scene; larger near the camera, smaller far |
| `node.render` | `'sprite'`           | flat markers that face the camera, with `node.symbol` and `node.line`                                 | `node.size` px at every depth                                                  |
| `link.render` | `'tube'`             | lit tubes                                                                                             | `link.width` px across at the middle of the scene                              |
| `link.render` | `'line'`             | screen-space lines, which take `link.dash`                                                            | `link.width` px at every depth                                                 |
| `link.render` | `'auto'` (default)   | tubes when the widest link is 3 px or wider and the graph has at most 5,000 links to draw, else lines | as above                                                                       |

"At the middle of the scene" means at the point the camera looks at in the first view that is
drawn. A sphere of `size: 10` is 10 CSS px across there; it is an object in the scene from then
on, so it grows as the camera comes closer, and an arrowhead ends on it at any zoom. Sprites and
lines keep their px, as `scatter3d` markers and lines do. Here the two kinds of node differ by
symbol as well as by color:

<ExampleLink id="graph3d/sprites" />

### Parallel links and loops

Links between the same two nodes are fanned out as arcs, so that each can be seen and hovered,
and two opposite links bow apart. A link from a node to itself is a ring beside the node, on the
side away from its neighbours; further ones are larger rings. `link.curve` sets the curvature
by hand, as a fraction of the link's length: a positive value bows to the left of the link's
direction seen from above, and a vertical link bows along y. Arrowheads end on the node's
surface along the curve:

<ExampleLink id="graph3d/links" />

### A larger graph

2,400 nodes and about 2,600 links. The links are 1 px wide, so they are lines, and the labels
are turned off (`node.textposition: 'none'`) and left to hover:

<ExampleLink id="graph3d/large" />

### An orbiting camera

The scene is the one every 3D trace is drawn in, so
[`chart.animateCamera`](/fundamentals/3d-scenes#camera-animation) and
[`scene.autorotate`](/fundamentals/3d-scenes#auto-rotation) work as they are. Turning the graph
is what shows its depth. Numbers in `node.color` go through `node.colorscale`, here with a
colorbar:

<ExampleLink id="graph3d/orbit" />

## Styling

- **Nodes.** `node.size` (a diameter in px, or one per node; default 10) or `node.sizeby`
  (`'degree'`, `'indegree'` or `'outdegree'`: the area grows with the count, between the
  diameters of `node.sizerange`, default 6 to 30), and `node.opacity`. For sprites,
  `node.symbol` (one, or one per node) and `node.line.color` / `node.line.width`.
- **Node colors.** `node.color` is one CSS color, one per node, or numbers mapped through
  `node.colorscale` (with `cmin`, `cmax`, `reversescale`, `showscale` and `colorbar`, or a shared
  `coloraxis`). Default: the group's color when `node.group` is given (the colorway, one color
  per group), else the trace's colorway color. See
  [colors and colorscales](/fundamentals/colors-colorscales).
- **Links.** `link.color` (one, or one per link; default: a translucent gray chosen for the
  background), `link.width` (default 1) or `link.widthby: 'value'` with `link.widthrange`
  (default 1 to 8 px), `link.opacity`, and `link.dash` for lines. Tubes are lit and opaque: a
  translucent link color is mixed with the background into an opaque one, and `link.opacity`
  fades the tubes as a whole.
- **Arrowheads.** `link.arrow.end` and `link.arrow.start`, with `link.arrow.size` (default 8 px,
  measured like `node.size`). A wide link gets a head at least three times its width, and a
  link too short for its head gets a shorter one.
- **Labels.** `node.textposition` (`'auto'`: to the right of the node; scatter's nine positions;
  `'none'`) and `node.textfont` (default: `layout.font` with the automatic halo). Labels face
  the camera and keep their px size. Where they would overlap each other or a node on screen,
  the nodes with the most links keep theirs; turning the scene or moving closer shows others.
- **Trace opacity.** `opacity` multiplies the opacity of nodes, links and labels.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph3d',
      node: {
        label: ['Gateway', 'Auth', 'Orders', 'Stock', 'Mail'],
        group: ['Edge', 'Core', 'Core', 'Core', 'Edge'],
        sizeby: 'degree',
        sizerange: [12, 28],
        textfont: { size: 13 },
      },
      link: {
        source: [0, 0, 1, 2, 2],
        target: [1, 2, 2, 3, 4],
        color: '#8a8fa3',
        width: 4,
        arrow: { end: true, size: 14 },
      },
    },
  ],
  layout: { scene: { camera: { eye: { x: 1.1, y: 1.1, z: 0.7 } } } },
});
```

## Interactivity

- **Camera.** Drag to turn the scene, scroll or pinch to zoom, double-click to go back to the
  first view; the [scene controls](/fundamentals/3d-scenes#controls) list every gesture and
  `scene.dragmode`.
- **Hover.** Nodes and links are picked on the GPU, so what you hover is what you see, not
  something hidden behind it; where a node and a link are equally near, the node wins. A
  node's label shows its name, its number of links (`Links in: …, out: …` when the trace has
  arrowheads) and its group. A link's label shows its two ends (joined by `→`, `←` or `↔` for
  the arrowheads it has, else `–`), `link.label` and its value. See
  [hover and picking](/fundamentals/3d-scenes#hover-and-picking): the label is hidden while the
  camera moves, and `scene.hovermode: false` turns hover off.
- **Highlighting.** Hovering a node keeps it, its links and the nodes they lead to, and fades
  the rest; hovering a link keeps the link and its two ends. The `highlight` container is the
  2D trace's: `hops` for a wider neighbourhood, `direction` (`'both'`, `'out'`, `'in'`), `dim`,
  `color`, and `nodes` and `path` to highlight without a pointer. Spheres, tubes and arrowheads
  are opaque, so what is dimmed fades toward the scene's background color instead of turning
  transparent. Highlighting follows the scene's hover: there is none with
  `scene.hovermode: false` or `hoverinfo: 'skip'`.
- **Templates.** `node.hovertemplate` takes `%{label}`, `%{degree}`, `%{indegree}`,
  `%{outdegree}`, `%{group}`, `%{size}`, `%{color}` and `%{customdata}`, and with
  `arrangement: 'preset'` also `%{x}`, `%{y}` and `%{z}`, formatted like the scene's axes
  (layout positions are not reported). `link.hovertemplate` takes `%{label}`, `%{value}`,
  `%{source.label}`, `%{target.label}`, `%{source.index}`, `%{target.index}` and
  `%{customdata}`. `<extra>…</extra>` replaces the trace name:

  ```ts
  import { createChart } from '@mk7s/holochart';
  import '@mk7s/holochart/graph';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'graph3d',
        node: {
          label: ['Ada', 'Bo', 'Cy'],
          customdata: ['lead', 'reviewer', 'author'],
          hovertemplate: '<b>%{label}</b> (%{customdata})<br>%{degree} links<extra></extra>',
        },
        link: {
          source: [0, 0, 1],
          target: [1, 2, 2],
          value: [9, 4, 7],
          hovertemplate: '%{source.label} and %{target.label}: %{value} reviews<extra></extra>',
        },
      },
    ],
  });
  ```

- **Hover control.** `hoverinfo` (`'all'`, `'none'` or `'skip'`) is the default of
  `node.hoverinfo` and `link.hoverinfo`: `'none'` keeps the events without labels, `'skip'`
  turns hover and events off for that part.
- **Legend.** With `node.group` the legend has one item per group, in order of first
  appearance. A click hides the group's nodes and their links; the others stay where they are,
  since hidden nodes still take part in the layout. The hidden names are in
  `layout.hiddenlabels`. A trace without groups has no legend item by default. When
  `node.color` is given per node, the legend has one item for the trace, not one per group.
- **Events.** `hover`, `unhover` and `click` points say what they are in `kind` (`'node'` or
  `'link'`), with `curveNumber` and `pointNumber`: the node index, or the link's index in the
  `link` arrays. A node carries `label`, `degree`, `indegree`, `outdegree`, `group`, `size`,
  `color` and `customdata`, and with `'preset'` its `x`, `y` and `z`. A link carries `label`,
  `value`, `customdata`, and `source` and `target`, each with the `index`, `label` and `degree`
  of that node. A press on the scene starts a camera gesture; releasing it without dragging
  emits `click`:

  ```ts
  chart.on('click', (e) => {
    const p = e.points[0];
    if (p?.kind === 'node') console.log(p.pointNumber, p.label, p.degree);
  });
  ```

## 3D-native options

- **The scene.** Everything under `layout.scene` applies: the `camera` and its projection,
  `dragmode`, `domain`, annotations and several scenes in one figure. See
  [3D scenes](/fundamentals/3d-scenes).
- **Axes.** With a computed arrangement the scene's axes default to `visible: false`, which
  leaves out the grids, walls, ticks, titles and spikes: layout units are not a scale to read.
  This applies when every trace of the scene asks for it, and the figure can still set
  `scene.xaxis.visible` (and `yaxis`, `zaxis`). With `'preset'` the axes are drawn and typed
  like any 3D trace's (linear, log, date or category).
- **Aspect.** With `'preset'`, [`scene.aspectmode`](/fundamentals/3d-scenes#aspect-ratio)
  shapes the box from the data. With a computed arrangement all three axes get the same extent,
  so every mode but `'manual'` draws a cube in which the layout keeps its proportions.
- **Sizes in the scene.** Spheres, tubes and arrowheads are sized once, for the first view that
  is drawn, and are objects in the scene from then on (see
  [spheres or sprites](#spheres-or-sprites-tubes-or-lines)). Set `scene.camera` in the figure to
  choose the view the sizes are measured in.
- **Light.** Spheres are shaded by a light of their own that moves with the camera, the same in
  every scene; they do not read `scene.lighting`. Tubes and arrowheads are meshes: they are lit
  like other 3D meshes, and take the [scene's lights](/customization/materials-lighting) when
  `scene.lighting` is set. The trace has no `lighting` or `material` attributes of its own.
- **Camera animation.** [`chart.animateCamera`](/fundamentals/3d-scenes#camera-animation)
  flies the camera to a new view, and
  [`scene.autorotate`](/fundamentals/3d-scenes#auto-rotation) turns the scene like a turntable.

### A layout of your own

`arrangement: 'custom'` runs a layout you register by name: a function from the graph to typed
arrays of positions, here with a `z`. It runs in calc and must return a finite position for
every node:

```ts
import { createChart } from '@mk7s/holochart';
import { registerGraphLayout } from '@mk7s/holochart/graph';

// The nodes on a helix, in index order: one turn every eight nodes.
registerGraphLayout('helix', (graph) => {
  const x = new Float64Array(graph.nodes);
  const y = new Float64Array(graph.nodes);
  const z = new Float64Array(graph.nodes);
  for (let i = 0; i < graph.nodes; i++) {
    const angle = (i * Math.PI) / 4;
    x[i] = 100 * Math.cos(angle);
    y[i] = 100 * Math.sin(angle);
    z[i] = 12 * i;
  }
  return { x, y, z };
});

const chain = Array.from({ length: 23 }, (_, i) => i);
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'graph3d',
      arrangement: 'custom',
      custom: { name: 'helix' },
      link: { source: chain, target: chain.map((i) => i + 1) },
    },
  ],
});
```

## Performance notes

- **Draw calls.** Each part is one draw call, whatever the size of the graph: the nodes (ray-cast
  sphere impostors, four vertices each, or sprites), the links as one line with gaps, or as one
  mesh of tubes and arrowheads, the labels, and the plane outlines. The 2,400-node example draws
  its nodes and links in two.
- **The camera.** Orbiting, zooming and panning move the camera; positions are not computed or
  uploaded again. The parts sized in scene units (sphere sizes, tubes, arrowheads) are built
  again when the scene's layout or size changes, not while the camera moves. Two things do
  follow the camera: the choice of labels and the order of translucent nodes (both below).
- **Lines or tubes.** A line is three vertices per link. A tube is two rings of eight vertices,
  built on the CPU, and an arrowhead is a cone on top of that. `link.render: 'auto'` draws lines
  above 5,000 links; set `'line'` yourself to get them for fewer.
- **The layout runs in calc**, synchronously, before anything is drawn. The force layout is a
  Barnes–Hut simulation on an octree, so a step costs about _n_ log _n_ for _n_ nodes, not
  _n_². `force.ticks` is the number of steps: by default 600 up to 500 nodes and fewer for
  larger graphs (300 from 1,000 to 3,000 nodes, 90 at 10,000). Fewer steps are faster and leave a
  rougher layout. It runs again when something it reads changes (the nodes, the links, their
  sizes, the `force` options), not when a color changes. The 2D trace's `worker`, `lod` and
  `link.bundle` are not attributes of `graph3d`: its layout always runs on the main thread.
- **Positions you already have cost nothing**: compute them once, elsewhere or ahead of time,
  and pass them as `node.x` / `y` / `z` with `arrangement: 'preset'`.
- **Labels** are chosen on the CPU for the view of the moment, a moment after the camera comes
  to rest, among the 600 nodes with the most links. Turn them off with
  `node.textposition: 'none'` for graphs that are read by hover.
- **Translucent nodes** (`node.opacity` below 1, or given per node) are blended and sorted by
  depth as the camera moves, up to 200,000 nodes. Keep nodes opaque in large graphs.
- **Bundle size.** An entry with the runtime and `tracesGraph3d`, the trace and the 3D scene it
  is drawn in, is budgeted at 236 kB minified and gzipped, without three.js. The renderer's 3D
  lines, markers and spheres, and its mesh code for tubes and arrowheads, are lazy chunks, loaded
  on first use.

## Accessibility notes

- **Screen readers:** the hidden description (see the
  [accessibility guide](/guides/accessibility)) is the 2D trace's, beginning `3D network
graph`: the numbers of nodes, links and groups, the arrangement (a layered graph says its
  axis and its number of ranks), whether everything is connected, the most-connected nodes by
  name and the groups with their sizes. The data table is the list of links.
- **Keyboard:** Tab moves into the plot area. The stops are the drawn nodes and, below each
  node, its links: ↓ from a node goes to its first link, ← / → move through that node's links,
  ↓ follows the link to its other end and ↑ returns. Under `'layered'` the nodes are walked
  plane by plane, with ↑ / ↓ along the links. Shift + arrow keys orbit the camera, `+` / `-`
  move it in and out and `0` resets it, as in every
  [3D scene](/guides/accessibility#keys-by-chart-family).
- **Do not rely on depth.** A reader who cannot drag sees one view, so set a `scene.camera`
  that shows the structure you describe, and say in the text around the chart what the graph
  shows. `scene.autorotate` lets depth be seen without a gesture; it stops with reduced motion.
- **Color and shape:** groups are told apart by color only when nodes are spheres. Where the
  kind of a node matters, use `node.render: 'sprite'` with a `node.symbol` per kind, or label
  the nodes. Spheres are shaded, which darkens a part of each: pick group colors that differ in
  hue, not only in lightness.
- **Labels are partial.** Only the labels that fit are drawn, so a node's name may be visible
  only on hover or from the keyboard. Where every name matters, use the 2D
  [graph](/charts/graphs/graph).

## Attribute reference

See the [graph3d attribute reference](/reference/graph3d) for every attribute, its type and its
default: for instance [`arrangement`](/reference/graph3d#arrangement),
[`node.render`](/reference/graph3d#node.render), [`link.render`](/reference/graph3d#link.render),
[`force`](/reference/graph3d#force) and [`layered`](/reference/graph3d#layered). Scene
attributes (camera, axes, aspect, lights) are under [`scene`](/reference/layout#scene) in the
layout reference.

## Related charts

- [Network graph](/charts/graphs/graph): the same data in 2D, with more arrangements, routed
  and curved links, box nodes and selection
- [Scatter3D](/charts/3d/scatter3d): points, lines and text at x, y, z without the node and link
  model
- [3D scenes](/fundamentals/3d-scenes): the camera, axes, controls, hover and animation every 3D
  trace shares
- [Graphs](/fundamentals/graphs): the data model, the adapters and measures, and
  [choosing an arrangement](/fundamentals/graphs#choosing-an-arrangement)

## Plotly migration notes

- Plotly.js has no graph trace, in 2D or in 3D. A network is drawn there as a `scatter3d` trace
  of markers for the nodes and another of lines for the links, with the positions computed
  elsewhere (networkx, igraph) and the line coordinates listed pair by pair with gaps between.
- To port such a figure, pass the node positions as `node.x`, `node.y` and `node.z` and the
  pairs as `link.source` and `link.target` (node indices). With all three coordinates the
  arrangement is `'preset'`, so the picture keeps its positions and its axes. Marker colors,
  sizes and `text` become `node.color`, `node.size` and `node.label`.
- Or leave the positions out and let `arrangement: 'force'` compute them. The result will not
  match a layout computed by another library.
- `layout.scene` is Plotly's: the camera, `aspectmode`, the axis attributes and `dragmode` mean
  the same. `scene.autorotate` and `scene.lighting` are Holochart extensions.
- A `scatter3d` figure of a network still draws as it is, without this trace.
