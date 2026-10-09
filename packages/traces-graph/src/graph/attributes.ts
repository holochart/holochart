/**
 * `graph` attribute schema (backlog G1, ADR-029): a node-link chart. `node` and `link` are shaped
 * like sankey's, so one pair of containers feeds both (`link.source` / `link.target` are node
 * indices); `ids` / `labels` / `parents`, as the hierarchical traces take them, are a second way
 * to give a tree. `arrangement` names the layout that places the nodes.
 *
 * The trace is cartesian: `xaxis` / `yaxis` come from the registry. With `arrangement: 'preset'`
 * `node.x` / `node.y` are data on those axes (dates, categories and log axes work, and the graph
 * can sit over another trace); every other arrangement computes positions, hides the axes and
 * locks them to one scale (core's `axisHints`).
 *
 * Every computed arrangement has an option container: `force`, `layered`, `tree` (shared by the
 * `'tree'`, `'radial'` and `'dendrogram'` arrangements), `arc` and `hive`. Their names are
 * lowercase, as everywhere in a figure; `options.ts` turns them into the layouts' own options.
 *
 * Edit types: what the model or the layout reads is `calc` (every layout option is); what only
 * changes how links and labels are drawn (widths, curves, arrowheads, label fonts) is `plot`, and
 * so are `force.simulate` and `tree.collapsible`, which the view reads; colors, outlines, dashes
 * and opacities are `style`; hover attributes are `none`.
 *
 * Interaction (backlog G5): `highlight` (what a hover and a path emphasize; read by the view on
 * every hover, so `style`: the view must see the trace that holds it), `node.draggable` (`plot`,
 * like `tree.collapsible`) and `force.start` (`calc`: the layout reads it).
 */
import { attr } from '@mk7s/holochart-core';
import { colorscaleAttributes, scatterAttributes } from '@mk7s/holochart-traces-basic';
import { GRAPH_ARRANGEMENTS } from '../layout/registry.ts';

/**
 * `node.textposition` values: `'auto'`, scatter's nine positions, and `'none'` for no labels.
 * @internal
 */
export const NODE_TEXT_POSITIONS = [
  'auto',
  'top left',
  'top center',
  'top right',
  'middle left',
  'middle center',
  'middle right',
  'bottom left',
  'bottom center',
  'bottom right',
  'none',
] as const;

/** `node.sizeby` values. @internal */
export const NODE_SIZE_BY = ['none', 'degree', 'indegree', 'outdegree'] as const;

/** `node.hoverinfo` / `link.hoverinfo`. */
function partHoverinfo(what: string) {
  return attr.enumerated({
    values: ['all', 'none', 'skip'],
    dflt: 'all',
    editType: 'none',
    description: `Hover of ${what}: labels (\`'all'\`), events without labels (\`'none'\`) or no hover and no events (\`'skip'\`). Default: the trace \`hoverinfo\`.`,
  });
}

/** `selected.node` / `unselected.node` (scatter's `selected.marker`, for nodes). */
function selectionStyle(which: 'selected' | 'unselected') {
  return attr.object(
    {
      node: attr.object(
        {
          opacity: attr.number({
            min: 0,
            max: 1,
            editType: 'style',
            description: `Opacity of ${which} nodes.${which === 'unselected' ? ' Default: 0.2 × the node opacity when no selected or unselected opacity is set.' : ''}`,
          }),
          color: attr.color({ editType: 'style', description: `Color of ${which} nodes.` }),
        },
        { editType: 'style', description: `Style of ${which} nodes.` },
      ),
    },
    {
      editType: 'style',
      description: `Style of ${which} nodes while a selection is active (box or lasso select, \`selectedpoints\`). Links between two selected nodes keep their style; the others are dimmed.`,
    },
  );
}

/** `highlight.direction` values. @internal */
export const HIGHLIGHT_DIRECTIONS = ['both', 'out', 'in'] as const;

/** `highlight`: what a hover and a path emphasize (backlog G5). */
function highlightAttributes() {
  return attr.object(
    {
      mode: attr.flaglist({
        flags: ['neighbors', 'path'],
        extras: ['none'],
        dflt: 'neighbors+path',
        editType: 'style',
        description:
          "What is emphasized, the rest of the graph being dimmed (`highlight.dim`). `'neighbors'`: while the pointer is over a node, the node, the links that lead from it and the nodes they lead to (`highlight.hops`, `highlight.direction`); over a link, the link and its two ends. `'path'`: while exactly two nodes are selected, a shortest path between them. `'none'`: neither. Hover highlighting is skipped for a graph of more than 50,000 nodes and links together.",
      }),
      hops: attr.integer({
        min: 0,
        dflt: 1,
        editType: 'style',
        description:
          "With `'neighbors'`: how many links away from the hovered node the highlight reaches. 1: its neighbours; 2: their neighbours too; 0: the node alone. The links between two nodes that are both at the last hop are not part of it.",
      }),
      direction: attr.enumerated({
        values: HIGHLIGHT_DIRECTIONS,
        dflt: 'both',
        editType: 'style',
        description:
          "With `'neighbors'`: which links are followed from the hovered node, and from each node reached. `'both'`: all of them. `'out'`: only from a link's source to its target, which gives what the node leads to (its descendants). `'in'`: only from target to source: what leads to it (its ancestors).",
      }),
      dim: attr.number({
        min: 0,
        max: 1,
        dflt: 0.15,
        editType: 'style',
        description:
          'Opacity factor of the nodes, links and labels that are not highlighted while something is.',
      }),
      color: attr.color({
        editType: 'style',
        description: "Color of the highlighted links. Default: each link's own color, made opaque.",
      }),
      nodes: attr.dataArray({
        editType: 'style',
        description:
          'Node indices whose neighbourhood is highlighted as a hover on each of them would (`highlight.hops`, `highlight.direction`), whatever `highlight.mode` says, until this is unset: for a highlight that the app drives (a search box, a linked view, a story). The pointer over a node or link takes its place while it is there.',
      }),
      path: attr.infoArray({
        items: [
          attr.integer({ min: 0, editType: 'style' }),
          attr.integer({ min: 0, editType: 'style' }),
        ],
        editType: 'style',
        description:
          'Two node indices: a shortest path from the first to the second is highlighted, whatever is selected, until this is unset. Nothing is highlighted when there is no such path. `graphPath(trace)` returns the path that is highlighted.',
      }),
      pathweight: attr.enumerated({
        values: ['hops', 'value'],
        dflt: 'hops',
        editType: 'style',
        description:
          "What makes a path short. `'hops'`: the number of its links. `'value'`: the sum of its links' `link.value`, each taken as a cost or a distance (a link without a positive value costs 1).",
      }),
      pathdirected: attr.boolean({
        editType: 'style',
        description:
          'Whether a path follows every link from its source to its target only. Default: `true` when the links have arrowheads at their targets (`link.arrow.end`), else `false`: a path may run along a link either way.',
      }),
    },
    {
      editType: 'style',
      description:
        'Highlighting: the neighbourhood of the node or link under the pointer (or of `highlight.nodes`), and a shortest path between two selected nodes or the two of `highlight.path`. What is highlighted keeps its look, its label shows even where there was no room for it, and everything else is dimmed; nothing is laid out or built again. A hover comes first, then `highlight.nodes`, then a path.',
    },
  );
}

/** The four directions a layered graph or a tree can run in. @internal */
export const DIRECTIONS = ['TB', 'BT', 'LR', 'RL'] as const;

/** `force`: the options of `arrangement: 'force'`. */
function forceAttributes() {
  return attr.object(
    {
      algorithm: attr.enumerated({
        values: ['spring', 'forceatlas2'],
        dflt: 'spring',
        editType: 'calc',
        description:
          "The model of the simulation. `'spring'`: links are springs with a rest length and every two nodes repel (the d3-force model); even link lengths, the usual choice. `'forceatlas2'`: links pull in proportion to their length and nodes repel in proportion to their degrees (ForceAtlas2); it pulls communities apart better in graphs with hubs.",
      }),
      simulate: attr.boolean({
        dflt: false,
        editType: 'plot',
        description:
          'Show the layout settling: the nodes start in a spiral and the chart draws the simulation as it cools, a few steps per frame, ending on the same picture as without it. The axes are sized for the settled layout from the start. It runs again when something the layout reads changes (the nodes, the links, their sizes, these options), not on a change of style. Without motion (`prefers-reduced-motion`, `config.a11y.reducedMotion`), on a static plot (an image export) and for graphs of more than 2,000 nodes or 10,000 links the settled layout is drawn at once. When the layout runs off the main thread (`worker`), the positions the worker reports are what is shown, as fast as they come: nothing is replayed afterwards, and `simulate` then only says whether a dragged node pushes the others aside.',
      }),
      seed: attr.integer({
        min: 0,
        dflt: 1,
        editType: 'calc',
        description:
          'Seed of the generator that separates nodes at the same place. The layout is deterministic: the same figure gives the same positions everywhere; another seed gives another, equally valid, layout of graphs that have such nodes.',
      }),
      ticks: attr.integer({
        min: 1,
        editType: 'calc',
        description:
          'Steps of the simulation from its start to rest; the cooling is spread over them. More steps untangle a graph better and take longer. Default: 600 up to 500 nodes, fewer for larger graphs (300 from 1,000 to 3,000 nodes, 90 at 10,000).',
      }),
      linkdistance: attr.number({
        min: 0,
        dflt: 30,
        editType: 'calc',
        description:
          "`'spring'`: the rest length of a link, in layout units (CSS px before the graph is fitted to the plot area). Links end up longer where the repulsion of their nodes stretches them.",
      }),
      linkstrength: attr.number({
        min: 0,
        max: 1,
        editType: 'calc',
        description:
          "`'spring'`: how hard a link pulls its nodes to its rest length, 0 to 1. Default: per link, 1 / the smaller degree of its two nodes, so that the links of a hub do not crush its neighbours onto it.",
      }),
      linkweight: attr.enumerated({
        values: ['strength', 'distance', 'none'],
        dflt: 'strength',
        editType: 'calc',
        description:
          "What `link.value` does to a link: `'strength'`: a larger value pulls harder; `'distance'`: a larger value makes the link shorter (`'spring'` only; as `'strength'` for `'forceatlas2'`); `'none'`: nothing.",
      }),
      charge: attr.number({
        dflt: -60,
        editType: 'calc',
        description:
          "`'spring'`: the strength of the force between every two nodes: negative values push them apart (the more negative, the larger and more open the layout), positive ones pull them together.",
      }),
      gravity: attr.number({
        min: 0,
        editType: 'calc',
        description:
          "The pull toward the center, which keeps the parts of a graph that are not linked from drifting apart. `'spring'`: each connected part is pulled as a whole (default 0.05). `'forceatlas2'`: every node is pulled, the more links it has the harder (default 1).",
      }),
      collide: attr.boolean({
        dflt: true,
        editType: 'calc',
        description:
          'Keep nodes from overlapping, each taken as a circle around its marker or box.',
      }),
      collidepadding: attr.number({
        min: 0,
        dflt: 2,
        editType: 'calc',
        description: 'With `collide`: the room left between two nodes, in layout units.',
      }),
      groupstrength: attr.number({
        min: 0,
        dflt: 0,
        editType: 'calc',
        description:
          'The pull of every node toward the middle of its group (`node.group`), which keeps the nodes of a group together even where the links do not. 0.05 to 0.3 are usual values.',
      }),
      scalingratio: attr.number({
        min: 0,
        editType: 'calc',
        description:
          "`'forceatlas2'`: the repulsion between nodes; a larger value gives a larger, more open layout. Default: 10, or 1 with `linlog`.",
      }),
      linlog: attr.boolean({
        dflt: false,
        editType: 'calc',
        description:
          "`'forceatlas2'`: links pull with the logarithm of their length instead of the length: tighter and better separated clusters.",
      }),
      start: attr.object(
        {
          x: attr.dataArray({
            editType: 'calc',
            description:
              'Where each node is along x, in layout units; a node without a number starts in the spiral.',
          }),
          y: attr.dataArray({
            editType: 'calc',
            description: 'Where each node is along y (see `force.start.x`).',
          }),
          alpha: attr.number({
            min: 0,
            max: 1,
            dflt: 1,
            editType: 'calc',
            description:
              'How warm the layout still is at these positions. 0: at rest: the positions are the layout, and nothing is simulated. Above 0 the simulation goes on from them, cooling from this value at the rate of a full run, so 0.3 moves the nodes about a little and 1 is a full run.',
          }),
        },
        {
          editType: 'calc',
          description:
            'A picture the layout goes on from, in place of the spiral: where every node is, and how warm the layout still is there. Pinned nodes (`node.x` and `node.y`) are where those say; the layout is centered on the middle of these positions and not moved afterwards. The chart writes it when a node is dragged, so that the figure is the picture on screen: at rest (`alpha: 0`) on a drop, with `alpha: 0.3` when a pinned node is released, and once more at rest when a layout shown with `force.simulate` has settled. While it is at rest the other `force` options change nothing: unset it to lay the graph out afresh.',
        },
      ),
    },
    {
      editType: 'calc',
      description:
        "Options of `arrangement: 'force'`. Lengths are layout units: CSS px at the size the graph is laid out for, before it is fitted to the plot area.",
    },
  );
}

/** `layered`: the options of `arrangement: 'layered'`. */
function layeredAttributes() {
  return attr.object(
    {
      rankdir: attr.enumerated({
        values: DIRECTIONS,
        dflt: 'TB',
        editType: 'calc',
        description:
          "The direction the links point in: top to bottom (`'TB'`), bottom to top (`'BT'`), left to right (`'LR'`) or right to left (`'RL'`).",
      }),
      ranksep: attr.number({
        min: 0,
        dflt: 50,
        editType: 'calc',
        description: 'Free space between two layers, in layout units.',
      }),
      nodesep: attr.number({
        min: 0,
        dflt: 30,
        editType: 'calc',
        description: 'Free space between two nodes of a layer, in layout units.',
      }),
      edgesep: attr.number({
        min: 0,
        dflt: 12,
        editType: 'calc',
        description:
          'Free space between two long links that cross a layer side by side, in layout units.',
      }),
      ranker: attr.enumerated({
        values: ['network-simplex', 'tight-tree', 'longest-path'],
        dflt: 'network-simplex',
        editType: 'calc',
        description:
          "How nodes get their layer. `'network-simplex'`: the layers that make the links shortest in total. `'tight-tree'`: its starting point, faster and nearly as short. `'longest-path'`: every node as early as its links allow, the fastest, with longer links.",
      }),
      routing: attr.enumerated({
        values: ['spline', 'polyline', 'orthogonal'],
        dflt: 'spline',
        editType: 'calc',
        description:
          "The shape of the links: smooth curves (`'spline'`), straight segments through the same points (`'polyline'`) or horizontal and vertical segments (`'orthogonal'`).",
      }),
      clusters: attr.boolean({
        dflt: false,
        editType: 'calc',
        description:
          'Keep the nodes of a group (`node.group`) together and draw a frame around each group, tinted in its color, with its name at the top.',
      }),
      clusterpadding: attr.number({
        min: 0,
        dflt: 12,
        editType: 'calc',
        description: 'With `clusters`: the space between a frame and its nodes, in layout units.',
      }),
      aspect: attr.number({
        min: 0.05,
        editType: 'calc',
        description:
          'Width over height that the parts of a graph that are not linked to each other are packed into. Default: the proportions of the plot area.',
      }),
    },
    {
      editType: 'calc',
      description:
        "Options of `arrangement: 'layered'`. Lengths are layout units: CSS px at the size the graph is laid out for, before it is fitted to the plot area.",
    },
  );
}

/** `tree`: the options of the `'tree'`, `'radial'` and `'dendrogram'` arrangements. */
function treeAttributes() {
  return attr.object(
    {
      orientation: attr.enumerated({
        values: DIRECTIONS,
        editType: 'calc',
        description:
          "`'tree'` and `'dendrogram'`: where the root is and which way the tree grows: `'TB'` (root at the top), `'BT'`, `'LR'` (root on the left) or `'RL'`. Default: `'LR'` for a tree, whose labels then read along the levels, and `'TB'` for a dendrogram, whose heights are then on the y axis.",
      }),
      links: attr.enumerated({
        values: ['straight', 'curved', 'elbow'],
        editType: 'calc',
        description:
          "The shape of the tree's links: straight lines, S-shaped curves (`'curved'`) or right angles (`'elbow'`; in a `'radial'` tree, along the rings). Default: `'curved'`, and `'elbow'` for a dendrogram, which has no curves.",
      }),
      nodesep: attr.number({
        min: 0,
        editType: 'calc',
        description:
          "Room between two neighbours on a level (on a ring for `'radial'`; between two leaves for `'dendrogram'`), on top of their sizes and of their labels, in layout units. Default: 10, or 20 for box nodes.",
      }),
      subtreesep: attr.number({
        min: 0,
        editType: 'calc',
        description:
          "`'tree'` and `'radial'`: room between two neighbours that have different parents. Default: `nodesep`.",
      }),
      ranksep: attr.number({
        min: 0,
        editType: 'calc',
        description:
          "Room between two levels (two rings for `'radial'`), in layout units; a dendrogram without `node.value` has levels this far apart. Default: 50, plus room for the labels that are drawn between the levels.",
      }),
      sector: attr.object(
        {
          start: attr.number({
            dflt: 0,
            editType: 'calc',
            description:
              "Angle at which the tree begins, in degrees counter-clockwise from 3 o'clock.",
          }),
          span: attr.number({
            min: -360,
            max: 360,
            dflt: 360,
            editType: 'calc',
            description:
              'How far around the tree goes, in degrees; negative values run clockwise. 180 is a half circle.',
          }),
        },
        {
          editType: 'calc',
          description: "`'radial'`: the part of the circle the tree fans out over.",
        },
      ),
      sort: attr.enumerated({
        values: ['input', 'size', 'value'],
        dflt: 'input',
        editType: 'calc',
        description:
          "The order of the children of a node: as given (`'input'`), by the number of nodes below them (`'size'`) or by `node.value`.",
      }),
      sortorder: attr.enumerated({
        values: ['descending', 'ascending'],
        dflt: 'descending',
        editType: 'calc',
        description:
          "Which way `sort: 'size'` and `'value'` order: largest first, or smallest first.",
      }),
      collapsed: attr.dataArray({
        editType: 'calc',
        description:
          'The nodes whose subtrees are folded away, as node indices; with tree input (`parents`), ids (`ids`, else `labels`) work too. The nodes below a collapsed node are not drawn and take no room, and the node gets a ring that says it holds something. A click on a node that has children adds it to this list or removes it (see `collapsible`).',
      }),
      collapsible: attr.boolean({
        dflt: true,
        editType: 'plot',
        description:
          'A click on a node that has children folds its subtree away, and a second click unfolds it. The chart then updates `tree.collapsed` itself and emits `restyle`, as for any change made on the chart, and the tree moves to its new shape (at once without motion: `prefers-reduced-motion`, `config.a11y.reducedMotion`).',
      }),
    },
    {
      editType: 'calc',
      description:
        "Options of the tree arrangements: `'tree'`, `'radial'` and `'dendrogram'`. The tree is the one `parents` gives; with `link.source` / `link.target`, each node hangs from the first node that links to it, starting at the nodes without incoming links, and the links left over are drawn in the `link.secondary` style. Lengths are layout units: CSS px at the size the graph is laid out for, before it is fitted to the plot area.",
    },
  );
}

/** `arc`: the options of `arrangement: 'arc'`. */
function arcAttributes() {
  return attr.object(
    {
      orientation: attr.enumerated({
        values: ['h', 'v'],
        dflt: 'h',
        editType: 'calc',
        description:
          "The direction of the line the nodes sit on: horizontal (`'h'`, first node on the left) or vertical (`'v'`, first node at the top).",
      }),
      order: attr.enumerated({
        values: ['input', 'group', 'degree', 'barycenter'],
        editType: 'calc',
        description:
          "The order of the nodes along the line, which is what an arc diagram shows. `'input'`: as given. `'group'`: by `node.group`. `'degree'`: most links first. `'barycenter'`: the given order improved so that linked nodes are close and the arcs short. Default: `'group'` when the nodes have groups, else `'input'`.",
      }),
      nodesep: attr.number({
        min: 0,
        dflt: 20,
        editType: 'calc',
        description: 'Space between two neighbours on the line, in layout units.',
      }),
      groupsep: attr.number({
        min: 0,
        dflt: 0,
        editType: 'calc',
        description: "With `order: 'group'`: extra space where the group changes.",
      }),
      sides: attr.enumerated({
        values: ['above', 'below', 'direction'],
        dflt: 'above',
        editType: 'calc',
        description:
          "The side of the line the arcs are on: `'above'` (to the right of a vertical line), `'below'`, or `'direction'`: above for a link that points forward along the line and below for one that points back.",
      }),
      maxheight: attr.number({
        min: 0,
        editType: 'calc',
        description:
          'How far an arc may rise from the line, in layout units: longer arcs are flattened to this height. Default: no limit (half circles).',
      }),
      loopsize: attr.number({
        min: 0,
        dflt: 12,
        editType: 'calc',
        description:
          "How far the loop of a link from a node to itself rises beyond the node's edge.",
      }),
    },
    {
      editType: 'calc',
      description:
        "Options of `arrangement: 'arc'`. Lengths are layout units: CSS px at the size the graph is laid out for, before it is fitted to the plot area.",
    },
  );
}

/** `hive`: the options of `arrangement: 'hive'`. */
function hiveAttributes() {
  return attr.object(
    {
      axes: attr.integer({
        min: 1,
        max: 360,
        dflt: 3,
        editType: 'calc',
        description:
          "Number of axes when the nodes have no groups (with `node.group` there is one axis per group, with the group's name at its end) and `assign` is `'degree'`.",
      }),
      assign: attr.enumerated({
        values: ['degree', 'direction'],
        dflt: 'degree',
        editType: 'calc',
        description:
          "How nodes without groups get their axis. `'degree'`: sorted by their number of links and cut into `axes` equal parts. `'direction'`: three axes, for the nodes that only have outgoing links, those in between, and those that only have incoming links.",
      }),
      startangle: attr.number({
        dflt: 90,
        editType: 'calc',
        description:
          "Angle of the first axis in degrees, counter-clockwise from 3 o'clock. The others follow counter-clockwise, evenly spaced.",
      }),
      innerradius: attr.number({
        min: 0,
        dflt: 40,
        editType: 'calc',
        description: 'Distance from the center to the first node of an axis, in layout units.',
      }),
      outerradius: attr.number({
        min: 0,
        dflt: 300,
        editType: 'calc',
        description: 'Distance from the center to the last node of an axis, in layout units.',
      }),
      position: attr.enumerated({
        values: ['degree', 'value'],
        dflt: 'degree',
        editType: 'calc',
        description:
          "What places a node along its axis: its rank by number of links among the nodes of the axis (`'degree'`, the least linked nearest the center) or `node.value`, on one scale for all axes.",
      }),
    },
    {
      editType: 'calc',
      description:
        "Options of `arrangement: 'hive'`. A link between two nodes of one axis is not drawn: a hive plot shows what goes on between the axes.",
    },
  );
}

/** The graph schema. @experimental */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const graphAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      arrangement: attr.enumerated({
        values: GRAPH_ARRANGEMENTS,
        editType: 'calc',
        description:
          "The layout that places the nodes. `'preset'`: at `node.x` / `node.y`, which are data on the trace's axes. `'force'`: a force-directed layout, linked nodes pulled together and all nodes pushed apart (options: `force`). `'layered'`: a layered drawing of a directed graph, every link pointing the same way (pipelines, dependencies, state machines; options: `layered`). `'tree'`: a tidy tree; `'radial'`: the same tree on rings around its root; `'dendrogram'`: a tree with its leaves on one line and every other node at the height `node.value` gives it (options of the three: `tree`). `'circular'`: evenly on a circle, the nodes of a group next to each other. `'grid'`: in rows. `'arc'`: an arc diagram, the nodes on a line and the links as arcs over it (options: `arc`). `'hive'`: a hive plot, the nodes on a few axes around a center (options: `hive`). `'custom'`: the layout named by `custom.name`. Every arrangement but `'preset'` hides the axes and gives them one scale, with two exceptions: a dendrogram with `node.value` shows the axis of its heights, and a `'force'` graph whose nodes all have an `x` and no `y` (or the reverse) keeps them at those values on a visible axis and moves them along the other one only (a timeline). Default: `'preset'` when every node has an `x` and a `y`, else `'force'`.",
      }),
      custom: attr.object(
        {
          name: attr.string({
            noBlank: true,
            strict: true,
            editType: 'calc',
            description:
              "With `arrangement: 'custom'`: the name of a layout registered with `registerGraphLayout(name, layout)`.",
          }),
          options: attr.any({
            editType: 'calc',
            description: 'Passed to the custom layout as its second argument, as it is.',
          }),
        },
        { editType: 'calc', description: "The layout of `arrangement: 'custom'`." },
      ),
      worker: attr.enumerated({
        values: ['auto', true, false],
        dflt: false,
        editType: 'calc',
        description:
          "Where the layout is computed. `false`: with the rest of the figure, on the main thread; the chart is drawn once, laid out, and the page waits until then (a `'force'` layout of 10,000 nodes takes a second or more). `true`: off the main thread, in the package's layout worker. The chart is drawn at once, a `'force'` layout with the nodes moving to their places as the worker reports them, any other with its nodes on a circle until the layout arrives; the axes are fitted to the result when it is there, `chart.ready` and the promise of the update resolve then, and an image export waits for it. The result is the same picture as with `false`. `'auto'`: off the main thread where the wait would be felt: a `'force'` layout of at least 1,000 nodes or 5,000 links, a `'layered'` one of at least 3,000 nodes or 6,000 links, and force-directed link bundling (`link.bundle`) of at least 1,000 links. Never in the worker: `'preset'`, `'circular'`, `'grid'` and `'custom'` (a registered layout is a function of the page), a timeline or a dendrogram with a real axis, and `force.start` at rest. Hover and selection answer for what is on screen while the nodes move; nodes are dragged once the layout is there. Where no worker can be started (no `Worker`, a Content Security Policy, a bundler that left the file out) the same code runs on the main thread in slices of a few milliseconds, with one warning. Default: `config.worker`, which is `false`.",
      }),
      lod: attr.enumerated({
        values: ['auto', true, false],
        dflt: 'auto',
        editType: 'plot',
        description:
          "Level of detail: what a large graph leaves out while it is drawn small. `'auto'`: for a graph of more than 3,000 nodes or 5,000 links; `true`: for any graph; `false`: never. With it, node labels are drawn once the nodes are 24 px apart on average, and arrowheads once the links are 24 px long on average (they go again below 18 px, so a zoom at the threshold does not make them flicker); neither is built before. Nodes are drawn smaller where they are closer together than one and a half times their size, down to dots of 1.5 px, and lose their outlines below 4 px. Links fade as they cover more of the plot, so that a dense graph stays a texture instead of a block of one color, and come back to `link.opacity` on a zoom into it. What a hover or a selection highlights is drawn in full.",
      }),
      force: forceAttributes(),
      layered: layeredAttributes(),
      tree: treeAttributes(),
      arc: arcAttributes(),
      hive: hiveAttributes(),
      labels: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'Tree input, as the hierarchical traces take it: the label of every node. With `parents` (and no `link.source`), every node with a parent gets a link from its parent. The default of `node.label`.',
      }),
      parents: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          "Tree input: the parent of every node, as its id (`ids`, else `labels`); `''` for a root. A parent that is no node becomes a node of its own, after the others.",
      }),
      hoverinfo: attr.flaglist({
        flags: [],
        extras: ['all', 'none', 'skip'],
        dflt: 'all',
        editType: 'none',
        description:
          "Hover of nodes and links: labels (`'all'`), events without labels (`'none'`) or no hover at all (`'skip'`). The default of `node.hoverinfo` and `link.hoverinfo`.",
      }),
      node: attr.object(
        {
          label: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description:
              'Node labels, one per node index: drawn next to the node (see `node.textposition`) and shown in hover labels. Where labels would overlap, the nodes with the most links keep theirs; the others appear when zooming in.',
          }),
          x: attr.dataArray({
            editType: 'calc',
            description:
              "Node x positions. With `arrangement: 'preset'` they are data on the x axis (numbers, dates or categories by the axis type) and a node without one is not drawn. Under `'force'` a node that has both `x` and `y` is pinned there (in layout units: CSS px at the size the graph is laid out for) and the others arrange themselves around it; when every node has an `x` and none has a `y`, the x axis is a real axis, shown, on which every node keeps its value while the layout moves it along y only. The other arrangements place every node themselves.",
          }),
          y: attr.dataArray({
            editType: 'calc',
            description: 'Node y positions (see `node.x`).',
          }),
          size: attr.number({
            min: 0,
            dflt: 10,
            arrayOk: true,
            editType: 'calc',
            description:
              "Node diameter in CSS px, or one per node. Ignored with `node.sizeby` and for box nodes. Default: 10, and 6 in a `'dendrogram'`, whose nodes are points on a scale.",
          }),
          sizeby: attr.enumerated({
            values: NODE_SIZE_BY,
            dflt: 'none',
            editType: 'calc',
            description:
              "Size nodes by their links instead of `node.size`: `'degree'` (all links at the node), `'indegree'` (links that end at it) or `'outdegree'` (links that start at it). The area grows with the count, between the two diameters of `node.sizerange`.",
          }),
          sizerange: attr.infoArray({
            items: [
              attr.number({ min: 0, editType: 'calc' }),
              attr.number({ min: 0, editType: 'calc' }),
            ],
            dflt: [6, 30],
            editType: 'calc',
            description:
              'With `node.sizeby`: the diameters in CSS px of a node without links and of the node with the most.',
          }),
          color: attr.color({
            arrayOk: true,
            editType: 'style',
            description:
              "Node color, one CSS color per node, or numbers mapped through `colorscale` (with a colorbar when `showscale` is on). Default: the group's color when `node.group` is given (the colorway, one color per group), else the trace's colorway color.",
          }),
          ...colorscaleAttributes({ colorAttr: 'node.color', showscale: true, coloraxis: true }),
          symbol: scatterAttributes.children.marker.children.symbol,
          group: attr.dataArray({
            editType: 'calc',
            description:
              'A group per node (a name or a number; empty for none): colors the nodes by group, gives the legend one item per group, which a click hides, and keeps the nodes of a group together in the arrangements that can.',
          }),
          value: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description:
              "A number per node, for the arrangements that place or order nodes by one: the height of a node in a `'dendrogram'` (the distance at which a clustering merged it; leaves without one are at 0), the order of siblings with `tree.sort: 'value'`, the place along its axis with `hive.position: 'value'`. `%{value}` in node hover labels.",
          }),
          customdata: attr.dataArray({
            editType: 'calc',
            description: 'Extra data per node for `%{customdata}` and events.',
          }),
          opacity: attr.number({
            min: 0,
            max: 1,
            dflt: 1,
            arrayOk: true,
            editType: 'style',
            description: 'Node opacity (multiplied by the trace `opacity`), or one per node.',
          }),
          line: attr.object(
            {
              color: attr.color({
                arrayOk: true,
                editType: 'style',
                description:
                  'Outline color of the nodes, or one per node. Default: the plot background, so that nodes stand out from the links and from each other.',
              }),
              width: attr.number({
                min: 0,
                dflt: 1,
                arrayOk: true,
                editType: 'style',
                description: 'Outline width of the nodes in CSS px, or one per node.',
              }),
            },
            { editType: 'style', description: 'Outlines of the nodes.' },
          ),
          shape: attr.enumerated({
            values: ['marker', 'box'],
            dflt: 'marker',
            editType: 'calc',
            description:
              "How nodes are drawn: a marker (`node.symbol`, `node.size`) with the label next to it, or a box as large as the label with the text inside (`'box'`; diagrams such as pipelines and state machines). Default: `'box'` with `arrangement: 'layered'` when the nodes have labels, else `'marker'`.",
          }),
          textposition: attr.enumerated({
            values: NODE_TEXT_POSITIONS,
            dflt: 'auto',
            // Labels count in autorange (room at the edges of the plot).
            editType: 'calc',
            description:
              "Where the label sits relative to its marker. `'auto'`: where the arrangement leaves room. To the right of the node in general; pointing away from the center around a `'circular'` arrangement; in a tree, beyond a leaf and before a node with children (turned upright under the leaves of a tree that grows downwards or upwards, and along the radius in a `'radial'` tree, never upside down); under the line of an `'arc'` diagram, upright; beside the axes of a `'hive'` plot. `'none'` draws no labels (they still show in hover labels). Box nodes have their label inside.",
          }),
          textfont: attr.object(
            {
              family: attr.string({
                noBlank: true,
                strict: true,
                editType: 'calc',
                description: 'CSS font-family list. Default: `layout.font.family`.',
              }),
              size: attr.number({
                min: 1,
                editType: 'calc',
                description: 'Font size in CSS px. Default: `layout.font.size`.',
              }),
              color: attr.color({
                editType: 'plot',
                description:
                  'Text color. Default: `layout.font.color`; inside a box node, black or white, whichever reads better on the box.',
              }),
              weight: attr.integer({
                min: 1,
                max: 1000,
                extras: ['normal', 'bold'],
                editType: 'calc',
                description: 'Font weight: a CSS numeric weight (1–1000), `normal` or `bold`.',
              }),
              style: attr.enumerated({
                values: ['normal', 'italic'],
                editType: 'calc',
                description: 'Font style.',
              }),
              shadow: attr.string({
                editType: 'plot',
                description:
                  "CSS `text-shadow` (first shadow only), `'none'`, or `'auto'` (the default): a thin halo in the text's contrast color, so labels read over the links.",
              }),
            },
            {
              editType: 'calc',
              description:
                'Font of the node labels. Default: `layout.font`, with the automatic halo (`shadow: auto`). Family, size, weight and style set the size of box nodes.',
            },
          ),
          draggable: attr.boolean({
            editType: 'plot',
            description:
              "Whether a press on a node drags it. `'preset'`: the release restyles `node.x` and `node.y` with the node's new position as data (a date on a date axis, the nearest category on a category axis). `'force'`: the release pins the node, restyling its `node.x` and `node.y` and, with the picture on screen, `force.start`, so nothing else moves; with `force.simulate` the other nodes give way while it is dragged. A pinned node has a ring, and a double click releases it. A press that does not move is a click; a press on empty space is the chart's own drag (`dragmode`). Default: `true` for `'preset'` and `'force'` (not on a timeline), `false` for `'custom'`, whose layout gets the position as `graph.x` / `graph.y`. The nodes of the other arrangements do not drag.",
          }),
          hoverinfo: partHoverinfo('the nodes'),
          hovertemplate: attr.string({
            editType: 'none',
            description:
              'Template of the node hover labels: `%{label}`, `%{degree}`, `%{indegree}`, `%{outdegree}`, `%{neighbors}` (the number of nodes it is linked to), `%{group}`, `%{value}`, `%{size}`, `%{color}`, `%{x}`, `%{y}`, `%{customdata}`. `<extra>…</extra>` replaces the trace name.',
          }),
        },
        { editType: 'calc', description: 'The nodes.' },
      ),
      link: attr.object(
        {
          source: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description:
              'Source node index of every link. A link whose source or target is not a node is dropped.',
          }),
          target: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description:
              'Target node index of every link. A link from a node to itself is drawn as a loop.',
          }),
          value: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description:
              "A positive number per link: its weight for the layouts (a stronger pull, a shorter link) and `%{value}` in hover labels. It sets the width only with `link.widthby: 'value'`. Missing or non-positive values count as 1.",
          }),
          label: attr.dataArray({
            editType: 'calc',
            description: 'Link labels, shown in hover labels.',
          }),
          color: attr.color({
            arrayOk: true,
            editType: 'style',
            description:
              'Link color, or one per link. Default: a translucent gray that reads on the plot background, light or dark.',
          }),
          width: attr.number({
            min: 0,
            dflt: 1,
            arrayOk: true,
            editType: 'plot',
            description: 'Link width in CSS px, or one per link. Ignored with `link.widthby`.',
          }),
          widthby: attr.enumerated({
            values: ['none', 'value'],
            dflt: 'none',
            editType: 'plot',
            description:
              "`'value'`: widths from `link.value`, proportional to it, between the two widths of `link.widthrange` (the largest value gets the second).",
          }),
          widthrange: attr.infoArray({
            items: [
              attr.number({ min: 0, editType: 'plot' }),
              attr.number({ min: 0, editType: 'plot' }),
            ],
            dflt: [1, 8],
            editType: 'plot',
            description:
              "With `link.widthby: 'value'`: the widths in CSS px of a link of value 0 and of the link with the largest value.",
          }),
          dash: attr.string({
            dflt: 'solid',
            editType: 'style',
            description:
              "Dash style of every link: `'solid'`, `'dot'`, `'dash'`, `'longdash'`, `'dashdot'`, `'longdashdot'`, or a dash list such as `'5px,10px,2px'`.",
          }),
          secondary: attr.object(
            {
              dash: attr.string({
                dflt: 'dash',
                editType: 'style',
                description: 'Dash style of the secondary links (see `link.dash`).',
              }),
              opacity: attr.number({
                min: 0,
                max: 1,
                dflt: 0.7,
                editType: 'style',
                description: 'Opacity of the secondary links, multiplied by `link.opacity`.',
              }),
              color: attr.color({
                editType: 'style',
                description: "Color of the secondary links. Default: each link's own color.",
              }),
            },
            {
              editType: 'style',
              description:
                "Style of the links an arrangement sets apart from the others: with `'layered'`, the links that close a cycle, which the layout had to turn around to give every other link one direction (back edges; their arrowheads still point the way the data says); with `'tree'`, `'radial'` and `'dendrogram'`, the links that are not part of the tree (they skip levels or join two branches, and are drawn straight). Default: dashed and a little fainter.",
            },
          ),
          curve: attr.number({
            min: -2,
            max: 2,
            arrayOk: true,
            editType: 'plot',
            description:
              'How far a link bows out, as a fraction of its length: 0 is straight, positive bows to the left of its direction, negative to the right. One value, or one per link. Default: straight, except that the links between the same two nodes are fanned out so that each can be seen. A value replaces that fan: one value for all links draws the links between the same two nodes on top of each other (give one value per link to keep them apart), and in an array a link without a number keeps its place in the fan. A link the layout routed keeps its route.',
          }),
          arrow: attr.object(
            {
              end: attr.boolean({
                dflt: false,
                editType: 'plot',
                description:
                  "Draw an arrowhead at the target end of every link (a directed graph). Default: `true` with `arrangement: 'layered'`, whose links all point one way, else `false`.",
              }),
              start: attr.boolean({
                dflt: false,
                editType: 'plot',
                description: 'Draw an arrowhead at the source end of every link.',
              }),
              size: attr.number({
                min: 0,
                dflt: 8,
                editType: 'plot',
                description:
                  'Length of the arrowheads in CSS px; a wide link gets a head at least three times its width.',
              }),
            },
            {
              editType: 'plot',
              description: "Arrowheads. Their tips stop at the node's edge, whatever its size.",
            },
          ),
          opacity: attr.number({
            min: 0,
            max: 1,
            dflt: 1,
            editType: 'style',
            description: 'Link opacity (multiplied by the trace `opacity` and the color alpha).',
          }),
          bundle: attr.object(
            {
              method: attr.enumerated({
                values: ['none', 'auto', 'hierarchical', 'force'],
                dflt: 'none',
                editType: 'calc',
                description:
                  "Draw links that run the same way together, as bundles, so that a dense graph shows its main streams. The nodes stay where they are. `'hierarchical'`: a link follows the path between its two ends in the hierarchy of the nodes, their groups (`node.group`) or, under a tree arrangement, the tree: links between the same two groups share their middle. Cheap, and at its best on `'circular'` and `'radial'`. `'force'`: links that lie alongside each other attract each other, for graphs without groups; costly, and refused above 20,000 links (the links are then drawn straight, with a warning). `'auto'`: `'hierarchical'` when the nodes have groups or the arrangement is a tree, else `'force'`. Links the arrangement routed itself (`'layered'`, `'arc'`, `'hive'`, the edges of a tree) keep their routes. The bundles are computed after the layout and arrive a moment after the nodes (see `worker`); while a node is dragged, hierarchical bundles follow it and force-directed ones are drawn straight until it is dropped.",
              }),
              strength: attr.number({
                min: 0,
                max: 1,
                dflt: 0.85,
                editType: 'calc',
                description:
                  'How tightly the links are bundled: 0 leaves them straight, 1 pulls them all the way together.',
              }),
              compatibility: attr.number({
                min: 0,
                max: 1,
                dflt: 0.6,
                editType: 'calc',
                description:
                  'With force-directed bundling: how alike two links must be to attract each other (their directions, lengths and positions), 0 to 1. Lower values bundle more links, also ones that do not belong together.',
              }),
            },
            {
              editType: 'calc',
              description: 'Link bundling. Default: none.',
            },
          ),
          customdata: attr.dataArray({
            editType: 'calc',
            description: 'Extra data per link for `%{customdata}` and events.',
          }),
          hoverinfo: partHoverinfo('the links'),
          hovertemplate: attr.string({
            editType: 'none',
            description:
              'Template of the link hover labels: `%{label}`, `%{value}`, `%{source.label}`, `%{target.label}`, `%{source.index}`, `%{target.index}`, `%{customdata}`. `<extra>…</extra>` replaces the trace name.',
          }),
        },
        { editType: 'calc', description: 'The links.' },
      ),
      highlight: highlightAttributes(),
      selected: selectionStyle('selected'),
      unselected: selectionStyle('unselected'),
      zorder: scatterAttributes.children.zorder,
    },
    {
      description:
        'Network graph: nodes and the links between them, at given positions or placed by a layout.',
    },
  ))();
