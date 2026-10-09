/**
 * `chord` attribute schema (backlog G8, ADR-029): a chord diagram. `node` and `link` are shaped
 * like sankey's and `graph`'s, so one pair of containers feeds all three (`link.source` /
 * `link.target` are node indices); `matrix` with `labels` is a second way to give the flows.
 * `domain` comes from the registry (the trace is in the `domain` category); `name`, `uid`,
 * `hoverlabel`, `showlegend`, … are common trace attributes. Plotly.js has no chord trace.
 *
 * Edit types: everything the ring's layout reads is `calc` (the calc record carries the laid-out
 * ring); sizes in px and label fonts are `plot`; colors, outlines and opacities are `style` (the
 * view recolors without laying out again); hover attributes are `none`.
 */
import { attr } from '@mk7s/holochart-core';

/** `sort` values. @internal */
export const CHORD_NODE_SORTS = ['input', 'value', 'group'] as const;
/** `link.sort` values. @internal */
export const CHORD_LINK_SORTS = ['position', 'value', 'input'] as const;
/** `textorientation` values. @internal */
export const CHORD_TEXT_ORIENTATIONS = ['auto', 'radial', 'tangential', 'none'] as const;
/** `link.colorsource` values. @internal */
export const CHORD_COLOR_SOURCES = ['source', 'target', 'gradient'] as const;

/** A text font container whose fields default from `layout.font`. */
function textFont(description: string) {
  return attr.object(
    {
      family: attr.string({
        noBlank: true,
        strict: true,
        editType: 'plot',
        description: 'CSS font-family list. Default: `layout.font.family`.',
      }),
      size: attr.number({ min: 1, editType: 'plot', description: 'Font size in CSS px.' }),
      color: attr.color({
        editType: 'plot',
        description: 'Text color. Default: `layout.font.color`.',
      }),
      weight: attr.integer({
        min: 1,
        max: 1000,
        extras: ['normal', 'bold'],
        editType: 'plot',
        description: 'Font weight: a CSS numeric weight (1–1000), `normal` or `bold`.',
      }),
      style: attr.enumerated({
        values: ['normal', 'italic'],
        editType: 'plot',
        description: 'Font style.',
      }),
      shadow: attr.string({
        dflt: 'none',
        editType: 'plot',
        description:
          "CSS `text-shadow` (first shadow only), `'none'` (the default), or `'auto'`: a thin halo in the text's contrast color.",
      }),
    },
    { editType: 'plot', description },
  );
}

/** `node.hoverinfo` / `link.hoverinfo`. */
function partHoverinfo(what: string) {
  return attr.enumerated({
    values: ['all', 'none', 'skip'],
    dflt: 'all',
    editType: 'none',
    description: `Hover of ${what}: labels (\`'all'\`), highlighting without labels (\`'none'\`) or no hover and no events (\`'skip'\`). Default: the trace \`hoverinfo\`.`,
  });
}

/** The chord schema. @experimental */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const chordAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      hoverinfo: attr.flaglist({
        flags: [],
        extras: ['all', 'none', 'skip'],
        dflt: 'all',
        editType: 'none',
        description:
          "Hover of nodes and links: labels (`'all'`), highlighting without labels (`'none'`) or no hover at all (`'skip'`). The default of `node.hoverinfo` and `link.hoverinfo`.",
      }),
      matrix: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'The flows as a square matrix, instead of `link`: `matrix[i][j]` is the flow from node `i` to node `j`. Directed (the default), every positive cell is a ribbon. With `directed: false` every pair of nodes has one ribbon, `matrix[i][j]` wide at `i` and `matrix[j][i]` wide at `j` (a symmetric matrix gives ribbons as wide at both ends). Missing cells are 0; negative and non-numeric cells are left out and counted in the description. Ignored when `link.source` and `link.target` are given.',
      }),
      labels: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'Node labels, one per row of `matrix`. The default of `node.label`, which wins when both are given.',
      }),
      directed: attr.boolean({
        dflt: true,
        editType: 'calc',
        description:
          'Whether a link has a direction. Every link takes its value of its source arc and of its target arc, so an arc is as wide as the outgoing plus the incoming flow of its node, directed or not. Directed links can end in an arrowhead (`link.arrowlen`) or short of the ring (`link.targetgap`), and hover labels tell outgoing from incoming flow; undirected links are one symmetric band. See `matrix` for how a matrix is read.',
      }),
      sort: attr.enumerated({
        values: CHORD_NODE_SORTS,
        dflt: 'input',
        editType: 'calc',
        description:
          "Order of the arcs around the ring. `'input'`: by node index. `'value'`: widest first. `'group'`: groups by name (numbers by value), nodes by index. With `node.group` the nodes of a group are always next to each other: `'input'` then orders the groups by their first node and `'value'` by their width.",
      }),
      rotation: attr.angle({
        dflt: 0,
        editType: 'calc',
        description: "Where the first arc starts, in degrees clockwise from 12 o'clock.",
      }),
      direction: attr.enumerated({
        values: ['clockwise', 'counterclockwise'],
        dflt: 'clockwise',
        editType: 'calc',
        description: 'Direction in which the arcs follow each other.',
      }),
      padangle: attr.number({
        min: 0,
        dflt: 2,
        editType: 'calc',
        description:
          'Gap between neighbouring arcs, in degrees. The gaps take at most half the ring: more is scaled down.',
      }),
      textorientation: attr.enumerated({
        values: CHORD_TEXT_ORIENTATIONS,
        dflt: 'auto',
        editType: 'plot',
        description:
          "Node labels, outside the ring. `'radial'`: along the radius, reading away from the center on the right half and towards it on the left, so no label is upside down. `'tangential'`: across the radius, flipped on the lower half. `'auto'`: tangential when every label fits along its arc, else radial. `'none'`: no labels (they still show in hover labels). A label that does not fit its arc is not drawn; a radial label too long for the room around the ring is cut with an ellipsis.",
      }),
      textfont: textFont('Font of the node labels. Default: `layout.font`.'),
      valueformat: attr.string({
        dflt: ',.4~g',
        editType: 'none',
        description: 'd3-format of the node and link values in hover labels (`%{value}`).',
      }),
      valuesuffix: attr.string({
        dflt: '',
        editType: 'none',
        description: 'Text after the values in hover labels (a unit such as `GWh`).',
      }),
      node: attr.object(
        {
          label: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description:
              'Node labels, one per node index (Plotly pseudo-HTML allowed): drawn around the ring and shown in hover labels and in the legend.',
          }),
          group: attr.dataArray({
            editType: 'calc',
            description:
              'A group per node (a name or a number; empty for none). The nodes of a group are next to each other on the ring and take the color of the group, an outer ring draws one labeled arc per group (see `groups`), and the legend lists the groups instead of the nodes.',
          }),
          color: attr.color({
            arrayOk: true,
            editType: 'style',
            description:
              'Node color, or one per node index. Default: the colorway, one color per node, or one per group when `node.group` is given.',
          }),
          customdata: attr.dataArray({
            editType: 'calc',
            description: 'Extra data per node for `%{customdata}` and events.',
          }),
          thickness: attr.number({
            min: 1,
            dflt: 12,
            editType: 'plot',
            description: 'Thickness of the ring of node arcs, in CSS px.',
          }),
          line: attr.object(
            {
              color: attr.color({
                arrayOk: true,
                editType: 'style',
                description:
                  'Outline color of the node arcs, or one per node. Default: the paper color.',
              }),
              width: attr.number({
                min: 0,
                dflt: 0,
                arrayOk: true,
                editType: 'style',
                description: 'Outline width of the node arcs in CSS px, or one per node.',
              }),
            },
            { editType: 'style', description: 'Outlines of the node arcs.' },
          ),
          hoverinfo: partHoverinfo('the node arcs'),
          hovertemplate: attr.string({
            editType: 'none',
            description:
              'Template of the node hover labels: `%{label}`, `%{value}` (the width of the arc: outgoing plus incoming flow, formatted with `valueformat` and `valuesuffix`), `%{out}`, `%{in}`, `%{percent}` (share of the ring), `%{group}`, `%{color}`, `%{customdata}`. `<extra>…</extra>` replaces the value box.',
          }),
        },
        { editType: 'calc', description: 'The nodes: arcs of the ring.' },
      ),
      link: attr.object(
        {
          source: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description: 'Source node index of every link.',
          }),
          target: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description:
              'Target node index of every link. A link from a node to itself is drawn as a hill on its arc and takes its value of the arc once. A link whose source or target is not a node index is left out and counted in the description.',
          }),
          value: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description:
              'Flow of every link, which sets the width of its ribbon at both ends. Default: 1 for every link. When given, links without a positive value are left out and counted in the description.',
          }),
          label: attr.dataArray({
            editType: 'calc',
            description: 'Link labels, shown in hover labels.',
          }),
          customdata: attr.dataArray({
            editType: 'calc',
            description: 'Extra data per link for `%{customdata}` and events.',
          }),
          sort: attr.enumerated({
            values: CHORD_LINK_SORTS,
            dflt: 'position',
            editType: 'calc',
            description:
              "Order of the ribbon ends within an arc. `'position'`: by where the other end of each ribbon is on the ring, which crosses the ribbons as little as possible. `'value'`: widest first. `'input'`: by link index.",
          }),
          color: attr.color({
            arrayOk: true,
            editType: 'style',
            description:
              'Ribbon color, or one per link. Default: the color of a node of the link (`link.colorsource`).',
          }),
          colorsource: attr.enumerated({
            values: CHORD_COLOR_SOURCES,
            dflt: 'source',
            editType: 'style',
            description:
              "Which node a ribbon without a `link.color` takes its color from: its `'source'`, its `'target'`, or both (`'gradient'`: from the source's color at one end to the target's at the other, in steps along the ribbon).",
          }),
          opacity: attr.number({
            min: 0,
            max: 1,
            dflt: 0.6,
            editType: 'style',
            description: "Opacity of the ribbons (multiplies their color's own).",
          }),
          hovercolor: attr.color({
            arrayOk: true,
            editType: 'style',
            description:
              'Ribbon color while it (or a node it connects) is hovered, or one per link. Default: the ribbon color, a quarter more opaque. The other ribbons are dimmed meanwhile.',
          }),
          gap: attr.number({
            min: 0,
            dflt: 2,
            editType: 'plot',
            description: 'Space between the ring and the ends of the ribbons, in CSS px.',
          }),
          targetgap: attr.number({
            min: 0,
            editType: 'plot',
            description:
              'With `directed`: space between the ring and the target end of the ribbons, in CSS px. A larger gap than `link.gap` shows the direction: ribbons touch their source and stop short of their target. Default: `link.gap`.',
          }),
          arrowlen: attr.number({
            min: 0,
            dflt: 0,
            editType: 'plot',
            description:
              'With `directed`: length of the arrowhead the target end of every ribbon is drawn as, in CSS px; 0 draws the ends flat.',
          }),
          hoverinfo: partHoverinfo('the ribbons'),
          hovertemplate: attr.string({
            editType: 'none',
            description:
              'Template of the link hover labels: `%{label}`, `%{value}` (formatted with `valueformat` and `valuesuffix`), `%{reverse}` (the flow back, for a pair of matrix cells drawn as one ribbon), `%{percent}` (share of the total flow), `%{source.label}`, `%{target.label}`, `%{color}`, `%{customdata}`. `<extra>…</extra>` replaces the value box.',
          }),
        },
        { editType: 'calc', description: 'The links: ribbons between the arcs.' },
      ),
      groups: attr.object(
        {
          visible: attr.boolean({
            dflt: true,
            editType: 'plot',
            description: 'Whether the outer ring of group arcs is drawn.',
          }),
          color: attr.color({
            arrayOk: true,
            editType: 'style',
            description:
              'Color of the group arcs, or one per group in order of first appearance in `node.group`. Default: the colorway, one color per group.',
          }),
          thickness: attr.number({
            min: 1,
            dflt: 8,
            editType: 'plot',
            description: 'Thickness of the ring of group arcs, in CSS px.',
          }),
          gap: attr.number({
            min: 0,
            dflt: 4,
            editType: 'plot',
            description:
              'Space between the node labels (the node ring, without labels) and the ring of group arcs, in CSS px.',
          }),
          padangle: attr.number({
            min: 0,
            editType: 'calc',
            description:
              'Gap between the last arc of a group and the first arc of the next, in degrees. Default: twice `padangle`.',
          }),
          textfont: textFont(
            'Font of the group labels, drawn across the radius outside the group arcs. Default: `textfont`, bold.',
          ),
        },
        {
          editType: 'calc',
          description:
            'The outer ring of `node.group`: one arc around the nodes of every group, with its name.',
        },
      ),
    },
    {
      description:
        'Chord diagram: nodes as arcs of a ring, as wide as their flow, and links as ribbons between them; from `node` / `link` (as sankey and graph take them) or from a square matrix.',
    },
  ))();
