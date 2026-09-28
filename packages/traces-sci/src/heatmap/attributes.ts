/**
 * `heatmap` attribute schema (plan E11.1, ADR-002), following plotly.js `heatmap/attributes.js`:
 * the grid (`z` as a 2D array, or 1D columns with `x` and `y`), its coordinates (`x` / `y` arrays
 * of cell centers or edges, or `x0` / `dx` and `y0` / `dy`), `transpose`, gap handling
 * (`connectgaps`, `hoverongaps`), the cell styling shared with `histogram2d` (`xgap`, `ygap`,
 * `zsmooth`, cell labels) and the `z` colorscale.
 *
 * `xperiod` / `yperiod` alignment comes from `bar`. Deferred: `xcalendar` / `ycalendar`.
 */
import { attr } from '@mk7s/holochart-core';
import { barAttributes } from '@mk7s/holochart-traces-basic';
import { cellTextFont, zColorscaleAttributes } from '@mk7s/holochart-traces-stats';

/** A coordinate array (`x` / `y`). */
function coordinate(letter: 'x' | 'y') {
  return attr.dataArray({
    editType: 'calc',
    role: 'data',
    description: `${letter.toUpperCase()} coordinates (numbers, dates or categories): one per ${letter === 'x' ? 'column' : 'row'} of \`z\` (cell centers; the cell edges are halfway between them) or one more (the cell edges). With 1D \`z\`, the ${letter} value of each point.`,
  });
}

/** `x0` / `y0`: the first cell center of a scaled coordinate. */
function start(letter: 'x' | 'y') {
  return attr.any({
    dflt: 0,
    editType: 'calc',
    description: `Center of the first ${letter === 'x' ? 'column' : 'row'} when \`${letter}\` is not given (or \`${letter}type: 'scaled'\`); the next ones step by \`d${letter}\`.`,
  });
}

/** `dx` / `dy`: the step of a scaled coordinate. */
function step(letter: 'x' | 'y') {
  return attr.number({
    dflt: 1,
    editType: 'calc',
    description: `Step between ${letter === 'x' ? 'columns' : 'rows'} when \`${letter}\` is not given (milliseconds on date axes).`,
  });
}

/** `xtype` / `ytype`. */
function coordinateType(letter: 'x' | 'y') {
  return attr.enumerated({
    values: ['array', 'scaled'],
    editType: 'calc',
    description: `\`'array'\` (default with \`${letter}\`): place the cells at \`${letter}\`; \`'scaled'\` (default without): at \`${letter}0\` + i × \`d${letter}\`.`,
  });
}

/** The heatmap schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const heatmapAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      z: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'Cell values: a 2D array (`z[row][column]`, rows along y), or a 1D array with `x` and `y` columns (one value per point, placed on the grid of their distinct x and y values). Non-numeric entries are gaps.',
      }),
      x: coordinate('x'),
      x0: start('x'),
      dx: step('x'),
      xtype: coordinateType('x'),
      y: coordinate('y'),
      y0: start('y'),
      dy: step('y'),
      ytype: coordinateType('y'),
      // Period alignment of the given coordinates, as bar's (E3.5).
      xperiod: barAttributes.children.xperiod,
      xperiod0: barAttributes.children.xperiod0,
      xperiodalignment: barAttributes.children.xperiodalignment,
      yperiod: barAttributes.children.yperiod,
      yperiod0: barAttributes.children.yperiod0,
      yperiodalignment: barAttributes.children.yperiodalignment,
      transpose: attr.boolean({
        dflt: false,
        editType: 'calc',
        description: 'Swap rows and columns of a 2D `z` (`z[column][row]`).',
      }),
      text: attr.dataArray({
        editType: 'calc',
        description:
          'Text per cell (2D like `z`, or 1D with column data): shown in hover labels and as `%{text}` in templates.',
      }),
      hovertext: attr.dataArray({
        editType: 'style',
        description: 'Hover text per cell (2D like `z`); takes precedence over `text` in hover.',
      }),
      hoverongaps: attr.boolean({
        dflt: true,
        editType: 'none',
        description: 'Show hover labels on gaps (cells without a value), with an empty `z`.',
      }),
      connectgaps: attr.boolean({
        editType: 'calc',
        description:
          'Fill gaps by interpolating their neighbours (Plotly’s Laplace fill). Default: true for 1D `z` with `zsmooth`, else false.',
      }),
      xgap: attr.number({
        min: 0,
        dflt: 0,
        editType: 'style',
        description: 'Horizontal gap between cells, in px (only without `zsmooth`).',
      }),
      ygap: attr.number({
        min: 0,
        dflt: 0,
        editType: 'style',
        description: 'Vertical gap between cells, in px (only without `zsmooth`).',
      }),
      zsmooth: attr.enumerated({
        values: ['fast', 'best', false],
        dflt: false,
        editType: 'style',
        description:
          "Cell smoothing: none (`false`, flat cells), `'fast'` (bilinear between cell centers by cell index; off on log axes and uneven grids, as in Plotly) or `'best'` (bilinear between cell centers in data space). Drawn on the GPU either way.",
      }),
      texttemplate: attr.string({
        dflt: '',
        editType: 'plot',
        description:
          'Label drawn in every cell: `%{z}`, `%{x}`, `%{y}` (cell centers), `%{text}`, with optional d3 formats (`%{z:.1f}`). Empty: no labels.',
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
      zorder: attr.integer({
        dflt: 0,
        editType: 'plot',
        description:
          'Stacking order among the traces of a subplot: higher is drawn on top. At equal `zorder`, heatmaps draw below contours, bars and scatter traces (Plotly’s layer order).',
      }),
      ...zColorscaleAttributes('style'),
    },
    {
      description:
        'Heatmap: a grid of values drawn as colored cells (one GPU texture with a colorscale lookup), with optional cell labels.',
    },
  ))();
