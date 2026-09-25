/**
 * `parcoords` attribute schema (plan E10.10, ADR-002), following plotly.js'
 * `traces/parcoords/attributes.js`. `domain` comes from the registry (the trace is in the `domain`
 * category); `name`, `uid`, `meta`, … are common trace attributes.
 *
 * Edit types: values, ranges, visibility and `line.color` are `calc` (they change the line
 * geometry or its draw order); axis labels, ticks and fonts are `plot`; the colorscale,
 * `constraintrange` and the unselected style are `style`, so brushing recolors the lines without
 * rebuilding them.
 */
import { attr } from '@mk7s/holochart-core';
import { lineColorscaleAttributes, traceFont } from './common.ts';

/** One dimension (axis). */
function dimension() {
  return attr.items(
    {
      label: attr.string({
        editType: 'plot',
        description: 'Axis title, drawn above (or below, `labelside`) the axis.',
      }),
      values: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'The values of this dimension, one per line (row). A dimension without values is hidden.',
      }),
      range: attr.infoArray({
        items: [attr.number({ editType: 'calc' }), attr.number({ editType: 'calc' })],
        editType: 'calc',
        description:
          'The axis range `[bottom, top]`. Default: the extent of `values`. `[high, low]` flips the axis.',
      }),
      constraintrange: attr.infoArray({
        items: attr.any({ editType: 'style' }),
        freeLength: true,
        editType: 'style',
        description:
          'The brushed (selected) interval `[lo, hi]`, or several `[[lo, hi], [lo2, hi2]]` with `multiselect`. Lines outside it on any constrained axis are drawn with the `unselected` style. Brushing an axis restyles this attribute.',
      }),
      multiselect: attr.boolean({
        dflt: true,
        editType: 'plot',
        description:
          'Allow several constraint ranges on this axis: a new brush adds a range instead of replacing it.',
      }),
      tickvals: attr.dataArray({
        editType: 'plot',
        description:
          'Tick positions. With `tickvals` the axis is ordinal: brushes snap to the ticks and a click selects one.',
      }),
      ticktext: attr.dataArray({
        editType: 'plot',
        description: 'Tick labels, one per `tickvals` entry.',
      }),
      tickformat: attr.string({
        dflt: '',
        editType: 'plot',
        description: 'd3-format specifier of the tick labels (e.g. `,.2f`, `.0%`).',
      }),
      visible: attr.boolean({
        dflt: true,
        editType: 'calc',
        description: 'Show this dimension. Hidden dimensions keep their place in `dimensions`.',
      }),
    },
    {
      itemName: 'dimension',
      editType: 'calc',
      description: 'The dimensions (vertical axes), left to right. At most 60 are drawn.',
    },
  );
}

/** The parcoords schema. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const parcoordsAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      dimensions: dimension(),
      line: attr.object(
        {
          color: attr.color({
            arrayOk: true,
            editType: 'calc',
            description:
              'Line color: one CSS color, or one number per line mapped through `line.colorscale` (lines with higher values are drawn on top). Default: the trace color.',
          }),
          ...lineColorscaleAttributes('one per line', 'Viridis'),
        },
        { editType: 'calc', description: 'The lines, one per row of the dimensions.' },
      ),
      unselected: attr.object(
        {
          line: attr.object(
            {
              color: attr.color({
                dflt: '#7f7f7f',
                editType: 'style',
                description: 'Color of the lines outside the constraint ranges.',
              }),
              opacity: attr.number({
                min: 0,
                max: 1,
                extras: ['auto'],
                dflt: 'auto',
                editType: 'style',
                description:
                  "Opacity of the unselected lines. `'auto'`: `max(1/255, (1/N)^(1/3))` for N lines, so dense plots stay readable.",
              }),
            },
            { editType: 'style', description: 'Unselected lines.' },
          ),
        },
        { editType: 'style', description: 'Style of the lines outside the constraint ranges.' },
      ),
      labelangle: attr.angle({
        dflt: 0,
        editType: 'plot',
        description: 'Rotation of the axis labels, in degrees (clockwise).',
      }),
      labelside: attr.enumerated({
        values: ['top', 'bottom'],
        dflt: 'top',
        editType: 'plot',
        description: 'Draw the axis labels above (`top`) or below (`bottom`) the axes.',
      }),
      labelfont: traceFont('Font of the axis labels. Default: `layout.font`, 1/1.2 the size.'),
      tickfont: traceFont('Font of the tick labels. Default: `layout.font`, 1/1.2 the size.'),
      rangefont: traceFont(
        'Font of the range labels at both ends of each axis. Default: `layout.font`, 1/1.2 the size.',
      ),
    },
    {
      description:
        'Parallel coordinates: one vertical axis per dimension and one line per row across them, colored by `line.color`; brush the axes to filter lines and drag the labels to reorder them.',
    },
  ))();
