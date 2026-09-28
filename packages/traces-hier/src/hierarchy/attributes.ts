/**
 * Attribute builders shared by the hierarchy traces (plan E13.1, ADR-002), following plotly.js'
 * `traces/sunburst/attributes.js`, which treemap and icicle extend: the rows (`labels`, `parents`,
 * `values`, `branchvalues`, `count`), the view (`level`, `maxdepth`), node colors (`marker.colors`
 * with a colorscale, `marker.line`, `marker.pattern`, `leaf.opacity`, `root.color`), labels
 * (`text`, `textinfo`, `texttemplate`, fonts) and hover flags. Each trace module spreads what it
 * uses into its own schema; builders are called inside the modules' pure IIFEs, so bundles without
 * a hierarchy trace drop them.
 *
 * Deferred: `marker.coloraxis` (shared color axes), `texttemplatefallback` /
 * `hovertemplatefallback`, and the font `variant` / `textcase` / `lineposition` / `shadow` fields.
 */
import { attr, type AttrSpec } from '@mk7s/holochart-core';
import { colorscaleAttributes, patternAttributes } from '@mk7s/holochart-traces-basic';

/** Font of node labels. `size` and `color` may be given per node. */
export function hierarchyTextFont(description: string) {
  return attr.object(
    {
      family: attr.string({
        noBlank: true,
        strict: true,
        editType: 'plot',
        description: 'CSS font-family list.',
      }),
      size: attr.number({
        min: 1,
        arrayOk: true,
        editType: 'plot',
        description: 'Font size in CSS px, or one per node.',
      }),
      color: attr.color({
        arrayOk: true,
        editType: 'plot',
        description: 'Text color, or one per node.',
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
    },
    { editType: 'plot', description },
  );
}

/** The rows of a hierarchy and how their values add up. `what` names a node (`'sector'`). */
export function hierarchyDataAttributes(what: string) {
  return {
    labels: attr.dataArray({
      editType: 'calc',
      role: 'data',
      description: `Label of each ${what}. Without \`ids\`, labels are also the node ids \`parents\` refer to, so they must be unique among parents.`,
    }),
    parents: attr.dataArray({
      editType: 'calc',
      role: 'data',
      description:
        "Parent of each node: its id (an `ids` entry, else a `labels` entry). `''` marks a root; several roots get a generated root above them. Without any `''`, the one parent that is not a node becomes the root.",
    }),
    values: attr.dataArray({
      editType: 'calc',
      role: 'data',
      description: `Value of each ${what}, a number ≥ 0 (rows with other values are dropped). How branches add up is \`branchvalues\`; without \`values\`, nodes are sized by \`count\`.`,
    }),
    branchvalues: attr.enumerated({
      values: ['remainder', 'total'],
      dflt: 'remainder',
      editType: 'calc',
      description:
        "How `values` of branches are read: `remainder` adds each node's value to its descendants' (a branch is bigger than its children), `total` takes it as the branch's total, which must not be less than its children's sum (the trace is not drawn otherwise).",
    }),
    count: attr.flaglist({
      flags: ['branches', 'leaves'],
      dflt: 'leaves',
      editType: 'calc',
      description:
        'Without `values`: what a node counts to size it — the leaves below it, its branches, or both.',
    }),
    level: attr.any({
      editType: 'plot',
      description:
        "Id of the node shown as the root (the entry): `''` or unset for the whole hierarchy. Clicking a node sets it (drill-down); clicking the entry goes back up.",
    }),
    maxdepth: attr.integer({
      dflt: -1,
      editType: 'plot',
      description:
        'Levels drawn from the entry down, the entry included; -1 draws them all. Deeper nodes appear when drilling in.',
    }),
  } as const;
}

/**
 * `marker` of a hierarchy trace: colors (with colorscale attributes, which recolor through calc as
 * in Plotly), outline (`lineWidth` default) and pattern.
 */
export function hierarchyMarkerAttributes(what: string, lineWidth: number) {
  const scale = colorscaleAttributes({
    colorAttr: 'marker.colors',
    showscale: true,
    coloraxis: false,
  });
  // Node colors are resolved in calc (Plotly: `editType: 'calc'`), unlike GPU-mapped markers.
  const calcEdits = Object.fromEntries(
    Object.entries(scale).map(([key, node]) =>
      key === 'colorbar' ? [key, node] : [key, { ...(node as AttrSpec), editType: 'calc' }],
    ),
  ) as typeof scale;
  return attr.object(
    {
      colors: attr.dataArray({
        editType: 'calc',
        description: `Color of each ${what}: CSS colors, or numbers mapped through \`colorscale\`. Unset ${what}s take \`layout.<type>colorway\` colors on the first level and their parent's color below it.`,
      }),
      ...calcEdits,
      line: attr.object(
        {
          color: attr.color({
            arrayOk: true,
            editType: 'style',
            description: `Outline color, or one per ${what}. Default: \`paper_bgcolor\`.`,
          }),
          width: attr.number({
            min: 0,
            dflt: lineWidth,
            arrayOk: true,
            editType: 'style',
            description: `Outline width in CSS px (centered on the edge), or one per ${what}.`,
          }),
        },
        { editType: 'calc', description: `${what[0]!.toUpperCase()}${what.slice(1)} outlines.` },
      ),
      pattern: patternAttributes(what),
    },
    { editType: 'calc', description: `${what[0]!.toUpperCase()}${what.slice(1)} style.` },
  );
}

/** `leaf`, `root` and `sort`. */
export function hierarchyStyleAttributes() {
  return {
    leaf: attr.object(
      {
        opacity: attr.number({
          min: 0,
          max: 1,
          editType: 'style',
          description:
            'Opacity of the leaves (nodes without children). Default 1 with a colorscale, else 0.7.',
        }),
      },
      { editType: 'plot', description: 'Leaf style.' },
    ),
    root: attr.object(
      {
        color: attr.color({
          dflt: 'rgba(0,0,0,0)',
          editType: 'calc',
          description: 'Color of the root node (transparent by default).',
        }),
      },
      { editType: 'calc', description: 'Root style.' },
    ),
    sort: attr.boolean({
      dflt: true,
      editType: 'calc',
      description: 'Order siblings by value, largest first; otherwise in data order.',
    }),
  } as const;
}

/** `textinfo` flags of the hierarchy traces. */
export const TEXTINFO_FLAGS = [
  'label',
  'text',
  'value',
  'current path',
  'percent root',
  'percent entry',
  'percent parent',
] as const;

/** Labels (`text`, `textinfo`, `texttemplate`, fonts) and hover flags. */
export function hierarchyTextAttributes(what: string) {
  return {
    text: attr.dataArray({
      editType: 'plot',
      description: `Text per ${what}, shown with the \`text\` flag of \`textinfo\`, and in hover labels unless \`hovertext\` is set.`,
    }),
    textinfo: attr.flaglist({
      flags: TEXTINFO_FLAGS,
      extras: ['none'],
      editType: 'plot',
      description:
        "What node labels show, one per line in a fixed order: label, value, current path, the percentages (of the parent, the entry, the root; `'25% of parent'` when several), text. Default `'label'`, `'text+label'` when `text` is an array. Use `texttemplate` for other layouts.",
    }),
    texttemplate: attr.string({
      arrayOk: true,
      dflt: '',
      editType: 'plot',
      description:
        'Template for node labels, overriding `textinfo`: `%{label}`, `%{value}`, `%{currentPath}`, `%{percentParent}`, `%{parent}`, `%{percentEntry}`, `%{entry}`, `%{percentRoot}`, `%{root}`, `%{text}`, `%{color}`, `%{customdata}`, `%{meta}`, with optional d3 formats (`%{percentRoot:.1%}`).',
    }),
    hoverinfo: attr.flaglist({
      flags: [
        'label',
        'text',
        'value',
        'name',
        'current path',
        'percent root',
        'percent entry',
        'percent parent',
      ],
      extras: ['all', 'none', 'skip'],
      dflt: 'label+text+value+name',
      arrayOk: true,
      editType: 'none',
      description:
        "Which fields hover labels show, in a fixed order (percentages read `'25% of Eve'`); `'skip'` also turns hover events off for this trace.",
    }),
    textfont: hierarchyTextFont('Font of node labels. Defaults to `layout.font`.'),
    insidetextfont: hierarchyTextFont(
      'Font of labels inside nodes. Defaults to `textfont`, with a color contrasting the node.',
    ),
    outsidetextfont: hierarchyTextFont(
      "Font of the root's label when the root is transparent (it sits on the background; not with a colorscale or several roots). Defaults to `textfont`.",
    ),
  } as const;
}

/** Layout attributes of a hierarchy type (`<type>colorway`, `extend<type>colors`). */
export function hierarchyLayoutAttributes(type: string) {
  return {
    [`${type}colorway`]: attr.colorlist({
      editType: 'calc',
      description: `Default colors of the first-level ${type} nodes (deeper nodes take their parent's). Defaults to \`layout.colorway\`; extended with lighter and darker copies when \`extend${type}colors\` is on.`,
    }),
    [`extend${type}colors`]: attr.boolean({
      dflt: true,
      editType: 'calc',
      description: `Extend \`${type}colorway\` to three times its length: every color 20% lighter, then every color 20% darker. Colors from \`marker.colors\` are never extended.`,
    }),
  };
}
