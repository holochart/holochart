---
title: Images and matrices
description: Show matrices as heatmaps and RGB arrays as images with hx.imshow, Holochart's px.imshow, with facets and animation over extra dimensions.
status: complete
---

# Images and matrices

`imshow` is `px.imshow`: it takes an array instead of a table. A 2D matrix becomes a `heatmap`
colored on `layout.coloraxis`; an RGB or RGBA array (`[row][col][channel]`) or an `ImageData`
becomes an `image` trace. Rows run down from the top, as the array stores them, and pixels are
square. Extra leading dimensions can be spread over [facets](/express/facets) or
[animation frames](/express/animation).

## Matrices

A 2D array draws one heatmap. Its colorscale is the template's sequential scale (or
`colorContinuousScale`), and it spans the data from the smallest to the largest value. `x` and `y`
name the columns and rows; `textAuto` writes each value in its cell.

<Example id="express/imshow" :height="400" />

```ts
import hx from '@mk7s/holochart-express';

const figure = hx.imshow(
  [
    [1, 20, 30],
    [20, 1, 60],
    [30, 60, 1],
  ],
  {
    x: ['a', 'b', 'c'],
    y: ['r1', 'r2', 'r3'],
    textAuto: '.0f',
    labels: { x: 'Column', y: 'Row', color: 'Value' },
  },
);
```

Rows can be typed arrays (`Float32Array`, `Uint16Array`, …). `null`, `undefined` and `NaN` are
gaps, and booleans become 0 and 255, as in px.

## Color images

An array whose last dimension has 3 (RGB) or 4 (RGBA) values per pixel is drawn as an `image`.
By default Express encodes it as a PNG and draws it from `source` (px's `binary_string`), so the
figure stays compact; hover then shows each pixel's values. Pass `binaryString: false` to send
the values as `z` with a `colormodel` (`'rgb'` or `'rgba256'`) instead. A browser `ImageData`
(from a canvas) works directly, as an RGBA image.

<Example id="express/imshow-rgb" :height="440" />

```ts
import hx from '@mk7s/holochart-express';

declare const canvas: HTMLCanvasElement;
const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
if (pixels) hx.imshow(pixels, { title: 'Canvas snapshot' });
```

For images, `x` and `y` must be evenly spaced numbers: the first value and the step become the
trace's `x0` / `dx` and `y0` / `dy`. Decreasing coordinates flip the axis. `binaryString: true`
also works for 2D data: the matrix is stretched to 0–255 and drawn as a grayscale PNG.

## Contrast

Without `zmin` / `zmax` (or `rangeColor`), the color range comes from `contrastRescaling`:

| `contrastRescaling`            | Range                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `'minmax'` (default for 2D)    | The data's minimum to maximum                                                                              |
| `'infer'` (default for colors) | 0 to the largest value of the data's type: 255 for bytes, 65535 for `Uint16Array`, 1 for floats within 0–1 |

"Bytes" are `Uint8Array` / `Uint8ClampedArray` rows, `ImageData`, booleans, and plain arrays of
whole numbers from 0 to 255 (JavaScript's stand-in for numpy's `uint8`); they keep the image
trace's own 0–255 range. Other plain numbers are floats: the range ends at 1, 255 or 65535,
whichever the data stay within (plus 5%). For a PNG, the values are stretched from this range to
0–255 channel by channel; when that changes them, hover shows only the coordinates.

`zmin` and `zmax` can also be lists of per-channel limits (`[r, g, b]` or `[r, g, b, a]`).

## Facets and animation

A 3D or 4D array can be sliced along one dimension into facets (`facetCol`, the dimension's index)
and along another into animation frames (`animationFrame`). Each slice is one trace; facets share
the colorscale and their axes match. Facet labels read `facet_col=0`, `facet_col=1`, …, and the
slider `animation_frame=0`, …; rename them with `labels: { facet_col: 'time' }` or
`labels: { animation_frame: 'step' }`.

<Example id="express/imshow-facets" :height="480" />

```ts
import hx from '@mk7s/holochart-express';

declare const volume: number[][][]; // [slice][row][col]
hx.imshow(volume, { facetCol: 0, facetColWrap: 4, labels: { facet_col: 'z' } });
hx.imshow(volume, { animationFrame: 0 }); // one frame per slice, with a play button and slider
```

Given both, frames hold one facet grid each. Negative indices count from the end
(`facetCol: -1` shows an RGB image's channels side by side as three heatmaps).

## Options

| Option                                 | px                          | What it does                                                   |
| -------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `zmin`, `zmax`, `rangeColor`           | `zmin`, `zmax`, …           | Color range (per channel for images)                           |
| `contrastRescaling`                    | `contrast_rescaling`        | `'minmax'` or `'infer'` (see [Contrast](#contrast))            |
| `origin`                               | `origin`                    | `'upper'` (default: row 0 at the top) or `'lower'`             |
| `aspect`                               | `aspect`                    | `'equal'` (default: square pixels) or `'auto'` (fill the plot) |
| `x`, `y`                               | `x`, `y`                    | Column and row coordinates                                     |
| `labels`                               | `labels`                    | `x`, `y`, `color`, `facet_col`, `animation_frame`              |
| `colorContinuousScale`                 | `color_continuous_scale`    | Colorscale of 2D data (alias `colorscale`)                     |
| `colorContinuousMidpoint`              | `color_continuous_midpoint` | `cmid` of a diverging scale                                    |
| `facetCol`, `facetColWrap`             | `facet_col`, …              | Slice a dimension into facets                                  |
| `facetColSpacing`, `facetRowSpacing`   | `facet_col_spacing`, …      | Space between facets                                           |
| `animationFrame`                       | `animation_frame`           | Slice a dimension into frames                                  |
| `binaryString`, `binaryFormat`         | `binary_string`, …          | Draw from a PNG (default for color images); `'png'` only       |
| `textAuto`                             | `text_auto`                 | Values in the heatmap cells: `true` or a d3 format (`'.2f'`)   |
| `title`, `template`, `width`, `height` | same                        | As every Express function                                      |

## Differences from px.imshow

- The input is nested arrays (or `ImageData`) instead of a numpy array, xarray or DataFrame, so
  `facetCol` and `animationFrame` are dimension indices, not names; `binary_backend` and
  `binary_compression_level` are not taken (PNGs are written uncompressed by a built-in encoder).
- The colorscale is on `layout.coloraxis` (px names it `coloraxis1`).
- Plain arrays of whole numbers from 0 to 255 count as `uint8` for `'infer'` (numpy would read them
  as 64-bit integers).
- Every facet cell's axes get the orientation and aspect settings, not only the first cell's
  (matched axes make these the same), and hover text is set on the frames' traces too.
- The hover value of RGB images is `[%{z[0]}, %{z[1]}, %{z[2]}]` in facets and frames as well.
- `aspect: 'auto'` on images turns off the `image` trace's square pixels (`yaxis.scaleanchor:
false`); px ignores `aspect` for images.
- A single animation slice gives no frames or player, and wrapped facets drop empty cells, as in
  the rest of Express.
