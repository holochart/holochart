/**
 * `histogram2dcontour` attribute schema (plan E10.3, ADR-002), following plotly.js
 * `histogram2dcontour/attributes.js`: the samples and binning of `histogram2d`, the contour levels
 * (`autocontour`, `ncontours`, `contours.*`), line styling and the `z` colorscale (automatic by
 * default, unlike histogram2d).
 *
 * Not yet: constraint contours (`contours.type: 'constraint'`, `operation`, `value`; plan E11.2).
 */
import { attr, fontSchema } from '@mk7s/holochart-core';
import { cellTextFont, histogram2dSampleAttributes } from '../histogram2d/attributes.ts';
import { zColorscaleAttributes } from '../histogram2d/colorscale.ts';

/** The contour attributes (shared with the M4 `contour` trace). */
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
          values: ['levels'],
          dflt: 'levels',
          editType: 'calc',
          description:
            "`'levels'`: lines (and fills) at every level. Constraint contours (`'constraint'`) are not supported yet.",
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
            "How levels are colored: flat bands between levels (`'fill'`), a smooth heatmap under the lines (`'heatmap'`), colored lines only (`'lines'`), or plain `line.color` lines (`'none'`).",
        }),
        showlines: attr.boolean({
          dflt: true,
          editType: 'plot',
          description:
            "Draw the contour lines (only for `coloring: 'fill'`; always drawn otherwise).",
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
      },
      { editType: 'calc', description: 'Contour levels, coloring and labels.' },
    ),
    line: attr.object(
      {
        color: attr.color({
          editType: 'style',
          description:
            "Contour line color. Default: black; lines take their level's color with `coloring: 'lines'`.",
        }),
        width: attr.number({
          min: 0,
          dflt: 0.5,
          editType: 'style',
          description: 'Contour line width in px.',
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

/** The histogram2dcontour schema. Common trace attributes come from core. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const histogram2dcontourAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...histogram2dSampleAttributes(),
      ...contourAttributes(),
      texttemplate: attr.string({
        dflt: '',
        editType: 'plot',
        description:
          "Label drawn in every bin with `contours.coloring: 'heatmap'`: `%{z}`, `%{x}`, `%{y}` with optional d3 formats. Empty: no labels.",
      }),
      textfont: cellTextFont,
      zorder: attr.integer({
        dflt: 0,
        editType: 'plot',
        description:
          'Stacking order among the traces of a subplot: higher is drawn on top. At equal `zorder`, contours draw below bars and scatter traces (Plotly’s layer order).',
      }),
      ...zColorscaleAttributes('calc'),
      autocolorscale: attr.boolean({
        editType: 'calc',
        description:
          'Pick the colorscale from the sign of the color domain (`layout.colorscale.sequential`, `sequentialminus` or `diverging`). Defaults to true unless `colorscale` is given.',
      }),
    },
    {
      description:
        '2D density contours: samples binned along x and y like histogram2d, drawn as contour levels (filled bands, a heatmap, or lines) with optional level labels.',
    },
  ))();
