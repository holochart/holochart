/**
 * `contour` attribute schema (plan E11.2, ADR-002), following plotly.js `contour/attributes.js`:
 * the grid of `heatmap` (`z` as a 2D array or 1D columns with `x` and `y`; `x` / `y` coordinates
 * of the grid points or `x0` / `dx`, `y0` / `dy`; `transpose`), gap handling (`connectgaps`,
 * `hoverongaps`), the contour attributes shared with `histogram2dcontour` (levels, coloring,
 * labels, constraints, lines; see traces-stats `contour/attributes.ts`), cell labels for
 * `coloring: 'heatmap'` and the `z` colorscale.
 *
 * Deferred: `xperiod` / `yperiod` (period alignment) and `xcalendar` / `ycalendar`.
 */
import { attr } from '@mk7s/holochart-core';
import {
  cellTextFont,
  contourCommonAttributes,
  zColorscaleAttributes,
} from '@mk7s/holochart-traces-stats';

function coordinate(letter: 'x' | 'y') {
  const along = letter === 'x' ? 'column' : 'row';
  return attr.dataArray({
    editType: 'calc',
    role: 'data',
    description: `${letter.toUpperCase()} coordinates (numbers, dates or categories) of the grid points: one per ${along} of \`z\` (extra values are ignored; missing ones continue the last step). Uneven spacing is fine. With 1D \`z\`, the ${letter} value of each point.`,
  });
}

function start(letter: 'x' | 'y') {
  return attr.any({
    dflt: 0,
    editType: 'calc',
    description: `Coordinate of the first ${letter === 'x' ? 'column' : 'row'} when \`${letter}\` is not given (or \`${letter}type: 'scaled'\`); the next ones step by \`d${letter}\`.`,
  });
}

function step(letter: 'x' | 'y') {
  return attr.number({
    dflt: 1,
    editType: 'calc',
    description: `Step between ${letter === 'x' ? 'columns' : 'rows'} when \`${letter}\` is not given (milliseconds on date axes).`,
  });
}

function coordinateType(letter: 'x' | 'y') {
  return attr.enumerated({
    values: ['array', 'scaled'],
    editType: 'calc',
    description: `\`'array'\` (default with \`${letter}\`): place the grid points at \`${letter}\`; \`'scaled'\` (default without): at \`${letter}0\` + i × \`d${letter}\`.`,
  });
}

/** The contour schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const contourAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      z: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'Values to contour: a 2D array (`z[row][column]`, rows along y), or a 1D array with `x` and `y` columns (one value per point, placed on the grid of their distinct x and y values). Non-numeric entries are gaps.',
      }),
      x: coordinate('x'),
      x0: start('x'),
      dx: step('x'),
      xtype: coordinateType('x'),
      y: coordinate('y'),
      y0: start('y'),
      dy: step('y'),
      ytype: coordinateType('y'),
      transpose: attr.boolean({
        dflt: false,
        editType: 'calc',
        description: 'Swap rows and columns of a 2D `z` (`z[column][row]`).',
      }),
      text: attr.dataArray({
        editType: 'calc',
        description:
          'Text per grid point (2D like `z`, or 1D with column data): shown in hover labels and as `%{text}` in templates.',
      }),
      hovertext: attr.dataArray({
        editType: 'style',
        description:
          'Hover text per grid point (2D like `z`); takes precedence over `text` in hover.',
      }),
      hoverongaps: attr.boolean({
        dflt: true,
        editType: 'none',
        description:
          'Show hover labels on gaps (grid points without a value, with `connectgaps: false`), with an empty `z`.',
      }),
      connectgaps: attr.boolean({
        editType: 'calc',
        description:
          'Draw the contours across gaps (non-numeric `z`), which are always filled from their neighbours for contouring (Plotly’s Laplace fill). `false` clips the drawing to the data, leaving holes at the gaps. Default: true for 1D `z`, else false.',
      }),
      texttemplate: attr.string({
        dflt: '',
        editType: 'plot',
        description:
          "Label drawn at every grid point with `contours.coloring: 'heatmap'`: `%{z}`, `%{x}`, `%{y}`, `%{text}`, with optional d3 formats (`%{z:.1f}`). Empty: no labels.",
      }),
      textfont: cellTextFont,
      xhoverformat: attr.string({
        dflt: '',
        editType: 'none',
        description:
          'd3 number or date format of x values in hover labels. Default: the axis format.',
      }),
      yhoverformat: attr.string({
        dflt: '',
        editType: 'none',
        description:
          'd3 number or date format of y values in hover labels. Default: the axis format.',
      }),
      zhoverformat: attr.string({
        dflt: '',
        editType: 'none',
        description: 'd3 number format of z values in hover labels (and `%{z}` in templates).',
      }),
      ...contourCommonAttributes(),
      zorder: attr.integer({
        dflt: 0,
        editType: 'plot',
        description:
          'Stacking order among the traces of a subplot: higher is drawn on top. At equal `zorder`, contours draw above heatmaps and below bars and scatter traces (Plotly’s layer order).',
      }),
      ...zColorscaleAttributes('calc'),
    },
    {
      description:
        'Contour plot: level lines of a grid of values (uneven grids allowed), drawn as filled bands, a smooth heatmap or lines, with level labels along the lines, or constraint contours shading where the values satisfy an inequality.',
    },
  ))();
