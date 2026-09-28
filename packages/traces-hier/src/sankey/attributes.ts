/**
 * `sankey` attribute schema (plan E13.5a, E13.5b, ADR-002), following plotly.js'
 * `traces/sankey/attributes.js`: nodes (`node.label`, colors, `pad`, `thickness`, `align`, fixed
 * `x` / `y`, `groups`, hover), links (`source`, `target`, `value`, colors, `hovercolor`,
 * `arrowlen`, concentration `colorscales`, hover), `orientation`, `arrangement`, `valueformat`,
 * `valuesuffix` and `textfont`. `domain` comes from the registry (the trace is in the `domain`
 * category); `name`, `uid`, `hoverlabel`, … are common trace attributes.
 *
 * Edit types: everything the layout reads is `calc` (the calc record carries it, so the laid-out
 * graph is cached per calc); colors and outlines are `style` (the view recolors without laying
 * out again); label fonts are `plot`; hover attributes `none`.
 */
import { attr } from '@mk7s/holochart-core';

/** A text font container whose fields default from `layout.font` (Plotly's `textfont`). */
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
        editType: 'plot',
        description:
          "CSS `text-shadow` (first shadow only), `'none'`, or `'auto'` (the default): a thin halo in the text's contrast color, so labels read over the links.",
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

/** An outline container (`node.line`, `link.line`). */
function outline(what: string, color: string, width: number) {
  return attr.object(
    {
      color: attr.color({
        dflt: color,
        arrayOk: true,
        editType: 'style',
        description: `Outline color of the ${what}, or one per ${what.replace(/s$/, '')}.`,
      }),
      width: attr.number({
        min: 0,
        dflt: width,
        arrayOk: true,
        editType: 'style',
        description: `Outline width of the ${what} in CSS px, or one per ${what.replace(/s$/, '')}.`,
      }),
    },
    { editType: 'style', description: `Outlines of the ${what}.` },
  );
}

/** The sankey schema. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const sankeyAttributes = /* @__PURE__ */ (() =>
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
      orientation: attr.enumerated({
        values: ['v', 'h'],
        dflt: 'h',
        editType: 'calc',
        description:
          "Flow direction: left to right (`'h'`) or top to bottom (`'v'`, the whole diagram transposed).",
      }),
      valueformat: attr.string({
        dflt: '.3s',
        editType: 'none',
        description: 'd3-format of the node and link values in hover labels (`%{value}`).',
      }),
      valuesuffix: attr.string({
        dflt: '',
        editType: 'none',
        description: 'Text after the values in hover labels (a unit such as `TWh`).',
      }),
      arrangement: attr.enumerated({
        values: ['snap', 'perpendicular', 'freeform', 'fixed'],
        dflt: 'snap',
        editType: 'calc',
        description:
          "Node dragging. `'snap'`: a node moves freely while dragged, the other nodes of its column make room, and it snaps back to its column when released. `'perpendicular'`: across the flow only. `'freeform'`: anywhere. `'fixed'`: nodes do not move. A drop restyles `node.x` / `node.y` of every node. Default: `'freeform'` when `node.x` and `node.y` are given, else `'snap'`.",
      }),
      textfont: textFont(
        'Font of the node labels. Default: `layout.font`, with the automatic halo (`shadow: auto`).',
      ),
      node: attr.object(
        {
          label: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description:
              'Node labels, one per node index (Plotly pseudo-HTML allowed). A group made by `node.groups` takes the label after the last node referenced by a link.',
          }),
          groups: attr.infoArray({
            items: attr.infoArray({
              items: attr.number({ min: 0, editType: 'calc' }),
              freeLength: true,
              editType: 'calc',
            }),
            freeLength: true,
            dflt: [],
            editType: 'calc',
            description:
              'Groups of node indices, each drawn as one combined node: links between members of a group are dropped, links to and from members attach to the group.',
          }),
          x: attr.dataArray({
            editType: 'calc',
            description:
              'Fixed node positions along the flow: the node center as a fraction of the domain (0 left, 1 right; top to bottom when vertical). Used with `node.y`; a position of 0 or a missing one leaves the node where the layout puts it (Plotly).',
          }),
          y: attr.dataArray({
            editType: 'calc',
            description:
              'Fixed node positions across the flow: the node center as a fraction of the domain (0 top, 1 bottom; left to right when vertical). Used with `node.x`.',
          }),
          color: attr.color({
            arrayOk: true,
            editType: 'style',
            description:
              'Node color, or one per node index. Default: the colorway, one color per node at 0.8 opacity.',
          }),
          customdata: attr.dataArray({
            editType: 'calc',
            description: 'Extra data per node for `%{customdata}` and events.',
          }),
          line: outline('nodes', '#444', 0.5),
          pad: attr.number({
            min: 0,
            dflt: 20,
            editType: 'calc',
            description:
              'Space between the nodes of a column in CSS px (reduced when the column would not fit).',
          }),
          thickness: attr.number({
            min: 1,
            dflt: 20,
            editType: 'calc',
            description: 'Node thickness along the flow direction, in CSS px.',
          }),
          align: attr.enumerated({
            values: ['justify', 'left', 'right', 'center'],
            dflt: 'justify',
            editType: 'calc',
            description:
              "Column of nodes: by depth from the sources, sinks in the last column (`'justify'`); by depth (`'left'`); by height from the sinks (`'right'`); or by depth with sources next to their first target (`'center'`).",
          }),
          hoverinfo: partHoverinfo('the nodes'),
          hovertemplate: attr.string({
            editType: 'none',
            description:
              'Template of the node hover labels: `%{label}`, `%{value}` (formatted with `valueformat` and `valuesuffix`), `%{customdata}`, `%{color}`, `%{targetLinks.length}` (incoming links), `%{sourceLinks.length}`, … `<extra>…</extra>` replaces the value box.',
          }),
        },
        { editType: 'calc', description: 'The nodes.' },
      ),
      link: attr.object(
        {
          arrowlen: attr.number({
            min: 0,
            dflt: 0,
            editType: 'calc',
            description:
              'Length of the arrowhead at the target end of every link, in CSS px (at most half the gap between the nodes); 0 draws no arrowheads.',
          }),
          label: attr.dataArray({
            editType: 'calc',
            description:
              'Link labels: shown in hover labels, links with the same label highlight together, and a label names the `link.colorscales` entry of the link.',
          }),
          color: attr.color({
            arrayOk: true,
            editType: 'style',
            description:
              'Link color, or one per link. Default: translucent black on light paper, translucent white on dark paper.',
          }),
          hovercolor: attr.color({
            arrayOk: true,
            editType: 'style',
            description:
              'Link color while it (or a node it connects) is hovered, or one per link. Default: the link color 0.2 more opaque (brightened on dark paper, darkened on light paper when already that opaque).',
          }),
          customdata: attr.dataArray({
            editType: 'calc',
            description: 'Extra data per link for `%{customdata}` and events.',
          }),
          line: outline('links', '#444', 0),
          source: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description: 'Source node index of every link.',
          }),
          target: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description: 'Target node index of every link.',
          }),
          value: attr.dataArray({
            editType: 'calc',
            role: 'data',
            description:
              'Flow of every link, which sets its width. Links without a positive value are dropped.',
          }),
          hoverinfo: partHoverinfo('the links'),
          hovertemplate: attr.string({
            editType: 'none',
            description:
              'Template of the link hover labels: `%{label}`, `%{value}` (formatted with `valueformat` and `valuesuffix`), `%{source.label}`, `%{target.label}`, `%{flow.labelConcentration}`, `%{customdata}`, … `<extra>…</extra>` replaces the value box.',
          }),
          colorscales: attr.items(
            {
              label: attr.string({
                dflt: '',
                editType: 'calc',
                description: 'The link label this colorscale applies to.',
              }),
              cmin: attr.number({
                dflt: 0,
                editType: 'calc',
                description: 'Concentration mapped to the first color.',
              }),
              cmax: attr.number({
                dflt: 1,
                editType: 'calc',
                description: 'Concentration mapped to the last color.',
              }),
              colorscale: attr.colorscale({
                dflt: [
                  [0, 'white'],
                  [1, 'black'],
                ],
                editType: 'calc',
                description: 'Colorscale of the concentration.',
              }),
            },
            {
              itemName: 'concentrationscales',
              editType: 'calc',
              description:
                'Concentration colorscales: links labeled `label` are colored by their share of the flow between their two nodes (the links sharing the source and target), mapped from `cmin`–`cmax` through `colorscale`. Hover labels then show the concentration.',
            },
          ),
        },
        { editType: 'calc', description: 'The links.' },
      ),
    },
    {
      description:
        'Sankey diagram: nodes in columns sized by their flow and links between them as wide as their value; cycles are drawn as loops; drag nodes to rearrange.',
    },
  ))();
