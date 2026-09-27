/**
 * `image` attribute schema (plan E11.3, ADR-002), following plotly.js `image/attributes.js`: pixel
 * colors as a 2D array of color components (`z`, read through `colormodel` with `zmin` / `zmax`)
 * or an encoded picture (`source`, a base64 data URI), placed on the axes by `x0` / `y0` (center
 * of the first pixel) and `dx` / `dy` (pixel size).
 */
import { attr } from '@mk7s/holochart-core';

function range(which: 'min' | 'max') {
  const end = which === 'min' ? 'first' : 'last';
  return attr.infoArray({
    items: [
      attr.number({ editType: 'calc', description: 'First component.' }),
      attr.number({ editType: 'calc', description: 'Second component.' }),
      attr.number({ editType: 'calc', description: 'Third component.' }),
      attr.number({ editType: 'calc', description: 'Fourth component (alpha).' }),
    ],
    freeLength: true,
    editType: 'calc',
    description: `Per component, the \`z\` value mapped to the ${end} value of the color model's range (0–255 for r, g, b; 0–1 for alpha, or 0–255 with \`rgba256\`; 0–360 for hue; 0–100 for saturation and lightness). Default: that range, so values are used as they are.`,
  });
}

/** The image schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const imageAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      source: attr.string({
        editType: 'calc',
        description:
          "The picture as a base64 data URI (`'data:image/png;base64,…'`; PNG, JPEG, GIF, WebP or BMP), used when `z` is not given. Other URLs are ignored, as in Plotly.",
      }),
      z: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'Pixel colors: `z[row][column]` is an array of color components in `colormodel` (e.g. `[r, g, b]`). Row 0 is drawn at `y0`, at the top by default.',
      }),
      colormodel: attr.enumerated({
        values: ['rgb', 'rgba', 'rgba256', 'hsl', 'hsla'],
        editType: 'calc',
        description:
          "How `z` components are read: `'rgb'` (default), `'rgba'` (alpha 0–1), `'rgba256'` (alpha 0–255; always used for `source`), `'hsl'` or `'hsla'`.",
      }),
      zmin: range('min'),
      zmax: range('max'),
      zsmooth: attr.enumerated({
        values: ['fast', false],
        dflt: false,
        editType: 'style',
        description:
          "Pixel smoothing: none (`false`, square pixels) or `'fast'` (bilinear, the GPU's linear filtering).",
      }),
      x0: attr.any({
        dflt: 0,
        editType: 'calc',
        description: 'X coordinate of the center of the first pixel column.',
      }),
      y0: attr.any({
        dflt: 0,
        editType: 'calc',
        description: 'Y coordinate of the center of the first pixel row.',
      }),
      dx: attr.number({
        dflt: 1,
        editType: 'calc',
        description: 'Pixel width in x units.',
      }),
      dy: attr.number({
        dflt: 1,
        editType: 'calc',
        description: 'Pixel height in y units.',
      }),
      text: attr.dataArray({
        editType: 'plot',
        description: 'Text per pixel (2D like `z`), shown in hover labels.',
      }),
      hovertext: attr.dataArray({
        editType: 'plot',
        description: 'Hover text per pixel (2D like `z`); takes precedence over `text`.',
      }),
      hoverinfo: attr.flaglist({
        flags: ['x', 'y', 'z', 'color', 'name', 'text'],
        extras: ['all', 'none', 'skip'],
        dflt: 'x+y+z+text+name',
        arrayOk: true,
        editType: 'none',
        description:
          "Which fields hover labels show: `z` is the pixel's components as given, `color` the color they make in the color model (`RGB: [r, g, b]`).",
      }),
      hovertemplate: attr.string({
        arrayOk: true,
        editType: 'none',
        description:
          'Template for hover labels: `%{x}`, `%{y}`, `%{z}` (the pixel, `%{z[0]}` … its components), `%{color}` (scaled color, `%{color[0]}` …), `%{colormodel}`.',
      }),
      zorder: attr.integer({
        dflt: 0,
        editType: 'plot',
        description:
          'Stacking order among the traces of a subplot: higher is drawn on top. At equal `zorder`, images draw below every other trace type (Plotly’s layer order).',
      }),
    },
    {
      description:
        'Image: pixel colors (RGB, RGBA or HSL components, or an encoded picture) drawn as one texture on the axes, with pixel hover.',
    },
  ))();
