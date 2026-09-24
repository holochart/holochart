/** Attributes shared by every trace type, merged into each module's schema by the registry. */
import { attr } from '../schema/attr.ts';

/** Attributes every trace has. */
export const commonTraceAttributes = {
  type: attr.string({
    noBlank: true,
    strict: true,
    editType: 'calc',
    description: "Trace type, e.g. `'scatter'`. Defaults to `'scatter'`.",
  }),
  visible: attr.enumerated({
    values: [true, false, 'legendonly'],
    dflt: true,
    editType: 'calc',
    description:
      'Whether the trace is drawn. `legendonly` hides it but keeps its (toggleable) legend entry.',
  }),
  name: attr.string({
    editType: ['legend', 'plot'],
    description: 'Trace name shown in the legend and hover labels. Defaults to `trace N`.',
  }),
  uid: attr.string({
    editType: 'plot',
    description:
      'Stable identity used to match traces across updates, so reordered traces are moved instead of rebuilt.',
  }),
  showlegend: attr.boolean({
    dflt: true,
    editType: ['legend', 'layout'],
    description: 'Whether this trace has a legend entry.',
  }),
  legendgroup: attr.string({
    dflt: '',
    editType: 'legend',
    description: 'Traces in the same legend group toggle together.',
  }),
  hovertext: attr.string({
    arrayOk: true,
    dflt: '',
    editType: 'style',
    description: 'Hover text per point; defaults to `text`.',
  }),
  hoverinfo: attr.flaglist({
    flags: ['x', 'y', 'z', 'text', 'name'],
    extras: ['all', 'none', 'skip'],
    arrayOk: true,
    editType: 'none',
    description:
      "Which fields hover labels show; `'skip'` also turns hover events off for this trace. Default `'all'`.",
  }),
  hovertemplate: attr.string({
    arrayOk: true,
    editType: 'none',
    description:
      "Template for hover labels, e.g. `'%{x}: %{y:.2f}<extra></extra>'` (d3-format / d3-time-format after `:` / `|`). Overrides `hoverinfo`.",
  }),
  hoverlabel: attr.object(
    {
      bgcolor: attr.color({
        arrayOk: true,
        editType: 'none',
        description: 'Label background. Default: the point color.',
      }),
      bordercolor: attr.color({
        arrayOk: true,
        editType: 'none',
        description: 'Label border. Default: contrasting with the background.',
      }),
      font: attr.object(
        {
          family: attr.string({ arrayOk: true, editType: 'none', description: 'Font family.' }),
          size: attr.number({
            min: 1,
            arrayOk: true,
            editType: 'none',
            description: 'Font size in px.',
          }),
          color: attr.color({ arrayOk: true, editType: 'none', description: 'Font color.' }),
        },
        { editType: 'none', description: 'Label font.' },
      ),
      align: attr.enumerated({
        values: ['left', 'right', 'auto'],
        arrayOk: true,
        editType: 'none',
        description: 'Text alignment inside labels.',
      }),
      namelength: attr.integer({
        min: -1,
        arrayOk: true,
        editType: 'none',
        description: 'Characters of the trace name shown (`-1`: all, `0`: none).',
      }),
    },
    {
      editType: 'none',
      description:
        'Hover label style for this trace. Unset fields fall back to `layout.hoverlabel` (so there are no trace-level defaults).',
    },
  ),
  selectedpoints: attr.any({
    editType: 'style',
    description:
      'Indices of the selected points (set by box/lasso selection, or programmatically). `null` clears the selection.',
  }),
  legendrank: attr.number({
    dflt: 1000,
    editType: 'legend',
    description:
      'Sort key for legend entries: lower ranks come first (top, or left). Ties keep trace order; traces default to 1000.',
  }),
  legendwidth: attr.number({
    min: 0,
    editType: 'legend',
    description:
      "Width in px of this trace's legend entry (horizontal legends). Default: sized to its text.",
  }),
  legendgrouptitle: attr.object(
    {
      text: attr.string({
        dflt: '',
        editType: 'legend',
        description: 'Title shown above this legend group.',
      }),
      font: attr.object(
        {
          family: attr.string({ editType: 'legend', description: 'Font family.' }),
          size: attr.number({ min: 1, editType: 'legend', description: 'Font size in px.' }),
          color: attr.color({ editType: 'legend', description: 'Font color.' }),
        },
        { editType: 'legend', description: 'Group title font. Defaults to the legend title font.' },
      ),
    },
    { editType: 'legend', description: 'Title of the legend group this trace belongs to.' },
  ),
  opacity: attr.number({
    min: 0,
    max: 1,
    dflt: 1,
    editType: 'style',
    animatable: true,
    description: 'Opacity of the whole trace.',
  }),
  meta: attr.any({
    arrayOk: true,
    editType: 'plot',
    description: 'Arbitrary user data, available in text templates as `%{meta}`.',
  }),
  customdata: attr.dataArray({
    editType: 'calc',
    description: 'Per-point user data, returned in events and available in hover templates.',
  }),
  ids: attr.dataArray({
    editType: 'calc',
    description: 'Per-point ids used to match points across animation frames.',
  }),
  dataset: attr.string({
    noBlank: true,
    strict: true,
    editType: 'calc',
    description:
      "Name of a figure-level dataset (`figure.datasets`). Data arrays, and per-point attributes whose values cannot start with `@` (such as colors and sizes), may then reference its columns as `'@column'`; on string attributes such as `text`, `'@…'` stays literal text.",
  }),
  uirevision: attr.any({
    editType: 'none',
    description:
      'While unchanged, user interaction state for this trace (legend visibility, selections) is kept across updates.',
  }),
} as const;

/** Attributes added to traces in the `cartesian` category. */
export const cartesianTraceAttributes = {
  xaxis: attr.subplotId({
    dflt: 'x',
    editType: 'calc',
    description:
      "The x axis this trace is plotted against: `'x'` → `layout.xaxis`, `'x2'` → `layout.xaxis2`.",
  }),
  yaxis: attr.subplotId({
    dflt: 'y',
    editType: 'calc',
    description:
      "The y axis this trace is plotted against: `'y'` → `layout.yaxis`, `'y2'` → `layout.yaxis2`.",
  }),
} as const;

/**
 * Attributes added to traces in the `domain` category (plan E4.5; Plotly's `plots/domain.js`):
 * pie, and later sunburst, treemap, funnelarea, indicator, … are placed by a fraction of the plot
 * area instead of axes. `row` / `column` pick a `layout.grid` cell, which then gives the default
 * `x` / `y`; without a grid they are dropped.
 */
export const domainTraceAttributes = {
  domain: attr.object(
    {
      x: attr.infoArray({
        items: [
          attr.number({ min: 0, max: 1, editType: 'plot' }),
          attr.number({ min: 0, max: 1, editType: 'plot' }),
        ],
        dflt: [0, 1],
        editType: 'plot',
        description:
          'Horizontal extent `[start, end]` of this trace as fractions of the plot area. Defaults to the `layout.grid` column when `column` is set, else `[0, 1]`.',
      }),
      y: attr.infoArray({
        items: [
          attr.number({ min: 0, max: 1, editType: 'plot' }),
          attr.number({ min: 0, max: 1, editType: 'plot' }),
        ],
        dflt: [0, 1],
        editType: 'plot',
        description:
          'Vertical extent `[start, end]` of this trace as fractions of the plot area (from the bottom). Defaults to the `layout.grid` row when `row` is set, else `[0, 1]`.',
      }),
      row: attr.integer({
        min: 0,
        dflt: 0,
        editType: 'plot',
        description:
          'Row of the `layout.grid` cell this trace is placed in (0 = first row in `roworder`). Only used with a grid.',
      }),
      column: attr.integer({
        min: 0,
        dflt: 0,
        editType: 'plot',
        description:
          'Column of the `layout.grid` cell this trace is placed in (0 = leftmost). Only used with a grid.',
      }),
    },
    { editType: 'plot', description: 'Where this trace is drawn, as a part of the plot area.' },
  ),
} as const;
