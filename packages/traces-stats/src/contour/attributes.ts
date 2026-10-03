/**
 * The contour attributes shared by `histogram2dcontour` and `contour` (plotly.js
 * `contour/attributes.js`): the levels (`autocontour`, `ncontours`, `contours.*`), constraint
 * contours (`contours.type: 'constraint'`, `operation`, `value`, `fillcolor`) and the lines.
 */
import { attr, fontSchema } from '@mk7s/holochart-core';
import { CONSTRAINT_OPERATIONS } from '../shared/contour-constraint.ts';

/** The contour attributes (spread into a trace schema). @internal */
export function contourAttributes() {
  return {
    autocontour: attr.boolean({
      dflt: true,
      editType: 'calc',
      description:
        'Pick the contour levels automatically (at most `ncontours`, at nice round values). Defaults to false when `contours.start` and `contours.end` are given.',
    }),
    ncontours: attr.integer({
      min: 1,
      dflt: 15,
      editType: 'calc',
      description:
        'Maximum number of contour levels with `autocontour` (or without `contours.size`); the actual number is chosen to give nice round levels.',
    }),
    contours: attr.object(
      {
        type: attr.enumerated({
          values: ['levels', 'constraint'],
          dflt: 'levels',
          editType: 'calc',
          description:
            "`'levels'`: lines (and fills) at every level. `'constraint'`: the boundary of the region where `z` satisfies `operation` and `value`, with the region shaded in `fillcolor` for inequalities.",
        }),
        start: attr.number({
          editType: 'calc',
          description: 'First contour level (with `end`, turns `autocontour` off).',
        }),
        end: attr.number({
          editType: 'calc',
          description: 'Last contour level (with `start`, turns `autocontour` off).',
        }),
        size: attr.number({
          min: 0,
          editType: 'calc',
          description: 'Step between contour levels. Default: a nice round step from `ncontours`.',
        }),
        coloring: attr.enumerated({
          values: ['fill', 'heatmap', 'lines', 'none'],
          dflt: 'fill',
          editType: 'calc',
          description:
            "How levels are colored: flat bands between levels (`'fill'`), a smooth heatmap under the lines (`'heatmap'`), colored lines only (`'lines'`), or plain `line.color` lines (`'none'`). Not used by constraint contours.",
        }),
        showlines: attr.boolean({
          dflt: true,
          editType: 'plot',
          description:
            "Draw the contour lines (only for `coloring: 'fill'` and shaded constraints; always drawn otherwise).",
        }),
        showlabels: attr.boolean({
          dflt: false,
          editType: 'plot',
          description:
            'Label contour lines with their level, along the lines (the lines break under the labels).',
        }),
        labelfont: fontSchema(
          'Font of the level labels. Defaults to `layout.font`, colored like the lines.',
        ),
        labelformat: attr.string({
          dflt: '',
          editType: 'plot',
          description: 'd3 number format of the level labels, e.g. `.2f`. Default: automatic.',
        }),
        operation: attr.enumerated({
          values: CONSTRAINT_OPERATIONS,
          dflt: '=',
          editType: 'calc',
          description:
            "Constraint contours: `'='` draws the line where `z` equals `value`; `'<'` / `'<='` and `'>'` / `'>='` shade where `z` is below or above `value`; `'[]'`, `'()'`, `'[)'`, `'(]'` shade inside the interval `value`, `'][', ')(', '](', ')['` outside it. Open and closed ends draw the same.",
        }),
        value: attr.any({
          dflt: 0,
          editType: 'calc',
          description:
            'Constraint contours: the boundary value, a number for comparisons, or `[lower, upper]` for intervals (a single number `v` means `[v, v + 1]`).',
        }),
      },
      { editType: 'calc', description: 'Contour levels, coloring, labels and constraints.' },
    ),
    fillcolor: attr.color({
      editType: 'calc',
      description:
        "Fill of the shaded region of constraint contours. Default: `line.color` (else the trace's colorway color) at half opacity.",
    }),
    line: attr.object(
      {
        color: attr.color({
          editType: 'style',
          description:
            "Contour line color. Default: black; lines take their level's color with `coloring: 'lines'`. Constraint contours default to `fillcolor` made opaque.",
        }),
        width: attr.number({
          min: 0,
          dflt: 0.5,
          editType: 'style',
          description: 'Contour line width in px (default 0.5, or 2 for constraint contours).',
        }),
        dash: attr.string({
          dflt: 'solid',
          editType: 'style',
          description:
            "Dash style: `'solid'`, `'dot'`, `'dash'`, `'longdash'`, `'dashdot'`, `'longdashdot'`, or a dash list such as `'5px,10px,2px'`.",
        }),
        smoothing: attr.number({
          min: 0,
          max: 1.3,
          dflt: 1,
          editType: 'plot',
          description:
            'Smoothing of the contour lines and fills (Plotly’s spline smoothing): 0 draws straight segments between grid crossings.',
        }),
      },
      { editType: 'plot', description: 'Contour lines.' },
    ),
  } as const;
}
