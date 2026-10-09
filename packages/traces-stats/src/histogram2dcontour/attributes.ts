/**
 * `histogram2dcontour` attribute schema (plan E10.3, ADR-002), following plotly.js
 * `histogram2dcontour/attributes.js`: the samples and binning of `histogram2d`, the contour
 * attributes shared with `contour` (`../contour/attributes.ts`: levels, constraints, lines) and the
 * `z` colorscale (automatic by default, unlike histogram2d).
 *
 * Constraint contours (`contours.type: 'constraint'`, E11.2) go beyond Plotly, whose
 * histogram2dcontour ignores `contours.type`.
 */
import { attr } from '@mk7s/holochart-core';
import { contourAttributes } from '../contour/attributes.ts';
import { cellTextFont, histogram2dSampleAttributes } from '../histogram2d/attributes.ts';
import { zColorscaleAttributes } from '../histogram2d/colorscale.ts';

/** The histogram2dcontour schema. Common trace attributes come from core. @experimental */
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
