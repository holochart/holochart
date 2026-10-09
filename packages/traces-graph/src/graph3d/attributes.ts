/**
 * `graph3d` attribute schema (backlog G6, ADR-029): the `graph` trace's model in a 3D scene. The
 * `node` and `link` containers are the 2D trace's wherever an attribute means the same in space
 * (their definitions are taken from `../graph/attributes.ts`, not copied), with `node.z`,
 * `node.render` and `link.render` added. So is `highlight`, without what a selection does (a scene
 * has none). What has no 3D form is left out: box nodes (`node.shape`) and the selection styles.
 *
 * Sizes are CSS px **at the middle of the scene as it is first seen**: node diameters, tube widths
 * and arrowheads are objects in the scene, so a node is larger near the camera than far from it
 * and grows as the camera comes closer, and an arrowhead ends on its node's sphere at any zoom.
 * Two parts keep their px at every depth, as in `scatter3d`: links drawn as lines
 * (`link.render: 'line'`) and nodes drawn as sprites (`node.render: 'sprite'`).
 *
 * Edit types follow the 2D trace: what the model or the layout reads is `calc`; what changes how
 * links and labels are drawn is `plot`; colors and opacities are `style`, and so is `highlight`.
 */
import { attr, type SchemaNode } from '@mk7s/holochart-core';
import { sceneIdAttribute } from '@mk7s/holochart-traces-3d';
import { colorscaleAttributes } from '@mk7s/holochart-traces-basic';
import { graphAttributes } from '../graph/attributes.ts';

/** `arrangement` values of `graph3d`: the layouts that place nodes in space. */
export const GRAPH3D_ARRANGEMENTS = ['preset', 'force', 'layered', 'custom'] as const;

/** A value of `graph3d`'s `arrangement`. */
export type Graph3dArrangement = (typeof GRAPH3D_ARRANGEMENTS)[number];

/** A copy of an attribute with some fields replaced (a description, a default). */
function override<N extends SchemaNode>(node: N, fields: Record<string, unknown>): N {
  return { ...node, ...fields } as N;
}

/** The graph3d schema. @experimental */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const graph3dAttributes = /* @__PURE__ */ (() => {
  const G = graphAttributes.children;
  const N = G.node.children;
  const L = G.link.children;
  const H = G.highlight.children;
  return attr.object(
    {
      scene: sceneIdAttribute,
      arrangement: attr.enumerated({
        values: GRAPH3D_ARRANGEMENTS,
        editType: 'calc',
        description:
          "The layout that places the nodes in space. `'preset'`: at `node.x` / `node.y` / `node.z`, which are data on the scene's axes. `'force'`: a force-directed layout in three dimensions (`force`). `'layered'`: a directed graph in planes, one per rank, the nodes of a plane spread by the force layout (`layered`). `'custom'`: the layout named by `custom.name`, which returns `z` as well. The computed arrangements hide the scene's axes and keep the layout's proportions. Default: `'preset'` when every node has an `x`, a `y` and a `z`, else `'force'`.",
      }),
      custom: G.custom,
      labels: G.labels,
      parents: G.parents,
      hoverinfo: G.hoverinfo,
      node: attr.object(
        {
          label: override(N.label, {
            description:
              'Node labels, one per node index: drawn next to the node (see `node.textposition`) and shown in hover labels. Where labels would overlap on screen, the nodes with the most links keep theirs; turning the scene or moving closer shows others.',
          }),
          x: override(N.x, {
            description:
              "Node x positions. With `arrangement: 'preset'` they are data on the scene's x axis and a node without all three coordinates is not drawn. With a computed arrangement they are layout units: a node with `x`, `y` and `z` stays where it is, and one with some of them is held along those axes.",
          }),
          y: override(N.y, { description: 'Node y positions (see `node.x`).' }),
          z: attr.dataArray({
            editType: 'calc',
            description: 'Node z positions (see `node.x`).',
          }),
          size: override(N.size, {
            description:
              'Node diameter in CSS px, or one per node. A sphere has that size at the middle of the scene in its first view (see `node.render`); a sprite has it everywhere. Ignored with `node.sizeby`.',
          }),
          sizeby: N.sizeby,
          sizerange: override(N.sizerange, {
            description:
              'With `node.sizeby`: the diameters in CSS px of a node without links and of the node with the most.',
          }),
          color: N.color,
          ...colorscaleAttributes({ colorAttr: 'node.color', showscale: true, coloraxis: true }),
          render: attr.enumerated({
            values: ['sphere', 'sprite'],
            dflt: 'sphere',
            editType: 'calc',
            description:
              "`'sphere'`: lit spheres that are part of the scene: `node.size` is their diameter in CSS px at the middle of the scene in its first view, so nodes are larger near the camera and grow when it comes closer. `'sprite'`: flat markers (`node.symbol`, `node.line`) that face the camera and keep `node.size` CSS px at every depth, as `scatter3d` markers do.",
          }),
          symbol: override(N.symbol, {
            description: "The marker symbol of `node.render: 'sprite'`.",
          }),
          group: N.group,
          customdata: N.customdata,
          opacity: N.opacity,
          line: override(N.line, {
            description: "Outlines of the nodes (`node.render: 'sprite'` only).",
          }),
          textposition: override(N.textposition, {
            editType: 'plot',
            description:
              "Where the label sits relative to its node on screen. `'auto'`: to the right. `'none'` draws no labels (they still show in hover labels).",
          }),
          textfont: N.textfont,
          hoverinfo: N.hoverinfo,
          hovertemplate: override(N.hovertemplate, {
            description:
              'Template of the node hover labels: `%{label}`, `%{degree}`, `%{indegree}`, `%{outdegree}`, `%{group}`, `%{size}`, `%{color}`, `%{x}`, `%{y}`, `%{z}`, `%{customdata}`. `<extra>…</extra>` replaces the trace name.',
          }),
        },
        { editType: 'calc', description: 'The nodes.' },
      ),
      link: attr.object(
        {
          source: L.source,
          target: override(L.target, {
            description:
              'Target node index of every link. A link from a node to itself is drawn as a ring beside the node, on the side away from its neighbours.',
          }),
          value: L.value,
          label: L.label,
          color: L.color,
          width: override(L.width, {
            description:
              'Link width in CSS px, or one per link: at every depth for lines; for tubes their diameter at the middle of the scene in its first view (see `link.render`). Ignored with `link.widthby`.',
          }),
          widthby: L.widthby,
          widthrange: override(L.widthrange, {
            description:
              "With `link.widthby: 'value'`: the widths in CSS px of a link of value 0 and of the link with the largest value.",
          }),
          curve: override(L.curve, {
            description:
              'How far a link bows out, as a fraction of its length: 0 is straight. A link bows sideways: for someone who looks down the z axis, positive is to the left of its direction and negative to the right; a link that runs along z bows along y. One value, or one per link. Default: straight, except that the links between the same two nodes are fanned out so that each can be seen, two opposite links bowing apart.',
          }),
          dash: override(L.dash, {
            description:
              "Dash style of the links drawn as lines: `'solid'`, `'dot'`, `'dash'`, `'longdash'`, `'dashdot'`, `'longdashdot'`, or a dash list such as `'5px,10px,2px'`.",
          }),
          render: attr.enumerated({
            values: ['auto', 'line', 'tube'],
            dflt: 'auto',
            editType: 'plot',
            description:
              "`'line'`: screen-space lines, `link.width` CSS px wide at every depth. `'tube'`: lit tubes `link.width` across, which are part of the scene like the spheres. `'auto'`: tubes when the widest link is 3 px or wider and the graph has at most 5,000 links, else lines.",
          }),
          arrow: attr.object(
            {
              end: override(L.arrow.children.end, {
                description:
                  "Draw an arrowhead at the target end of every link (a directed graph). Default: `true` with `arrangement: 'layered'`, whose links all run from a plane to a later one, else `false`.",
              }),
              start: L.arrow.children.start,
              size: override(L.arrow.children.size, {
                description:
                  'Length of the arrowheads (lit cones) in CSS px, measured like `node.size`; a wide link gets a head at least three times its width.',
              }),
            },
            {
              editType: 'plot',
              description:
                "Arrowheads, as cones. Their tips stop at the node's surface, whatever its size.",
            },
          ),
          opacity: L.opacity,
          customdata: L.customdata,
          hoverinfo: L.hoverinfo,
          hovertemplate: L.hovertemplate,
        },
        { editType: 'calc', description: 'The links.' },
      ),
      // The 2D trace's container, without `simulate` (the cooling is not animated in a scene) and
      // without `start` (the picture a dragged 2D layout goes on from: nodes do not drag here).
      force: attr.object(
        Object.fromEntries(
          Object.entries(G.force.children).filter(([key]) => key !== 'simulate' && key !== 'start'),
        ) as Omit<typeof G.force.children, 'simulate' | 'start'>,
        {
          editType: 'calc',
          description:
            "Options of the force layout in three dimensions: of `arrangement: 'force'`, and of the nodes within their planes with `'layered'` (where `linkdistance` defaults to `layered.ranksep`). Lengths are layout units.",
        },
      ),
      highlight: attr.object(
        {
          mode: attr.flaglist({
            flags: ['neighbors'],
            extras: ['none'],
            dflt: 'neighbors',
            editType: 'style',
            description:
              "What a hover emphasizes, the rest of the graph being dimmed (`highlight.dim`). `'neighbors'`: while the pointer is over a node, the node, the links that lead from it and the nodes they lead to (`highlight.hops`, `highlight.direction`); over a link, the link and its two ends. `'none'`: nothing. What is hovered is what the scene's picking finds, so there is no highlight where hover is off (`scene.hovermode: false`, `hoverinfo: 'skip'`), and none for a graph of more than 50,000 nodes and links together.",
          }),
          hops: H.hops,
          direction: H.direction,
          dim: override(H.dim, {
            description:
              'How much is left of the nodes, links and labels that are not highlighted while something is: lines and labels keep this share of their opacity; spheres, tubes and arrowheads, which are lit and opaque, this share of their color over the background.',
          }),
          color: H.color,
          nodes: H.nodes,
          path: override(H.path, {
            description:
              'Two node indices: a shortest path from the first to the second is highlighted until this is unset. Nothing is highlighted when there is no such path.',
          }),
          pathweight: H.pathweight,
          pathdirected: H.pathdirected,
        },
        {
          editType: 'style',
          description:
            'Highlighting: the neighbourhood of the node or link under the pointer (or of `highlight.nodes`), and a shortest path between the two nodes of `highlight.path`. What is highlighted keeps its look, its label shows even where there was no room for it, and everything else is dimmed; only colors change. A hover comes first, then `highlight.nodes`, then a path.',
        },
      ),
      layered: attr.object(
        {
          axis: attr.enumerated({
            values: ['x', 'y', 'z'],
            dflt: 'z',
            editType: 'calc',
            description:
              'The axis the planes are stacked along. The first rank is at the top of it (the largest coordinate), and links run down.',
          }),
          ranksep: attr.number({
            min: 0,
            dflt: 80,
            editType: 'calc',
            description: 'Distance between two planes, in layout units.',
          }),
          ranker: G.layered.children.ranker,
          showplanes: attr.boolean({
            dflt: true,
            editType: 'plot',
            description: 'Draw a faint outline around every plane.',
          }),
          planecolor: attr.color({
            editType: 'style',
            description: 'Color of the plane outlines. Default: the link color, fainter.',
          }),
        },
        {
          editType: 'calc',
          description:
            "The layout of `arrangement: 'layered'`: cycles are broken as in the 2D layered layout (the reversed links keep their direction in the drawing), every node gets a rank, each rank is a plane, and the nodes of a plane are spread by the force layout (`force`) with their coordinate along `axis` held.",
        },
      ),
    },
    {
      description:
        'Network graph in a 3D scene: nodes as lit spheres or sprites and the links between them as lines or tubes, at given positions or placed by a layout in space.',
    },
  );
})();
