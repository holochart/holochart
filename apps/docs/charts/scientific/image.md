---
title: Image
description: Draw pixels given as RGB, RGBA or HSL values, or a PNG or JPEG picture, on cartesian axes with pixel hover.
status: complete
chart: image
---

# Image

<ChartOverview />

## Overview

An `image` trace draws a grid of pixels whose values are colors: `[r, g, b]` components per
pixel, RGBA, HSL, or an encoded picture (a PNG or JPEG data URI). Use it for photographs,
microscopy and satellite tiles, rendered frames, or any array that already holds colors, placed on
real axes so that you can zoom, hover pixels, and draw other traces on top.

Pick a different chart when:

- each pixel holds one value (a measurement, not a color): use a
  [heatmap](/charts/scientific/heatmap), which maps values through a colorscale and has a
  colorbar;
- you only want a logo or a background picture inside the plot, not data: use a
  [layout image](/fundamentals/shapes-images);
- you start from an array and want the usual defaults in one call:
  [`hx.imshow`](/express/imshow) draws color arrays as images and 2D arrays as heatmaps.

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'image',
      z: [
        [
          [255, 0, 0],
          [0, 255, 0],
        ],
        [
          [0, 0, 255],
          [255, 255, 255],
        ],
      ],
    },
  ],
});
```

`z[row][column]` is one pixel, here `[r, g, b]` from 0 to 255. As in Plotly, row 0 is at the top
(the y axis is reversed), pixels are square, and pixel column `i` is centered on `x = i`. The live
example draws a 48 × 32 test pattern:

<Example id="image/rgb" />

## Data format

- **`z`**: pixels as `z[row][column] = [c0, c1, c2]` (or four components with alpha). Rows can
  differ in length: the image is as wide as the longest row, and missing pixels are transparent.
  A pixel with a missing or non-numeric component is transparent and has no hover.
- **`colormodel`**: how the components are read.

  | `colormodel`      | Components                             | Default `zmin` → `zmax`   |
  | ----------------- | -------------------------------------- | ------------------------- |
  | `'rgb'` (default) | red, green, blue                       | 0 → 255 each              |
  | `'rgba'`          | red, green, blue, alpha                | 0 → 255, alpha 0 → 1      |
  | `'rgba256'`       | red, green, blue, alpha                | 0 → 255, alpha 0 → 255    |
  | `'hsl'`           | hue (°), saturation (%), lightness (%) | 0 → 360, 0 → 100, 0 → 100 |
  | `'hsla'`          | hue, saturation, lightness, alpha      | as `'hsl'`, alpha 0 → 1   |

- **`zmin` / `zmax`**: per component, the values mapped to the ends of the model's range; values
  in between are rescaled linearly and values outside are clamped (Plotly's rules). Components
  you leave out keep the default, so `zmax: [1, 1, 1]` reads RGB floats from 0 to 1.
- **`source`**: the picture as a base64 data URI (`'data:image/png;base64,…'`), used when there
  is no `z`. PNG, JPEG, GIF, WebP and BMP work. Its size in pixels is read from the header right
  away, so the axes fit the picture before it is decoded; decoding is asynchronous, and
  `chart.ready` waits for it. Other URLs (`https://…`) are ignored, as in Plotly: load the
  picture yourself and pass a data URI, or use a [layout image](/fundamentals/shapes-images).
- **Placement**: `x0` / `y0` are the center of the first pixel (default 0) and `dx` / `dy` the
  pixel size in axis units (default 1). On a date axis, `x0` can be a date and `dx` is in
  milliseconds.
- Images of more than 4096 × 4096 pixels are not drawn (a warning is logged).

```ts
import { createChart } from '@mk7s/holochart';

// Float RGB values from 0 to 1, placed in millimeters: pixel centers at 0, 0.5, 1, …
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'image',
      z: [
        [
          [0.1, 0.2, 0.9],
          [0.9, 0.8, 0.1],
        ],
        [
          [0.2, 0.7, 0.3],
          [0.6, 0.1, 0.5],
        ],
      ],
      zmax: [1, 1, 1],
      dx: 0.5,
      dy: 0.5,
    },
  ],
});
```

### Axes

Axes that hold an image get Plotly's image defaults, which you can override on the axis:

- The **y axis is reversed** (`autorange: 'reversed'`), so row 0 is at the top, unless a trace of
  another type shares that y axis or you set its `range`. With a shared axis, set
  `autorange: 'reversed'` yourself.
- **Square pixels:** the y axis gets `scaleanchor` = its x axis, so one unit is as long on both
  axes. This needs both axes to have the same type: with a date x axis and a linear y axis there
  is no link, and the image fills the plot. `scaleanchor: false` opts out.
- `constrain: 'domain'`: to keep the pixels square, the plot area shrinks around the image rather
  than showing empty axis range.
- The autorange spans the image edge to edge, without padding.

## Variations

<ChartVariations />

### Float values with per-channel ranges

`zmin` and `zmax` give each component its own range. Here three simulated bands with values from
0 to 1 make a false-color composite (`colormodel: 'rgba'`, with alpha fading toward the edges),
and the red band is stretched from 0.2–0.8 for contrast. `hovertemplate` formats the components
with `%{z[0]:.2f}`:

<ExampleLink id="image/float-range" />

### Pixels over time on a date axis

One pixel column per hour: `x0` is a date (here in ms) and `dx` one hour in milliseconds. The x
axis is a date axis and the y axis is linear, so no `scaleanchor` links them and the image fills
the plot. A line trace on a second y axis (`overlaying: 'y'`) follows the daily cycle:

<ExampleLink id="image/dates" />

### HSL colors, smoothed

`colormodel: 'hsla'` reads hue, saturation, lightness and alpha. `x0` / `dx` and `y0` / `dy` put
the pixels in hue and lightness units, and `zsmooth: 'fast'` interpolates bilinearly between
pixels. The y axis is overridden to run upwards (`autorange: true`), and `scaleanchor: false`
lets it stretch:

<ExampleLink id="image/hsl" />

### A picture from a data URI, with a marker on top

`source` holds a base64 PNG with a transparent corner. The axes fit its size before it is decoded,
and hover shows its decoded pixels as 8-bit RGBA. A scatter trace marks a point in pixel
coordinates; because it shares the y axis, `autorange: 'reversed'` is set explicitly:

<ExampleLink id="image/source" />

### Color arrays with Express

[`hx.imshow`](/express/imshow) takes a `[row][col][channel]` array (or an `ImageData`), encodes it
as a PNG and draws it as an `image` trace from `source`, with `x` and `y` turned into `x0` / `dx`
and `y0` / `dy`:

<ExampleLink id="express/imshow-rgb" />

### One value per pixel: a heatmap instead

A 2D array holds values, not colors. `hx.imshow` draws it as a [heatmap](/charts/scientific/heatmap)
with the image conventions (row 0 at the top, square cells) and a colorscale:

<ExampleLink id="express/imshow" />

## Styling

- **Smoothing.** `zsmooth: false` (default) draws square pixels; `'fast'` interpolates
  bilinearly, which suits photographs shown larger than their size.
- **Transparency.** Alpha from `'rgba'`, `'rgba256'`, `'hsla'` or a PNG's alpha channel, and trace
  `opacity`.
- **Order.** Images draw below every other trace type in the same subplot (Plotly's layer order),
  so markers, lines and contours stay visible; `zorder` changes that.
- An image has no colorscale, colorbar or legend entry.

## Interactivity

- **Hover.** The pixel under the pointer shows its center and components: `x: 12`, `y: 7`,
  `z: [255, 214, 90]`. For a `source`, `z` is the decoded 8-bit RGBA, available once the picture
  is decoded. `hoverinfo` defaults to `'x+y+z+text+name'`; its `color` flag adds the color after
  `zmin` / `zmax` rescaling, in the color model (`RGB: [255, 214, 90]`, `HSL: [40°, 100%, 68%]`).
  `text` and `hovertext` (2D like `z`) add a line. `hovertemplate` takes `%{x}`, `%{y}`, `%{z}`
  (and its components `%{z[0]}` …), `%{color}` (`%{color[0]}` …) and `%{colormodel}`:

  ```ts
  import { createChart } from '@mk7s/holochart';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'image',
        z: [
          [
            [200, 40, 40],
            [40, 200, 40],
          ],
        ],
        hovertemplate: 'col %{x}, row %{y}<br>R %{z[0]} G %{z[1]} B %{z[2]}<extra></extra>',
      },
    ],
  });
  ```

- **Events.** `hover` and `click` points carry `x` and `y` (the pixel center) and `pointNumber` as
  `[row, column]`:

  ```ts
  chart.on('click', (e) => console.log(e.points[0]?.pointNumber));
  ```

- **Zoom and pan.** Drag to zoom, double-click to reset; with square pixels, zooming keeps the
  aspect ratio.
- **Selection.** Box and lasso selection don't select pixels.

## Performance notes

- An image is one RGBA texture on one quad. Zoom and pan only set uniforms; `zsmooth` and
  `opacity` change in place, without re-uploading the pixels.
- For `z`, every pixel is converted to 8-bit RGBA on the CPU when the data (or `colormodel`,
  `zmin`, `zmax`) changes, which is linear in the number of pixels. Pass large pictures as
  `source` instead: the browser decodes PNG and JPEG natively, and decoded pictures are cached, so
  redrawing the same `source` doesn't decode it again. `hx.imshow` encodes color arrays as PNGs
  for this reason.
- Up to 4096 × 4096 pixels (16.7 million) per trace.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) gives the image's size in pixels, its color model
  and the area it covers on the axes. It can't describe what the picture shows: say that in the
  chart title or in the text around the chart.
- **Keyboard:** there is no keyboard navigation between pixels.
- **Color:** markers and lines drawn over a picture need to contrast with every part of it: an
  open marker with a light fill and a dark outline (or the reverse) stays visible on both.

## Attribute reference

See the [image attribute reference](/reference/image) for every attribute, its type, and its
default. The axis defaults are under [`yaxis.scaleanchor`](/reference/layout#yaxis.scaleanchor),
[`autorange`](/reference/layout#yaxis.autorange) and
[`constrain`](/reference/layout#yaxis.constrain) in the layout reference.

## Related charts

- [Heatmap](/charts/scientific/heatmap): one value per cell, through a colorscale
- [Express `imshow`](/express/imshow): color arrays and matrices in one call, with facets and
  animation over extra dimensions
- [Layout images](/fundamentals/shapes-images): logos and backgrounds placed in the plot, not
  data

## Plotly migration notes

- Attribute names and defaults match Plotly's `image`: `z`, `source`, `colormodel`, `zmin` /
  `zmax` (with the same rescaling), `zsmooth`, `x0` / `y0`, `dx` / `dy`, `text`, `hovertext`,
  `hoverinfo` (with the `color` flag) and `hovertemplate` (`%{z}`, `%{color}`, `%{colormodel}`).
  The axis defaults (reversed y, `scaleanchor`, `constrain: 'domain'`) are Plotly's too.
- `source` accepts base64 data URIs only, as in Plotly.
- `zsmooth: 'fast'` is the GPU's bilinear filtering; Plotly uses the browser's image smoothing.
  They look alike.
- On a log axis, the image is stretched between the positions of its outer edges, so its pixels
  are evenly spaced in log space (hover follows the drawn pixels); Plotly spaces them evenly in
  data units.
