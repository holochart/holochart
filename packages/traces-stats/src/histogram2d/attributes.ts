/**
 * `histogram2d` attribute schema (plan E10.2, ADR-002), following plotly.js'
 * `histogram2d/attributes.js`: the samples (`x`, `y`, and `z` or `marker.color` for `histfunc`),
 * the binning (`nbinsx` / `xbins`, `bingroup`, …), the heatmap styling (`xgap`, `ygap`,
 * `zsmooth`, cell labels) and the `z` colorscale.
 *
 * The sample and binning attributes are shared with `histogram2dcontour`
 * ({@link histogram2dSampleAttributes}).
 */
import { attr } from '@mk7s/holochart-core';
import { zColorscaleAttributes } from './colorscale.ts';

/** `xbins` / `ybins` (Plotly `makeBinAttrs`). */
function binAttributes(letter: 'x' | 'y') {
  return attr.object(
    {
      start: attr.any({
        editType: 'calc',
        description: `First ${letter} bin edge. Default: the smallest sample, shifted down to a nice round value (integers get edges at half-integers). Dates as date strings; categories by their serial number (default -0.5).`,
      }),
      end: attr.any({
        editType: 'calc',
        description: `Where ${letter} bins stop: edges step by \`size\` from \`start\` until they reach or pass \`end\`. Default: the largest sample.`,
      }),
      size: attr.any({
        editType: 'calc',
        description: `Width of the ${letter} bins: a number, milliseconds or \`'M<n>'\` (months) on date axes, a number of categories on category axes. Default: a nice round size from \`nbins${letter}\` or the samples.`,
      }),
    },
    { editType: 'calc', description: `${letter.toUpperCase()} binning.` },
  );
}

/** Samples, aggregation and binning: shared by `histogram2d` and `histogram2dcontour`. */
export function histogram2dSampleAttributes() {
  return {
    x: attr.dataArray({
      editType: 'calc',
      role: 'data',
      description:
        'Sample x coordinates (numbers, dates or categories), binned along x. Required, with `y`.',
    }),
    y: attr.dataArray({
      editType: 'calc',
      role: 'data',
      description:
        'Sample y coordinates (numbers, dates or categories), binned along y. Required, with `x`.',
    }),
    z: attr.dataArray({
      editType: 'calc',
      description: 'Values aggregated by `histfunc` (one per sample); counts are used without.',
    }),
    marker: attr.object(
      {
        color: attr.dataArray({
          editType: 'calc',
          description: 'Aggregation values, used when `z` is not given.',
        }),
      },
      { editType: 'calc', description: 'Aggregation data (Plotly compatibility).' },
    ),
    histfunc: attr.enumerated({
      values: ['count', 'sum', 'avg', 'min', 'max'],
      dflt: 'count',
      editType: 'calc',
      description:
        'What each bin shows: the number of samples (`count`), or the `sum`, average (`avg`), `min` or `max` of their `z` values.',
    }),
    histnorm: attr.enumerated({
      values: ['', 'percent', 'probability', 'density', 'probability density'],
      dflt: '',
      editType: 'calc',
      description:
        'Normalization: none, the percentage or fraction of the total (`percent`, `probability`), per unit area (`density`: value / bin area), or both (`probability density`, integrating to 1).',
    }),
    nbinsx: attr.integer({
      min: 0,
      dflt: 0,
      editType: 'calc',
      description:
        'Maximum number of x bins when `xbins.size` is not given (a nice round size is picked). 0: automatic.',
    }),
    xbins: binAttributes('x'),
    nbinsy: attr.integer({
      min: 0,
      dflt: 0,
      editType: 'calc',
      description:
        'Maximum number of y bins when `ybins.size` is not given (a nice round size is picked). 0: automatic.',
    }),
    ybins: binAttributes('y'),
    autobinx: attr.boolean({
      editType: 'calc',
      description: 'Obsolete (Plotly compatibility): bins are automatic unless `xbins` sets them.',
    }),
    autobiny: attr.boolean({
      editType: 'calc',
      description: 'Obsolete (Plotly compatibility): bins are automatic unless `ybins` sets them.',
    }),
    bingroup: attr.string({
      dflt: '',
      editType: 'calc',
      description:
        'Default of `xbingroup` and `ybingroup` (suffixed per direction): traces with the same `bingroup` get matching x bins and matching y bins.',
    }),
    xbingroup: attr.string({
      dflt: '',
      editType: 'calc',
      description:
        'Traces (histogram2d, histogram2dcontour, and histograms with the same `bingroup`) on axes of the same type with the same group share their x bins.',
    }),
    ybingroup: attr.string({
      dflt: '',
      editType: 'calc',
      description: 'Like `xbingroup`, for y bins.',
    }),
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
  } as const;
}

/** Cell-label font: `size` and `color` default to `'auto'` (fitted size, contrasting color). */
export const cellTextFont = /* @__PURE__ */ (() =>
  attr.object(
    {
      family: attr.string({
        noBlank: true,
        strict: true,
        editType: 'plot',
        description: 'CSS font-family list. Default: `layout.font.family`.',
      }),
      size: attr.number({
        min: 1,
        extras: ['auto'],
        dflt: 'auto',
        editType: 'plot',
        description:
          "Font size in CSS px, or `'auto'`: the largest size (up to `layout.font.size`) at which labels fit their cells.",
      }),
      color: attr.color({
        editType: 'style',
        description: 'Text color. Default: black or white, whichever contrasts with the cell.',
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
    { editType: 'plot', description: 'Font of the cell labels (`texttemplate`).' },
  ))();

/** The histogram2d schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const histogram2dAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...histogram2dSampleAttributes(),
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
          "Cell smoothing: none (`false`, flat cells), `'fast'` (bilinear between cell centers, by cell index) or `'best'` (bilinear between cell centers in data space, exact for uneven bins). Drawn on the GPU either way.",
      }),
      texttemplate: attr.string({
        dflt: '',
        editType: 'plot',
        description:
          'Label drawn in every cell: `%{z}` (the bin value), `%{x}`, `%{y}` (bin centers), with optional d3 formats (`%{z:.1f}`). Empty: no labels.',
      }),
      textfont: cellTextFont,
      zorder: attr.integer({
        dflt: 0,
        editType: 'plot',
        description:
          'Stacking order among the traces of a subplot: higher is drawn on top. At equal `zorder`, heatmap-like traces draw below bars and scatter traces (Plotly’s layer order).',
      }),
      ...zColorscaleAttributes('style'),
    },
    {
      description:
        '2D histogram: samples binned along x and y, counted (or aggregated) per cell and drawn as a heatmap.',
    },
  ))();
